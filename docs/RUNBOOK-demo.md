# Demo runbook — design → cart → Stripe checkout inside ChatGPT

Run these on a machine with `bun` + the linked InsForge project (`.insforge/project.json`).
Everything is TEST mode. Total time ≈ 15 min.

## 0. Install + typecheck

```bash
bun install
bun run typecheck
```

## 1. Backend migrations

Check what's applied, then apply pending ones (includes `guest-checkout`):

```bash
bunx @insforge/cli db migrations list
bunx @insforge/cli db migrations up --all
```

If `guest-checkout` was already applied manually, `list` will show it — skip it (its `CREATE POLICY` statements are not idempotent).

## 2. Stripe test prices (one-time)

Stripe key must already be configured (dashboard shows `sk_test_****` — done 2026-06-06).
Creates one test Product+Price per variant and stores `stripe_price_id`:

```bash
set -a; source .env.local; set +a   # needs STRIPE_SECRET_KEY (sk_test_...)
bun scripts/seed/stripe-prices.ts
```

## 3. Local smoke test

```bash
bun run mcp:dev          # http://localhost:8788/mcp · inspector at /inspector
```

In the inspector run, in order:
`list_products` → `get_product slug=classic-tee` → `create_design imageUrl=<any public png>` →
`add_to_cart sku=<sku> designId=<id>` → `get_cart` → `create_checkout` → open URL, pay with
`4242 4242 4242 4242` → `get_order_status` shows **PAID**.

## 4. Deploy (InsForge compute / Fly)

```bash
curl -L https://fly.io/install.sh | sh    # flyctl needed once, for source-mode builds

cat > .env.deploy <<'EOF'
INSFORGE_API_BASE_URL=https://dsc7y62h.us-east.insforge.app
INSFORGE_API_KEY=<from .insforge/project.json>
OPENROUTER_API_KEY=<optional, for prompt-mode design gen>
EOF

bunx @insforge/cli compute deploy . --name agent-shop-mcp --port 8788 --env-file .env.deploy
# Note the printed endpoint, then set the public URL (used in Stripe redirect links):
bunx @insforge/cli compute update <service-id> --env-set MCP_PUBLIC_URL=https://<endpoint>
```

`rm .env.deploy` afterwards. Verify: `curl https://<endpoint>/health`.

## 5. Connect in ChatGPT (web)

Settings → Apps & Connectors → Advanced → Developer mode on, then Create:

- Name: **AgentFirst Merch (Test)**
- MCP Server URL: `https://<endpoint>/mcp`
- Authentication: **No Auth** (private dev connector; OAuth is the v1 path)

## 6. Demo prompts

```text
Use AgentFirst Merch: design a black classic tee for "AstroAttire Orbit Club" —
retro space startup, moon base, clean vector art. Size L, qty 1. Show me the
design, add it to my cart, and give me a checkout link.
```

Guardrail check (should be redirected to an original design):

```text
Make a Nike-style shirt with the Disney castle on it.
```

Pay with Stripe test card `4242 4242 4242 4242` → success page → ask
`what's my order status?` → **PAID**.

## Notes / known posture (demo, not production)

- **No auth**: carts live in server memory keyed by ChatGPT user subject; a server
  restart clears unsubmitted carts. Orders/designs/payments are durable.
- **Paid-marking** happens on the token-gated Stripe success redirect. Production
  path = webhook-backed trigger on `payments.payment_history` (see BACKEND.md).
- **Fulfillment is mock** (ADR 0001). `status: fulfilled` is a manual update.
- If `create_checkout` errors with "no Stripe price", rerun step 2.
