import { NextRequest, NextResponse } from "next/server";
import { ensureSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user } = await ensureSession();

    // Look up saved letter by either SavedLetter.id OR letterId owned by user
    const existing = await db.savedLetter.findFirst({
      where: {
        userId: user.id,
        OR: [{ id }, { letterId: id }],
      },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Saved letter not found in your collection.",
          },
        },
        { status: 404 }
      );
    }

    await db.savedLetter.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({
      success: true,
      message: "Letter quietly removed from your saved collection.",
    });
  } catch (error) {
    console.error("Delete saved letter error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to remove saved letter.",
        },
      },
      { status: 500 }
    );
  }
}
