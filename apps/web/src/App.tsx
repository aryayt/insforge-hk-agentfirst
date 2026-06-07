import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_TSHIRT_PRINT_AREA,
  aspectRatioForProduct,
  type GeneratedDesign,
} from "@app/shared";
import { generateDesign, uploadDesign, generateFromBrand, GenerationError, type BrandInfo } from "./lib/generateImage";
import { removeWhiteBackground } from "./lib/imageProcessing";
import { fetchProduct, money, type Tee } from "./lib/catalog";
import { buyNow } from "./lib/checkout";
import {
  ShirtPreview,
  DEFAULT_PLACEMENT,
  type ShirtColor,
  type Placement,
} from "./components/ShirtPreview";
import { PrintReadyPanel } from "./components/PrintReadyPanel";
import { PrintfulMockupCard } from "./components/MockupCompare";
import { ProductInfoPanel } from "./components/ProductInfoPanel";
import { OrderStatusCard } from "./components/OrderStatusCard";
import { PRINTFUL_PRODUCT_BY_SLUG } from "./lib/mockup";
import { isAuthError } from "./lib/errors";
import { AccountControl } from "./components/AccountControl";
import { useAuth } from "./lib/auth";

const printArea = DEFAULT_TSHIRT_PRINT_AREA;
const TEE_ASPECT_RATIO = aspectRatioForProduct("tshirt");
const SHIP_INPUT =
  "w-full rounded-xl border border-zinc-300 px-3.5 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-900/10";
const SIZES = ["S", "M", "L", "XL"] as const;
type Size = (typeof SIZES)[number];

const EXAMPLES = [
  "minimalist mountain range line art",
  "retro 80s sunset wave",
  "geometric wolf head, two-tone",
  "vintage coffee roasters badge",
  "cosmic astronaut riding a cat",
  "bold koi fish, japanese woodblock",
];

const checkoutParam = new URLSearchParams(window.location.search).get("checkout");
const orderParam = new URLSearchParams(window.location.search).get("order");

