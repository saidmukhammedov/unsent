/**
 * UNSENT — Argon2 Concurrency Limiter & Bounded Queue Verification Suite
 *
 * Verifies:
 * 1. Concurrency limit throttles to MAX_CONCURRENT_ARGON2_OPERATIONS (2).
 * 2. Simultaneous bursts queue and complete safely without thread exhaustion.
 * 3. Queue exhaustion rejects excess requests immediately with Argon2OverloadError.
 * 4. Slot release reliability: all active/queued metrics return to zero on success/error.
 * 5. Recovery after overload: subsequent requests succeed normally.
 */

import {
  hashPassword,
  verifyPassword,
  getArgon2QueueMetrics,
  Argon2OverloadError,
  MAX_CONCURRENT_ARGON2_OPERATIONS,
  MAX_ARGON2_QUEUE_SIZE,
} from "../src/lib/auth/password";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    throw new Error(message);
  }
  console.log(`[PASS] ${message}`);
}

async function runArgon2ConcurrencyTests() {
  console.log("=== Argon2 Concurrency & Bounded Queue Verification ===\n");

  // -------------------------------------------------------------------------
  // Test 1: Baseline metrics & configuration
  // -------------------------------------------------------------------------
  console.log("Test 1: Sizing verification for 2-vCPU Cloud Run instance");
  const metrics = getArgon2QueueMetrics();
  assert(
    metrics.maxConcurrent === 2,
    `1.1: MAX_CONCURRENT_ARGON2_OPERATIONS is set to 2 (optimal for 2-vCPU / 8 threads)`
  );
  assert(
    metrics.maxQueue === 10,
    `1.2: MAX_ARGON2_QUEUE_SIZE is set to 10 (bounded memory ceiling)`
  );
  assert(
    metrics.active === 0 && metrics.queued === 0,
    `1.3: Initial queue state is completely idle`
  );

  // -------------------------------------------------------------------------
  // Test 2: Concurrent Burst Execution (4 operations = 2 active + 2 queued)
  // -------------------------------------------------------------------------
  console.log("\nTest 2: Concurrent burst execution within queue limits");
  const burstCount = 4;
  const passwords = Array.from({ length: burstCount }, (_, i) => `SecurePass#${i}#2026`);

  const t0 = Date.now();
  const hashPromises = passwords.map((p) => hashPassword(p));

  // Inspect metrics while operations are in flight
  await new Promise((r) => setTimeout(r, 20));
  const inFlightMetrics = getArgon2QueueMetrics();
  assert(
    inFlightMetrics.active <= MAX_CONCURRENT_ARGON2_OPERATIONS,
    `2.1: Active operations in flight (${inFlightMetrics.active}) never exceed MAX_CONCURRENT (${MAX_CONCURRENT_ARGON2_OPERATIONS})`
  );
  assert(
    inFlightMetrics.queued > 0 || inFlightMetrics.active === 2,
    `2.2: Concurrency limiter queues remaining operations in FIFO buffer`
  );

  const hashes = await Promise.all(hashPromises);
  const elapsed = Date.now() - t0;
  console.log(`   Burst of ${burstCount} operations completed in ${elapsed}ms.`);

  assert(hashes.length === burstCount, "2.3: All 4 burst operations completed successfully");
  assert(
    hashes.every((h) => h.startsWith("$argon2id$v=19$m=65536,t=3,p=4$")),
    "2.4: All generated hashes use exact OWASP Argon2id parameters (m=65536, t=3, p=4)"
  );

  const postBurstMetrics = getArgon2QueueMetrics();
  assert(
    postBurstMetrics.active === 0 && postBurstMetrics.queued === 0,
    "2.5: All slots released back to pool after completion"
  );

  // -------------------------------------------------------------------------
  // Test 3: Queue Exhaustion & Controlled Overload Rejection
  // Total capacity = maxConcurrent (2) + maxQueue (10) = 12 operations.
  // The 13th simultaneous request must be immediately rejected with Argon2OverloadError!
  // -------------------------------------------------------------------------
  console.log("\nTest 3: Queue exhaustion & controlled overload rejection");
  const totalSlots = MAX_CONCURRENT_ARGON2_OPERATIONS + MAX_ARGON2_QUEUE_SIZE; // 12
  const overloadTotal = totalSlots + 3; // 15 simultaneous requests

  const overloadPromises: Promise<string>[] = [];
  let overloadRejections = 0;

  for (let i = 0; i < overloadTotal; i++) {
    const promise = hashPassword(`OverloadPass#${i}#2026`).catch((err) => {
      if (err instanceof Argon2OverloadError) {
        overloadRejections++;
        return `OVERLOAD_REJECTED_${i}`;
      }
      throw err;
    });
    overloadPromises.push(promise);
  }

  const overloadResults = await Promise.all(overloadPromises);
  console.log(`   Dispatched ${overloadTotal} simultaneous operations. Overload rejections: ${overloadRejections}`);

  assert(
    overloadRejections >= 3,
    `3.1: Excess requests (${overloadRejections}) immediately rejected with Argon2OverloadError`
  );

  const successCount = overloadResults.filter((r) => r.startsWith("$argon2id$")).length;
  assert(
    successCount === totalSlots,
    `3.2: Exactly capacity limit (${totalSlots}) requests were processed without failing`
  );

  // -------------------------------------------------------------------------
  // Test 4: Slot Release Reliability After Overload
  // -------------------------------------------------------------------------
  console.log("\nTest 4: Slot release reliability");
  const recoveryMetrics = getArgon2QueueMetrics();
  assert(
    recoveryMetrics.active === 0 && recoveryMetrics.queued === 0,
    "4.1: Metrics returned to 0 active and 0 queued after overload drain"
  );

  // -------------------------------------------------------------------------
  // Test 5: System Recovery After Overload
  // Verify that new requests immediately succeed normally after the overload event
  // -------------------------------------------------------------------------
  console.log("\nTest 5: System recovery after overload");
  const postTestPass = "RecoveryPassword#2026";
  const postHash = await hashPassword(postTestPass);
  const postVerify = await verifyPassword(postTestPass, postHash);

  assert(
    postVerify === true,
    "5.1: New authentication requests process and verify cleanly after overload recovery"
  );

  console.log("\n=======================================================");
  console.log("   All Argon2 Concurrency & Queue Tests Passed!        ");
  console.log("=======================================================\n");
}

runArgon2ConcurrencyTests().catch((err) => {
  console.error("Argon2 concurrency test failed:", err);
  process.exit(1);
});
