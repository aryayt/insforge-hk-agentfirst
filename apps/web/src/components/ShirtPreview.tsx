import { useRef } from "react";
import type { PrintArea } from "@app/shared";

export type ShirtColor = "white" | "black";

/** Where/how big the art sits inside the print box. x/y are the art's CENTRE as
 *  a fraction of the box (0.5,0.5 = centred); scale is the fraction of the box it
 *  fills (1 = contain-fit). Anything outside the box is clipped. */
export type Placement = { x: number; y: number; scale: number };
export const DEFAULT_PLACEMENT: Placement = { x: 0.5, y: 0.5, scale: 1 };

type Props = {
  imageUrl: string | null;
  shirtColor: ShirtColor;
  printArea: PrintArea;
  text?: string;
  textColor?: string;
  showGuide?: boolean;
  placement?: Placement;
  /** When provided, the art can be dragged to reposition within the box. */
  onPlacementChange?: (p: Placement) => void;
};

/**
 * Photoreal product preview: a real blank-tee photo with the artwork composited
 * into the chest print box. The box clips overflow, so the art can be scaled and
 * dragged but never prints outside the printable area. White tee uses `multiply`
 * (ink in fabric); dark tee lays the transparent art over normally.
 */
const CHEST = { x: 0.355, y: 0.30, width: 0.29 } as const;

export function ShirtPreview({
  imageUrl,
  shirtColor,
  printArea,
  text,
  textColor = "#111827",
  showGuide = true,
  placement = DEFAULT_PLACEMENT,
  onPlacementChange,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const boxAspect = printArea.heightCm / printArea.widthCm;
  const box = {
    left: `${CHEST.x * 100}%`,
    top: `${CHEST.y * 100}%`,
    width: `${CHEST.width * 100}%`,
    height: `${CHEST.width * boxAspect * 100}%`,
  };

  const onDark = shirtColor === "black";
  const artBlend = onDark ? "normal" : "multiply";
  const label = text?.trim();
  const draggable = !!imageUrl && !!onPlacementChange;

  function onPointerDown(e: React.PointerEvent) {
    if (!draggable) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: placement.x, y: placement.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || !boxRef.current) return;
    const r = boxRef.current.getBoundingClientRect();
    const nx = drag.current.x + (e.clientX - drag.current.px) / r.width;
    const ny = drag.current.y + (e.clientY - drag.current.py) / r.height;
    onPlacementChange?.({
      x: Math.max(0, Math.min(1, nx)),
      y: Math.max(0, Math.min(1, ny)),
      scale: placement.scale,
    });
  }
  function endDrag() {
    drag.current = null;
  }

  return (
    <div className="relative w-full overflow-hidden rounded-xl" style={{ aspectRatio: "1 / 1" }}>
      <img
        src={`/mockups/tee-${shirtColor}.png`}
        alt={`${shirtColor} t-shirt`}
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />

      {/* Print box — clips the art so it can never print outside the area. */}
      <div
        ref={boxRef}
        className="absolute overflow-hidden"
        style={{ ...box, containerType: "inline-size", touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {imageUrl && (
          <img
            src={imageUrl}
            alt="your design"
            crossOrigin="anonymous"
            draggable={false}
            className="absolute select-none"
            style={{
              left: `${placement.x * 100}%`,
              top: `${placement.y * 100}%`,
              width: `${placement.scale * 100}%`,
              height: `${placement.scale * 100}%`,
              transform: "translate(-50%, -50%)",
              objectFit: "contain",
              mixBlendMode: artBlend,
              opacity: 0.97,
              cursor: draggable ? "grab" : "default",
            }}
          />
        )}

        {label && (
          <div
            className="pointer-events-none absolute inset-x-0 flex justify-center px-1 text-center font-bold leading-none"
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
