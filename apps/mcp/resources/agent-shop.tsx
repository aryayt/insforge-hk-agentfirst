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
]);

export const widgetMetadata: WidgetMetadata = {
  title: "Agent Shop",
  description: "Browse products and review the current cart for the agent-first shop.",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    prefersBorder: true,
    autoResize: true,
    widgetDescription:
      "Shows the current Agent Shop catalog or cart. Products include slugs and SKUs the model can use in follow-up tool calls.",
    csp: {
      resourceDomains: ["https://dsc7y62h.us-east.insforge.app"],
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
              <h2>{data.mode === "catalog" ? "Catalog" : "Cart"}</h2>
            </div>
            <span className="status">{data.mode === "catalog" ? `${data.products.length} items` : money(data.totalCents)}</span>
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
      .item, .cart-line, .empty {
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
      .cart-line img {
        width: 52px;
        height: 52px;
        object-fit: cover;
        border: 1px solid var(--line, #d9ded8);
        border-radius: 8px;
        background: var(--panel-alt, #edf1ed);
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
        .cart-line button {
          grid-column: 1 / -1;
          width: 100%;
        }
      }
    `}</style>
  );
}
