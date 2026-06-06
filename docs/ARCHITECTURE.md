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
- **`functions/` — InsForge edge functions.** Server-side logic that shouldn't live in a client. Payment→paid is handled by InsForge's **managed** Stripe webhook + a SQL trigger (no hand-rolled webhook), so the functions here are the fulfillment outbox drainer **`fulfill-order`** (paid order → Printful via `@app/shared` provider) and **`printful-webhook`** (provider status → `orders.status`). Design-generation orchestration lands here too if it needs secrets.
- **InsForge backend.** Database (catalog, designs, carts, orders, `fulfillment_jobs`), Auth (user identity behind MCP + web), Storage (generated/uploaded design images — persist both `url` and `key`), AI gateway (design generation), Payments (Stripe products/prices mirror + managed webhook → `payments.payment_history`).
- **Printful — print-on-demand fulfillment.** Real provider behind a `FulfillmentProvider` interface (`packages/shared/src/fulfillment`); a mock fallback runs when no token is set. See ADR 0001 D1 (revisited).

## Key data flow: design → buy

1. `create_design` → (AI gateway or upload) → image saved to Storage → `design` row (prompt, image url+key, placement).
2. `customize_product` → resolves a `product` + `variant` + `design` into a priced line item.
3. `add_to_cart` → `cart_item` rows for the user.
4. `create_checkout` → creates a trusted `pending` order (+ shipping address) → InsForge payments creates a Stripe Checkout Session from mirrored prices with `metadata.order_id` → returns URL.
5. User pays → InsForge **managed** Stripe webhook updates `payments.payment_history` → SQL trigger marks the `order` `paid` and enqueues a `fulfillment_jobs` row.
6. `fulfill-order` (scheduled) drains the outbox → submits to Printful (catalog `variant_id` + design image URL) → stores `provider_order_id`. `printful-webhook` later flips `orders.status` to `fulfilled`/`failed`. With no Printful token, the mock provider completes the order instead.

## Why InsForge does the heavy lifting

Payments, auth, storage, AI, and DB are one platform here, so the custom code is mostly: (a) MCP tool definitions, (b) the shared schema, (c) a webhook handler, (d) a thin web UI. That's the right amount of surface for a hackathon and keeps secrets server-side.

## Environments

- **Local dev:** MCP server runs locally; ChatGPT reaches it via a tunnel (see open decision on transport). Web runs on Vite dev server. Backend is the shared InsForge project.
- **Branch isolation:** parallel work happens in git worktrees against the same InsForge project. Schema changes are coordinated via migrations + `docs/BACKEND.md` (avoid two people mutating the same table live).

## Open decisions

Tracked in [`DECISIONS/0001-open-decisions.md`](./DECISIONS/0001-open-decisions.md).
