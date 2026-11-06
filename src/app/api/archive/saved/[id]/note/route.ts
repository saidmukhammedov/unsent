import { NextRequest, NextResponse } from "next/server";
import { ensureSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { savedLetterNoteSchema } from "@/lib/validation/archive";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user } = await ensureSession();

    const body = await req.json();
    const parsed = savedLetterNoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid reflection note data.",
            details: parsed.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const { privateNote } = parsed.data;

    // Look up saved letter by either SavedLetter.id OR letterId
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

    const updated = await db.savedLetter.update({
      where: { id: existing.id },
      data: {
        privateNote,
      },
      select: {
        id: true,
        letterId: true,
        privateNote: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: privateNote
        ? "Private reflection saved."
        : "Private reflection removed.",
    });
  } catch (error) {
    console.error("Update saved letter note error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to update reflection note.",
        },
      },
      { status: 500 }
    );
  }
}
