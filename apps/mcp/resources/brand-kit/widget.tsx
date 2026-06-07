import { useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import "../styles.css";
import { brandSchema, designSchema } from "../../widget-src/schemas";
import {
  PendingWidget,
  Pill,
  WidgetShell,
} from "../../widget-src/ui";

const propsSchema = z.object({
  brand: brandSchema,
  designs: z.array(designSchema),
  studioUrl: z.string().optional(),
});

export const widgetMetadata: WidgetMetadata = {
  title: "Brand Kit",
  description: "Render a company's extracted brand signals and the merch design concepts generated from them.",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    autoResize: true,
    prefersBorder: true,
    invoking: "Reading brand and creating merch concepts...",
    invoked: "Brand concepts ready",
    csp: {
      resourceDomains: ["https://dsc7y62h.us-east.insforge.app", "https://app.agentfirst.shop"],
    },
  },
};

type Props = z.infer<typeof propsSchema>;

export default function BrandKitWidget() {
  const { props, isPending } = useWidget<Props>();

  if (isPending) {
    return (
      <PendingWidget
        eyebrow="Brand"
        title="Reading the brand"
        subtitle="Extracting colors and a logo, then generating merch concepts."
      />
    );
  }

  const { brand, designs } = props;
  const colors = brand.colors ?? [];

  return (
    <WidgetShell
      eyebrow="Brand kit"
      title={brand.name}
      subtitle={`${designs.length} merch concept${designs.length === 1 ? "" : "s"} generated from ${brand.domain ?? brand.name}'s public brand signals.`}
      badge={brand.logoUrl ? <img className="design-thumb" src={brand.logoUrl} alt={`${brand.name} logo`} /> : undefined}
    >
      <div className="widget-card widget-stack">
        <p className="section-title">Extracted brand colors</p>
        <div className="swatch-row">
          {colors.length ? (
            colors.slice(0, 8).map((color) => (
              <span className="swatch" key={color}>
                <span className="swatch-dot" style={{ backgroundColor: color }} />
                {color}
              </span>
            ))
          ) : (
            <span className="muted">No distinct brand colors detected.</span>
          )}
        </div>
      </div>

      <div className="widget-grid catalog">
        {designs.map((design) => (
          <article className="widget-card widget-stack" key={design.id}>
            <div className="preview-stage" style={{ minHeight: 160 }}>
              <img src={design.imageUrl} alt={design.label} />
            </div>
            <div className="widget-stack" style={{ gap: 6 }}>
              <strong>{design.label}</strong>
              <span className="sku-chip mono">designId: {design.id}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="widget-inline">
        <Pill strong>Original artwork</Pill>
        <Pill>transparent print-ready</Pill>
      </div>

      <p className="footer-note">
        Pick a concept, then call <span className="mono">add_to_cart</span> with a SKU and that <span className="mono">designId</span> to print it.
      </p>
    </WidgetShell>
  );
}
