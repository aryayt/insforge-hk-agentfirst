import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_TSHIRT_PRINT_AREA,
  aspectRatioForProduct,
  type GeneratedDesign,
} from "@app/shared";
import { generateDesign as generateDesignApi, uploadDesign } from "./lib/generateImage";
import { removeWhiteBackground } from "./lib/imageProcessing";
import { fetchProduct, money, type Tee } from "./lib/catalog";
import { buyNow } from "./lib/checkout";
import { ShirtPreview, type ShirtColor } from "./components/ShirtPreview";
import { PrintReadyPanel } from "./components/PrintReadyPanel";

const printArea = DEFAULT_TSHIRT_PRINT_AREA;
const TEE_ASPECT_RATIO = aspectRatioForProduct("tshirt");
const SIZES = ["S", "M", "L", "XL"] as const;
type Size = (typeof SIZES)[number];

const checkoutParam = new URLSearchParams(window.location.search).get("checkout");

export function App() {
  // design — persisted server-side (Storage + designs row) via the edge function.
  const [query, setQuery] = useState("");
  const [design, setDesign] = useState<GeneratedDesign | null>(null);
  const imageUrl = design?.imageUrl ?? null;
  const [loading, setLoading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const [transparentBg, setTransparentBg] = useState(true);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [textColor, setTextColor] = useState<"#111827" | "#ffffff">("#111827");

  // product config
  const [tee, setTee] = useState<Tee | null>(null);
  const [shirtColor, setShirtColor] = useState<ShirtColor>("white");
  const [size, setSize] = useState<Size>("M");
  const [qty, setQty] = useState(1);
  const [email, setEmail] = useState("");

  // checkout
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  useEffect(() => {
    fetchProduct("classic-tee").then(setTee).catch(() => setTee(null));
  }, []);

  async function generateDesign() {
    if (!query.trim() || loading) return;
    setLoading(true);
    setImgError(null);
    try {
      setDesign(await generateDesignApi(query, TEE_ASPECT_RATIO));
    } catch (e) {
      setImgError(e instanceof Error ? e.message : "Couldn't generate. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function uploadArt(file: File | undefined) {
    if (!file || loading) return;
    setLoading(true);
    setImgError(null);
    try {
      setQuery("");
      setDesign(await uploadDesign(file));
    } catch (e) {
      setImgError(e instanceof Error ? e.message : "Couldn't upload that file.");
    } finally {
      setLoading(false);
    }
  }

  // Make the white background transparent when the toggle is on.
  useEffect(() => {
    if (!transparentBg || !imageUrl) {
      setProcessedUrl(null);
      return;
    }
    let cancelled = false;
    removeWhiteBackground(imageUrl)
      .then((url) => !cancelled && setProcessedUrl(url))
      .catch(() => !cancelled && setProcessedUrl(null));
    return () => {
      cancelled = true;
    };
  }, [transparentBg, imageUrl]);

  const displayUrl = transparentBg ? (processedUrl ?? imageUrl) : imageUrl;

  // Resolve the selected color+size to a catalog variant (price + Stripe price id).
  const variant = useMemo(() => {
    const color = shirtColor === "white" ? "White" : "Black";
    return tee?.variants.find((v) => v.color === color && v.size === size) ?? null;
  }, [tee, shirtColor, size]);

  const unitPriceCents = tee ? tee.basePriceCents + (variant?.priceDeltaCents ?? 0) : null;
  const totalCents = unitPriceCents != null ? unitPriceCents * qty : null;

  const hasDesign = !!imageUrl || !!text.trim();
  const canBuy = hasDesign && !!variant?.stripePriceId && !buying;

  async function handleBuy() {
    if (!variant?.stripePriceId) return;
    setBuying(true);
    setBuyError(null);
    try {
      await buyNow({
        stripePriceId: variant.stripePriceId,
        quantity: qty,
        email: email.trim() || undefined,
        // The design is persisted server-side, so we carry its id + the short
        // Storage URL (NOT base64) — this is the artwork the printer fulfills.
        metadata: {
          product: tee?.name ?? "Classic Tee",
          color: shirtColor,
          size,
          ...(design ? { design_id: design.id, design_preview_url: design.imageUrl } : {}),
          design_prompt: (query || (design ? "uploaded art" : "text only")).slice(0, 400),
          ...(text.trim() ? { design_text: text.trim().slice(0, 400) } : {}),
          transparent_bg: String(transparentBg),
          agent_source: "web",
        },
      });
      // buyNow redirects on success
    } catch (e) {
      setBuyError(e instanceof Error ? e.message : "Checkout failed. Please try again.");
      setBuying(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <h1 className="text-lg font-semibold">Design Studio</h1>
          <p className="text-sm text-zinc-500">
            Describe a design, pick your shirt, and check out — printed inside the provider's box.
          </p>
        </div>
      </header>

      {checkoutParam === "success" && (
        <Banner tone="ok">
          Payment received — thanks! Your order is being processed.
        </Banner>
      )}
      {checkoutParam === "canceled" && (
        <Banner tone="warn">Checkout canceled. Your design is still here.</Banner>
      )}

      <main className="mx-auto max-w-5xl px-6 py-8 grid gap-8 md:grid-cols-[1fr_minmax(320px,420px)]">
        {/* ── Config rail ──────────────────────────────────────────── */}
        <section className="space-y-7">
          {/* 1 — describe & generate */}
          <Step n={1} label="Describe your design — AI generates it">
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && generateDesign()}
                placeholder="e.g. minimalist mountain line art"
                className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
              />
              <button
                onClick={generateDesign}
                disabled={loading || !query.trim()}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:bg-zinc-300"
              >
                {loading ? "Generating…" : imageUrl ? "Regenerate" : "Generate"}
              </button>
            </div>
            {loading && (
              <p className="text-xs text-zinc-400">Generating your design — this can take a few seconds.</p>
            )}

            <div className="flex items-center gap-3">
              <label className="cursor-pointer text-xs font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-900">
                Upload your own art
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => uploadArt(e.target.files?.[0])}
                />
              </label>
              <span className="text-xs text-zinc-300">·</span>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600">
                <input
                  type="checkbox"
                  checked={transparentBg}
                  onChange={(e) => setTransparentBg(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Remove background (keep just the design)
              </label>
            </div>
            {imgError && <p className="text-xs text-red-500">{imgError}</p>}
          </Step>

          {/* 2 — text */}
          <Step n={2} label="Add text (optional)">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. CAMP 2026"
              maxLength={40}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Text color:</span>
              {([["#111827", "Black"], ["#ffffff", "White"]] as const).map(([hex, name]) => (
                <button
                  key={hex}
                  onClick={() => setTextColor(hex)}
                  className={
                    "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition " +
                    (textColor === hex
                      ? "border-zinc-900 ring-2 ring-zinc-900/10"
                      : "border-zinc-300 hover:border-zinc-400")
                  }
                >
                  <span
                    className="inline-block h-3 w-3 rounded-full border border-zinc-300"
                    style={{ background: hex }}
                  />
                  {name}
                </button>
              ))}
            </div>
          </Step>

          {/* 3 — color */}
          <Step n={3} label="Shirt color">
            <div className="flex gap-2">
              {(["white", "black"] as const).map((color) => (
                <button
                  key={color}
                  onClick={() => setShirtColor(color)}
                  className={
                    "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm capitalize transition " +
                    (shirtColor === color
                      ? "border-zinc-900 ring-2 ring-zinc-900/10"
                      : "border-zinc-300 hover:border-zinc-400")
                  }
                >
                  <span
                    className="inline-block h-4 w-4 rounded-full border border-zinc-300"
                    style={{ background: color === "white" ? "#f4f4f5" : "#18181b" }}
                  />
                  {color}
                </button>
              ))}
            </div>
          </Step>

          {/* 4 — size */}
          <Step n={4} label="Size">
            <div className="flex gap-2">
              {SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={
                    "h-10 w-12 rounded-lg border text-sm font-medium transition " +
                    (size === s
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 hover:border-zinc-400")
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </Step>

          {/* 5 — quantity */}
          <Step n={5} label="Quantity">
            <div className="inline-flex items-center rounded-lg border border-zinc-300">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="px-3 py-2 text-lg leading-none text-zinc-600 hover:text-zinc-900"
                aria-label="decrease quantity"
              >
                −
              </button>
              <span className="w-10 text-center text-sm tabular-nums">{qty}</span>
              <button
                onClick={() => setQty((q) => Math.min(99, q + 1))}
                className="px-3 py-2 text-lg leading-none text-zinc-600 hover:text-zinc-900"
                aria-label="increase quantity"
              >
                +
              </button>
            </div>
          </Step>

          {/* 6 — email + buy */}
          <Step n={6} label="Your email (for the receipt)">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
            />

            <div className="flex items-center justify-between pt-1">
              <div className="text-sm text-zinc-500">
                {unitPriceCents != null ? (
                  <>
                    <span className="text-2xl font-semibold text-zinc-900">
                      {money(totalCents ?? 0)}
                    </span>{" "}
                    {qty > 1 && <span className="text-xs">({money(unitPriceCents)} each)</span>}
                  </>
                ) : (
                  <span className="text-xs">Loading price…</span>
                )}
              </div>
              <button
                onClick={handleBuy}
                disabled={!canBuy}
                className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:bg-zinc-300"
              >
                {buying ? "Redirecting…" : "Buy now"}
              </button>
            </div>
            {!hasDesign && (
              <p className="text-xs text-zinc-400">
                Add a design or some text to enable checkout.
              </p>
            )}
            {hasDesign && !variant?.stripePriceId && (
              <p className="text-xs text-amber-600">
                This color/size isn't available for purchase yet.
              </p>
            )}
            {buyError && <p className="text-xs text-red-500">{buyError}</p>}
          </Step>

          {/* For the printer */}
          <div className="border-t border-zinc-200 pt-6">
            <PrintReadyPanel
              imageUrl={displayUrl}
              printArea={printArea}
              text={text}
              textColor={textColor}
            />
          </div>
        </section>

        {/* ── Live preview ─────────────────────────────────────────── */}
        <section>
          <div className="sticky top-8 rounded-2xl border border-zinc-200 bg-white p-6">
            <ShirtPreview
              imageUrl={displayUrl}
              shirtColor={shirtColor}
              printArea={printArea}
              text={text}
              textColor={textColor}
            />
            <p className="mt-3 text-center text-xs text-zinc-400">
              Dashed box = the only area the provider can print.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold text-zinc-700">
        {n}. {label}
      </label>
      {children}
    </div>
  );
}

function Banner({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : "bg-amber-50 text-amber-800 border-amber-200";
  return (
    <div className={`mx-auto max-w-5xl px-6`}>
      <div className={`mt-4 rounded-lg border px-4 py-2 text-sm ${cls}`}>{children}</div>
    </div>
  );
}
