import { z } from "zod";
import { ProductType } from "./catalog";

/**
 * The two interchangeable ways we turn a design into a product image.
 *
 *  - `local`    — our in-browser SVG composite (apps/web `ShirtPreview`): instant,
 *                 fully under our control, no vendor dependency. The artwork is fit
 *                 inside the print box defined in `print.ts`.
 *  - `printful` — Printful's hosted Mockup Generator: photoreal, guaranteed to match
 *                 what actually prints, but async (upload → create task → poll) and
 *                 rate-limited. See `scripts/printful/`.
 *
 * Both implement {@link MockupRenderer}, so the studio can render the same artwork
 * with each and compare them side by side (this is the "try both" experiment from
 * ADR 0001, D1-revisited).
 */
export const MockupSource = z.enum(["local", "printful"]);
export type MockupSource = z.infer<typeof MockupSource>;

export const MockupRequest = z.object({
  /**
   * Background-removed artwork to place on the product. A `data:` URL (the local
   * path uses these) or an `https` URL (Printful needs a publicly fetchable URL —
   * data URLs must be uploaded to the File Library / our Storage bucket first).
   */
  artworkUrl: z.string(),
  productType: ProductType,
  /** Garment/product colour, e.g. "white" | "black". Each renderer maps it to a variant. */
  color: z.string().default("white"),
  /** Apparel size (S–XXL); null for one-size products like mugs/caps. */
  size: z.string().nullable().default(null),
  /** Optional text baked onto the design. Local path renders this; Printful path bakes it into the file. */
  text: z.string().optional(),
  /**
   * Printful catalog variant id for this color/size. Required by the `printful`
   * renderer (the studio resolves it from `variants.printful_variant_id`); the
   * `local` renderer ignores it. Optional so existing local-only callers are unaffected.
   */
  printfulVariantId: z.number().int().nullable().optional(),
});
export type MockupRequest = z.infer<typeof MockupRequest>;

export const MockupResult = z.object({
  source: MockupSource,
  /** The product image to show. `https` for Printful, `https`/`data` for local. */
  imageUrl: z.string(),
  /** Provider variant id this mockup represents, when known (Printful numeric id as string). */
  variantId: z.string().nullable().default(null),
  /** Additional angles/lifestyle shots the provider returned, best-effort. */
  extraImageUrls: z.array(z.string()).default([]),
  /** Wall-clock render time in ms — the headline number for the speed comparison. */
  elapsedMs: z.number().int().nonnegative().default(0),
});
export type MockupResult = z.infer<typeof MockupResult>;

/**
 * One artwork in, one product image out. Implemented twice (local + printful) so
 * the two fulfillment/mockup strategies are swappable and directly comparable.
 */
export interface MockupRenderer {
  readonly source: MockupSource;
  render(req: MockupRequest): Promise<MockupResult>;
}

/** InsForge `functions.invoke` shape, injected so this stays runtime-agnostic. */
export type InvokeFn = (
  slug: string,
  opts: { body: Record<string, unknown> },
) => Promise<{ data?: unknown; error?: unknown }>;

/**
 * The `printful` MockupRenderer: calls the `printful-mockup` edge function (which
 * runs Printful's async Mockup Generator server-side) and maps the response to a
 * MockupResult. `invoke` is injected (the web passes `insforge.functions.invoke`).
 *
 * A `data:` artworkUrl is sent as `imageBase64` (the function uploads it to Storage,
 * since Printful needs a fetchable https URL); an `https` url is passed through.
 */
export function createPrintfulRenderer(invoke: InvokeFn): MockupRenderer {
  return {
    source: "printful",
    async render(req: MockupRequest): Promise<MockupResult> {
      if (!req.printfulVariantId) {
        throw new Error("This color/size isn't mapped to Printful yet, so it can't be rendered.");
      }
      const isData = req.artworkUrl.startsWith("data:");
      const { data, error } = await invoke("printful-mockup", {
        body: isData
          ? { variantId: req.printfulVariantId, imageBase64: req.artworkUrl }
          : { variantId: req.printfulVariantId, imageUrl: req.artworkUrl },
      });
      if (error) throw error instanceof Error ? error : new Error(String(error));
      const d = (data ?? {}) as {
        imageUrl?: string;
        extraImageUrls?: string[];
        elapsedMs?: number;
        status?: string;
        error?: string;
      };
      if (!d.imageUrl) {
        throw new Error(
          d.error ??
            (d.status === "pending"
              ? "Mockup is still rendering — hit Refresh in a moment."
              : "Printful returned no mockup image."),
        );
      }
      return MockupResult.parse({
        source: "printful",
        imageUrl: d.imageUrl,
        variantId: String(req.printfulVariantId),
        extraImageUrls: d.extraImageUrls ?? [],
        elapsedMs: d.elapsedMs ?? 0,
      });
    },
  };
}
