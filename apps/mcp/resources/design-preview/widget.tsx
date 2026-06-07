import { useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import "../styles.css";
import { designSchema } from "../../widget-src/schemas";
import {
  PendingWidget,
  Pill,
  ProductIllustration,
  WidgetShell,
} from "../../widget-src/ui";

const propsSchema = z.object({
  design: designSchema,
  studioUrl: z.string().optional(),
});

export const widgetMetadata: WidgetMetadata = {
  title: "Design Preview",
  description: "Render a newly generated design with its preview image and next-step guidance.",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    autoResize: true,
    prefersBorder: true,
    invoking: "Generating artwork...",
    invoked: "Design preview ready",
    csp: {
      resourceDomains: ["https://dsc7y62h.us-east.insforge.app", "https://app.agentfirst.shop"],
    },
  },
};

type Props = z.infer<typeof propsSchema>;

export default function DesignPreviewWidget() {
  const { props, isPending } = useWidget<Props>();

  if (isPending) {
    return (
      <PendingWidget
        eyebrow="Design"
        title="Composing preview art"
        subtitle="Generating transparent artwork and saving it to storage."
      />
    );
  }

  const design = props.design;

  return (
    <WidgetShell
      eyebrow="Design"
      title={design.label}
      subtitle="Print-ready artwork is saved and ready to attach to a specific SKU."
      badge={<Pill strong>transparent-ready</Pill>}
    >
      <div className="product-hero">
        <div className="preview-stage">
          <img src={design.imageUrl} alt={design.label} />
        </div>

        <div className="widget-card widget-stack">
          <div className="widget-inline">
            <Pill strong>Design saved</Pill>
            <Pill>print-ready</Pill>
          </div>

          <div className="meta-grid">
            <div className="meta-block">
              <p className="meta-label">Design ID</p>
              <p className="meta-value mono">{design.id}</p>
            </div>
            <div className="meta-block">
              <p className="meta-label">Surface</p>
              <p className="meta-value">Front print area</p>
            </div>
          </div>

          <div className="widget-inline" style={{ justifyContent: "center" }}>
            <ProductIllustration type="tshirt" />
          </div>

          {props.studioUrl ? (
            <a className="price-tag" href={props.studioUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              Open web studio
            </a>
          ) : null}
        </div>
      </div>

      {design.prompt ? <div className="prompt-block">{design.prompt}</div> : null}

      <p className="footer-note">
        Next move: choose a SKU from <span className="mono">get_product</span>, then call <span className="mono">add_to_cart</span> with that SKU and <span className="mono">designId: "{design.id}"</span>.
      </p>
    </WidgetShell>
  );
}
