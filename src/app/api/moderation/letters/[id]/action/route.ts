import { NextRequest, NextResponse } from "next/server";
import { verifyModerator } from "@/lib/auth/moderator";
import { db } from "@/lib/db";
import { moderationActionSchema } from "@/lib/validation/reports";
import { notifyAuthorOfResponse } from "@/lib/notifications/service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const auth = await verifyModerator();
    if (!auth.authorized) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: auth.statusCode === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
            message: auth.error || "Moderator privileges required.",
          },
        },
        { status: auth.statusCode || 403 }
      );
    }

    const { id } = await context.params;
    const body = await req.json();

    const parsed = moderationActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid moderation action or reason.",
            details: parsed.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const { action, reason, notes } = parsed.data;

    // Check letter existence
    const letter = await db.letter.findUnique({
      where: { id },
      select: {
        id: true,
        authorId: true,
        content: true,
        entryType: true,
        parentLetterId: true,
        visibility: true,
        isModerated: true,
        moderationStatus: true,
      },
    });

    if (!letter) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Letter not found.",
          },
        },
        { status: 404 }
      );
    }

    const moderatorUserId = auth.user?.id !== "00000000-0000-0000-0000-000000000000" ? auth.user?.id : null;

    // Execute atomic moderation workflow
    await db.$transaction(async (tx) => {
      if (action === "APPROVE") {
        // Approves a held submission to become publicly visible in Orbit
        await tx.letter.update({
          where: { id },
          data: {
            isModerated: false,
            moderationStatus: "APPROVED",
            moderatedAt: new Date(),
            moderatorId: moderatorUserId,
          },
        });

        // Resolve any pending reports as reviewed
        await tx.report.updateMany({
          where: { letterId: id, status: "PENDING" },
          data: { status: "REVIEWED" },
        });
      } else if (action === "REJECT") {
        // Rejects a held submission; stays out of Orbit permanently
        await tx.letter.update({
          where: { id },
          data: {
            isModerated: true,
            moderationStatus: "REJECTED",
            moderatedAt: new Date(),
            moderatorId: moderatorUserId,
          },
        });

        await tx.report.updateMany({
          where: { letterId: id, status: "PENDING" },
          data: { status: "REVIEWED" },
        });
      } else if (action === "REMOVE") {
        // Removes an already published letter from Orbit
        await tx.letter.update({
          where: { id },
          data: {
            isModerated: true,
            moderationStatus: "REMOVED",
            moderatedAt: new Date(),
            moderatorId: moderatorUserId,
          },
        });

        await tx.report.updateMany({
          where: { letterId: id, status: "PENDING" },
          data: { status: "REMOVED" },
        });
      } else if (action === "DISMISS_REPORTS") {
        // Dismisses pending reports, keeping letter in its current state
        await tx.report.updateMany({
          where: { letterId: id, status: "PENDING" },
          data: { status: "DISMISSED" },
        });
      }

      // Record immutable audit log
      await tx.moderationLog.create({
        data: {
          letterId: id,
          moderatorId: moderatorUserId,
          action,
          reason,
          notes: notes || null,
        },
      });
    });

    // If an approved item is a response, notify the parent letter author
    if (action === "APPROVE" && letter.entryType === "RESPONSE" && letter.parentLetterId) {
      await notifyAuthorOfResponse({
        originalLetterId: letter.parentLetterId,
        responseId: letter.id,
        responseContent: letter.content,
        responderId: letter.authorId || "",
      });
    }

    return NextResponse.json({
      success: true,
      message: `Moderation action '${action}' completed successfully.`,
      data: {
        letterId: id,
        action,
        reason,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Moderation action error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to execute moderation action.",
        },
      },
      { status: 500 }
    );
  }
}
