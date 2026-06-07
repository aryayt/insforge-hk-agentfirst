/**
 * Generate a print-ready design via the deployed InsForge `generate-design` edge
 * function — the exact same pipeline the web studio and MCP server use — and
 * return its PUBLIC Storage URL (which Printful can fetch for an order/mockup).
 *
 * SERVER-SIDE ONLY (uses the InsForge admin API key from .env). Bun auto-loads .env.
 *
 * NOTE: generated art sits on a SOLID WHITE background (the transparent cutout is
 * a client-side preview step only). That's invisible on a WHITE garment but shows
 * as a white box on dark garments — so use this URL for white products, or add
 * server-side background removal before ordering on black.
 */
import { createAdminClient } from "@insforge/sdk";

function adminClient() {
  const baseUrl =
    process.env.INSFORGE_API_BASE_URL ??
    process.env.VITE_INSFORGE_API_BASE_URL ??
    process.env.NEXT_PUBLIC_INSFORGE_URL;
  const apiKey = process.env.INSFORGE_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "Missing InsForge creds. Need INSFORGE_API_BASE_URL (or VITE_/NEXT_PUBLIC_) + INSFORGE_API_KEY in .env.",
    );
  }
  return createAdminClient({ baseUrl, apiKey });
}

export type GeneratedDesign = { id?: string; label: string; imageUrl: string; imageKey?: string };

/** Generate artwork for `prompt` and return the persisted, public design. */
export async function generateDesign(prompt: string, aspectRatio = "3:4"): Promise<GeneratedDesign> {
  const admin = adminClient();
  const { data, error } = await admin.functions.invoke("generate-design", {
    body: { prompt, aspectRatio, transparent: true, sessionKey: "printful-cli", agentSource: "printful-cli" },
  });
  if (error) throw error instanceof Error ? error : new Error(String(error));
  const design = (data as { design?: GeneratedDesign; error?: string })?.design;
  if (!design?.imageUrl) {
    throw new Error((data as { error?: string })?.error ?? "Generation returned no design.");
  }
  return design;
}
