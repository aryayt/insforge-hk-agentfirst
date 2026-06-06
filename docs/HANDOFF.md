# Handoff — InsForge hackathon: agent-first shop (2026-06-06 ~13:00)

**You are**: a coding agent in Arya's terminal at `~/shop/insforge-hackathon`, with full network + her InsForge CLI login (`aryayt55@gmail.com`, already authenticated) and her SSH/GitHub access. The previous agent worked from a sandbox that could NOT reach the InsForge API, push to GitHub, or delete `.git/*.lock` files — that's why several steps below are queued for you.

**Read first**: `AGENTS.md`, then `docs/RUNBOOK-demo.md`, `docs/BACKEND.md` (Demo posture section). Honor repo rules: bun only, InsForge only, Stripe TEST only, never commit keys.

## Goal of your session

Get everything OFF localhost and testable by the whole team: deploy MCP server + web app, finish the queued backend setup, push, update README with live URLs. Demo = design → cart → $2 Stripe checkout (coupon AGENT50) inside ChatGPT.

## Current git state (messy — fix first)

- Branch `feat/web-storefront` = main + MCP loop (aa8580e) + web app (e1fe879) + attribution/designs (04f6752, unpushed) + **staged-but-uncommitted** work (generate-design edge function, coupon/pricing scripts, README rewrite, MCP wiring).
- Stale lock files (`.git/HEAD.lock`, `.git/refs/heads/feat/web-storefront.lock`) block commits/renames — the sandbox couldn't delete them.
- Arya wants branches renamed to carry her name.

```bash
find .git -name "*.lock" -delete
git add -A && git commit -m "feat: AI gen via InsForge secrets + \$2 demo pricing + Stripe coupons"
git branch -m feat/web-storefront arya/web-storefront
git branch -m mcp/core-loop arya/mcp-core-loop
git branch -d feat/web-studio-checkout
git push origin arya/web-storefront arya/mcp-core-loop :feat/web-storefront
```

## Queued backend setup (one-liners, in order)

```bash
bunx @insforge/cli db migrations up --all       # applies guest-checkout + agent-attribution
bunx @insforge/cli functions deploy generate-design --file functions/generate-design.ts
bunx @insforge/cli payments status              # expect test: configured
set -a; source .env.local; set +a
bun scripts/seed/demo-pricing.ts                # Classic Tee → flat $2.00 (DB + new Stripe prices)
bun scripts/seed/stripe-coupon.ts               # promo code AGENT50, 50% off
```

Then smoke-test per `docs/RUNBOOK-demo.md` §3 (inspector flow; card 4242…). Watch for: (a) `allowPromotionCodes` passthrough in `apps/mcp/src/orders.ts` — if Stripe checkout shows no "Add promotion code" field, InsForge strips it; find another route (e.g. `discounts` param or pre-discounted price). (b) `generate-design` function expects secrets `GOOGLE_AI_API_KEY`, `OPENAI_API_KEY`, `API_KEY`, `INSFORGE_BASE_URL` (all present in dashboard → Functions → Secrets).

## Deploys (Arya: "no more localhost")

- **MCP server** → InsForge compute (Fly), NOT Vercel (long-running server). `Dockerfile` is ready: `bunx @insforge/cli compute deploy . --name agent-shop-mcp --port 8788 --env-file .env.deploy` (INSFORGE_API_BASE_URL, INSFORGE_API_KEY), then `compute update <id> --env-set MCP_PUBLIC_URL=https://<endpoint>` so Stripe success redirects work — required before phone/Apple Pay testing (localhost redirect breaks paid-marking). See `skills/insforge-cli/references/compute-deploy.md` (needs `flyctl` on PATH).
- **Web app (`apps/web`)** → Vercel. Either `bunx @insforge/cli deployments deploy` (InsForge-managed Vercel; see `skills/insforge-cli/references/deployments-deploy.md`) or plain `vercel` CLI. Vite SPA: include `vercel.json` rewrites; set `VITE_INSFORGE_URL`/`VITE_INSFORGE_ANON_KEY` build env (anon key via `bunx @insforge/cli secrets get ANON_KEY` — safe for the browser).
- **ChatGPT connector**: add `https://<mcp-endpoint>/mcp`, No Auth, Developer mode. Test prompts in RUNBOOK §6.
- Update `README.md` with both live URLs + connector instructions; push. Delete this file once absorbed.

## Security decision (relay to Arya, do NOT skip)

She proposed making the repo private and committing all secrets. **Don't commit secrets even to a private repo** — git history is forever, every clone leaks, GitHub push-protection will fight it, and the repo may go public after the hackathon. The setup already avoids key-shuffling: keys live as InsForge secrets; each teammate runs `bunx @insforge/cli link --project-id 787adbc2-92c6-4b37-a0a9-3e8d94123584` + `login` and gets everything. The one exception is `STRIPE_SECRET_KEY` for seed scripts → share via Discord DM. Making the repo private is fine (`gh repo edit --visibility private`).

## Known gaps / roadmap (GitHub issues #1–#5 exist)

#1 MCP Apps-SDK widgets (in-chat design/product UI — biggest demo wow; read `.agents/skills/mcp-apps-builder` widget references first) · #2 web AI button → `insforge.functions.invoke('generate-design', { body: { prompt } })` · #3 MCP OAuth · #4 webhook-backed fulfillment (replace success-redirect paid-marking in `apps/mcp/src/orders.ts` with a trigger on `payments.payment_history`) · #5 prod deploy hardening. Arya also wants (web-studio scope, unscheduled): real upload-to-Storage, print-placement zone on mockups, extract-design-from-photo, background removal.

## Skills to use

`skills/insforge-cli` (compute-deploy, deployments-deploy, payments, db-migrations references) · `skills/insforge` (SDK patterns) · `.agents/skills/mcp-apps-builder` (mandatory before touching `apps/mcp`) · `skills/insforge-debug` (RLS/SDK errors).

## Context that saves you time

- MCP server: `apps/mcp/src/{server,orders,designs,session,insforge}.ts`. Guest posture: carts in memory keyed by ChatGPT user subject; orders/designs durable with `agent_source`/`agent_user_subject` attribution (Arya's explicit requirement: track which agent brought the buyer).
- A second agent (cmux/Claude Code) has been working in this same tree (built `apps/web`, pushed e1fe879, created issues #1–#5). Coordinate via commits; don't assume sole ownership.
- InsForge project: HK-agentfirst-1, `https://dsc7y62h.us-east.insforge.app`. Catalog: classic-tee / ceramic-mug / dad-cap, 12 variants, `variants.stripe_price_id` linked.
- Stripe checkout brand shows "LeSearch AI, Inc." (their Stripe account name) — cosmetic; change in Stripe dashboard settings if it bothers the demo.
