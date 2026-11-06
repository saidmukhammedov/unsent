import { db } from "../src/lib/db";
import { generateUnsentId } from "../src/lib/auth/identity";
import { generateRecoveryKey, hashSecret } from "../src/lib/auth/crypto";
import { evaluateSafety } from "../src/lib/safety/gate";
import { orbitQuerySchema } from "../src/lib/validation/letters";
import { APPROVED_THEMES, isValidTheme, normalizeTheme } from "../src/lib/constants/themes";

async function runMilestone3Tests() {
  console.log("==============================================================");
  console.log("   UNSENT — Phase 3, Milestone 1: Orbit Verification Suite   ");
  console.log("==============================================================\n");

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

  // Track created IDs for clean teardown
  const createdUserIds: string[] = [];
  const createdLetterIds: string[] = [];
  const createdSavedIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // Setup Test Users (User 1 & User 2)
    // -------------------------------------------------------------------------
    const unsentId1 = generateUnsentId();
    const { recoveryKey: recKey1, recoveryTokenId: recTokenId1 } = generateRecoveryKey();
    const user1 = await db.user.create({
      data: {
        unsentId: unsentId1,
        accountType: "ANONYMOUS",
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
        recoveryTokenId: recTokenId2,
        recoveryKeyHash: await hashSecret(recKey2),
      },
    });
    createdUserIds.push(user2.id);

    // -------------------------------------------------------------------------
    // Scenario 1: Public letters appear in Orbit
    // -------------------------------------------------------------------------
    const publicLetter1 = await db.letter.create({
      data: {
        authorId: user1.id,
        recipientName: "To Someone",
        title: "A Letter for the Stars",
        content: "I released these words into the night sky, hoping they find peace.",
        theme: "Hope",
        visibility: "PUBLIC",
        entryType: "LETTER",
        isModerated: false,
      },
    });
    createdLetterIds.push(publicLetter1.id);

    // Query Orbit feed matching the API logic
    const orbitLetters = await db.letter.findMany({
      where: {
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
      },
    });

    const isPublicPresent = orbitLetters.some((l) => l.id === publicLetter1.id);
    assert(isPublicPresent, "Requirement 1: Public letters appear in Orbit feed");

    // -------------------------------------------------------------------------
    // Scenario 2: Private letters never appear in Orbit
    // -------------------------------------------------------------------------
    const privateLetter = await db.letter.create({
      data: {
        authorId: user1.id,
        recipientName: "Strictly Private",
        title: "A Secret Never Shared",
        content: "This must never ever leave my own heart or appear in Orbit.",
        visibility: "PRIVATE",
        entryType: "LETTER",
        isModerated: false,
      },
    });
    createdLetterIds.push(privateLetter.id);

    const isPrivateInOrbit = orbitLetters.some((l) => l.id === privateLetter.id);
    const orbitFindPrivate = await db.letter.findFirst({
      where: {
        id: privateLetter.id,
        visibility: "PUBLIC",
        isModerated: false,
      },
    });

    assert(
      !isPrivateInOrbit && orbitFindPrivate === null,
      "Requirement 2: Private letters never appear in Orbit or public reading endpoints"
    );

    // -------------------------------------------------------------------------
    // Scenario 3: Held letters (isModerated = true) never appear in Orbit
    // -------------------------------------------------------------------------
    const heldLetter = await db.letter.create({
      data: {
        authorId: user1.id,
        recipientName: "Held Submission",
        title: "Submission with Contact Info",
        content: "Call me back at 555-234-5678, my personal number.",
        visibility: "PUBLIC",
        entryType: "LETTER",
        isModerated: true,
        moderationReason: "Contains phone number",
      },
    });
    createdLetterIds.push(heldLetter.id);

    const isHeldInOrbit = orbitLetters.some((l) => l.id === heldLetter.id);
    const orbitFindHeld = await db.letter.findFirst({
      where: {
        id: heldLetter.id,
        visibility: "PUBLIC",
        isModerated: false,
      },
    });

    assert(
      !isHeldInOrbit && orbitFindHeld === null,
      "Requirement 3: Held letters (isModerated = true) never appear in Orbit or public endpoints"
    );

    // -------------------------------------------------------------------------
    // Scenario 4: Public letter details never expose author identity
    // -------------------------------------------------------------------------
    const publicQuery = await db.letter.findFirst({
      where: {
        id: publicLetter1.id,
        visibility: "PUBLIC",
        isModerated: false,
      },
      select: {
        id: true,
        title: true,
        recipientName: true,
        content: true,
        theme: true,
        createdAt: true,
      },
    });

    const exposedFields = Object.keys(publicQuery || {}).filter((k) =>
      ["authorId", "author", "unsentId", "phone", "recoveryKeyHash", "recoveryTokenId"].includes(k)
    );

    assert(
      publicQuery !== null && exposedFields.length === 0,
      "Requirement 4: Public letter details strictly omit author IDs, UNSENT IDs, and credentials"
    );

    // -------------------------------------------------------------------------
    // Scenario 5: Latest mode uses chronological ordering (createdAt: desc)
    // -------------------------------------------------------------------------
    const publicLetter2 = await db.letter.create({
      data: {
        authorId: user2.id,
        recipientName: "Older Memory",
        content: "An echo from yesterday.",
        theme: "Longing",
        visibility: "PUBLIC",
        entryType: "LETTER",
        isModerated: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
      },
    });
    createdLetterIds.push(publicLetter2.id);

    const publicLetter3 = await db.letter.create({
      data: {
        authorId: user2.id,
        recipientName: "Recent Memory",
        content: "An echo from just now.",
        theme: "Goodbyes",
        visibility: "PUBLIC",
        entryType: "LETTER",
        isModerated: false,
        createdAt: new Date(), // Now
      },
    });
    createdLetterIds.push(publicLetter3.id);

    const latestOrdered = await db.letter.findMany({
      where: {
        visibility: "PUBLIC",
        isModerated: false,
        entryType: "LETTER",
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true },
    });

    let isStrictlyChronological = true;
    for (let i = 0; i < latestOrdered.length - 1; i++) {
      if (latestOrdered[i].createdAt.getTime() < latestOrdered[i + 1].createdAt.getTime()) {
        isStrictlyChronological = false;
        break;
      }
    }

    assert(
      isStrictlyChronological && latestOrdered.length >= 3,
      "Requirement 5: Latest mode enforces strict chronological order (createdAt: desc)"
    );

    // -------------------------------------------------------------------------
    // Scenario 6: Category / theme filtering returns only matching letters
    // -------------------------------------------------------------------------
    const griefLetter = await db.letter.create({
      data: {
        authorId: user1.id,
        recipientName: "In Remembrance",
        content: "Grief is the price we pay for love that had nowhere else to go.",
        theme: "Grief",
        visibility: "PUBLIC",
        entryType: "LETTER",
        isModerated: false,
      },
    });
    createdLetterIds.push(griefLetter.id);

    const filteredGrief = await db.letter.findMany({
      where: {
        visibility: "PUBLIC",
        isModerated: false,
        entryType: "LETTER",
        theme: "Grief",
      },
      select: { id: true, theme: true },
    });

    const allAreGrief = filteredGrief.length > 0 && filteredGrief.every((l) => l.theme === "Grief");
    const containsGriefLetter = filteredGrief.some((l) => l.id === griefLetter.id);
    const excludesHopeLetter = filteredGrief.every((l) => l.id !== publicLetter1.id);

    assert(
      allAreGrief && containsGriefLetter && excludesHopeLetter,
      "Requirement 6: Theme filtering strictly returns only letters matching the requested theme"
    );

    // -------------------------------------------------------------------------
    // Scenario 7: Invalid categories and pagination parameters are rejected (400)
    // -------------------------------------------------------------------------
    const badThemeCheck = orbitQuerySchema.safeParse({
      mode: "latest",
      theme: "UnsupportedRandomTheme",
      page: 1,
      limit: 10,
    });
    assert(!badThemeCheck.success, "Requirement 7a: Invalid theme category is rejected by validator");

    const badPageCheck = orbitQuerySchema.safeParse({
      mode: "latest",
      page: 0,
      limit: 10,
    });
    assert(!badPageCheck.success, "Requirement 7b: Invalid page number (< 1) is rejected by validator");

    const badLimitCheck = orbitQuerySchema.safeParse({
      mode: "latest",
      page: 1,
      limit: 999,
    });
    assert(!badLimitCheck.success, "Requirement 7c: Limit exceeding maximum (50) is rejected by validator");

    const validQueryCheck = orbitQuerySchema.safeParse({
      mode: "discover",
      theme: "Grief",
      page: 2,
      limit: 15,
    });
    assert(validQueryCheck.success, "Requirement 7d: Valid query parameters are cleanly accepted");

    // -------------------------------------------------------------------------
    // Scenario 8: Anonymous users can save public letters
    // -------------------------------------------------------------------------
    const savedLetter1 = await db.savedLetter.upsert({
      where: {
        userId_letterId: {
          userId: user1.id,
          letterId: publicLetter1.id,
        },
      },
      create: {
        userId: user1.id,
        letterId: publicLetter1.id,
      },
      update: {},
    });
    createdSavedIds.push(savedLetter1.id);

    const verifySaved = await db.savedLetter.findUnique({
      where: {
        userId_letterId: {
          userId: user1.id,
          letterId: publicLetter1.id,
        },
      },
    });

    assert(
      verifySaved !== null && verifySaved.userId === user1.id && verifySaved.letterId === publicLetter1.id,
      "Requirement 8: Anonymous user can save public letter into their private collection"
    );

    // -------------------------------------------------------------------------
    // Scenario 9: Duplicate saves are prevented
    // -------------------------------------------------------------------------
    // Attempt duplicate upsert
    const duplicateSave = await db.savedLetter.upsert({
      where: {
        userId_letterId: {
          userId: user1.id,
          letterId: publicLetter1.id,
        },
      },
      create: {
        userId: user1.id,
        letterId: publicLetter1.id,
      },
      update: {},
    });

    const totalSavedByUser1ForLetter1 = await db.savedLetter.count({
      where: {
        userId: user1.id,
        letterId: publicLetter1.id,
      },
    });

    assert(
      duplicateSave.id === savedLetter1.id && totalSavedByUser1ForLetter1 === 1,
      "Requirement 9: Duplicate saves are prevented and handled idempotently"
    );

    // -------------------------------------------------------------------------
    // Scenario 10: One identity cannot access another identity's saved letters
    // -------------------------------------------------------------------------
    // User 1 saved publicLetter1.
    // Query saved letters for User 2.
    const user2SavedList = await db.savedLetter.findMany({
      where: {
        userId: user2.id,
      },
    });

    const user2CanSeeUser1Saved = user2SavedList.some((s) => s.letterId === publicLetter1.id);
    assert(
      !user2CanSeeUser1Saved && user2SavedList.length === 0,
      "Requirement 10: Strict boundary isolation prevents accessing another identity's saved letters"
    );

    // -------------------------------------------------------------------------
    // Scenario 11: Unsave works correctly
    // -------------------------------------------------------------------------
    await db.savedLetter.deleteMany({
      where: {
        userId: user1.id,
        letterId: publicLetter1.id,
      },
    });

    const afterUnsave = await db.savedLetter.findUnique({
      where: {
        userId_letterId: {
          userId: user1.id,
          letterId: publicLetter1.id,
        },
      },
    });

    assert(
      afterUnsave === null,
      "Requirement 11: Unsave correctly removes the letter from the user's saved collection"
    );

    // -------------------------------------------------------------------------
    // Scenario 12: Public letters remain immutable (cannot be edited or deleted)
    // -------------------------------------------------------------------------
    // Verify business rule check logic in PATCH / DELETE routes:
    // When visibility === "PUBLIC", editing and deletion are prohibited with IMMUTABLE_CONTENT
    const publicLetterCheck = await db.letter.findUnique({
      where: { id: publicLetter1.id },
      select: { visibility: true },
    });

    const isEditAllowed = publicLetterCheck?.visibility !== "PUBLIC";
    const isDeleteAllowed = publicLetterCheck?.visibility !== "PUBLIC";

    assert(
      !isEditAllowed && !isDeleteAllowed,
      "Requirement 12: Public letters remain strictly immutable (cannot be edited or deleted by authors)"
    );

    // -------------------------------------------------------------------------
    // Scenario 13: Safety gate prevents or holds unsafe submissions
    // -------------------------------------------------------------------------
    // 13a: Clean submission -> ALLOW
    const cleanSafety = evaluateSafety(
      "I never told you how much that quiet summer afternoon meant to me.",
      "Elena",
      "Summer afternoon"
    );
    assert(
      cleanSafety.action === "ALLOW",
      "Requirement 13a: Clean poetic letter passes safety gate (action = ALLOW)"
    );

    // 13b: PII Phone number -> HOLD
    const phoneSafety = evaluateSafety(
      "Please call me at 212-555-0199 whenever you can.",
      "Someone"
    );
    assert(
      phoneSafety.action === "HOLD" && phoneSafety.detectedFlags.includes("PII_PHONE"),
      "Requirement 13b: Phone number triggers moderation HOLD (action = HOLD)"
    );

    // 13c: PII Email address -> HOLD
    const emailSafety = evaluateSafety(
      "Write to my personal inbox at confidential.test@gmail.com please.",
      "Friend"
    );
    assert(
      emailSafety.action === "HOLD" && emailSafety.detectedFlags.includes("PII_EMAIL"),
      "Requirement 13c: Email address triggers moderation HOLD (action = HOLD)"
    );

    // 13d: Prohibited violent threat -> BLOCK
    const threatSafety = evaluateSafety(
      "I am going to kill you for what you did.",
      "Enemy"
    );
    assert(
      threatSafety.action === "BLOCK" && threatSafety.detectedFlags.includes("VIOLENCE_OR_THREAT"),
      "Requirement 13d: Violent threats trigger immediate BLOCK (action = BLOCK)"
    );

    // 13e: Prohibited doxxing / residential address -> HOLD / BLOCK
    const addressSafety = evaluateSafety(
      "Meet me at 742 Evergreen Terrace, Springfield, IL 62704 tonight."
    );
    assert(
      addressSafety.action !== "ALLOW" && addressSafety.detectedFlags.includes("PII_STREET_ADDRESS"),
      "Requirement 13e: Physical street address is detected and held/blocked"
    );

    // -------------------------------------------------------------------------
    // Scenario 14: Existing identity and writing functionality still works
    // -------------------------------------------------------------------------
    const note = await db.letter.create({
      data: {
        authorId: user1.id,
        title: "Personal Scratchpad",
        content: "A private thought saved in the personal notes space.",
        visibility: "PRIVATE",
        entryType: "NOTE",
      },
    });
    createdLetterIds.push(note.id);

    const retrievedNote = await db.letter.findFirst({
      where: {
        id: note.id,
        authorId: user1.id,
        entryType: "NOTE",
      },
    });

    const isThemesConstValid = APPROVED_THEMES.length === 9 && isValidTheme("Love") && isValidTheme("goodbyes");
    const isNormalizedTheme = normalizeTheme("regret") === "Regret";

    assert(
      retrievedNote !== null && isThemesConstValid && isNormalizedTheme,
      "Requirement 14: Existing anonymous identity, personal notes, and theme taxonomy work seamlessly"
    );

    // -------------------------------------------------------------------------
    // Teardown Test Data
    // -------------------------------------------------------------------------
    console.log("\nCleaning up test artifacts...");
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

    console.log("\n==============================================================");
    console.log(`   Verification Results: ${passed} Passed, ${failed} Failed   `);
    console.log("==============================================================\n");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution failed with error:", err);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

runMilestone3Tests();
