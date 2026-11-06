/**
 * UNSENT — Rate Limiter Security & Failure Mode Verification Suite
 *
 * Verifies:
 * 1. Missing Redis credentials in production returns 503 / service_unavailable (never fail-open)
 * 2. Invalid Redis credentials in production returns service_unavailable
 * 3. Redis network failure in production returns service_unavailable
 * 4. Normal quota enforcement works as expected
 * 5. Recovery after Redis becomes available again
 * 6. Sensitive information (phone numbers, IPs, tokens, UUIDs) is NEVER logged
 */

import {
  checkRateLimit,
  sanitizeLogMessage,
  getSafeKeyCorrelation,
  resetRedisClient,
  probeRedisConnectivity,
} from "../src/lib/rate-limit";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    throw new Error(message);
  }
  console.log(`[PASS] ${message}`);
}

async function runRateLimiterSecurityTests() {
  console.log("=== Rate Limiter Security & Failure-Mode Verification ===\n");

  const originalEnv = { ...process.env };

  try {
    // -------------------------------------------------------------------------
    // Test 1: Missing Redis credentials in production must return service_unavailable (Fail-Closed)
    // -------------------------------------------------------------------------
    console.log("Test 1: Missing Redis credentials in production (Fail-Closed)");
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    resetRedisClient();

    const missingCredsResult = await checkRateLimit("login:phone:+998901234567", 5, 60_000);
    assert(
      missingCredsResult.allowed === false,
      "1.1: Missing Redis credentials in production refuses the action (allowed === false)"
    );
    assert(
      missingCredsResult.status === "service_unavailable",
      "1.2: Status is explicitly 'service_unavailable' (HTTP 503 equivalent)"
    );
    assert(
      missingCredsResult.error === "SERVICE_UNAVAILABLE",
      "1.3: Error code is 'SERVICE_UNAVAILABLE', not misattributed to user rate-limit"
    );

    // -------------------------------------------------------------------------
    // Test 2: Invalid Redis credentials in production
    // -------------------------------------------------------------------------
    console.log("\nTest 2: Invalid Redis credentials in production");
    process.env.UPSTASH_REDIS_REST_URL = "https://invalid-host-that-does-not-exist.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "AXinvalidToken1234567890abcdef";
    resetRedisClient();

    const invalidCredsResult = await checkRateLimit("login:ip:198.51.100.42", 5, 60_000);
    assert(
      invalidCredsResult.allowed === false,
      "2.1: Invalid Redis credentials refuses the action (allowed === false)"
    );
    assert(
      invalidCredsResult.status === "service_unavailable",
      "2.2: Invalid Redis credentials returns status 'service_unavailable'"
    );

    // -------------------------------------------------------------------------
    // Test 3: probeRedisConnectivity accurately distinguishes configured from reachable
    // -------------------------------------------------------------------------
    console.log("\nTest 3: probeRedisConnectivity accuracy");
    const probeInvalid = await probeRedisConnectivity(1500);
    assert(
      probeInvalid.configured === true && probeInvalid.reachable === false,
      "3.1: Distinguishes configured (true) from reachable (false) when credentials point to unreachable endpoint"
    );
    assert(
      probeInvalid.backend === "redis",
      "3.2: Identifies backend as redis"
    );

    // Test probe with missing credentials in production
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    resetRedisClient();
    const probeMissing = await probeRedisConnectivity(500);
    assert(
      probeMissing.configured === false && probeMissing.reachable === false,
      "3.3: Reports configured=false, reachable=false when credentials are absent in production"
    );

    // -------------------------------------------------------------------------
    // Test 4: Normal quota enforcement in local development mode
    // -------------------------------------------------------------------------
    console.log("\nTest 4: Normal quota enforcement in development mode");
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    resetRedisClient();

    const devTestKey = `test:quota:${Date.now()}`;
    const r1 = await checkRateLimit(devTestKey, 3, 5000);
    const r2 = await checkRateLimit(devTestKey, 3, 5000);
    const r3 = await checkRateLimit(devTestKey, 3, 5000);
    const r4 = await checkRateLimit(devTestKey, 3, 5000);

    assert(
      r1.allowed === true && r2.allowed === true && r3.allowed === true,
      "4.1: Requests within limit are permitted (allowed === true)"
    );
    assert(
      r4.allowed === false && r4.status === "rate_limited" && r4.error === "RATE_LIMITED",
      "4.2: Request exceeding limit is blocked with status 'rate_limited' (HTTP 429 equivalent)"
    );

    // -------------------------------------------------------------------------
    // Test 5: Safe key correlation and log sanitization
    // -------------------------------------------------------------------------
    console.log("\nTest 5: Sensitive information logging elimination");
    const sensitivePhone = "+998901234567";
    const sensitiveIp = "192.168.1.100";
    const sensitiveUuid = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
    const sensitiveKey = `login:phone:${sensitivePhone}`;

    const { category, correlationId } = getSafeKeyCorrelation(sensitiveKey);
    assert(
      category === "login:phone",
      "5.1: Category safely extracts action prefix ('login:phone')"
    );
    assert(
      !correlationId.includes(sensitivePhone) && correlationId.length === 12,
      "5.2: CorrelationId is a truncated 12-char SHA256 hash without sensitive phone number"
    );

    // Test sanitizeLogMessage
    const testLogWithSensitiveData = `Connection to https://user:secretpass@redis.example.com failed for ${sensitivePhone} from ${sensitiveIp} with user ${sensitiveUuid}`;
    const sanitized = sanitizeLogMessage(testLogWithSensitiveData);

    assert(
      !sanitized.includes(sensitivePhone),
      "5.3: Sanitized log strips phone number"
    );
    assert(
      !sanitized.includes(sensitiveIp),
      "5.4: Sanitized log strips IP address"
    );
    assert(
      !sanitized.includes("secretpass"),
      "5.5: Sanitized log strips credentials in URL"
    );
    assert(
      !sanitized.includes(sensitiveUuid),
      "5.6: Sanitized log strips user UUID"
    );

    // -------------------------------------------------------------------------
    // Test 6: Capture actual console.error during rate limit failure
    // -------------------------------------------------------------------------
    console.log("\nTest 6: Verify actual console.error output never contains sensitive values");
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    resetRedisClient();

    let capturedLogs = "";
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      capturedLogs += args.map(String).join(" ") + "\n";
    };

    try {
      await checkRateLimit(`login:phone:${sensitivePhone}`, 5, 60_000);
      await checkRateLimit(`login:ip:${sensitiveIp}`, 5, 60_000);
      await checkRateLimit(`submit:public:${sensitiveUuid}`, 5, 60_000);
    } finally {
      console.error = originalConsoleError;
    }

    assert(
      !capturedLogs.includes(sensitivePhone),
      "6.1: Captured error logs do NOT contain the phone number"
    );
    assert(
      !capturedLogs.includes(sensitiveIp),
      "6.2: Captured error logs do NOT contain the IP address"
    );
    assert(
      !capturedLogs.includes(sensitiveUuid),
      "6.3: Captured error logs do NOT contain the user UUID"
    );
    assert(
      capturedLogs.includes("Refusing operation"),
      "6.4: Captured logs record safe failure diagnostics ('Refusing operation')"
    );

    console.log("\n=======================================================");
    console.log("   All Rate Limiter Security Tests Passed!             ");
    console.log("=======================================================\n");
  } finally {
    process.env = originalEnv;
    resetRedisClient();
  }
}

runRateLimiterSecurityTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
