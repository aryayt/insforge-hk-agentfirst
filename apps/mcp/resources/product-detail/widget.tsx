import { useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import "../styles.css";
import { productSchema } from "../../widget-src/schemas";
import {
  PendingWidget,
  Pill,
  PriceTag,
  ProductIllustration,
  WidgetShell,
  colorToken,
  formatMoney,
} from "../../widget-src/ui";

const propsSchema = z.object({
  product: productSchema,
});

const inputSchema = z.object({
  slug: z.string(),
});

export const widgetMetadata: WidgetMetadata = {
  title: "Product Detail",
  description: "Render one product with its description, variants, SKUs, and option coverage.",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    autoResize: true,
    prefersBorder: true,
    invoking: "Loading product details...",
    invoked: "Product details ready",
  },
};

type Props = z.infer<typeof propsSchema>;
type ToolInput = z.infer<typeof inputSchema>;

export default function ProductDetailWidget() {
  const { props, isPending, toolInput } = useWidget<Props, Record<string, never>, Props, Record<string, never>, ToolInput>();

  if (isPending) {
    return (
      <PendingWidget
        eyebrow="Product"
        title="Loading variant map"
        subtitle="Gathering SKUs, colors, and pricing details."
      />
    );
  }

  const product = props.product;
  const variantGroups = new Map<
    string,
    Array<{
      size: string | null;
      sku: string;
      priceDeltaCents: number;
    }>
  >();

  for (const variant of product.variants) {
    const rows = variantGroups.get(variant.color) ?? [];
    rows.push({
      size: variant.size,
      sku: variant.sku,
      priceDeltaCents: variant.priceDeltaCents,
    });
    variantGroups.set(variant.color, rows);
  }

  const sizeCount = new Set(product.variants.map((variant) => variant.size).filter(Boolean)).size;

  return (
    <WidgetShell
      eyebrow="Product"
      title={product.name}
      subtitle={product.description}
      badge={<PriceTag cents={product.basePriceCents} />}
    >
      <div className="product-hero">
        <div className="preview-stage">
          <ProductIllustration type={product.type} />
        </div>

        <div className="widget-card widget-stack">
          <div className="widget-inline">
            <Pill strong>{product.variants.length} variants</Pill>
            <Pill>{variantGroups.size} colors</Pill>
            {sizeCount > 0 ? <Pill>{sizeCount} sizes</Pill> : <Pill>One-size layout</Pill>}
          </div>

          <div className="meta-grid">
            <div className="meta-block">
              <p className="meta-label">Slug</p>
              <p className="meta-value mono">{toolInput.slug ?? product.slug}</p>
            </div>
            <div className="meta-block">
              <p className="meta-label">Base price</p>
              <p className="meta-value">{formatMoney(product.basePriceCents)}</p>
            </div>
            <div className="meta-block">
              <p className="meta-label">Design mode</p>
              <p className="meta-value">{product.type === "mug" ? "Wrap art" : "Front placement"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="widget-card widget-stack">
        <p className="section-title">Variant breakdown</p>
        <div className="variant-grid">
          {[...variantGroups.entries()].map(([color, variants]) => (
            <div className="variant-row" key={color}>
              <div className="variant-row-main">
                <div className="widget-stack" style={{ gap: 8 }}>
                  <span className="swatch">
                    <span className="swatch-dot" style={{ backgroundColor: colorToken(color) }} />
                    {color}
                  </span>
                  <span className="muted">
                    {variants.length} SKU{variants.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="widget-inline">
                  {variants.map((variant) => (
                    <span className="widget-pill" key={variant.sku}>
                      {variant.size ?? "OS"}
                      {variant.priceDeltaCents > 0 ? ` +${formatMoney(variant.priceDeltaCents)}` : ""}
                    </span>
                  ))}
                </div>
              </div>

              <div className="swatch-row">
                {variants.map((variant) => (
                  <span className="sku-chip mono" key={`${color}-${variant.sku}`}>
                    {variant.sku}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="footer-note">
        Best next step: call <span className="mono">create_design</span> with <span className="mono">productType: "{product.type}"</span> so the art fits this print area cleanly.
      </p>
    </WidgetShell>
  );
}
