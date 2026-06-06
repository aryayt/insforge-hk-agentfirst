type ErrorLike = {
  statusCode?: unknown;
  message?: unknown;
  cause?: unknown;
};

function asErrorLike(value: unknown): ErrorLike | null {
  return value && typeof value === "object" ? (value as ErrorLike) : null;
}

function statusCodeOf(value: unknown): number | null {
  const err = asErrorLike(value);
  return typeof err?.statusCode === "number" ? err.statusCode : null;
}

function messageOf(value: unknown): string {
  const err = asErrorLike(value);
  return typeof err?.message === "string" ? err.message : "";
}

export function isAuthError(error: unknown): boolean {
  if (statusCodeOf(error) === 401) return true;
  const cause = asErrorLike(error)?.cause;
  if (statusCodeOf(cause) === 401) return true;
  return /401|unauthoriz|not authenticated|invalid token/i.test(messageOf(error));
}
