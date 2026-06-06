import { useEffect, useRef, useState } from "react";
import type { PrintArea } from "@app/shared";
import { renderPrintfulMockup } from "../lib/mockup";
import { buildPlacedArtworkUrl, placementSignature } from "../lib/printFile";
import { DEFAULT_PLACEMENT, type Placement } from "./ShirtPreview";

type Props = {
  /** Persisted https artwork URL (the design's Storage URL). null → nothing to render. */
  artworkUrl: string | null;
  /** Mapped Printful catalog variant id for the selected color/size. */
  printfulVariantId: number | null;
  color: string;
  size: string | null;
  /** Print box + the user's move/resize, so the Printful render matches the studio. */
  printArea: PrintArea;
  placement?: Placement;
  text?: string;
  textColor?: string;
};

type PfState =
  | { kind: "idle"; reason: "no-art" | "unmapped" }
  | { kind: "loading" }
  | { kind: "ready"; imageUrl: string; elapsedMs: number }
  | { kind: "error"; message: string };

/**
 * The photoreal Printful mockup that sits beside the instant local preview (the
 * `printful` MockupRenderer source). Async + rate-limited, so it's debounced,
 * cached by (variantId, artworkUrl), and shows clear loading/empty/error states —
 * the local hero preview is always there, so this never blocks the studio.
 */
export function PrintfulMockupCard({
  artworkUrl,
  printfulVariantId,
  color,
  size,
  printArea,
  placement = DEFAULT_PLACEMENT,
  text,
  textColor,
}: Props) {
  const [pf, setPf] = useState<PfState>({ kind: "idle", reason: "no-art" });
  const cache = useRef<Map<string, { imageUrl: string; elapsedMs: number }>>(new Map());
  const [nonce, setNonce] = useState(0);

  // Key includes placement + text so moving/resizing re-renders the real mockup.
  const sig = artworkUrl ? placementSignature(artworkUrl, placement, text, textColor) : "";
  const canRender = !!artworkUrl && !!printfulVariantId;
  const cacheKey = canRender ? `${printfulVariantId}:${sig}` : "";

  useEffect(() => {
    if (!artworkUrl) return setPf({ kind: "idle", reason: "no-art" });
    if (!printfulVariantId) return setPf({ kind: "idle", reason: "unmapped" });

    const cached = cache.current.get(cacheKey);
    if (cached && nonce === 0) return setPf({ kind: "ready", ...cached });

    let cancelled = false;
    setPf({ kind: "loading" });
    const t = setTimeout(async () => {
      try {
        // Bake the move/resize into a print-area-sized file, then let Printful
        // fill the area with it — so the real mockup matches the studio.
        const placedUrl = await buildPlacedArtworkUrl({
          imageUrl: artworkUrl,
          printArea,
          placement,
          text,
          textColor,
        });
        if (cancelled) return;
        const res = await renderPrintfulMockup({
          printfulVariantId,
          artworkUrl: placedUrl,
          color,
          size,
        });
        if (cancelled) return;
        cache.current.set(cacheKey, { imageUrl: res.imageUrl, elapsedMs: res.elapsedMs });
        setPf({ kind: "ready", imageUrl: res.imageUrl, elapsedMs: res.elapsedMs });
      } catch (e) {
        if (!cancelled) setPf({ kind: "error", message: e instanceof Error ? e.message : "Mockup failed." });
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [artworkUrl, printfulVariantId, cacheKey, color, size, nonce, printArea, placement, text, textColor]);

  function refresh() {
    cache.current.delete(cacheKey);
    setNonce((n) => n + 1);
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-800">
          Real product mockup
          <span className="ml-1.5 align-middle text-xs font-normal text-zinc-400">· Printful</span>
        </h2>
        {pf.kind === "ready" && (
          <span className="flex items-center gap-2 text-xs text-zinc-400">
            {(pf.elapsedMs / 1000).toFixed(1)}s
            <button onClick={refresh} className="underline underline-offset-2 hover:text-zinc-700">
              Refresh
            </button>
          </span>
        )}
      </div>

      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-zinc-50">
        {pf.kind === "ready" && (
          <img src={pf.imageUrl} alt="Printful product mockup" className="h-full w-full object-contain" />
        )}
        {pf.kind === "loading" && (
          <div className="flex flex-col items-center gap-2 text-zinc-400">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
            <span className="text-xs">Rendering on the real product…</span>
          </div>
        )}
        {pf.kind === "idle" && (
          <p className="px-6 text-center text-xs text-zinc-400">
            {pf.reason === "no-art"
              ? "Add artwork to see it rendered on the real product."
              : "This color/size isn't on Printful yet."}
          </p>
        )}
        {pf.kind === "error" && (
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <p className="text-xs text-red-500">{pf.message}</p>
            <button onClick={refresh} className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-800">
              Try again
            </button>
          </div>
        )}
      </div>
      <p className="mt-2 text-center text-xs text-zinc-400">
        Exactly how it prints — generated by Printful from your artwork.
      </p>
    </div>
  );
}
