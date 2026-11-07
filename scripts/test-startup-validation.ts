/**
 * UNSENT — Startup Environment Validation Test Suite
 *
 * Verifies:
 * 1. Missing DATABASE_URL prevents startup.
 * 2. Missing DIRECT_URL prevents production startup.
 * 3. Missing SESSION_SECRET prevents startup.
 * 4. Missing MODERATOR_TOKEN prevents startup.
 * 5. Missing Upstash credentials prevents production startup.
 * 6. Development mode remains usable without production credentials.
 * 7. Next.js instrumentation register() hook executes validation.
 */

import { validateEnvironment, resetCachedEnv } from "../src/lib/env";
import { register } from "../src/instrumentation";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    throw new Error(message);
  }
  console.log(`[PASS] ${message}`);
}

async function runStartupValidationTests() {
  console.log("=== Startup Environment Validation Verification ===\n");

  const validBase = {
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://postgres:password@localhost:5432/unsent_dev",
    SESSION_SECRET: "01234567890123456789012345678901", // 32 chars
    MODERATOR_TOKEN: "0123456789abcdef0123", // 20 chars
  };

  // -------------------------------------------------------------------------
  // Test 1: Missing DATABASE_URL prevents startup
  // -------------------------------------------------------------------------
  console.log("Test 1: Missing DATABASE_URL prevents startup");
  resetCachedEnv();
  let threwDb = false;
  try {
    validateEnvironment({
      ...validBase,
      DATABASE_URL: "",
    });
  } catch (err: unknown) {
    threwDb = true;
    assert(
      String(err).includes("DATABASE_URL is required"),
      "1.1: Error message explicitly identifies missing DATABASE_URL"
    );
  }
  assert(threwDb, "1.2: Startup aborted when DATABASE_URL is missing");

  // -------------------------------------------------------------------------
  // Test 2: Missing DIRECT_URL in production prevents startup
  // -------------------------------------------------------------------------
  console.log("\nTest 2: Missing DIRECT_URL in production prevents startup");
  resetCachedEnv();
  let threwDirect = false;
  try {
    validateEnvironment(
      {
        ...validBase,
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "AXtoken1234567890",
        RATE_LIMIT_LOG_SECRET: "test-log-secret-32chars-for-hmac",
        DIRECT_URL: "",
      },
      true
    );
  } catch (err: unknown) {
    threwDirect = true;
    assert(
      String(err).includes("DIRECT_URL"),
      "2.1: Error message explicitly identifies missing DIRECT_URL in production"
    );
  }
  assert(threwDirect, "2.2: Production startup aborted when DIRECT_URL is missing");

  // -------------------------------------------------------------------------
  // Test 3: Missing SESSION_SECRET prevents startup
  // -------------------------------------------------------------------------
  console.log("\nTest 3: Missing or short SESSION_SECRET prevents startup");
  resetCachedEnv();
  let threwSecret = false;
  try {
    validateEnvironment({
      ...validBase,
      SESSION_SECRET: "too-short", // < 32 chars
    });
  } catch (err: unknown) {
    threwSecret = true;
    assert(
      String(err).includes("SESSION_SECRET must be at least 32 characters"),
      "3.1: Error message requires at least 32 characters for SESSION_SECRET"
    );
  }
  assert(threwSecret, "3.2: Startup aborted when SESSION_SECRET is insufficient");

  // -------------------------------------------------------------------------
  // Test 4: Missing MODERATOR_TOKEN prevents startup
  // -------------------------------------------------------------------------
  console.log("\nTest 4: Missing or short MODERATOR_TOKEN prevents startup");
  resetCachedEnv();
  let threwMod = false;
  try {
    validateEnvironment({
      ...validBase,
      MODERATOR_TOKEN: "short", // < 16 chars
    });
  } catch (err: unknown) {
    threwMod = true;
    assert(
      String(err).includes("MODERATOR_TOKEN must be at least 16 characters"),
      "4.1: Error message requires at least 16 characters for MODERATOR_TOKEN"
    );
  }
  assert(threwMod, "4.2: Startup aborted when MODERATOR_TOKEN is insufficient");

  // -------------------------------------------------------------------------
  // Test 5: Missing Upstash credentials prevents production startup
  // -------------------------------------------------------------------------
  console.log("\nTest 5: Missing Upstash credentials in production prevents startup");
  resetCachedEnv();
  let threwUpstash = false;
  try {
    validateEnvironment(
      {
        ...validBase,
        NODE_ENV: "production",
        DIRECT_URL: "postgresql://postgres:password@localhost:5432/unsent_dev",
        RATE_LIMIT_LOG_SECRET: "test-log-secret-32chars-for-hmac",
        // Missing UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
      },
      true
    );
  } catch (err: unknown) {
    threwUpstash = true;
    assert(
      String(err).includes("UPSTASH_REDIS_REST_URL") && String(err).includes("UPSTASH_REDIS_REST_TOKEN"),
      "5.1: Error message explicitly identifies missing Upstash Redis variables"
    );
  }
  assert(threwUpstash, "5.2: Production startup aborted when Upstash credentials are missing");

  // -------------------------------------------------------------------------
  // Test 5b: Missing RATE_LIMIT_LOG_SECRET in production prevents startup
  // -------------------------------------------------------------------------
  console.log("\nTest 5b: Missing RATE_LIMIT_LOG_SECRET in production prevents startup");
  resetCachedEnv();
  let threwLogSecret = false;
  try {
    validateEnvironment(
      {
        ...validBase,
        NODE_ENV: "production",
        DIRECT_URL: "postgresql://postgres:password@localhost:5432/unsent_dev",
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "AXtoken1234567890",
        // Missing RATE_LIMIT_LOG_SECRET
      },
      true
    );
  } catch (err: unknown) {
    threwLogSecret = true;
    assert(
      String(err).includes("RATE_LIMIT_LOG_SECRET"),
      "5b.1: Error message explicitly identifies missing RATE_LIMIT_LOG_SECRET in production"
    );
  }
  assert(threwLogSecret, "5b.2: Production startup aborted when RATE_LIMIT_LOG_SECRET is missing");

  // -------------------------------------------------------------------------
  // Test 5c: Insufficient entropy (< 32 chars) for RATE_LIMIT_LOG_SECRET in production prevents startup
  // -------------------------------------------------------------------------
  console.log("\nTest 5c: Insufficient entropy for RATE_LIMIT_LOG_SECRET in production prevents startup");
  resetCachedEnv();
  let threwShortLogSecret = false;
  try {
    validateEnvironment(
      {
        ...validBase,
        NODE_ENV: "production",
        DIRECT_URL: "postgresql://postgres:password@localhost:5432/unsent_dev",
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "AXtoken1234567890",
        RATE_LIMIT_LOG_SECRET: "short-secret-only-25chars",
      },
      true
    );
  } catch (err: unknown) {
    threwShortLogSecret = true;
    assert(
      String(err).includes("RATE_LIMIT_LOG_SECRET (min 32 characters / 32 bytes entropy)"),
      "5c.1: Error message explicitly rejects RATE_LIMIT_LOG_SECRET with less than 32 characters of entropy"
    );
  }
  assert(threwShortLogSecret, "5c.2: Production startup aborted when RATE_LIMIT_LOG_SECRET has insufficient entropy");

  // -------------------------------------------------------------------------
  // Test 6: Development mode remains usable without production-only credentials
  // -------------------------------------------------------------------------
  console.log("\nTest 6: Development mode operates cleanly without production credentials");
  resetCachedEnv();
  const devEnv = validateEnvironment({
    ...validBase,
    NODE_ENV: "development",
    // DIRECT_URL, UPSTASH_REDIS_REST_URL, and UPSTASH_REDIS_REST_TOKEN omitted
  });
  assert(
    devEnv.NODE_ENV === "development" && !devEnv.DIRECT_URL && !devEnv.UPSTASH_REDIS_REST_URL,
    "6.1: Development environment successfully validated without production credentials"
  );

  // -------------------------------------------------------------------------
  // Test 7: Instrumentation hook executes and enforces validation on process.env
  // -------------------------------------------------------------------------
  console.log("\nTest 7: Instrumentation register() execution and enforcement");
  const prevRuntime = process.env.NEXT_RUNTIME;
  const originalProcessEnv = { ...process.env };
  process.env.NEXT_RUNTIME = "nodejs";

  try {
    // 7a: Verify register() throws if process.env is missing required vars
    (process.env as unknown as Record<string, string | undefined>) = { NEXT_RUNTIME: "nodejs" };
    resetCachedEnv();
    let threwInRegister = false;
    try {
      await register();
    } catch (err: unknown) {
      threwInRegister = true;
      assert(
        String(err).includes("DATABASE_URL"),
        "7.1: instrumentation register() actively blocks startup on missing process.env variables"
      );
    }
    assert(threwInRegister, "7.2: register() throws and blocks server start when process.env is invalid");

    // 7b: Verify register() succeeds when process.env has valid configuration
    (process.env as unknown as Record<string, string | undefined>) = {
      ...originalProcessEnv,
      NEXT_RUNTIME: "nodejs",
      DATABASE_URL: "postgresql://postgres:password@localhost:5432/unsent_dev",
      SESSION_SECRET: "01234567890123456789012345678901",
      MODERATOR_TOKEN: "0123456789abcdef0123",
      NODE_ENV: "development",
    };
    resetCachedEnv();
    await register();
    assert(true, "7.3: instrumentation register() executes and succeeds with valid environment");

    // 7c: Verify register() succeeds in production when all production secrets are provided
    (process.env as unknown as Record<string, string | undefined>) = {
      ...originalProcessEnv,
      NEXT_RUNTIME: "nodejs",
      DATABASE_URL: "postgresql://postgres:password@localhost:5432/unsent_dev",
      DIRECT_URL: "postgresql://postgres:password@localhost:5432/unsent_dev",
      SESSION_SECRET: "01234567890123456789012345678901",
      MODERATOR_TOKEN: "0123456789abcdef0123",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "AXtoken1234567890",
      RATE_LIMIT_LOG_SECRET: "test-log-secret-32chars-for-hmac",
      NODE_ENV: "production",
    };
    resetCachedEnv();
    await register();
    assert(true, "7.4: instrumentation register() executes and succeeds with full production environment");
  } finally {
    process.env = originalProcessEnv;
    if (prevRuntime !== undefined) {
      process.env.NEXT_RUNTIME = prevRuntime;
    } else {
      delete process.env.NEXT_RUNTIME;
    }
    resetCachedEnv();
  }

  console.log("\n=======================================================");
  console.log("   All Startup Validation Tests Passed!                ");
  console.log("=======================================================\n");
}

runStartupValidationTests().catch((err) => {
  console.error("Startup validation test failed:", err);
  process.exit(1);
});
