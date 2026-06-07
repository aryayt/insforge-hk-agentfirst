# Live Deployment

> Updated 2026-06-06 after the ChatGPT widget production fix. Both surfaces are live; root-domain DNS is still pending in Cloudflare.

## Live URLs

| Surface | URL | Host |
|---|---|---|
| **Web storefront** | https://app.agentfirst.shop | Vercel (static SPA, env baked at build) |
| **Web storefront fallback** | https://agentshop-web.vercel.app | Vercel |
| **Domain MCP connector** | https://app.agentfirst.shop/mcp | Vercel rewrite to InsForge compute |
| **MCP server** | https://agent-shop-mcp-787adbc2-92c6-4b37-a0a9-3e8d94123584.fly.dev/mcp | InsForge compute (Fly, behind the Vercel proxy) |
| MCP health | https://app.agentfirst.shop/mcp | `200` over the public connector route |

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

Do not point `mcp.agentfirst.shop` directly at the Fly endpoint unless InsForge/Fly is also configured to issue TLS for that custom hostname. Without that certificate, DNS may resolve but HTTPS will fail. As of the latest verification, `mcp.agentfirst.shop` still points at Fly directly and fails TLS; use `https://app.agentfirst.shop/mcp` in ChatGPT/Codex. It is verified and exposes the widget.

## Connect the MCP in ChatGPT

Settings → **Apps & Connectors** → **Advanced → Developer mode** on → **Create**:

- **Name:** AgentFirst Merch (Test)
- **MCP Server URL:** `https://app.agentfirst.shop/mcp`
- **Authentication:** No Auth

Then prompt: *"Use AgentFirst Merch: design a black classic tee for 'AstroAttire Orbit Club', size L, show me the design, add it to my cart, and give me a checkout link."* Pay with the test card → ask *"what's my order status?"* → **PAID**.

## Connect the MCP in Codex

Codex supports remote streamable HTTP MCP servers. Add the live connector with:

```bash
codex mcp add agent-shop --url https://app.agentfirst.shop/mcp
```

Or edit `~/.codex/config.toml`:

```toml
[mcp_servers.agent-shop]
url = "https://app.agentfirst.shop/mcp"
```

Use `codex mcp remove agent-shop` before re-adding if you need to change the URL. The dedicated `mcp.agentfirst.shop` URL should not be used until Cloudflare points it at the Vercel proxy and Vercel has issued the certificate.

## Verified against live endpoints

- `https://app.agentfirst.shop` → 200 with current Vercel assets.
- `MCP_URL=https://app.agentfirst.shop/mcp bun apps/mcp/verify-widget.ts` → 9 tools, widget metadata on `list_products`, `create_design`, `analyze_brand`, and `get_cart`, one `ui://widget/agent-shop.html` resource.
- `curl -I https://app.agentfirst.shop/mcp` → 200 through the Vercel proxy to InsForge compute.
- `curl -I https://mcp.agentfirst.shop/mcp` → TLS failure until Cloudflare/Vercel/Fly custom-hostname config is fixed.

## Gotchas hit (and fixed)

- **mcp-use binds `localhost` by default** → unreachable on Fly (HTTP 000). Fixed by setting `HOST=0.0.0.0` (now baked into the `Dockerfile` + set on the live service).
- **`MCP_PUBLIC_URL`** must point at the deployed endpoint or checkout builds a localhost success URL that InsForge rejects. Set via `compute update`.
- **Production widgets require `mcp-use build` before `NODE_ENV=production` runtime**. The Dockerfile builds the widget into `apps/mcp/dist` before setting `NODE_ENV=production`.
- **Web env is baked at build time** (Vite inlines `VITE_*`). The static deploy carries the backend URL + anon/publishable keys; rebuild to change them.

## Redeploy

```bash
# Edge functions — required after image, checkout, brand, or fulfillment changes
bunx @insforge/cli functions deploy generate-design --file functions/generate-design.ts
bunx @insforge/cli functions deploy brand-design --file functions/brand-design.ts
bunx @insforge/cli functions deploy create-checkout --file functions/create-checkout.ts
bunx @insforge/cli functions deploy printful-mockup --file functions/printful-mockup.ts
bunx @insforge/cli functions deploy fulfill-order --file functions/fulfill-order.ts
bunx @insforge/cli functions deploy cancel-order --file functions/cancel-order.ts
bunx @insforge/cli functions deploy printful-webhook --file functions/printful-webhook.ts
bunx @insforge/cli functions deploy printful-catalog --file functions/printful-catalog.ts

# Web
vercel link --yes --project agentshop-web
vercel deploy --prod --yes

# MCP — remote build on Fly (needs flyctl on PATH; HOST=0.0.0.0 is in the Dockerfile)
# .env.deploy = INSFORGE_API_BASE_URL, INSFORGE_API_KEY, INSFORGE_ANON_KEY, MCP_PUBLIC_URL
bunx --bun @insforge/cli compute deploy . --name agent-shop-mcp --port 8788 --env-file .env.deploy
# Service id: 7802cdc9-954e-4352-8e4a-0b00a4da4d28
```
