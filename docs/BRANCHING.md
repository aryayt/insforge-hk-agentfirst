# Branching & worktree workflow

Three humans + AI agents working in parallel against one repo and one shared InsForge backend. The rules exist so nobody's work clobbers anyone else's.

## Branches

- **`main`** — always deployable, protected. No direct commits. Merge via PR only.
- **Work branches** — short-lived, one concern each. Naming: `<area>/<short-desc>`.

Areas map to the repo: `mcp`, `web`, `backend`, `shared`, `docs`, `chore`.

```
mcp/checkout-tool
web/design-studio
backend/catalog-schema
shared/order-types
docs/demo-script
```

## One worktree per branch

Worktrees let each person/agent have a clean checkout of a different branch simultaneously, without stashing. Trees live as **siblings** of the repo in `../insforge-hk-worktrees/<branch-slug>` (kept out of the repo dir).

```bash
scripts/wt.sh new mcp/checkout-tool        # create branch + worktree off main
scripts/wt.sh new web/design-studio main   # explicit base
scripts/wt.sh list                          # show all worktrees
scripts/wt.sh rm mcp/checkout-tool          # remove when merged
```

Each teammate runs `bunx @insforge/cli link --project-id 787adbc2-92c6-4b37-a0a9-3e8d94123584` once per machine (skills + `.insforge/project.json` are gitignored and per-machine).

## Commits & PRs

- Conventional commits: `feat(mcp): add create_checkout tool`, `fix(web): cart total rounding`, `docs(backend): add orders table`.
- Small PRs into `main`. At least skim-review from one other person/agent.
- Rebase on `main` before opening the PR; keep history clean.

## Shared backend discipline

We all point at the **same** InsForge project, so live schema edits are dangerous across branches:

- Schema changes go through **migrations**, not ad-hoc live table edits.
- Whoever changes schema updates `docs/BACKEND.md` + `packages/shared` in the **same** PR.
- Coordinate destructive changes (dropping/renaming columns) in the team channel first.

## Agent rules

- Never commit to `main`. Always a branch + worktree.
- Read `AGENTS.md` and `docs/DECISIONS/` before building; don't silently resolve an open decision.
- If you touch the catalog/design/order shape, change `packages/shared` first — it's the contract.
