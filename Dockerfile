# agent-shop MCP server — deployed via `insforge compute deploy . --name agent-shop-mcp --port 8788`
# (InsForge runs this on Fly.io; see skills/insforge-cli/references/compute-deploy.md)
FROM oven/bun:1.3-slim

WORKDIR /app

# Workspace manifests first for layer caching.
COPY package.json bun.lock* ./
COPY apps/mcp/package.json apps/mcp/
COPY packages/shared/package.json packages/shared/

RUN bun install --frozen-lockfile || bun install

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/mcp apps/mcp

# mcp-use resolves its toolchain from cwd — run from apps/mcp like `bun run mcp:dev`.
WORKDIR /app/apps/mcp

# mcp-use defaults to binding localhost; Fly/compute routes to the container's
# private IP, so bind all interfaces or the service is unreachable (HTTP 000).
ENV HOST=0.0.0.0
ENV MCP_PORT=8788
EXPOSE 8788

# INSFORGE_API_BASE_URL, INSFORGE_API_KEY, MCP_PUBLIC_URL (+ optional OPENROUTER_*)
# are injected at deploy time via --env-file. Never bake keys into the image.
CMD ["bun", "src/server.ts"]
