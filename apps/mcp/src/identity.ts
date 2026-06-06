/**
 * TEMP identity shim. Carts and orders are per-user (RLS by `user_id`), but MCP OAuth
 * isn't wired yet (see docs/DECISIONS/0001 D4 + the auth stream). Until then, local dev
 * resolves the current user from `DEMO_USER_ID`, which must be a real `auth.users` id.
 *
 * Replace `getUserId()` with the authenticated MCP session identity once OAuth lands —
 * every per-user query in cart/checkout already threads `userId` through, so only this
 * function changes.
 */
export function getUserId(): string {
  const id = process.env.DEMO_USER_ID;
  if (!id) {
    throw new Error(
      "No user identity available. Set DEMO_USER_ID (a real auth.users id) for local dev until MCP OAuth is wired.",
    );
  }
  return id;
}
