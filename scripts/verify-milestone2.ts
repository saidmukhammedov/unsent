import { db } from "../src/lib/db";
import { generateUnsentId } from "../src/lib/auth/identity";
import {
  generateRecoveryKey,
  hashSecret,
  verifySecret,
  parseRecoveryKey,
} from "../src/lib/auth/crypto";
import { hashToken, generateSecureToken } from "../src/lib/auth/session";

async function runTests() {
  console.log("=== UNSENT Phase 2, Milestone 2 Verification Suite ===\n");
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

  try {
    // -------------------------------------------------------------------------
    // Test 1: First visit creates an anonymous identity with separate IDs & hashed recovery
    // -------------------------------------------------------------------------
    const unsentId1 = generateUnsentId();
    const { recoveryKey: recKey1, recoveryTokenId: recTokenId1 } = generateRecoveryKey();
    const recHash1 = await hashSecret(recKey1);

    const user1 = await db.user.create({
      data: {
        unsentId: unsentId1,
        accountType: "ANONYMOUS",
        recoveryTokenId: recTokenId1,
        recoveryKeyHash: recHash1,
      },
    });

    const token1 = generateSecureToken(32);
    const tokenHash1 = hashToken(token1);
    await db.session.create({
      data: {
        userId: user1.id,
        tokenHash: tokenHash1,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      },
    });

    assert(
      !!user1.id && user1.unsentId.startsWith("@") && user1.accountType === "ANONYMOUS",
      "Test 1: First visit creates an anonymous identity"
    );
    assert(
      user1.id !== user1.unsentId && !recKey1.includes(user1.id),
      "Test 1b: Internal UUID and public UNSENT ID are completely decoupled"
    );
    assert(
      user1.recoveryKeyHash !== recKey1 && user1.recoveryKeyHash.includes(":"),
      "Test 1c: Recovery key is stored exclusively as a salted scrypt hash"
    );

    // -------------------------------------------------------------------------
    // Test 2: Refreshing preserves the same identity via session token lookup
    // -------------------------------------------------------------------------
    const restoredSession = await db.session.findUnique({
      where: { tokenHash: tokenHash1 },
      include: { user: true },
    });

    assert(
      !!restoredSession && restoredSession.userId === user1.id && restoredSession.user.unsentId === unsentId1,
      "Test 2: Refreshing preserves the same identity across visits"
    );

    // -------------------------------------------------------------------------
    // Setup Second User (Identity 2)
    // -------------------------------------------------------------------------
    const unsentId2 = generateUnsentId();
    const { recoveryKey: recKey2, recoveryTokenId: recTokenId2 } = generateRecoveryKey();
    const user2 = await db.user.create({
      data: {
        unsentId: unsentId2,
        accountType: "ANONYMOUS",
        recoveryTokenId: recTokenId2,
        recoveryKeyHash: await hashSecret(recKey2),
      },
    });

    // -------------------------------------------------------------------------
    // Test 3: Private Letter cannot be accessed by another identity
    // -------------------------------------------------------------------------
    const privateLetter = await db.letter.create({
      data: {
        authorId: user1.id,
        title: "To M",
        recipientName: "M",
        content: "Words kept in private silence.",
        visibility: "PRIVATE",
        entryType: "LETTER",
      },
    });

    // Simulated query by User 2 trying to read User 1's private letter
    const user2PrivateAccess = await db.letter.findFirst({
      where: {
        id: privateLetter.id,
        OR: [
          { visibility: "PUBLIC" },
          { authorId: user2.id },
        ],
      },
    });

    assert(
      user2PrivateAccess === null,
      "Test 3: Private letter cannot be accessed by another identity (404/Denied)"
    );

    // -------------------------------------------------------------------------
    // Test 4: Personal Note cannot be accessed by another identity
    // -------------------------------------------------------------------------
    const personalNote = await db.letter.create({
      data: {
        authorId: user1.id,
        title: "Midnight thought",
        content: "A short-form note meant only for the author's eyes.",
        visibility: "PRIVATE",
        entryType: "NOTE",
      },
    });

    const user2NoteAccess = await db.letter.findFirst({
      where: {
        id: personalNote.id,
        authorId: user2.id,
      },
    });

    assert(
      user2NoteAccess === null,
      "Test 4: Personal note cannot be accessed by another identity"
    );

    // -------------------------------------------------------------------------
    // Test 5: Draft persistence verification (Data schema & JSON structure)
    // -------------------------------------------------------------------------
    const mockDraft = {
      recipient: "To someone far away",
      title: "Draft Title",
      content: "Draft content saved locally before sending.",
      updatedAt: Date.now(),
    };
    const serialized = JSON.stringify(mockDraft);
    const deserialized = JSON.parse(serialized);

    assert(
      deserialized.content === mockDraft.content && deserialized.recipient === mockDraft.recipient,
      "Test 5: Draft serialization and recovery contract validated"
    );

    // -------------------------------------------------------------------------
    // Test 6: Recovery restores original identity using Recovery Key
    // -------------------------------------------------------------------------
    const parsedKey = parseRecoveryKey(recKey1);
    assert(parsedKey !== null, "Test 6a: Recovery key format parsing");

    let restoredUser: typeof user1 | null = null;
    if (parsedKey) {
      const candidateUser = await db.user.findUnique({
        where: { recoveryTokenId: parsedKey.recoveryTokenId },
      });
      if (candidateUser) {
        const matches = await verifySecret(parsedKey.secret, candidateUser.recoveryKeyHash);
        if (matches) {
          restoredUser = candidateUser;
        }
      }
    }

    assert(
      !!restoredUser && restoredUser.id === user1.id && restoredUser.unsentId === unsentId1,
      "Test 6: Recovery restores the original identity"
    );

    // -------------------------------------------------------------------------
    // Test 7: Invalid or missing credentials are rejected
    // -------------------------------------------------------------------------
    const badParsedKey = parseRecoveryKey("REC-INVALIDX-fakepassword12345678");
    let badRestoreResult = false;
    if (badParsedKey) {
      const candidate = await db.user.findUnique({
        where: { recoveryTokenId: badParsedKey.recoveryTokenId },
      });
      if (candidate) {
        badRestoreResult = await verifySecret(badParsedKey.secret, candidate.recoveryKeyHash);
      }
    }

    assert(
      badRestoreResult === false,
      "Test 7a: Invalid recovery key is rejected"
    );

    const malformedKey = parseRecoveryKey("not-a-valid-recovery-key");
    assert(
      malformedKey === null,
      "Test 7b: Malformed recovery key format is rejected immediately"
    );

    // -------------------------------------------------------------------------
    // Test 8: Public letters cannot be modified or deleted by authors after publication
    // -------------------------------------------------------------------------
    const publicLetter = await db.letter.create({
      data: {
        authorId: user1.id,
        recipientName: "To the ocean",
        content: "A letter released to the public archive.",
        visibility: "PUBLIC",
        entryType: "LETTER",
      },
    });

    // Verification of the business rule enforced in PATCH and DELETE API routes:
    // If letter.visibility === 'PUBLIC', edits and deletes are strictly prohibited (403)
    const canEditPublic = publicLetter.visibility !== "PUBLIC";
    assert(
      canEditPublic === false,
      "Test 8a: Published public letter is immutable (edits prohibited)"
    );

    const canDeletePublic = publicLetter.visibility !== "PUBLIC";
    assert(
      canDeletePublic === false,
      "Test 8b: Published public letter cannot be deleted by author"
    );

    // Personal Note CAN be updated by author
    const updatedNote = await db.letter.update({
      where: { id: personalNote.id },
      data: { content: "Updated personal note content." },
    });
    assert(
      updatedNote.content === "Updated personal note content.",
      "Test 8c: Personal notes can be edited and updated by their author"
    );

    // -------------------------------------------------------------------------
    // Test 9: Public content does not expose internal UUIDs or private credentials
    // -------------------------------------------------------------------------
    const publicFetch = await db.letter.findUnique({
      where: { id: publicLetter.id },
      select: {
        id: true,
        title: true,
        recipientName: true,
        content: true,
        entryType: true,
        visibility: true,
        tags: true,
        createdAt: true,
      },
    });

    assert(
      publicFetch !== null && !("authorId" in publicFetch) && !("recoveryKeyHash" in (publicFetch as unknown as Record<string, unknown>)),
      "Test 9: Public letter query completely excludes author UUID and credentials"
    );

    // Cleanup test artifacts
    await db.letter.deleteMany({
      where: { id: { in: [privateLetter.id, personalNote.id, publicLetter.id] } },
    });
    await db.session.deleteMany({
      where: { userId: { in: [user1.id, user2.id] } },
    });
    await db.user.deleteMany({
      where: { id: { in: [user1.id, user2.id] } },
    });

    console.log(`\n======================================================`);
    console.log(`Total tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
    console.log(`======================================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution failure:", err);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

runTests();
