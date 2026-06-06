import type { PrintArea } from "@app/shared";

export type ShirtColor = "white" | "black";

type Props = {
  imageUrl: string | null;
  shirtColor: ShirtColor;
  printArea: PrintArea;
  /** Optional text printed on the design. */
  text?: string;
  textColor?: string;
  /** Draw the (subtle) printable-area guide. */
  showGuide?: boolean;
};

/**
 * Photoreal product preview: a real blank-tee photo (ghost mannequin, generated
 * once and committed under `public/mockups/`) with the artwork composited into
 * the chest print area. On a white tee the art is blended with `multiply` so it
 * reads as ink sitting in the fabric (and any white background drops out); on a
 * dark tee the transparent art is laid over normally.
 *
 * This is the in-browser `local` MockupRenderer (see packages/shared/src/mockup.ts):
 * instant and fully under our control. The print-ready file (PrintReadyPanel)
 * stays the physically-accurate artifact; this just looks like the real thing.
 *
 * Chest box is normalized over the square (1024×1024) mockup; its aspect tracks
 * the physical print box (widthCm:heightCm) so the placement stays faithful.
 */
const CHEST = { x: 0.355, y: 0.30, width: 0.29 } as const;

export function ShirtPreview({
  imageUrl,
  shirtColor,
  printArea,
  text,
  textColor = "#111827",
  showGuide = true,
}: Props) {
  const boxAspect = printArea.heightCm / printArea.widthCm; // 40/30 = 1.333 for the tee
  const box = {
    left: `${CHEST.x * 100}%`,
    top: `${CHEST.y * 100}%`,
    width: `${CHEST.width * 100}%`,
    // height as a % of width keeps the box aspect = the physical print box.
    height: `${CHEST.width * boxAspect * 100}%`,
  };

  const label = text?.trim();
  const onDark = shirtColor === "black";
  // White tee: multiply so ink integrates with fabric + white bg disappears.
  // Dark tee: normal, so the transparent artwork keeps its true colors.
  const artBlend = onDark ? "normal" : "multiply";

  return (
    <div className="relative w-full overflow-hidden rounded-xl" style={{ aspectRatio: "1 / 1" }}>
      <img
        src={`/mockups/tee-${shirtColor}.png`}
        alt={`${shirtColor} t-shirt`}
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />

      {/* Print area: artwork (contained) + optional text, clipped to the box. */}
      <div className="absolute overflow-hidden" style={{ ...box, containerType: "inline-size" }}>
        {imageUrl && (
          <img
            src={imageUrl}
            alt="your design"
            crossOrigin="anonymous"
            className="absolute inset-0 h-full w-full"
            style={{ objectFit: "contain", mixBlendMode: artBlend, opacity: 0.97 }}
            draggable={false}
          />
        )}

        {label && (
          <div
            className="absolute inset-x-0 flex justify-center px-1 text-center font-bold leading-none"
            style={{
              top: imageUrl ? "82%" : "44%",
              color: textColor,
              mixBlendMode: onDark ? "normal" : "multiply",
              fontSize: "clamp(8px, 14cqw, 28px)",
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
            }}
          >
            {label}
          </div>
        )}

        {showGuide && (
          <div
            className="pointer-events-none absolute inset-0 rounded-[2px]"
            style={{
              border: `1px dashed ${onDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.15)"}`,
            }}
          />
        )}
      </div>
    </div>
  );
}
