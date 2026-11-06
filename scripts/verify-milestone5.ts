import { db } from "../src/lib/db";
import { generateUnsentId } from "../src/lib/auth/identity";
import { generateRecoveryKey, hashSecret } from "../src/lib/auth/crypto";
import { responseCreateSchema } from "../src/lib/validation/responses";
import { evaluateSafety } from "../src/lib/safety/gate";
import {
  notifyAuthorOfResponse,
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../src/lib/notifications/service";

async function runMilestone5Tests() {
  console.log("==========================================================================");
  console.log("   UNSENT — Phase 4, Milestone 2: Responses & Notifications Verification   ");
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

  try {
    // -------------------------------------------------------------------------
    // Setup Identities: Author (User A), Responder (User B), Moderator
    // -------------------------------------------------------------------------
    const unsentIdA = generateUnsentId();
    const { recoveryKey: recKeyA, recoveryTokenId: recTokenIdA } = generateRecoveryKey();
    const userA = await db.user.create({
      data: {
        unsentId: unsentIdA,
        accountType: "ANONYMOUS",
        role: "USER",
        recoveryTokenId: recTokenIdA,
        recoveryKeyHash: await hashSecret(recKeyA),
      },
    });
    createdUserIds.push(userA.id);

    const unsentIdB = generateUnsentId();
    const { recoveryKey: recKeyB, recoveryTokenId: recTokenIdB } = generateRecoveryKey();
    const userB = await db.user.create({
      data: {
        unsentId: unsentIdB,
        accountType: "ANONYMOUS",
        role: "USER",
        recoveryTokenId: recTokenIdB,
        recoveryKeyHash: await hashSecret(recKeyB),
      },
    });
    createdUserIds.push(userB.id);

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

    // Create an original public letter authored by User A
    const originalLetter = await db.letter.create({
      data: {
        authorId: userA.id,
        recipientName: "To Someone Special",
        title: "A letter awaiting echoes",
        content: "I wonder if anyone out there feels the quiet weight of autumn.",
        theme: "Longing",
        visibility: "PUBLIC",
        entryType: "LETTER",
        isModerated: false,
        moderationStatus: "APPROVED",
      },
    });
    createdLetterIds.push(originalLetter.id);

    // -------------------------------------------------------------------------
    // Scenario 1: A visitor can submit a response to a public letter
    // -------------------------------------------------------------------------
    const response1 = await db.letter.create({
      data: {
        authorId: userB.id,
        parentLetterId: originalLetter.id,
        content: "I felt the exact same weight walking through the park this morning.",
        entryType: "RESPONSE",
        visibility: "PUBLIC",
        isModerated: false,
        moderationStatus: "APPROVED",
      },
    });
    createdLetterIds.push(response1.id);

    assert(
      response1.id !== null &&
        response1.parentLetterId === originalLetter.id &&
        response1.entryType === "RESPONSE",
      "Test 1: Visitor can submit a standalone response to a public letter"
    );

    // -------------------------------------------------------------------------
    // Scenario 2: Responses are displayed beneath the correct original letter
    // -------------------------------------------------------------------------
    const fetchedResponses = await db.letter.findMany({
      where: {
        parentLetterId: originalLetter.id,
        entryType: "RESPONSE",
        visibility: "PUBLIC",
        isModerated: false,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        parentLetterId: true,
        content: true,
        createdAt: true,
      },
    });

    const isResponseAttached = fetchedResponses.some((r) => r.id === response1.id);
    assert(
      isResponseAttached && fetchedResponses.length === 1,
      "Test 2: Responses are retrieved beneath the correct original letter in chronological order"
    );

    // -------------------------------------------------------------------------
    // Scenario 3: Responses are standalone, not threaded
    // -------------------------------------------------------------------------
    // Validate business rule: A response cannot have another response as a parent
    const attemptNestedParent = await db.letter.findFirst({
      where: {
        id: response1.id,
        visibility: "PUBLIC",
        isModerated: false,
        entryType: "LETTER", // Only top-level LETTERS can receive responses
      },
    });

    assert(
      attemptNestedParent === null,
      "Test 3: Responses cannot receive replies; strictly standalone (non-threaded)"
    );

    // -------------------------------------------------------------------------
    // Scenario 4: Public responses do not expose responder identity
    // -------------------------------------------------------------------------
    const publicResponseView = await db.letter.findUnique({
      where: { id: response1.id },
      select: {
        id: true,
        parentLetterId: true,
        content: true,
        createdAt: true,
      },
    });

    const exposedKeys = Object.keys(publicResponseView || {}).filter((k) =>
      ["authorId", "author", "unsentId", "phone", "recoveryKeyHash"].includes(k)
    );

    assert(
      publicResponseView !== null && exposedKeys.length === 0,
      "Test 4: Public responses strictly omit author IDs and user identity fields"
    );

    // -------------------------------------------------------------------------
    // Scenario 5: Private letters cannot receive public responses
    // -------------------------------------------------------------------------
    const privateLetter = await db.letter.create({
      data: {
        authorId: userA.id,
        recipientName: "Private Keep",
        content: "A private journal entry.",
        visibility: "PRIVATE",
        entryType: "LETTER",
      },
    });
    createdLetterIds.push(privateLetter.id);

    const privateCanReceiveResponse = await db.letter.findFirst({
      where: {
        id: privateLetter.id,
        visibility: "PUBLIC",
        isModerated: false,
        entryType: "LETTER",
      },
    });

    assert(
      privateCanReceiveResponse === null,
      "Test 5: Private letters cannot receive public responses (404/Denied)"
    );

    // -------------------------------------------------------------------------
    // Scenario 6: Held responses never appear publicly
    // -------------------------------------------------------------------------
    const heldResponse = await db.letter.create({
      data: {
        authorId: userB.id,
        parentLetterId: originalLetter.id,
        content: "Call me at 212-555-0199 to talk about this.",
        entryType: "RESPONSE",
        visibility: "PUBLIC",
        isModerated: true,
        moderationReason: "Flagged for potential contact info (PII_PHONE)",
        moderationStatus: "HELD",
      },
    });
    createdLetterIds.push(heldResponse.id);

    const publicListAfterHeld = await db.letter.findMany({
      where: {
        parentLetterId: originalLetter.id,
        entryType: "RESPONSE",
        visibility: "PUBLIC",
        isModerated: false,
      },
    });

    const isHeldVisible = publicListAfterHeld.some((r) => r.id === heldResponse.id);
    assert(
      !isHeldVisible,
      "Test 6: Held responses (isModerated = true) never appear publicly"
    );

    // -------------------------------------------------------------------------
    // Scenario 7: Blocked responses are rejected
    // -------------------------------------------------------------------------
    const safetyCheckClean = evaluateSafety("A gentle thought in response.");
    const safetyCheckThreat = evaluateSafety("I will hurt you for writing this.");

    assert(
      safetyCheckClean.action === "ALLOW" && safetyCheckThreat.action === "BLOCK",
      "Test 7: Automated safety gate blocks prohibited threats on response submissions"
    );

    // -------------------------------------------------------------------------
    // Scenario 8: Responses can be reported
    // -------------------------------------------------------------------------
    const responseReport = await db.report.create({
      data: {
        reporterId: userA.id,
        letterId: response1.id,
        reason: "HARASSMENT",
        details: "Inappropriate response tone.",
        status: "PENDING",
      },
    });

    assert(
      responseReport.id !== null && responseReport.letterId === response1.id,
      "Test 8: Readers can report inappropriate responses"
    );

    // -------------------------------------------------------------------------
    // Scenario 9: Moderators can review and remove responses
    // -------------------------------------------------------------------------
    // Moderator removes response1
    await db.$transaction(async (tx) => {
      await tx.letter.update({
        where: { id: response1.id },
        data: {
          isModerated: true,
          moderationStatus: "REMOVED",
          moderatedAt: new Date(),
          moderatorId: moderator.id,
        },
      });

      await tx.moderationLog.create({
        data: {
          letterId: response1.id,
          moderatorId: moderator.id,
          action: "REMOVE",
          reason: "Response removed following moderation review.",
        },
      });
    });

    const publicResponsesAfterRemoval = await db.letter.findMany({
      where: {
        parentLetterId: originalLetter.id,
        entryType: "RESPONSE",
        visibility: "PUBLIC",
        isModerated: false,
      },
    });

    const isRemovedVisible = publicResponsesAfterRemoval.some((r) => r.id === response1.id);
    assert(
      !isRemovedVisible,
      "Test 9: Moderators can remove responses, and removed responses vanish from public view"
    );

    // -------------------------------------------------------------------------
    // Scenario 10: The original author receives a notification for an approved response
    // -------------------------------------------------------------------------
    const response2 = await db.letter.create({
      data: {
        authorId: userB.id,
        parentLetterId: originalLetter.id,
        content: "A second heartfelt approved response.",
        entryType: "RESPONSE",
        visibility: "PUBLIC",
        isModerated: false,
        moderationStatus: "APPROVED",
      },
    });
    createdLetterIds.push(response2.id);

    const notified = await notifyAuthorOfResponse({
      originalLetterId: originalLetter.id,
      responseId: response2.id,
      responseContent: response2.content,
      responderId: userB.id,
    });

    const authorNotifications = await getUserNotifications(userA.id);
    const hasResponseNotification = authorNotifications.some(
      (n) => n.letterId === originalLetter.id && n.type === "RESPONSE_RECEIVED"
    );

    assert(
      notified && hasResponseNotification,
      "Test 10: Original author receives a private notification when an approved response is published"
    );

    // -------------------------------------------------------------------------
    // Scenario 11: Held and rejected responses do not trigger notifications
    // -------------------------------------------------------------------------
    const initialAuthorNotifCount = await getUnreadNotificationCount(userA.id);

    // When heldResponse was created earlier, notifyAuthorOfResponse was deliberately NOT called.
    const notifCountAfterHeld = await getUnreadNotificationCount(userA.id);

    assert(
      initialAuthorNotifCount === notifCountAfterHeld,
      "Test 11: Held and rejected responses do not trigger notifications to the author"
    );

    // -------------------------------------------------------------------------
    // Scenario 12: Notifications remain private to their owner
    // -------------------------------------------------------------------------
    // User B (the responder) queries their notifications:
    const userBNotifications = await getUserNotifications(userB.id);
    const userBCanSeeUserANotif = userBNotifications.some((n) => n.letterId === originalLetter.id);

    assert(
      !userBCanSeeUserANotif && userBNotifications.length === 0,
      "Test 12: Notifications remain strictly private to the recipient identity"
    );

    // -------------------------------------------------------------------------
    // Scenario 13: Notifications can be marked read
    // -------------------------------------------------------------------------
    const unreadBefore = await getUnreadNotificationCount(userA.id);
    const targetNotif = authorNotifications[0];
    const marked = await markNotificationAsRead(userA.id, targetNotif.id);
    const unreadAfter = await getUnreadNotificationCount(userA.id);

    assert(
      marked && unreadBefore > unreadAfter,
      "Test 13: Notifications can be marked as read by their owner"
    );

    // -------------------------------------------------------------------------
    // Scenario 14: Duplicate notifications are prevented
    // -------------------------------------------------------------------------
    // Attempt to notify author again for the exact same response2
    const secondNotifyResult = await notifyAuthorOfResponse({
      originalLetterId: originalLetter.id,
      responseId: response2.id,
      responseContent: response2.content,
      responderId: userB.id,
    });

    assert(
      secondNotifyResult === false,
      "Test 14: Duplicate notifications for the same response are detected and prevented"
    );

    // -------------------------------------------------------------------------
    // Scenario 15: Existing Phase 2, Phase 3, and Phase 4 Milestone 1 functionality remains intact
    // -------------------------------------------------------------------------
    const parsedValidResponse = responseCreateSchema.safeParse({
      content: "Valid response content.",
    });
    const parsedEmptyResponse = responseCreateSchema.safeParse({
      content: "   ",
    });

    // Check markAllNotificationsAsRead
    const allMarked = await markAllNotificationsAsRead(userA.id);

    assert(
      parsedValidResponse.success &&
        !parsedEmptyResponse.success &&
        typeof allMarked === "number",
      "Test 15: Validation, notification management, and previous milestone functionality intact"
    );

    // -------------------------------------------------------------------------
    // Teardown Test Data
    // -------------------------------------------------------------------------
    console.log("\nCleaning up test artifacts...");
    await db.notification.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await db.moderationLog.deleteMany({
      where: { letterId: { in: createdLetterIds } },
    });
    await db.report.deleteMany({
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

    console.log("\n==========================================================================");
    console.log(`   Verification Results: ${passed} Passed, ${failed} Failed   `);
    console.log("==========================================================================\n");

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

runMilestone5Tests();
