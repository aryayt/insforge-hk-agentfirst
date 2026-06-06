# Architecture

## System shape

```
            ┌─────────────┐        MCP (Streamable HTTP, no-auth demo)
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

- **`apps/mcp` - MCP server.** The ChatGPT-facing surface. Exposes the tools in `docs/PRODUCT.md` and the `agent-shop` widget for catalog/cart views. Demo carts are in memory per ChatGPT caller; orders/designs are durable in InsForge.
- **`apps/web` - storefront / design studio / checkout.** Thin React app on `@insforge/sdk` for the visual side: preview a design, confirm a cart, complete Stripe checkout, basic admin.
- **`packages/shared` - the contract.** Zod schemas + types for catalog, product variant/options, design spec, cart line item, order. Both surfaces import from here so they can't drift.
- **`functions/` - InsForge edge functions.** Server-side logic that shouldn't live in a client: design-generation orchestration now, Stripe webhook and fulfillment later.
- **InsForge backend.** Database (catalog, designs, carts, orders), Storage (generated/uploaded design images, persist both `url` and `key`), AI gateway (design generation), Payments (Stripe products/prices mirror + webhooks).

## Key data flow: design → buy

1. `create_design` -> AI gateway or upload -> image saved to Storage -> `designs` row (prompt, image url+key, attribution).
2. `add_to_cart` -> resolves a product variant SKU plus optional design into an in-memory MCP cart line.
3. `get_cart` -> returns cart data and a ChatGPT widget for visual confirmation/removal.
4. `create_checkout` -> writes guest `orders`/`order_items`, then InsForge payments creates a Stripe Checkout Session from mirrored prices.
5. User pays -> success redirect marks demo order `paid`; production moves this to a Stripe webhook-backed path.

## Why InsForge does the heavy lifting

Payments, storage, AI, and DB are one platform here, so the custom code is mostly MCP tool definitions, the shared schema, a future webhook handler, and a thin web UI. That's the right amount of surface for a hackathon and keeps secrets server-side.

## Environments

- **Local dev:** MCP server runs locally; ChatGPT reaches it through the deployed connector or a tunnel. Web runs on Vite dev server. Backend is the shared InsForge project.
- **Branch isolation:** parallel work happens in git worktrees against the same InsForge project. Schema changes are coordinated via migrations + `docs/BACKEND.md` (avoid two people mutating the same table live).

## Open decisions

Tracked in [`DECISIONS/0001-open-decisions.md`](./DECISIONS/0001-open-decisions.md).
