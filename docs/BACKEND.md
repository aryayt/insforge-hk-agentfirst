# Backend (InsForge)

Project **HK-agentfirst-1** · API base `https://dsc7y62h.us-east.insforge.app` · region `us-east`.

> Manage everything here with the `insforge` CLI (and the `insforge-cli` skill). App code uses `@insforge/sdk`.
> Inserts take arrays: `insert([{...}])`. Reference users via `auth.users(id)`; use `auth.uid()` in RLS. Storage uploads: persist both `url` and `key`.

## Status (live)

- **Schema:** applied via `migrations/20260606175802_create-commerce-schema.sql` — 7 tables (`products`, `variants`, `designs`, `carts`, `cart_items`, `orders`, `order_items`) with RLS + grants + `updated_at` triggers.
- **Fulfillment (Phase 2):** `migrations/20260606190000_add-fulfillment-fields.sql` adds `variants.printful_variant_id`, `orders.{provider,provider_order_id,shipping_address,recipient_email}`, and the `fulfillment_jobs` outbox table. `migrations/20260606193000_fulfillment-trigger.sql` adds the paid→enqueue trigger on `payments.payment_history`.
- **Storage:** bucket `designs` created (public read) for generated/uploaded artwork.
- **Catalog:** seeded via `scripts/seed/{products,variants}.sql` — Classic Tee (8 variants), Ceramic Mug (2), Dad Cap (2). Printful variant ids backfilled by `scripts/printful/map-variants.ts` (or the documented seed) — `null` until mapped.
- **Functions:** `fulfill-order` (drains `fulfillment_jobs` → provider) and `printful-webhook` (status → `orders.status`). Deploy with `insforge functions deploy`.
- **Payments:** not configured yet — needs a Stripe **test** secret key (`insforge payments config set test sk_test_...`).

Keep this doc in sync with every schema change (same PR).

## Proposed schema (v1)

> Draft — finalize once the open decisions land (POD vs mock changes `order`/`fulfillment`).

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `products` | Catalog | `id`, `slug`, `name`, `type` (tshirt\|mug\|cap), `base_price_cents`, `active` |
| `variants` | Per-product options | `id`, `product_id`, `color`, `size`, `sku`, `price_delta_cents`, `stripe_price_id`, `printful_variant_id` |
| `designs` | User/agent-created artwork | `id`, `user_id`→`auth.users`, `prompt`, `image_url`, `image_key`, `placement` (jsonb) |
| `carts` | One open cart per user | `id`, `user_id`, `status` (open\|checked_out) |
| `cart_items` | Configured line items | `id`, `cart_id`, `variant_id`, `design_id`, `qty`, `unit_price_cents` |
| `orders` | Paid orders | `id`, `user_id`, `stripe_session_id`, `amount_cents`, `status` (pending\|paid\|fulfilled\|failed), `provider`, `provider_order_id`, `shipping_address` (jsonb), `recipient_email` |
| `order_items` | Snapshot of purchased items | `id`, `order_id`, `variant_id`, `design_id`, `qty`, `unit_price_cents` |
| `fulfillment_jobs` | Outbox: orders awaiting provider submit | `id`, `order_id`, `user_id`, `status` (pending\|submitting\|submitted\|failed), `attempts`, `last_error` |

RLS: users see only their own `designs`, `carts`, `cart_items`, `orders`, `fulfillment_jobs`. `products`/`variants` are public-read. `fulfillment_jobs` is server-write (admin client), owner-read.

## Buckets

- `designs` — generated/uploaded design images (public-read or signed URL; persist `url` + `key` on the `designs` row).

## Edge functions

> Payment → paid is handled by InsForge's **managed** Stripe webhook + the SQL fulfillment trigger
> (`payments.payment_history` → `orders.status='paid'` + enqueue a `fulfillment_jobs` row). We do **not**
> hand-roll a Stripe-signature webhook. External side effects go through the outbox below.

- `fulfill-order` — drains `pending`/`failed` `fulfillment_jobs`, submits each paid order to the fulfillment provider (`getFulfillmentProvider()` from `@app/shared` — Printful when `PRINTFUL_API_KEY` is set, else mock), and writes back `orders.provider` + `orders.provider_order_id`. Invoked on a schedule (every minute) and manually for the demo.
- `printful-webhook` — public endpoint Printful posts order/package status events to; flips `orders.status` → `fulfilled`/`failed` by `provider_order_id`.
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
