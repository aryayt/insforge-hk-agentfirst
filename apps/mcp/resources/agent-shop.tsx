import { useMemo, type CSSProperties } from "react";
import {
  McpUseProvider,
  ModelContext,
  useCallTool,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";

const variantSchema = z.object({
  id: z.string(),
  productId: z.string(),
  color: z.string(),
  size: z.string().nullable(),
  sku: z.string(),
  priceDeltaCents: z.number(),
  stripePriceId: z.string().nullable(),
});

const productSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  type: z.enum(["tshirt", "mug", "cap"]),
  description: z.string(),
  basePriceCents: z.number(),
  active: z.boolean(),
  variants: z.array(variantSchema),
});

const cartLineSchema = z.object({
  variantId: z.string(),
  sku: z.string(),
  productLabel: z.string(),
  stripePriceId: z.string().nullable(),
  designId: z.string().optional(),
  designLabel: z.string().optional(),
  designUrl: z.string().optional(),
  qty: z.number(),
  unitPriceCents: z.number(),
});

const designSchema = z.object({
  id: z.string(),
  label: z.string(),
  imageUrl: z.string(),
  prompt: z.string().optional(),
});

const propsSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("catalog"),
    products: z.array(productSchema),
  }),
  z.object({
    mode: z.literal("cart"),
    cart: z.array(cartLineSchema),
    totalCents: z.number(),
  }),
  z.object({
    mode: z.literal("design"),
    design: designSchema,
    studioUrl: z.string().optional(),
  }),
  z.object({
    mode: z.literal("brand"),
    brand: z.object({
      name: z.string(),
      domain: z.string().optional(),
      colors: z.array(z.string()),
      logoUrl: z.string().nullable().optional(),
    }),
    designs: z.array(designSchema),
    studioUrl: z.string().optional(),
  }),
]);

export const widgetMetadata: WidgetMetadata = {
  title: "Agent Shop",
  description: "Browse products, preview generated designs, and review the current cart for the agent-first shop.",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    prefersBorder: true,
    autoResize: true,
    widgetDescription:
      "Shows the current Agent Shop catalog or cart. Products include slugs and SKUs the model can use in follow-up tool calls.",
    csp: {
      resourceDomains: ["https://dsc7y62h.us-east.insforge.app", "https://app.agentfirst.shop"],
    },
  },
};

type Props = z.infer<typeof propsSchema>;

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function usePalette() {
  const theme = useWidgetTheme();
  return {
    bg: theme === "dark" ? "#111416" : "#f7f6f1",
    panel: theme === "dark" ? "#181d20" : "#fffdf8",
    panelAlt: theme === "dark" ? "#20272b" : "#edf1ed",
    ink: theme === "dark" ? "#f1f0ea" : "#17201d",
    muted: theme === "dark" ? "#b8c0ba" : "#56635e",
    line: theme === "dark" ? "#30383d" : "#d9ded8",
    accent: theme === "dark" ? "#81d8ac" : "#1d7f58",
    accentInk: theme === "dark" ? "#0f1713" : "#ffffff",
    danger: theme === "dark" ? "#ff9b8f" : "#a83a31",
  };
}

function ProductMockup({ type }: { type: "tshirt" | "mug" | "cap" }) {
  const label = type === "tshirt" ? "TEE" : type === "mug" ? "MUG" : "CAP";
  return (
    <div className={`mockup mockup-${type}`} aria-hidden="true">
      <span>{label}</span>
    </div>
  );
}

function Loading() {
  return (
    <McpUseProvider autoSize>
      <div className="shell">
        <div className="skeleton" />
        <div className="skeleton short" />
      </div>
      <Styles />
    </McpUseProvider>
  );
}

