import type { CSSProperties } from "react";

export const COLOR_HEX: Record<string, string> = {
  Black: "#111827",
  White: "#f1f5f9",
  Navy: "#1e3a5f",
};
export const colorHex = (name: string): string => COLOR_HEX[name] ?? "#94a3b8";

type ProductType = "tshirt" | "mug" | "cap";

/** Garment silhouette (SVG) + a print-area overlay holding art and/or text. */
export function ProductMockup({
  type,
  color,
  artUrl,
  text,
  textColor = "#ffffff",
  className = "",
}: {
  type: ProductType;
  color: string;
  artUrl?: string;
  text?: string;
  textColor?: string;
  className?: string;
}) {
  const fill = colorHex(color);
  const isLight = color === "White";
  const stroke = isLight ? "#cbd5e1" : "rgba(0,0,0,0.18)";

  // Print-area box as a % of the square container, per product type.
  const print: Record<ProductType, CSSProperties> = {
    tshirt: { left: "34%", top: "36%", width: "32%", height: "34%" },
    mug: { left: "30%", top: "36%", width: "30%", height: "30%" },
    cap: { left: "34%", top: "40%", width: "32%", height: "20%" },
  };

  return (
    <div className={`relative aspect-square w-full ${className}`}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full drop-shadow-sm">
        {type === "tshirt" && (
          <path
            d="M35 10 L22 16 L8 30 L17 41 L26 35 L26 90 L74 90 L74 35 L83 41 L92 30 L78 16 L65 10 C64 18 36 18 35 10 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1"
          />
        )}
        {type === "mug" && (
          <>
            <rect x="24" y="28" width="40" height="46" rx="7" fill={fill} stroke={stroke} strokeWidth="1" />
            <path d="M64 38 q16 2 16 14 q0 12 -16 14" fill="none" stroke={fill} strokeWidth="6" />
          </>
        )}
        {type === "cap" && (
          <>
            <path d="M20 56 q30 -40 60 0 Z" fill={fill} stroke={stroke} strokeWidth="1" />
            <path d="M16 58 q34 12 68 0 q2 8 -34 8 q-36 0 -34 -8 Z" fill={fill} stroke={stroke} strokeWidth="1" />
          </>
        )}
      </svg>

      <div
        className="absolute flex flex-col items-center justify-center gap-1 overflow-hidden text-center"
        style={print[type]}
      >
        {artUrl && <img src={artUrl} alt="design art" className="max-h-full max-w-full object-contain" />}
        {text && (
          <span
            className="px-1 text-[clamp(8px,2.4vw,18px)] font-extrabold leading-tight break-words"
            style={{ color: textColor }}
          >
            {text}
          </span>
        )}
      </div>
    </div>
  );
}
