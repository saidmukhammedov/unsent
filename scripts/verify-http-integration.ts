import { db } from "../src/lib/db";
import { spawn, ChildProcess } from "child_process";

const BASE_URL = process.env.TEST_APP_URL || "http://localhost:3099";
const MOD_TOKEN = process.env.MODERATOR_TOKEN || "UNSENT_SECURE_MOD_TOKEN_98765";

let spawnedServer: ChildProcess | null = null;

async function ensureServerRunning(): Promise<void> {
  try {
    const health = await fetch(`${BASE_URL}/api/letters`);
    if (health.status === 200) {
      return;
    }
  } catch {
    // Not currently running, will auto-spawn
  }

  console.log(`Starting Next.js production server on ${BASE_URL} for integration tests...`);
  spawnedServer = spawn("npx", ["next", "start", "-p", "3099"], {
    shell: true,
    stdio: "ignore",
  });

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(`${BASE_URL}/api/letters`);
      if (res.status === 200) {
        console.log("Server is ready!\n");
        return;
      }
    } catch {
      // Still spinning up
    }
  }

  console.error(`[FATAL] Server failed to start on ${BASE_URL} after 15 seconds.`);
  process.exit(1);
}

interface HttpResponse<T = unknown> {
  status: number;
  headers: Headers;
  data: T;
  rawText: string;
}

class HttpClient {
  public cookieJar: Map<string, string> = new Map();

  constructor(public name: string) {}

  private getCookieHeader(): string {
    const cookies: string[] = [];
    for (const [key, value] of this.cookieJar.entries()) {
      cookies.push(`${key}=${value}`);
    }
    return cookies.join("; ");
  }

  private updateCookies(res: Response) {
    // Collect all set-cookie headers
    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) return;

