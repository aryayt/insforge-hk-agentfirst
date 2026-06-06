# Next version — in-ChatGPT widget, image pipeline, brand design, domain

> Synthesized from a 6-agent research sweep (2026-06-06). This is the shared build spec. Lanes are tagged so Claude + codex don't collide. Source-cited details in the research; this is the actionable distillation.

## ROOT CAUSE (why ChatGPT showed no widget)

The **deployed** Fly MCP is the OLD text-only `server.ts` (`59c64e1`). A live JSON-RPC probe confirmed: every tool has **no `_meta`** and `resources/list` is **empty**. ChatGPT renders an interactive iframe ONLY when a tool result carries `_meta["openai/outputTemplate"]` → a registered `ui://widget/<name>` resource (mimeType `text/html+skybridge` / `text/html;profile=mcp-app`). With neither present, ChatGPT had nothing to embed → fell back to web search + product cards. The $2 Apple Pay charge still worked, so the money rail is fine — only the visual layer is missing.

Codex's uncommitted widget (`apps/mcp/resources/agent-shop.tsx`) is correctly written per the Apps-SDK skill, **but**: (1) never built — the only artifact is a Vite **dev** file pointing at `localhost:8788`; (2) never deployed; (3) catalog/cart only (no design canvas / preview-on-product / checkout); (4) `server.widget()` is never called, so `widgetDefinitions` is empty and tools get no `outputTemplate`; (5) `createMCPServer` has no `baseUrl`, so prod widget URIs would be `localhost`.

## THE WIDGET FIX — `[widget]` (codex's lane; THE #1 blocker)

Until ALL of these ship, no widget renders regardless of React quality:

1. Add a prod build: `apps/mcp` needs `"build": "mcp-use build"` → emits `dist/resources/widgets/agent-shop/index.html` + `dist/mcp-use.json` (self-contained, inlined JS/CSS). The dev `.mcp-use/*` file is useless in prod.
2. Register the widget **before** tool declarations: call `server.widget(...)` (or `server.uiResource`) so `widgetDefinitions` is populated; then `widget:{name:'agent-shop'}` on tools auto-attaches `openai/outputTemplate` + `ui.resourceUri`.
3. Set `createMCPServer(..., { baseUrl: 'https://<mcp-domain>', host: '0.0.0.0' })` and env `MCP_BASE_URL` so widget HTML + CSP use the public origin, not localhost.
4. Deploy with `NODE_ENV=production` and a Dockerfile that `COPY dist/` — else `mountWidgetsProduction` finds nothing and registers zero resources.
5. Add `outputSchema` (Zod) to every tool (kills the "Output schema recommended" warning, raises tool-selection confidence).
6. Rewrite tool descriptions to "Use this when the user wants to…" framing; tighten the server-level description (first 512 chars drive tool selection): "Use this app to browse and buy custom-printed t-shirts, mugs, caps. Design with AI, preview on the product, check out with Stripe — all in ChatGPT."
7. CSP: `widgetMetadata.metadata.csp` → `resourceDomains` + `connectDomains` must include the InsForge origin (`https://dsc7y62h.us-east.insforge.app`) and any image CDN. Do NOT add `frameDomains` (triggers stricter review).
8. **Scope the widget to the real goal**: modes `catalog | studio | cart | checkout`. Port `apps/web/src/mockup.tsx` `ProductMockup` (SVG silhouette + % print-area overlay) for live preview-on-product — **no external API needed**. Wire `useCallTool('create_design'|'add_to_cart'|'create_checkout')`; surface the Stripe `checkoutUrl` as a button.
9. Verify via JSON-RPC probe: `tools/list` shows `openai/outputTemplate`, `resources/list` contains the `ui://` resource. Then reconnect in ChatGPT (Developer mode) and **@-select the app** — as of May 2026 ChatGPT only fires app tools when the app is explicitly selected (implicit name-match is a known regression).

**Core widget needs NO new API keys** — existing SVG mockup + existing AI gen suffice. Image upgrades below are quality, not blockers.

## IMAGE PIPELINE — `[image]` (Claude's lane; `functions/` + edge functions, no collision)

