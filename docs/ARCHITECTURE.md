# Architecture

## System shape

```
            ┌─────────────┐        MCP (Streamable HTTP, OAuth)
  ChatGPT ──┤  AI agent   ├───────────────────────────────┐
            └─────────────┘                                │
                                                           ▼
                                                  ┌──────────────────┐
                                                  │  apps/mcp        │  MCP server
                                                  │  (tools layer)   │  @modelcontextprotocol/sdk
                                                  └────────┬─────────┘
                                                           │ @insforge/sdk
   Browser ──► apps/web (Vite+React) ──── @insforge/sdk ──►│
   (storefront / design studio / checkout)                 ▼
                                              ┌──────────────────────────────┐
                                              │           InsForge            │
                                              │  Postgres · Auth · Storage    │
                                              │  Edge Functions · AI gateway  │
                                              │  Stripe payments              │
                                              └───────────────┬──────────────┘
                                                              │ webhook
                                                         ┌────▼─────┐
                                                         │  Stripe  │ (test mode)
                                                         └──────────┘
```

## Components

- **`apps/mcp` — MCP server.** The ChatGPT-facing surface. Exposes the tools in `docs/PRODUCT.md`. Stateless request handlers; all state in InsForge. Auth: each MCP session carries an identity that maps to an InsForge user (carts/orders are per-user). Transport: Streamable HTTP so ChatGPT can connect remotely.
- **`apps/web` — storefront / design studio / checkout.** Thin React app on `@insforge/sdk` for the visual side: preview a design, confirm a cart, complete Stripe checkout, basic admin.
- **`packages/shared` — the contract.** Zod schemas + types for catalog, product variant/options, design spec, cart line item, order. Both surfaces import from here so they can't drift.
- **`functions/` — InsForge edge functions.** Server-side logic that shouldn't live in a client: the **Stripe webhook handler** (payment → order state), design-generation orchestration if it needs secrets, and any fulfillment hand-off.
- **InsForge backend.** Database (catalog, designs, carts, orders), Auth (user identity behind MCP + web), Storage (generated/uploaded design images — persist both `url` and `key`), AI gateway (design generation), Payments (Stripe products/prices mirror + webhooks).

## Key data flow: design → buy

1. `create_design` → (AI gateway or upload) → image saved to Storage → `design` row (prompt, image url+key, placement).
2. `customize_product` → resolves a `product` + `variant` + `design` into a priced line item.
3. `add_to_cart` → `cart_item` rows for the user.
4. `create_checkout` → InsForge payments creates a Stripe Checkout Session from mirrored prices → returns URL.
5. User pays → Stripe webhook → `functions/stripe-webhook` → `order` marked `paid` → fulfillment.

## Why InsForge does the heavy lifting

Payments, auth, storage, AI, and DB are one platform here, so the custom code is mostly: (a) MCP tool definitions, (b) the shared schema, (c) a webhook handler, (d) a thin web UI. That's the right amount of surface for a hackathon and keeps secrets server-side.

## Environments

- **Local dev:** MCP server runs locally; ChatGPT reaches it via a tunnel (see open decision on transport). Web runs on Vite dev server. Backend is the shared InsForge project.
- **Branch isolation:** parallel work happens in git worktrees against the same InsForge project. Schema changes are coordinated via migrations + `docs/BACKEND.md` (avoid two people mutating the same table live).

## Open decisions

Tracked in [`DECISIONS/0001-open-decisions.md`](./DECISIONS/0001-open-decisions.md).