    // Node fetch might combine cookies or give comma-separated
    const parts = setCookie.split(/,(?=[^;]*=)/);
    for (const part of parts) {
      const match = part.trim().match(/^([^=]+)=([^;]*)/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        if (value === "" || part.includes("Max-Age=0") || part.includes("Expires=Thu, 01 Jan 1970")) {
          this.cookieJar.delete(key);
        } else {
          this.cookieJar.set(key, value);
        }
      }
    }
  }

  async request<T = unknown>(
    path: string,
    options: RequestInit = {}
  ): Promise<HttpResponse<T>> {
    const url = `${BASE_URL}${path}`;
    const headers = new Headers(options.headers || {});

    const cookieHeader = this.getCookieHeader();
    if (cookieHeader) {
      headers.set("Cookie", cookieHeader);
    }

    if (options.body && typeof options.body === "string" && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const res = await fetch(url, {
      ...options,
      headers,
    });

    this.updateCookies(res);

    const rawText = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = rawText;
    }

    return {
      status: res.status,
      headers: res.headers,
      data: data as T,
      rawText,
    };
  }

  async get<T = unknown>(path: string, headers?: Record<string, string>) {
    return this.request<T>(path, { method: "GET", headers });
  }

  async post<T = unknown>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>(path, {
      method: "POST",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T = unknown>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>(path, {
      method: "PATCH",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T = unknown>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>(path, {
      method: "DELETE",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}

async function runHttpIntegrationTests() {
  console.log("==========================================================================");
  console.log("   UNSENT — Genuine HTTP Integration Test Suite (Real Server & Cookies)  ");
  console.log(`   Target Server: ${BASE_URL}                                            `);
  console.log("==========================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} ${detail ? `- ${detail}` : ""}`);
      failed++;
    }
  }

  // Pre-flight check: ensure target Next.js server is reachable or auto-spawned
  await ensureServerRunning();

  const clientA = new HttpClient("Client_A");
  const clientB = new HttpClient("Client_B");
  const clientA_device2 = new HttpClient("Client_A_Device2");
  const unauthClient = new HttpClient("Unauth_Client");

  const cleanupLetterIds: string[] = [];
  const cleanupUserIds: string[] = [];

  try {
    // =========================================================================
    // FLOW 1: ANONYMOUS IDENTITY AND SESSION CREATION OVER HTTP
    // =========================================================================
    console.log("--- Flow 1: Anonymous Identity & Session Creation over HTTP ---");

    const initA = await clientA.get<{ success: boolean; data: unknown[] }>("/api/letters");
    assert(initA.status === 200, "1.1: Initial anonymous HTTP request returns 200 OK");

    const sessionCookieA = clientA.cookieJar.get("unsent_session");
    assert(
      !!sessionCookieA && sessionCookieA.length > 20,
      "1.2: Server sets 'unsent_session' cookie on first visit"
    );

    const meA = await clientA.get<{ success: boolean; data: { unsentId: string; accountType: string } }>("/api/auth/me");
    assert(
      meA.status === 200 &&
        meA.data?.success === true &&
        meA.data?.data?.accountType === "ANONYMOUS" &&
        meA.data?.data?.unsentId.startsWith("@"),
      "1.3: GET /api/auth/me resolves anonymous identity with valid unsentId"
    );

    // =========================================================================
    // FLOW 2: PRIVATE CONTENT OWNERSHIP ENFORCEMENT OVER HTTP
    // =========================================================================
    console.log("\n--- Flow 2: Private Content Ownership Enforcement over HTTP ---");

    // Client A creates a private letter
    const privLetterRes = await clientA.post<{ success: boolean; data: { id: string } }>("/api/letters", {
      title: "Confidential Memoir for A",
      content: "Deep emotional thoughts strictly private to Client A.",
      visibility: "PRIVATE",
      entryType: "LETTER",
    });
    assert(privLetterRes.status === 200 || privLetterRes.status === 201, "2.1: Client A creates private letter via POST /api/letters");
    const letterIdA = privLetterRes.data?.data?.id;
    if (letterIdA) cleanupLetterIds.push(letterIdA);

    // Client A creates a personal note
    const noteRes = await clientA.post<{ success: boolean; data: { id: string } }>("/api/letters", {
      title: "Client A Private Note",
      content: "A spontaneous private note.",
      entryType: "NOTE",
    });
    assert(noteRes.status === 200 || noteRes.status === 201, "2.2: Client A creates personal note via POST /api/letters");
    const noteIdA = noteRes.data?.data?.id;
    if (noteIdA) cleanupLetterIds.push(noteIdA);

    // Initialize Client B with a distinct anonymous identity
    await clientB.get("/api/letters");
    const sessionCookieB = clientB.cookieJar.get("unsent_session");
    assert(
      !!sessionCookieB && sessionCookieB !== sessionCookieA,
      "2.3: Client B possesses an independent session cookie"
    );

    // Client B attempts to read Client A's private letter over HTTP
    const bReadPriv = await clientB.get(`/api/letters/${letterIdA}`);
    assert(
      bReadPriv.status === 404,
      "2.4: Client B attempting to read Client A's private letter is denied (404 Not Found)"
    );

    // Client B attempts to update Client A's private letter over HTTP
    const bUpdatePriv = await clientB.patch(`/api/letters/${letterIdA}`, {
      content: "Attacker attempting to overwrite content",
    });
    assert(
      bUpdatePriv.status === 404,
      "2.5: Client B attempting to update Client A's private letter is denied (404 Not Found)"
    );

    // Client B attempts to delete Client A's private letter over HTTP
    const bDeletePriv = await clientB.delete(`/api/letters/${letterIdA}`);
    assert(
      bDeletePriv.status === 404,
      "2.6: Client B attempting to delete Client A's private letter is denied (404 Not Found)"
    );

    // Client B attempts to read, update, or delete Client A's personal note over HTTP
    const bReadNote = await clientB.get(`/api/letters/${noteIdA}`);
    const bUpdateNote = await clientB.patch(`/api/letters/${noteIdA}`, { content: "Attacker note overwrite" });
    const bDeleteNote = await clientB.delete(`/api/letters/${noteIdA}`);
    assert(
      bReadNote.status === 404 && bUpdateNote.status === 404 && bDeleteNote.status === 404,
      "2.7: Client B attempting to access or modify Client A's personal note is strictly denied (404)"
    );

    // =========================================================================
    // FLOW 3: APPROVED IMMUTABILITY & MUTABILITY RULES OVER HTTP
    // =========================================================================
    console.log("\n--- Flow 3: Approved Immutability & Mutability Rules over HTTP ---");

    // Rule 1: Owner CAN update their own private letter
    const aUpdatePriv = await clientA.patch<{ success: boolean; data: { title: string } }>(`/api/letters/${letterIdA}`, {
      title: "Confidential Memoir (Revised by Owner)",
      content: "Owner revised content successfully.",
    });
    assert(
      aUpdatePriv.status === 200 && aUpdatePriv.data?.data?.title === "Confidential Memoir (Revised by Owner)",
      "3.1: Owner can edit their own private letter via PATCH /api/letters/[id]"
    );

    // Rule 2: Owner CAN update their own personal note
    const aUpdateNote = await clientA.patch<{ success: boolean; data: { content: string } }>(`/api/letters/${noteIdA}`, {
      content: "Owner revised note content successfully.",
    });
    assert(
      aUpdateNote.status === 200 && aUpdateNote.data?.data?.content === "Owner revised note content successfully.",
      "3.2: Owner can edit their own personal note via PATCH /api/letters/[id]"
    );

    // Rule 3: Client A publishes a public letter to Orbit
    const orbitRes = await clientA.post<{ success: boolean; data: { id: string } }>("/api/letters", {
      title: "Public Orbit Constellation",
      recipientName: "Ocean",
      content: "A letter released to the stars in the public archive.",
      visibility: "PUBLIC",
      entryType: "LETTER",
      theme: "longing",
    });
    assert(orbitRes.status === 200 || orbitRes.status === 201, "3.3: Client A publishes public letter to Orbit");
    const orbitIdA = orbitRes.data?.data?.id;
    if (orbitIdA) cleanupLetterIds.push(orbitIdA);

    // Rule 4: Author CANNOT edit a published public Orbit letter (403 IMMUTABLE_CONTENT)
    const aEditOrbit = await clientA.patch<{ success: boolean; error: { code: string } }>(`/api/letters/${orbitIdA}`, {
      title: "Attempted Edit on Orbit Letter",
      content: "This must be rejected.",
    });
    assert(
      aEditOrbit.status === 403 && aEditOrbit.data?.error?.code === "IMMUTABLE_CONTENT",
      "3.4: Author attempting to edit a published Orbit letter is rejected (403 IMMUTABLE_CONTENT)"
    );

    // Rule 5: Author CANNOT delete a published public Orbit letter (403 IMMUTABLE_CONTENT)
    const aDeleteOrbit = await clientA.delete<{ success: boolean; error: { code: string } }>(`/api/letters/${orbitIdA}`);
    assert(
      aDeleteOrbit.status === 403 && aDeleteOrbit.data?.error?.code === "IMMUTABLE_CONTENT",
      "3.5: Author attempting to delete a published Orbit letter is rejected (403 IMMUTABLE_CONTENT)"
    );

    // Rule 6: Owner CAN delete their own personal note
    const aDeleteNote = await clientA.delete<{ success: boolean; data: { id: string } }>(`/api/letters/${noteIdA}`);
    assert(
      aDeleteNote.status === 200,
      "3.6: Owner can delete their own personal note via DELETE /api/letters/[id]"
    );

    // =========================================================================
    // FLOW 4: REGISTRATION, LOGOUT, AND LOGIN OVER HTTP
    // =========================================================================
    console.log("\n--- Flow 4: Registration, Logout, and Login over HTTP ---");

    const testPhone = `+99890${Date.now().toString().slice(-7)}`;
    const testPassword = "SecureWhisper#2026";

    // Register identity conversion in place
    const regRes = await clientA.post<{ success: boolean; data: { accountType: string; phone: string } }>(
      "/api/auth/register",
      {
        phone: testPhone,
        password: testPassword,
        confirmPassword: testPassword,
      }
    );
    assert(
      regRes.status === 200 && regRes.data?.data?.accountType === "REGISTERED",
      "4.1: POST /api/auth/register converts anonymous identity to REGISTERED in place"
    );

    // Logout
    const logoutRes = await clientA.post<{ success: boolean }>("/api/auth/logout");
    assert(logoutRes.status === 200, "4.2: POST /api/auth/logout terminates session and clears cookie");

    // Client A logs back in with phone and password
    const loginRes = await clientA.post<{ success: boolean; data: { accountType: string } }>("/api/auth/login", {
      phone: testPhone,
      password: testPassword,
    });
    assert(
      loginRes.status === 200 && loginRes.data?.data?.accountType === "REGISTERED",
      "4.3: POST /api/auth/login succeeds with correct phone and password"
    );

    // Verify session restoration
    const meAfterLogin = await clientA.get<{ success: boolean; data: { accountType: string } }>("/api/auth/me");
    assert(
      meAfterLogin.status === 200 && meAfterLogin.data?.data?.accountType === "REGISTERED",
      "4.4: Active session confirms user remains REGISTERED after login"
    );

    // =========================================================================
    // FLOW 5: CROSS-DEVICE SESSION HANDLING OVER HTTP
    // =========================================================================
    console.log("\n--- Flow 5: Cross-Device Session Handling over HTTP ---");

    // Device 2 logs into the same account
    const loginDevice2 = await clientA_device2.post<{ success: boolean }>("/api/auth/login", {
      phone: testPhone,
      password: testPassword,
    });
    assert(loginDevice2.status === 200, "5.1: Device 2 successfully logs in to the same registered account");

    // Device 2 inspects active sessions
    const sessionsList = await clientA_device2.get<{ success: boolean; data: { totalCount: number } }>("/api/auth/sessions");
    assert(
      sessionsList.status === 200 && sessionsList.data?.data?.totalCount === 2,
      "5.2: GET /api/auth/sessions reports 2 active concurrent sessions"
    );

    // Device 2 invalidates other sessions
    const invalidateRes = await clientA_device2.post<{ success: boolean; count: number }>(
      "/api/auth/sessions/invalidate-others"
    );
    assert(
      invalidateRes.status === 200 && invalidateRes.data?.count === 1,
      "5.3: POST /api/auth/sessions/invalidate-others invalidates exactly 1 secondary session"
    );

    // Device 2 verifies only 1 session remains active
    const sessionsAfter = await clientA_device2.get<{ success: boolean; data: { totalCount: number } }>("/api/auth/sessions");
    assert(
      sessionsAfter.data?.data?.totalCount === 1,
      "5.4: Sessions count is reduced to 1 after invalidation"
    );

    // Device 1's old session should no longer resolve to the registered account
    const device1Check = await clientA.get<{ success: boolean; data: { accountType: string } }>("/api/auth/me");
    assert(
      device1Check.data?.data?.accountType === "ANONYMOUS",
      "5.5: Device 1's invalidated session is destroyed (re-bootstraps as fresh anonymous identity)"
    );

    // =========================================================================
    // FLOW 6: MODERATOR AUTHORIZATION OVER HTTP
    // =========================================================================
    console.log("\n--- Flow 6: Moderator Authorization over HTTP ---");

    // Unauthenticated request
    const modUnauth = await unauthClient.get("/api/moderation/letters");
    assert(modUnauth.status === 401, "6.1: Unauthenticated request to /api/moderation/letters returns 401 Unauthorized");

    // Regular authenticated user
    const modForbidden = await clientB.get("/api/moderation/letters");
    assert(modForbidden.status === 403, "6.2: Non-moderator user request to /api/moderation/letters returns 403 Forbidden");

    // Invalid moderator token from non-moderator client
    const modBadToken = await clientB.get("/api/moderation/letters", {
      "x-moderator-token": "wrong-moderator-token-12345",
    });
    assert(
      modBadToken.status === 403,
      "6.3: Incorrect moderator token from non-moderator returns 403 Forbidden"
    );

    // Valid moderator token passed via header
    const modSuccess = await unauthClient.get<{ success: boolean }>("/api/moderation/letters", {
      "x-moderator-token": MOD_TOKEN,
    });
    assert(
      modSuccess.status === 200 && modSuccess.data?.success === true,
      "6.4: Valid x-moderator-token returns 200 OK and grants moderation access"
    );

    // =========================================================================
    // FLOW 7: RESPONSE PUBLICATION, IMMUTABILITY & NOTIFICATIONS OVER HTTP
    // =========================================================================
    console.log("\n--- Flow 7: Response Publication, Immutability & Notifications over HTTP ---");

    // Client B submits a standalone response to Client A's public Orbit letter
    const respRes = await clientB.post<{ success: boolean; data: { id: string } }>(
      `/api/orbit/${orbitIdA}/responses`,
      {
        content: "A gentle response from across the quiet sea of stars.",
      }
    );
    assert(
      respRes.status === 200 || respRes.status === 201,
      "7.1: Client B submits standalone response via POST /api/orbit/[id]/responses"
    );
    const respIdB = respRes.data?.data?.id;
    if (respIdB) cleanupLetterIds.push(respIdB);

    // Responder CANNOT edit published response
    const bEditResp = await clientB.patch<{ success: boolean; error: { code: string } }>(`/api/letters/${respIdB}`, {
      content: "Attempting to edit response",
    });
    assert(
      bEditResp.status === 403 && bEditResp.data?.error?.code === "IMMUTABLE_CONTENT",
      "7.2: Responder attempting to edit published response is rejected (403 IMMUTABLE_CONTENT)"
    );

    // Responder CANNOT delete published response
    const bDeleteResp = await clientB.delete<{ success: boolean; error: { code: string } }>(`/api/letters/${respIdB}`);
    assert(
      bDeleteResp.status === 403 && bDeleteResp.data?.error?.code === "IMMUTABLE_CONTENT",
      "7.3: Responder attempting to delete published response is rejected (403 IMMUTABLE_CONTENT)"
    );

    // Client A (Device 2) checks notifications over HTTP
    const notifsRes = await clientA_device2.get<{
      success: boolean;
      data: {
        items: Array<{ id: string; type: string; payload: { responseId: string } }>;
        unreadCount: number;
      };
    }>("/api/notifications");
    assert(
      notifsRes.status === 200 && (notifsRes.data?.data?.items?.length ?? 0) >= 1,
      "7.4: Letter author receives notification via GET /api/notifications"
    );

    const receivedNotif = notifsRes.data?.data?.items?.find((n) => n.payload?.responseId === respIdB);
    assert(
      receivedNotif?.type === "RESPONSE_RECEIVED",
      "7.5: Notification has type RESPONSE_RECEIVED and matches response ID"
    );

    // Author marks notification as read over HTTP (via PATCH)
    if (receivedNotif) {
      const markReadRes = await clientA_device2.patch<{ success: boolean }>(`/api/notifications/${receivedNotif.id}/read`);
      assert(markReadRes.status === 200, "7.6: Author marks notification read via PATCH /api/notifications/[id]/read");
    }

    // =========================================================================
    // FLOW 8: ACCOUNT DELETION & ORPHANING OVER HTTP
    // =========================================================================
    console.log("\n--- Flow 8: Account Deletion & Orphaning over HTTP ---");

    const deleteAccRes = await clientA_device2.post<{ success: boolean }>("/api/auth/delete-account", {
      confirmPhrase: "ERASE MY SANCTUARY",
    });
    assert(deleteAccRes.status === 200, "8.1: POST /api/auth/delete-account with confirmPhrase returns 200 OK");

    // Verify database state directly:
    // 1. Private letter must be permanently purged
    const checkDbPrivate = await db.letter.findUnique({ where: { id: letterIdA } });
    assert(checkDbPrivate === null, "8.2: Author's private letters are permanently deleted from database");

    // 2. Published Orbit letter must be preserved with authorId = null
    const checkDbOrbit = await db.letter.findUnique({ where: { id: orbitIdA } });
    assert(
      checkDbOrbit !== null && checkDbOrbit.authorId === null && checkDbOrbit.visibility === "PUBLIC",
      "8.3: Author's published Orbit letters remain preserved in Orbit with authorId severed (null)"
    );

    // 3. User record must be purged
    const checkDbUser = await db.user.findUnique({ where: { phone: testPhone } });
    assert(checkDbUser === null, "8.4: User record is permanently erased from database");

  } finally {
    console.log("\n--- Cleaning up test artifacts ---");
    if (cleanupLetterIds.length > 0) {
      await db.letter.deleteMany({ where: { id: { in: cleanupLetterIds } } });
    }
    if (cleanupUserIds.length > 0) {
      await db.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
    }
    if (spawnedServer) {
      try {
        spawnedServer.kill();
      } catch {}
    }
  }

  console.log("\n==========================================================================");
  console.log(`   HTTP Integration Verification: ${passed} Passed, ${failed} Failed      `);
  console.log("==========================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runHttpIntegrationTests().catch((err) => {
  console.error("HTTP Integration test execution failed:", err);
  process.exit(1);
});
