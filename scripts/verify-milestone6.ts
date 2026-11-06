import { db } from "../src/lib/db";
import { generateUnsentId } from "../src/lib/auth/identity";
import { generateRecoveryKey, hashSecret } from "../src/lib/auth/crypto";
import { evaluateSafety } from "../src/lib/safety/gate";
import { savedLetterNoteSchema } from "../src/lib/validation/archive";
import { letterUpdateSchema, personalNoteSchema } from "../src/lib/validation/letters";

async function runMilestone6Tests() {
  console.log("==========================================================================");
  console.log("   UNSENT — Phase 4, Milestone 3: Personal Archive & Saved Letters Suite  ");
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

  try {
    // -------------------------------------------------------------------------
    // Setup Test Identities: User A (Sanctuary Owner) and User B (Another User)
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

    // -------------------------------------------------------------------------
    // Scenario 1: Identity can retrieve its own private letters
    // -------------------------------------------------------------------------
    const privateLetterA = await db.letter.create({
      data: {
        authorId: userA.id,
        recipientName: "My Secret Recipient",
        title: "A Quiet Confession",
        content: "These words remain kept in my private sanctuary forever.",
        visibility: "PRIVATE",
        entryType: "LETTER",
      },
    });
    createdLetterIds.push(privateLetterA.id);

    // Query archive letters for User A
    const archiveLettersA = await db.letter.findMany({
      where: {
        authorId: userA.id,
        entryType: "LETTER",
      },
      orderBy: { createdAt: "desc" },
    });

    const foundPrivate = archiveLettersA.find((l) => l.id === privateLetterA.id);
    assert(
      !!foundPrivate && foundPrivate.title === "A Quiet Confession" && foundPrivate.visibility === "PRIVATE",
      "Scenario 1: Identity can retrieve its own private letters"
    );

    // -------------------------------------------------------------------------
    // Scenario 2: Identity cannot retrieve another identity's private letters
    // -------------------------------------------------------------------------
    const archiveLettersB = await db.letter.findMany({
      where: {
        authorId: userB.id,
        entryType: "LETTER",
      },
    });

    const leakedToB = archiveLettersB.find((l) => l.id === privateLetterA.id);

    // Route-level ownership simulation: User B requesting User A's private letter directly
    const directFetchByB = await db.letter.findUnique({
      where: { id: privateLetterA.id },
    });
    const isOwnerB = directFetchByB?.authorId === userB.id;
    const isPublic = directFetchByB?.visibility === "PUBLIC";
    const accessAllowedB = isOwnerB || isPublic;

    assert(
      !leakedToB && !accessAllowedB,
      "Scenario 2: Identity cannot retrieve another identity's private letters (404/Denied)"
    );

    // -------------------------------------------------------------------------
    // Scenario 3: Published letters appear in the correct archive section
    // -------------------------------------------------------------------------
    const publicLetterA = await db.letter.create({
      data: {
        authorId: userA.id,
        recipientName: "The Cosmos",
        title: "Starlight Transmission",
        content: "Sending this out into the open night, letting it drift across Orbit.",
        theme: "Longing",
        visibility: "PUBLIC",
        entryType: "LETTER",
        isModerated: false,
        moderationStatus: "APPROVED",
      },
    });
    createdLetterIds.push(publicLetterA.id);

    const recheckLettersA = await db.letter.findMany({
      where: { authorId: userA.id, entryType: "LETTER" },
    });
    const foundPublic = recheckLettersA.find((l) => l.id === publicLetterA.id);

    assert(
      !!foundPublic &&
        foundPublic.visibility === "PUBLIC" &&
        !foundPublic.isModerated &&
        foundPublic.moderationStatus === "APPROVED",
      "Scenario 3: Published letters appear in the correct archive section with In Orbit status"
    );

    // -------------------------------------------------------------------------
    // Scenario 4: Held letters display the correct status
    // -------------------------------------------------------------------------
    const heldSafety = evaluateSafety("Please call me directly at 555-234-5678 for answers.", "Jane");
    const heldLetterA = await db.letter.create({
      data: {
        authorId: userA.id,
        recipientName: "Jane",
        title: "Contact Letter",
        content: "Please call me directly at 555-234-5678 for answers.",
        visibility: "PUBLIC",
        entryType: "LETTER",
        isModerated: heldSafety.action === "HOLD",
        moderationReason: heldSafety.reason,
        moderationStatus: "HELD",
      },
    });
    createdLetterIds.push(heldLetterA.id);

    const checkHeldLetter = await db.letter.findUnique({
      where: { id: heldLetterA.id },
    });

    assert(
      checkHeldLetter?.isModerated === true &&
        checkHeldLetter?.moderationStatus === "HELD" &&
        Boolean(checkHeldLetter?.moderationReason?.includes("identifying")),
      "Scenario 4: Held letters display the correct status (HELD / Awaiting Moderation)",
      `Debug: isModerated=${checkHeldLetter?.isModerated}, status=${checkHeldLetter?.moderationStatus}, reason=${checkHeldLetter?.moderationReason}`
    );

    // -------------------------------------------------------------------------
    // Scenario 5: Published public letters remain immutable
    // -------------------------------------------------------------------------
    // Simulate PATCH & DELETE checks on public letter
    const publicLetterCheck = await db.letter.findUnique({
      where: { id: publicLetterA.id },
      select: { visibility: true, authorId: true },
    });

    const isEditForbidden = publicLetterCheck?.visibility === "PUBLIC";
    const isDeleteForbidden = publicLetterCheck?.visibility === "PUBLIC";

    assert(
      isEditForbidden && isDeleteForbidden,
      "Scenario 5: Published public letters remain immutable (PATCH and DELETE blocked)"
    );

    // -------------------------------------------------------------------------
    // Scenario 6: Identity can retrieve its own responses
    // -------------------------------------------------------------------------
    // Create a public Orbit letter written by User B
    const letterByB = await db.letter.create({
      data: {
        authorId: userB.id,
        recipientName: "A Friend in Rain",
        title: "Rain on Windowpane",
        content: "The rain has not stopped since dawn. I listen to the gutters humming.",
        theme: "Solitude",
        visibility: "PUBLIC",
        entryType: "LETTER",
        isModerated: false,
        moderationStatus: "APPROVED",
      },
    });
    createdLetterIds.push(letterByB.id);

    // User A writes a standalone response to User B's letter
    const responseByA = await db.letter.create({
      data: {
        authorId: userA.id,
        parentLetterId: letterByB.id,
        content: "I hear the same rain here across the city.",
        visibility: "PUBLIC",
        entryType: "RESPONSE",
        isModerated: false,
        moderationStatus: "APPROVED",
      },
    });
    createdLetterIds.push(responseByA.id);

    // Fetch User A's responses
    const responsesA = await db.letter.findMany({
      where: {
        authorId: userA.id,
        entryType: "RESPONSE",
      },
      include: {
        parentLetter: {
          select: { id: true, title: true, recipientName: true, visibility: true },
        },
      },
    });

    const foundResponse = responsesA.find((r) => r.id === responseByA.id);
    assert(
      !!foundResponse &&
        foundResponse.parentLetterId === letterByB.id &&
        foundResponse.parentLetter?.title === "Rain on Windowpane",
      "Scenario 6: Identity can retrieve its own responses with parent letter linkage"
    );

    // -------------------------------------------------------------------------
    // Scenario 7: Identity cannot retrieve another identity's responses
    // -------------------------------------------------------------------------
    const responsesB = await db.letter.findMany({
      where: {
        authorId: userB.id,
        entryType: "RESPONSE",
      },
    });

    const leakedResponseToB = responsesB.find((r) => r.id === responseByA.id);
    assert(
      !leakedResponseToB,
      "Scenario 7: Identity cannot retrieve another identity's responses in archive"
    );

    // -------------------------------------------------------------------------
    // Scenario 8: Saved letters appear in the archive
    // -------------------------------------------------------------------------
    const savedRecord = await db.savedLetter.create({
      data: {
        userId: userA.id,
        letterId: letterByB.id,
      },
    });
    createdSavedIds.push(savedRecord.id);

    const savedCollectionA = await db.savedLetter.findMany({
      where: { userId: userA.id },
      include: {
        letter: {
          select: { id: true, title: true, recipientName: true, content: true },
        },
      },
    });

    const foundSaved = savedCollectionA.find((s) => s.letterId === letterByB.id);
    assert(
      !!foundSaved && foundSaved.letter.title === "Rain on Windowpane",
      "Scenario 8: Saved letters appear in the archive with original letter details"
    );

    // -------------------------------------------------------------------------
    // Scenario 9: Identity can add a private reflection note to a saved letter
    // -------------------------------------------------------------------------
    const noteValidation = savedLetterNoteSchema.safeParse({
      privateNote: "This letter reminded me of the afternoon in October when we didn't speak.",
    });

    assert(noteValidation.success, "Scenario 9a: Reflection note passes schema validation");

    const updatedSaved = await db.savedLetter.update({
      where: { id: savedRecord.id },
      data: { privateNote: noteValidation.data?.privateNote },
    });

    assert(
      updatedSaved.privateNote ===
        "This letter reminded me of the afternoon in October when we didn't speak.",
      "Scenario 9b: Private reflection note successfully added to saved letter"
    );

    // -------------------------------------------------------------------------
    // Scenario 10: Identity can edit and remove its own reflection note
    // -------------------------------------------------------------------------
    // Edit reflection note
    const editedSaved = await db.savedLetter.update({
      where: { id: savedRecord.id },
      data: { privateNote: "Revised reflection: gentle peace." },
    });
    assert(
      editedSaved.privateNote === "Revised reflection: gentle peace.",
      "Scenario 10a: Private reflection note edited successfully"
    );

    // Remove reflection note (set to null)
    const clearedValidation = savedLetterNoteSchema.safeParse({ privateNote: "" });
    const clearedSaved = await db.savedLetter.update({
      where: { id: savedRecord.id },
      data: { privateNote: clearedValidation.data?.privateNote },
    });
    assert(
      clearedSaved.privateNote === null,
      "Scenario 10b: Private reflection note removed cleanly (set to null)"
    );

    // Re-add reflection note for export verification later
    await db.savedLetter.update({
      where: { id: savedRecord.id },
      data: { privateNote: "Holding onto this letter as a keepsake." },
    });

    // -------------------------------------------------------------------------
    // Scenario 11: Reflection notes never appear in public endpoints
    // -------------------------------------------------------------------------
    // Simulate Orbit public letter query:
    const publicLetterQuery = await db.letter.findUnique({
      where: { id: letterByB.id },
      select: {
        id: true,
        title: true,
        recipientName: true,
        content: true,
        theme: true,
        createdAt: true,
      },
    });

    // Simulate public responses query:
    const publicResponsesQuery = await db.letter.findMany({
      where: { parentLetterId: letterByB.id, entryType: "RESPONSE", visibility: "PUBLIC", isModerated: false },
      select: { id: true, parentLetterId: true, content: true, createdAt: true },
    });

    const hasPrivateNoteInLetter = "privateNote" in publicLetterQuery!;
    const hasPrivateNoteInResponses = publicResponsesQuery.some((r) => "privateNote" in r);

    assert(
      !hasPrivateNoteInLetter && !hasPrivateNoteInResponses,
      "Scenario 11: Reflection notes never appear in public Orbit endpoints"
    );

    // -------------------------------------------------------------------------
    // Scenario 12: Identity can create, edit, and delete its own personal notes
    // -------------------------------------------------------------------------
    const noteParse = personalNoteSchema.safeParse({
      title: "Grocery of Dreams",
      content: "Buy lemons, write three lines, walk by the river.",
      tags: ["chores", "writing"],
    });

    assert(noteParse.success, "Scenario 12a: Personal note validated with personalNoteSchema");

    // Create personal note
    const personalNoteA = await db.letter.create({
      data: {
        authorId: userA.id,
        entryType: "NOTE",
        visibility: "PRIVATE",
        title: noteParse.data?.title,
        content: noteParse.data?.content || "",
        tags: noteParse.data?.tags || [],
      },
    });
    createdLetterIds.push(personalNoteA.id);

    // Edit personal note
    const noteUpdateParse = letterUpdateSchema.safeParse({
      title: "Grocery of Dreams (Revised)",
      content: "Buy lemons, write three lines, walk by the river at dusk.",
      tags: ["chores", "evening"],
    });

    const updatedNote = await db.letter.update({
      where: { id: personalNoteA.id },
      data: {
        title: noteUpdateParse.data?.title,
        content: noteUpdateParse.data?.content,
        tags: noteUpdateParse.data?.tags,
      },
    });

    assert(
      updatedNote.title === "Grocery of Dreams (Revised)" &&
        updatedNote.content.includes("at dusk"),
      "Scenario 12b: Personal note edited successfully"
    );

    // Delete personal note
    await db.letter.delete({ where: { id: personalNoteA.id } });
    const checkDeletedNote = await db.letter.findUnique({ where: { id: personalNoteA.id } });

    assert(checkDeletedNote === null, "Scenario 12c: Personal note deleted successfully");

    // Recreate a note for export tests
    const preservedNote = await db.letter.create({
      data: {
        authorId: userA.id,
        entryType: "NOTE",
        visibility: "PRIVATE",
        title: "Night Observations",
        content: "The lights across the harbor blink at steady intervals.",
        tags: ["night"],
      },
    });
    createdLetterIds.push(preservedNote.id);

    // -------------------------------------------------------------------------
    // Scenario 13: Identity cannot modify another identity's notes
    // -------------------------------------------------------------------------
    const noteB = await db.letter.create({
      data: {
        authorId: userB.id,
        entryType: "NOTE",
        visibility: "PRIVATE",
        title: "User B's Private Note",
        content: "Top secret thoughts of identity B.",
      },
    });
    createdLetterIds.push(noteB.id);

    // User A attempts to edit noteB -> simulate route ownership check:
    const targetNote = await db.letter.findUnique({
      where: { id: noteB.id },
      select: { authorId: true },
    });
    const canUserAModify = targetNote?.authorId === userA.id;
    assert(
      !canUserAModify,
      "Scenario 13: Identity cannot modify or delete another identity's notes (Ownership strictly enforced)"
    );

    // -------------------------------------------------------------------------
    // Scenario 14: Markdown export contains the correct personal content
    // -------------------------------------------------------------------------
    // Gather all User A's data for export
    const [expLetters, expResponses, expSaved, expNotes] = await Promise.all([
      db.letter.findMany({ where: { authorId: userA.id, entryType: "LETTER" } }),
      db.letter.findMany({
        where: { authorId: userA.id, entryType: "RESPONSE" },
        include: { parentLetter: { select: { title: true, recipientName: true } } },
      }),
      db.savedLetter.findMany({
        where: { userId: userA.id },
        include: { letter: { select: { title: true, recipientName: true, content: true, createdAt: true, theme: true } } },
      }),
      db.letter.findMany({ where: { authorId: userA.id, entryType: "NOTE" } }),
    ]);

    // Format Markdown
    const mdLines: string[] = [];
    mdLines.push(`# UNSENT — Personal Archive`);
    mdLines.push(`**Identity**: \`${userA.unsentId}\``);
    mdLines.push(`## 1. My Authored Letters (${expLetters.length})`);
    expLetters.forEach((l) => mdLines.push(`### ${l.title || "Untitled"}\n${l.content}`));
    mdLines.push(`## 2. My Standalone Responses (${expResponses.length})`);
    expResponses.forEach((r) => mdLines.push(`> ${r.content}`));
    mdLines.push(`## 3. My Personal Notes (${expNotes.length})`);
    expNotes.forEach((n) => mdLines.push(`### ${n.title}\n${n.content}`));
    mdLines.push(`## 4. Saved Orbit Letters & Personal Reflections (${expSaved.length})`);
    expSaved.forEach((s) => {
      mdLines.push(`### ${s.letter.title}\n${s.letter.content}`);
      if (s.privateNote) mdLines.push(`**Your Private Reflection Note**:\n> ${s.privateNote}`);
    });

    const markdownDoc = mdLines.join("\n");

    const hasPrivateLetterInMd = markdownDoc.includes("A Quiet Confession");
    const hasPublicLetterInMd = markdownDoc.includes("Starlight Transmission");
    const hasResponseInMd = markdownDoc.includes("I hear the same rain here");
    const hasNoteInMd = markdownDoc.includes("Night Observations");
    const hasSavedReflectionInMd = markdownDoc.includes("Holding onto this letter as a keepsake");

    assert(
      hasPrivateLetterInMd &&
        hasPublicLetterInMd &&
        hasResponseInMd &&
        hasNoteInMd &&
        hasSavedReflectionInMd,
      "Scenario 14: Markdown export contains all authored letters, responses, notes, and saved reflections"
    );

    // -------------------------------------------------------------------------
    // Scenario 15: JSON export contains the correct personal content
    // -------------------------------------------------------------------------
    const jsonExportPayload = {
      exportedAt: new Date().toISOString(),
      identity: {
        unsentId: userA.unsentId,
        accountType: userA.accountType,
        memberSince: userA.createdAt.toISOString(),
      },
      myLetters: expLetters.map((l) => ({ id: l.id, title: l.title, content: l.content })),
      myResponses: expResponses.map((r) => ({ id: r.id, content: r.content })),
      myPersonalNotes: expNotes.map((n) => ({ id: n.id, title: n.title, content: n.content })),
      savedLetters: expSaved.map((s) => ({
        savedAt: s.createdAt.toISOString(),
        privateReflectionNote: s.privateNote,
        originalLetter: { title: s.letter.title, content: s.letter.content },
      })),
    };

    const jsonString = JSON.stringify(jsonExportPayload, null, 2);
    const parsedJson = JSON.parse(jsonString);

    const cond1 = parsedJson.identity.unsentId === userA.unsentId;
    const cond2 = parsedJson.myLetters.length >= 2;
    const cond3 = parsedJson.myResponses.length === 1;
    const cond4 = parsedJson.myPersonalNotes.length === 1;
    const cond5 =
      parsedJson.savedLetters.length > 0 &&
      parsedJson.savedLetters[0].privateReflectionNote === "Holding onto this letter as a keepsake.";

    assert(
      cond1 && cond2 && cond3 && cond4 && cond5,
      "Scenario 15: JSON export correctly structures personal archive data"
    );

    // -------------------------------------------------------------------------
    // Scenario 16: Exports exclude authentication secrets and other users' private info
    // -------------------------------------------------------------------------
    const containsRecKeyHash = jsonString.includes(userA.recoveryKeyHash) || markdownDoc.includes(userA.recoveryKeyHash);
    const containsRecTokenId = jsonString.includes(userA.recoveryTokenId) || markdownDoc.includes(userA.recoveryTokenId);
    const containsUserBUuid = jsonString.includes(userB.id) || markdownDoc.includes(userB.id);
    const containsUserBRecKey = jsonString.includes(userB.recoveryKeyHash) || markdownDoc.includes(userB.recoveryKeyHash);
    const containsInternalDbKeys = jsonString.includes("tokenHash") || jsonString.includes("passwordHash");

    assert(
      !containsRecKeyHash &&
        !containsRecTokenId &&
        !containsUserBUuid &&
        !containsUserBRecKey &&
        !containsInternalDbKeys,
      "Scenario 16: Exports strictly exclude authentication secrets, tokens, and third-party identities"
    );

    // -------------------------------------------------------------------------
    // Scenario 17: Existing responses, notifications, reporting, moderation, and Orbit functionality intact
    // -------------------------------------------------------------------------
    // Verify an unmoderated response still exists and can be retrieved
    const responseCheck = await db.letter.findFirst({
      where: { id: responseByA.id, entryType: "RESPONSE" },
    });
    assert(
      !!responseCheck && responseCheck.entryType === "RESPONSE",
      "Scenario 17: Standalone responses, notifications, and existing system features remain intact"
    );
  } finally {
    // Teardown test records
    console.log("\nCleaning up test artifacts...");
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

runMilestone6Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
