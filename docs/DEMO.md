# Demo script — Agent-first commerce (InsForge hackathon)

> Goal: in ~3 minutes, show an AI agent (and a human) **design a custom t‑shirt and pay for it** — once via ChatGPT/MCP, once via the web storefront — all on a real Postgres backend with real Stripe (test) payments. Everything below is **verified working** (2026-06-06).

## The one-liner

> "Agent-first commerce: your AI agent shops, designs, and checks out for you. Same backend powers a normal storefront. Every order knows *which agent* brought the buyer."

## Setup (once, before the demo)

```bash
bun install
set -a; source .env.local; set +a            # InsForge + Stripe TEST keys
bun run mcp:dev    # → http://localhost:8788/mcp  (inspector: /inspector)
bun run web:dev    # → http://localhost:5173
```

Pre-flight (proves the whole thing is live, ~30s):

```bash
cd apps/web && bun verify-flow.ts && bun verify-ai.ts && cd ../mcp && bun verify-mcp.ts
```

All three should print ✓ lines ending in a `checkout.stripe.com` URL / `MCP loop OK`.

## Act 1 — The agent does it (MCP, the headline)

Open the inspector at `http://localhost:8788/inspector` (or, deployed, connect in ChatGPT — see RUNBOOK §5) and run, in order:

1. `list_products` → 3 products (Classic Tee, Ceramic Mug, Dad Cap)
2. `get_product` `slug=classic-tee` → variants + SKUs
3. `create_design` `prompt="retro space moon base, clean vector art"` → **AI generates the artwork** (Gemini, server-side via InsForge edge function + secrets), returns a preview URL + design id
4. `add_to_cart` `sku=tee-blk-l designId=<id from step 3>`
5. `get_cart` → **$2.00**
6. `create_checkout` `name="Ada Lovelace" email=you@example.com` → returns a **Stripe checkout link**
7. Open the link → pay with **`4242 4242 4242 4242`** (any future expiry / CVC / ZIP)
8. Land on the success page → `get_order_status` → **PAID**

**The kicker:** open `http://localhost:5173/data` (or the InsForge dashboard) — the order is there with `agent_source` recording it came from the agent, plus the AI design row + artwork in Storage.

## Act 2 — A human does it (web, the visual proof)

`http://localhost:5173` → click **Classic Tee** → design studio:

- Pick a color/size, type text, or hit **AI ✨** and describe artwork (same edge function as the agent)
- Live preview updates on the mockup
- **Add to cart** → **Checkout** → Stripe (`4242…`) → confirmation
- **Data** tab shows the new order + catalog straight from Postgres

## What to emphasize to judges

- **One backend, two surfaces.** InsForge gives DB + RLS + Storage + AI gateway + native Stripe payments; the MCP server and the web app are thin clients over the same data.
- **Agent attribution.** `orders.agent_source` / `agent_user_subject` answer "which agent/account drove this sale" — the agent-commerce angle.
- **Guest checkout, no login friction.** Anonymous RLS + guest tokens; the agent never needs the user to sign in.
- **Real money rails.** Stripe test mode, one Price per variant, checkout sessions created through InsForge.

## Honest limitations (say them before they're asked)

- **Paid-marking** is on the Stripe success redirect (token-gated), not yet a webhook — production path is a trigger on `payments.payment_history` (issue #4).
- **Fulfillment is mock** (no print-on-demand wired).
- **No promo-code field** at checkout — InsForge's checkout schema doesn't expose one, so the "agent deal" is baked into the $2 price.
- **In-chat visual widget** (design/preview inside ChatGPT itself) is issue #1 — today the agent surface is text + a checkout link; the *visual* design lives on the web surface.

## If something breaks mid-demo

- `create_checkout` says "no Stripe price" → `bun scripts/seed/stripe-prices.ts && bun scripts/seed/demo-pricing.ts`
- MCP server stale → kill it, `bun run mcp:dev` again (carts are in-memory, orders are durable)
- AI design slow/fails → use a preset or upload art; the rest of the flow is identical
