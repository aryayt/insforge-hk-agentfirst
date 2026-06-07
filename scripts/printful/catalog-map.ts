/**
 * Maps our internal catalog (ProductType + colour/size) to Printful catalog IDs.
 *
 * ⚠️ The numeric IDs below are UNVERIFIED placeholders. Printful assigns its own
 * product/variant ids; fill these in from real data once a token exists:
 *
 *   bun run printful:discover "t-shirt"     # find the catalog product id
 *   bun run printful:variants <productId>   # list its variant ids by colour/size
 *
 * Then replace the `productId` and the `variants` color→variantId entries here.
 * Until verified, the Printful renderer will throw a clear "unmapped variant"
 * error rather than silently rendering the wrong blank.
 */
import type { ProductType } from "@app/shared";

export type PrintfulMapping = {
  /** Printful catalog product id (the blank, e.g. Bella+Canvas 3001). */
  productId: number;
  /** Print placement to send to the mockup generator. */
  placement: string;
  /** color (our value) → { size (our value, or "" for one-size) → Printful variant id }. */
  variants: Record<string, Record<string, number>>;
  /** Set false until the ids above have been verified against the live catalog. */
  verified: boolean;
};

// Verified 2026-06-06 against the live catalog (bun run printful:discover / :variants).
// Size keys are OUR internal sizes (catalog.ts: tees use S–XXL); XXL maps to Printful's "2XL".
export const PRINTFUL_CATALOG: Record<ProductType, PrintfulMapping> = {
  // Unisex Staple T-Shirt | Bella + Canvas 3001 (product 71). DTG front print.
  tshirt: {
    productId: 71,
    placement: "front",
    variants: {
      white: { S: 4011, M: 4012, L: 4013, XL: 4014, XXL: 4015 },
      black: { S: 4016, M: 4017, L: 4018, XL: 4019, XXL: 4020 },
    },
    verified: true,
  },
  // White Glossy Mug | Ceramic (product 19), 11oz. One-size → key "".
  mug: {
    productId: 19,
    placement: "default",
    variants: {
      white: { "": 1320 },
    },
    verified: true,
  },
  // Closed-Back Structured Cap | Flexfit 6277 (product 140). NOTE: this blank is
  // EMBROIDERY-only (placement "embroidery_front_large"); our local preview treats
  // designs as flat prints, so the cap is the least faithful local↔Printful match.
  // Mapped one-size to L/XL (our cap size is nullable → key "").
  cap: {
    productId: 140,
    placement: "embroidery_front_large",
    variants: {
      white: { "": 5275 },
      black: { "": 5277 },
    },
    verified: true,
  },
};

/** Resolve a Printful variant id for our product/colour/size, or throw a helpful error. */
export function resolvePrintfulVariant(
  type: ProductType,
  color: string,
  size: string | null,
): { productId: number; variantId: number; placement: string } {
  const map = PRINTFUL_CATALOG[type];
  const sizeKey = size ?? "";
  const variantId = map.variants[color]?.[sizeKey];
  if (!map.verified || !variantId) {
    throw new Error(
      `No verified Printful variant for ${type}/${color}/${sizeKey || "one-size"}. ` +
        `Fill scripts/printful/catalog-map.ts (run "bun run printful:discover" then "printful:variants <id>").`,
    );
  }
  return { productId: map.productId, variantId, placement: map.placement };
}
