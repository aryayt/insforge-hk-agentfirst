import { createAdminClient, createClient } from "@insforge/sdk";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Walk up from cwd looking for a file, return its path (or null). */
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

/** Read one var from the nearest .env (dev convenience; never committed). */
function readEnvVar(...names: string[]): string | undefined {
  for (const name of names) {
    const v = process.env[name];
    if (v) return v;
  }
  const envPath = findUp(".env");
  if (!envPath) return undefined;
  const body = readFileSync(envPath, "utf8");
  for (const name of names) {
    const m = body.match(new RegExp(`^${name}=(.*)$`, "m"));
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

/**
 * Resolve InsForge credentials. In production (Fly/compute) these come from env.
 * For local dev we fall back to the CLI's linked-project file (`.insforge/project.json`).
 */
function resolveConfig(): { baseUrl: string; apiKey: string } {
  const envBase = process.env.INSFORGE_API_BASE_URL;
  const envKey = process.env.INSFORGE_API_KEY;
  if (envBase && envKey) return { baseUrl: envBase, apiKey: envKey };

  const projectPath = findUp(".insforge/project.json");
  if (projectPath) {
    const cfg = JSON.parse(readFileSync(projectPath, "utf8")) as {
      oss_host: string;
      api_key: string;
    };
    return { baseUrl: envBase ?? cfg.oss_host, apiKey: envKey ?? cfg.api_key };
  }

  throw new Error(
    "Missing InsForge credentials. Set INSFORGE_API_BASE_URL + INSFORGE_API_KEY, or run from a linked project (.insforge/project.json).",
  );
}

const { baseUrl, apiKey } = resolveConfig();

/**
 * Trusted server-side client. Uses the project-admin API key, so it BYPASSES RLS —
 * every per-user query MUST be scoped by user_id in code. Used for catalog reads,
 * design lookups, and invoking the `generate-design` edge function.
 */
export const admin = createAdminClient({ baseUrl, apiKey });

/**
 * Anon-key client. Payments (Stripe Checkout) requires a user/anon token — the
 * admin key is rejected — so guest checkout from the agent surface goes through
 * this, exactly like the web studio's anon client.
 */
const anonKey = readEnvVar("INSFORGE_ANON_KEY", "VITE_INSFORGE_ANON_KEY");

export const anon = anonKey ? createClient({ baseUrl, anonKey }) : null;
