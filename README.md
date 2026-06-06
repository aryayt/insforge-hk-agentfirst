# insforge-hk-agentfirst

**Agent-first commerce.** Install this app inside ChatGPT (as an MCP connector) and let your AI agent shop on your behalf — browse products (t‑shirts, mugs, caps), **design your own**, and **check out with Stripe**, all without leaving the chat.

- **Backend:** [InsForge](https://insforge.dev) — Postgres BaaS providing database, auth, storage, edge functions, an AI model gateway, and **native Stripe payments**.
- **Agent surface:** a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that ChatGPT connects to over OAuth (or a dev tunnel for local testing).
- **Web surface:** a thin storefront / design-studio / checkout UI built on the InsForge JS SDK.

> Project: **HK-agentfirst-1** · API base `https://dsc7y62h.us-east.insforge.app`

## Repo map

```
apps/
  mcp/        MCP server — the ChatGPT "app" surface (tools: browse, customize, design, cart, checkout)
  web/        Storefront / design studio / checkout (Vite + React + @insforge/sdk)
packages/
  shared/     Shared TS types + zod schemas (catalog, design spec, order)
functions/    InsForge edge functions (Stripe webhook handler, fulfillment hooks)
docs/         Product spec, architecture, backend plan, branching workflow, decisions (ADRs)
AGENTS.md     Read first if you are an AI agent working in this repo
```

## Quickstart

```bash
# 1. Install deps (bun workspaces)
bun install

# 2. Link your own machine to the InsForge backend (each teammate runs this once)
bunx @insforge/cli link --project-id 787adbc2-92c6-4b37-a0a9-3e8d94123584

# 3. Configure local env
cp .env.example .env.local   # fill in the values (see docs/BACKEND.md)

# 4. Run a surface
bun run mcp:dev              # MCP server (for ChatGPT)
bun run web:dev             # web storefront
```

## Docs

| Doc | What |
|-----|------|
| [`AGENTS.md`](./AGENTS.md) | Canonical context for AI agents — read this first |
| [`docs/PRODUCT.md`](./docs/PRODUCT.md) | What we're building + user stories |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | System design + data flow |
| [`docs/BACKEND.md`](./docs/BACKEND.md) | InsForge schema, buckets, functions, payments |
| [`docs/BRANCHING.md`](./docs/BRANCHING.md) | Branch + worktree workflow for the team |
| [`docs/DECISIONS/`](./docs/DECISIONS/) | Architecture Decision Records |

## Team

3 humans + AI agents, working in parallel via git worktrees. See [`docs/BRANCHING.md`](./docs/BRANCHING.md) before you push.
