# insforge-hk-agentfirst

**Agent-first commerce.** Install this app inside ChatGPT (as an MCP connector) and let your AI agent shop on your behalf — browse products (t‑shirts, mugs, caps), **design your own**, and **check out with Stripe**, all without leaving the chat. A web storefront covers visual design + checkout.

- **Backend:** [InsForge](https://insforge.dev) — Postgres BaaS: database, auth, storage, AI gateway, **native Stripe payments**. Project **HK-agentfirst-1** · `https://dsc7y62h.us-east.insforge.app`
- **Agent surface:** `apps/mcp` — mcp-use server ChatGPT connects to (`/mcp`).
- **Web surface:** `apps/web` — Vite + React storefront / design studio / checkout.

> AI agents working in this repo: read **AGENTS.md** first.

## What works today (branch `integrate/design-studio`)

| Surface | Flow | Status |
|---|---|---|
| MCP (ChatGPT) | `list_products` widget -> `get_product` -> `analyze_brand` or `create_design` -> `add_to_cart` -> `get_cart` widget -> `remove_from_cart` if needed -> `create_checkout` (Stripe test) -> `get_order_status` | ✅ full loop + widgets |
| Web | company URL -> brand colors/logo/concepts -> photoreal tee placement -> transparent print file -> signed-in Stripe checkout -> order status | ✅ full loop |
| Backend | catalog + persisted designs + Stripe test prices + agent attribution + AI `generate-design` + URL-to-brand `brand-design` + Printful function path | ✅ migrations current |

> **Demo pricing:** the Classic Tee is set to a flat **$2.00** (all variants) so live test payments feel real without feeling expensive — see `scripts/seed/demo-pricing.ts`. (InsForge's checkout schema has no promo-code field, so the discount is baked into the Stripe price rather than applied via a coupon.)

Every order records **who and which agent** bought it: `orders.agent_source` (`openai-mcp` = ChatGPT, `web`, …), `agent_user_subject` (stable ChatGPT account id), `customer_name`, `email`. Designs persist to the `designs` table + storage bucket with the same provenance.

## Quickstart (each teammate, ~5 min)

```bash
git clone git@github.com:aryayt/insforge-hk-agentfirst.git && cd insforge-hk-agentfirst
git checkout integrate/design-studio

bun install
bunx @insforge/cli link --project-id 787adbc2-92c6-4b37-a0a9-3e8d94123584
cp .env.example .env.local          # then fill in keys ↓

bunx @insforge/cli db migrations list   # check what's applied
bunx @insforge/cli db migrations up --all

bun run mcp:dev    # MCP server  → http://localhost:8788/mcp (inspector: /inspector)
bun run web:dev    # storefront  → http://localhost:5173
```

### Keys — all centralized in InsForge 🔑

**Teammates need NO local API keys.** Everything lives as InsForge secrets (dashboard → Functions → Secrets): `GOOGLE_AI_API_KEY`, `OPENAI_API_KEY`, Stripe test keys — already set. AI image generation runs through the `generate-design` edge function which reads those secrets server-side.

One-time (already done if `bunx @insforge/cli functions list` shows them active):

```bash
bunx @insforge/cli functions deploy generate-design --file functions/generate-design.ts
bunx @insforge/cli functions deploy brand-design --file functions/brand-design.ts
bunx @insforge/cli functions deploy create-checkout --file functions/create-checkout.ts
```

Optional local-only fallback: `OPENROUTER_API_KEY` in `.env.local` (used only if the edge function is unreachable). Never commit keys.

## Test it

```bash
bun run typecheck                      # all workspaces (✓)
bun test apps/web                      # cart unit tests (7 pass)

# Headless end-to-end proofs (source env first: set -a; source .env.local; set +a)
cd apps/web && bun verify-flow.ts      # web path: catalog → guest order → Stripe session → paid
cd apps/web && bun verify-ai.ts        # AI path: SDK functions.invoke → generate-design → image URL
cd apps/mcp && bun verify-mcp.ts       # MCP loop over real transport (server must be running)

# One-time backend seeds (idempotent)
bun scripts/seed/stripe-prices.ts      # per-variant Stripe TEST prices
bun scripts/seed/demo-pricing.ts       # Classic Tee → flat $2.00 (DB + Stripe)
```

MCP loop in the inspector (`http://localhost:8788/inspector`):
`list_products` → `get_product slug=classic-tee` → `create_design prompt="retro moon base vector art"` → `add_to_cart sku=tee-blk-l designId=<id>` → `create_checkout` → open the URL → pay with **`4242 4242 4242 4242`** (any future expiry/CVC, any ZIP) → `get_order_status` → **PAID**.

### Where to see the data

- In-app: `http://localhost:5173/data` (live Postgres: catalog, orders).
- Dashboard: [insforge.dev](https://insforge.dev) → HK-agentfirst-1 → Database (`orders`, `order_items`, `designs`) · Storage (`designs` bucket, `guest/` prefix) · Payments (test transactions).
- Stripe sandbox dashboard for raw payment events.

## Connect to ChatGPT

See **[docs/DEPLOY.md](./docs/DEPLOY.md)** and **[docs/RUNBOOK-demo.md](./docs/RUNBOOK-demo.md)**. Current live connector URL: `https://app.agentfirst.shop/mcp` (Developer mode, No Auth). Direct compute URL: `https://agent-shop-mcp-787adbc2-92c6-4b37-a0a9-3e8d94123584.fly.dev/mcp`.

## Connect to Codex

Codex can connect to the same remote streamable HTTP MCP server:

```bash
codex mcp add agent-shop --url https://app.agentfirst.shop/mcp
```

Equivalent `~/.codex/config.toml` entry:

```toml
[mcp_servers.agent-shop]
url = "https://app.agentfirst.shop/mcp"
```

Use `https://app.agentfirst.shop/mcp` until `mcp.agentfirst.shop` is moved to the Vercel proxy and has a valid certificate.

## Repo map

```
apps/mcp/        MCP server (ChatGPT app surface)
apps/web/        Storefront / design studio / checkout
packages/shared/ Shared zod schemas + TS types
migrations/      SQL migrations (apply: bunx @insforge/cli db migrations up --all)
scripts/seed/    Catalog + Stripe price seeds
docs/            PRODUCT, ARCHITECTURE, BACKEND, RUNBOOK-demo, BRANCHING, DECISIONS/
skills/          Vendored agent skills (InsForge, mcp-use app builders, Impeccable)
```

## Docs

| Doc | What |
|-----|------|
| [`AGENTS.md`](./AGENTS.md) | Canonical context for AI agents — read this first |
| [`docs/PRODUCT.md`](./docs/PRODUCT.md) | What we're building + user stories |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | System design + data flow |
| [`docs/BACKEND.md`](./docs/BACKEND.md) | InsForge schema, buckets, payments, demo posture |
| [`docs/RUNBOOK-demo.md`](./docs/RUNBOOK-demo.md) | End-to-end demo path (local → deploy → ChatGPT) |
| [`docs/DESIGN-AUDIT.md`](./docs/DESIGN-AUDIT.md) | Impeccable audit notes and follow-up design backlog |
| [`docs/BRANCHING.md`](./docs/BRANCHING.md) | Branch + worktree workflow for the team |
| [`docs/DECISIONS/`](./docs/DECISIONS/) | Architecture Decision Records |

## Roadmap (GitHub issues)

#1 MCP Apps-SDK widgets: catalog/cart/design/brand done · ~~#2 AI design edge function~~ ✅ done · #3 MCP OAuth (real users instead of guest) · #4 webhook-backed fulfillment hardening · #5 production deploy.

Current UX direction: the web app owns the detailed design studio because it has enough room for brand intake, drag placement, scaling, background cleanup, Printful mockups, and print-file preview. The ChatGPT app stays compact: product browsing, URL-to-brand concepts, generated-design previews, cart review, and deep links into the web studio rather than a full desktop editor inside the chat pane.

## Team

3 humans + AI agents, working in parallel via git worktrees. See [`docs/BRANCHING.md`](./docs/BRANCHING.md) before you push. Never commit keys — `.env.local` only.
