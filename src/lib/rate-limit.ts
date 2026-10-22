/*
 * A small sliding-window limiter for the few endpoints anyone can reach without
 * signing in. It lives in the memory of one server instance, so it slows
 * guessing and abuse but is not a hard guarantee across instances; for that, add a
 * rate-limit rule in the host's firewall as well.
 */

const hits = new Map<string, number[]>();
const MAX_KEYS = 5000;

/** Records a hit and returns the seconds to wait if `key` is over `limit` in `windowMs`, otherwise null. */
export function retryAfter(key: string, limit: number, windowMs: number, now = Date.now()): number | null {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > MAX_KEYS) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return null;
}

/** Public routes worth limiting, with how many requests one address may make in a window. */
export const LIMITS: { path: RegExp; limit: number; windowMs: number }[] = [
  { path: /^\/api\/auth\/(otp|password)$/, limit: 10, windowMs: 60_000 },
  { path: /^\/api\/share\/[^/]+\/rsvp$/, limit: 8, windowMs: 600_000 },
  { path: /^\/(join|s)\/[^/]+/, limit: 60, windowMs: 60_000 },
  { path: /^\/welcome\/join$/, limit: 10, windowMs: 60_000 },
];
