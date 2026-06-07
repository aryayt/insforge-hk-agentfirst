import { useEffect, useRef, useState } from "react";
import { printAreaPixelSize, type PrintArea } from "@app/shared";
import { DEFAULT_PLACEMENT, type Placement } from "./ShirtPreview";

type Props = {
  imageUrl: string | null;
  printArea: PrintArea;
  text?: string;
  textColor?: string;
  /** Same placement the preview uses, so the print file matches what's shown. */
  placement?: Placement;
};

type State =
  | { kind: "idle" }
  | { kind: "rendering" }
  | { kind: "ready"; dataUrl: string }
  | { kind: "error"; message: string };

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  color: string,
  W: number,
  H: number,
  hasImage: boolean,
) {
  const fontSize = Math.min(H * 0.13, (W * 0.92) / Math.max(text.length * 0.5, 1));
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(text, W / 2, H * (hasImage ? 0.9 : 0.5));
}

/**
 * Renders the print-ready file: artwork (contain) + optional text, composed on
 * a transparent background at the provider's physical box size and dpi —
 * exactly what the professional drops into their fixed print box. Downloadable.
 */
export function PrintReadyPanel({
  imageUrl,
  printArea,
  text,
  textColor = "#111827",
  placement = DEFAULT_PLACEMENT,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const { width, height } = printAreaPixelSize(printArea);
  const label = text?.trim() ?? "";
  const { x: px, y: py, scale: pscale } = placement;

  useEffect(() => {
    const hasImage = !!imageUrl;
    const hasText = !!label;
    if (!hasImage && !hasText) {
      setState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    setState({ kind: "rendering" });

    const compose = (img: HTMLImageElement | null) => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);

      if (img) {
        // Match the preview: contain-fit, then the user's scale, centred at (px,py).
        const fit = Math.min(width / img.width, height / img.height) * pscale;
        const w = img.width * fit;
        const h = img.height * fit;
        ctx.drawImage(img, px * width - w / 2, py * height - h / 2, w, h);
      }
      if (hasText) drawText(ctx, label, textColor, width, height, hasImage);

      try {
        setState({ kind: "ready", dataUrl: canvas.toDataURL("image/png") });
      } catch {
        setState({
          kind: "error",
          message: "This image host blocks cross-origin export. Try a different image.",
        });
      }
    };

    if (hasImage) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => compose(img);
      img.onerror = () => {
        if (!cancelled) setState({ kind: "error", message: "Could not load that image." });
      };
      img.src = imageUrl as string;
    } else {
      compose(null);
    }

    return () => {
      cancelled = true;
    };
  }, [imageUrl, label, textColor, width, height, px, py, pscale]);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-zinc-700">Print-ready file</h2>
        <span className="text-xs text-zinc-400">
          {printArea.widthCm}×{printArea.heightCm}cm · {printArea.dpi} dpi · {width}×{height}px
        </span>
      </div>

      {/* checkerboard = transparent background the printer sees */}
      <div
        className="rounded-lg border border-zinc-200 overflow-hidden grid place-items-center p-3"
        style={{
          aspectRatio: `${printArea.widthCm} / ${printArea.heightCm}`,
          backgroundImage:
            "linear-gradient(45deg,#f1f1f1 25%,transparent 25%),linear-gradient(-45deg,#f1f1f1 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#f1f1f1 75%),linear-gradient(-45deg,transparent 75%,#f1f1f1 75%)",
          backgroundSize: "16px 16px",
          backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
        }}
      >
        {state.kind === "ready" && (
          <img src={state.dataUrl} alt="print-ready artwork" className="max-h-full max-w-full" />
        )}
        {state.kind === "rendering" && <span className="text-xs text-zinc-400">Rendering…</span>}
        {state.kind === "idle" && (
          <span className="text-xs text-zinc-400">Add a design or text to see the print file.</span>
        )}
        {state.kind === "error" && (
          <span className="text-xs text-red-500 text-center px-4">{state.message}</span>
        )}
      </div>

      <a
        href={state.kind === "ready" ? state.dataUrl : undefined}
        download={state.kind === "ready" ? "print-ready.png" : undefined}
        aria-disabled={state.kind !== "ready"}
        className={
          "block text-center text-sm font-medium rounded-lg px-4 py-2 transition " +
          (state.kind === "ready"
            ? "bg-zinc-900 text-white hover:bg-zinc-700"
            : "bg-zinc-100 text-zinc-400 pointer-events-none")
        }
      >
        Download for printer
      </a>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
