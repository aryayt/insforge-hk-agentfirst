import { DesignSpec } from "@app/shared";
import { admin } from "./insforge";

/**
 * Minimal design creation: register an existing image URL as a design (source "upload").
 * AI generation lives on its own branch; this is the wire-up the fulfillment path needs,
 * since Printful prints `designs.image_url`. We store the URL as both url and key (there's
 * no Storage object for an external URL).
 */
export async function createDesignFromUrl(
  userId: string,
  imageUrl: string,
  prompt?: string | null,
): Promise<DesignSpec> {
  const { data, error } = await admin.database
    .from("designs")
    .insert([
      {
        user_id: userId,
        source: "upload",
        prompt: prompt ?? null,
        image_url: imageUrl,
        image_key: imageUrl,
        placement: {},
      },
    ])
    .select();
  if (error) throw error;

  const row = (data as Record<string, unknown>[])[0];
  if (!row) throw new Error("Failed to create design.");
  return DesignSpec.parse({
    id: row.id,
    userId: row.user_id,
    source: row.source,
    prompt: row.prompt,
    imageUrl: row.image_url,
    imageKey: row.image_key,
    placement: row.placement ?? {},
    createdAt: row.created_at,
  });
}
