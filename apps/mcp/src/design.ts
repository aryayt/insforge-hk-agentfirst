import type { GeneratedDesign } from "@app/shared";
import { admin } from "./insforge";

/**
 * Create a design by delegating to the InsForge `generate-design` edge function
 * — the single source of truth for generation + persistence (Storage + a
 * `designs` row), shared with the web studio. The agent only ever sees a design
 * id + a durable preview URL, never raw image bytes.
 */
export async function createDesign(opts: {
  prompt?: string;
  imageBase64?: string;
  aspectRatio?: string;
  label?: string;
  sessionKey?: string;
}): Promise<GeneratedDesign> {
  const { data, error } = await admin.functions.invoke("generate-design", {
    body: { agentSource: "mcp", transparent: true, ...opts },
  });
  if (error) throw error instanceof Error ? error : new Error(String(error));
  const design = (data as { design?: GeneratedDesign; error?: string })?.design;
  if (!design?.imageUrl) {
    throw new Error((data as { error?: string })?.error || "Generation returned no design.");
  }
  return design;
}

export type DesignRef = { id: string; label: string | null; imageUrl: string };

/** Look up a persisted design (used when adding one to the cart). */
export async function getDesign(id: string): Promise<DesignRef | null> {
  const { data, error } = await admin.database
    .from("designs")
    .select()
    .eq("id", id)
    .limit(1);
  if (error) throw error;
  const row = (data as Array<{ id: string; label: string | null; image_url: string }>)[0];
  return row ? { id: row.id, label: row.label, imageUrl: row.image_url } : null;
}
