/**
 * Confirms the browser AI path: anon SDK `functions.invoke('generate-design')`
 * resolves to the deployed function and returns { design: { imageUrl } } — the
 * exact call studio.tsx makes. Run:
 *   cd apps/web && set -a; source ../../.env.local; set +a; bun verify-ai.ts
 */
import { createClient } from "@insforge/sdk";

const insforge = createClient({
  baseUrl: process.env.VITE_INSFORGE_API_BASE_URL!,
  anonKey: process.env.VITE_INSFORGE_ANON_KEY!,
});

const { data, error } = await insforge.functions.invoke("generate-design", {
  body: { prompt: "a minimal vector mountain sunrise", agentSource: "verify-ai" },
});

if (error) {
  console.error("✗ functions.invoke error", error);
  process.exitCode = 1;
} else {
  const url = (data as any)?.design?.imageUrl;
  if (url) console.log(`✓ SDK invoke → design.imageUrl: ${url.slice(0, 80)}…`);
  else {
    console.error("✗ no design.imageUrl in response:", JSON.stringify(data).slice(0, 200));
    process.exitCode = 1;
  }
}
