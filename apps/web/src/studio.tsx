import { useMemo, useState, type ButtonHTMLAttributes } from "react";
import { useNavigate } from "react-router-dom";
import type { Product, Variant } from "@app/shared";
import { insforge } from "./insforge";
import { money } from "./format";
import { useCart } from "./store";
import { variantPriceCents } from "./api";
import { ProductMockup, colorHex } from "./mockup";
import type { CartItem, Design } from "./cart";

const svgUrl = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
const PRESETS: Array<{ label: string; url: string }> = [
  { label: "bolt", url: svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='#f59e0b'><path d='M13 2 3 14h7l-1 8 10-12h-7z'/></svg>`) },
  { label: "star", url: svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='#fbbf24'><path d='M12 2l3 7h7l-5.5 4 2 7L12 17l-6.5 3 2-7L2 9h7z'/></svg>`) },
  { label: "heart", url: svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='#ef4444'><path d='M12 21s-8-5-8-11a4 4 0 018-1 4 4 0 018 1c0 6-8 11-8 11z'/></svg>`) },
  { label: "wave", url: svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#22d3ee' stroke-width='2.5'><path d='M2 12c3-4 5-4 8 0s5 4 8 0 5-4 8 0'/></svg>`) },
];

type Tab = "text" | "art" | "upload" | "ai";

async function generateAiArt(prompt: string): Promise<string> {
  // Calls the deployed `generate-design` edge function (Gemini to OpenAI fallback,
  // keys live as InsForge secrets). Response shape: { design: { imageUrl, ... } }.
  const { data, error } = await insforge.functions.invoke("generate-design", {
    body: { prompt, agentSource: "web" },
  });
  if (error) throw error;
  const url = (data as any)?.design?.imageUrl;
  if (!url) throw new Error("No image URL returned");
  return url as string;
}

