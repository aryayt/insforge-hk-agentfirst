import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useAuth, type OAuthProvider } from "../lib/auth";

/**
 * Header-right account control: shows the signed-in user's email + a sign-out
 * button, or a "Sign in" button that opens the auth dialog. Signing in lets the
 * studio attribute generated designs to the user (designs.user_id) instead of
 * saving them as guest rows.
 */
export function AccountControl() {
  const { user, loading, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  if (loading) {
    return <div className="h-8 w-20 animate-pulse rounded-lg bg-zinc-100" />;
  }

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <span className="hidden max-w-[180px] truncate text-sm text-zinc-600 sm:inline" title={user.email}>
          {user.name || user.email}
        </span>
        <button
          onClick={() => void signOut()}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-zinc-400"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Sign in
      </button>
      {open && <AuthDialog onClose={() => setOpen(false)} />}
    </>
  );
}

type Mode = "signin" | "signup" | "verify";

function AuthDialog({ onClose }: { onClose: () => void }) {
  const { signIn, signUp, verifyEmail, resendVerification, signInWithOAuth } = useAuth();
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
        onClose();
      });
    } else if (mode === "signup") {
      void run(async () => {
        const { requireVerification } = await signUp(email, password, name.trim() || undefined);
        if (requireVerification) {
          setMode("verify");
          setNotice(`We emailed a 6-digit code to ${email}.`);
        } else {
          onClose();
        }
      });
    } else {
      void run(async () => {
        await verifyEmail(email, otp.trim());
        onClose();
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
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Verify email"}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

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
