import { useId } from "react";
import { MOCKUP_VIEWBOX, type PrintArea } from "@app/shared";

export type ShirtColor = "white" | "black";

type Props = {
  imageUrl: string | null;
  shirtColor: ShirtColor;
  printArea: PrintArea;
  /** Optional text printed on the design. */
  text?: string;
  textColor?: string;
  /** Draw the dashed printable-area guide. */
  showGuide?: boolean;
};

/**
 * Front-of-shirt silhouette (body + short sleeves), symmetric about x=200.
 * Sides run roughly straight from underarm to hem (≈136px wide) so it reads as a
 * t-shirt, not an A-line dress; shoulders at x120–280, sleeves out to x58–342.
 */
const TSHIRT_PATH =
  "M172 106 L132 114 C112 120 98 132 84 150 C80 162 84 180 100 190 " +
  "C112 192 124 192 132 188 C130 270 132 340 136 402 " +
  "C170 412 230 412 264 402 C268 340 270 270 268 188 " +
  "C276 192 288 192 300 190 C316 180 320 162 316 150 " +
  "C302 132 288 120 268 114 L228 106 " +
  "C214 124 186 124 172 106 Z";

/** Inner neckline (collar opening), drawn as a rib shadow under the collar. */
const COLLAR_PATH = "M174 108 C186 124 214 124 226 108 C214 120 186 120 174 108 Z";

type Theme = {
  /** Fabric gradient stops, top → bottom. */
  top: string;
  mid: string;
  bottom: string;
  stroke: string;
  /** Soft center sheen + edge shade for volume. */
  sheen: string;
  edge: string;
  guide: string;
  label: string;
  /** How printed ink sits on this fabric. */
  blend: "multiply" | "normal";
};

const THEMES: Record<ShirtColor, Theme> = {
  white: {
    top: "#ffffff",
    mid: "#f1f2f4",
    bottom: "#dfe2e7",
    stroke: "#cbd1d8",
    sheen: "rgba(255,255,255,0.75)",
    edge: "rgba(15,23,42,0.10)",
    guide: "#9ca3af",
    label: "#6b7280",
    blend: "multiply",
  },
  black: {
    top: "#34343b",
    mid: "#1f1f24",
    bottom: "#121215",
    stroke: "#0a0a0c",
    sheen: "rgba(255,255,255,0.10)",
    edge: "rgba(0,0,0,0.45)",
    guide: "#6b7280",
    label: "#a1a1aa",
    blend: "normal",
  },
};

/**
 * Front-of-shirt mockup. The fetched artwork is fit *inside* the provider's
 * print box with preserveAspectRatio="meet" (contain), so it can never bleed
 * outside the printable area — the same placement the print-ready export uses.
 *
 * Realism comes from layered fabric shading (vertical gradient + center sheen +
 * edge shade + soft folds) and a per-color blend mode so the print picks up the
 * fabric's light instead of floating on top like a sticker.
 */
export function ShirtPreview({
  imageUrl,
  shirtColor,
  printArea,
  text,
  textColor = "#111827",
  showGuide = true,
}: Props) {
  const uid = useId();
  const clipId = `${uid}-clip`;
  const fabricId = `${uid}-fabric`;
  const sheenId = `${uid}-sheen`;
  const edgeId = `${uid}-edge`;
  const shadowId = `${uid}-shadow`;
  const t = THEMES[shirtColor];
  const { width: VW, height: VH } = MOCKUP_VIEWBOX;
  const box = {
    x: printArea.box.x * VW,
    y: printArea.box.y * VH,
    w: printArea.box.width * VW,
    h: printArea.box.height * VH,
  };

  const label = text?.trim();
  // Shrink font so the line fits the box width (~0.5em per char).
  const fontSize = label
    ? Math.min(box.h * 0.13, (box.w * 0.92) / Math.max(label.length * 0.5, 1))
    : 0;
  // Sit text low when there's also art, otherwise centre it.
  const textY = box.y + box.h * (imageUrl ? 0.9 : 0.5);

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      className="w-full h-auto"
      style={{ isolation: "isolate" }}
      role="img"
      aria-label={`${shirtColor} t-shirt preview`}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={TSHIRT_PATH} />
        </clipPath>
        {/* Fabric body shading: light top → darker hem. */}
        <linearGradient id={fabricId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.top} />
          <stop offset="0.55" stopColor={t.mid} />
          <stop offset="1" stopColor={t.bottom} />
        </linearGradient>
        {/* Soft sheen down the chest centre. */}
        <radialGradient id={sheenId} cx="0.5" cy="0.38" r="0.5">
          <stop offset="0" stopColor={t.sheen} />
          <stop offset="1" stopColor={t.sheen} stopOpacity="0" />
        </radialGradient>
        {/* Edge shade for left/right volume. */}
        <linearGradient id={edgeId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={t.edge} />
          <stop offset="0.22" stopColor={t.edge} stopOpacity="0" />
          <stop offset="0.78" stopColor={t.edge} stopOpacity="0" />
          <stop offset="1" stopColor={t.edge} />
        </linearGradient>
        <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#0f172a" floodOpacity="0.18" />
        </filter>
      </defs>

      {/* Garment + print, isolated so the blend mode composites only against fabric. */}
      <g clipPath={`url(#${clipId})`}>
        {/* Body */}
        <path d={TSHIRT_PATH} fill={`url(#${fabricId})`} filter={`url(#${shadowId})`} />
        {/* Volume + sheen overlays */}
        <rect x={0} y={0} width={VW} height={VH} fill={`url(#${edgeId})`} />
        <rect x={0} y={0} width={VW} height={VH} fill={`url(#${sheenId})`} />
        {/* Subtle fabric folds */}
        <g fill="none" stroke={t.edge} strokeWidth={6} strokeLinecap="round">
          <path d="M156 200 C148 270 150 340 158 392" opacity={0.5} />
          <path d="M244 200 C252 270 250 340 242 392" opacity={0.5} />
          <path d="M132 188 C146 198 150 216 146 236" strokeWidth={5} opacity={0.45} />
          <path d="M268 188 C254 198 250 216 254 236" strokeWidth={5} opacity={0.45} />
        </g>

        {/* Artwork — contained in the print box, blended onto the fabric */}
        {imageUrl && (
          <image
            href={imageUrl}
            x={box.x}
            y={box.y}
            width={box.w}
            height={box.h}
            preserveAspectRatio="xMidYMid meet"
            style={{ mixBlendMode: t.blend }}
            crossOrigin="anonymous"
          />
        )}

        {/* Text on the design */}
        {label && (
          <text
            x={box.x + box.w / 2}
            y={textY}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={fontSize}
            fontWeight={700}
            fill={textColor}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {label}
          </text>
        )}
      </g>

      {/* Garment outline + collar rib (on top of fabric, outside the blend group) */}
      <path
        d={TSHIRT_PATH}
        fill="none"
        stroke={t.stroke}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path d={COLLAR_PATH} fill="none" stroke={t.stroke} strokeWidth={2.5} />

      {/* Printable-area guide */}
      {showGuide && (
        <>
          <rect
            x={box.x}
            y={box.y}
            width={box.w}
            height={box.h}
            fill="none"
            stroke={t.guide}
            strokeWidth={1.5}
            strokeDasharray="6 5"
            rx={3}
          />
          <text
            x={box.x + box.w / 2}
            y={box.y - 6}
            textAnchor="middle"
            fontSize={11}
            fill={t.label}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {printArea.label}
          </text>
        </>
      )}
    </svg>
  );
}
