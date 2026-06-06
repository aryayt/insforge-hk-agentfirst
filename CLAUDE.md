# CLAUDE.md

This repo's canonical agent context lives in [`AGENTS.md`](./AGENTS.md). **Read it first.**

Quick rules (full detail in `AGENTS.md`):

- `bun` only — never `npm`/`npx`/`yarn`. TypeScript + ESM everywhere.
- Backend is **InsForge** (`@insforge/sdk` + `insforge` CLI). Use the installed InsForge skills before guessing any API.
- Payments are **Stripe test mode** via InsForge `payments`. Never commit keys; add new vars to `.env.example`.
- Work on a branch in your own worktree (`scripts/wt.sh`), never on `main`. See [`docs/BRANCHING.md`](./docs/BRANCHING.md).
- Open architecture choices live in [`docs/DECISIONS/`](./docs/DECISIONS/) — don't silently resolve them.
