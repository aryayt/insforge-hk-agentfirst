# Backend (InsForge)

Project **HK-agentfirst-1** · API base `https://dsc7y62h.us-east.insforge.app` · region `us-east`.

> Manage everything here with the `insforge` CLI (and the `insforge-cli` skill). App code uses `@insforge/sdk`.
> Inserts take arrays: `insert([{...}])`. Reference users via `auth.users(id)`; use `auth.uid()` in RLS. Storage uploads: persist both `url` and `key`.

## Status (live)

- **Schema:** applied via `migrations/20260606175802_create-commerce-schema.sql` — 7 tables (`products`, `variants`, `designs`, `carts`, `cart_items`, `orders`, `order_items`) with RLS + grants + `updated_at` triggers.
- **Storage:** bucket `designs` created (public read) for generated/uploaded artwork.
- **Catalog:** seeded via `scripts/seed/{products,variants}.sql` — Classic Tee (8 variants), Ceramic Mug (2), Dad Cap (2).
- **Functions:** none deployed yet (Stripe webhook + optional design-gen pending).
- **Payments:** not configured yet — needs a Stripe **test** secret key (`insforge payments config set test sk_test_...`).

Keep this doc in sync with every schema change (same PR).

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
- `generate-design` — server-side AI image generation; uploads to the `designs` bucket + inserts a row.
- `printful-mockup` — renders a design on the real product via Printful's Mockup Generator (create-task → poll). Powers the studio's photoreal preview (the `printful` MockupRenderer). Secret: `PRINTFUL_API_KEY`.
- `printful-catalog` — live Printful product info (sizes/colors + per-variant cost) for the studio's info panel + price breakdown.

## Payments (Stripe, test mode)

Wired via `insforge payments`:

1. `insforge payments config` — set Stripe **test** secret key.
2. Mirror catalog: create Stripe products/prices, store `stripe_price_id` on `variants`. (`insforge payments products` / `prices` / `sync`.)
3. `insforge payments webhooks` — register the InsForge-managed webhook; surface the signing secret into `.env.local`.
4. `create_checkout` builds a Checkout Session from mirrored prices.

## Conventions

- Schema changes go through migrations (`insforge db` / `insforge-cli` skill), never ad-hoc live edits, so worktrees stay in sync.
- After any schema change: update this doc + `packages/shared` schemas in the same PR.
