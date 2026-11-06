import { NextResponse } from "next/server";
import { ensureSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import type { ArchiveData } from "@/types/domain";

export async function GET() {
  try {
    const { user } = await ensureSession();

    // Fetch user's letters, responses, saved letters, and notes in parallel
    const [letters, responses, savedLetters, notes] = await Promise.all([
      // 1. My Letters (authored by user, entryType: "LETTER")
      db.letter.findMany({
        where: {
          authorId: user.id,
          entryType: "LETTER",
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          recipientName: true,
          content: true,
          theme: true,
          visibility: true,
          entryType: true,
          isModerated: true,
          moderationReason: true,
          moderationStatus: true,
          tags: true,
          createdAt: true,
          updatedAt: true,
        },
      }),

      // 2. My Responses (authored by user, entryType: "RESPONSE")
      db.letter.findMany({
        where: {
          authorId: user.id,
          entryType: "RESPONSE",
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          content: true,
          parentLetterId: true,
          isModerated: true,
          moderationStatus: true,
          moderationReason: true,
          createdAt: true,
          parentLetter: {
            select: {
              id: true,
              title: true,
              recipientName: true,
              visibility: true,
              isModerated: true,
            },
          },
        },
      }),

      // 3. Saved Letters (saved by user)
      db.savedLetter.findMany({
        where: {
          userId: user.id,
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          letterId: true,
          privateNote: true,
          createdAt: true,
          updatedAt: true,
          letter: {
            select: {
              id: true,
              title: true,
              recipientName: true,
              content: true,
              theme: true,
              createdAt: true,
              visibility: true,
              isModerated: true,
            },
          },
        },
      }),

      // 4. Personal Notes (authored by user, entryType: "NOTE")
      db.letter.findMany({
        where: {
          authorId: user.id,
          entryType: "NOTE",
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          content: true,
          tags: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    // Format saved letters with isOrbitAccessible flag
    const formattedSavedLetters = savedLetters.map((s) => ({
      id: s.id,
      letterId: s.letterId,
      privateNote: s.privateNote,
      savedAt: s.createdAt,
      updatedAt: s.updatedAt,
      letter: {
        id: s.letter.id,
        title: s.letter.title,
        recipientName: s.letter.recipientName,
        content: s.letter.content,
        theme: s.letter.theme,
        createdAt: s.letter.createdAt,
        isOrbitAccessible: s.letter.visibility === "PUBLIC" && !s.letter.isModerated,
      },
    }));

    // Format responses safely
    const formattedResponses = responses.map((r) => ({
      id: r.id,
      content: r.content,
      parentLetterId: r.parentLetterId || "",
      isModerated: r.isModerated,
      moderationStatus: r.moderationStatus,
      moderationReason: r.moderationReason,
      createdAt: r.createdAt,
      parentLetter: r.parentLetter
        ? {
            id: r.parentLetter.id,
            title: r.parentLetter.title,
            recipientName: r.parentLetter.recipientName,
            visibility: r.parentLetter.visibility,
            isModerated: r.parentLetter.isModerated,
          }
        : null,
    }));

    const archiveData: ArchiveData = {
      identity: {
        unsentId: user.unsentId,
        accountType: user.accountType,
        createdAt: user.createdAt,
      },
      letters,
      responses: formattedResponses,
      savedLetters: formattedSavedLetters,
      notes,
      counts: {
        letters: letters.length,
        responses: formattedResponses.length,
        savedLetters: formattedSavedLetters.length,
        notes: notes.length,
      },
    };

    return NextResponse.json({
      success: true,
      data: archiveData,
    });
  } catch (error) {
    console.error("Fetch archive error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load archive",
        },
      },
      { status: 500 }
    );
  }
}
