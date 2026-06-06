# ADR 0001 — Open decisions (pending owner sign-off)

Status: **OPEN**. These four choices fork the build. Do not silently resolve them in code — update this file when decided, then proceed.

## D1. Fulfillment / product source

How do physical t‑shirts/mugs/caps actually get made?

- **(a) Mock fulfillment** — fake the fulfillment step; focus the build on agent UX + payments + design. Fastest; best for a hackathon demo.
- **(b) Printful** — real print-on-demand; needs a Printful API key; richer demo, more integration work + product/variant mapping.
- **(c) Printify** — alternative POD provider.

Impact: `orders`/`order_items` columns, an optional `functions/fulfillment` hook, env keys.

## D2. "Design your own" mechanism

- **(a) AI image generation** via the InsForge AI gateway — agent describes the design, we generate art, place on product. Most impressive, fits "agent-first."
- **(b) Upload / preset art + placement** — user/agent supplies an image; we composite + position.
- **(c) Text + color only** — simplest; no image generation.

Impact: `create_design` tool, `designs` table, Storage bucket, AI gateway setup.

## D3. Web storefront scope

- **(a) Custom React + `@insforge/sdk`** — thin, full control, fits the monorepo. (Assumed default in current docs.)
- **(b) InsForge `e-commerce` template** — fastest full storefront; opinionated; lives awkwardly in a monorepo root.
- **(c) MCP-only for now** — skip web; add later.

Impact: shape of `apps/web`.

## D4. MCP → ChatGPT transport for the demo

- **(a) Tunnel (ngrok / cloudflared)** — run MCP locally, expose via tunnel, register in ChatGPT developer mode. Fastest to demo; needs an ngrok authtoken.
- **(b) Deploy to InsForge compute (Fly.io)** — hosted MCP, production-like; more setup.
- **(c) Both** — tunnel now, deploy before final.

Impact: dev workflow, `MCP_PUBLIC_URL`, OAuth config, hosting.

---

### Decisions log

_(record choices here as they're made, with date + who)_
