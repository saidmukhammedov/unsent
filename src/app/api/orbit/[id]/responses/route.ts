import { NextRequest, NextResponse } from "next/server";
import { ensureSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { responseCreateSchema } from "@/lib/validation/responses";
import { evaluateSafety } from "@/lib/safety/gate";
import { notifyAuthorOfResponse } from "@/lib/notifications/service";
import { checkRateLimit } from "@/lib/rate-limit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Verify parent letter is public and not moderated
    const parent = await db.letter.findFirst({
      where: {
        id,
        visibility: "PUBLIC",
        isModerated: false,
        entryType: "LETTER",
      },
      select: { id: true },
    });

    if (!parent) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Letter not found or is not available in Orbit.",
          },
        },
        { status: 404 }
      );
    }

    // Retrieve approved public responses only
    const responses = await db.letter.findMany({
      where: {
        parentLetterId: id,
        entryType: "RESPONSE",
        visibility: "PUBLIC",
        isModerated: false,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        parentLetterId: true,
        content: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: responses,
    });
  } catch (error) {
    console.error("Fetch responses error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load responses",
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user } = await ensureSession();

    // Verify parent letter exists, is public, is unmoderated, and is not itself a response
    const parent = await db.letter.findFirst({
      where: {
        id,
        visibility: "PUBLIC",
        isModerated: false,
        entryType: "LETTER",
      },
      select: {
        id: true,
        authorId: true,
        title: true,
        recipientName: true,
      },
    });

    if (!parent) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Cannot respond: Letter does not exist or is not public.",
          },
        },
        { status: 404 }
      );
    }

    const body = await req.json();
    const parsed = responseCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Response did not pass validation.",
            details: parsed.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const { content } = parsed.data;

    // Distributed Rate-Limiting: 10 responses per minute per identity
    const rlCheck = await checkRateLimit(`resp:user:${user.id}`, 10, 60_000);
    if (!rlCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: "Too many responses sent. Please take a quiet breath before responding again.",
          },
        },
        { status: 429 }
      );
    }

    // Rate-limiting / anti-spam: check for recent identical response by this user
    const recentDuplicate = await db.letter.findFirst({
      where: {
        authorId: user.id,
        parentLetterId: id,
        content,
        createdAt: {
          gte: new Date(Date.now() - 60 * 1000), // last 60 seconds
        },
      },
    });

    if (recentDuplicate) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "DUPLICATE_SUBMISSION",
            message: "You submitted this exact response recently. Please wait a moment.",
          },
        },
        { status: 429 }
      );
    }

    // Evaluate server-side Safety Gate
    const safetyResult = evaluateSafety(content);

    if (safetyResult.action === "BLOCK") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PROHIBITED_CONTENT",
            message:
              safetyResult.reason ||
              "Submission blocked: Response violates sanctuary safety guidelines.",
            details: safetyResult.detectedFlags,
          },
        },
        { status: 400 }
      );
    }

    const isHold = safetyResult.action === "HOLD";
    const isModerated = isHold;
    const moderationStatus = isHold ? "HELD" : "APPROVED";
    const moderationReason = isHold
      ? safetyResult.reason || "Flagged by automated safety check"
      : null;

    // Create standalone response
    const responseRecord = await db.letter.create({
      data: {
        authorId: user.id,
        parentLetterId: id,
        entryType: "RESPONSE",
        visibility: "PUBLIC",
        content,
        isModerated,
        moderationStatus,
        moderationReason,
      },
      select: {
        id: true,
        parentLetterId: true,
        content: true,
        createdAt: true,
      },
    });

    // Notify original author ONLY if approved and not self-response
    if (!isHold) {
      await notifyAuthorOfResponse({
        originalLetterId: id,
        responseId: responseRecord.id,
        responseContent: content,
        responderId: user.id,
      });
    }

    return NextResponse.json(
      {
        success: true,
        isHeld: isHold,
        message: isHold
          ? "Your response was saved, but is held for moderation review. It will appear once approved by a steward."
          : "Your response was quietly released into orbit.",
        data: isHold ? null : responseRecord,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create response error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to submit response",
        },
      },
      { status: 500 }
    );
  }
}
