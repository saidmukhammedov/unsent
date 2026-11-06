import { db } from "../src/lib/db";
import { generateUnsentId } from "../src/lib/auth/identity";
import { generateRecoveryKey, hashSecret, parseRecoveryKey, verifySecret } from "../src/lib/auth/crypto";
import { generateSecureToken, hashToken, deleteAccountAndData } from "../src/lib/auth/session";
import { hashPassword, verifyPassword, validatePasswordStrength } from "../src/lib/auth/password";
import { normalizePhoneNumber } from "../src/lib/validation/phone";
import { evaluateSafety } from "../src/lib/safety/gate";
import {
  notifyAuthorOfResponse,
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../src/lib/notifications/service";
import { checkRateLimit } from "../src/lib/rate-limit";
import crypto from "crypto";

async function runMilestone9Tests() {
  console.log("==========================================================================");
  console.log("   UNSENT — Phase 5, Milestone 2: End-to-End Security & Production Readiness");
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

  const createdUserIds: string[] = [];
  const createdLetterIds: string[] = [];
  const createdSavedIds: string[] = [];
  const createdSessionIds: string[] = [];
  const createdReportIds: string[] = [];
  const createdModLogIds: string[] = [];
  const createdNotificationIds: string[] = [];

  try {
    // =========================================================================
    // SECTION 1: REAL USER JOURNEYS & LIFECYCLE
    // =========================================================================
    console.log("--- Section 1: Real User Journeys & Lifecycle ---");

    // 1.1 Anonymous Visitor Identity Creation
    const unsentId1 = generateUnsentId();
    const { recoveryKey: recKey1, recoveryTokenId: recTokenId1 } = generateRecoveryKey();
    const user1 = await db.user.create({
      data: {
        unsentId: unsentId1,
        accountType: "ANONYMOUS",
        role: "USER",
        recoveryTokenId: recTokenId1,
        recoveryKeyHash: await hashSecret(recKey1),
      },
    });
    createdUserIds.push(user1.id);

    const tokenRaw1 = generateSecureToken(32);
    const session1 = await db.session.create({
      data: {
        userId: user1.id,
        tokenHash: hashToken(tokenRaw1),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      },
    });
    createdSessionIds.push(session1.id);

    assert(
      user1.accountType === "ANONYMOUS" && user1.phone === null && user1.passwordHash === null,
      "1.1: Anonymous user created with persistent unsentId and no phone/password credentials"
    );

    // 1.2 Anonymous Content Creation (Private letter, personal note, published Orbit letter)
    const privLetter1 = await db.letter.create({
      data: {
        authorId: user1.id,
        entryType: "LETTER",
        visibility: "PRIVATE",
        title: "Sanctuary Secret",
        recipientName: "Self",
        content: "A letter strictly meant for the private sanctuary.",
        tags: ["private"],
      },
    });
    createdLetterIds.push(privLetter1.id);

    const note1 = await db.letter.create({
      data: {
        authorId: user1.id,
        entryType: "NOTE",
        visibility: "PRIVATE",
        title: "Midnight Thought",
        content: "A quick spontaneous note kept strictly private.",
        tags: ["note"],
      },
    });
    createdLetterIds.push(note1.id);

    const orbitLetter1 = await db.letter.create({
      data: {
        authorId: user1.id,
        entryType: "LETTER",
        visibility: "PUBLIC",
        title: "A Letter to a Lost Star",
        recipientName: "Astra",
        content: "I watched the constellations align over the desert sky tonight, wondering where you wander.",
        theme: "longing",
        tags: ["stars", "night"],
        isModerated: false,
        moderationStatus: "APPROVED",
      },
    });
    createdLetterIds.push(orbitLetter1.id);

    assert(
      privLetter1.visibility === "PRIVATE" && note1.entryType === "NOTE" && orbitLetter1.visibility === "PUBLIC",
      "1.2: Anonymous identity successfully creates private letters, notes, and Orbit letters"
    );

    // 1.3 User Returns in Simulated Session
    const verifiedSession1 = await db.session.findUnique({
      where: { tokenHash: hashToken(tokenRaw1) },
      include: { user: true },
    });
    assert(
      verifiedSession1?.userId === user1.id && verifiedSession1.user.unsentId === unsentId1,
      "1.3: User session accurately resolves identity on return visits"
    );

    // 1.4 In-Place Conversion to Registered Account
    const phone1 = normalizePhoneNumber("+998 90 123 45 67");
    const pwdHash1 = await hashPassword("SerenityWhisper#2026");

    const convertedUser1 = await db.user.update({
      where: { id: user1.id },
      data: {
        accountType: "REGISTERED",
        phone: phone1,
        passwordHash: pwdHash1,
      },
    });

    assert(
      convertedUser1.id === user1.id &&
        convertedUser1.unsentId === unsentId1 &&
        convertedUser1.accountType === "REGISTERED" &&
        convertedUser1.phone === "+998901234567" &&
        convertedUser1.passwordHash?.startsWith("$argon2id$") === true,
      "1.4: In-place conversion preserves internal UUID, unsentId, and updates to REGISTERED with phone & Argon2id"
    );

    // 1.5 Content Association Continuity
    const user1Letters = await db.letter.findMany({
      where: { authorId: user1.id },
    });
    assert(
      user1Letters.length === 3 && user1Letters.some((l) => l.id === privLetter1.id) && user1Letters.some((l) => l.id === note1.id),
      "1.5: Private letters, personal notes, and Orbit letters remain seamlessly linked after conversion"
    );

    // 1.6 Multi-Device Login (Second Session Created)
    const tokenRaw1_device2 = generateSecureToken(32);
    const session1_device2 = await db.session.create({
      data: {
        userId: user1.id,
        tokenHash: hashToken(tokenRaw1_device2),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      },
    });
    createdSessionIds.push(session1_device2.id);

    const activeSessionsBefore = await db.session.count({ where: { userId: user1.id } });
    assert(activeSessionsBefore === 2, "1.6: User can maintain active sessions across multiple devices");

    // 1.7 Session Invalidation (Invalidate Other Sessions)
    // Keep device 2, invalidate device 1
    const invalidatedCount = await db.session.deleteMany({
      where: {
        userId: user1.id,
        NOT: { tokenHash: hashToken(tokenRaw1_device2) },
      },
    });
    const device1Check = await db.session.findUnique({ where: { tokenHash: hashToken(tokenRaw1) } });
    const device2Check = await db.session.findUnique({ where: { tokenHash: hashToken(tokenRaw1_device2) } });

    assert(
      invalidatedCount.count === 1 && device1Check === null && device2Check !== null,
      "1.7: Invalidation removes secondary sessions while preserving the initiating device session"
    );

    // 1.8 Logout and Re-Login
    // Terminate device 2 session
    await db.session.deleteMany({ where: { tokenHash: hashToken(tokenRaw1_device2) } });
    const noSessionsCheck = await db.session.count({ where: { userId: user1.id } });
    assert(noSessionsCheck === 0, "1.8: User logout cleanly terminates active session");

    // Re-login with phone and password
    const userForLogin = await db.user.findUnique({ where: { phone: phone1 || undefined } });
    const passwordMatch = userForLogin?.passwordHash
      ? await verifyPassword("SerenityWhisper#2026", userForLogin.passwordHash)
      : false;
    assert(passwordMatch === true, "1.8b: User successfully verifies credentials for re-login");

    const reLoginSessionToken = generateSecureToken(32);
    const newSession = await db.session.create({
      data: {
        userId: user1.id,
        tokenHash: hashToken(reLoginSessionToken),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      },
    });
    createdSessionIds.push(newSession.id);

    // 1.9 Personal Archive Export (JSON & Markdown Verification)
    const exportLetters = await db.letter.findMany({
      where: { authorId: user1.id, entryType: "LETTER" },
      select: { id: true, title: true, content: true, visibility: true, createdAt: true },
    });
    const exportNotes = await db.letter.findMany({
      where: { authorId: user1.id, entryType: "NOTE" },
      select: { id: true, title: true, content: true, createdAt: true },
    });

    const jsonExport = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      user: { unsentId: user1.unsentId, accountType: user1.accountType },
      letters: exportLetters,
      notes: exportNotes,
    };

    let mdExport = `# UNSENT Archive — ${user1.unsentId}\n\n`;
    mdExport += `## Private Sanctuary Letters\n`;
    for (const l of exportLetters.filter((x) => x.visibility === "PRIVATE")) {
      mdExport += `### ${l.title || "Untitled"}\n${l.content}\n\n`;
    }
    mdExport += `## Personal Notes\n`;
    for (const n of exportNotes) {
      mdExport += `### ${n.title || "Untitled Note"}\n${n.content}\n\n`;
    }

    assert(
      jsonExport.letters.length === 2 &&
        jsonExport.notes.length === 1 &&
        mdExport.includes("Sanctuary Secret") &&
        mdExport.includes("Midnight Thought") &&
        !mdExport.includes(pwdHash1),
      "1.9: Personal archive export formats valid JSON and Markdown without leaking password hashes or credentials"
    );

    // 1.10 Account Deletion & Orphaning
    // Add a response by user 1 to test orphaning of responses as well
    const respBy1 = await db.letter.create({
      data: {
        authorId: user1.id,
        parentLetterId: orbitLetter1.id,
        entryType: "RESPONSE",
        visibility: "PUBLIC",
        content: "Echoing across the quiet dark, your words reached someone.",
        isModerated: false,
        moderationStatus: "APPROVED",
      },
    });
    createdLetterIds.push(respBy1.id);

    // Perform account deletion
    await deleteAccountAndData(user1.id);

    const deletedUserCheck = await db.user.findUnique({ where: { id: user1.id } });
    const deletedPrivateCheck = await db.letter.findUnique({ where: { id: privLetter1.id } });
    const deletedNoteCheck = await db.letter.findUnique({ where: { id: note1.id } });
    const orphanedOrbitLetter = await db.letter.findUnique({ where: { id: orbitLetter1.id } });
    const orphanedResponse = await db.letter.findUnique({ where: { id: respBy1.id } });
    const deletedSessions = await db.session.findMany({ where: { userId: user1.id } });

    assert(
      deletedUserCheck === null &&
        deletedPrivateCheck === null &&
        deletedNoteCheck === null &&
        deletedSessions.length === 0,
      "1.10a: Account deletion permanently erases user record, private letters, personal notes, and sessions"
    );

    assert(
      orphanedOrbitLetter !== null &&
        orphanedOrbitLetter.authorId === null &&
        orphanedOrbitLetter.visibility === "PUBLIC" &&
        orphanedResponse !== null &&
        orphanedResponse.authorId === null &&
        orphanedResponse.visibility === "PUBLIC",
      "1.10b: Published Orbit letters and responses remain preserved in Orbit with authorId severed (null)"
    );

    // 1.11 Post-Deletion Lockout
    const deletedPhoneLogin = await db.user.findUnique({ where: { phone: phone1 || undefined } });
    const deletedRecoveryCheck = await db.user.findUnique({ where: { recoveryTokenId: recTokenId1 } });
    assert(
      deletedPhoneLogin === null && deletedRecoveryCheck === null,
      "1.11: Post-deletion lockout guarantees former phone and recovery credentials cannot authenticate"
    );

    // =========================================================================
    // SECTION 2: AUTHORIZATION & PRIVACY AUDIT
    // =========================================================================
    console.log("\n--- Section 2: Authorization & Privacy Audit ---");

    // Setup User A (Victim/Target) and User B (Attacker/Third-Party)
    const { recoveryKey: rkA, recoveryTokenId: rtiA } = generateRecoveryKey();
    const userA = await db.user.create({
      data: {
        unsentId: generateUnsentId(),
        accountType: "ANONYMOUS",
        recoveryTokenId: rtiA,
        recoveryKeyHash: await hashSecret(rkA),
      },
    });
    createdUserIds.push(userA.id);

    const { recoveryKey: rkB, recoveryTokenId: rtiB } = generateRecoveryKey();
    const userB = await db.user.create({
      data: {
        unsentId: generateUnsentId(),
        accountType: "ANONYMOUS",
        recoveryTokenId: rtiB,
        recoveryKeyHash: await hashSecret(rkB),
      },
    });
    createdUserIds.push(userB.id);

    // User A private letter & personal note
    const letterA = await db.letter.create({
      data: {
        authorId: userA.id,
        entryType: "LETTER",
        visibility: "PRIVATE",
        title: "Confidential Memoir",
        content: "Top secret emotional entry only meant for User A.",
      },
    });
    createdLetterIds.push(letterA.id);

    const noteA = await db.letter.create({
      data: {
        authorId: userA.id,
        entryType: "NOTE",
        visibility: "PRIVATE",
        title: "Secret Key Fragment",
        content: "Draft notes and private thoughts of User A.",
      },
    });
    createdLetterIds.push(noteA.id);

    // User A saves an Orbit letter with a private reflection note
    const orbitTarget = await db.letter.create({
      data: {
        authorId: userA.id,
        entryType: "LETTER",
        visibility: "PUBLIC",
        title: "Public Letter for Saving",
        recipientName: "Ocean",
        content: "Gentle waves lapping the quiet shore.",
        isModerated: false,
        moderationStatus: "APPROVED",
      },
    });
    createdLetterIds.push(orbitTarget.id);

    const savedA = await db.savedLetter.create({
      data: {
        userId: userA.id,
        letterId: orbitTarget.id,
        privateNote: "This touched my soul deeply in April.",
      },
    });
    createdSavedIds.push(savedA.id);

    // User A has a notification
    await notifyAuthorOfResponse({
      originalLetterId: orbitTarget.id,
      responseId: "resp-mock-1",
      responseContent: "I felt the same way by the coast.",
      responderId: userB.id,
    });
    const notifsA = await getUserNotifications(userA.id);
    assert(notifsA.length === 1, "2.1: Setup verified: User A has private records, reflections, and notifications");

    // 2.2 Cross-User Private Letter Access Control
    // Simulating access control in /api/letters/[id]
    const unauthorizedLetterFetch = await db.letter.findFirst({
      where: {
        id: letterA.id,
        authorId: userB.id, // User B trying to access User A's private letter
      },
    });
    assert(unauthorizedLetterFetch === null, "2.2: User B cannot access User A's private letter (query returns null / 404)");

    // 2.3 Cross-User Personal Note Access Control
    const unauthorizedNoteFetch = await db.letter.findFirst({
      where: {
        id: noteA.id,
        authorId: userB.id,
        entryType: "NOTE",
      },
    });
    assert(unauthorizedNoteFetch === null, "2.3: User B cannot access User A's personal notes");

    // 2.4 Cross-User Saved Letter & Reflection Note Protection
    const unauthorizedSavedFetch = await db.savedLetter.findFirst({
      where: {
        letterId: orbitTarget.id,
        userId: userB.id, // User B has not saved it
      },
    });
    assert(
      unauthorizedSavedFetch === null,
      "2.4: User B cannot read User A's private reflection note on saved letters"
    );

    // 2.5 Cross-User Notification Access & Manipulation
    const userBNotifs = await getUserNotifications(userB.id);
    assert(userBNotifs.length === 0, "2.5a: User B cannot see User A's notifications");

    // User B attempts to mark User A's notification as read
    const hackRead = await markNotificationAsRead(userB.id, notifsA[0].id);
    assert(hackRead === false, "2.5b: User B cannot mark User A's notification as read (rejected with false / 0 rows)");

    // 2.6 Public Orbit Data Leakage Prevention
    // In Orbit endpoints, fields selected must omit author internal UUID, phone, recovery keys, password hashes
    const publicOrbitQuery = await db.letter.findFirst({
      where: {
        id: orbitTarget.id,
        visibility: "PUBLIC",
        isModerated: false,
        entryType: "LETTER",
      },
      select: {
        id: true,
        title: true,
        recipientName: true,
        content: true,
        theme: true,
        createdAt: true,
        // Notice authorId, user, phone, passwordHash, recoveryTokenId are strictly EXCLUDED
      },
    });

    const publicJson = JSON.stringify(publicOrbitQuery);
    assert(
      !publicJson.includes(userA.id) &&
        !publicJson.includes("recoveryKeyHash") &&
        !publicJson.includes("passwordHash") &&
        !publicJson.includes("phone"),
      "2.6: Public Orbit endpoints strictly omit author UUID, phone number, password hash, and recovery keys"
    );

    // 2.7 Public Orbit Strict Moderation Filtering (Held / Rejected / Removed Letters Stay Invisible)
    const heldLetter = await db.letter.create({
      data: {
        authorId: userA.id,
        entryType: "LETTER",
        visibility: "PUBLIC",
        title: "Held Submission",
        content: "Call me at +1 415 555 0199 for more details.",
        isModerated: true,
        moderationStatus: "HELD",
      },
    });
    createdLetterIds.push(heldLetter.id);

    const rejectedLetter = await db.letter.create({
      data: {
        authorId: userA.id,
        entryType: "LETTER",
        visibility: "PUBLIC",
        title: "Rejected Submission",
        content: "This content violates terms and was rejected.",
        isModerated: true,
        moderationStatus: "REJECTED",
      },
    });
    createdLetterIds.push(rejectedLetter.id);

    const orbitFeed = await db.letter.findMany({
      where: {
        visibility: "PUBLIC",
        isModerated: false,
        entryType: "LETTER",
      },
    });

    assert(
      !orbitFeed.some((l) => l.id === heldLetter.id) && !orbitFeed.some((l) => l.id === rejectedLetter.id),
      "2.7: Held and Rejected letters are strictly excluded from public Orbit feeds"
    );

    // =========================================================================
    // SECTION 3: MODERATION & RESPONSE SYSTEM TESTING
    // =========================================================================
    console.log("\n--- Section 3: Moderation & Response System Testing ---");

    // 3.1 Safety Gate Evaluation
    const safeContent = "I never got to say goodbye before the train departed into the winter fog.";
    const heldContent = "Contact me at alice.smith@secretmail.com or call 555-987-6543 tonight.";
    const toxicContent = "I will track you down and hurt you kill die violent threat hate harassment";

    const resSafe = evaluateSafety(safeContent, "Alice", "Winter Departure");
    const resHeld = evaluateSafety(heldContent, "Alice", "Contact Request");
    const resBlocked = evaluateSafety(toxicContent, "Target", "Threat");

    assert(resSafe.action === "ALLOW", "3.1a: Benign literary content receives safety gate action ALLOW");
    assert(
      resHeld.action === "HOLD" && resHeld.detectedFlags.length > 0,
      "3.1b: Content with contact/identifying information receives safety gate action HOLD"
    );
    assert(
      resBlocked.action === "BLOCK",
      "3.1c: Threatening, toxic, or violent content receives safety gate action BLOCK"
    );

    // 3.2 Public Report Submission
    const report1 = await db.report.create({
      data: {
        reporterId: userB.id,
        letterId: orbitTarget.id,
        reason: "POTENTIAL_PII",
        details: "Concerned about possible references to private events.",
        status: "PENDING",
      },
    });
    createdReportIds.push(report1.id);

    const reportCheck = await db.report.findFirst({
      where: { letterId: orbitTarget.id, status: "PENDING" },
    });
    assert(reportCheck?.reason === "POTENTIAL_PII", "3.2: User B can submit report with PENDING status");

    // 3.3 Moderator Constant-Time Token Authentication Verification
    function safeCompareTokens(provided: string | null | undefined, expected: string): boolean {
      if (!provided || typeof provided !== "string") return false;
      const providedTrimmed = provided.trim();
      const expectedTrimmed = expected.trim();
      if (providedTrimmed.length === 0 || expectedTrimmed.length === 0) return false;

      const providedBuf = Buffer.from(providedTrimmed, "utf-8");
      const expectedBuf = Buffer.from(expectedTrimmed, "utf-8");

      if (providedBuf.length !== expectedBuf.length) {
        crypto.timingSafeEqual(expectedBuf, expectedBuf);
        return false;
      }

      return crypto.timingSafeEqual(providedBuf, expectedBuf);
    }

    const correctModToken = "UNSENT_SECURE_MOD_TOKEN_98765";
    const wrongModToken = "UNSENT_WRONG_MOD_TOKEN_12345";
    const differentLengthToken = "SHORT";

    assert(
      safeCompareTokens(correctModToken, correctModToken) === true,
      "3.3a: Constant-time comparison accepts matching moderator token"
    );
    assert(
      safeCompareTokens(wrongModToken, correctModToken) === false,
      "3.3b: Constant-time comparison rejects incorrect moderator token of same length"
    );
    assert(
      safeCompareTokens(differentLengthToken, correctModToken) === false,
      "3.3c: Constant-time comparison rejects incorrect moderator token of different length"
    );

    // 3.4 Moderator Workflow: APPROVE Held Letter
    await db.$transaction(async (tx) => {
      await tx.letter.update({
        where: { id: heldLetter.id },
        data: {
          isModerated: false,
          moderationStatus: "APPROVED",
          moderatedAt: new Date(),
        },
      });
      const log = await tx.moderationLog.create({
        data: {
          letterId: heldLetter.id,
          action: "APPROVE",
          reason: "Human review confirmed benign context.",
        },
      });
      createdModLogIds.push(log.id);
    });

    const approvedCheck = await db.letter.findUnique({ where: { id: heldLetter.id } });
    assert(
      approvedCheck?.isModerated === false && approvedCheck.moderationStatus === "APPROVED",
      "3.4: Moderator APPROVE action transitions held letter to approved & visible in Orbit"
    );

    // 3.5 Moderator Workflow: REJECT Held Letter
    const heldLetter2 = await db.letter.create({
      data: {
        authorId: userA.id,
        entryType: "LETTER",
        visibility: "PUBLIC",
        title: "Spam Letter",
        content: "Spam advertising external commercial service.",
        isModerated: true,
        moderationStatus: "HELD",
      },
    });
    createdLetterIds.push(heldLetter2.id);

    await db.$transaction(async (tx) => {
      await tx.letter.update({
        where: { id: heldLetter2.id },
        data: {
          isModerated: true,
          moderationStatus: "REJECTED",
          moderatedAt: new Date(),
        },
      });
      const log = await tx.moderationLog.create({
        data: {
          letterId: heldLetter2.id,
          action: "REJECT",
          reason: "Commercial spam solicitation.",
        },
      });
      createdModLogIds.push(log.id);
    });

    const rejectedCheck = await db.letter.findUnique({ where: { id: heldLetter2.id } });
    assert(
      rejectedCheck?.isModerated === true && rejectedCheck.moderationStatus === "REJECTED",
      "3.5: Moderator REJECT action permanently keeps rejected letter out of Orbit"
    );

    // 3.6 Moderator Workflow: REMOVE Published Letter
    await db.$transaction(async (tx) => {
      await tx.letter.update({
        where: { id: heldLetter.id },
        data: {
          isModerated: true,
          moderationStatus: "REMOVED",
          moderatedAt: new Date(),
        },
      });
      const log = await tx.moderationLog.create({
        data: {
          letterId: heldLetter.id,
          action: "REMOVE",
          reason: "Author requested removal or post-publish review.",
        },
      });
      createdModLogIds.push(log.id);
    });

    const removedCheck = await db.letter.findUnique({ where: { id: heldLetter.id } });
    assert(
      removedCheck?.isModerated === true && removedCheck.moderationStatus === "REMOVED",
      "3.6: Moderator REMOVE action immediately removes letter from Orbit"
    );

    // 3.7 Moderator Workflow: DISMISS_REPORTS
    await db.$transaction(async (tx) => {
      await tx.report.updateMany({
        where: { letterId: orbitTarget.id, status: "PENDING" },
        data: { status: "DISMISSED" },
      });
      const log = await tx.moderationLog.create({
        data: {
          letterId: orbitTarget.id,
          action: "DISMISS_REPORTS",
          reason: "Report reviewed and determined non-violating.",
        },
      });
      createdModLogIds.push(log.id);
    });

    const dismissedReports = await db.report.findMany({ where: { letterId: orbitTarget.id } });
    assert(
      dismissedReports.every((r) => r.status === "DISMISSED"),
      "3.7: Moderator DISMISS_REPORTS action resolves reports as DISMISSED without removing the letter"
    );

    // 3.8 Standalone Responses & Anonymous Notification Flow
    const resp1 = await db.letter.create({
      data: {
        authorId: userB.id,
        parentLetterId: orbitTarget.id,
        entryType: "RESPONSE",
        visibility: "PUBLIC",
        content: "I read your words about the gentle waves and felt peace wash over me.",
        isModerated: false,
        moderationStatus: "APPROVED",
      },
    });
    createdLetterIds.push(resp1.id);

    // Author receives notification
    const notified1 = await notifyAuthorOfResponse({
      originalLetterId: orbitTarget.id,
      responseId: resp1.id,
      responseContent: resp1.content,
      responderId: userB.id,
    });
    assert(notified1 === true, "3.8a: Author of Orbit letter receives notification for approved response");

    // Verify notification payload and unread status
    const unreadCountA = await getUnreadNotificationCount(userA.id);
    assert(unreadCountA >= 1, "3.8b: Author's unread notification count increases accurately");

    // Mark as read
    const allNotifsA = await getUserNotifications(userA.id);
    const targetNotif = allNotifsA.find((n) => {
      const p = n.payload as { responseId?: string } | null;
      return p?.responseId === resp1.id;
    });
    if (targetNotif) {
      await markNotificationAsRead(userA.id, targetNotif.id);
    }
    const readCheck = await db.notification.findUnique({ where: { id: targetNotif?.id } });
    assert(readCheck?.isRead === true, "3.8c: Author can mark notification as read");

    // Bulk mark as read
    await markAllNotificationsAsRead(userA.id);
    const unreadCountAfterBulk = await getUnreadNotificationCount(userA.id);
    assert(unreadCountAfterBulk === 0, "3.8d: Author can mark all notifications as read in bulk");

    // 3.9 Self-Response Notification Suppression
    // User A responds to User A's own letter
    const selfResp = await db.letter.create({
      data: {
        authorId: userA.id,
        parentLetterId: orbitTarget.id,
        entryType: "RESPONSE",
        visibility: "PUBLIC",
        content: "Adding my own reflection as the author.",
        isModerated: false,
        moderationStatus: "APPROVED",
      },
    });
    createdLetterIds.push(selfResp.id);

    const selfNotifResult = await notifyAuthorOfResponse({
      originalLetterId: orbitTarget.id,
      responseId: selfResp.id,
      responseContent: selfResp.content,
      responderId: userA.id, // Same as letter.authorId
    });
    assert(
      selfNotifResult === false,
      "3.9: Author responding to their own Orbit letter does NOT trigger a self-notification"
    );

    // 3.10 Duplicate Notification Prevention Across Multiple Responses
    // Create Response 2 from User B
    const resp2 = await db.letter.create({
      data: {
        authorId: userB.id,
        parentLetterId: orbitTarget.id,
        entryType: "RESPONSE",
        visibility: "PUBLIC",
        content: "A second distinct response to the same ocean letter.",
        isModerated: false,
        moderationStatus: "APPROVED",
      },
    });
    createdLetterIds.push(resp2.id);

    // First time for resp2: should notify
    const notifResp2First = await notifyAuthorOfResponse({
      originalLetterId: orbitTarget.id,
      responseId: resp2.id,
      responseContent: resp2.content,
      responderId: userB.id,
    });
    // Second time for resp2 (duplicate): should be blocked
    const notifResp2Duplicate = await notifyAuthorOfResponse({
      originalLetterId: orbitTarget.id,
      responseId: resp2.id,
      responseContent: resp2.content,
      responderId: userB.id,
    });
    assert(
      notifResp2First === true && notifResp2Duplicate === false,
      "3.10a: Duplicate notification for the same response is strictly prevented across sequential calls"
    );

    // 3.10b Concurrent Race Condition Test: Simultaneous notification attempts for exact same response
    const resp3 = await db.letter.create({
      data: {
        authorId: userB.id,
        parentLetterId: orbitTarget.id,
        entryType: "RESPONSE",
        visibility: "PUBLIC",
        content: "A third response to test simultaneous race-condition safety.",
        isModerated: false,
        moderationStatus: "APPROVED",
      },
    });
    createdLetterIds.push(resp3.id);

    // Launch 5 SIMULTANEOUS concurrent notification attempts
    const concurrentAttempts = await Promise.all([
      notifyAuthorOfResponse({
        originalLetterId: orbitTarget.id,
        responseId: resp3.id,
        responseContent: resp3.content,
        responderId: userB.id,
      }),
      notifyAuthorOfResponse({
        originalLetterId: orbitTarget.id,
        responseId: resp3.id,
        responseContent: resp3.content,
        responderId: userB.id,
      }),
      notifyAuthorOfResponse({
        originalLetterId: orbitTarget.id,
        responseId: resp3.id,
        responseContent: resp3.content,
        responderId: userB.id,
      }),
      notifyAuthorOfResponse({
        originalLetterId: orbitTarget.id,
        responseId: resp3.id,
        responseContent: resp3.content,
        responderId: userB.id,
      }),
      notifyAuthorOfResponse({
        originalLetterId: orbitTarget.id,
        responseId: resp3.id,
        responseContent: resp3.content,
        responderId: userB.id,
      }),
    ]);

    const successCount = concurrentAttempts.filter((res) => res === true).length;
    const failureCount = concurrentAttempts.filter((res) => res === false).length;
    const dbNotifCount = await db.notification.count({
      where: { idempotencyKey: `resp_notif:${orbitTarget.id}:${resp3.id}` },
    });

    assert(
      successCount === 1 && failureCount === 4 && dbNotifCount === 1,
      "3.10b: Database unique constraint guarantees exactly ONE notification created under 5 simultaneous concurrent attempts"
    );

    // 3.11 Held Responses Invisible in Orbit and No Early Notification
    const heldResp = await db.letter.create({
      data: {
        authorId: userB.id,
        parentLetterId: orbitTarget.id,
        entryType: "RESPONSE",
        visibility: "PUBLIC",
        content: "Call me for the secret answer at +1 800 555 1234.",
        isModerated: true,
        moderationStatus: "HELD",
      },
    });
    createdLetterIds.push(heldResp.id);

    // In Orbit responses query: where parentLetterId = orbitTarget.id, isModerated = false
    const orbitResponses = await db.letter.findMany({
      where: {
        parentLetterId: orbitTarget.id,
        entryType: "RESPONSE",
        visibility: "PUBLIC",
        isModerated: false,
      },
    });
    assert(
      !orbitResponses.some((r) => r.id === heldResp.id),
      "3.11: Held responses are strictly hidden from public Orbit letter responses"
    );

    // 3.12 Approved Immutability & Mutability Rules Verification
    // Rule 1: Private letters are editable and deletable by their owner
    const testPrivLetter = await db.letter.create({
      data: {
        authorId: userA.id,
        entryType: "LETTER",
        visibility: "PRIVATE",
        title: "Draft Memoir Initial Title",
        content: "Initial private draft content.",
      },
    });
    createdLetterIds.push(testPrivLetter.id);

    const editedPrivLetter = await db.letter.update({
      where: { id: testPrivLetter.id },
      data: {
        title: "Draft Memoir Revised Title",
        content: "Revised private draft content by owner.",
      },
    });
    assert(
      editedPrivLetter.title === "Draft Memoir Revised Title" &&
        editedPrivLetter.content === "Revised private draft content by owner.",
      "3.12a: Private letters are editable by their author"
    );

    await db.letter.delete({ where: { id: testPrivLetter.id } });
    const deletedPrivCheck = await db.letter.findUnique({ where: { id: testPrivLetter.id } });
    assert(deletedPrivCheck === null, "3.12b: Private letters are deletable by their author");

    // Rule 2: Personal notes are editable and deletable by their owner
    const testNote = await db.letter.create({
      data: {
        authorId: userA.id,
        entryType: "NOTE",
        visibility: "PRIVATE",
        title: "Original Quick Note",
        content: "Original note body.",
      },
    });
    createdLetterIds.push(testNote.id);

    const editedNote = await db.letter.update({
      where: { id: testNote.id },
      data: { content: "Updated note body by owner." },
    });
    assert(
      editedNote.content === "Updated note body by owner.",
      "3.12c: Personal notes are editable by their author"
    );

    await db.letter.delete({ where: { id: testNote.id } });
    const deletedNoteCheck312 = await db.letter.findUnique({ where: { id: testNote.id } });
    assert(deletedNoteCheck312 === null, "3.12d: Personal notes are deletable by their author");

    // Rule 3: Published Orbit letters are immutable to their author (simulating API logic)
    const canAuthorEditPublicLetter = orbitTarget.visibility !== "PUBLIC";
    const canAuthorDeletePublicLetter = orbitTarget.visibility !== "PUBLIC";
    assert(
      canAuthorEditPublicLetter === false && canAuthorDeletePublicLetter === false,
      "3.12e: Published Orbit letters cannot be edited or deleted by their authors"
    );

    // Rule 4: Published responses are immutable to their author
    const canAuthorEditResponse = resp1.visibility !== "PUBLIC";
    const canAuthorDeleteResponse = resp1.visibility !== "PUBLIC";
    assert(
      canAuthorEditResponse === false && canAuthorDeleteResponse === false,
      "3.12f: Published responses cannot be edited or deleted by their authors"
    );

    // Rule 5: Moderators retain the ability to remove content according to moderation rules
    const modRemoveCheck = await db.moderationLog.findFirst({
      where: { letterId: heldLetter.id, action: "REMOVE" },
    });
    assert(
      modRemoveCheck !== null,
      "3.12g: Moderators retain the authority to remove content according to sanctuary rules"
    );

    // =========================================================================
    // SECTION 4: AUTHENTICATION & RECOVERY SECURITY
    // =========================================================================
    console.log("\n--- Section 4: Authentication & Recovery Security ---");

    // 4.1 Argon2id Parameters & Verification
    const rawSecret = "Sanctuary!Security#9920";
    const argonHash = await hashPassword(rawSecret);

    assert(
      argonHash.startsWith("$argon2id$v=19$m=65536,t=3,p=4$"),
      "4.1a: Argon2id hash matches exact parameters (m=65536, t=3, p=4, v=19)"
    );

    const validPwdCheck = await verifyPassword(rawSecret, argonHash);
    const wrongPwdCheck = await verifyPassword("WrongPassword#9920", argonHash);
    assert(
      validPwdCheck === true && wrongPwdCheck === false,
      "4.1b: Argon2id verifies correct password and rejects incorrect password"
    );

    // 4.2 Password Strength Validation
    const weakShort = validatePasswordStrength("short"); // < 8 chars
    const weakNoNum = validatePasswordStrength("alllowercaseletters"); // no digits
    const weakNoLetter = validatePasswordStrength("1234567890"); // no letters
    const strong = validatePasswordStrength("C@lmSanctuary#2026"); // valid
    assert(
      !weakShort.isValid && !weakNoNum.isValid && !weakNoLetter.isValid && strong.isValid,
      "4.2: Password policy enforces minimum 8 characters, letters, and numbers/symbols"
    );

    // 4.3 Rate Limiting Protection (Sliding Window)
    const rateKey = `test-auth-bruteforce-${Date.now()}`;
    const limit = 5;
    let allowedCount = 0;
    let blockedCount = 0;

    for (let i = 0; i < 8; i++) {
      const res = await checkRateLimit(rateKey, limit, 60_000);
      if (res.allowed) allowedCount++;
      else blockedCount++;
    }

    assert(
      allowedCount === 5 && blockedCount === 3,
      "4.3: Sliding-window rate limiter permits allowed requests and blocks burst brute-force attacks"
    );

    // 4.4 Phone Normalization & Uzbekistan / International Formats
    const uz1 = normalizePhoneNumber("+998 90 123 45 67");
    const uz2 = normalizePhoneNumber("998901234567");
    const intlUS = normalizePhoneNumber("+1 (415) 555-2671");
    const intlUK = normalizePhoneNumber("00442071838750");

    assert(
      uz1 === "+998901234567" && uz2 === "+998901234567",
      "4.4a: Uzbekistan phone numbers normalize cleanly to E.164 +998XXXXXXXXX"
    );
    assert(
      intlUS === "+14155552671" && intlUK === "+442071838750",
      "4.4b: International E.164 and '00' prefixes normalize accurately"
    );

    const invalidPhoneCheck = normalizePhoneNumber("123-456");
    assert(invalidPhoneCheck === null, "4.4c: Ambiguous or unadorned local numbers are rejected");

    // 4.5 Phone Number Collision Rejection
    const uniqueTestPhone = `+99891${Date.now().toString().slice(-7)}`;
    const userReg1 = await db.user.create({
      data: {
        unsentId: generateUnsentId(),
        accountType: "REGISTERED",
        phone: uniqueTestPhone,
        passwordHash: await hashPassword("FirstUser#2026"),
        recoveryTokenId: generateRecoveryKey().recoveryTokenId,
        recoveryKeyHash: await hashSecret(generateRecoveryKey().recoveryKey),
      },
    });
    createdUserIds.push(userReg1.id);

    let collisionCaught = false;
    try {
      await db.user.create({
        data: {
          unsentId: generateUnsentId(),
          accountType: "REGISTERED",
          phone: uniqueTestPhone, // Duplicate phone
          passwordHash: await hashPassword("SecondUser#2026"),
          recoveryTokenId: generateRecoveryKey().recoveryTokenId,
          recoveryKeyHash: await hashSecret(generateRecoveryKey().recoveryKey),
        },
      });
    } catch (e: unknown) {
      if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
        collisionCaught = true;
      }
    }
    assert(collisionCaught === true, "4.5: Database unique constraint rejects phone number collision");

    // 4.6 Recovery Key Restoration & Integrity
    const { recoveryKey: recKeyTest, recoveryTokenId: recTokenIdTest } = generateRecoveryKey();
    const userWithRec = await db.user.create({
      data: {
        unsentId: generateUnsentId(),
        accountType: "ANONYMOUS",
        recoveryTokenId: recTokenIdTest,
        recoveryKeyHash: await hashSecret(recKeyTest),
      },
    });
    createdUserIds.push(userWithRec.id);

    const parsedRec = parseRecoveryKey(recKeyTest);
    assert(parsedRec !== null && parsedRec.recoveryTokenId === recTokenIdTest, "4.6a: Valid recovery key parses cleanly");

    const recUser = await db.user.findUnique({ where: { recoveryTokenId: parsedRec!.recoveryTokenId } });
    const recSecretMatch = recUser ? await verifySecret(parsedRec!.secret, recUser.recoveryKeyHash) : false;
    assert(recSecretMatch === true, "4.6b: Secret matches stored recoveryKeyHash");

    const wrongSecretMatch = recUser ? await verifySecret("wrong-secret-key-123", recUser.recoveryKeyHash) : false;
    assert(wrongSecretMatch === false, "4.6c: Invalid recovery key secret is rejected");

    // =========================================================================
    // SECTION 5: DATABASE RELIABILITY & CASCADING INTEGRITY
    // =========================================================================
    console.log("\n--- Section 5: Database Reliability & Cascading Integrity ---");

    // 5.1 Cascade Deletion of SavedLetter on Letter Deletion
    const tempLetter = await db.letter.create({
      data: {
        authorId: userA.id,
        entryType: "LETTER",
        visibility: "PUBLIC",
        title: "Temporary Letter",
        content: "Will be deleted to verify cascading cleanup.",
        isModerated: false,
        moderationStatus: "APPROVED",
      },
    });

    const tempSaved = await db.savedLetter.create({
      data: {
        userId: userB.id,
        letterId: tempLetter.id,
        privateNote: "Reflection on temporary letter.",
      },
    });

    const tempReport = await db.report.create({
      data: {
        reporterId: userB.id,
        letterId: tempLetter.id,
        reason: "INAPPROPRIATE_CONTENT",
        status: "PENDING",
      },
    });

    const tempModLog = await db.moderationLog.create({
      data: {
        letterId: tempLetter.id,
        action: "APPROVE",
        reason: "Initial approval.",
      },
    });

    // Delete the letter
    await db.letter.delete({ where: { id: tempLetter.id } });

    const checkSavedCascade = await db.savedLetter.findUnique({ where: { id: tempSaved.id } });
    const checkReportCascade = await db.report.findUnique({ where: { id: tempReport.id } });
    const checkModLogCascade = await db.moderationLog.findUnique({ where: { id: tempModLog.id } });

    assert(
      checkSavedCascade === null && checkReportCascade === null && checkModLogCascade === null,
      "5.1: Deleting a letter cascades and purges associated SavedLetter, Report, and ModerationLog records"
    );

    // 5.2 Cascade Deletion on User Deletion
    const userToCascade = await db.user.create({
      data: {
        unsentId: generateUnsentId(),
        accountType: "ANONYMOUS",
        recoveryTokenId: generateRecoveryKey().recoveryTokenId,
        recoveryKeyHash: await hashSecret(generateRecoveryKey().recoveryKey),
      },
    });

    const cascadeSession = await db.session.create({
      data: {
        userId: userToCascade.id,
        tokenHash: hashToken(generateSecureToken(32)),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });

    const cascadeNotif = await db.notification.create({
      data: {
        userId: userToCascade.id,
        type: "SYSTEM",
        payload: { message: "Welcome" },
      },
    });

    // Delete user
    await db.user.delete({ where: { id: userToCascade.id } });

    const checkCascadeSession = await db.session.findUnique({ where: { id: cascadeSession.id } });
    const checkCascadeNotif = await db.notification.findUnique({ where: { id: cascadeNotif.id } });

    assert(
      checkCascadeSession === null && checkCascadeNotif === null,
      "5.2: Deleting a user cascades and purges associated Session and Notification records"
    );

    // 5.3 Concurrency & Parallel Execution Safety
    const parallelResponses = await Promise.all([
      db.letter.create({
        data: {
          authorId: userB.id,
          parentLetterId: orbitTarget.id,
          entryType: "RESPONSE",
          visibility: "PUBLIC",
          content: "Parallel response Alpha",
          isModerated: false,
          moderationStatus: "APPROVED",
        },
      }),
      db.letter.create({
        data: {
          authorId: userB.id,
          parentLetterId: orbitTarget.id,
          entryType: "RESPONSE",
          visibility: "PUBLIC",
          content: "Parallel response Beta",
          isModerated: false,
          moderationStatus: "APPROVED",
        },
      }),
    ]);
    createdLetterIds.push(parallelResponses[0].id, parallelResponses[1].id);

    const parallelNotifs = await Promise.all([
      notifyAuthorOfResponse({
        originalLetterId: orbitTarget.id,
        responseId: parallelResponses[0].id,
        responseContent: parallelResponses[0].content,
        responderId: userB.id,
      }),
      notifyAuthorOfResponse({
        originalLetterId: orbitTarget.id,
        responseId: parallelResponses[1].id,
        responseContent: parallelResponses[1].content,
        responderId: userB.id,
      }),
    ]);

    assert(
      parallelNotifs[0] === true && parallelNotifs[1] === true,
      "5.3: Parallel response creation and notification dispatch execute safely without race conditions"
    );

  } finally {
    console.log("\n--- Cleaning up test artifacts ---");
    if (createdModLogIds.length > 0) {
      await db.moderationLog.deleteMany({ where: { id: { in: createdModLogIds } } });
    }
    if (createdReportIds.length > 0) {
      await db.report.deleteMany({ where: { id: { in: createdReportIds } } });
    }
    if (createdSavedIds.length > 0) {
      await db.savedLetter.deleteMany({ where: { id: { in: createdSavedIds } } });
    }
    if (createdNotificationIds.length > 0) {
      await db.notification.deleteMany({ where: { id: { in: createdNotificationIds } } });
    }
    if (createdSessionIds.length > 0) {
      await db.session.deleteMany({ where: { id: { in: createdSessionIds } } });
    }
    if (createdLetterIds.length > 0) {
      await db.letter.deleteMany({ where: { id: { in: createdLetterIds } } });
    }
    if (createdUserIds.length > 0) {
      await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  }

  console.log("\n==========================================================================");
  console.log(`   Verification Results: ${passed} Passed, ${failed} Failed   `);
  console.log("==========================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runMilestone9Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
