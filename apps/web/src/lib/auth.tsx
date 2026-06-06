import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { insforge } from "./insforge";

/**
 * Browser auth state for the studio. Wrapping <App/> in <AuthProvider> gives the
 * whole tree a `user` plus sign-in/up helpers via `useAuth()`. When a user is
 * signed in the InsForge SDK automatically attaches their access token to every
 * `functions.invoke` / `payments` call — so the `generate-design` function can
 * stamp `designs.user_id` with the real owner instead of saving a guest row.
 *
 * Sign-in is REQUIRED to create or buy a design: gated actions call
 * `requireAuth()`, which opens the auth dialog and returns false when signed out.
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
  /** True if signed in; otherwise opens the auth dialog and returns false. */
  requireAuth: () => boolean;
  openAuth: () => void;
  closeAuth: () => void;
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
  const [authOpen, setAuthOpen] = useState(false);

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
    requireAuth() {
      if (user) return true;
      setAuthOpen(true);
      return false;
    },
    openAuth: () => setAuthOpen(true),
    closeAuth: () => setAuthOpen(false),
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

  return (
    <AuthContext.Provider value={value}>
      {children}
      {authOpen && <AuthDialog />}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

type Mode = "signin" | "signup" | "verify";

/** Sign in / sign up / verify-code modal, opened via `openAuth()`/`requireAuth()`. */
function AuthDialog() {
  const { signIn, signUp, verifyEmail, resendVerification, signInWithOAuth, closeAuth } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (mode === "signin") {
      void run(async () => {
        await signIn(email, password);
        closeAuth();
      });
    } else if (mode === "signup") {
      void run(async () => {
        const { requireVerification } = await signUp(email, password, name.trim() || undefined);
        if (requireVerification) {
          setMode("verify");
          setNotice(`We emailed a 6-digit code to ${email}.`);
        } else {
          closeAuth();
        }
      });
    } else {
      void run(async () => {
        await verifyEmail(email, otp.trim());
        closeAuth();
      });
    }
  }

  const oauth = (provider: OAuthProvider) =>
    void run(() => signInWithOAuth(provider)); // redirects away on success

  // Portal to <body>: the header's `backdrop-blur` is a containing block for
  // `position: fixed`, which would otherwise trap the overlay inside the header.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onClick={closeAuth}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Verify email"}
          </h2>
          <button onClick={closeAuth} className="text-zinc-400 hover:text-zinc-700" aria-label="Close">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-zinc-500">Sign in to design and order your tee.</p>

        {mode !== "verify" && (
          <>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => oauth("google")}
                disabled={busy}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400 disabled:opacity-50"
              >
                Continue with Google
              </button>
              <button
                onClick={() => oauth("github")}
                disabled={busy}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400 disabled:opacity-50"
              >
                Continue with GitHub
              </button>
            </div>
            <div className="my-4 flex items-center gap-3 text-xs text-zinc-400">
              <span className="h-px flex-1 bg-zinc-200" /> or <span className="h-px flex-1 bg-zinc-200" />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "signup" && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (optional)"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
            />
          )}

          {mode !== "verify" ? (
            <>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
              />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 6 characters)"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
              />
            </>
          ) : (
            <input
              inputMode="numeric"
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="6-digit code"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-center text-lg tracking-widest tabular-nums outline-none focus:border-zinc-500"
            />
          )}

          {notice && <p className="text-xs text-zinc-500">{notice}</p>}
          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:bg-zinc-300"
          >
            {busy
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : "Verify & sign in"}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-zinc-500">
          {mode === "signin" && (
            <button onClick={() => { setMode("signup"); setError(null); }} className="underline underline-offset-2 hover:text-zinc-900">
              Need an account? Create one
            </button>
          )}
          {mode === "signup" && (
            <button onClick={() => { setMode("signin"); setError(null); }} className="underline underline-offset-2 hover:text-zinc-900">
              Already have an account? Sign in
            </button>
          )}
          {mode === "verify" && (
            <button
              onClick={() => void run(async () => { await resendVerification(email); setNotice("Code re-sent."); })}
              className="underline underline-offset-2 hover:text-zinc-900"
            >
              Resend code
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
