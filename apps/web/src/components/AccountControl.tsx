import { useAuth } from "../lib/auth";

/**
 * Header-right account control: shows the signed-in user's email + a sign-out
 * button, or a "Sign in" button that opens the auth dialog (rendered by
 * AuthProvider). Sign-in is required to design or buy.
 */
export function AccountControl() {
  const { user, loading, openAuth, signOut } = useAuth();

  if (loading) {
    return <div className="h-8 w-20 animate-pulse rounded-lg bg-zinc-100" />;
  }

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <span
          className="hidden max-w-[180px] truncate text-sm text-zinc-600 sm:inline"
          title={user.email}
        >
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
    <button
      onClick={openAuth}
      className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
    >
      Sign in
    </button>
  );
}
