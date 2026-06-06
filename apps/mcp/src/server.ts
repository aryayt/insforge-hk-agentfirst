import { createMCPServer } from "mcp-use/server";
import { getProduct, listProducts } from "./catalog";
import { generateArtwork, importArtwork, persistDesign } from "./designs";
import {
  createGuestCheckout,
  findVariantBySku,
  getOrder,
  markPaidFromSuccessRedirect,
} from "./orders";
import { callerInfo, cartTotalCents, getSession, sessionKey } from "./session";

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

// ── Design + cart + checkout (guest demo flow; see docs/PRODUCT.md) ────────
const fail = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true as const,
});
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

server.tool({
  name: "create_design",
  description:
    "Create print artwork for a product. Pass an imageUrl (e.g. an image the user already generated in this chat) OR a text prompt to generate artwork server-side. Stores the artwork durably and returns a design id + preview URL. Keep designs original — no brand logos or copyrighted characters.",
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
      description:
        "http(s) or data:image/* URL of existing artwork to use instead of generating.",
      required: false,
    },
    {
      name: "label",
      type: "string",
      description: "Short human label for this design, e.g. \"AstroAttire Orbit Club\".",
      required: false,
    },
  ],
  annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
  cb: async (
    { prompt, imageUrl, label }: { prompt?: string; imageUrl?: string; label?: string },
    ctx: unknown,
  ) => {
    if (!prompt && !imageUrl) return fail("Pass a prompt (to generate) or an imageUrl (to import).");
    try {
      const art = imageUrl ? await importArtwork(imageUrl) : await generateArtwork(prompt!);
      const caller = callerInfo(ctx);
      const session = getSession(caller.sessionKey);
      const persisted = await persistDesign({
        source: imageUrl ? "upload" : "ai",
        prompt,
        label: label ?? prompt?.slice(0, 60) ?? "Imported design",
        art,
        sessionKey: caller.sessionKey,
        agentSource: caller.agentSource,
      });
      const design = {
        id: persisted.id,
        label: persisted.label,
        prompt,
        imageUrl: persisted.imageUrl,
        imageKey: persisted.imageKey,
        createdAt: Date.now(),
      };
      session.designs.set(design.id, design);
      return {
        content: [
          {
            type: "text" as const,
            text: `Design ready: "${design.label}"\nid: ${design.id}\npreview: ${design.imageUrl}\nUse add_to_cart with a variant SKU and this designId.`,
          },
        ],
        structuredContent: { design },
      };
    } catch (e) {
      return fail(`create_design failed: ${errMsg(e)}`);
    }
  },
});

server.tool({
  name: "add_to_cart",
  description:
    "Add a product variant (by SKU, from get_product) to the cart, optionally printed with a design from create_design.",
  inputs: [
    { name: "sku", type: "string", description: "Variant SKU to add.", required: true },
    { name: "designId", type: "string", description: "Optional design id to print on it.", required: false },
    { name: "qty", type: "number", description: "Quantity (default 1).", required: false },
  ],
  annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  cb: async (
    { sku, designId, qty }: { sku: string; designId?: string; qty?: number },
    ctx: unknown,
  ) => {
    try {
      const session = getSession(sessionKey(ctx));
      const variant = await findVariantBySku(sku);
      if (!variant) return fail(`No variant with SKU "${sku}". Use get_product to list SKUs.`);
      const quantity = Math.max(1, Math.floor(qty ?? 1));
      const design = designId ? session.designs.get(designId) : undefined;
      if (designId && !design) return fail(`No design "${designId}" in this session. Run create_design first.`);

      session.cart.push({
        variantId: variant.variantId,
        sku: variant.sku,
        productLabel: variant.productLabel,
        stripePriceId: variant.stripePriceId,
        designId: design?.id,
        designLabel: design?.label,
        designUrl: design?.imageUrl,
        qty: quantity,
        unitPriceCents: variant.unitPriceCents,
      });
      const total = cartTotalCents(session.cart);
      return {
        content: [
          {
            type: "text" as const,
            text: `Added ${quantity}× ${variant.productLabel}${design ? ` with design "${design.label}"` : ""} — ${money(variant.unitPriceCents)} each.\nCart total: ${money(total)} (${session.cart.length} line${session.cart.length === 1 ? "" : "s"}). Use create_checkout when ready.`,
          },
        ],
        structuredContent: { cart: session.cart, totalCents: total },
      };
    } catch (e) {
      return fail(`add_to_cart failed: ${errMsg(e)}`);
    }
  },
});

server.tool({
  name: "get_cart",
  description: "Show the current cart contents and total.",
  inputs: [],
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  cb: async (_args: Record<string, never>, ctx: unknown) => {
    const session = getSession(sessionKey(ctx));
    if (session.cart.length === 0) {
      return { content: [{ type: "text" as const, text: "Cart is empty. Use list_products to browse." }] };
    }
    const lines = session.cart.map(
      (i, n) =>
        `${n + 1}. ${i.qty}× ${i.productLabel}${i.designLabel ? ` · design "${i.designLabel}"` : ""} — ${money(i.unitPriceCents * i.qty)}`,
    );
    const total = cartTotalCents(session.cart);
    return {
      content: [
        { type: "text" as const, text: `Cart:\n${lines.join("\n")}\nTotal: ${money(total)}` },
      ],
      structuredContent: { cart: session.cart, totalCents: total },
    };
  },
});

