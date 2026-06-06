import { z } from "zod";
import { ProductType } from "./catalog";

/**
 * The fixed printable region the fulfillment provider supports ("the box").
 * Our church print provider only prints inside one box of a fixed physical
 * size, so every design must be fit *inside* this area — nothing prints outside it.
 *
 * Two coordinate systems live here on purpose:
 *  - `widthCm`/`heightCm` are the real-world box the printer physically prints.
 *    They drive the print-ready export (px = cm × dpi / 2.54) and the box aspect.
 *  - `box` is where that area sits on the front *mockup*, normalized 0..1 over the
 *    mockup viewBox (top-left origin). The web preview maps it to screen pixels so
 *    the on-shirt placement matches what the provider will actually print.
 *
 * Invariant kept by the seeds below: `box` aspect ratio == `widthCm:heightCm`,
 * so the preview rectangle is a faithful scale model of the physical box.
 */
export const NormalizedRect = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});
export type NormalizedRect = z.infer<typeof NormalizedRect>;

export const PrintArea = z.object({
  /** Human label shown in the studio, e.g. "Front — 30×40cm". */
  label: z.string(),
  /** Physical print-box size in centimeters (the provider's fixed box). */
  widthCm: z.number().positive(),
  heightCm: z.number().positive(),
  /** Resolution used when rendering the print-ready file the professional prints. */
  dpi: z.number().int().positive().default(150),
  /** Where the box sits on the front mockup, normalized over the mockup viewBox. */
  box: NormalizedRect,
});
export type PrintArea = z.infer<typeof PrintArea>;

/** Mockup viewBox the normalized `box` coordinates are relative to. */
export const MOCKUP_VIEWBOX = { width: 400, height: 480 } as const;

/**
 * Standard DTG front print area (~30×40cm), centered on the chest.
 * box aspect 152:202.7 ≈ 0.75 == 30:40. Default for t-shirts.
 */
export const DEFAULT_TSHIRT_PRINT_AREA: PrintArea = {
  label: "Front — 30×40cm (DTG)",
  widthCm: 30,
  heightCm: 40,
  dpi: 150,
  box: { x: 0.31, y: 0.3, width: 0.38, height: 0.422 },
};

/** Mug wrap and cap front are smaller boxes; reasonable DTG-ish defaults for the demo. */
export const DEFAULT_MUG_PRINT_AREA: PrintArea = {
  label: "Wrap — 20×8cm",
  widthCm: 20,
  heightCm: 8,
  dpi: 150,
  box: { x: 0.24, y: 0.42, width: 0.52, height: 0.208 },
};

export const DEFAULT_CAP_PRINT_AREA: PrintArea = {
  label: "Front — 10×6cm",
  widthCm: 10,
  heightCm: 6,
  dpi: 150,
  box: { x: 0.36, y: 0.34, width: 0.28, height: 0.21 },
};

/** The provider's print box for a given product line. */
export function printAreaForProduct(type: ProductType): PrintArea {
  switch (type) {
    case "mug":
      return DEFAULT_MUG_PRINT_AREA;
    case "cap":
      return DEFAULT_CAP_PRINT_AREA;
    case "tshirt":
    default:
      return DEFAULT_TSHIRT_PRINT_AREA;
  }
}

/** Pixel size of the print-ready export for an area: cm → inches → px at its dpi. */
export function printAreaPixelSize(area: PrintArea): { width: number; height: number } {
  const pxPerCm = area.dpi / 2.54;
  return {
    width: Math.round(area.widthCm * pxPerCm),
    height: Math.round(area.heightCm * pxPerCm),
  };
}

/**
 * Aspect ratio to GENERATE artwork at, so the art fills the print box instead of
 * being letterboxed inside it. Returned as a simple "w:h" string (what image
 * models accept) snapped to the nearest ratio the provider supports.
 *
 *   tshirt 30×40 → "3:4"   mug 20×8 → "5:2"   cap 10×6 → "5:3"
 */
const SUPPORTED_GEN_RATIOS: ReadonlyArray<readonly [string, number]> = [
  ["1:1", 1],
  ["4:3", 4 / 3],
  ["3:4", 3 / 4],
  ["16:9", 16 / 9],
  ["9:16", 9 / 16],
  ["5:2", 5 / 2],
  ["5:3", 5 / 3],
];

export function generationAspectRatio(area: PrintArea): string {
  const target = area.widthCm / area.heightCm;
  let best = SUPPORTED_GEN_RATIOS[0]!;
  for (const candidate of SUPPORTED_GEN_RATIOS) {
    if (Math.abs(candidate[1] - target) < Math.abs(best[1] - target)) best = candidate;
  }
  return best[0];
}

/** Convenience: the generation aspect ratio for a product line. */
export function aspectRatioForProduct(type: ProductType): string {
  return generationAspectRatio(printAreaForProduct(type));
}
