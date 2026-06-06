import { createAdminClient } from "@insforge/sdk";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Resolve InsForge credentials. In production (Fly/compute) these come from env.
 * For local dev we fall back to the CLI's linked-project file (`.insforge/project.json`).
 */
function resolveConfig(): { baseUrl: string; apiKey: string } {
  const envBase = process.env.INSFORGE_API_BASE_URL;
  const envKey = process.env.INSFORGE_API_KEY;
  if (envBase && envKey) return { baseUrl: envBase, apiKey: envKey };

  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, ".insforge/project.json");
    if (existsSync(candidate)) {
      const cfg = JSON.parse(readFileSync(candidate, "utf8")) as {
        oss_host: string;
        api_key: string;
      };
      return { baseUrl: envBase ?? cfg.oss_host, apiKey: envKey ?? cfg.api_key };
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(
    "Missing InsForge credentials. Set INSFORGE_API_BASE_URL + INSFORGE_API_KEY, or run from a linked project (.insforge/project.json).",
  );
}

const { baseUrl, apiKey } = resolveConfig();

/**
 * Trusted server-side client. Uses the project-admin API key, so it BYPASSES RLS —
 * every per-user query MUST be scoped by user_id in code.
 */
export const admin = createAdminClient({ baseUrl, apiKey });
