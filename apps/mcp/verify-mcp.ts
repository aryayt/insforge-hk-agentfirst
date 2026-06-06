/**
 * End-to-end check of the MCP loop over the real Streamable HTTP transport —
 * the exact path ChatGPT uses. Drives: initialize → list_products →
 * create_design (AI) → add_to_cart → get_cart → create_checkout → get_order_status.
 *
 * Run (server must be up on MCP_PORT):
 *   cd apps/mcp && set -a; source ../../.env.local; set +a; bun verify-mcp.ts
 */
const PORT = process.env.MCP_PORT ?? "8788";
const URL = `http://localhost:${PORT}/mcp`;

let sessionId: string | null = null;
let nextId = 1;

const ok = (m: string) => console.log(`✓ ${m}`);
const die = (m: string, extra?: unknown): never => {
  console.error(`✗ ${m}`, extra ?? "");
  process.exit(1);
};

/** Parse an MCP response body that may be JSON or an SSE stream. */
function extractResult(contentType: string, raw: string, id: number): any {
  if (contentType.includes("text/event-stream")) {
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      try {
        const msg = JSON.parse(t.slice(5).trim());
        if (msg.id === id) return msg;
      } catch {
        /* skip non-JSON data lines */
      }
    }
    return null;
  }
  return JSON.parse(raw);
}

async function rpc(method: string, params?: unknown, notify = false): Promise<any> {
  const id = nextId++;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const body = notify
    ? { jsonrpc: "2.0", method, params }
    : { jsonrpc: "2.0", id, method, params };

  const res = await fetch(URL, { method: "POST", headers, body: JSON.stringify(body) });
  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;
  if (notify) return null;

  const raw = await res.text();
  const msg = extractResult(res.headers.get("content-type") ?? "", raw, id);
  if (!msg) die(`${method}: no response matched id ${id}`, raw.slice(0, 300));
  if (msg.error) die(`${method} error`, msg.error);
  return msg.result;
}

const callTool = (name: string, args: Record<string, unknown> = {}) =>
  rpc("tools/call", { name, arguments: args });

// 1. initialize
const init = await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "verify-mcp", version: "1.0.0" },
});
ok(`initialize → ${init?.serverInfo?.name} v${init?.serverInfo?.version} (session ${sessionId?.slice(0, 8)}…)`);
await rpc("notifications/initialized", undefined, true);

// 2. tools/list
const tools = await rpc("tools/list");
const names = (tools.tools as Array<{ name: string }>).map((t) => t.name);
const expected = ["list_products", "get_product", "create_design", "add_to_cart", "get_cart", "create_checkout", "get_order_status"];
const missing = expected.filter((n) => !names.includes(n));
if (missing.length) die(`tools/list missing: ${missing.join(", ")}`, names);
ok(`tools/list → ${names.length} tools`);

// 3. list_products
const lp = await callTool("list_products");
if (lp.isError) die("list_products errored", lp.content);
ok(`list_products → ${lp.structuredContent?.products?.length ?? "?"} products`);

// 4. create_design (AI generation via deployed function)
const cd = await callTool("create_design", { prompt: "retro space moon base, clean vector art", label: "Orbit Club" });
if (cd.isError) die("create_design errored", cd.content);
const designId = cd.structuredContent?.design?.id;
if (!designId) die("create_design returned no design id", cd.structuredContent);
ok(`create_design → ${designId.slice(0, 8)}… (${cd.structuredContent?.design?.imageUrl?.slice(0, 50)}…)`);

// 5. add_to_cart (classic-tee, now $2)
const atc = await callTool("add_to_cart", { sku: "tee-blk-l", designId, qty: 1 });
if (atc.isError) die("add_to_cart errored", atc.content);
ok(`add_to_cart → total ${atc.structuredContent?.totalCents}c`);

// 6. get_cart
const gc = await callTool("get_cart");
if (gc.isError) die("get_cart errored", gc.content);
const total = gc.structuredContent?.totalCents;
if (total !== 200) die(`get_cart total expected 200c ($2.00 demo price), got ${total}c`, gc.structuredContent);
ok(`get_cart → ${total}c ($2.00 demo price confirmed)`);

// 7. create_checkout
const co = await callTool("create_checkout", { email: "verify-mcp@agentshop.test", name: "MCP Verifier" });
if (co.isError) die("create_checkout errored", co.content);
const { checkoutUrl, orderId } = co.structuredContent ?? {};
if (!checkoutUrl?.includes("checkout.stripe.com")) die("create_checkout returned non-Stripe url", co.structuredContent);
ok(`create_checkout → order ${orderId?.slice(0, 8)}… → ${checkoutUrl.slice(0, 45)}…`);

// 8. get_order_status
const os = await callTool("get_order_status", { orderId });
if (os.isError) die("get_order_status errored", os.content);
ok(`get_order_status → ${os.structuredContent?.order?.status?.toUpperCase()} ${os.structuredContent?.order?.amountCents}c`);

console.log(`\nMCP loop OK. orderId=${orderId}`);
