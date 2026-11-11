// Email Chekkr API — simple in-memory rate limiter (fixed window).
// Fine for a single server. When Email Chekkr runs on several servers (Phase 2), move the counters to a shared store.

/**
 * @param {{ windowMs: number, now?: () => number }} options
 */
export function createRateLimiter({ windowMs, now = Date.now }) {
  const buckets = new Map(); // key -> { count, resetAt }
  let lastSweep = now();

  function sweep(t) {
    if (t - lastSweep < windowMs) return;
    lastSweep = t;
    for (const [key, bucket] of buckets) if (bucket.resetAt <= t) buckets.delete(key);
  }

  /**
   * Counts one request for `key`.
   * @returns {{ allowed: boolean, limit: number, remaining: number, resetSeconds: number }}
   */
  function hit(key, limit) {
    const t = now();
    sweep(t);
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= t) {
      bucket = { count: 0, resetAt: t + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    const allowed = bucket.count <= limit;
    return {
      allowed,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      resetSeconds: Math.max(1, Math.ceil((bucket.resetAt - t) / 1000))
    };
  }

  return { hit, size: () => buckets.size };
}
