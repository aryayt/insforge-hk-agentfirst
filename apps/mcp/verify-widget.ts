/**
 * Verifies the ChatGPT-widget wiring over the real MCP transport: that tools carry
 * the openai/outputTemplate (or ui.resourceUri) _meta AND that resources/list
 * exposes the ui:// widget resource. Without BOTH, ChatGPT renders no iframe.
 *
 * Run against a prod-mode local server:
 *   cd apps/mcp && NODE_ENV=production MCP_BASE_URL=http://localhost:8788 \
 *     set -a; source ../../.env.local; set +a; bun src/server.ts &   # then:
 *   MCP_URL=http://localhost:8788/mcp bun verify-widget.ts
 * Or against the deploy: MCP_URL=https://<host>/mcp bun verify-widget.ts
 */
const URL = process.env.MCP_URL ?? `http://localhost:${process.env.MCP_PORT ?? 8788}/mcp`;
let sessionId: string | null = null;
let nextId = 1;

function extract(ct: string, raw: string, id: number): any {
  if (ct.includes("text/event-stream")) {
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      try { const m = JSON.parse(t.slice(5).trim()); if (m.id === id) return m; } catch {}
    }
    return null;
  }
  return JSON.parse(raw);
}
async function rpc(method: string, params?: unknown, notify = false): Promise<any> {
  const id = nextId++;
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const body = notify ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params };
  const res = await fetch(URL, { method: "POST", headers, body: JSON.stringify(body) });
  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;
  if (notify) return null;
  const raw = await res.text();
  const msg = extract(res.headers.get("content-type") ?? "", raw, id);
  if (!msg) { console.error(`✗ ${method}: no response`, raw.slice(0, 200)); process.exit(1); }
  if (msg.error) { console.error(`✗ ${method} error`, msg.error); process.exit(1); }
  return msg.result;
}

console.log(`probing ${URL}`);
const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "verify-widget", version: "1.0" } });
console.log(`✓ initialize → ${init?.serverInfo?.name} v${init?.serverInfo?.version}`);
console.log(`  serverInfo.description: ${(init?.serverInfo?.description ?? init?.instructions ?? "").slice(0, 70)}…`);
await rpc("notifications/initialized", undefined, true);

const tools = await rpc("tools/list");
const widgetKeys = ["openai/outputTemplate", "ui/resourceUri", "ui"];
let withWidget = 0;
for (const t of tools.tools as any[]) {
  const meta = t._meta ?? {};
  const has = Object.keys(meta).some((k) => k.includes("outputTemplate") || k.includes("resourceUri") || k.startsWith("openai/"));
  if (has) { withWidget++; console.log(`  • ${t.name}  _meta: ${Object.keys(meta).filter((k)=>k.startsWith("openai/")||k.includes("resource")).join(", ") || JSON.stringify(meta).slice(0,60)}`); }
}
console.log(`${withWidget > 0 ? "✓" : "✗"} tools with widget _meta: ${withWidget}/${(tools.tools as any[]).length}`);

const resources = await rpc("resources/list");
const list = (resources.resources ?? []) as any[];
console.log(`${list.length > 0 ? "✓" : "✗"} resources/list: ${list.length} resource(s)`);
for (const r of list) console.log(`  • ${r.uri}  (${r.mimeType})`);

if (withWidget === 0 || list.length === 0) {
  console.error("\n✗ WIDGET NOT EXPOSED — ChatGPT will render no iframe (text fallback).");
  process.exit(1);
}
console.log("\n✓ Widget is exposed. ChatGPT can render the iframe.");
