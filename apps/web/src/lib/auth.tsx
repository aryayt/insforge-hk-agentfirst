import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { insforge } from "./insforge";

/**
 * Browser auth state for the studio. Wrapping <App/> in <AuthProvider> gives the
 * whole tree a `user` plus sign-in/up helpers via `useAuth()`. When a user is
 * signed in the InsForge SDK automatically attaches their access token to every
 * `functions.invoke` / `payments` call — so the `generate-design` function can
 * stamp `designs.user_id` with the real owner instead of saving a guest row.
 *
 * Email verification is required (6-digit code), so sign-up is a two-step flow:
 * signUp() → enter the emailed code → verifyEmail(), which signs the user in.
 */
export type AuthUser = {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
};

export type OAuthProvider = "google" | "github";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    name?: string,
  ) => Promise<{ requireVerification: boolean }>;
  verifyEmail: (email: string, otp: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type RawUser = {
  id?: string;
  email?: string;
  profile?: { name?: string; avatar_url?: string } | null;
} | null;

function toAuthUser(u: RawUser): AuthUser | null {
  if (!u?.id || !u.email) return null;
  return { id: u.id, email: u.email, name: u.profile?.name, avatarUrl: u.profile?.avatar_url };
}

function rethrow(error: unknown): never {
  throw error instanceof Error ? error : new Error(String(error));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Rehydrate the session on load. In a SPA the access token lives in memory, so
  // getCurrentUser() refreshes it from the httpOnly refresh cookie when present.
  useEffect(() => {
    let cancelled = false;
    insforge.auth
      .getCurrentUser()
      .then(({ data, error }) => {
        if (!cancelled) setUser(error ? null : toAuthUser(data?.user as RawUser));
      })
      .catch(() => !cancelled && setUser(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    async signIn(email, password) {
      const { data, error } = await insforge.auth.signInWithPassword({ email, password });
      if (error) rethrow(error);
      setUser(toAuthUser(data?.user as RawUser));
    },
    async signUp(email, password, name) {
      const { data, error } = await insforge.auth.signUp({ email, password, name });
      if (error) rethrow(error);
      if (data?.requireEmailVerification) return { requireVerification: true };
      setUser(toAuthUser(data?.user as RawUser));
      return { requireVerification: false };
    },
    async verifyEmail(email, otp) {
      // verifyEmail() saves the session itself on success.
      const { data, error } = await insforge.auth.verifyEmail({ email, otp });
      if (error) rethrow(error);
      setUser(toAuthUser(data?.user as RawUser));
    },
    async resendVerification(email) {
      const { error } = await insforge.auth.resendVerificationEmail({ email });
      if (error) rethrow(error);
    },
    async signInWithOAuth(provider) {
      // SPA flow: the SDK redirects to the provider and, on return, exchanges the
      // `insforge_code` for a session automatically (back at window.location.origin).
      const { error } = await insforge.auth.signInWithOAuth(provider, {
        redirectTo: window.location.origin,
      });
      if (error) rethrow(error);
    },
    async signOut() {
      await insforge.auth.signOut();
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
