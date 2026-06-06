/**
 * generate-design — InsForge edge function (Deno). Canonical source for the
 * deployed `generate-design` function; both the web studio and the MCP server
 * call it so design creation lives in exactly one place.
 *
 * It: (1) moderates the prompt, (2) generates print-ready artwork on a
 * transparent background at the product's print-box aspect ratio, (3) uploads
 * the PNG to the public `designs` bucket, and (4) inserts a guest `designs` row.
 * Returns the persisted design { id, label, imageUrl, imageKey }.
 *
 * Keys are InsForge SECRETS (no local .env needed):
 *   GOOGLE_AI_API_KEY → Gemini image model (default gemini-2.5-flash-image)
 *   OPENAI_API_KEY    → fallback gpt-image-1 + prompt moderation
 *
 * Deploy:  bunx @insforge/cli functions deploy generate-design --file functions/generate-design.ts
 * Invoke:  insforge.functions.invoke('generate-design', { body: {
 *            prompt?, imageBase64?, source?, aspectRatio?, transparent?,
 *            label?, sessionKey?, agentSource?
 *          }})
 *
 * NOTE: public (anon-invokable) for the hackathon demo. Add per-session rate
 * limits before production.
 */
import { createAdminClient } from "npm:@insforge/sdk";

declare const Deno: { env: { get(name: string): string | undefined } };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function b64ToBytes(b64: string): Uint8Array {
  // Tolerate data URLs ("data:image/png;base64,....").
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ── Moderation ───────────────────────────────────────────────────────────────
// A print shop is liable for what it prints. A cheap local blocklist catches the
// obviously-disallowed; when an OpenAI key is present we also run the prompt
// through the moderation endpoint. We do NOT block trademarks here (too noisy) —
// the generation prompt nudges away from logos/characters instead.
const HARD_BLOCK = [
  /\bchild\b.*\b(sex|nude|naked|porn)/i,
  /\b(cp|csam|loli|shota)\b/i,
  /\bminor\b.*\b(sex|nude|naked|explicit)/i,
  /\b(bestiality|rape|gore porn)\b/i,
];

async function moderate(prompt: string): Promise<{ ok: boolean; reason?: string }> {
  for (const re of HARD_BLOCK) {
    if (re.test(prompt)) return { ok: false, reason: "Prompt violates content policy." };
  }
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return { ok: true };
  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "omni-moderation-latest", input: prompt }),
    });
    if (!res.ok) return { ok: true }; // fail-open: don't block on moderation outage
    const out = await res.json();
    const result = out?.results?.[0];
    const cats: Record<string, boolean> = result?.categories ?? {};
    const scores: Record<string, number> = result?.category_scores ?? {};
    // Block only the categories that matter for printed merch. Sexual/violent
    // content needs a high score (the studio is for general-audience apparel);
    // minors and threatening hate are zero-tolerance.
    const blocked =
      cats["sexual/minors"] === true ||
      cats["child_sexual_abuse_material"] === true ||
      cats["hate/threatening"] === true ||
      (scores["sexual"] ?? 0) > 0.85 ||
      (scores["violence/graphic"] ?? 0) > 0.85;
    return blocked
      ? { ok: false, reason: "Prompt flagged by content moderation." }
      : { ok: true };
  } catch {
    return { ok: true };
  }
}

// ── Prompt shaping ────────────────────────────────────────────────────────────
function buildPrompt(prompt: string, aspectRatio: string, transparent: boolean): string {
  // NOTE: the primary model (Gemini) does not emit true alpha — if asked for a
  // "transparent background" it paints a gray-and-white CHECKERBOARD. So we
  // always ask for a flat, solid background (white) and remove it downstream
  // (multiply blend on the garment + client-side white-key). Never mention
  // transparency/alpha/sticker to the model.
  const bg = transparent
    ? "Place the subject centered on a plain, perfectly FLAT solid pure-white (#FFFFFF) background — a clean empty studio backdrop. Do NOT draw a transparency checkerboard, grid, squares, gradient, texture, or any pattern behind the subject; the background must be uniform solid white so it can be removed cleanly."
    : "Clean high-contrast artwork on a plain solid white background.";
  return (
    `Original, print-ready product artwork — no brand logos, no copyrighted characters, no watermark, no text. ` +
    `Single bold centered subject suited to garment printing (DTG): strong shapes, high contrast, limited palette. ` +
    `${bg} Composition aspect ratio approximately ${aspectRatio}. ` +
    `Subject: ${prompt}`
  );
}