export function App() {
  const { user, loading: authLoading, requireAuth, openAuth } = useAuth();

  // design
  const [mode, setMode] = useState<"describe" | "url">("describe");
  const [prompt, setPrompt] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [brandInfo, setBrandInfo] = useState<BrandInfo | null>(null);
  const [variations, setVariations] = useState<GeneratedDesign[]>([]);
  const [design, setDesign] = useState<GeneratedDesign | null>(null);
  const [placement, setPlacement] = useState<Placement>(DEFAULT_PLACEMENT);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const VARIATION_COUNT = 3;

  // Selecting a design resets its placement to centred/fit.
  function chooseDesign(d: GeneratedDesign | null) {
    setDesign(d);
    setPlacement(DEFAULT_PLACEMENT);
  }
  const [imgError, setImgError] = useState<string | null>(null);
  // Set when a prompt is rejected by content moderation (shown as a distinct policy box).
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [textColor, setTextColor] = useState<"#111827" | "#ffffff">("#111827");

  // product config
  const [tee, setTee] = useState<Tee | null>(null);
  const [shirtColor, setShirtColor] = useState<ShirtColor>("white");
  const [size, setSize] = useState<Size>("M");
  const [qty, setQty] = useState(1);
  const [email, setEmail] = useState("demo@agentfirst.shop");

  // shipping — pre-filled with a demo recipient so checkout flows straight through
  // (the buyer can overwrite any field for a real order; agents never stall on blanks).
  const [ship, setShip] = useState({
    name: "Demo Buyer",
    address1: "1 Market St",
    address2: "",
    city: "San Francisco",
    state: "CA",
    country: "US",
    zip: "94105",
  });
  const setShipField = (k: keyof typeof ship) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setShip((s) => ({ ...s, [k]: e.target.value }));
  const shippingValid =
    !!ship.address1.trim() && !!ship.city.trim() && !!ship.country.trim() && !!ship.zip.trim();

  // checkout
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  useEffect(() => {
    fetchProduct("classic-tee").then(setTee).catch(() => setTee(null));
  }, []);

  // Prefill the receipt email once a user signs in (unless they've typed one).
  useEffect(() => {
    if (user?.email) setEmail((prev) => prev || user.email);
  }, [user]);

  async function generate(preset?: string) {
    const q = (preset ?? prompt).trim();
    if (!q || loading) return;
    if (!requireAuth()) return; // must be signed in to create a design
    if (preset) setPrompt(preset);
    setLoading(true);
    setImgError(null);
    setBrandInfo(null);
    setPolicyError(null);
    setVariations([]);
    chooseDesign(null);
    // Fire all variations at once but stream each into the UI as it lands, so the
    // first design shows after ~one model call instead of waiting for the slowest.
    let any = false;
    let firstErr: unknown = null;
    const jobs = Array.from({ length: VARIATION_COUNT }, () =>
      generateDesign(q, TEE_ASPECT_RATIO)
        .then((d) => {
          any = true;
          setVariations((v) => [...v, d]);
          setDesign((cur) => cur ?? d); // auto-select the first to arrive
        })
        .catch((e) => {
          if (!firstErr) firstErr = e; // keep the first real reason
        }),
    );
    await Promise.allSettled(jobs);
    if (!any) {
      // A content-moderation block gets a distinct policy box; anything else is a
      // generic inline error.
      if (firstErr instanceof GenerationError && firstErr.policy) {
        setPolicyError(firstErr.message);
      } else {
        setImgError(firstErr instanceof Error ? firstErr.message : "Couldn't generate. Try again.");
      }
    }
    setLoading(false);
  }

  async function uploadArt(file: File | undefined) {
    if (!file || loading) return;
    if (!requireAuth()) return; // must be signed in to create a design
    setLoading(true);
    setImgError(null);
    try {
      setPrompt("");
      setBrandInfo(null);
      const d = await uploadDesign(file);
      setVariations([d]);
      chooseDesign(d);
    } catch (e) {
      setImgError(e instanceof Error ? e.message : "Couldn't upload that file.");
    } finally {
      setLoading(false);
    }
  }

  async function brandGenerate() {
    const u = siteUrl.trim();
    if (!u || loading) return;
    if (!requireAuth()) return;
    setLoading(true);
    setImgError(null);
    setVariations([]);
    setBrandInfo(null);
    chooseDesign(null);
    try {
      const { brand, designs } = await generateFromBrand(u);
      setBrandInfo(brand);
      setVariations(designs);
      chooseDesign(designs[0] ?? null);
    } catch (e) {
      setImgError(e instanceof Error ? e.message : "Couldn't read that website.");
    } finally {
      setLoading(false);
    }
  }

  // Always cut the background so the art sits cleanly on any shirt colour.
  useEffect(() => {
    if (!design?.imageUrl) {
      setProcessedUrl(null);
      return;
    }
    let cancelled = false;
    setProcessedUrl(null);
    removeWhiteBackground(design.imageUrl)
      .then((url) => !cancelled && setProcessedUrl(url))
      .catch(() => !cancelled && setProcessedUrl(null));
    return () => {
      cancelled = true;
    };
  }, [design?.imageUrl]);

  const displayUrl = processedUrl ?? design?.imageUrl ?? null;

  const variant = useMemo(() => {
    const color = shirtColor === "white" ? "White" : "Black";
    return tee?.variants.find((v) => v.color === color && v.size === size) ?? null;
  }, [tee, shirtColor, size]);

  const unitPriceCents = tee ? tee.basePriceCents + (variant?.priceDeltaCents ?? 0) : null;
  const totalCents = unitPriceCents != null ? unitPriceCents * qty : null;

  const hasDesign = !!design || !!text.trim();
  const canBuy = hasDesign && !!variant?.sku && shippingValid && !buying && !authLoading;

  async function handleBuy() {
    if (!variant?.sku || !shippingValid) return;
    if (!requireAuth("Please sign in to continue to checkout.")) return; // must be signed in to buy
    setBuying(true);
    setBuyError(null);
    try {
      await buyNow({
        sku: variant.sku,
        quantity: qty,
        email: email.trim() || undefined,
        designId: design?.id,
        shipping: {
          name: ship.name.trim() || undefined,
          address1: ship.address1.trim(),
          address2: ship.address2.trim() || undefined,
          city: ship.city.trim(),
          state: ship.state.trim() || undefined,
          country: ship.country.trim(),
          zip: ship.zip.trim(),
        },
      });
    } catch (e) {
      if (isAuthError(e)) {
        const msg = "Your session expired. Please sign in again.";
        setBuyError(msg);
        openAuth(msg);
      } else {
        setBuyError(e instanceof Error ? e.message : "Checkout failed. Please try again.");
      }
      setBuying(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100 text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-zinc-900 text-xs font-bold text-white">
              ✦
            </div>
            <span className="text-base font-semibold tracking-tight">Design Studio</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-zinc-500 sm:block">
              Describe it · see it on a real tee · check out
            </span>
            <AccountControl />
          </div>
        </div>
      </header>

      {checkoutParam === "success" && !orderParam && (
        <Banner tone="ok">Payment received — thanks! Your order is being processed.</Banner>
      )}
      {checkoutParam === "success" && orderParam && <OrderStatusCard orderId={orderParam} />}
      {checkoutParam === "canceled" && (
        <Banner tone="warn">Checkout canceled — your design is still here.</Banner>
      )}

      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[1.05fr_0.95fr]">
        {/* ── Canvas (hero) ─────────────────────────────────────────── */}
        <section className="lg:sticky lg:top-24 lg:self-start">
          <div className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
            <ShirtPreview
              imageUrl={displayUrl}
              shirtColor={shirtColor}
              printArea={printArea}
              text={text}
              textColor={textColor}
              placement={placement}
              onPlacementChange={setPlacement}
            />
            {loading && (
              <div className="absolute inset-0 grid place-items-center bg-white/55 backdrop-blur-[1px]">
                <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow">
                  <Spinner /> Designing…
                </div>
              </div>
            )}
          </div>

          {/* Colour swatches */}
          <div className="mt-4 flex items-center justify-center gap-3">
            {(["white", "black"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setShirtColor(c)}
                aria-label={`${c} shirt`}
                className={
                  "h-9 w-9 rounded-full border-2 transition " +
                  (shirtColor === c
                    ? "border-zinc-900 ring-2 ring-zinc-900/15"
                    : "border-zinc-300 hover:border-zinc-400")
                }
                style={{ background: c === "white" ? "#f4f4f5" : "#1c1c1f" }}
              />
            ))}
            <span className="ml-1 text-xs capitalize text-zinc-500">{shirtColor} tee</span>
          </div>

          {/* Size + position — only printable inside the dashed box */}
          {design && (
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-600">
                  Size <span className="text-zinc-400">· drag the art to move it</span>
                </span>
                <button
                  onClick={() => setPlacement(DEFAULT_PLACEMENT)}
                  className="text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-900"
                >
                  Reset
                </button>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-xs text-zinc-400">A</span>
                <input
                  type="range"
                  min={0.4}
                  max={1.4}
                  step={0.01}
                  value={placement.scale}
                  onChange={(e) => setPlacement((p) => ({ ...p, scale: Number(e.target.value) }))}
                  className="h-1.5 flex-1 cursor-pointer accent-zinc-900"
                  aria-label="design size"
                />
                <span className="text-lg text-zinc-400">A</span>
              </div>
            </div>
          )}

          {/* Photoreal Printful mockup — beside the instant local preview above */}
          <div className="mt-4">
            <PrintfulMockupCard
              artworkUrl={displayUrl}
              printfulVariantId={variant?.printfulVariantId ?? null}
              color={shirtColor === "white" ? "White" : "Black"}
              size={size}
              printArea={printArea}
              placement={placement}
              text={text}
              textColor={textColor}
            />
          </div>
        </section>

        {/* ── Studio panel ──────────────────────────────────────────── */}
        <section className="space-y-5">
          {/* Prompt */}
          <Card>
            <div className="flex items-center justify-between">
              <div className="flex rounded-lg bg-zinc-100 p-0.5 text-xs font-medium">
                {(["describe", "url"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={
                      "rounded-md px-2.5 py-1 transition " +
                      (mode === m ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800")
                    }
                  >
                    {m === "describe" ? "Describe" : "From a website"}
                  </button>
                ))}
              </div>
              {mode === "describe" && (
                <button
                  onClick={() => generate(EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)])}
                  disabled={loading}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-500 disabled:text-zinc-300"
                >
                  ✨ Surprise me
                </button>
              )}
            </div>

            {mode === "describe" ? (
              <>
                <div className="mt-3 flex gap-2">
                  <input
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && generate()}
                    placeholder="e.g. minimalist mountain line art"
                    className="flex-1 rounded-xl border border-zinc-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-900/10"
                  />
                  <button
                    onClick={() => generate()}
                    disabled={loading || !prompt.trim()}
                    className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:bg-zinc-300"
                  >
                    {variations.length ? "Regenerate" : "Generate"}
                  </button>
                </div>
                {!variations.length && !loading && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {EXAMPLES.slice(0, 4).map((ex) => (
                      <button
                        key={ex}
                        onClick={() => generate(ex)}
                        className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600 transition hover:border-zinc-300 hover:bg-white"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="mt-3 flex gap-2">
                  <input
                    value={siteUrl}
                    onChange={(e) => setSiteUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && brandGenerate()}
                    placeholder="yourbrand.com"
                    className="flex-1 rounded-xl border border-zinc-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-900/10"
                  />
                  <button
                    onClick={brandGenerate}
                    disabled={loading || !siteUrl.trim()}
                    className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:bg-zinc-300"
                  >
                    {variations.length ? "Regenerate" : "Generate"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  We pull the site's colors and logo, then create standalone transparent print concepts.
                </p>
                {brandInfo && (
                  <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">{brandInfo.name}</p>
                        <p className="text-xs text-zinc-500">{brandInfo.domain ?? siteUrl}</p>
                      </div>
                      <div className="flex gap-1.5">
                        {brandInfo.colors.slice(0, 5).map((c) => (
                          <span
                            key={c}
                            className="h-6 w-6 rounded-full border border-zinc-300"
                            style={{ backgroundColor: c }}
                            title={c}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="mt-3 flex items-center gap-3 text-xs">
              <label className="cursor-pointer font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-900">
                Upload your own art
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => uploadArt(e.target.files?.[0])}
                />
              </label>
            </div>
            {imgError && <p className="mt-2 text-xs text-red-500">{imgError}</p>}
            {policyError && (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3">
                <span aria-hidden className="mt-0.5 text-amber-500">⚠️</span>
                <div className="text-sm">
                  <p className="font-semibold text-amber-900">This prompt isn't allowed by our content policy</p>
                  <p className="mt-0.5 text-amber-800">{policyError} Try describing something else.</p>
                </div>
              </div>
            )}
          </Card>

          {/* Variations */}
          {(loading || variations.length > 0) && (
            <Card>
              <h2 className="text-sm font-semibold text-zinc-800">
                {loading ? "Generating options…" : "Pick a variation"}
              </h2>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {variations.map((v) => {
                  const selected = design?.id === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => chooseDesign(v)}
                      className={
                        "relative aspect-square overflow-hidden rounded-xl border-2 bg-[conic-gradient(at_50%_50%,#fafafa,#f1f1f1)] transition " +
                        (selected
                          ? "border-zinc-900 ring-2 ring-zinc-900/15"
                          : "border-transparent hover:border-zinc-300")
                      }
                    >
                      <img src={v.imageUrl} alt="" className="h-full w-full object-contain p-1.5" />
                      {selected && (
                        <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-zinc-900 text-[10px] text-white">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
                {loading &&
                  Array.from({ length: Math.max(0, VARIATION_COUNT - variations.length) }).map(
                    (_, i) => (
                      <div key={`s${i}`} className="aspect-square animate-pulse rounded-xl bg-zinc-100" />
                    ),
                  )}
              </div>
            </Card>
          )}

          {/* Text + options */}
          <Card>
            <h2 className="text-sm font-semibold text-zinc-800">Add text (optional)</h2>
            <div className="mt-3 flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. CAMP 2026"
                maxLength={40}
                className="flex-1 rounded-xl border border-zinc-300 px-3.5 py-2.5 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-900/10"
              />
              <div className="flex items-center gap-1">
                {([["#111827", "Black"], ["#ffffff", "White"]] as const).map(([hex]) => (
                  <button
                    key={hex}
                    onClick={() => setTextColor(hex)}
                    aria-label={`text ${hex}`}
                    className={
                      "h-9 w-9 rounded-lg border-2 transition " +
                      (textColor === hex ? "border-zinc-900" : "border-zinc-300 hover:border-zinc-400")
                    }
                    style={{ background: hex }}
                  />
                ))}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-end gap-6">
              <div>
                <p className="mb-1.5 text-xs font-medium text-zinc-600">Size</p>
                <div className="flex gap-1.5">
                  {SIZES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSize(s)}
                      className={
                        "h-9 w-10 rounded-lg border text-sm font-medium transition " +
                        (size === s
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-300 hover:border-zinc-400")
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-zinc-600">Quantity</p>
                <div className="inline-flex items-center rounded-lg border border-zinc-300">
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="px-3 py-1.5 text-lg leading-none text-zinc-600 hover:text-zinc-900"
                    aria-label="decrease quantity"
                  >
                    −
                  </button>
                  <span className="w-9 text-center text-sm tabular-nums">{qty}</span>
                  <button
                    onClick={() => setQty((q) => Math.min(99, q + 1))}
                    className="px-3 py-1.5 text-lg leading-none text-zinc-600 hover:text-zinc-900"
                    aria-label="increase quantity"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </Card>

          {/* Product info: print specs, live sizes/colors, price breakdown */}
          <Card>
            <ProductInfoPanel
              printArea={printArea}
              printfulProductId={PRINTFUL_PRODUCT_BY_SLUG["classic-tee"] ?? null}
              retailCents={unitPriceCents}
              color={shirtColor === "white" ? "White" : "Black"}
              size={size}
            />
          </Card>

          {/* Checkout */}
          <Card>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com (for the receipt)"
              className="w-full rounded-xl border border-zinc-300 px-3.5 py-2.5 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-900/10"
            />

            {/* Shipping address — required so the order can be fulfilled by Printful */}
            <p className="mb-2 mt-4 text-xs font-medium text-zinc-600">Ship to</p>
            <div className="space-y-2">
              <input value={ship.name} onChange={setShipField("name")} placeholder="Full name" className={SHIP_INPUT} />
              <input value={ship.address1} onChange={setShipField("address1")} placeholder="Address line 1" className={SHIP_INPUT} />
              <input value={ship.address2} onChange={setShipField("address2")} placeholder="Address line 2 (optional)" className={SHIP_INPUT} />
              <div className="grid grid-cols-2 gap-2">
                <input value={ship.city} onChange={setShipField("city")} placeholder="City" className={SHIP_INPUT} />
                <input value={ship.state} onChange={setShipField("state")} placeholder="State / Province" className={SHIP_INPUT} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={ship.zip} onChange={setShipField("zip")} placeholder="ZIP / Postal" className={SHIP_INPUT} />
                <input value={ship.country} onChange={setShipField("country")} placeholder="Country (ISO, e.g. US)" maxLength={2} className={SHIP_INPUT} />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-2xl font-semibold tracking-tight">
                  {totalCents != null ? money(totalCents) : "—"}
                </div>
                {qty > 1 && unitPriceCents != null && (
                  <div className="text-xs text-zinc-500">{money(unitPriceCents)} each</div>
                )}
              </div>
              <button
                onClick={handleBuy}
                disabled={!canBuy}
                className="rounded-xl bg-emerald-600 px-7 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:bg-zinc-300 disabled:shadow-none"
              >
                {buying ? "Redirecting…" : "Buy now"}
              </button>
            </div>
            {!hasDesign && (
              <p className="mt-2 text-xs text-zinc-400">Add a design or some text to check out.</p>
            )}
            {hasDesign && !variant?.stripePriceId && (
              <p className="mt-2 text-xs text-amber-600">This color/size isn't available yet.</p>
            )}
            {buyError && <p className="mt-2 text-xs text-red-500">{buyError}</p>}
          </Card>

          {/* Print-ready (collapsible) */}
          <details className="group rounded-2xl border border-zinc-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-sm font-semibold text-zinc-700">
              Print-ready file
              <span className="text-xs font-normal text-zinc-400 group-open:hidden">
                tap to view ›
              </span>
            </summary>
            <div className="border-t border-zinc-100 px-5 py-4">
              <PrintReadyPanel
                imageUrl={displayUrl}
                printArea={printArea}
                text={text}
                textColor={textColor}
                placement={placement}
              />
            </div>
          </details>
        </section>
      </main>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">{children}</div>;
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-zinc-500" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  );
}

function Banner({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : "bg-amber-50 text-amber-800 border-amber-200";
  return (
    <div className="mx-auto max-w-6xl px-6">
      <div className={`mt-4 rounded-xl border px-4 py-2 text-sm ${cls}`}>{children}</div>
    </div>
  );
}
