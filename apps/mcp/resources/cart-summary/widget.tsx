import { useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import "../styles.css";
import { sessionCartSchema } from "../../widget-src/schemas";
import {
  PendingWidget,
  Pill,
  WidgetShell,
  formatMoney,
  totalLines,
} from "../../widget-src/ui";

const propsSchema = z.object({
  cartId: z.string().optional(),
  cart: sessionCartSchema,
  totalCents: z.number().int().nonnegative().optional(),
});

const inputSchema = z.object({
  sku: z.string().optional(),
  designId: z.string().optional(),
  qty: z.number().optional(),
  cartId: z.string().optional(),
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
      resourceDomains: ["https://dsc7y62h.us-east.insforge.app"],
    },
  },
};

type Props = z.infer<typeof propsSchema>;
type ToolInput = z.infer<typeof inputSchema>;

export default function CartSummaryWidget() {
  const { props, isPending, toolInput } = useWidget<Props, Record<string, never>, Props, Record<string, never>, ToolInput>();

  if (isPending) {
    return (
      <PendingWidget
        eyebrow="Cart"
        title="Updating cart state"
        subtitle="Refreshing line items, design previews, and totals."
      />
    );
  }

  const cart = props.cart;
  const totalCents = props.totalCents ?? totalLines(cart.lines);
  const itemCount = cart.lines.reduce((sum, line) => sum + line.qty, 0);

  return (
    <WidgetShell
      eyebrow="Cart"
      title="Ready for checkout"
      subtitle={`${itemCount} item${itemCount === 1 ? "" : "s"} are staged for payment in this guest cart.`}
      badge={<Pill strong>{formatMoney(totalCents)}</Pill>}
    >
      <div className="widget-inline">
        <Pill strong>Cart ID</Pill>
        <span className="sku-chip mono">{props.cartId ?? cart.id}</span>
        {toolInput.sku ? <Pill>Updated via {toolInput.sku}</Pill> : null}
      </div>

      <div className="cart-list">
        {cart.lines.map((line) => {
          const lineTotal = line.qty * line.unitPriceCents;
          const touched = toolInput.sku === line.sku;

          return (
            <article className="cart-row" key={`${line.sku}-${line.designId ?? "plain"}`}>
              <div className="cart-row-main">
                <div className="widget-inline" style={{ alignItems: "center", flexWrap: "nowrap" }}>
                  {line.designPreviewUrl ? (
                    <img className="design-thumb" src={line.designPreviewUrl} alt={line.designLabel ?? line.label} />
                  ) : (
                    <div className="design-thumb" />
                  )}
                  <div className="widget-stack" style={{ gap: 4 }}>
                    <strong>{line.label}</strong>
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

              <div className="widget-inline">
                <span className="sku-chip mono">{line.sku}</span>
                {line.designId ? <span className="sku-chip mono">{line.designId}</span> : null}
                {touched ? <Pill strong>Just updated</Pill> : null}
              </div>
            </article>
          );
        })}
      </div>

      <div className="meta-grid">
        <div className="meta-block">
          <p className="meta-label">Line items</p>
          <p className="meta-value">{cart.lines.length}</p>
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
        When this looks right, call <span className="mono">create_checkout</span> with <span className="mono">cartId: "{props.cartId ?? cart.id}"</span> to generate the Stripe test payment link.
      </p>
    </WidgetShell>
  );
}
