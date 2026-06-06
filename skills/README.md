# Vendored InsForge agent skills

These are the InsForge agent skills, **vendored into the repo** so every teammate and AI agent has them by default. (The originals install per-machine via `insforge link` into `~/.agents/skills/` + `~/.claude/skills/`, which are gitignored — so they wouldn't otherwise travel with the repo.)

- **`insforge`** — app code with `@insforge/sdk` (database CRUD, auth, storage, edge functions, realtime, AI, payments).
- **`insforge-cli`** — backend & infra via the `insforge` CLI (SQL, migrations, RLS, buckets, functions, secrets, payments, schedules, deploys).
- **`insforge-debug`** — diagnosing SDK/HTTP errors, RLS denials, auth/OAuth issues; security + performance audits.
- **`insforge-integrations`** — external auth providers (Clerk, Auth0, WorkOS, Better Auth) for JWT-based RLS, or x402 payments.

**Reach for these before guessing any InsForge API.**

## Re-sync after an InsForge CLI upgrade

```bash
bunx @insforge/cli link --project-id 787adbc2-92c6-4b37-a0a9-3e8d94123584
cp -R ~/.agents/skills/insforge ~/.agents/skills/insforge-cli \
      ~/.agents/skills/insforge-debug ~/.agents/skills/insforge-integrations skills/
```
