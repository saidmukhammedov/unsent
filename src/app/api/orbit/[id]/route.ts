import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await getCurrentSession();

    const letter = await db.letter.findFirst({
      where: {
        id,
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

    if (!letter) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "This letter is not available in Orbit.",
          },
        },
        { status: 404 }
      );
    }

    let isSaved = false;
    if (session?.user.id) {
      const savedRecord = await db.savedLetter.findUnique({
        where: {
          userId_letterId: {
            userId: session.user.id,
            letterId: letter.id,
          },
        },
      });
      isSaved = !!savedRecord;
    }

    return NextResponse.json({
      success: true,
      data: {
        ...letter,
        isSaved,
      },
    });
  } catch (error) {
    console.error("Get orbit letter error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load letter",
        },
      },
      { status: 500 }
    );
  }
}
