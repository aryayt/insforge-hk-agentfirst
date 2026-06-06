import { createMCPServer } from "mcp-use/server";
import { aspectRatioForProduct, type ProductType } from "@app/shared";
import { getProduct, getVariantBySku, listProducts } from "./catalog";
import { createDesign, getDesign } from "./design";
import { addLine, cartTotalCents, clearCart, getCart } from "./cart";
import { anon } from "./insforge";

const server = createMCPServer("agent-shop", {
  version: "0.1.0",
  description:
    "Shop for and design custom t-shirts, mugs, and caps — and check out with Stripe — without leaving the chat.",
});

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

// Where Stripe sends the buyer after checkout. The agent surface has no browser
// origin, so these are configurable; default to the web studio.
const WEB_URL = process.env.WEB_APP_URL ?? "http://localhost:5173";
const SUCCESS_URL = process.env.CHECKOUT_SUCCESS_URL ?? `${WEB_URL}/?checkout=success`;
const CANCEL_URL = process.env.CHECKOUT_CANCEL_URL ?? `${WEB_URL}/?checkout=canceled`;

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

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });

// ── create_design ───────────────────────────────────────────────────────────
server.tool({
  name: "create_design",
  description:
    "Generate print-ready artwork from a text prompt and save it as a design. Returns a design id (pass it to add_to_cart) and a preview image URL. Artwork is generated on a transparent background, sized for the chosen product's print area.",
  inputs: [
    {
      name: "prompt",
      type: "string",
      description: "What to put on the product, e.g. 'bold geometric fox head, two-tone'.",
      required: true,
    },
    {
      name: "productType",
      type: "string",
      description: "tshirt | mug | cap — sets the artwork aspect ratio to fill that print area. Default tshirt.",
      required: false,
    },
    {
      name: "label",
      type: "string",
      description: "Optional short name for the design.",
      required: false,
    },
    {
      name: "sessionKey",
      type: "string",
      description: "Optional opaque id grouping this conversation's designs.",
      required: false,
    },
  ],
  annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
  cb: async ({
    prompt,
    productType,
    label,
    sessionKey,
  }: {
    prompt: string;
    productType?: string;
    label?: string;
    sessionKey?: string;
  }) => {
    const type: ProductType =
      productType === "mug" || productType === "cap" ? productType : "tshirt";
    try {
      const design = await createDesign({
        prompt,
        aspectRatio: aspectRatioForProduct(type),
        label,
        sessionKey,
      });
      return {
        content: [
          {
            type: "text",
            text: `Created design "${design.label}" (id: ${design.id}). Preview: ${design.imageUrl}\nAdd it to a product with add_to_cart(sku, designId: "${design.id}").`,
          },
        ],
        structuredContent: { design },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "design generation failed";
      return text(`Couldn't create that design: ${msg}`);
    }
  },
});

// ── add_to_cart ───────────────────────────────────────────────────────────────
server.tool({
  name: "add_to_cart",
  description:
    "Add a product variant (optionally printed with a design) to the cart. Returns a cartId — pass it to add_to_cart again, get_cart, and create_checkout.",
  inputs: [
    { name: "sku", type: "string", description: "Variant SKU (from list_products / get_product).", required: true },
    { name: "designId", type: "string", description: "Optional design id from create_design.", required: false },
    { name: "qty", type: "number", description: "Quantity (default 1).", required: false },
    { name: "cartId", type: "string", description: "Existing cart id; omit to start a new cart.", required: false },
  ],
  annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  cb: async ({
    sku,
    designId,
    qty,
    cartId,
  }: {
    sku: string;
    designId?: string;
    qty?: number;
    cartId?: string;
  }) => {
    const resolved = await getVariantBySku(sku);
    if (!resolved) return text(`No variant with SKU "${sku}". Use list_products to see SKUs.`);

    let designLabel: string | null = null;
    let designPreviewUrl: string | null = null;
    if (designId) {
      const design = await getDesign(designId);
      if (!design) return text(`No design with id "${designId}". Create one with create_design first.`);
      designLabel = design.label;
      designPreviewUrl = design.imageUrl;
    }

    const quantity = Math.max(1, Math.min(99, Math.floor(qty ?? 1)));
    const cart = addLine(cartId, {
      sku,
      label: resolved.label,
      designId: designId ?? null,
      designLabel,
      designPreviewUrl,
      qty: quantity,
      unitPriceCents: resolved.unitPriceCents,
      stripePriceId: resolved.variant.stripePriceId,
    });

    const lines = cart.lines.map(
      (l) =>
        `• ${l.qty}× ${l.label}${l.designLabel ? ` + design "${l.designLabel}"` : ""} — ${money(l.unitPriceCents * l.qty)}`,
    );
    return {
      content: [
        {
          type: "text",
          text: `Added ${quantity}× ${resolved.label}${designLabel ? ` with design "${designLabel}"` : ""}.\n\nCart (id: ${cart.id}):\n${lines.join("\n")}\nTotal: ${money(cartTotalCents(cart))}`,
        },
      ],
      structuredContent: { cartId: cart.id, cart },
    };
  },
});

// ── get_cart ──────────────────────────────────────────────────────────────────
server.tool({
  name: "get_cart",
  description: "Show a cart's contents and total.",
  inputs: [{ name: "cartId", type: "string", description: "Cart id from add_to_cart.", required: true }],
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  cb: async ({ cartId }: { cartId: string }) => {
    const cart = getCart(cartId);
    if (!cart || cart.lines.length === 0) return text("That cart is empty. Add items with add_to_cart.");
    const lines = cart.lines.map(
      (l) =>
        `• ${l.qty}× ${l.label}${l.designLabel ? ` + design "${l.designLabel}"` : ""} — ${money(l.unitPriceCents * l.qty)}`,
    );
    return {
      content: [
        { type: "text", text: `Cart (id: ${cart.id}):\n${lines.join("\n")}\nTotal: ${money(cartTotalCents(cart))}` },
      ],
      structuredContent: { cart },
    };
  },
});

// ── create_checkout ─────────────────────────────────────────────────────────
server.tool({
  name: "create_checkout",
  description:
    "Create a Stripe (test mode) checkout link for a cart and return the URL for the buyer to pay. The design artwork travels with the order.",
  inputs: [
    { name: "cartId", type: "string", description: "Cart id from add_to_cart.", required: true },
    { name: "email", type: "string", description: "Buyer email for the receipt (optional).", required: false },
  ],
  annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
  cb: async ({ cartId, email }: { cartId: string; email?: string }) => {
    if (!anon) {
      return text(
        "Checkout is unavailable: set INSFORGE_ANON_KEY (or VITE_INSFORGE_ANON_KEY) so the server can create a Stripe session.",
      );
    }
    const cart = getCart(cartId);
    if (!cart || cart.lines.length === 0) return text("That cart is empty — add items before checking out.");

    const missing = cart.lines.filter((l) => !l.stripePriceId);
    if (missing.length) {
      return text(`These items aren't purchasable yet (no Stripe price): ${missing.map((l) => l.sku).join(", ")}.`);
    }

    const lineItems = cart.lines.map((l) => ({ stripePriceId: l.stripePriceId!, quantity: l.qty }));
    // The design preview URL is short, so it's safe in Stripe metadata — this is
    // the artwork fulfillment prints. (Stripe metadata: ≤50 keys, ≤500 chars each.)
    const firstDesign = cart.lines.find((l) => l.designPreviewUrl);
    const metadata: Record<string, string> = {
      agent_source: "mcp",
      cart_id: cart.id,
      item_count: String(cart.lines.reduce((n, l) => n + l.qty, 0)),
      summary: cart.lines
        .map((l) => `${l.qty}x ${l.label}${l.designLabel ? ` (${l.designLabel})` : ""}`)
        .join("; ")
        .slice(0, 480),
      ...(firstDesign?.designId ? { design_id: firstDesign.designId } : {}),
      ...(firstDesign?.designPreviewUrl ? { design_preview_url: firstDesign.designPreviewUrl } : {}),
    };

    const { data, error } = await anon.payments.createCheckoutSession("test", {
      mode: "payment",
      lineItems,
      successUrl: SUCCESS_URL,
      cancelUrl: CANCEL_URL,
      customerEmail: email || null,
      metadata,
    });
    if (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return text(`Couldn't create checkout: ${msg}`);
    }
    const url = data?.checkoutSession?.url;
    if (!url) return text("Checkout session did not return a URL.");

    clearCart(cart.id);
    return {
      content: [
        { type: "text", text: `Checkout ready (${money(cartTotalCents(cart))}). Pay here:\n${url}` },
      ],
      structuredContent: { url, amountCents: cartTotalCents(cart) },
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
