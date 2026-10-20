/** A same-site path to continue to after sign-in ("/welcome?code=AB12CD"), or the default. Never another site. */
export function safeNext(next: string | null | undefined, fallback = "/home") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
