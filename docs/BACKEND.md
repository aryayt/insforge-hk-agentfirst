# Backend (InsForge)

Project **HK-agentfirst-1** · API base `https://dsc7y62h.us-east.insforge.app` · region `us-east`.

> Manage everything here with the `insforge` CLI (and the `insforge-cli` skill). App code uses `@insforge/sdk`.
> Inserts take arrays: `insert([{...}])`. Reference users via `auth.users(id)`; use `auth.uid()` in RLS. Storage uploads: persist both `url` and `key`.

## Status

Backend is currently **empty** (no tables, buckets, or functions). This doc is the plan + the running source of truth — update it with every schema change.

## Proposed schema (v1)

> Draft — finalize once the open decisions land (POD vs mock changes `order`/`fulfillment`).

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `products` | Catalog | `id`, `slug`, `name`, `type` (tshirt\|mug\|cap), `base_price_cents`, `active` |
| `variants` | Per-product options | `id`, `product_id`, `color`, `size`, `sku`, `price_delta_cents`, `stripe_price_id` |
| `designs` | User/agent-created artwork | `id`, `user_id`→`auth.users`, `prompt`, `image_url`, `image_key`, `placement` (jsonb) |
| `carts` | One open cart per user | `id`, `user_id`, `status` (open\|checked_out) |
| `cart_items` | Configured line items | `id`, `cart_id`, `variant_id`, `design_id`, `qty`, `unit_price_cents` |
| `orders` | Paid orders | `id`, `user_id`, `stripe_session_id`, `amount_cents`, `status` (pending\|paid\|fulfilled\|failed) |
| `order_items` | Snapshot of purchased items | `id`, `order_id`, `variant_id`, `design_id`, `qty`, `unit_price_cents` |

RLS: users see only their own `designs`, `carts`, `cart_items`, `orders`. `products`/`variants` are public-read.

## Buckets

- `designs` — generated/uploaded design images (public-read or signed URL; persist `url` + `key` on the `designs` row).

## Edge functions

- `stripe-webhook` — verify signature, mark `orders.status`, trigger fulfillment. Stripe → InsForge-managed webhook (see `insforge payments webhooks`).
- (maybe) `generate-design` — server-side AI-gateway call if generation needs secret keys.

## Payments (Stripe, test mode)

Wired via `insforge payments`:

1. `insforge payments config` — set Stripe **test** secret key.
2. Mirror catalog: create Stripe products/prices, store `stripe_price_id` on `variants`. (`insforge payments products` / `prices` / `sync`.)
3. `insforge payments webhooks` — register the InsForge-managed webhook; surface the signing secret into `.env.local`.
4. `create_checkout` builds a Checkout Session from mirrored prices.

## Conventions

- Schema changes go through migrations (`insforge db` / `insforge-cli` skill), never ad-hoc live edits, so worktrees stay in sync.
- After any schema change: update this doc + `packages/shared` schemas in the same PR.
