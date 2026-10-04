// In-memory failed-login limiter. State lives in one server instance, so on
// serverless hosting it is best effort: each warm instance counts separately
// and a cold start resets it. A strong password remains the real protection.

type Options = {
  // Failures per address before the first lockout.
  lockoutAfter: number;
  // First lockout; each further failure doubles it, up to maxDelayMs.
  baseDelayMs: number;
  maxDelayMs: number;
  // An address with no failures for this long starts over.
  forgetAfterMs: number;
  // Failures from all addresses combined allowed per window.
  globalMax: number;
  globalWindowMs: number;
  // Cap on tracked addresses so a flood cannot grow memory without bound.
  maxTracked: number;
};

const DEFAULTS: Options = {
  lockoutAfter: 5,
  baseDelayMs: 30_000,
  maxDelayMs: 15 * 60_000,
  forgetAfterMs: 60 * 60_000,
  globalMax: 50,
  globalWindowMs: 15 * 60_000,
  maxTracked: 10_000,
};

type Entry = { failures: number; blockedUntil: number; lastFailure: number };

export function createLoginLimiter(overrides: Partial<Options> = {}) {
  const o = { ...DEFAULTS, ...overrides };
  const byAddress = new Map<string, Entry>();
  // Timestamps of the latest failures from any address, oldest first.
  let recentFailures: number[] = [];

  function current(address: string, now: number) {
    const entry = byAddress.get(address);
    if (entry && now - entry.lastFailure > o.forgetAfterMs) {
      byAddress.delete(address);
      return undefined;
    }
    return entry;
  }

  return {
    // Milliseconds until this address may try again; 0 when allowed.
    retryAfter(address: string, now = Date.now()) {
      recentFailures = recentFailures.filter(
        (t) => now - t < o.globalWindowMs,
      );
      const globalWait =
        recentFailures.length >= o.globalMax
          ? recentFailures[0] + o.globalWindowMs - now
          : 0;
      const localWait = (current(address, now)?.blockedUntil ?? 0) - now;
      return Math.max(globalWait, localWait, 0);
    },
    fail(address: string, now = Date.now()) {
      recentFailures.push(now);
      if (recentFailures.length > o.globalMax) recentFailures.shift();
      const entry = current(address, now) ?? {
        failures: 0,
        blockedUntil: 0,
        lastFailure: now,
      };
      entry.failures++;
      entry.lastFailure = now;
      const excess = entry.failures - o.lockoutAfter;
      if (excess >= 0)
        entry.blockedUntil =
          now + Math.min(o.baseDelayMs * 2 ** excess, o.maxDelayMs);
      // Re-insert so Map order tracks recency and the oldest is evicted first.
      byAddress.delete(address);
      byAddress.set(address, entry);
      if (byAddress.size > o.maxTracked)
        byAddress.delete(byAddress.keys().next().value!);
    },
    succeed(address: string) {
      byAddress.delete(address);
    },
  };
}

export const loginLimiter = createLoginLimiter();
