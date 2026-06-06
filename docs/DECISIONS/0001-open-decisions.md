# ADR 0001 — Open decisions (pending owner sign-off)

Status: **DECIDED 2026-06-06** (see Decisions log at bottom). Kept for rationale + scope record.

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

- **2026-06-06** — **D1: Mock fulfillment.** Fake the make/ship step; focus on agent UX + payments + design. No POD provider, no extra keys.
- **2026-06-06** — **D2: AI generation + upload/preset art.** `create_design` supports both — generate artwork from a prompt via the InsForge AI gateway, *and* upload images / logos / preset art. Framing: users design their own **brands**, not just one-off prints.
- **2026-06-06** — **D3: Lightweight custom React + InsForge SDK + Stripe**, using the InsForge `e-commerce` template as a base/reference. Build the MCP app with **mcp-use** to move faster. Commit the InsForge agent skills into the repo (tracked location) so teammates + agents have them by default.
- **2026-06-06** — **D4: Deploy the MCP server to InsForge compute (Fly.io).** No dev tunnel; hosted from the start.
- **2026-06-06 (revisited)** — **D1 reopened: add Printful as a real path alongside mock fulfillment.** The earlier "mock only" decision stands as the *default* for the demo, but we are now trialling Printful for two reasons: (1) **real fulfillment** (File Library → Sync Products → Orders) at order time, and (2) **photoreal mockups** via the Mockup Generator. These are modelled as two interchangeable `MockupRenderer` implementations (`local` = our existing in-browser SVG composite; `printful` = their hosted mockups) so the two paths can run side-by-side and be compared on the same artwork. Mock fulfillment remains the fallback when `PRINTFUL_API_KEY` is unset. Scope: new `PRINTFUL_API_KEY` env (already in `.env.example`), a server-side Printful client + CLI under `scripts/printful/`, and the shared `MockupRenderer` contract in `packages/shared/src/mockup.ts`. **Not yet decided:** whether Printful becomes the *production* fulfillment provider (vs. Printify or staying mock) — that depends on how the trial goes.
