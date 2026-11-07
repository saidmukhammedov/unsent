import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import crypto from "crypto";

export type RateLimitStatus = "allowed" | "rate_limited" | "service_unavailable";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  status: RateLimitStatus;
  error?: "SERVICE_UNAVAILABLE" | "RATE_LIMITED";
}

// In-memory sliding-window fallback exclusively for local development and test environments
interface RateLimitRecord {
  timestamps: number[];
}

const localRateLimitStore = new Map<string, RateLimitRecord>();

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
): RateLimitResult {
  const now = Date.now();
  const record = localRateLimitStore.get(key) || { timestamps: [] };

  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (record.timestamps.length >= maxRequests) {
    const oldest = record.timestamps[0];
    const resetMs = windowMs - (now - oldest);
    return {
      allowed: false,
      remaining: 0,
      resetMs,
      status: "rate_limited",
      error: "RATE_LIMITED",
    };
  }

  record.timestamps.push(now);
  localRateLimitStore.set(key, record);

  return {
    allowed: true,
    remaining: maxRequests - record.timestamps.length,
    resetMs: windowMs,
    status: "allowed",
  };
}

let redisClient: Redis | null = null;
const limiterCache = new Map<string, Ratelimit>();

/**
 * Sanitizes input text to strip potential phone numbers, IP addresses, credentials, or tokens.
 */
export function sanitizeLogMessage(message: string): string {
  if (!message || typeof message !== "string") return "";
  return message
    // Strip URLs with tokens or credentials
    .replace(/https?:\/\/[^\s:@]+:[^\s:@]+@[^\s/]+/gi, "https://[REDACTED_AUTH]@[HOST]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[REDACTED_TOKEN]")
    // Strip E.164-style phone numbers (+ followed by 9-15 digits, or standalone 9-15 digits)
    .replace(/(?:\+|%2B)[0-9]{9,15}\b/g, "[REDACTED_PHONE]")
    // Strip IPv4 addresses
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "[REDACTED_IP]")
    // Strip UUIDs / long hex identifiers
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[REDACTED_UUID]")
    // Strip Upstash tokens
    .replace(/(AX[a-zA-Z0-9_-]{20,})/g, "[REDACTED_UPSTASH_TOKEN]");
}

/**
 * Retrieves the secret key used for HMAC-SHA256 correlation hashing.
 * In production mode, RATE_LIMIT_LOG_SECRET is mandatory (min 16 characters).
 * If missing in production, throws a security error to prevent unkeyed hashing fallback.
 * In development/test mode, falls back to a deterministic development key if not configured.
 */
export function getLogHashSecret(secretOverride?: string): string {
  if (secretOverride) return secretOverride;

  const envSecret = process.env.RATE_LIMIT_LOG_SECRET;
  if (envSecret && envSecret.trim().length >= 16) {
    return envSecret.trim();
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[CRITICAL_SECURITY_ERROR] RATE_LIMIT_LOG_SECRET is required in production (min 16 characters) for keyed log correlation."
    );
  }

  return "unsent-development-log-hmac-secret-only-32chars";
}

/**
 * Derives a safe category and a keyed HMAC-SHA256 correlation ID for a rate-limit key.
 * Never leaks raw identifiers (phone numbers, IPs, user UUIDs) into log sinks.
 * In production, strictly requires a secret key and never falls back to unkeyed hashing.
 */
export function getSafeKeyCorrelation(
  key: string,
  secretOverride?: string
): { category: string; correlationId: string } {
  const parts = key.split(":");
  let category = "general";

  if (parts.length >= 2) {
    category = `${parts[0]}:${parts[1]}`;
  } else if (parts.length === 1) {
    category = parts[0];
  }

  const secret = getLogHashSecret(secretOverride);
  const correlationId = crypto
    .createHmac("sha256", secret)
    .update(key)
    .digest("hex")
    .slice(0, 16);

  return { category, correlationId };
}

