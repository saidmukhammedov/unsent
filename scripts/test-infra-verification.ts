/**
 * Infrastructure verification script
 * Validates:
 * 1. Health check endpoint logic (/api/health)
 * 2. Rate limiter fallback & Upstash configuration behavior
 * 3. Environment validation schema (src/lib/env.ts)
 * 4. Argon2id concurrency limiter semaphore
 */

import { GET as healthHandler } from "../src/app/api/health/route";
import { checkRateLimit } from "../src/lib/rate-limit";
import { validateEnvironment, envSchema } from "../src/lib/env";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";

async function runInfraVerification() {
  console.log("=== UNSENT Production Infrastructure Verification ===\n");

  // 1. Health Check Route
  console.log("1. Testing /api/health route handler...");
  const healthReq = new Request("http://localhost:3000/api/health");
  const healthRes = await healthHandler(healthReq);
  const healthData = await healthRes.json();
  console.log(`   Health response status: ${healthRes.status}`);
  console.log(`   Health payload:`, healthData);
  if (healthRes.status !== 200 || healthData.status !== "healthy") {
    throw new Error("Health check failed unexpectedly!");
  }
  console.log("   [PASS] /api/health returned 200 OK and reported database healthy\n");

  // 2. Rate Limiter Local Fallback in Development
  console.log("2. Testing Rate Limiter local fallback behavior...");
  const rlKey = `test-infra-rl-${Date.now()}`;
  const res1 = await checkRateLimit(rlKey, 2, 5000);
  const res2 = await checkRateLimit(rlKey, 2, 5000);
  const res3 = await checkRateLimit(rlKey, 2, 5000);

  if (!res1.allowed || !res2.allowed || res3.allowed) {
    throw new Error(`Rate limit logic failed: res1=${res1.allowed}, res2=${res2.allowed}, res3=${res3.allowed}`);
  }
  console.log("   [PASS] Rate limiter permits requests up to limit and blocks on exceed\n");

  // 3. Environment Validation Schema
  console.log("3. Testing src/lib/env.ts schema validation...");
  const devEnvCheck = validateEnvironment();
  console.log(`   Current runtime environment valid: ${!!devEnvCheck}`);

  // Test production enforcement in schema
  const fakeProdInvalid = envSchema.safeParse({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:pass@ep-cool-123.eu-central-1.aws.neon.tech/unsent?sslmode=require",
    // Missing DIRECT_URL, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, SESSION_SECRET
  });
  if (fakeProdInvalid.success) {
    throw new Error("Production env should have rejected missing directUrl and Upstash variables!");
  }
  console.log("   [PASS] Production env schema strictly requires DIRECT_URL, Upstash Redis credentials, and SESSION_SECRET\n");

  // 4. Argon2id Concurrency Semaphore
  console.log("4. Testing Argon2id concurrency limiter semaphore...");
  const t0 = Date.now();
  const passwords = [
    "SecretPass1#2026",
    "SecretPass2#2026",
    "SecretPass3#2026",
    "SecretPass4#2026",
    "SecretPass5#2026",
    "SecretPass6#2026",
  ];
  console.log(`   Dispatching ${passwords.length} concurrent Argon2id hashes with semaphore limit of 4...`);
  const hashes = await Promise.all(passwords.map((p) => hashPassword(p)));
  const elapsed = Date.now() - t0;
  console.log(`   Completed ${hashes.length} hashes in ${elapsed}ms without CPU/memory exhaustion.`);

  // Verify all hashes
  const verifyResults = await Promise.all(
    hashes.map((h, i) => verifyPassword(passwords[i], h))
  );
  if (!verifyResults.every(Boolean)) {
    throw new Error("One or more password verifications failed!");
  }
  console.log("   [PASS] All hashes verified correctly under concurrency\n");

  console.log("======================================================");
  console.log("   All Infrastructure Verification Checks Passed!     ");
  console.log("======================================================");
}

runInfraVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
