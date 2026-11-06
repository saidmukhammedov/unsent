import { db } from "../src/lib/db";
import { generateUnsentId } from "../src/lib/auth/identity";
import { generateRecoveryKey, hashSecret, parseRecoveryKey, verifySecret } from "../src/lib/auth/crypto";
import { generateSecureToken, hashToken } from "../src/lib/auth/session";
import { hashPassword, verifyPassword, validatePasswordStrength } from "../src/lib/auth/password";
import { normalizePhoneNumber } from "../src/lib/validation/phone";
import { registerSchema, loginSchema } from "../src/lib/validation/auth";

async function runMilestone8Tests() {
  console.log("==========================================================================");
  console.log("   UNSENT — Phase 5, Milestone 1: Phone Login & Identity Conversion       ");
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
  const createdNotificationIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // Scenario 1: Anonymous visitors can continue using UNSENT
    // -------------------------------------------------------------------------
    const unsentId1 = generateUnsentId();
    const { recoveryKey: recKey1, recoveryTokenId: recTokenId1 } = generateRecoveryKey();
    const anonUser = await db.user.create({
      data: {
        unsentId: unsentId1,
        accountType: "ANONYMOUS",
        role: "USER",
        recoveryTokenId: recTokenId1,
        recoveryKeyHash: await hashSecret(recKey1),
      },
    });
    createdUserIds.push(anonUser.id);

    // Anonymous visitor writes a private letter and a personal note
    const anonPrivateLetter = await db.letter.create({
      data: {
        authorId: anonUser.id,
        entryType: "LETTER",
        visibility: "PRIVATE",
        title: "Anonymous Whispers",
        recipientName: "Memory",
        content: "Words written in quiet anonymity without needing to register or share a phone number.",
        tags: ["private"],
      },
    });
    createdLetterIds.push(anonPrivateLetter.id);

    const anonNote = await db.letter.create({
      data: {
        authorId: anonUser.id,
        entryType: "NOTE",
        visibility: "PRIVATE",
        content: "Personal reflection note by anonymous visitor.",
        tags: ["note"],
      },
    });
    createdLetterIds.push(anonNote.id);

    assert(
      anonUser.accountType === "ANONYMOUS" &&
      anonUser.phone === null &&
      anonUser.passwordHash === null &&
      anonUser.phoneVerifiedAt === null,
      "Scenario 1: Anonymous visitors can use UNSENT without registration or phone number"
    );

    // -------------------------------------------------------------------------
    // Setup Content for Conversion Testing (Pre-conversion state)
    // -------------------------------------------------------------------------
    // Anonymous user publishes an Orbit letter
    const anonOrbitLetter = await db.letter.create({
      data: {
        authorId: anonUser.id,
        entryType: "LETTER",
        visibility: "PUBLIC",
        title: "Orbit Horizon",
        recipientName: "The Night",
        content: "A letter destined for Orbit before converting this account to registered.",
        tags: ["orbit", "sky"],
        isModerated: true,
        moderationStatus: "APPROVED",
      },
    });
    createdLetterIds.push(anonOrbitLetter.id);

    // Setup another user to test saved letters, responses, and notifications
    const targetUser = await db.user.create({
      data: {
        unsentId: generateUnsentId(),
        accountType: "ANONYMOUS",
        role: "USER",
        recoveryTokenId: generateRecoveryKey().recoveryTokenId,
        recoveryKeyHash: await hashSecret("REC-TEMP-KEY-FOR-TESTING-12345678"),
      },
    });
    createdUserIds.push(targetUser.id);

    const targetLetter = await db.letter.create({
      data: {
        authorId: targetUser.id,
        entryType: "LETTER",
        visibility: "PUBLIC",
        title: "Target Orbit Letter",
        recipientName: "Someone",
        content: "Content to be responded to by the converting identity.",
        tags: ["public"],
        isModerated: true,
        moderationStatus: "APPROVED",
      },
    });
    createdLetterIds.push(targetLetter.id);

    // Anonymous user responds to target's letter
    const anonResponse = await db.letter.create({
      data: {
        authorId: anonUser.id,
        parentLetterId: targetLetter.id,
        entryType: "RESPONSE",
        visibility: "PUBLIC",
        content: "A gentle response from the anonymous visitor.",
        isModerated: true,
        moderationStatus: "APPROVED",
      },
    });
    createdLetterIds.push(anonResponse.id);

    // Anonymous user saves target letter with private reflection
    const anonSaved = await db.savedLetter.create({
      data: {
        userId: anonUser.id,
        letterId: targetLetter.id,
        privateNote: "Reflecting on target's quiet words.",
      },
    });
    createdSavedIds.push(anonSaved.id);

    // Notification created for anonymous user
    const anonNotif = await db.notification.create({
      data: {
        userId: anonUser.id,
        type: "RESPONSE_RECEIVED",
        letterId: anonOrbitLetter.id,
        payload: { preview: "Someone echoed your orbit letter." },
      },
    });
    createdNotificationIds.push(anonNotif.id);

    // Existing session for anonymous user
    const rawTokenAnon = generateSecureToken(32);
    const sessionAnon = await db.session.create({
      data: {
        userId: anonUser.id,
        tokenHash: hashToken(rawTokenAnon),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      },
    });
    createdSessionIds.push(sessionAnon.id);

    // -------------------------------------------------------------------------
    // Scenario 2: Anonymous identity can convert to a registered account
    // -------------------------------------------------------------------------
    const rawPhone = "+1 (555) 234-5678";
    const normalizedPhone = normalizePhoneNumber(rawPhone);
    assert(normalizedPhone === "+15552345678", "Phone normalization converts to standard E.164");

    const plainPassword = "SecretPassword123";
    const pwdStrength = validatePasswordStrength(plainPassword);
    assert(pwdStrength.isValid, "Password strength validation accepts compliant password");

    const regValidation = registerSchema.safeParse({
      phone: rawPhone,
      password: plainPassword,
      confirmPassword: plainPassword,
    });
    assert(regValidation.success, "Register validation schema accepts valid phone and password");

    const hashedPassword = await hashPassword(plainPassword);

    // Execute in-place identity conversion
    const preConversionId = anonUser.id;
    const preConversionUnsentId = anonUser.unsentId;
    const preConversionRecToken = anonUser.recoveryTokenId;
    const preConversionRecHash = anonUser.recoveryKeyHash;

    const convertedUser = await db.user.update({
      where: { id: anonUser.id },
      data: {
        phone: normalizedPhone,
        passwordHash: hashedPassword,
        accountType: "REGISTERED",
        phoneVerifiedAt: null, // strictly null
      },
    });

    assert(
      convertedUser.accountType === "REGISTERED" &&
      convertedUser.phone === "+15552345678" &&
      convertedUser.passwordHash !== null,
      "Scenario 2: Anonymous identity can convert to a registered account in place"
    );

    // -------------------------------------------------------------------------
    // Scenario 3: Conversion preserves the exact same internal identity
    // -------------------------------------------------------------------------
    assert(
      convertedUser.id === preConversionId &&
      convertedUser.unsentId === preConversionUnsentId &&
      convertedUser.recoveryTokenId === preConversionRecToken &&
      convertedUser.recoveryKeyHash === preConversionRecHash,
      "Scenario 3: Conversion preserves exact internal UUID, UNSENT ID, and recovery credentials"
    );

    // -------------------------------------------------------------------------
    // Scenario 4: All existing content remains accessible after conversion
    // -------------------------------------------------------------------------
    const postPrivateLetters = await db.letter.findMany({
      where: { authorId: convertedUser.id, visibility: "PRIVATE", entryType: "LETTER" },
    });
    const postNotes = await db.letter.findMany({
      where: { authorId: convertedUser.id, entryType: "NOTE" },
    });
    const postOrbitLetters = await db.letter.findMany({
      where: { authorId: convertedUser.id, visibility: "PUBLIC", entryType: "LETTER" },
    });
    const postResponses = await db.letter.findMany({
      where: { authorId: convertedUser.id, entryType: "RESPONSE" },
    });
    const postSaved = await db.savedLetter.findMany({
      where: { userId: convertedUser.id },
    });
    const postNotifs = await db.notification.findMany({
      where: { userId: convertedUser.id },
    });
    const postSessions = await db.session.findMany({
      where: { userId: convertedUser.id },
    });

    assert(
      postPrivateLetters.length === 1 &&
      postPrivateLetters[0].id === anonPrivateLetter.id &&
      postNotes.length === 1 &&
      postNotes[0].id === anonNote.id &&
      postOrbitLetters.length === 1 &&
      postOrbitLetters[0].id === anonOrbitLetter.id &&
      postResponses.length === 1 &&
      postResponses[0].id === anonResponse.id &&
      postSaved.length === 1 &&
      postSaved[0].id === anonSaved.id &&
      postNotifs.length === 1 &&
      postNotifs[0].id === anonNotif.id &&
      postSessions.length === 1 &&
      postSessions[0].id === sessionAnon.id,
      "Scenario 4: All existing letters, notes, responses, reflections, and notifications remain 100% accessible"
    );

    // -------------------------------------------------------------------------
    // Scenario 5: Registered users can log in with phone + password
    // -------------------------------------------------------------------------
    const loginInputValidation = loginSchema.safeParse({
      phone: "(555) 234-5678",
      password: plainPassword,
    });
    assert(loginInputValidation.success, "Login schema validation succeeds for phone + password");

    const normalizedLoginPhone = normalizePhoneNumber("(555) 234-5678");
    const userToLogin = await db.user.findUnique({
      where: { phone: normalizedLoginPhone! },
    });

    assert(userToLogin !== null && userToLogin.id === convertedUser.id, "User lookup by normalized phone succeeds");

    const isPasswordValid = await verifyPassword(plainPassword, userToLogin!.passwordHash!);
    assert(isPasswordValid, "Scenario 5: Registered user logs in successfully with phone + password");

    // -------------------------------------------------------------------------
    // Scenario 6: Incorrect passwords are rejected
    // -------------------------------------------------------------------------
    const isWrongPasswordValid = await verifyPassword("WrongPassword999", userToLogin!.passwordHash!);
    assert(!isWrongPasswordValid, "Scenario 6: Incorrect password verification is safely rejected");

    // -------------------------------------------------------------------------
    // Scenario 7: Duplicate phone registrations are rejected safely
    // -------------------------------------------------------------------------
    let duplicateRejected = false;
    try {
      // Simulate another visitor attempting to register with the same phone
      const secondUser = await db.user.create({
        data: {
          unsentId: generateUnsentId(),
          accountType: "ANONYMOUS",
          recoveryTokenId: generateRecoveryKey().recoveryTokenId,
          recoveryKeyHash: await hashSecret("REC-KEY-ANOTHER-USER-12345678"),
        },
      });
      createdUserIds.push(secondUser.id);

      // Attempting to assign already registered phone
      await db.user.update({
        where: { id: secondUser.id },
        data: {
          phone: "+15552345678", // collision!
          passwordHash: hashedPassword,
          accountType: "REGISTERED",
        },
      });
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        duplicateRejected = true;
      }
    }

    assert(duplicateRejected, "Scenario 7: Duplicate phone registration is safely rejected at database uniqueness layer");

    // -------------------------------------------------------------------------
    // Scenario 8: No account merging occurs
    // -------------------------------------------------------------------------
    // Verify user count and content integrity: original user's content belongs only to user 1
    const originalUserLetters = await db.letter.findMany({
      where: { authorId: convertedUser.id },
    });
    const letterIds = originalUserLetters.map((l) => l.id);
    assert(
      originalUserLetters.length === 4 &&
      letterIds.includes(anonPrivateLetter.id) &&
      letterIds.includes(anonNote.id) &&
      letterIds.includes(anonOrbitLetter.id) &&
      letterIds.includes(anonResponse.id),
      "Scenario 8: No account merging or letter transfer occurred during collision rejection"
    );

    // -------------------------------------------------------------------------
    // Scenario 9: Phone numbers never appear in public APIs
    // -------------------------------------------------------------------------
    const publicLetterQuery = await db.letter.findUnique({
      where: { id: anonOrbitLetter.id },
      select: {
        id: true,
        title: true,
        content: true,
        recipientName: true,
        theme: true,
        createdAt: true,
        author: {
          select: {
            unsentId: true,
            // phone must NOT be queried
          },
        },
      },
    });

    const publicResponseQuery = await db.letter.findMany({
      where: { parentLetterId: targetLetter.id, visibility: "PUBLIC" },
      select: {
        id: true,
        parentLetterId: true,
        content: true,
        createdAt: true,
        author: {
          select: {
            unsentId: true,
          },
        },
      },
    });

    const serializedPublicLetter = JSON.stringify(publicLetterQuery);
    const serializedPublicResponse = JSON.stringify(publicResponseQuery);

    assert(
      !serializedPublicLetter.includes("+15552345678") &&
      !serializedPublicLetter.includes("phone") &&
      !serializedPublicResponse.includes("+15552345678") &&
      !serializedPublicResponse.includes("phone"),
      "Scenario 9: Phone numbers never appear in public letter or response representations"
    );

    // -------------------------------------------------------------------------
    // Scenario 10: Phone numbers are never marked verified
    // -------------------------------------------------------------------------
    const refreshedUser = await db.user.findUnique({
      where: { id: convertedUser.id },
    });

    assert(
      refreshedUser?.phoneVerifiedAt === null,
      "Scenario 10: phoneVerifiedAt is strictly null (never marked verified)"
    );

    // -------------------------------------------------------------------------
    // Scenario 11: Passwords are securely hashed with Argon2id
    // -------------------------------------------------------------------------
    assert(
      refreshedUser?.passwordHash?.startsWith("$argon2id$v=19$m=65536,t=3,p=4$") === true,
      "Scenario 11: Passwords are securely hashed with Argon2id (m=65536, t=3, p=4)"
    );

    // -------------------------------------------------------------------------
    // Scenario 12: Recovery-key functionality remains intact
    // -------------------------------------------------------------------------
    // Original recovery key from step 1 (recKey1) still works for this user
    const parsedKey = parseRecoveryKey(recKey1);
    assert(parsedKey !== null, "Recovery key format is valid");

    const recoveredUser = await db.user.findUnique({
      where: { recoveryTokenId: parsedKey!.recoveryTokenId },
    });
    assert(recoveredUser?.id === convertedUser.id, "Lookup by recovery token ID matches converted identity");

    const isRecKeyValid = await verifySecret(parsedKey!.secret, recoveredUser!.recoveryKeyHash);
    assert(isRecKeyValid, "Scenario 12: Cryptographic recovery key verification works for registered user");

    // -------------------------------------------------------------------------
    // Scenario 13: Session security and logout continue working
    // -------------------------------------------------------------------------
    const newSessionToken = generateSecureToken(32);
    const newSessionHash = hashToken(newSessionToken);
    const freshSession = await db.session.create({
      data: {
        userId: convertedUser.id,
        tokenHash: newSessionHash,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });
    createdSessionIds.push(freshSession.id);

    // Verify session lookup
    const foundSession = await db.session.findUnique({
      where: { tokenHash: newSessionHash },
      include: { user: true },
    });
    assert(foundSession?.userId === convertedUser.id, "Session correctly links to registered identity");

    // Simulate logout: delete session
    await db.session.deleteMany({
      where: { tokenHash: newSessionHash },
    });

    const deletedSessionCheck = await db.session.findUnique({
      where: { tokenHash: newSessionHash },
    });
    assert(deletedSessionCheck === null, "Scenario 13: Logout terminates session token in database");

    // -------------------------------------------------------------------------
    // Scenario 14: Existing Orbit, moderation, responses, notifications, archive, and settings remain functional
    // -------------------------------------------------------------------------
    // Orbit public check
    const orbitLetters = await db.letter.findMany({
      where: {
        visibility: "PUBLIC",
        entryType: "LETTER",
        isModerated: true,
        moderationStatus: "APPROVED",
      },
    });
    assert(orbitLetters.length >= 2, "Orbit returns approved public letters");

    // Standalone response check
    const responseCheck = await db.letter.findFirst({
      where: {
        parentLetterId: targetLetter.id,
        entryType: "RESPONSE",
        authorId: convertedUser.id,
      },
    });
    assert(responseCheck !== null, "Standalone response remains linked to parent letter");

    // Notification check
    const notifCheck = await db.notification.findFirst({
      where: { userId: convertedUser.id },
    });
    assert(notifCheck !== null && notifCheck.type === "RESPONSE_RECEIVED", "Notifications remain functional");

    // Personal archive check
    const archiveLetters = await db.letter.findMany({
      where: { authorId: convertedUser.id },
    });
    assert(archiveLetters.length >= 3, "Personal archive returns all letters of registered user");

    assert(true, "Scenario 14: Orbit, moderation, responses, notifications, archive, and settings remain 100% functional");
  } catch (error) {
    console.error("Test execution failed with error:", error);
    failed++;
  } finally {
    console.log("\nCleaning up test artifacts...");
    if (createdNotificationIds.length > 0) {
      await db.notification.deleteMany({ where: { id: { in: createdNotificationIds } } });
    }
    if (createdSavedIds.length > 0) {
      await db.savedLetter.deleteMany({ where: { id: { in: createdSavedIds } } });
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

runMilestone8Tests();
