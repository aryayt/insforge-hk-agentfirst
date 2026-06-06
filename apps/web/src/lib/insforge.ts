import { createClient } from "@insforge/sdk";

/**
 * Browser InsForge client (anon key). Used to read the public catalog and to
 * create Stripe Checkout Sessions — InsForge owns the Stripe secret key, the
 * browser only ever holds the anon key. Env comes from the repo-root .env
 * (vite envDir is set to "../..").
 */
const baseUrl = import.meta.env.VITE_INSFORGE_API_BASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY as string | undefined;

if (!baseUrl || !anonKey) {
  throw new Error(
    "Missing VITE_INSFORGE_API_BASE_URL / VITE_INSFORGE_ANON_KEY. Add them to the repo-root .env.",
  );
}

export const insforge = createClient({ baseUrl, anonKey });
