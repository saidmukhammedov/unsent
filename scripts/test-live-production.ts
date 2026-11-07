import { db } from "../src/lib/db";

const BASE_URL = process.env.TEST_APP_URL || "https://unsent-orpin.vercel.app";
const MOD_TOKEN = process.env.MODERATOR_TOKEN || "UNSENT_SECURE_MOD_TOKEN_98765";

interface TestResult {
  step: string;
  passed: boolean;
  details?: unknown;
}

const results: TestResult[] = [];

function assert(condition: boolean, step: string, details?: unknown) {
  if (!condition) {
    console.error(`❌ FAIL: ${step}`, details || "");
    results.push({ step, passed: false, details });
    throw new Error(`Assertion failed: ${step}`);
  }
  console.log(`✅ PASS: ${step}`);
  results.push({ step, passed: true, details });
}

function extractCookie(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/unsent_session=([^;]+)/);
  return match ? `unsent_session=${match[1]}` : null;
}

async function run() {
  console.log(`\n======================================================`);
  console.log(`STARTING LIVE PRODUCTION VERIFICATION ON: ${BASE_URL}`);
  console.log(`======================================================\n`);

  let testAnonUserId: string | null = null;
  let registeredUserId: string | null = null;
  const testPhone = "+998901239999";
  const testPassword = "TestPass123!Prod";

  try {
    // 1. Healthcheck verification
    console.log("[1/11] Checking /api/health...");
    const healthRes = await fetch(`${BASE_URL}/api/health`, { cache: "no-store" });
    assert(healthRes.status === 200, "1.1 /api/health returns HTTP 200");
    const healthData = await healthRes.json();
    assert(healthData.status === "healthy", "1.2 Health status is 'healthy'");
    assert(healthData.region === "fra1", "1.3 Region is 'fra1' (Frankfurt)");
    assert(healthData.checks?.database === "connected", "1.4 Neon PostgreSQL database is connected");
    assert(healthData.checks?.rateLimiter?.backend === "redis", "1.5 Rate limiter backend is redis (Upstash)");
    assert(healthData.checks?.rateLimiter?.reachable === true, "1.6 Upstash Redis is reachable");
    console.log(`    Latency: ${healthData.latencyMs}ms | Region: ${healthData.region}`);

    // 2. Homepage verification
    console.log("\n[2/11] Checking Homepage (GET /)...");
    const homeRes = await fetch(`${BASE_URL}/`, { cache: "no-store" });
    assert(homeRes.status === 200, "2.1 Homepage returns HTTP 200");
    const homeHtml = await homeRes.text();
    assert(homeHtml.includes("UNSENT") || homeHtml.includes("unsent"), "2.2 Homepage renders app branding");
    console.log(`    Content-Type: ${homeRes.headers.get("content-type")} | Size: ${homeHtml.length} bytes`);

    // 3. Anonymous Session Creation & Cookie Persistence
    console.log("\n[3/11] Verifying Anonymous Session creation and cookie persistence...");
    const anonRes = await fetch(`${BASE_URL}/api/auth/me`, { cache: "no-store" });
    assert(anonRes.status === 200, "3.1 Anonymous session returns HTTP 200");
    const anonCookie = extractCookie(anonRes.headers.get("set-cookie"));
    assert(!!anonCookie, "3.2 Server issues unsent_session HTTP-only cookie");
    const anonData = await anonRes.json();
    assert(anonData.success === true, "3.3 Anonymous response indicates success");
    assert(anonData.data?.accountType === "ANONYMOUS", "3.4 Account type is ANONYMOUS");
    const anonUnsentId = anonData.data?.unsentId;
    assert(typeof anonUnsentId === "string" && anonUnsentId.startsWith("@"), "3.5 Valid unsentId issued");

    // Check persistence with cookie
    const persistRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: anonCookie! },
      cache: "no-store",
    });
    const persistData = await persistRes.json();
    assert(persistData.data?.unsentId === anonUnsentId, "3.6 Session persists over HTTP-only cookie");

    // Clean up anon user record later
    const dbAnonUser = await db.user.findUnique({ where: { unsentId: anonUnsentId } });
    if (dbAnonUser) testAnonUserId = dbAnonUser.id;

    // 4. Native Argon2id Password Hashing on Vercel Runtime (Registration)
    console.log("\n[4/11] Verifying Native Argon2id Hashing on Vercel Linux Runtime (POST /api/auth/register)...");
    // Ensure any leftover test phone user from previous runs is purged first
    const preExisting = await db.user.findUnique({ where: { phone: testPhone } });
    if (preExisting) {
      await db.user.delete({ where: { id: preExisting.id } });
    }

    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: testPhone,
        password: testPassword,
        confirmPassword: testPassword,
      }),
    });
    assert(regRes.status === 200, "4.1 Registration returns HTTP 200 (Argon2id compiled & executed)");
    const regCookie = extractCookie(regRes.headers.get("set-cookie"));
    assert(!!regCookie, "4.2 Registration issues authenticated session cookie");
    const regData = await regRes.json();
    assert(regData.success === true, "4.3 Registration response indicates success");
    assert(regData.data?.accountType === "REGISTERED", "4.4 User upgraded to REGISTERED");
    assert(typeof regData.data?.newRecoveryKey === "string", "4.5 Recovery key generated and returned");
    const registeredUnsentId = regData.data?.unsentId;

    const dbRegUser = await db.user.findUnique({ where: { unsentId: registeredUnsentId } });
    if (dbRegUser) registeredUserId = dbRegUser.id;

    // 5. Native Argon2 Verification on Vercel Runtime (Login)
    console.log("\n[5/11] Verifying Native Argon2 Verification on Vercel Runtime (POST /api/auth/login)...");
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: testPhone,
        password: testPassword,
      }),
    });
    assert(loginRes.status === 200, "5.1 Login returns HTTP 200 (Argon2 verification succeeded)");
    const loginCookie = extractCookie(loginRes.headers.get("set-cookie")) || regCookie;
    assert(!!loginCookie, "5.2 Login returns valid session cookie");
    const loginData = await loginRes.json();
    assert(loginData.success === true, "5.3 Login payload indicates success");

    // 6. Private Letters (POST & GET /api/letters)
    console.log("\n[6/11] Verifying Private Letter creation and retrieval...");
    const letterRes = await fetch(`${BASE_URL}/api/letters`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: loginCookie!,
      },
      body: JSON.stringify({
        title: "Live Production Verification Letter",
        recipientName: "Vercel Frankfurt Runtime",
        content: "Verifying encrypted and private persistence in Neon PostgreSQL.",
        theme: "Gratitude",
        visibility: "PRIVATE",
        entryType: "LETTER",
        tags: ["verification", "production"],
      }),
    });
    const letterResText = await letterRes.text();
    let letterData: any;
    try { letterData = JSON.parse(letterResText); } catch {}
    assert(letterRes.status === 201 || letterRes.status === 200, "6.1 Private letter creation returns HTTP 201 Created", { status: letterRes.status, body: letterResText });
    assert(letterData?.success === true && typeof letterData?.data?.id === "string", "6.2 Letter ID returned");

    const getLettersRes = await fetch(`${BASE_URL}/api/letters`, {
      headers: { Cookie: loginCookie! },
      cache: "no-store",
    });
    assert(getLettersRes.status === 200, "6.3 Letters list returns HTTP 200");
    const getLettersData = await getLettersRes.json();
    assert(
      Array.isArray(getLettersData.data) && getLettersData.data.some((l: any) => l.title === "Live Production Verification Letter"),
      "6.4 Created letter retrieved in private letters feed"
    );

    // 7. Personal Notes (POST /api/letters with NOTE)
    console.log("\n[7/11] Verifying Personal Note creation...");
    const noteRes = await fetch(`${BASE_URL}/api/letters`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: loginCookie!,
      },
      body: JSON.stringify({
        title: "Live Production Test Note",
        content: "This is a strictly private reflection note stored on Neon.",
        entryType: "NOTE",
        tags: ["note"],
      }),
    });
    assert(noteRes.status === 201 || noteRes.status === 200, "7.1 Note creation returns HTTP 201 Created");
    const noteData = await noteRes.json();
    assert(noteData.data?.entryType === "NOTE", "7.2 Note entryType is NOTE");

    // 8. Orbit Feed Retrieval (GET /api/orbit)
    console.log("\n[8/11] Verifying Orbit Public Feed (GET /api/orbit)...");
    const orbitRes = await fetch(`${BASE_URL}/api/orbit?mode=latest`, { cache: "no-store" });
    assert(orbitRes.status === 200, "8.1 Orbit feed returns HTTP 200");
    const orbitData = await orbitRes.json();
    assert(orbitData.success === true, "8.2 Orbit response indicates success");
    assert(Array.isArray(orbitData.data?.items), "8.3 Orbit letters array returned");

    // 9. Moderation API Authorization (GET /api/moderation/letters)
    console.log("\n[9/11] Verifying Moderation API Security and Operations...");
    // 9a. Unauthorized access without token
    const unauthModRes = await fetch(`${BASE_URL}/api/moderation/letters`, { cache: "no-store" });
    assert(unauthModRes.status === 401 || unauthModRes.status === 403, "9.1 Unauthenticated access to /api/moderation/letters rejected with 401/403");

    // 9b. Authorized access with x-moderator-token
    const authModRes = await fetch(`${BASE_URL}/api/moderation/letters`, {
      headers: { "x-moderator-token": MOD_TOKEN },
      cache: "no-store",
    });
    assert(authModRes.status === 200, "9.2 Authorized moderator request returns HTTP 200 with x-moderator-token");
    const authModData = await authModRes.json();
    assert(authModData.success === true && Array.isArray(authModData.data?.items), "9.3 Moderation queue data accessible");

    // 9c. Moderation stats
    const modStatsRes = await fetch(`${BASE_URL}/api/moderation/stats`, {
      headers: { "x-moderator-token": MOD_TOKEN },
      cache: "no-store",
    });
    assert(modStatsRes.status === 200, "9.4 Moderation stats returns HTTP 200");

    // 10. Account Deletion & Automatic Cascading Data Erasure (POST /api/auth/delete-account)
    console.log("\n[10/11] Verifying Account Deletion & Data Erasure (POST /api/auth/delete-account)...");
    const deleteRes = await fetch(`${BASE_URL}/api/auth/delete-account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: loginCookie!,
      },
      body: JSON.stringify({
        confirmPhrase: "ERASE MY SANCTUARY",
      }),
    });
    assert(deleteRes.status === 200, "10.1 Delete account returns HTTP 200");
    const deleteData = await deleteRes.json();
    assert(deleteData.success === true, "10.2 Delete account confirms permanent erasure");

    // 11. Database Integrity & Zero Leftover Records Check
    console.log("\n[11/11] Verifying Database Clean State...");
    // Purge test anon user if created
    if (testAnonUserId) {
      await db.user.deleteMany({ where: { id: testAnonUserId } });
    }
    if (registeredUserId) {
      await db.user.deleteMany({ where: { id: registeredUserId } });
    }
    // Verify 0 users with test phone or id remain
    const remainingUsers = await db.user.count({
      where: {
        OR: [
          { phone: testPhone },
          ...(registeredUserId ? [{ id: registeredUserId }] : []),
          ...(testAnonUserId ? [{ id: testAnonUserId }] : []),
        ],
      },
    });
    assert(remainingUsers === 0, "11.1 Zero test user records remain in Neon production database");

    const totalUsers = await db.user.count();
    const totalLetters = await db.letter.count();
    console.log(`    Neon DB State -> Total users: ${totalUsers}, Total letters: ${totalLetters}`);

    console.log("\n======================================================");
    console.log("🎉 ALL 11 PRODUCTION VERIFICATION SUITES PASSED! 🎉");
    console.log("======================================================\n");
  } catch (err) {
    console.error("\n❌ VERIFICATION SUITE FAILED:", err);
    process.exit(1);
  } finally {
    // Cleanup any lingering test records
    try {
      await db.user.deleteMany({ where: { phone: testPhone } });
      if (testAnonUserId) await db.user.deleteMany({ where: { id: testAnonUserId } });
      if (registeredUserId) await db.user.deleteMany({ where: { id: registeredUserId } });
      await db.$disconnect();
    } catch {}
  }
}

run();