function openAiSize(aspectRatio: string): string {
  const [w, h] = aspectRatio.split(":").map(Number);
  if (!w || !h || w === h) return "1024x1024";
  return w > h ? "1536x1024" : "1024x1536";
}

async function generateWithGemini(prompt: string): Promise<Uint8Array | null> {
  const key = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!key) return null;
  const model = Deno.env.get("GOOGLE_IMAGE_MODEL") ?? "gemini-2.5-flash-image";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  );
  if (!res.ok) {
    console.error("gemini error", res.status, (await res.text()).slice(0, 300));
    return null;
  }
  const out = await res.json();
  const parts: Array<{ inlineData?: { data?: string } }> =
    out?.candidates?.[0]?.content?.parts ?? [];
  const b64 = parts.find((p) => p.inlineData?.data)?.inlineData?.data;
  return b64 ? b64ToBytes(b64) : null;
}

async function generateWithOpenAI(prompt: string, size: string): Promise<Uint8Array | null> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return null;
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_IMAGE_MODEL") ?? "gpt-image-1",
      prompt,
      size,
      background: "transparent",
    }),
  });
  if (!res.ok) {
    console.error("openai error", res.status, (await res.text()).slice(0, 300));
    return null;
  }
  const out = await res.json();
  const b64 = out?.data?.[0]?.b64_json;
  return b64 ? b64ToBytes(b64) : null;
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  let body: {
    prompt?: string;
    imageBase64?: string;
    source?: "ai" | "upload" | "preset";
    aspectRatio?: string;
    transparent?: boolean;
    label?: string;
    sessionKey?: string;
    agentSource?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "JSON body required" });
  }

  const source = body.source ?? (body.imageBase64 ? "upload" : "ai");
  const aspectRatio = body.aspectRatio ?? "3:4";
  const transparent = body.transparent ?? true;
  const prompt = body.prompt?.trim();

  let bytes: Uint8Array | null = null;

  if (source === "ai") {
    if (!prompt || prompt.length < 3) return json(400, { error: "prompt required" });
    if (prompt.length > 2000) return json(400, { error: "prompt too long" });

    const verdict = await moderate(prompt);
    if (!verdict.ok) return json(422, { error: verdict.reason, moderation: true });

    const shaped = buildPrompt(prompt, aspectRatio, transparent);
    bytes =
      (await generateWithGemini(shaped)) ??
      (await generateWithOpenAI(shaped, openAiSize(aspectRatio)));
    if (!bytes) {
      return json(502, {
        error:
          "Image generation failed — check GOOGLE_AI_API_KEY / OPENAI_API_KEY secrets and function logs.",
      });
    }
  } else {
    // upload / preset: caller supplies the bytes; we only persist them.
    if (!body.imageBase64) return json(400, { error: "imageBase64 required for upload/preset" });
    try {
      bytes = b64ToBytes(body.imageBase64);
    } catch {
      return json(400, { error: "imageBase64 is not valid base64" });
    }
    if (bytes.length > 12_000_000) return json(413, { error: "image too large (max ~12MB)" });
  }

  const admin = createAdminClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
    apiKey: Deno.env.get("API_KEY"),
  });

  const key = `guest/${crypto.randomUUID()}.png`;
  const file = new File([bytes], key.split("/").pop()!, { type: "image/png" });
  const { data: up, error: upErr } = await admin.storage.from("designs").upload(key, file);
  if (upErr || !up?.url || !up?.key) {
    console.error("upload error", upErr);
    return json(500, { error: "Storage upload failed" });
  }

  const label = body.label ?? prompt?.slice(0, 60) ?? "Uploaded art";
  const { data: rows, error: dbErr } = await admin.database
    .from("designs")
    .insert([
      {
        user_id: null,
        source,
        prompt: prompt ?? null,
        image_url: up.url,
        image_key: up.key,
        label,
        session_key: body.sessionKey ?? "web",
        agent_source: body.agentSource ?? "web",
      },
    ])
    .select();
  if (dbErr) {
    console.error("designs insert error", dbErr);
    return json(500, { error: "Could not save design row" });
  }
  const row = (rows as Array<{ id: string }>)[0];

  return json(200, {
    design: { id: row?.id, label, imageUrl: up.url, imageKey: up.key },
  });
}
