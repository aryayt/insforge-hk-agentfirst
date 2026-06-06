import type { GeneratedDesign } from "@app/shared";
import { insforge } from "./insforge";
import { fileToDataUrl } from "./imageProcessing";

/**
 * Design creation goes through the InsForge `generate-design` edge function, so
 * the artwork is generated *and persisted* (Storage + a `designs` row) in one
 * server-side step. The browser never sees an API key, and the returned
 * `imageUrl` is a short, durable Storage URL — safe to carry into Stripe
 * checkout metadata (unlike the old base64 blob, which was dropped at checkout).
 *
 * A `sessionKey` (persisted in localStorage) groups a guest's designs.
 */
const SESSION_STORAGE_KEY = "agent-shop-session";

function sessionKey(): string {
  try {
    let k = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!k) {
      k = crypto.randomUUID();
      localStorage.setItem(SESSION_STORAGE_KEY, k);
    }
    return k;
  } catch {
    return "web";
  }
}

type GenerateResponse = { design?: GeneratedDesign; error?: string; message?: string };

/**
 * A generation failure. `policy` is true when the prompt was rejected by content
 * moderation (the generate-design fn returns `moderation: true`), so the UI can show
 * a distinct "not allowed by our policy" box instead of a generic retry message.
 */
export class GenerationError extends Error {
  policy: boolean;
  constructor(message: string, policy: boolean) {
    super(message);
    this.name = "GenerationError";
    this.policy = policy;
  }
}

/** True if either the thrown error or the response body marks this as a moderation block. */
function isPolicyBlock(error: unknown, data: unknown, message: string): boolean {
  const flagged = (o: unknown) =>
    !!o && typeof o === "object" && (o as Record<string, unknown>).moderation === true;
  return flagged(error) || flagged(data) || /content policy|moderation|not allowed/i.test(message);
}

/**
 * Pull the clearest human message out of whatever the SDK hands back. On a
 * non-2xx the SDK throws an InsForgeError whose `.message` is the function's
 * `message` field and `.error` its `error` field, with extra keys (e.g.
 * `reason`) copied on — so a content block surfaces its real explanation
 * instead of a generic "502 Bad Gateway".
 */
function generationErrorMessage(error: unknown, data: unknown): string {
  const pick = (o: unknown): string | undefined => {
    if (!o || typeof o !== "object") return undefined;
    const r = o as Record<string, unknown>;
    for (const k of ["message", "error", "reason"]) {
      const v = r[k];
      if (typeof v === "string" && v.trim()) return v;
    }
    return undefined;
  };
  const fromBody = pick(error) ?? pick(data);
  if (fromBody) return fromBody;
  if (error instanceof Error && error.message) return error.message;
  return "Generation failed. Try again.";
}

async function invokeGenerate(body: Record<string, unknown>): Promise<GeneratedDesign> {
  const { data, error } = await insforge.functions.invoke("generate-design", {
    body: { sessionKey: sessionKey(), agentSource: "web", ...body },
  });
  if (error) {
    const msg = generationErrorMessage(error, data);
    throw new GenerationError(msg, isPolicyBlock(error, data, msg));
  }
  const design = (data as GenerateResponse)?.design;
  if (!design?.imageUrl) {
    const msg = generationErrorMessage(null, data) || "Generation returned no design.";
    throw new GenerationError(msg, isPolicyBlock(null, data, msg));
  }
  return design;
}

/** Generate AI artwork for `prompt` at `aspectRatio` (e.g. "3:4" for a tee). */
export function generateDesign(prompt: string, aspectRatio: string): Promise<GeneratedDesign> {
  return invokeGenerate({ prompt, aspectRatio, transparent: true });
}

/**
 * Generate `n` independent variations of a prompt in parallel — the studio shows
 * them as a strip to choose from. Settles individually so one slow/failed call
 * doesn't sink the rest; throws only if every variation fails.
 */
export async function generateVariations(
  prompt: string,
  aspectRatio: string,
  n = 3,
): Promise<GeneratedDesign[]> {
  const results = await Promise.allSettled(
    Array.from({ length: n }, () => generateDesign(prompt, aspectRatio)),
  );
  const designs = results
    .filter((r): r is PromiseFulfilledResult<GeneratedDesign> => r.status === "fulfilled")
    .map((r) => r.value);
  if (!designs.length) {
    const firstReject = results.find((r) => r.status === "rejected") as
      | PromiseRejectedResult
      | undefined;
    throw firstReject?.reason instanceof Error
      ? firstReject.reason
      : new Error("Generation failed. Try again.");
  }
  return designs;
}

/** Persist user-uploaded art as a design (so it travels to checkout like AI art). */
export async function uploadDesign(file: File, label?: string): Promise<GeneratedDesign> {
  const imageBase64 = await fileToDataUrl(file);
  return invokeGenerate({ source: "upload", imageBase64, label: label ?? file.name });
}

export type BrandInfo = { name: string; colors: string[]; logoUrl: string | null };

/**
 * Turn a website URL into tee designs: the brand-design edge function scrapes the
 * site's name/palette/logo and returns the logo as a placeable design plus
 * brand-themed AI variations. Returns the brand info + the persisted designs.
 */
export async function generateFromBrand(
  url: string,
): Promise<{ brand: BrandInfo; designs: GeneratedDesign[] }> {
  const { data, error } = await insforge.functions.invoke("brand-design", {
    body: { url, sessionKey: sessionKey(), agentSource: "web" },
  });
  if (error) throw error instanceof Error ? error : new Error(String(error));
  const res = data as { brand?: BrandInfo; designs?: GeneratedDesign[]; error?: string };
  if (!res?.designs?.length) {
    throw new Error(res?.error || "Couldn't build a design from that site.");
  }
  return { brand: res.brand ?? { name: url, colors: [], logoUrl: null }, designs: res.designs };
}
