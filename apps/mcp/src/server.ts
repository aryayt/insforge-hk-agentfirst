import { ShippingAddress } from "@app/shared";
import { createMCPServer } from "mcp-use/server";
import { addToCart, getCart } from "./cart";
import { getProduct, listProducts } from "./catalog";
import { createCheckout } from "./checkout";
import { createDesignFromUrl } from "./design";
import { getUserId } from "./identity";

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

// ── create_design (upload/url) ───────────────────────────────────────────────
// AI generation is a separate stream; this registers an existing image URL so the
// fulfillment path has a print file (Printful prints designs.image_url).
server.tool({
  name: "create_design",
  description:
    "Register an image as a printable design from its URL. Returns a design id to use with add_to_cart. (AI generation from a text prompt is coming separately.)",
  inputs: [
    {
      name: "imageUrl",
      type: "string",
      description: "Public URL of the artwork image to print.",
      required: true,
    },
    {
      name: "prompt",
      type: "string",
      description: "Optional text describing the design (stored for reference).",
      required: false,
    },
  ],
  annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  cb: async ({ imageUrl, prompt }: { imageUrl: string; prompt?: string }) => {
    const design = await createDesignFromUrl(getUserId(), imageUrl, prompt ?? null);
    return {
      content: [{ type: "text", text: `Design created: ${design.id}` }],
      structuredContent: { design },
    };
  },
});

// ── add_to_cart ──────────────────────────────────────────────────────────────
server.tool({
  name: "add_to_cart",
  description: "Add a configured product (a variant by SKU, optionally with a design) to the cart.",
  inputs: [
    { name: "sku", type: "string", description: "Variant SKU to add.", required: true },
    { name: "designId", type: "string", description: "Optional design id to print on it.", required: false },
    { name: "qty", type: "number", description: "Quantity (default 1).", required: false },
  ],
  annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  cb: async ({ sku, designId, qty }: { sku: string; designId?: string; qty?: number }) => {
    const cart = await addToCart(getUserId(), sku, designId ?? null, qty && qty > 0 ? qty : 1);
    const total = cart.items.reduce((s, i) => s + i.unitPriceCents * i.qty, 0);
    return {
      content: [
        {
          type: "text",
          text: `Added ${sku}. Cart now has ${cart.items.length} line(s), total ${money(total)}.`,
        },
      ],
      structuredContent: { cart },
    };
  },
});

// ── get_cart (read-only) ───────────────────────────────────────────────────────
server.tool({
  name: "get_cart",
  description: "Show the current cart contents and total.",
  inputs: [],
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  cb: async () => {
    const cart = await getCart(getUserId());
    if (!cart || cart.items.length === 0) {
      return { content: [{ type: "text", text: "Your cart is empty." }], structuredContent: { cart } };
    }
    const total = cart.items.reduce((s, i) => s + i.unitPriceCents * i.qty, 0);
    const lines = cart.items.map(
      (i) => `  - ${i.qty}× ${i.variantId}${i.designId ? ` (design ${i.designId})` : ""} — ${money(i.unitPriceCents * i.qty)}`,
    );
    return {
      content: [{ type: "text", text: `Cart:\n${lines.join("\n")}\nTotal: ${money(total)}` }],
      structuredContent: { cart },
    };
  },
});

// ── create_checkout ──────────────────────────────────────────────────────────
// Shipping is collected here (agent-first) and stored on the order, because InsForge's
// managed Checkout Session can't collect a Stripe shipping address; the fulfillment
// provider needs a recipient. Required fields: address1, city, country, zip.
server.tool({
  name: "create_checkout",
  description:
    "Create a Stripe (test) checkout link for the current cart and return the URL. Provide the shipping address so the order can be fulfilled after payment.",
  inputs: [
    { name: "name", type: "string", description: "Recipient full name.", required: false },
    { name: "address1", type: "string", description: "Street address line 1.", required: false },
    { name: "address2", type: "string", description: "Street address line 2.", required: false },
    { name: "city", type: "string", description: "City.", required: false },
    { name: "state", type: "string", description: "State/province code (e.g. CA).", required: false },
    { name: "country", type: "string", description: "ISO country code (e.g. US).", required: false },
    { name: "zip", type: "string", description: "Postal/ZIP code.", required: false },
    { name: "email", type: "string", description: "Recipient email for the receipt + shipping updates.", required: false },
  ],
  annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
  cb: async (a: {
    name?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    country?: string;
    zip?: string;
    email?: string;
  }) => {
    const shipping =
      a.address1 && a.city && a.country && a.zip
        ? ShippingAddress.parse({
            name: a.name ?? null,
            address1: a.address1,
            address2: a.address2 ?? null,
            city: a.city,
            state: a.state ?? null,
            country: a.country,
            zip: a.zip,
          })
        : null;
    const result = await createCheckout(getUserId(), { email: a.email ?? null, shipping });
    const shipNote = shipping ? "" : "\n(No shipping address provided — add one so the order can be fulfilled.)";
    return {
      content: [
        {
          type: "text",
          text: `Checkout ready for ${money(result.amountCents)}.\nPay here: ${result.url}${shipNote}`,
        },
      ],
      structuredContent: { orderId: result.orderId, url: result.url, amountCents: result.amountCents },
    };
  },
});

// Plain HTTP health check (used by Fly.io / compute health probes).
// mcp-use is hono-based: the handler receives a hono context `c` and returns `c.json(...)`.
server.get("/health", (c) => c.json({ status: "healthy", service: "agent-shop-mcp" }));

const PORT = Number(process.env.MCP_PORT ?? 8788);
server.listen(PORT).then(() => {
  console.log(`agent-shop MCP listening on http://localhost:${PORT}/mcp`);
  console.log(`inspector: http://localhost:${PORT}/inspector`);
});
