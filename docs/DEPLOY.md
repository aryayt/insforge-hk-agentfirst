# Live Deployment

> Updated 2026-06-06 after the ChatGPT widget production fix. Both surfaces are live; root-domain DNS is still pending in Cloudflare.

## Live URLs

| Surface | URL | Host |
|---|---|---|
| **Web storefront** | https://app.agentfirst.shop | Vercel (static SPA, env baked at build) |
| **Web storefront fallback** | https://agentshop-web.vercel.app | Vercel |
| **Domain MCP connector** | https://app.agentfirst.shop/mcp | Vercel rewrite to InsForge compute |
| **MCP server** | https://agent-shop-mcp-787adbc2-92c6-4b37-a0a9-3e8d94123584.fly.dev/mcp | InsForge compute (Fly) |
| MCP health | https://agent-shop-mcp-787adbc2-92c6-4b37-a0a9-3e8d94123584.fly.dev/health | `200` |

Backend stays InsForge **HK-agentfirst-1** (`https://dsc7y62h.us-east.insforge.app`). Stripe is **test mode**; pay with `4242 4242 4242 4242`.

## Domain Status

`app.agentfirst.shop` is live and aliased to the current Vercel production deployment.

`agentfirst.shop` is registered in Vercel, but Cloudflare DNS does not publish the required apex record yet. Add this in Cloudflare DNS:

```text
Type: A
Name: @
Value: 76.76.21.21
Proxy: DNS only until Vercel verifies the certificate
```

For a dedicated MCP subdomain, add it to the same Vercel project and let Vercel proxy `/mcp` to InsForge compute:

```text
Type: A
Name: mcp
Value: 76.76.21.21
Proxy: DNS only until Vercel verifies the certificate
```

Do not point `mcp.agentfirst.shop` directly at the Fly endpoint unless InsForge/Fly is also configured to issue TLS for that custom hostname. Without that certificate, DNS may resolve but HTTPS will fail. Until the Vercel DNS is set, use `https://app.agentfirst.shop/mcp` in ChatGPT. It is verified and exposes the widget.

## Connect the MCP in ChatGPT

Settings → **Apps & Connectors** → **Advanced → Developer mode** on → **Create**:

- **Name:** AgentFirst Merch (Test)
- **MCP Server URL:** `https://app.agentfirst.shop/mcp`
- **Authentication:** No Auth

Then prompt: *"Use AgentFirst Merch: design a black classic tee for 'AstroAttire Orbit Club', size L, show me the design, add it to my cart, and give me a checkout link."* Pay with the test card → ask *"what's my order status?"* → **PAID**.

## Verified against live endpoints

- `https://app.agentfirst.shop` → 200 with current Vercel assets.
- `MCP_URL=https://app.agentfirst.shop/mcp bun apps/mcp/verify-widget.ts` → 8 tools, widget metadata on `list_products` and `get_cart`, one `ui://widget/agent-shop.html` resource.
- `MCP_URL=https://agent-shop-mcp-787adbc2-92c6-4b37-a0a9-3e8d94123584.fly.dev/mcp bun apps/mcp/verify-widget.ts` → same widget exposure direct to InsForge compute.
- `curl …/health` → 200.

## Gotchas hit (and fixed)

- **mcp-use binds `localhost` by default** → unreachable on Fly (HTTP 000). Fixed by setting `HOST=0.0.0.0` (now baked into the `Dockerfile` + set on the live service).
- **`MCP_PUBLIC_URL`** must point at the deployed endpoint or checkout builds a localhost success URL that InsForge rejects. Set via `compute update`.
- **Production widgets require `mcp-use build` before `NODE_ENV=production` runtime**. The Dockerfile builds the widget into `apps/mcp/dist` before setting `NODE_ENV=production`.
- **Web env is baked at build time** (Vite inlines `VITE_*`). The static deploy carries the backend URL + anon/publishable keys; rebuild to change them.

## Redeploy

```bash
# Web
vercel link --yes --project agentshop-web
vercel deploy --prod --yes

# MCP — remote build on Fly (needs flyctl on PATH; HOST=0.0.0.0 is in the Dockerfile)
# .env.deploy = INSFORGE_API_BASE_URL, INSFORGE_API_KEY, INSFORGE_ANON_KEY, MCP_PUBLIC_URL
bunx --bun @insforge/cli compute deploy . --name agent-shop-mcp --port 8788 --env-file .env.deploy
# Service id: 7802cdc9-954e-4352-8e4a-0b00a4da4d28
```
