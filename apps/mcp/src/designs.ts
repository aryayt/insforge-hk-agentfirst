/**
 * Design artwork: import from a URL (e.g. an image the user generated in
 * ChatGPT) or generate via an OpenRouter image model — then persist the bytes
 * in the InsForge `designs` Storage bucket (persist BOTH url and key).
 *
 * Guest designs persist as `designs` rows (user_id NULL) with session/agent
 * provenance — see migrations/20260606213000_agent-attribution.sql.
 */
import { admin } from "./insforge";

export type PersistedDesign = {
  id: string;
  label: string;
  imageUrl: string;
  imageKey: string;
};

/** Insert a guest `designs` row so artwork shows up in /data and survives restarts. */
export async function persistDesign(args: {
  source: "ai" | "upload";
  prompt?: string;
  label: string;
  art: StoredArtwork;
  sessionKey: string;
  agentSource: string;
}): Promise<PersistedDesign> {
  const { data, error } = await admin.database
    .from("designs")
    .insert([
      {
        user_id: null,
        source: args.source,
        prompt: args.prompt ?? null,
        image_url: args.art.url,
        image_key: args.art.key,
        label: args.label,
        session_key: args.sessionKey,
        agent_source: args.agentSource,
      },
    ])
    .select();
  if (error) throw new Error(`Could not save design row: ${error.message ?? String(error)}`);
  const row = (data as Array<{ id: string }>)[0];
  if (!row?.id) throw new Error("Design insert returned no id.");
  return { id: row.id, label: args.label, imageUrl: args.art.url, imageKey: args.art.key };
}

const BUCKET = "designs";
const MAX_BYTES = 15 * 1024 * 1024;

export type StoredArtwork = { url: string; key: string };

function extFromType(contentType: string): string {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  return "png";
}

async function storeBytes(bytes: Blob, contentType: string): Promise<StoredArtwork> {
  const key = `guest/${crypto.randomUUID()}.${extFromType(contentType)}`;
  const file = new File([bytes], key.split("/").pop()!, { type: contentType || "image/png" });
  const { data, error } = await admin.storage.from(BUCKET).upload(key, file);
  if (error) throw new Error(`Storage upload failed: ${error.message ?? String(error)}`);
  const d = data as { url?: string; key?: string };
  if (!d?.url || !d?.key) throw new Error("Storage upload returned no url/key.");
  return { url: d.url, key: d.key };
}

/** Fetch image bytes from an http(s) or data: URL and persist them. */
export async function importArtwork(imageUrl: string): Promise<StoredArtwork> {
  if (!/^(https?:|data:image\/)/.test(imageUrl)) {
    throw new Error("imageUrl must be an http(s) URL or a data:image/* URL.");
  }
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Could not fetch image (${res.status}). ChatGPT image links can expire — regenerate and retry, or pass a prompt instead.`);
  const contentType = res.headers.get("content-type") ?? "image/png";
  if (!contentType.startsWith("image/") && !imageUrl.startsWith("data:image/")) {
    throw new Error(`URL did not return an image (content-type: ${contentType}).`);
  }
  const blob = await res.blob();
  if (blob.size > MAX_BYTES) throw new Error("Image too large (max 15 MB).");
  return storeBytes(blob, contentType);
}

/** Generate artwork from a text prompt via an OpenRouter image-capable model. */
export async function generateArtwork(prompt: string): Promise<StoredArtwork> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AI generation isn't configured (OPENROUTER_API_KEY missing). Generate the image in ChatGPT instead and pass its URL as imageUrl.",
    );
  }
  const model = process.env.OPENROUTER_IMAGE_MODEL ?? "google/gemini-2.5-flash-image";
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      modalities: ["image", "text"],
      messages: [
        {
          role: "user",
          content: `Original print-ready product artwork, no copyrighted characters or brand logos: ${prompt}`,
        },
      ],
      image_config: { aspect_ratio: "1:1" },
    }),
  });
  if (!res.ok) throw new Error(`Image generation failed (${res.status}).`);
  const result = (await res.json()) as {
    choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
  };
  const url = result.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error("Image model returned no image. Try a different prompt.");
  return importArtwork(url);
}
