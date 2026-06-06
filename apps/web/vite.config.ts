import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Design generation no longer runs in a dev-only Vite middleware — it goes
 * through the InsForge `generate-design` edge function (see
 * apps/web/src/lib/generateImage.ts), which works identically in dev and prod
 * and persists each design. No server-side API keys live in the web app.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Load env (VITE_*) from the monorepo root .env, not apps/web.
  envDir: "../..",
  server: { port: 5173 },
});
