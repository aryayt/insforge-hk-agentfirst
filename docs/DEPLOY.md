# Live deployment

> Deployed 2026-06-06 from verified commit `59c64e1` (pre-widget). Both surfaces verified end-to-end against the live endpoints. Redeploy commands at the bottom.

## Live URLs

| Surface | URL | Host |
|---|---|---|
| **Web storefront** | https://agentshop-web.vercel.app | Vercel (static SPA, env baked at build) |
| **MCP server** | https://agent-shop-mcp-787adbc2-92c6-4b37-a0a9-3e8d94123584.fly.dev/mcp | InsForge compute (Fly) |
| MCP health | …fly.dev/health | → `200` |

Backend stays InsForge **HK-agentfirst-1** (`https://dsc7y62h.us-east.insforge.app`). Stripe is **test mode**; pay with `4242 4242 4242 4242`.

## Connect the MCP in ChatGPT

Settings → **Apps & Connectors** → **Advanced → Developer mode** on → **Create**:

- **Name:** AgentFirst Merch (Test)
- **MCP Server URL:** `https://agent-shop-mcp-787adbc2-92c6-4b37-a0a9-3e8d94123584.fly.dev/mcp`
- **Authentication:** No Auth

Then prompt: *"Use AgentFirst Merch: design a black classic tee for 'AstroAttire Orbit Club', size L, show me the design, add it to my cart, and give me a checkout link."* Pay with the test card → ask *"what's my order status?"* → **PAID**.

## Verified against live endpoints

- `curl …/health` → 200; `…/data`, `…/success`, `…/cart` on the web → 200 (SPA rewrite)
- `MCP_URL=https://…fly.dev/mcp bun apps/mcp/verify-mcp.ts` → full loop green (design → cart → $2 → Stripe session → status)

## Gotchas hit (and fixed)

- **mcp-use binds `localhost` by default** → unreachable on Fly (HTTP 000). Fixed by setting `HOST=0.0.0.0` (now baked into the `Dockerfile` + set on the live service).
- **`MCP_PUBLIC_URL`** must point at the deployed endpoint or checkout builds a localhost success URL that InsForge rejects. Set via `compute update`.
- **Web env is baked at build time** (Vite inlines `VITE_*`). The static deploy carries the backend URL + anon/publishable keys; rebuild to change them.

## Redeploy (after the widget work lands)

```bash
# Web — build with env, deploy prebuilt static (SPA rewrites via vercel.json)
set -a; source .env.local; set +a
bun --filter @app/web build
cp -R apps/web/dist/* /tmp/agentshop-web/ && cd /tmp/agentshop-web && vercel deploy --prod --yes

# MCP — remote build on Fly (needs flyctl on PATH; HOST=0.0.0.0 is in the Dockerfile)
#   .env.deploy = INSFORGE_API_BASE_URL, INSFORGE_API_KEY, INSFORGE_ANON_KEY
bunx @insforge/cli compute deploy . --name agent-shop-mcp --port 8788 --env-file .env.deploy
# Service id: 7802cdc9-954e-4352-8e4a-0b00a4da4d28
bunx @insforge/cli compute update <id> --env-set HOST=0.0.0.0 \
  --env-set MCP_PUBLIC_URL=https://agent-shop-mcp-787adbc2-92c6-4b37-a0a9-3e8d94123584.fly.dev
```
