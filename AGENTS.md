# AGENTS.md

<!-- INSFORGE:START -->
## InsForge backend

This project uses [InsForge](https://insforge.dev): an all-in-one, open-source Postgres-based backend (BaaS) that gives this app a database, authentication, file storage, edge functions, realtime, an AI model gateway, and payments through one platform.

- **Project:** **HK-agentfirst-1** (API base `https://dsc7y62h.us-east.insforge.app`)
- **Skills:** these InsForge skills are installed for supported coding agents. Reach for them before implementing any InsForge feature instead of guessing the API:
  - `insforge`: app code with the `@insforge/sdk` client (database CRUD, auth, storage, edge functions, realtime, AI, email, and Stripe payments).
  - `insforge-cli`: backend and infrastructure via the `insforge` CLI (projects, SQL, migrations, RLS policies, storage buckets, functions, secrets, payment setup, schedules, deploys).
  - `insforge-debug`: diagnosing failures (SDK/HTTP errors, RLS denials, auth and OAuth issues) and running security or performance audits.
  - `insforge-integrations`: wiring external auth providers (Clerk, Auth0, WorkOS, Better Auth, etc.) for JWT-based RLS, or the OKX x402 payment facilitator.
  - `find-skills`: discovering additional skills on demand.
- **Credentials:** app code reads keys from `.env.local`; the CLI reads `.insforge/project.json`. Never hardcode or commit keys.

Key patterns:

- Database inserts take an array: `insert([{ ... }])`.
- Reference users with `auth.users(id)`; use `auth.uid()` in RLS policies.
- For storage uploads, persist both the returned `url` and `key`.
<!-- INSFORGE:END -->

## What we're building

**Agent-first commerce.** This app is installed inside ChatGPT as an MCP connector. A user's AI agent uses our MCP tools to browse a small catalog (t‑shirts, mugs, caps), **design custom products**, build a cart, and **pay via Stripe** — all inside the chat. The web app is a secondary surface for visual design preview, checkout, and admin.

The MCP server is the headline. Treat it as a product, not plumbing: tool names, descriptions, and argument schemas are the UX that the model sees.

## Stack & non-negotiables

- **Runtime/PM:** `bun` (>=1.3). Never `npm`/`npx`/`yarn`. Use `bunx` for one-off CLIs.
- **Language:** TypeScript everywhere. ESM (`"type": "module"`).
- **Backend:** InsForge only — do not stand up a parallel Postgres/Express. Use `@insforge/sdk` in app code and the `insforge` CLI for infra.
- **MCP:** `mcp-use` (hono-based server SDK + Apps SDK widget support). Streamable HTTP at `/mcp`; ChatGPT connects remotely. `createMCPServer(...).tool({...})`, `.uiResource({...})` for widgets, `.listen(port)`.
- **Payments:** Stripe **test mode**, wired through InsForge `payments`. Never put live keys anywhere.
- **Secrets:** app code reads `.env.local`; CLI reads `.insforge/project.json`. Both are gitignored. **Never hardcode or commit keys.** Add new vars to `.env.example` (no values).

## Repo map

```
apps/mcp/        MCP server (ChatGPT app surface)
apps/web/        Vite + React storefront / design studio / checkout
packages/shared/ Shared zod schemas + TS types (catalog, design, order)
functions/       InsForge edge functions (Stripe webhook, fulfillment)
docs/            PRODUCT, ARCHITECTURE, BACKEND, BRANCHING, DECISIONS/
```

## Run it

```bash
bun install
bun run mcp:dev        # MCP server → http://localhost:8788/mcp  (health: /health, inspector: /inspector)
bun run typecheck      # all workspaces
```

The MCP server reads InsForge creds from env (`INSFORGE_API_BASE_URL` + `INSFORGE_API_KEY`) and falls back to the linked `.insforge/project.json` for local dev. Run via the workspace scripts (`bun run mcp:dev`) so the cwd is `apps/mcp` — mcp-use resolves its widget toolchain from there.

## Current state (2026-06-06)

- **Backend (live):** 7 tables + RLS, guest+agent commerce model (`designs`/`orders`/`order_items` allow `user_id = null`, with provenance + denormalized label columns — see `migrations/20260606190000_guest-agent-commerce.sql`), `designs` storage bucket (public), catalog seeded with Stripe test prices on every variant.
- **AI design (live):** `generate-design` edge function — moderates the prompt, generates transparent print-ready art at the product's aspect ratio (Gemini → OpenAI fallback), uploads to Storage, inserts a guest `designs` row. Model keys are InsForge secrets. Supports `source: upload` for user art too. It is the single source of truth for design creation — both surfaces call it.
- **Web (working):** `apps/web` design studio generates via the edge function, persists the design, and carries `design_id` + the short `design_preview_url` into Stripe checkout (anon client).
- **MCP (working):** all tools wired — `list_products`, `get_product`, `create_design` (→ edge function), `add_to_cart`/`get_cart` (per-conversation session cart), `create_checkout` (Stripe test via the anon-key client; design + agent provenance in metadata).
- **Not yet:** Stripe webhook → order-row fulfillment (orders schema is ready; checkout metadata carries everything a webhook needs), authenticated (non-guest) flows, Fly deploy, realistic garment mockup, design variations.

## Before you build (checklist)

1. Read `docs/PRODUCT.md` and `docs/ARCHITECTURE.md`.
2. Check `docs/DECISIONS/` — some choices are still open; don't silently pick one.
3. Reach for the installed InsForge skills (`insforge`, `insforge-cli`, `insforge-debug`, `insforge-integrations`) **before** guessing any InsForge API.
4. Work on a branch in your own worktree — never commit to `main`. See `docs/BRANCHING.md`.
5. Add any new env var to `.env.example`. Keep `docs/BACKEND.md` in sync with schema changes.

## How agents coordinate

- One branch per stream, one worktree per branch (`scripts/wt.sh`). Prefix by area: `mcp/`, `web/`, `backend/`, `shared/`, `docs/`.
- Small PRs into `main`. Conventional commits (`feat(mcp): ...`, `fix(web): ...`).
- If you change the catalog/order/design schema, update `packages/shared` first — it's the contract both surfaces depend on.

