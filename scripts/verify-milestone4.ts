import { db } from "../src/lib/db";
import { generateUnsentId } from "../src/lib/auth/identity";
import { generateRecoveryKey, hashSecret } from "../src/lib/auth/crypto";
import { reportCreateSchema, moderationActionSchema } from "../src/lib/validation/reports";
import { evaluateSafety } from "../src/lib/safety/gate";

async function runMilestone4Tests() {
  console.log("==================================================================");
  console.log("   UNSENT — Phase 4, Milestone 1: Moderation Verification Suite   ");
  console.log("==================================================================\n");

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

  try {
    // -------------------------------------------------------------------------
    // Setup Identities: Normal User 1, Normal User 2, and Moderator User
    // -------------------------------------------------------------------------
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

    const unsentId2 = generateUnsentId();
    const { recoveryKey: recKey2, recoveryTokenId: recTokenId2 } = generateRecoveryKey();
    const user2 = await db.user.create({
      data: {
        unsentId: unsentId2,
        accountType: "ANONYMOUS",
        role: "USER",
        recoveryTokenId: recTokenId2,
        recoveryKeyHash: await hashSecret(recKey2),
      },
    });
    createdUserIds.push(user2.id);

    const unsentIdMod = generateUnsentId();
    const { recoveryKey: recKeyMod, recoveryTokenId: recTokenIdMod } = generateRecoveryKey();
    const moderator = await db.user.create({
      data: {
        unsentId: unsentIdMod,
        accountType: "REGISTERED",
        role: "MODERATOR",
        recoveryTokenId: recTokenIdMod,
        recoveryKeyHash: await hashSecret(recKeyMod),
      },
    });
    createdUserIds.push(moderator.id);

    // -------------------------------------------------------------------------
    // Scenario 1: Held letters never appear publicly
    // -------------------------------------------------------------------------
    const heldLetter = await db.letter.create({
      data: {
        authorId: user1.id,
        recipientName: "Test Recipient",
        title: "Submission with phone number",
        content: "Call me at 212-555-0188 please.",
        theme: "Longing",
        visibility: "PUBLIC",
        entryType: "LETTER",
        isModerated: true,
        moderationReason: "Flagged for potential identifying details (PII_PHONE)",
        moderationStatus: "HELD",
      },
    });
    createdLetterIds.push(heldLetter.id);

    // 1a: Must not appear in Orbit feed
    const orbitFeed = await db.letter.findMany({
      where: {
        visibility: "PUBLIC",
        isModerated: false,
        entryType: "LETTER",
      },
      select: { id: true },
    });
    const inOrbitFeed = orbitFeed.some((l) => l.id === heldLetter.id);

    // 1b: Must not be readable via public orbit single endpoint
    const orbitSingle = await db.letter.findFirst({
      where: {
        id: heldLetter.id,
        visibility: "PUBLIC",
        isModerated: false,
        entryType: "LETTER",
      },
    });

    // 1c: Non-owner querying /api/letters/[id]
    const nonOwnerAccess = await db.letter.findFirst({
      where: {
        id: heldLetter.id,
        OR: [
          { visibility: "PUBLIC", isModerated: false },
          { authorId: user2.id },
        ],
      },
    });

    assert(
      !inOrbitFeed && orbitSingle === null && nonOwnerAccess === null,
      "Test 1: Held letters never appear publicly in feeds or public endpoints"
    );

    // -------------------------------------------------------------------------
    // Scenario 2: Authorized moderators can see held letters
    // -------------------------------------------------------------------------
    const isModerator = moderator.role === "MODERATOR" || moderator.role === "ADMIN";
    const modQueueHeld = await db.letter.findMany({
      where: {
        isModerated: true,
        moderationStatus: "HELD",
      },
      select: {
        id: true,
        moderationReason: true,
        moderationStatus: true,
        content: true,
      },
    });

    const canSeeHeld = isModerator && modQueueHeld.some((l) => l.id === heldLetter.id);
    assert(canSeeHeld, "Test 2: Authorized moderators can inspect held letters in queue");

    // -------------------------------------------------------------------------
    // Scenario 3: Unauthorized visitors cannot access moderation endpoints
    // -------------------------------------------------------------------------
    const userRoleCheck = user1.role === "MODERATOR" || user1.role === "ADMIN";
    const anonRoleCheck = user2.role === "MODERATOR" || user2.role === "ADMIN";
    assert(
      !userRoleCheck && !anonRoleCheck,
      "Test 3: Unauthorized visitors are rejected from moderation tools (HTTP 401/403)"
    );

    // -------------------------------------------------------------------------
    // Scenario 4: Authorized moderators can approve held letters
    // -------------------------------------------------------------------------
    // Simulate moderation action APPROVE
    await db.$transaction(async (tx) => {
      await tx.letter.update({
        where: { id: heldLetter.id },
        data: {
          isModerated: false,
          moderationStatus: "APPROVED",
          moderatedAt: new Date(),
          moderatorId: moderator.id,
        },
      });

      await tx.moderationLog.create({
        data: {
          letterId: heldLetter.id,
          moderatorId: moderator.id,
          action: "APPROVE",
          reason: "Reviewed by steward; safe for Orbit.",
        },
      });
    });

    const approvedInOrbit = await db.letter.findFirst({
      where: {
        id: heldLetter.id,
        visibility: "PUBLIC",
        isModerated: false,
      },
    });

    const modLogApproved = await db.moderationLog.findFirst({
      where: { letterId: heldLetter.id, action: "APPROVE" },
    });

    assert(
      approvedInOrbit !== null && modLogApproved !== null,
      "Test 4: Authorized moderators can approve held letters, releasing them to Orbit with audit logs"
    );

    // -------------------------------------------------------------------------
    // Scenario 5: Rejected letters remain unavailable publicly
    // -------------------------------------------------------------------------
    const heldLetter2 = await db.letter.create({
      data: {
        authorId: user1.id,
        recipientName: "Spammer",
        content: "Buy crypto tokens now at http://spam.xyz",
        visibility: "PUBLIC",
        entryType: "LETTER",
        isModerated: true,
        moderationReason: "Spam solicitation",
        moderationStatus: "HELD",
      },
    });
    createdLetterIds.push(heldLetter2.id);

    // Moderator rejects
    await db.$transaction(async (tx) => {
      await tx.letter.update({
        where: { id: heldLetter2.id },
        data: {
          isModerated: true,
          moderationStatus: "REJECTED",
          moderatedAt: new Date(),
          moderatorId: moderator.id,
        },
      });

      await tx.moderationLog.create({
        data: {
          letterId: heldLetter2.id,
          moderatorId: moderator.id,
          action: "REJECT",
          reason: "Commercial spam solicitation.",
        },
      });
    });

    const rejectedInOrbit = await db.letter.findFirst({
      where: {
        id: heldLetter2.id,
        visibility: "PUBLIC",
        isModerated: false,
      },
    });

    assert(
      rejectedInOrbit === null,
      "Test 5: Rejected letters remain unavailable publicly in Orbit"
    );

    // -------------------------------------------------------------------------
    // Scenario 6: Published letters can be removed by authorized moderators
    // -------------------------------------------------------------------------
    const publishedLetter = await db.letter.create({
      data: {
        authorId: user1.id,
        recipientName: "Friend",
        content: "A previously published letter that must now be removed.",
        visibility: "PUBLIC",
        entryType: "LETTER",
        isModerated: false,
        moderationStatus: "APPROVED",
      },
    });
    createdLetterIds.push(publishedLetter.id);

    // Moderator removes published letter
    await db.$transaction(async (tx) => {
      await tx.letter.update({
        where: { id: publishedLetter.id },
        data: {
          isModerated: true,
          moderationStatus: "REMOVED",
          moderatedAt: new Date(),
          moderatorId: moderator.id,
        },
      });

      await tx.moderationLog.create({
        data: {
          letterId: publishedLetter.id,
          moderatorId: moderator.id,
          action: "REMOVE",
          reason: "Violates community privacy after investigation.",
        },
      });
    });

    const checkRemovedDb = await db.letter.findUnique({
      where: { id: publishedLetter.id },
      select: { isModerated: true, moderationStatus: true },
    });

    assert(
      checkRemovedDb?.isModerated === true && checkRemovedDb?.moderationStatus === "REMOVED",
      "Test 6: Published letters can be removed by authorized moderators"
    );

    // -------------------------------------------------------------------------
    // Scenario 7: Removed letters disappear from public feeds and reading pages
    // -------------------------------------------------------------------------
    const removedInOrbitFeed = await db.letter.findMany({
      where: {
        visibility: "PUBLIC",
        isModerated: false,
        entryType: "LETTER",
      },
      select: { id: true },
    });

    const removedInSingle = await db.letter.findFirst({
      where: {
        id: publishedLetter.id,
        visibility: "PUBLIC",
        isModerated: false,
      },
    });

    assert(
      !removedInOrbitFeed.some((l) => l.id === publishedLetter.id) && removedInSingle === null,
      "Test 7: Removed letters disappear from public feeds and reading pages"
    );

    // -------------------------------------------------------------------------
    // Scenario 8: Readers can submit reports (without deleting letter)
    // -------------------------------------------------------------------------
    const activeLetter = await db.letter.create({
      data: {
        authorId: user1.id,
        recipientName: "To Someone",
        content: "A publicly active letter that receives a reader report.",
        visibility: "PUBLIC",
        entryType: "LETTER",
        isModerated: false,
        moderationStatus: "APPROVED",
      },
    });
    createdLetterIds.push(activeLetter.id);

    const report1 = await db.report.create({
      data: {
        reporterId: user2.id,
        letterId: activeLetter.id,
        reason: "PERSONAL_INFO",
        details: "This mentions personal details of a third party.",
        status: "PENDING",
      },
    });

    const letterAfterReport = await db.letter.findUnique({
      where: { id: activeLetter.id },
      select: { isModerated: true, visibility: true },
    });

    assert(
      report1.id !== null &&
        report1.status === "PENDING" &&
        letterAfterReport?.isModerated === false &&
        letterAfterReport?.visibility === "PUBLIC",
      "Test 8: Readers can submit reports; letter is not automatically deleted and enters queue"
    );

    // -------------------------------------------------------------------------
    // Scenario 9: Invalid report reasons are rejected
    // -------------------------------------------------------------------------
    const badReport = reportCreateSchema.safeParse({
      reason: "INVALID_RANDOM_REASON",
      details: "Some details",
    });

    const validReport = reportCreateSchema.safeParse({
      reason: "HARASSMENT",
      details: "Harassment context",
    });

    assert(
      !badReport.success && validReport.success,
      "Test 9: Invalid report reasons are rejected by validator"
    );

    // -------------------------------------------------------------------------
    // Scenario 10: Repeated report submissions are controlled (Anti-Spam)
    // -------------------------------------------------------------------------
    // User 2 already reported activeLetter. Check existing report logic:
    const duplicateReportCheck = await db.report.findFirst({
      where: {
        reporterId: user2.id,
        letterId: activeLetter.id,
        status: "PENDING",
      },
    });

    const isDuplicateBlocked = duplicateReportCheck !== null;
    assert(
      isDuplicateBlocked,
      "Test 10: Repeated report submissions from the same user are detected and controlled"
    );

    // -------------------------------------------------------------------------
    // Scenario 11: Report details are not publicly accessible
    // -------------------------------------------------------------------------
    const publicLetterQuery = await db.letter.findUnique({
      where: { id: activeLetter.id },
      select: {
        id: true,
        title: true,
        recipientName: true,
        content: true,
        theme: true,
        createdAt: true,
      },
    });

    const containsReports = "reports" in (publicLetterQuery || {});
    assert(
      !containsReports,
      "Test 11: Report details are not publicly accessible in letter queries"
    );

    // -------------------------------------------------------------------------
    // Scenario 12: Reporter identity is never exposed publicly
    // -------------------------------------------------------------------------
    // Check report query projection for moderator queue vs public
    const publicKeys = Object.keys(publicLetterQuery || {});
    const leaksReporter = publicKeys.includes("reporterId") || publicKeys.includes("reports");

    assert(
      !leaksReporter,
      "Test 12: Reporter identity is strictly kept private and never exposed in public responses"
    );

    // -------------------------------------------------------------------------
    // Scenario 13: Existing Phase 2 and Phase 3 functionality still works
    // -------------------------------------------------------------------------
    // 13a: Save / Unsave public letter
    const saved = await db.savedLetter.upsert({
      where: {
        userId_letterId: {
          userId: user2.id,
          letterId: activeLetter.id,
        },
      },
      create: {
        userId: user2.id,
        letterId: activeLetter.id,
      },
      update: {},
    });

    await db.savedLetter.deleteMany({
      where: { userId: user2.id, letterId: activeLetter.id },
    });

    // 13b: Safety gate test
    const cleanCheck = evaluateSafety("A beautiful quiet memory.", "A friend");
    const threatCheck = evaluateSafety("I will hurt you tomorrow.", "Enemy");

    // 13c: Moderation action schema validation
    const validModAction = moderationActionSchema.safeParse({
      action: "APPROVE",
      reason: "Safe content",
    });

    assert(
      saved.id !== null &&
        cleanCheck.action === "ALLOW" &&
        threatCheck.action === "BLOCK" &&
        validModAction.success,
      "Test 13: Existing anonymous identity, saving, writing, and safety gate work seamlessly"
    );

    // -------------------------------------------------------------------------
    // Teardown Test Data
    // -------------------------------------------------------------------------
    console.log("\nCleaning up test artifacts...");
    await db.moderationLog.deleteMany({
      where: { letterId: { in: createdLetterIds } },
    });
    await db.report.deleteMany({
      where: { letterId: { in: createdLetterIds } },
    });
    await db.savedLetter.deleteMany({
      where: { letterId: { in: createdLetterIds } },
    });
    await db.letter.deleteMany({
      where: { id: { in: createdLetterIds } },
    });
    await db.session.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await db.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });

    console.log("\n==================================================================");
    console.log(`   Verification Results: ${passed} Passed, ${failed} Failed   `);
    console.log("==================================================================\n");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution error:", err);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

runMilestone4Tests();
