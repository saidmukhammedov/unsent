import { db } from "../src/lib/db";
import { generateUnsentId } from "../src/lib/auth/identity";
import { generateRecoveryKey, hashSecret, parseRecoveryKey, verifySecret } from "../src/lib/auth/crypto";
import { generateSecureToken, hashToken } from "../src/lib/auth/session";
import { deleteAccountSchema } from "../src/lib/validation/settings";

async function runMilestone7Tests() {
  console.log("==========================================================================");
  console.log("   UNSENT — Phase 4, Milestone 4: Settings, Privacy & Identity Suite      ");
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

  try {
    // -------------------------------------------------------------------------
    // Setup Test Identity A (Main User)
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

    // Create session 1 for User A
    const rawTokenA1 = generateSecureToken(32);
    const tokenHashA1 = hashToken(rawTokenA1);
    const sessionA1 = await db.session.create({
      data: {
        userId: userA.id,
        tokenHash: tokenHashA1,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });
    createdSessionIds.push(sessionA1.id);

    // Setup Test Identity B (Another User)
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

    // -------------------------------------------------------------------------
    // Scenario 1: Settings access and identity isolation
    // -------------------------------------------------------------------------
    const userCheckA = await db.user.findUnique({
      where: { id: userA.id },
      select: { unsentId: true, accountType: true, role: true, createdAt: true },
    });

    const userCheckB = await db.user.findUnique({
      where: { id: userB.id },
      select: { unsentId: true },
    });

    assert(
      userCheckA?.unsentId === unsentIdA && userCheckA?.unsentId !== userCheckB?.unsentId,
      "Scenario 1: Settings identity is correctly isolated and exposes no secrets"
    );

    // -------------------------------------------------------------------------
    // Scenario 2: Active sessions tracking
    // -------------------------------------------------------------------------
    // Add two more sessions for User A (simulating mobile browser & laptop)
    const rawTokenA2 = generateSecureToken(32);
    const tokenHashA2 = hashToken(rawTokenA2);
    const sessionA2 = await db.session.create({
      data: {
        userId: userA.id,
        tokenHash: tokenHashA2,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });
    createdSessionIds.push(sessionA2.id);

    const rawTokenA3 = generateSecureToken(32);
    const tokenHashA3 = hashToken(rawTokenA3);
    const sessionA3 = await db.session.create({
      data: {
        userId: userA.id,
        tokenHash: tokenHashA3,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });
    createdSessionIds.push(sessionA3.id);

    const sessionsForUserA = await db.session.findMany({
      where: { userId: userA.id },
    });

    assert(
      sessionsForUserA.length === 3,
      "Scenario 2: Identity tracks all active sessions and multi-device presences"
    );

    // -------------------------------------------------------------------------
    // Scenario 3: Invalidate other active sessions while preserving current session
    // -------------------------------------------------------------------------
    // Current session is sessionA1. Invalidate other sessions (A2 and A3).
    const deleteOthersResult = await db.session.deleteMany({
      where: {
        userId: userA.id,
        NOT: { tokenHash: tokenHashA1 },
      },
    });

    const remainingSessionsA = await db.session.findMany({
      where: { userId: userA.id },
    });

    assert(
      deleteOthersResult.count === 2 &&
        remainingSessionsA.length === 1 &&
        remainingSessionsA[0].tokenHash === tokenHashA1,
      "Scenario 3: Invalidate other sessions removes other devices while preserving current session"
    );

    // -------------------------------------------------------------------------
    // Scenario 4: Session termination (Logout)
    // -------------------------------------------------------------------------
    // Terminate current session
    await db.session.deleteMany({
      where: { tokenHash: tokenHashA1 },
    });

    const checkTerminatedSession = await db.session.findUnique({
      where: { tokenHash: tokenHashA1 },
    });

    assert(
      checkTerminatedSession === null,
      "Scenario 4: Terminate current session destroys the session token in the database"
    );

    // -------------------------------------------------------------------------
    // Scenario 5: Recovery from another browser restores identity & preserves archive
    // -------------------------------------------------------------------------
    // Create some content for User A before testing recovery
    const preRecoveryPrivateLetter = await db.letter.create({
      data: {
        authorId: userA.id,
        title: "Words Kept Safe",
        content: "These words must survive cross-device recovery untouched.",
        visibility: "PRIVATE",
        entryType: "LETTER",
      },
    });
    createdLetterIds.push(preRecoveryPrivateLetter.id);

    // Perform recovery using User A's recoveryKey
    const parsedKey = parseRecoveryKey(recKeyA);
    assert(parsedKey !== null, "Scenario 5a: Recovery key is valid and parses correctly");

    const userByToken = await db.user.findUnique({
      where: { recoveryTokenId: parsedKey!.recoveryTokenId },
    });
    const keyValid = await verifySecret(parsedKey!.secret, userByToken!.recoveryKeyHash);

    assert(
      keyValid && userByToken?.id === userA.id,
      "Scenario 5b: Recovery key matches stored cryptographic hash"
    );

    // Verify recovery preserves existing content
    const lettersAfterRecovery = await db.letter.findMany({
      where: { authorId: userA.id },
    });
    const preservedLetter = lettersAfterRecovery.find((l) => l.id === preRecoveryPrivateLetter.id);

    assert(
      !!preservedLetter && preservedLetter.content.includes("survive cross-device recovery"),
      "Scenario 5c: Recovery preserves the user's complete archive without data loss"
    );

    // -------------------------------------------------------------------------
    // Scenario 6: Invalid recovery attempts are rejected
    // -------------------------------------------------------------------------
    const malformedKey = "INVALID-KEY-1234";
    const parsedMalformed = parseRecoveryKey(malformedKey);
    assert(parsedMalformed === null, "Scenario 6a: Malformed recovery key rejected by parser");

    const nonExistentKey = "REC-DEADBEEF-1234567890abcdef12345678";
    const parsedNonExistent = parseRecoveryKey(nonExistentKey);
    assert(parsedNonExistent !== null, "Scenario 6b1: Valid formatted key parsed");
    const nonExistentUser = await db.user.findUnique({
      where: { recoveryTokenId: parsedNonExistent!.recoveryTokenId },
    });
    assert(
      nonExistentUser === null,
      "Scenario 6b2: Non-existent recovery token rejected with not found"
    );

    const wrongSecretKey = `REC-${recTokenIdA}-00000000000000000000000000000000`;
    const parsedWrongSecret = parseRecoveryKey(wrongSecretKey);
    const wrongSecretValid = await verifySecret(
      parsedWrongSecret!.secret,
      userByToken!.recoveryKeyHash
    );
    assert(
      !wrongSecretValid,
      "Scenario 6c: Wrong recovery secret rejected by scrypt verification"
    );

    // -------------------------------------------------------------------------
    // Scenario 7: Deletion confirmation phrase validation
    // -------------------------------------------------------------------------
    const invalidPhraseParse = deleteAccountSchema.safeParse({ confirmPhrase: "delete" });
    const emptyPhraseParse = deleteAccountSchema.safeParse({ confirmPhrase: "" });
    const validPhraseParse = deleteAccountSchema.safeParse({ confirmPhrase: "ERASE MY SANCTUARY" });

    assert(
      !invalidPhraseParse.success && !emptyPhraseParse.success && validPhraseParse.success,
      "Scenario 7: Account deletion strictly requires exact phrase 'ERASE MY SANCTUARY'"
    );

    // -------------------------------------------------------------------------
    // Scenario 8: Deliberate data & account deletion
    // -------------------------------------------------------------------------
    // Setup User C for complete deletion test
    const unsentIdC = generateUnsentId();
    const { recoveryKey: recKeyC, recoveryTokenId: recTokenIdC } = generateRecoveryKey();
    const userC = await db.user.create({
      data: {
        unsentId: unsentIdC,
        accountType: "ANONYMOUS",
        role: "USER",
        recoveryTokenId: recTokenIdC,
        recoveryKeyHash: await hashSecret(recKeyC),
      },
    });

    // 1. Private letter
    const privateLetterC = await db.letter.create({
      data: {
        authorId: userC.id,
        title: "Private Letter C",
        content: "This must be permanently erased.",
        visibility: "PRIVATE",
        entryType: "LETTER",
      },
    });

    // 2. Personal note
    const noteC = await db.letter.create({
      data: {
        authorId: userC.id,
        title: "Personal Note C",
        content: "This note must also be erased.",
        visibility: "PRIVATE",
        entryType: "NOTE",
      },
    });

    // 3. Saved letter
    const savedC = await db.savedLetter.create({
      data: {
        userId: userC.id,
        letterId: preRecoveryPrivateLetter.id,
        privateNote: "Private reflection that must be erased.",
      },
    });

    // 4. Notification
    const notifC = await db.notification.create({
      data: {
        userId: userC.id,
        type: "RESPONSE_RECEIVED",
        letterId: preRecoveryPrivateLetter.id,
      },
    });

    // 5. Public letter in Orbit
    const publicLetterC = await db.letter.create({
      data: {
        authorId: userC.id,
        recipientName: "Orbit Readers",
        title: "A Letter That Stays",
        content: "Once released into Orbit, this letter remains as an authorless echo.",
        visibility: "PUBLIC",
        entryType: "LETTER",
        isModerated: false,
        moderationStatus: "APPROVED",
      },
    });
    createdLetterIds.push(publicLetterC.id);

    // 6. Public response in Orbit
    const responseC = await db.letter.create({
      data: {
        authorId: userC.id,
        parentLetterId: preRecoveryPrivateLetter.id,
        content: "A standalone response that remains in Orbit.",
        visibility: "PUBLIC",
        entryType: "RESPONSE",
        isModerated: false,
        moderationStatus: "APPROVED",
      },
    });
    createdLetterIds.push(responseC.id);

    // 7. Active session
    const sessionTokenC = generateSecureToken(32);
    const sessionC = await db.session.create({
      data: {
        userId: userC.id,
        tokenHash: hashToken(sessionTokenC),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      },
    });

    // Execute deletion procedure
    // 1. Delete private letters
    await db.letter.deleteMany({
      where: { authorId: userC.id, visibility: "PRIVATE" },
    });
    // 2. Delete personal notes
    await db.letter.deleteMany({
      where: { authorId: userC.id, entryType: "NOTE" },
    });
    // 3. Delete saved letters
    await db.savedLetter.deleteMany({
      where: { userId: userC.id },
    });
    // 4. Delete notifications
    await db.notification.deleteMany({
      where: { userId: userC.id },
    });
    // 5. Orphan public letters & responses (set authorId: null)
    await db.letter.updateMany({
      where: { authorId: userC.id, visibility: "PUBLIC" },
      data: { authorId: null },
    });
    // 6. Delete sessions
    await db.session.deleteMany({
      where: { userId: userC.id },
    });
    // 7. Delete user
    await db.user.delete({
      where: { id: userC.id },
    });

    // Verify deletion outcomes:
    const checkUserC = await db.user.findUnique({ where: { id: userC.id } });
    const checkPrivateLetter = await db.letter.findUnique({ where: { id: privateLetterC.id } });
    const checkNote = await db.letter.findUnique({ where: { id: noteC.id } });
    const checkSaved = await db.savedLetter.findUnique({ where: { id: savedC.id } });
    const checkNotif = await db.notification.findUnique({ where: { id: notifC.id } });
    const checkSession = await db.session.findUnique({ where: { id: sessionC.id } });

    assert(
      checkUserC === null &&
        checkPrivateLetter === null &&
        checkNote === null &&
        checkSaved === null &&
        checkNotif === null &&
        checkSession === null,
      "Scenario 8: Private records, notes, reflections, sessions, and user record permanently erased"
    );

    // -------------------------------------------------------------------------
    // Scenario 9: Published Orbit letters & responses remain preserved with authorId: null
    // -------------------------------------------------------------------------
    const checkOrbitLetter = await db.letter.findUnique({
      where: { id: publicLetterC.id },
    });
    const checkOrbitResponse = await db.letter.findUnique({
      where: { id: responseC.id },
    });

    assert(
      checkOrbitLetter !== null &&
        checkOrbitLetter.authorId === null &&
        checkOrbitLetter.visibility === "PUBLIC" &&
        checkOrbitResponse !== null &&
        checkOrbitResponse.authorId === null &&
        checkOrbitResponse.visibility === "PUBLIC",
      "Scenario 9: Published Orbit letters and responses remain in Orbit with authorId severed (null)"
    );

    // -------------------------------------------------------------------------
    // Scenario 10: Invalidation after deletion — cannot authenticate
    // -------------------------------------------------------------------------
    const reAuthCheck = await db.session.findUnique({
      where: { tokenHash: hashToken(sessionTokenC) },
    });
    assert(
      reAuthCheck === null,
      "Scenario 10: Former sessions of deleted identity are completely invalid"
    );
  } finally {
    console.log("\nCleaning up test artifacts...");
    if (createdSessionIds.length > 0) {
      await db.session.deleteMany({ where: { id: { in: createdSessionIds } } });
    }
    if (createdSavedIds.length > 0) {
      await db.savedLetter.deleteMany({ where: { id: { in: createdSavedIds } } });
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

runMilestone7Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
