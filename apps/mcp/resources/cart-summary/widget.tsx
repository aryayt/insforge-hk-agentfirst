import { useCallTool, useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import "../styles.css";
import { sessionCartItemSchema } from "../../widget-src/schemas";
import {
  PendingWidget,
  Pill,
  WidgetShell,
  formatMoney,
} from "../../widget-src/ui";

const propsSchema = z.object({
  cart: z.array(sessionCartItemSchema),
  totalCents: z.number().int().nonnegative(),
});

export const widgetMetadata: WidgetMetadata = {
  title: "Cart Summary",
  description: "Render the current guest cart with line items, design previews, and checkout-ready totals.",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    autoResize: true,
    prefersBorder: true,
    invoking: "Refreshing cart...",
    invoked: "Cart ready",
    csp: {
      resourceDomains: ["https://dsc7y62h.us-east.insforge.app", "https://app.agentfirst.shop"],
    },
  },
};

type Props = z.infer<typeof propsSchema>;

export default function CartSummaryWidget() {
  const { props, isPending } = useWidget<Props>({ cart: [], totalCents: 0 });
  const { callTool, isPending: removing } = useCallTool("remove_from_cart");
  const removeLine = callTool as (args: { lineNumber: number }) => void;

  if (isPending) {
    return (
      <PendingWidget
        eyebrow="Cart"
        title="Updating cart state"
        subtitle="Refreshing line items, design previews, and totals."
      />
    );
  }

  const cart = props.cart ?? [];
  const totalCents = props.totalCents ?? 0;
  const itemCount = cart.reduce((sum, line) => sum + line.qty, 0);

  if (cart.length === 0) {
    return (
      <WidgetShell
        eyebrow="Cart"
        title="Your cart is empty"
        subtitle="Browse the storefront, pick a SKU, and add a design or a blank product to get started."
        badge={<Pill strong>{formatMoney(0)}</Pill>}
      >
        <div className="widget-card">
          <p className="footer-note">
            Call <span className="mono">list_products</span> to browse, then <span className="mono">add_to_cart</span> with a SKU.
          </p>
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell
      eyebrow="Cart"
      title="Ready for checkout"
      subtitle={`${itemCount} item${itemCount === 1 ? "" : "s"} are staged for payment in this guest cart.`}
      badge={<Pill strong>{formatMoney(totalCents)}</Pill>}
    >
      <div className="cart-list">
        {cart.map((line, index) => {
          const lineTotal = line.qty * line.unitPriceCents;
          return (
            <article className="cart-row" key={`${line.sku}-${index}`}>
              <div className="cart-row-main">
                <div className="widget-inline" style={{ alignItems: "center", flexWrap: "nowrap" }}>
                  {line.designUrl ? (
                    <img className="design-thumb" src={line.designUrl} alt={line.designLabel ?? line.productLabel} />
                  ) : (
                    <div className="design-thumb" />
                  )}
                  <div className="widget-stack" style={{ gap: 4 }}>
                    <strong>{line.productLabel}</strong>
                    <span className="muted">
                      {line.designLabel ? `Design: ${line.designLabel}` : "Blank product"}
                    </span>
                  </div>
                </div>

                <div className="widget-stack" style={{ justifyItems: "end", gap: 4 }}>
                  <strong>{formatMoney(lineTotal)}</strong>
                  <span className="muted">
                    {line.qty} x {formatMoney(line.unitPriceCents)}
                  </span>
                </div>
              </div>

              <div className="widget-inline" style={{ justifyContent: "space-between" }}>
                <div className="widget-inline">
                  <span className="sku-chip mono">{line.sku}</span>
                  {line.designId ? <span className="sku-chip mono">{line.designId}</span> : null}
                </div>
                <button
                  type="button"
                  className="widget-pill"
                  onClick={() => removeLine({ lineNumber: index + 1 })}
                  disabled={removing}
                  aria-label={`Remove cart line ${index + 1}`}
                  style={{ cursor: "pointer" }}
                >
                  Remove
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="meta-grid">
        <div className="meta-block">
          <p className="meta-label">Line items</p>
          <p className="meta-value">{cart.length}</p>
        </div>
        <div className="meta-block">
          <p className="meta-label">Units</p>
          <p className="meta-value">{itemCount}</p>
        </div>
        <div className="meta-block">
          <p className="meta-label">Checkout total</p>
          <p className="meta-value">{formatMoney(totalCents)}</p>
        </div>
      </div>

      <p className="footer-note">
        When this looks right, call <span className="mono">create_checkout</span> for the Stripe test flow (card <span className="mono">4242 4242 4242 4242</span>).
      </p>
    </WidgetShell>
  );
}
