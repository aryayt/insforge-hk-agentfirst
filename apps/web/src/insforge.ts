import { createClient } from "@insforge/sdk";

const baseUrl = import.meta.env.VITE_INSFORGE_API_BASE_URL as string;
const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY as string;

if (!baseUrl || !anonKey) {
  // Surfaced loudly in the console so a missing .env.local is obvious in dev.
  console.error(
    "Missing InsForge env. Set VITE_INSFORGE_API_BASE_URL + VITE_INSFORGE_ANON_KEY in the repo-root .env.local.",
  );
}

/** Browser (anon) client. Public catalog reads + anonymous guest checkout. */
export const insforge = createClient({ baseUrl, anonKey });

export const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
