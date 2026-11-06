import { NextRequest, NextResponse } from "next/server";
import { ensureSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { letterCreateSchema } from "@/lib/validation/letters";
import { evaluateSafety } from "@/lib/safety/gate";

export async function GET(req: NextRequest) {
  try {
    const { user } = await ensureSession();
    const searchParams = req.nextUrl.searchParams;
    const entryTypeParam = searchParams.get("entryType");
    const visibilityParam = searchParams.get("visibility");

    const whereClause: {
      authorId: string;
      entryType?: "LETTER" | "NOTE";
      visibility?: "PRIVATE" | "PUBLIC";
    } = {
      authorId: user.id,
    };

    if (entryTypeParam === "LETTER" || entryTypeParam === "NOTE") {
      whereClause.entryType = entryTypeParam;
    }

    if (visibilityParam === "PRIVATE" || visibilityParam === "PUBLIC") {
      whereClause.visibility = visibilityParam;
    }

    const items = await db.letter.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        recipientName: true,
        content: true,
        theme: true,
        entryType: true,
        visibility: true,
        isModerated: true,
        moderationReason: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: items,
    });
  } catch (error) {
    console.error("List letters error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load content",
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await ensureSession();
    const body = await req.json();

    const parsed = letterCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Submitted content did not pass validation.",
            details: parsed.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const { title, recipientName, content, visibility, entryType, theme, tags, parentLetterId } =
      parsed.data;

    // Enforce business rules:
    // 1. Personal notes are strictly PRIVATE
    const effectiveVisibility = entryType === "NOTE" ? "PRIVATE" : visibility;

    let isModerated = false;
    let moderationReason: string | null = null;
    let statusMessage: string | null = null;

    // 2. Public Publishing Safety Gate
    if (effectiveVisibility === "PUBLIC") {
      const safetyResult = evaluateSafety(content, recipientName, title);

      if (safetyResult.action === "BLOCK") {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "PROHIBITED_CONTENT",
              message:
                safetyResult.reason ||
                "Submission blocked: Content violates sanctuary safety guidelines.",
              details: safetyResult.detectedFlags,
            },
          },
          { status: 400 }
        );
      }

      if (safetyResult.action === "HOLD") {
        isModerated = true;
        moderationReason = safetyResult.reason || "Held for review due to potential identifying info.";
        statusMessage =
          "Your letter was saved, but is held for moderation review because it may contain contact information or identifying details. It will remain private and will not appear in Orbit until reviewed.";
      }
    }

    const letter = await db.letter.create({
      data: {
        authorId: user.id,
        title: title || null,
        recipientName: entryType === "NOTE" ? null : recipientName || null,
        content,
        theme: theme || null,
        visibility: effectiveVisibility,
        entryType,
        tags,
        isModerated,
        moderationReason,
        parentLetterId: parentLetterId || null,
      },
      select: {
        id: true,
        title: true,
        recipientName: true,
        content: true,
        theme: true,
        visibility: true,
        entryType: true,
        isModerated: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: letter,
        ...(statusMessage ? { message: statusMessage } : {}),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create letter error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to save content",
        },
      },
      { status: 500 }
    );
  }
}