export default function AgentShopWidget() {
  const { props, isPending } = useWidget<Props>({
    mode: "cart",
    cart: [],
    totalCents: 0,
  });
  const colors = usePalette();
  const { callTool, isPending: removing } = useCallTool("remove_from_cart");
  const removeLine = callTool as (args: { lineNumber: number }) => void;

  const summary = useMemo(() => {
    const data = props as Props;
    if (data.mode === "catalog") return `${data.products.length} products visible`;
    if (data.mode === "design") return `Design ${data.design.label} visible`;
    if (data.mode === "brand") return `Brand ${data.brand.name}, ${data.designs.length} designs visible`;
    return `${data.cart.length} cart lines, ${money(data.totalCents)} total`;
  }, [props]);

  if (isPending) return <Loading />;
  const data = props as Props;

  return (
    <McpUseProvider autoSize>
      <ModelContext content={`Agent Shop widget: ${summary}`}>
        <div
          className="shell"
          style={
            {
              "--bg": colors.bg,
              "--panel": colors.panel,
              "--panel-alt": colors.panelAlt,
              "--ink": colors.ink,
              "--muted": colors.muted,
              "--line": colors.line,
              "--accent": colors.accent,
              "--accent-ink": colors.accentInk,
              "--danger": colors.danger,
            } as CSSProperties
          }
        >
          <header className="top">
            <div>
              <p className="label">Agent Shop</p>
              <h2>{data.mode === "catalog" ? "Catalog" : data.mode === "design" ? "Design ready" : data.mode === "brand" ? "Brand kit" : "Cart"}</h2>
            </div>
            <span className="status">
              {data.mode === "catalog" ? `${data.products.length} items` : data.mode === "design" ? "print art" : data.mode === "brand" ? `${data.designs.length} concepts` : money(data.totalCents)}
            </span>
          </header>

          {data.mode === "catalog" ? (
            <div className="grid" role="list">
              {data.products.map((product) => (
                <article className="item" key={product.id} role="listitem">
                  <ProductMockup type={product.type} />
                  <div className="item-main">
                    <div className="item-title">
                      <h3>{product.name}</h3>
                      <span>{money(product.basePriceCents)}</span>
                    </div>
                    <p>{product.description}</p>
                    <div className="chips" aria-label={`${product.name} variants`}>
                      <span>{product.slug}</span>
                      <span>{product.variants.length} SKUs</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : data.mode === "design" ? (
            <article className="design-ready">
              <div className="design-preview">
                <img src={data.design.imageUrl} alt={data.design.label} />
              </div>
              <div className="design-copy">
                <h3>{data.design.label}</h3>
                {data.design.prompt && <p>{data.design.prompt}</p>}
                <div className="chips">
                  <span>designId: {data.design.id}</span>
                  <span>transparent-ready</span>
                </div>
                {data.studioUrl && (
                  <a href={data.studioUrl} target="_blank" rel="noreferrer">
                    Open web studio
                  </a>
                )}
              </div>
            </article>
          ) : data.mode === "brand" ? (
            <div className="brand-mode">
              <article className="brand-summary">
                <div>
                  <h3>{data.brand.name}</h3>
                  <p>{data.brand.domain ?? "Brand domain"}</p>
                </div>
                <div className="swatches" aria-label="Extracted brand colors">
                  {data.brand.colors.slice(0, 5).map((color) => (
                    <span key={color} title={color} style={{ background: color }} />
                  ))}
                </div>
              </article>
              <div className="brand-designs">
                {data.designs.map((design) => (
                  <article className="brand-design" key={design.id}>
                    <div className="design-preview compact">
                      <img src={design.imageUrl} alt={design.label} />
                    </div>
                    <div className="design-copy">
                      <h3>{design.label}</h3>
                      <div className="chips">
                        <span>designId: {design.id}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {data.studioUrl && (
                <a className="studio-link" href={data.studioUrl} target="_blank" rel="noreferrer">
                  Open placement studio
                </a>
              )}
            </div>
          ) : data.cart.length === 0 ? (
            <div className="empty">
              <h3>No items yet</h3>
              <p>Ask for `list_products`, choose a SKU, then add a design or plain product to the cart.</p>
            </div>
          ) : (
            <div className="cart" role="list">
              {data.cart.map((line, index) => (
                <article className="cart-line" key={`${line.sku}-${index}`} role="listitem">
                  {line.designUrl ? (
                    <img src={line.designUrl} alt={line.designLabel ?? "Design preview"} loading="lazy" />
                  ) : (
                    <div className="plain-print" aria-hidden="true">{index + 1}</div>
                  )}
                  <div className="line-main">
                    <div className="item-title">
                      <h3>{line.productLabel}</h3>
                      <span>{money(line.unitPriceCents * line.qty)}</span>
                    </div>
                    <p>{line.designLabel ? `Design: ${line.designLabel}` : "No design attached"}</p>
                    <div className="chips">
                      <span>{line.qty}x</span>
                      <span>{line.sku}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine({ lineNumber: index + 1 })}
                    disabled={removing}
                    aria-label={`Remove cart line ${index + 1}`}
                  >
                    Remove
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
      </ModelContext>
      <Styles />
    </McpUseProvider>
  );
}

function Styles() {
  return (
    <style>{`
      .shell {
        min-width: 280px;
        max-width: 860px;
        padding: 16px;
        background: var(--bg, #f7f6f1);
        color: var(--ink, #17201d);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 14px;
      }
      .label {
        margin: 0 0 4px;
        color: var(--accent, #1d7f58);
        font-size: 12px;
        font-weight: 700;
      }
      h2, h3, p { margin: 0; }
      h2 {
        font-size: 22px;
        line-height: 1.15;
        text-wrap: balance;
      }
      h3 {
        font-size: 15px;
        line-height: 1.25;
      }
      p {
        color: var(--muted, #56635e);
        font-size: 13px;
        line-height: 1.45;
      }
      .status {
        flex: 0 0 auto;
        padding: 6px 10px;
        border: 1px solid var(--line, #d9ded8);
        border-radius: 999px;
        color: var(--muted, #56635e);
        font-size: 12px;
      }
      .grid, .cart {
        display: grid;
        gap: 10px;
      }
      .grid {
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      }
      .item, .cart-line, .empty, .design-ready {
        border: 1px solid var(--line, #d9ded8);
        border-radius: 8px;
        background: var(--panel, #fffdf8);
      }
      .item {
        display: grid;
        grid-template-columns: 72px minmax(0, 1fr);
        gap: 12px;
        padding: 12px;
      }
      .item-main, .line-main {
        min-width: 0;
        display: grid;
        gap: 8px;
      }
      .item-title {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }
      .item-title span {
        color: var(--ink, #17201d);
        font-size: 13px;
        font-weight: 700;
        white-space: nowrap;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .chips span {
        padding: 3px 7px;
        border-radius: 999px;
        background: var(--panel-alt, #edf1ed);
        color: var(--muted, #56635e);
        font-size: 11px;
        font-weight: 650;
      }
      .mockup, .plain-print {
        display: grid;
        place-items: center;
        aspect-ratio: 1;
        border-radius: 8px;
        background: var(--panel-alt, #edf1ed);
        color: var(--accent, #1d7f58);
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0;
      }
      .mockup-mug { border-radius: 8px 18px 18px 8px; }
      .mockup-cap { border-radius: 22px 22px 8px 8px; }
      .cart-line {
        display: grid;
        grid-template-columns: 52px minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
        padding: 12px;
      }
      .design-ready {
        display: grid;
        grid-template-columns: minmax(120px, 220px) minmax(0, 1fr);
        gap: 14px;
        padding: 14px;
      }
      .design-preview {
        display: grid;
        place-items: center;
        min-height: 160px;
        border-radius: 8px;
        border: 1px solid var(--line, #d9ded8);
        background:
          linear-gradient(45deg, var(--panel-alt, #edf1ed) 25%, transparent 25%),
          linear-gradient(-45deg, var(--panel-alt, #edf1ed) 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, var(--panel-alt, #edf1ed) 75%),
          linear-gradient(-45deg, transparent 75%, var(--panel-alt, #edf1ed) 75%);
        background-position: 0 0, 0 8px, 8px -8px, -8px 0;
        background-size: 16px 16px;
      }
      .design-preview img {
        max-width: 86%;
        max-height: 180px;
        object-fit: contain;
      }
      .design-copy {
        display: grid;
        align-content: center;
        gap: 10px;
      }
      .design-copy a {
        display: inline-flex;
        width: fit-content;
        min-height: 38px;
        align-items: center;
        border-radius: 6px;
        background: var(--accent, #1d7f58);
        color: var(--accent-ink, #ffffff);
        padding: 0 12px;
        text-decoration: none;
        font-size: 13px;
        font-weight: 800;
      }
      .cart-line img {
        width: 52px;
        height: 52px;
        object-fit: cover;
        border: 1px solid var(--line, #d9ded8);
        border-radius: 8px;
        background: var(--panel-alt, #edf1ed);
      }
      .brand-mode {
        display: grid;
        gap: 10px;
      }
      .brand-summary, .brand-design {
        border: 1px solid var(--line, #d9ded8);
        border-radius: 8px;
        background: var(--panel, #fffdf8);
      }
      .brand-summary {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 12px;
      }
      .swatches {
        display: flex;
        flex: 0 0 auto;
        gap: 6px;
      }
      .swatches span {
        width: 24px;
        height: 24px;
        border: 1px solid var(--line, #d9ded8);
        border-radius: 999px;
      }
      .brand-designs {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 10px;
      }
      .brand-design {
        display: grid;
        gap: 10px;
        padding: 10px;
      }
      .design-preview.compact {
        min-height: 120px;
      }
      .design-preview.compact img {
        max-height: 126px;
      }
      .studio-link {
        display: inline-flex;
        min-height: 38px;
        width: fit-content;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        background: var(--accent, #1d7f58);
        color: var(--accent-ink, #ffffff);
        padding: 0 12px;
        text-decoration: none;
        font-size: 13px;
        font-weight: 800;
      }
      button {
        min-height: 38px;
        padding: 0 12px;
        border: 1px solid var(--line, #d9ded8);
        border-radius: 6px;
        background: transparent;
        color: var(--danger, #a83a31);
        font: inherit;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }
      button:hover:not(:disabled), button:focus-visible {
        border-color: var(--danger, #a83a31);
        outline: none;
      }
      button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }
      .empty {
        display: grid;
        gap: 6px;
        padding: 18px;
      }
      .skeleton {
        height: 78px;
        border-radius: 8px;
        background: color-mix(in srgb, var(--line, #d9ded8) 65%, transparent);
      }
      .skeleton.short {
        width: 55%;
        height: 18px;
        margin-top: 10px;
      }
      @media (max-width: 520px) {
        .shell { padding: 12px; }
        .item { grid-template-columns: 60px minmax(0, 1fr); }
        .cart-line {
          grid-template-columns: 48px minmax(0, 1fr);
        }
        .design-ready {
          grid-template-columns: 1fr;
        }
        .cart-line button {
          grid-column: 1 / -1;
          width: 100%;
        }
      }
    `}</style>
  );
}
