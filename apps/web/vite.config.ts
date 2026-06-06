import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

// Env (.env.local) lives at the repo root — one source of truth for all apps.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: resolve(__dirname, "../.."),
  server: { port: 5173, strictPort: false },
});
