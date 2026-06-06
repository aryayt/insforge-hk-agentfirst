/**
 * generate-design — InsForge edge function (Deno).
 *
 * Generates print artwork from a text prompt using keys stored as InsForge
 * SECRETS (no local .env needed by anyone):
 *   1. GOOGLE_AI_API_KEY  → Gemini image model (default gemini-2.5-flash-image)
 *   2. OPENAI_API_KEY     → fallback, gpt-image-1
 * Then uploads the PNG to the `designs` bucket and inserts a guest `designs`
 * row (provenance: session_key, agent_source). Returns the persisted design.
 *
 * Deploy:  bunx @insforge/cli functions deploy generate-design --file functions/generate-design.ts
 * Invoke:  insforge.functions.invoke('generate-design', { body: { prompt, label?, sessionKey?, agentSource? } })
 *
 * NOTE: public (anon-invokable) for the hackathon demo. Add auth/rate limits before production.
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
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const SAFETY_PREFIX =
  "Original print-ready product artwork, clean composition, no brand logos, no copyrighted characters: ";

async function generateWithGemini(prompt: string): Promise<Uint8Array | null> {
  const key = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!key) return null;
  const model = Deno.env.get("GOOGLE_IMAGE_MODEL") ?? "gemini-2.5-flash-image";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: SAFETY_PREFIX + prompt }] }],
      }),
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

async function generateWithOpenAI(prompt: string): Promise<Uint8Array | null> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return null;
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_IMAGE_MODEL") ?? "gpt-image-1",
      prompt: SAFETY_PREFIX + prompt,
      size: "1024x1024",
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

  let body: { prompt?: string; label?: string; sessionKey?: string; agentSource?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "JSON body required" });
  }
  const prompt = body.prompt?.trim();
  if (!prompt || prompt.length < 3) return json(400, { error: "prompt required" });
  if (prompt.length > 2000) return json(400, { error: "prompt too long" });

  const bytes = (await generateWithGemini(prompt)) ?? (await generateWithOpenAI(prompt));
  if (!bytes) {
    return json(502, {
      error:
        "Image generation failed — check GOOGLE_AI_API_KEY / OPENAI_API_KEY secrets and function logs.",
    });
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

  const label = body.label ?? prompt.slice(0, 60);
  const { data: rows, error: dbErr } = await admin.database
    .from("designs")
    .insert([
      {
        user_id: null,
        source: "ai",
        prompt,
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
