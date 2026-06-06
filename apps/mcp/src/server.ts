import { createMCPServer } from "mcp-use/server";
import { aspectRatioForProduct, type ProductType } from "@app/shared";
import { getProduct, getVariantBySku, listProducts } from "./catalog";
import { createDesign, getDesign } from "./design";
import { addLine, cartTotalCents, clearCart, getCart } from "./cart";
import { anon } from "./insforge";
import {
  printfulFromEnv,
  resolvePrintfulVariant,
  type OrderItem,
  type OrderRecipient,
} from "./printful";

const server = createMCPServer("agent-shop", {
  version: "0.1.0",
  description:
    "Shop for and design custom t-shirts, mugs, and caps, then place a real print-on-demand order (fulfilled by Printful) — all without leaving the chat.",
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

// ── place_order ───────────────────────────────────────────────────────────────
// Real fulfillment: sends the cart + the design artwork to Printful and (by
// default) CONFIRMS it — which charges the connected Printful account and starts
// production. This is the "pay on the spot" step; there is no Printful sandbox, so
// confirm:true spends real money. destructiveHint makes hosts surface a consent
// prompt before the model runs it.
server.tool({
  name: "place_order",
  description:
    "Place a REAL print-on-demand order with Printful for everything in a cart, printing each item's design, and ship it to the given address. By default this CONFIRMS the order, which CHARGES the connected Printful account immediately (real money) and starts production. Pass confirm:false to create an unconfirmed draft (priced, not charged) to preview cost first. Requires every cart item to have a design.",
  inputs: [
    { name: "cartId", type: "string", description: "Cart id from add_to_cart.", required: true },
    { name: "name", type: "string", description: "Recipient full name.", required: true },
    { name: "address1", type: "string", description: "Street address line 1.", required: true },
    { name: "city", type: "string", description: "City.", required: true },
    { name: "country_code", type: "string", description: "ISO country code, e.g. US, GB, DE.", required: true },
    { name: "zip", type: "string", description: "ZIP / postal code.", required: true },
    { name: "state_code", type: "string", description: "State/province code (required for US/CA/AU), e.g. CA.", required: false },
    { name: "address2", type: "string", description: "Street address line 2 (apt, suite).", required: false },
    { name: "email", type: "string", description: "Recipient email for shipping updates.", required: false },
    { name: "phone", type: "string", description: "Recipient phone (some carriers require it).", required: false },
    {
      name: "confirm",
      type: "boolean",
      description:
        "true (default) = confirm now and CHARGE the Printful account (real money). false = create an unconfirmed draft to preview cost without charging.",
      required: false,
    },
  ],
  annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: true },
  cb: async (args: {
    cartId: string;
    name: string;
    address1: string;
    city: string;
    country_code: string;
    zip: string;
    state_code?: string;
    address2?: string;
    email?: string;
    phone?: string;
    confirm?: boolean;
  }) => {
    const client = printfulFromEnv();
    if (!client) {
      return text(
        "Fulfillment is unavailable: set PRINTFUL_API_KEY in .env.local so the server can place Printful orders.",
      );
    }

    const cart = getCart(args.cartId);
    if (!cart || cart.lines.length === 0) return text("That cart is empty — add items before ordering.");

    // Resolve every line to a Printful order item (variant + print file). Any line
    // without a design, or a product/colour we don't map to Printful, fails clearly.
    const items: OrderItem[] = [];
    for (const line of cart.lines) {
      if (!line.designPreviewUrl) {
        return text(`"${line.label}" has no design — only printed items can be fulfilled. Add one with create_design.`);
      }
      if (line.designPreviewUrl.startsWith("data:")) {
        return text(`"${line.label}" has a non-public design URL; Printful needs an https URL it can fetch.`);
      }
      const resolved = await getVariantBySku(line.sku);
      if (!resolved) return text(`Couldn't resolve SKU "${line.sku}".`);
      try {
        const { variantId, placement } = resolvePrintfulVariant(
          resolved.product.type,
          resolved.variant.color.toLowerCase(),
          resolved.variant.size,
        );
        items.push({
          variant_id: variantId,
          quantity: line.qty,
          files: [{ type: placement, url: line.designPreviewUrl }],
        });
      } catch (e) {
        return text(`Can't fulfill "${line.label}": ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const recipient: OrderRecipient = {
      name: args.name,
      address1: args.address1,
      city: args.city,
      country_code: args.country_code,
      zip: args.zip,
      ...(args.state_code ? { state_code: args.state_code } : {}),
      ...(args.address2 ? { address2: args.address2 } : {}),
      ...(args.email ? { email: args.email } : {}),
      ...(args.phone ? { phone: args.phone } : {}),
    };

    const willCharge = args.confirm !== false; // default true (real charge)
    try {
      // Always create a draft first so we have an inspectable order + Printful's
      // own cost breakdown, then confirm (the actual charge) only when asked.
      const draft = await client.createOrder({ recipient, items }, { confirm: false });
      const c = draft.costs;
      const shipTo = `${recipient.name}, ${recipient.address1}, ${recipient.city} ${recipient.zip} ${recipient.country_code}`;

      if (!willCharge) {
        return {
          content: [
            {
              type: "text",
              text:
                `Draft order #${draft.id} created — NOT charged.\n` +
                `Printful cost: ${c.total} ${c.currency} (subtotal ${c.subtotal} + shipping ${c.shipping} + tax ${c.tax}).\n` +
                `Ships to: ${shipTo}\n\n` +
                `To pay & start production (REAL charge), call place_order again with confirm:true.`,
            },
          ],
          structuredContent: { orderId: draft.id, status: draft.status, confirmed: false, costs: c },
        };
      }

      const final = await client.confirmOrder(draft.id);
      clearCart(cart.id);
      const fc = final.costs;
      return {
        content: [
          {
            type: "text",
            text:
              `✅ Order #${final.id} placed and CHARGED to the Printful account (status: ${final.status}).\n` +
              `Paid: ${fc.total} ${fc.currency} (subtotal ${fc.subtotal} + shipping ${fc.shipping} + tax ${fc.tax}).\n` +
              `Ships to: ${shipTo}\n` +
              `Track status later with the Printful order id ${final.id}.`,
          },
        ],
        structuredContent: { orderId: final.id, status: final.status, confirmed: true, costs: fc },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return text(
        `Couldn't place the order: ${msg}\n` +
          `(A real charge requires a billing method / wallet balance on the Printful account.)`,
      );
    }
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