export function getRedis(): Redis | null {
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

/**
 * Reset Redis client and cache (used in tests to simulate credential changes or disconnections)
 */
export function resetRedisClient(): void {
  redisClient = null;
  limiterCache.clear();
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
 * Bounded-time Redis connectivity probe.
 * Checks whether Redis is configured and actually reachable.
 * Never throws; returns safe structured status for /api/health without leaking raw credentials.
 */
export async function probeRedisConnectivity(timeoutMs: number = 2000): Promise<{
  configured: boolean;
  reachable: boolean;
  backend: "redis" | "memory";
  error?: "MISSING_CREDENTIALS" | "UNREACHABLE" | "TIMEOUT";
}> {
  const isProd = process.env.NODE_ENV === "production";
  const redis = getRedis();

  if (!redis) {
    if (isProd) {
      return {
        configured: false,
        reachable: false,
        backend: "redis",
        error: "MISSING_CREDENTIALS",
      };
    }
    // Development mode without credentials operates in memory
    return {
      configured: false,
      reachable: true,
      backend: "memory",
    };
  }

  try {
    let timeoutHandle: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs);
    });

    const pingPromise = redis.ping();
    const result = await Promise.race([pingPromise, timeoutPromise]);
    clearTimeout(timeoutHandle!);

    const isReachable = result === "PONG" || !!result;
    return {
      configured: true,
      reachable: isReachable,
      backend: "redis",
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      configured: true,
      reachable: false,
      backend: "redis",
      error: errorMsg === "TIMEOUT" ? "TIMEOUT" : "UNREACHABLE",
    };
  }
}

/**
 * Check if an action is allowed by rate limit.
 *
 * Security Invariants:
 * 1. In production (NODE_ENV === "production"):
 *    - Protected operations MUST NEVER proceed without an effective rate-limit decision.
 *    - Missing credentials, client construction failure, or Redis network errors MUST NOT fail open.
 *    - Infrastructure failures return status="service_unavailable" (never status="rate_limited").
 *    - Silent fallback to in-memory storage is strictly prohibited in production.
 * 2. In local development / test:
 *    - If Redis credentials are absent, falls back to in-memory sliding window for offline development.
 * 3. Log Safety:
 *    - Raw keys, phone numbers, IPs, and tokens are NEVER written to logs.
 *    - Logs only contain safe category and non-reversible correlation ID.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number = 10,
  windowMs: number = 60_000
): Promise<RateLimitResult> {
  const isProd = process.env.NODE_ENV === "production";
  let category = "general";
  let correlationId = "[UNKEYED_REJECTED]";

  try {
    const correlation = getSafeKeyCorrelation(key);
    category = correlation.category;
    correlationId = correlation.correlationId;
  } catch {
    if (isProd) {
      console.error(
        "[CRITICAL_RATE_LIMITER_CONFIG_ERROR] Failed to generate keyed correlation ID (missing RATE_LIMIT_LOG_SECRET in production). Refusing operation (fail-closed)."
      );
      return {
        allowed: false,
        remaining: 0,
        resetMs: 0,
        status: "service_unavailable",
        error: "SERVICE_UNAVAILABLE",
      };
    }
  }

  const redis = getRedis();

  if (!redis) {
    if (isProd) {
      console.error(
        `[CRITICAL_RATE_LIMITER_CONFIG_ERROR] Production environment lacks Redis credentials. Category: ${category}, CorrelationId: ${correlationId}. Refusing operation.`
      );
      return {
        allowed: false,
        remaining: 0,
        resetMs: 0,
        status: "service_unavailable",
        error: "SERVICE_UNAVAILABLE",
      };
    }

    // Local development or test without Upstash credentials
    return checkLocalRateLimit(key, maxRequests, windowMs);
  }

  try {
    const limiter = getUpstashLimiter(maxRequests, windowMs);
    if (!limiter) {
      if (isProd) {
        console.error(
          `[CRITICAL_RATE_LIMITER_FAILURE] Upstash limiter construction failed. Category: ${category}, CorrelationId: ${correlationId}.`
        );
        return {
          allowed: false,
          remaining: 0,
          resetMs: 0,
          status: "service_unavailable",
          error: "SERVICE_UNAVAILABLE",
        };
      }
      return checkLocalRateLimit(key, maxRequests, windowMs);
    }

    const result = await limiter.limit(key);
    return {
      allowed: result.success,
      remaining: result.remaining,
      resetMs: Math.max(0, result.reset - Date.now()),
      status: result.success ? "allowed" : "rate_limited",
      error: result.success ? undefined : "RATE_LIMITED",
    };
  } catch (error: unknown) {
    const rawError = error instanceof Error ? error.message : String(error);
    const sanitizedError = sanitizeLogMessage(rawError);

    console.error(
      `[CRITICAL_RATE_LIMITER_FAILURE] Upstash Redis request failed [category: ${category}, correlationId: ${correlationId}]: ${sanitizedError}`
    );

    if (isProd) {
      return {
        allowed: false,
        remaining: 0,
        resetMs: 0,
        status: "service_unavailable",
        error: "SERVICE_UNAVAILABLE",
      };
    }

    // In local dev/test mode, fall back to local store
    return checkLocalRateLimit(key, maxRequests, windowMs);
  }
}
