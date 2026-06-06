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

type GenerateResponse = { design?: GeneratedDesign; error?: string };

async function invokeGenerate(body: Record<string, unknown>): Promise<GeneratedDesign> {
  const { data, error } = await insforge.functions.invoke("generate-design", {
    body: { sessionKey: sessionKey(), agentSource: "web", ...body },
  });
  if (error) throw error instanceof Error ? error : new Error(String(error));
  const design = (data as GenerateResponse)?.design;
  if (!design?.imageUrl) {
    throw new Error((data as GenerateResponse)?.error || "Generation returned no design.");
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
