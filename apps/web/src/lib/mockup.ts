import {
  type MockupResult,
  type ProductType,
  createPrintfulRenderer,
} from "@app/shared";
import { insforge } from "./insforge";

/**
 * Our catalog slug → Printful catalog product id (kept in sync with
 * scripts/printful/map-variants.ts). Used for the live product-info panel.
 */
export const PRINTFUL_PRODUCT_BY_SLUG: Record<string, number> = {
  "classic-tee": 71,
  "ceramic-mug": 19,
  "dad-cap": 206,
};

/** Shared `printful` renderer, wired to this app's InsForge client. */
const printfulRenderer = createPrintfulRenderer((slug, opts) =>
  insforge.functions.invoke(slug, opts),
);

/** Render the design on the real product via Printful's Mockup Generator (async). */
export function renderPrintfulMockup(args: {
  printfulVariantId: number;
  artworkUrl: string;
  productType?: ProductType;
  color?: string;
  size?: string | null;
}): Promise<MockupResult> {
  return printfulRenderer.render({
    artworkUrl: args.artworkUrl,
    productType: args.productType ?? "tshirt",
    color: args.color ?? "white",
    size: args.size ?? null,
    printfulVariantId: args.printfulVariantId,
  });
}

export type PrintfulCatalog = {
  product: { id: number; title?: string; brand?: string; model?: string };
  colors: string[];
  sizes: string[];
  variants: { id: number; color: string | null; size: string | null; costCents: number | null; inStock: boolean | null }[];
};

/** Live Printful product info (real sizes/colors + per-variant cost) for the info panel. */
export async function fetchPrintfulCatalog(productId: number): Promise<PrintfulCatalog> {
  const { data, error } = await insforge.functions.invoke("printful-catalog", {
    body: { productId },
  });
  if (error) throw error instanceof Error ? error : new Error(String(error));
  return data as PrintfulCatalog;
}
