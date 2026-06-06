# Product

## One-liner

Let a user's AI agent shop inside ChatGPT: browse products, design a custom one, and pay — without leaving the conversation.

## Why

Shopping is one of the highest-intent things people do, and it's still a browser-tab, copy-paste, form-filling chore. If the agent the user already trusts can do it end-to-end inside the chat — including the creative part (designing the product) — the friction collapses. "Agent-first" means the primary interface is the model, not a webpage.

## Core flow (happy path)

1. User (via ChatGPT) asks for a product — "I want a black mug with a minimalist mountain line-art."
2. Agent calls `list_products` → picks `mug`.
3. Agent calls `create_design` (describe it) → we generate/compose artwork and return a preview image.
4. Agent calls `customize_product` → places the design, picks color/size/variant.
5. Agent calls `add_to_cart` → `get_cart` to confirm.
6. Agent calls `create_checkout` → returns a Stripe checkout link (test mode) the user completes.
7. Stripe webhook → order marked paid → fulfillment.

## Products (v1)

- **T‑shirt** — color, size (S–XXL), front design.
- **Mug** — color, wrap design.
- **Cap** — color, embroidered/printed front design.

Catalog and variants live in the InsForge database; the shared schema is the contract (`packages/shared`).

## MCP tools (the product's real UI)

| Tool | Purpose |
|------|---------|
| `list_products` | Catalog + variants + base prices |
| `get_product` | One product, full variant/option detail |
| `create_design` | Turn a prompt (or uploaded art) into a placeable design + preview |
| `customize_product` | Bind a design + options to a product → a configured line item |
| `add_to_cart` / `get_cart` / `remove_from_cart` | Cart management (per authenticated user) |
| `create_checkout` | Stripe (test) checkout session → URL |
| `get_order` | Order status after payment |

Tool descriptions and argument schemas are written for a model to read. Keep them crisp, with examples in the descriptions.

## Auth

The MCP connection is authenticated (MCP OAuth, or a dev tunnel for local testing). The authenticated identity maps to an InsForge user so carts/orders are per-user and RLS-protected.

## Out of scope (v1)

- Real inventory / shipping rate shopping.
- Multi-currency. (USD test mode only.)
- Returns/refunds UI (Stripe dashboard is fine for the demo).

## Open product decisions

See [`docs/DECISIONS/0001-open-decisions.md`](./DECISIONS/0001-open-decisions.md): fulfillment (mock vs real POD), design mechanism (AI gen vs upload vs text-only), web storefront scope, and MCP transport for the demo.
