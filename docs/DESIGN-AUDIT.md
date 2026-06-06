# Impeccable Design Audit

Date: 2026-06-06

## Summary

Impeccable is installed for Codex and Claude Code. The product register applies: this is task-focused product UI where consistency, readable controls, and trustworthy checkout states matter more than decorative brand expression.

Current pass completed:

- Added the `agent-shop` MCP widget for catalog browsing and cart review.
- Added `remove_from_cart` so the widget and model can correct cart lines.
- Reworked the web app toward a restrained token palette, smaller card radius, clearer checkout copy, and consistent button/control vocabulary.
- Added Vercel SPA deployment config.

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|---:|---:|---|
| 1 | Accessibility | 3 | Focus states and labels are improved; full axe/browser pass remains. |
| 2 | Performance | 3 | No heavy decorative motion; generated/remote images still need production sizing rules. |
| 3 | Responsive Design | 3 | Catalog/cart/widget have responsive structure; data tables still need narrow-screen treatment. |
| 4 | Theming | 3 | Web tokens and widget theme support exist; full dark web theme is not implemented. |
| 5 | Anti-Patterns | 3 | Major MVP tells reduced; remaining work is design-widget depth and table polish. |
| **Total** |  | **15/20** | **Good, with focused follow-up needed.** |

## Findings

- **P1: Design creation is still split between text controls and static preview.** The ChatGPT widget covers catalog/cart, but `create_design` still returns text plus a URL. Next pass should add a design preview widget with generated artwork, selected SKU, and placement context.
- **P1: Data tables are not mobile-optimized.** `/data` uses full-width tables. Add horizontal containment or compact rows before demoing on phones.
- **P2: Web mockups are functional silhouettes, not production merchandising previews.** Keep them for the hackathon, but real product imagery or stronger generated assets would improve trust.
- **P2: Web dark mode is not implemented.** The MCP widget adapts to host theme; the standalone web app is light-only.

## Positive Findings

- Tool names and descriptions are now closer to the actual implemented product contract.
- Cart removal is test-covered on both the pure helper and MCP tool surface.
- Web guest orders now set `agent_source: "web"`, matching backend attribution docs.
- Stripe remains test-mode-only and secrets stay out of committed files.

## Recommended Next Commands

1. `$impeccable harden apps/web/src/pages.tsx`: improve `/data` mobile behavior and table empty/loading states.
2. `$impeccable polish apps/mcp/resources/agent-shop.tsx`: screenshot the widget in light/dark and tighten visual details.
3. `$impeccable craft create_design widget`: add a design preview widget after catalog/cart validation is complete.
