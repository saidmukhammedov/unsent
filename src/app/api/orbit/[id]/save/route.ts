import { NextRequest, NextResponse } from "next/server";
import { ensureSession, getCurrentSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user } = await ensureSession();

    // Verify target letter is a valid, publicly visible letter
    const letter = await db.letter.findFirst({
      where: {
        id,
        visibility: "PUBLIC",
        isModerated: false,
        entryType: "LETTER",
      },
      select: { id: true },
    });

    if (!letter) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Cannot save letter: Letter does not exist or is not public.",
          },
        },
        { status: 404 }
      );
    }

    // Idempotent upsert to prevent duplicate save errors
    await db.savedLetter.upsert({
      where: {
        userId_letterId: {
          userId: user.id,
          letterId: letter.id,
        },
      },
      create: {
        userId: user.id,
        letterId: letter.id,
      },
      update: {},
    });

    return NextResponse.json({
      success: true,
      isSaved: true,
      message: "Letter quietly saved to your personal collection.",
    });
  } catch (error) {
    console.error("Save letter error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to save letter",
        },
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await getCurrentSession();

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Active session required to manage saved letters.",
          },
        },
        { status: 401 }
      );
    }

    await db.savedLetter.deleteMany({
      where: {
        userId: session.user.id,
        letterId: id,
      },
    });

    return NextResponse.json({
      success: true,
      isSaved: false,
      message: "Letter removed from your saved collection.",
    });
  } catch (error) {
    console.error("Unsave letter error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to remove saved letter",
        },
      },
      { status: 500 }
    );
  }
}