export function Studio({ product }: { product: Product }) {
  const cart = useCart();
  const navigate = useNavigate();

  const colors = useMemo(
    () => Array.from(new Set(product.variants.map((v) => v.color))),
    [product],
  );
  const [color, setColor] = useState(colors[0] ?? "Black");
  const sizes = useMemo(
    () => product.variants.filter((v) => v.color === color).map((v) => v.size).filter((s): s is string => !!s),
    [product, color],
  );
  const [size, setSize] = useState<string | null>(sizes[0] ?? null);

  const variant: Variant | undefined = useMemo(
    () =>
      product.variants.find((v) => v.color === color && (v.size ?? null) === (sizes.length ? size : null)),
    [product, color, size, sizes],
  );

  const [tab, setTab] = useState<Tab>("text");
  const [text, setText] = useState("");
  const [textColor, setTextColor] = useState("#ffffff");
  const [artUrl, setArtUrl] = useState<string | undefined>();
  const [artLabel, setArtLabel] = useState<string | undefined>();
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const onColor = (c: string) => {
    setColor(c);
    const next = product.variants.filter((v) => v.color === c).map((v) => v.size).filter(Boolean) as string[];
    setSize(next[0] ?? null);
  };

  const price = variant ? variantPriceCents(product, variant) : product.basePriceCents;

  const setUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setArtUrl(reader.result as string);
      setArtLabel(`upload: ${file.name}`);
    };
    reader.readAsDataURL(file);
  };

  const runAi = async () => {
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const url = await generateAiArt(aiPrompt.trim());
      setArtUrl(url);
      setArtLabel(`AI: ${aiPrompt.trim()}`);
    } catch {
      setAiError("AI generation is not wired up yet. Use a preset or upload for now.");
    } finally {
      setAiBusy(false);
    }
  };

  const addToCart = () => {
    if (!variant?.stripePriceId) return;
    const design: Design | undefined =
      text || artUrl ? { text: text || undefined, textColor, artUrl, artLabel } : undefined;
    const item: CartItem = {
      variantId: variant.id,
      sku: variant.sku,
      productSlug: product.slug,
      productName: product.name,
      productType: product.type,
      color,
      size: variant.size,
      unitPriceCents: price,
      stripePriceId: variant.stripePriceId,
      qty: 1,
      design,
    };
    cart.add(item);
    navigate("/cart");
  };

  const Btn = ({ active, ...p }: { active: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button
      {...p}
      className={`rounded-md border px-3 py-1.5 text-sm font-semibold transition ${
        active ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--accent)]"
      }`}
    />
  );

  return (
    <div className="grid gap-8 md:grid-cols-2">
      {/* Preview */}
      <div className="rounded-lg bg-[var(--surface)] p-6 ring-1 ring-[var(--line)]">
        <ProductMockup type={product.type} color={color} artUrl={artUrl} text={text} textColor={textColor} />
        <p className="mt-3 text-center text-sm text-[var(--muted)]">Live preview, {color}{size ? ` / ${size}` : ""}</p>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <p className="text-[var(--muted)]">{product.description}</p>
          <p className="mt-1 text-3xl font-extrabold">{money(price)}</p>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-[var(--muted)]">Color</p>
          <div className="flex gap-2">
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => onColor(c)}
                title={c}
                className={`h-9 w-9 rounded-full ring-2 ring-offset-2 transition ${
                  color === c ? "ring-[var(--accent)]" : "ring-transparent hover:ring-[var(--line)]"
                }`}
                style={{ backgroundColor: colorHex(c), border: "1px solid var(--line)" }}
              />
            ))}
          </div>
        </div>

        {sizes.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-[var(--muted)]">Size</p>
            <div className="flex flex-wrap gap-2">
              {sizes.map((s) => (
                <Btn key={s} active={size === s} onClick={() => setSize(s)}>
                  {s}
                </Btn>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-semibold text-[var(--muted)]">Design</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {(["text", "art", "upload", "ai"] as Tab[]).map((t) => (
              <Btn key={t} active={tab === t} onClick={() => setTab(t)}>
                {t === "ai" ? "AI art" : t[0]!.toUpperCase() + t.slice(1)}
              </Btn>
            ))}
          </div>

          {tab === "text" && (
            <div className="flex items-center gap-3">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Your text..."
                className="flex-1 rounded-md border border-[var(--line)] bg-white px-3 py-2"
              />
              <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-10 w-12" />
            </div>
          )}

          {tab === "art" && (
            <div className="flex flex-wrap gap-3">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => {
                    setArtUrl(p.url);
                    setArtLabel(`preset: ${p.label}`);
                  }}
                  className={`flex h-16 w-16 items-center justify-center rounded-md border bg-[var(--surface-muted)] ${
                    artLabel === `preset: ${p.label}` ? "border-[var(--accent)]" : "border-[var(--line)]"
                  }`}
                >
                  <img src={p.url} alt={p.label} className="h-10 w-10" />
                </button>
              ))}
              {artUrl && (
                <button onClick={() => { setArtUrl(undefined); setArtLabel(undefined); }} className="text-sm font-semibold text-[var(--danger)] underline">
                  Clear art
                </button>
              )}
            </div>
          )}

          {tab === "upload" && (
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && setUpload(e.target.files[0])}
              className="text-sm"
            />
          )}

          {tab === "ai" && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Describe artwork, e.g. 'a neon howling wolf'"
                  className="flex-1 rounded-md border border-[var(--line)] bg-white px-3 py-2"
                />
                <Btn active onClick={runAi} disabled={aiBusy}>
                  {aiBusy ? "Working..." : "Generate art"}
                </Btn>
              </div>
              {aiError && <p className="text-sm text-[var(--warning-ink)]">{aiError}</p>}
            </div>
          )}
        </div>

        <button
          onClick={addToCart}
          disabled={!variant?.stripePriceId}
          className="mt-2 rounded-md bg-[var(--accent)] px-6 py-3 text-lg font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-40"
        >
          Add to cart ({money(price)})
        </button>
        {!variant?.stripePriceId && (
          <p className="text-sm text-[var(--warning-ink)]">This variant has no Stripe price configured.</p>
        )}
      </div>
    </div>
  );
}
