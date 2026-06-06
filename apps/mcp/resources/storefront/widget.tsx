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
  products: z.array(productSchema),
});

export const widgetMetadata: WidgetMetadata = {
  title: "Catalog Storefront",
  description: "Render the product catalog as a visual storefront for the chat buyer.",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    autoResize: true,
    prefersBorder: true,
    invoking: "Opening the storefront...",
    invoked: "Storefront ready",
  },
};

type Props = z.infer<typeof propsSchema>;

export default function StorefrontWidget() {
  const { props, isPending } = useWidget<Props>();

  if (isPending) {
    return (
      <PendingWidget
        eyebrow="Catalog"
        title="Agent-first storefront"
        subtitle="Loading products, prices, and variant coverage."
      />
    );
  }

  const products = props.products ?? [];
  const variantCount = products.reduce((sum, product) => sum + product.variants.length, 0);
  const minPriceCents = products.length
    ? Math.min(...products.map((product) => product.basePriceCents))
    : 0;

  return (
    <WidgetShell
      eyebrow="Catalog"
      title="Agent-first storefront"
      subtitle={`${products.length} products and ${variantCount} buyable variants are ready for design, carting, and checkout.`}
      badge={<PriceTag cents={minPriceCents} />}
    >
      <div className="widget-inline">
        <Pill strong>{products.length} products live</Pill>
        <Pill>{variantCount} variants mirrored to Stripe</Pill>
        <Pill>Guest-friendly cart flow</Pill>
      </div>

      {products.length ? (
        <div className="widget-grid catalog">
          {products.map((product) => {
          const uniqueColors = [...new Set(product.variants.map((variant) => variant.color))].slice(0, 4);
          const uniqueSizes = [...new Set(product.variants.map((variant) => variant.size).filter(Boolean))].slice(0, 5);

          return (
            <article key={product.id} className="widget-card widget-stack">
              <div className="preview-stage">
                <ProductIllustration type={product.type} />
              </div>

              <div className="widget-stack">
                <div className="widget-inline" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 22 }}>{product.name}</h2>
                    <p className="muted" style={{ margin: "6px 0 0" }}>
                      {product.description}
                    </p>
                  </div>
                  <span className="sku-chip mono">{product.slug}</span>
                </div>

                <div className="widget-inline">
                  <Pill strong>{formatMoney(product.basePriceCents)}</Pill>
                  <Pill>{product.variants.length} variants</Pill>
                  <Pill>{product.type}</Pill>
                </div>

                <div className="widget-stack">
                  <p className="section-title">Popular colors</p>
                  <div className="swatch-row">
                    {uniqueColors.map((color) => (
                      <span className="swatch" key={`${product.id}-${color}`}>
                        <span
                          className="swatch-dot"
                          style={{ backgroundColor: colorToken(color) }}
                        />
                        {color}
                      </span>
                    ))}
                  </div>
                </div>

                {uniqueSizes.length > 0 ? (
                  <div className="widget-stack">
                    <p className="section-title">Size coverage</p>
                    <div className="swatch-row">
                      {uniqueSizes.map((size) => (
                        <span className="widget-pill" key={`${product.id}-${size}`}>
                          {size}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </article>
          );
          })}
        </div>
      ) : (
        <div className="widget-card">
          <p className="footer-note">No products are active right now. Re-seed the catalog or check the backend data source.</p>
        </div>
      )}

      <p className="footer-note">
        Next move: call <span className="mono">get_product</span> with a slug to inspect exact SKUs and option combinations before you create a design.
      </p>
    </WidgetShell>
  );
}
