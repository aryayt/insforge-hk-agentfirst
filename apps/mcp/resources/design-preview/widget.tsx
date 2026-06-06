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
});

const inputSchema = z.object({
  prompt: z.string(),
  productType: z.string().optional(),
  label: z.string().optional(),
  sessionKey: z.string().optional(),
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
      resourceDomains: ["https://dsc7y62h.us-east.insforge.app"],
    },
  },
};

type Props = z.infer<typeof propsSchema>;
type ToolInput = z.infer<typeof inputSchema>;

export default function DesignPreviewWidget() {
  const { props, isPending, toolInput } = useWidget<Props, Record<string, never>, Props, Record<string, never>, ToolInput>();

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
  const productType = toolInput.productType === "mug" || toolInput.productType === "cap" ? toolInput.productType : "tshirt";

  return (
    <WidgetShell
      eyebrow="Design"
      title={design.label}
      subtitle="Print-ready artwork is saved and ready to attach to a specific SKU."
      badge={<Pill strong>{productType}</Pill>}
    >
      <div className="product-hero">
        <div className="preview-stage">
          <img src={design.imageUrl} alt={design.label} />
        </div>

        <div className="widget-card widget-stack">
          <div className="widget-inline">
            <Pill strong>Design saved</Pill>
            <Pill>{productType} ratio</Pill>
          </div>

          <div className="meta-grid">
            <div className="meta-block">
              <p className="meta-label">Design ID</p>
              <p className="meta-value mono">{design.id}</p>
            </div>
            <div className="meta-block">
              <p className="meta-label">Suggested surface</p>
              <p className="meta-value">{productType === "mug" ? "Wrapped mug panel" : "Front print area"}</p>
            </div>
          </div>

          <div className="widget-inline" style={{ justifyContent: "center" }}>
            <ProductIllustration type={productType} />
          </div>
        </div>
      </div>

      <div className="prompt-block">
        {toolInput.prompt}
      </div>

      <p className="footer-note">
        Next move: choose a SKU from <span className="mono">get_product</span>, then call <span className="mono">add_to_cart</span> with that SKU and <span className="mono">designId: "{design.id}"</span>.
      </p>
    </WidgetShell>
  );
}
