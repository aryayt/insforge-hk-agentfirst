#!/usr/bin/env bash
# Worktree helper. Trees live as siblings in ../insforge-hk-worktrees/<branch-slug>.
# Usage:
#   scripts/wt.sh new <area/desc> [base]   create branch + worktree (base defaults to main)
#   scripts/wt.sh list                      list worktrees
#   scripts/wt.sh rm <area/desc>            remove a worktree
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
TREES_DIR="$(dirname "$ROOT")/insforge-hk-worktrees"

cmd="${1:-list}"
case "$cmd" in
  new)
    branch="${2:?usage: wt.sh new <area/desc> [base]}"
    base="${3:-main}"
    slug="${branch//\//-}"
    mkdir -p "$TREES_DIR"
    git fetch origin "$base" --quiet 2>/dev/null || true
    if git show-ref --verify --quiet "refs/remotes/origin/$base"; then
      git worktree add -b "$branch" "$TREES_DIR/$slug" "origin/$base"
    else
      git worktree add -b "$branch" "$TREES_DIR/$slug" "$base"
    fi
    echo "→ worktree: $TREES_DIR/$slug   (branch '$branch' off '$base')"
    ;;
  list)
    git worktree list
    ;;
  rm)
    branch="${2:?usage: wt.sh rm <area/desc>}"
    slug="${branch//\//-}"
    git worktree remove "$TREES_DIR/$slug"
    echo "removed $TREES_DIR/$slug"
    ;;
  *)
    echo "usage: wt.sh [new <area/desc> [base] | list | rm <area/desc>]" >&2
    exit 1
    ;;
esac
