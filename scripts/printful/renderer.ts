/**
 * PrintfulRenderer — the `printful` implementation of the shared MockupRenderer
 * contract. Uploads/points Printful at the artwork, runs the Mockup Generator,
 * and returns a {@link MockupResult} shaped exactly like the local renderer's,
 * so the two can be compared 1:1.
 *
 * SERVER-SIDE ONLY (uses PRINTFUL_API_KEY via PrintfulClient).
 */
import type { MockupRenderer, MockupRequest, MockupResult } from "@app/shared";
import { PrintfulClient } from "./client";
import { resolvePrintfulVariant } from "./catalog-map";

export class PrintfulRenderer implements MockupRenderer {
  readonly source = "printful" as const;

  constructor(private readonly client: PrintfulClient) {}

  /** Build from env; returns null when PRINTFUL_API_KEY is unset so callers fall back to local/mock. */
  static fromEnv(): PrintfulRenderer | null {
    const client = PrintfulClient.fromEnv();
    return client ? new PrintfulRenderer(client) : null;
  }

  async render(req: MockupRequest): Promise<MockupResult> {
    // Printful must be able to fetch the artwork — a data: URL won't work; it has
    // to be a public https URL (upload to our Storage bucket / File Library first).
    if (req.artworkUrl.startsWith("data:")) {
      throw new Error(
        "PrintfulRenderer needs a public https artwork URL, got a data: URL. " +
          "Upload the artwork to Storage / the File Library and pass its URL.",
      );
    }

    const { productId, variantId, placement } = resolvePrintfulVariant(
      req.productType,
      req.color,
      req.size,
    );

    const startedAt = Date.now();
    const task = await this.client.renderMockup(productId, {
      variant_ids: [variantId],
      format: "png",
      files: [{ placement, image_url: req.artworkUrl }],
    });
    const elapsedMs = Date.now() - startedAt;

    const mockup = task.mockups?.[0];
    if (!mockup) throw new Error(`Printful returned no mockups for task ${task.task_key}`);

    return {
      source: this.source,
      imageUrl: mockup.mockup_url,
      variantId: String(variantId),
      extraImageUrls: (mockup.extra ?? []).map((e) => e.url),
      elapsedMs,
    };
  }
}
