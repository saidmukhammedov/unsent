import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { orbitQuerySchema } from "@/lib/validation/letters";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const rawQuery = {
      mode: searchParams.get("mode") || "latest",
      theme: searchParams.get("theme") || undefined,
      page: searchParams.get("page") || 1,
      limit: searchParams.get("limit") || 10,
    };

    const parsed = orbitQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid query parameters for Orbit feed.",
            details: parsed.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const { mode, theme, page, limit } = parsed.data;

    // Strict safety & public filter:
    // Only letters marked PUBLIC, not moderated/held, and of type LETTER can be in Orbit
    const where: Prisma.LetterWhereInput = {
      visibility: "PUBLIC",
      isModerated: false,
      entryType: "LETTER",
    };

    if (theme) {
      where.theme = theme;
    }

    const session = await getCurrentSession();
    const userId = session?.user.id;

    const total = await db.letter.count({ where });

    let letters;
    if (mode === "discover") {
      // In discover mode: present a curated anthology.
      // If total > limit, use a pseudorandomized offset to surface diverse letters
      const maxOffset = Math.max(0, total - limit);
      const randomOffset = maxOffset > 0 ? Math.floor(Math.random() * (maxOffset + 1)) : 0;

      letters = await db.letter.findMany({
        where,
        skip: randomOffset,
        take: limit,
        select: {
          id: true,
          title: true,
          recipientName: true,
          content: true,
          theme: true,
          createdAt: true,
        },
      });
    } else {
      // In latest mode: strictly chronological order
      letters = await db.letter.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          recipientName: true,
          content: true,
          theme: true,
          createdAt: true,
        },
      });
    }

    // Check saved status for the active user identity without leaking internal IDs
    let savedLetterIds = new Set<string>();
    if (userId && letters.length > 0) {
      const saved = await db.savedLetter.findMany({
        where: {
          userId,
          letterId: { in: letters.map((l) => l.id) },
        },
        select: { letterId: true },
      });
      savedLetterIds = new Set(saved.map((s) => s.letterId));
    }

    const items = letters.map((letter) => ({
      ...letter,
      isSaved: savedLetterIds.has(letter.id),
    }));

    const totalPages = Math.ceil(total / limit) || 1;

    return NextResponse.json({
      success: true,
      data: {
        items,
        total,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages,
        mode,
        theme: theme || null,
      },
    });
  } catch (error) {
    console.error("Orbit feed error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to retrieve Orbit letters",
        },
      },
      { status: 500 }
    );
  }
}