- **Generation (fix "AI not working"):** current Gemini path requests no transparency → opaque, unprintable. Recommended primary: **Ideogram v3 transparent** (`POST /v1/ideogram-v3/generate-transparent`, native transparent PNG, ~$0.03, key `IDEOGRAM_API_KEY`). No-key improvement available now: add `background:'transparent'` + `output_format:'png'` to the gpt-image-1 fallback (caveat: white-area removal bug).
- **Extract design from a ChatGPT-generated mockup:** `@imgly/background-removal-node` (zero API cost, AGPL, Node/Bun) — or Photoroom API (commercial, 300ms) if AGPL is a concern.
- **Composite onto realistic product:** **Dynamic Mockups Render API** (synchronous, returns CDN URL ~1s, key `DYNAMIC_MOCKUPS_API_KEY`) → render in widget `<img>` (no nested iframe). Show the existing SVG mockup instantly, swap to the rendered URL when it arrives. Printful Mockup API is async → use only for final order confirmation (and it doubles as fulfillment).

## BRAND-AWARE DESIGN — `[brand]` (Claude's lane; new edge function)

- Clearbit Logo API is **dead** (shut down 2025-12-08).
- Primary: **Brandfetch Brand API** (`GET /v2/brands/{domain}` → logo SVG/PNG + hex colors + fonts; 100 free reqs, no card; key `BRANDFETCH_API_KEY`). Cache in a `brands` table so each domain costs 1 request ever.
- Fallbacks: **Logo.dev** CDN (500K free/mo, attribution) for logo display; `node-vibrant` or `<meta theme-color>` scraping for colors with no key.
- Pipeline: brand URL → `extract-brand` edge function → store → enrich the `generate-design` prompt ("Design for {brand}, primary {hex}, {font} style").

## DOMAIN — `[domain]` agentfirst.shop (needs your Cloudflare access; values are final)

Domain is on Cloudflare nameservers with no records yet. Add exactly:

| Type | Name | Target | Proxy | Notes |
|---|---|---|---|---|
| A | `app` | `76.76.21.21` | **DNS only (grey)** | web → Vercel (already added to project `agentshop-web`); Vercel auto-issues TLS |
| CNAME | `mcp` | `agent-shop-mcp-787adbc2-92c6-4b37-a0a9-3e8d94123584.fly.dev` | **Proxied (orange)** | MCP → Cloudflare terminates TLS, forwards to Fly |

Then Cloudflare → SSL/TLS → set mode **Full (Strict)**. Verify: `curl -I https://app.agentfirst.shop` (200) and `curl -sX POST https://mcp.agentfirst.shop/mcp` (400, reachable). Update the ChatGPT connector URL to `https://mcp.agentfirst.shop/mcp` so future redeploys don't need re-registration. (`insforge compute` has no custom-domain command and personal `flyctl certs add` 401s — the Cloudflare-proxy path avoids both.)

## OAUTH — `[oauth]` (not now)

No Auth is spec-compliant and fine for the hackathon/dev mode; the ChatGPT "does not implement OAuth" message is informational. For a PUBLIC listing, gate write tools (`add_to_cart`/`create_checkout`) behind OAuth via mcp-use's `oauthProxy` + InsForge as IdP (it auto-mounts `/.well-known/*` + `/register`). Keep `list_products`/`get_product` noauth.

## API KEYS NEEDED (free tiers) — set as InsForge secrets

`IDEOGRAM_API_KEY` (image quality), `DYNAMIC_MOCKUPS_API_KEY` (realistic preview), `BRANDFETCH_API_KEY` (brand extraction), optional `PRINTFUL_API_KEY` (fulfillment + final mockup), optional `LOGO_DEV_TOKEN` (widget logo display). The core widget works without any of these.

## BUILD ORDER (by leverage)

1. `[widget]` build + register + deploy the existing widget → **unblocks the in-ChatGPT experience** (highest leverage; codex).
2. `[widget]` expand to studio/preview/checkout modes (port `ProductMockup`).
3. `[image]` fix `generate-design` transparency (no key) → add Ideogram when key provided.
4. `[domain]` add the 2 Cloudflare records → repoint ChatGPT connector.
5. `[brand]` `extract-brand` edge function + prompt enrichment.
6. `[image]` Dynamic Mockups compositing + `@imgly` extraction.
7. `[oauth]` only before public submission.
