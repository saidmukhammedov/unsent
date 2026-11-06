import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// In-memory sliding-window fallback for local development and offline testing
interface RateLimitRecord {
  timestamps: number[];
}

const localRateLimitStore = new Map<string, RateLimitRecord>();

// Periodic in-memory cleanup (development only)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of localRateLimitStore.entries()) {
      record.timestamps = record.timestamps.filter((ts) => now - ts < 300_000);
      if (record.timestamps.length === 0) {
        localRateLimitStore.delete(key);
      }
    }
  }, 300_000).unref?.();
}

function checkLocalRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const record = localRateLimitStore.get(key) || { timestamps: [] };

  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (record.timestamps.length >= maxRequests) {
    const oldest = record.timestamps[0];
    const resetMs = windowMs - (now - oldest);
    return { allowed: false, remaining: 0, resetMs };
  }

  record.timestamps.push(now);
  localRateLimitStore.set(key, record);

  return {
    allowed: true,
    remaining: maxRequests - record.timestamps.length,
    resetMs: windowMs,
  };
}

let redisClient: Redis | null = null;
const limiterCache = new Map<string, Ratelimit>();

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis({
      url,
      token,
    });
  }

  return redisClient;
}

function getUpstashLimiter(maxRequests: number, windowMs: number): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;

  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  const cacheKey = `${maxRequests}:${windowSec}`;

  let limiter = limiterCache.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(maxRequests, `${windowSec} s`),
      analytics: false,
      prefix: "unsent:rl",
    });
    limiterCache.set(cacheKey, limiter);
  }

  return limiter;
}

/**
 * Returns current status of rate limiter configuration for health checks.
 */
export function getRateLimiterStatus(): {
  backend: "redis" | "memory" | "misconfigured";
  configured: boolean;
} {
  const isProd = process.env.NODE_ENV === "production";
  const hasCredentials = !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );

  if (hasCredentials) {
    return { backend: "redis", configured: true };
  }

  if (isProd) {
    return { backend: "misconfigured", configured: false };
  }

  return { backend: "memory", configured: true };
}

/**
 * Check if an action is allowed by rate limit.
 * Uses distributed Upstash Redis in production; falls back to in-memory sliding window
 * exclusively in development/test environments when Redis credentials are not configured.
 *
 * In production:
 * - If Redis is unavailable or fails, it logs a critical error and fails open safely
 *   to avoid blocking legitimate users indefinitely, without silently degrading to in-memory.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number = 10,
  windowMs: number = 60_000
): Promise<{ allowed: boolean; remaining: number; resetMs: number }> {
  const isProd = process.env.NODE_ENV === "production";
  const redis = getRedis();

  if (!redis) {
    if (isProd) {
      console.error(
        `[CRITICAL_RATE_LIMITER_CONFIG_ERROR] Production environment lacks UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN. Action for key "${key}" allowed (fail-open).`
      );
      return { allowed: true, remaining: 1, resetMs: 0 };
    }

    // Local development or test without Upstash credentials
    return checkLocalRateLimit(key, maxRequests, windowMs);
  }

  try {
    const limiter = getUpstashLimiter(maxRequests, windowMs);
    if (!limiter) {
      return { allowed: true, remaining: 1, resetMs: 0 };
    }

    const result = await limiter.limit(key);
    return {
      allowed: result.success,
      remaining: result.remaining,
      resetMs: Math.max(0, result.reset - Date.now()),
    };
  } catch (error) {
    console.error(
      `[CRITICAL_RATE_LIMITER_FAILURE] Upstash Redis rate limit request failed for key "${key}". Failing open safely:`,
      error
    );
    // Handle Redis failure safely and predictably: fail open without silent in-memory fallback
    return {
      allowed: true,
      remaining: 1,
      resetMs: 0,
    };
  }
}
