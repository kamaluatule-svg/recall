// Fixed-window in-memory rate limiter keyed by client IP. Good enough for one
// Render instance; see docs/adr for the move to a shared store if scaled out.

export function createRateLimiter({ limit, windowMs = 60_000, now = Date.now }) {
  const hits = new Map();
  const sweep = setInterval(() => {
    const t = now();
    for (const [key, entry] of hits) if (entry.resetAt <= t) hits.delete(key);
  }, windowMs);
  sweep.unref?.();

  return {
    /** Returns { ok, remaining, retryAfterSec }. */
    check(key) {
      const t = now();
      let entry = hits.get(key);
      if (!entry || entry.resetAt <= t) {
        entry = { count: 0, resetAt: t + windowMs };
        hits.set(key, entry);
      }
      entry.count += 1;
      return {
        ok: entry.count <= limit,
        remaining: Math.max(0, limit - entry.count),
        retryAfterSec: Math.ceil((entry.resetAt - t) / 1000),
      };
    },
    stop() {
      clearInterval(sweep);
    },
  };
}
