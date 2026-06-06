/**
 * Server-side Printful access for the MCP server. Reuses the canonical client and
 * catalog map from scripts/printful (the single source of truth for Printful IDs)
 * so the agent surface and the CLI place orders through identical code paths.
 *
 * SERVER-SIDE ONLY — holds PRINTFUL_API_KEY. Never import from apps/web.
 *
 * Bun auto-loads .env/.env.local from the *process* cwd (apps/mcp), but the key
 * lives in the repo-root .env.local, so we resolve it ourselves by walking up —
 * mirroring how insforge.ts locates InsForge creds.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PrintfulClient } from "../../../scripts/printful/client";

export { PrintfulClient } from "../../../scripts/printful/client";
export type {
  CreateOrderRequest,
  Order,
  OrderCosts,
  OrderItem,
  OrderRecipient,
} from "../../../scripts/printful/client";
export { resolvePrintfulVariant } from "../../../scripts/printful/catalog-map";

function findUp(name: string): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, name);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function readPrintfulKey(): string | undefined {
  const fromEnv = process.env.PRINTFUL_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  for (const file of [".env.local", ".env"]) {
    const path = findUp(file);
    if (!path) continue;
    const m = readFileSync(path, "utf8").match(/^PRINTFUL_API_KEY=(.*)$/m);
    const v = m?.[1]?.trim().replace(/^["']|["']$/g, "");
    if (v) return v;
  }
  return undefined;
}

/** Build a Printful client, or null when no key is configured (callers degrade gracefully). */
export function printfulFromEnv(): PrintfulClient | null {
  const key = readPrintfulKey();
  return key ? new PrintfulClient(key) : null;
}
