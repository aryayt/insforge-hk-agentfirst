# insforge-hk-agentfirst

**Agent-first commerce.** Install this app inside ChatGPT (as an MCP connector) and let your AI agent shop on your behalf — browse products (t‑shirts, mugs, caps), **design your own**, and **check out with Stripe**, all without leaving the chat. A web storefront covers visual design + checkout.

- **Backend:** [InsForge](https://insforge.dev) — Postgres BaaS: database, auth, storage, AI gateway, **native Stripe payments**. Project **HK-agentfirst-1** · `https://dsc7y62h.us-east.insforge.app`
- **Agent surface:** `apps/mcp` — mcp-use server ChatGPT connects to (`/mcp`).
- **Web surface:** `apps/web` — Vite + React storefront / design studio / checkout.

> AI agents working in this repo: read **AGENTS.md** first.

## What works today (branch `feat/web-storefront`)

| Surface | Flow | Status |
|---|---|---|
| MCP (ChatGPT) | `list_products` → `get_product` → `create_design` (image import or AI prompt) → `add_to_cart` → `get_cart` → `create_checkout` (Stripe test) → `get_order_status` | ✅ full loop |
| Web | browse → design studio (text/preset/upload) → cart → anonymous Stripe checkout → orders + `/data` live DB view | ✅ (AI button needs a key, see below) |
| Backend | catalog + guest orders + persisted designs + Stripe test prices + agent attribution | ✅ after migrations |

Every order records **who and which agent** bought it: `orders.agent_source` (`openai-mcp` = ChatGPT, `web`, …), `agent_user_subject` (stable ChatGPT account id), `customer_name`, `email`. Designs persist to the `designs` table + storage bucket with the same provenance.

## Quickstart (each teammate, ~5 min)

```bash
git clone git@github.com:aryayt/insforge-hk-agentfirst.git && cd insforge-hk-agentfirst
git checkout feat/web-storefront

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

One-time (already done if `bunx @insforge/cli functions list` shows it active):

```bash
bunx @insforge/cli functions deploy generate-design --file functions/generate-design.ts
```

Optional local-only fallback: `OPENROUTER_API_KEY` in `.env.local` (used only if the edge function is unreachable). Never commit keys.

## Test it

```bash
bun run typecheck                      # all workspaces
bun test apps/web                      # cart unit tests
bun apps/web/verify-flow.ts            # headless e2e: catalog → order → Stripe session → paid
bun scripts/seed/stripe-prices.ts      # one-time: per-variant Stripe TEST prices (done already)
```

MCP loop in the inspector (`http://localhost:8788/inspector`):
`list_products` → `get_product slug=classic-tee` → `create_design prompt="retro moon base vector art"` → `add_to_cart sku=tee-blk-l designId=<id>` → `create_checkout` → open the URL → pay with **`4242 4242 4242 4242`** (any future expiry/CVC, any ZIP) → `get_order_status` → **PAID**.

### Where to see the data

- In-app: `http://localhost:5173/data` (live Postgres: catalog, orders).
- Dashboard: [insforge.dev](https://insforge.dev) → HK-agentfirst-1 → Database (`orders`, `order_items`, `designs`) · Storage (`designs` bucket, `guest/` prefix) · Payments (test transactions).
- Stripe sandbox dashboard for raw payment events.

## Connect to ChatGPT

See **[docs/RUNBOOK-demo.md](./docs/RUNBOOK-demo.md)** — deploy with `bunx @insforge/cli compute deploy . --name agent-shop-mcp --port 8788 --env-file .env.deploy`, then add `https://<endpoint>/mcp` as a ChatGPT connector (Developer mode, No Auth).

## Repo map

```
apps/mcp/        MCP server (ChatGPT app surface)
apps/web/        Storefront / design studio / checkout
packages/shared/ Shared zod schemas + TS types
migrations/      SQL migrations (apply: bunx @insforge/cli db migrations up --all)
scripts/seed/    Catalog + Stripe price seeds
docs/            PRODUCT, ARCHITECTURE, BACKEND, RUNBOOK-demo, BRANCHING, DECISIONS/
skills/          Vendored InsForge agent skills (insforge, insforge-cli, -debug, -integrations)
```

## Docs

| Doc | What |
|-----|------|
| [`AGENTS.md`](./AGENTS.md) | Canonical context for AI agents — read this first |
| [`docs/PRODUCT.md`](./docs/PRODUCT.md) | What we're building + user stories |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | System design + data flow |
| [`docs/BACKEND.md`](./docs/BACKEND.md) | InsForge schema, buckets, payments, demo posture |
| [`docs/RUNBOOK-demo.md`](./docs/RUNBOOK-demo.md) | End-to-end demo path (local → deploy → ChatGPT) |
| [`docs/BRANCHING.md`](./docs/BRANCHING.md) | Branch + worktree workflow for the team |
| [`docs/DECISIONS/`](./docs/DECISIONS/) | Architecture Decision Records |

## Roadmap (GitHub issues)

#1 MCP Apps-SDK widgets (in-chat product/design UI) · #2 AI design edge function (web AI button) · #3 MCP OAuth (real users instead of guest) · #4 webhook-backed fulfillment (replace success-redirect paid-marking) · #5 production deploy.

Next UX work queued behind those: show the print placement zone on the product preview, real image upload to Storage from the web studio, lightweight background-removal for uploaded art.

## Team

3 humans + AI agents, working in parallel via git worktrees. See [`docs/BRANCHING.md`](./docs/BRANCHING.md) before you push. Never commit keys — `.env.local` only.
