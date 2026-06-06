import { createMCPServer } from "mcp-use/server";
import { getProduct, listProducts } from "./catalog";

const server = createMCPServer("agent-shop", {
  version: "0.1.0",
  description:
    "Shop for and design custom t-shirts, mugs, and caps — and check out with Stripe — without leaving the chat.",
});

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

// ── list_products (read-only) ──────────────────────────────────────────────
server.tool({
  name: "list_products",
  description:
    "List products available to buy and customize (t-shirts, mugs, caps), with base prices and variant counts.",
  inputs: [],
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  cb: async () => {
    const products = await listProducts();
    const lines = products.map(
      (p) =>
        `• ${p.name} (${p.slug}) — from ${money(p.basePriceCents)} · ${p.variants.length} variants`,
    );
    return {
      content: [
        {
          type: "text",
          text: products.length
            ? `Available products:\n${lines.join("\n")}`
            : "No products available.",
        },
      ],
      structuredContent: { products },
    };
  },
});

// ── get_product (read-only) ────────────────────────────────────────────────
server.tool({
  name: "get_product",
  description:
    "Get full details for one product by slug (e.g. classic-tee, ceramic-mug, dad-cap): description, base price, and all color/size variants.",
  inputs: [
    {
      name: "slug",
      type: "string",
      description: "Product slug, e.g. classic-tee | ceramic-mug | dad-cap",
      required: true,
    },
  ],
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  cb: async ({ slug }: { slug: string }) => {
    const product = await getProduct(slug);
    if (!product) {
      return { content: [{ type: "text", text: `No product with slug "${slug}".` }] };
    }
    const variantLines = product.variants.map(
      (v) =>
        `  - ${v.color}${v.size ? ` / ${v.size}` : ""} (${v.sku})${
          v.priceDeltaCents ? ` +${money(v.priceDeltaCents)}` : ""
        }`,
    );
    return {
      content: [
        {
          type: "text",
          text: `${product.name} — ${money(product.basePriceCents)}\n${product.description}\nVariants:\n${variantLines.join("\n")}`,
        },
      ],
      structuredContent: { product },
    };
  },
});

// ── Remaining flow — stubs owned by feature branches (see docs/PRODUCT.md) ──
const todo = (name: string) => ({
  content: [
    {
      type: "text" as const,
      text: `"${name}" isn't implemented yet. See docs/PRODUCT.md and docs/DECISIONS/0001-open-decisions.md.`,
    },
  ],
});

server.tool({
  name: "create_design",
  description:
    "Create a design for a product — generate artwork from a text prompt (AI) or use an uploaded/preset image. Returns a design id + preview image.",
  inputs: [
    {
      name: "prompt",
      type: "string",
      description: "Text description of artwork to generate (AI mode).",
      required: false,
    },
    {
      name: "imageUrl",
      type: "string",
      description: "URL of an uploaded/preset image to use instead of generating.",
      required: false,
    },
  ],
  annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  cb: async () => todo("create_design"),
});

server.tool({
  name: "add_to_cart",
  description: "Add a configured product (a variant, optionally with a design) to the cart.",
  inputs: [
    { name: "sku", type: "string", description: "Variant SKU to add.", required: true },
    { name: "designId", type: "string", description: "Optional design id to print on it.", required: false },
    { name: "qty", type: "number", description: "Quantity (default 1).", required: false },
  ],
  annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  cb: async () => todo("add_to_cart"),
});

server.tool({
  name: "get_cart",
  description: "Show the current cart contents and total.",
  inputs: [],
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  cb: async () => todo("get_cart"),
});

server.tool({
  name: "create_checkout",
  description: "Create a Stripe (test) checkout link for the current cart and return the URL.",
  inputs: [],
  annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
  cb: async () => todo("create_checkout"),
});

// Plain HTTP health check (used by Fly.io / compute health probes).
// mcp-use is hono-based: the handler receives a hono context `c` and returns `c.json(...)`.
server.get("/health", (c) => c.json({ status: "healthy", service: "agent-shop-mcp" }));

const PORT = Number(process.env.MCP_PORT ?? 8788);
server.listen(PORT).then(() => {
  console.log(`agent-shop MCP listening on http://localhost:${PORT}/mcp`);
  console.log(`inspector: http://localhost:${PORT}/inspector`);
});