server.tool({
  name: "create_checkout",
  description:
    "Create a Stripe (test mode) checkout link for the current cart. Returns a URL the user opens to pay; the order is recorded immediately and marked paid after payment.",
  inputs: [
    {
      name: "email",
      type: "string",
      description: "Optional customer email for the Stripe receipt.",
      required: false,
    },
    {
      name: "name",
      type: "string",
      description: "Optional customer name (ask the user; stored on the order).",
      required: false,
    },
  ],
  annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
  cb: async ({ email, name }: { email?: string; name?: string }, ctx: unknown) => {
    try {
      const caller = callerInfo(ctx);
      const session = getSession(caller.sessionKey);
      const result = await createGuestCheckout(session.cart, {
        email,
        customerName: name,
        agentSource: caller.agentSource,
        userSubject: caller.userSubject,
        locale: caller.locale,
      });
      session.lastOrderId = result.orderId;
      session.cart = [];
      return {
        content: [
          {
            type: "text" as const,
            text: `Checkout ready — total ${money(result.amountCents)} (Stripe TEST mode; card 4242 4242 4242 4242, any future expiry/CVC).\nPay here: ${result.checkoutUrl}\nOrder id: ${result.orderId} — check progress with get_order_status.`,
          },
        ],
        structuredContent: { orderId: result.orderId, checkoutUrl: result.checkoutUrl, amountCents: result.amountCents },
      };
    } catch (e) {
      return fail(`create_checkout failed: ${errMsg(e)}`);
    }
  },
});

server.tool({
  name: "get_order_status",
  description:
    "Check an order's status (pending → paid → fulfilled). Defaults to this session's most recent order if no orderId given.",
  inputs: [
    { name: "orderId", type: "string", description: "Order id from create_checkout.", required: false },
  ],
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  cb: async ({ orderId }: { orderId?: string }, ctx: unknown) => {
    try {
      const session = getSession(sessionKey(ctx));
      const id = orderId ?? session.lastOrderId;
      if (!id) return fail("No orderId given and no order in this session yet.");
      const order = await getOrder(id);
      if (!order) return fail(`No order "${id}".`);
      const lines = order.items.map(
        (i) => `- ${i.qty}× ${i.productLabel ?? "item"}${i.designLabel ? ` · "${i.designLabel}"` : ""}`,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `Order ${order.id}\nStatus: ${order.status.toUpperCase()} — ${money(order.amountCents)}\n${lines.join("\n")}`,
          },
        ],
        structuredContent: { order },
      };
    } catch (e) {
      return fail(`get_order_status failed: ${errMsg(e)}`);
    }
  },
});

// Plain HTTP health check (used by Fly.io / compute health probes).
// mcp-use is hono-based: the handler receives a hono context `c` and returns `c.json(...)`.
server.get("/health", (c) => c.json({ status: "healthy", service: "agent-shop-mcp" }));

// ── Stripe redirect landing pages ───────────────────────────────────────────
const page = (title: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;background:#0b0d12;color:#e8eaf0;margin:0}
main{max-width:28rem;padding:2rem;text-align:center}h1{font-size:1.4rem}p{color:#9aa3b2;line-height:1.5}code{background:#1a1f2b;padding:.15rem .4rem;border-radius:4px}</style>
</head><body><main><h1>${title}</h1>${body}<p>You can close this tab and return to the chat.</p></main></body></html>`;

server.get("/checkout/success", async (c) => {
  const orderId = c.req.query("order");
  const token = c.req.query("t");
  if (!orderId || !token) return c.html(page("Missing order reference", "<p>This link is incomplete.</p>"), 400);
  try {
    const ok = await markPaidFromSuccessRedirect(orderId, token);
    if (!ok) return c.html(page("Order not found", "<p>We couldn't match this payment to an order.</p>"), 404);
    return c.html(
      page(
        "Payment received 🎉",
        `<p>Your order <code>${orderId}</code> is <strong>paid</strong>. Ask your agent for <code>get_order_status</code> to follow fulfillment.</p>`,
      ),
    );
  } catch {
    return c.html(page("Something went wrong", "<p>Payment likely succeeded, but we couldn't update the order. Check get_order_status.</p>"), 500);
  }
});

server.get("/checkout/cancel", (c) =>
  c.html(page("Checkout cancelled", "<p>No charge was made. Your cart was already submitted as a pending order — ask your agent to create a new checkout if you change your mind.</p>")),
);

const PORT = Number(process.env.MCP_PORT ?? 8788);
server.listen(PORT).then(() => {
  console.log(`agent-shop MCP listening on http://localhost:${PORT}/mcp`);
  console.log(`inspector: http://localhost:${PORT}/inspector`);
});
