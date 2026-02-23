const stores = new Map<string, Map<string, number[]>>();

interface RateLimitConfig {
  /** Max requests allowed in the window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
}

const PRESETS = {
  auth: { limit: 5, windowSeconds: 60 },
  verify: { limit: 10, windowSeconds: 60 },
  register: { limit: 3, windowSeconds: 60 },
  vote: { limit: 10, windowSeconds: 60 },
  api: { limit: 60, windowSeconds: 60 },
} as const;

type PresetName = keyof typeof PRESETS;

function getStore(name: string): Map<string, number[]> {
  let store = stores.get(name);
  if (!store) {
    store = new Map();
    stores.set(name, store);
  }
  return store;
}

/**
 * Sliding-window rate limiter. Returns { allowed, remaining, retryAfterSeconds }.
 * Call with a preset name or custom config.
 */
export function rateLimit(
  key: string,
  preset: PresetName | RateLimitConfig
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const config = typeof preset === "string" ? PRESETS[preset] : preset;
  const store = getStore(typeof preset === "string" ? preset : "custom");
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const cutoff = now - windowMs;

  let timestamps = store.get(key) || [];
  timestamps = timestamps.filter((t) => t > cutoff);

  if (timestamps.length >= config.limit) {
    const oldest = timestamps[0];
    const retryAfterSeconds = Math.ceil((oldest + windowMs - now) / 1000);
    store.set(key, timestamps);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  timestamps.push(now);
  store.set(key, timestamps);
  return { allowed: true, remaining: config.limit - timestamps.length, retryAfterSeconds: 0 };
}

/**
 * Extract a best-effort client IP from the request headers.
 */
export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

// Periodic cleanup every 5 minutes to prevent memory leaks
if (typeof globalThis !== "undefined") {
  const cleanupKey = "__rateLimitCleanup";
  if (!(globalThis as Record<string, unknown>)[cleanupKey]) {
    (globalThis as Record<string, unknown>)[cleanupKey] = true;
    setInterval(() => {
      const now = Date.now();
      for (const [, store] of stores) {
        for (const [key, timestamps] of store) {
          const filtered = timestamps.filter((t) => t > now - 300_000);
          if (filtered.length === 0) store.delete(key);
          else store.set(key, filtered);
        }
      }
    }, 300_000);
  }
}
