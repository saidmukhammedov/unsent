import { NextRequest, NextResponse } from "next/server";
import { ensureSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { reportCreateSchema } from "@/lib/validation/reports";
import { checkRateLimit } from "@/lib/rate-limit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user } = await ensureSession();

    // Verify target letter exists and is public
    const letter = await db.letter.findFirst({
      where: {
        id,
        visibility: "PUBLIC",
      },
      select: {
        id: true,
        isModerated: true,
        moderationStatus: true,
      },
    });

    if (!letter || letter.moderationStatus === "REMOVED") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "This letter does not exist or is not available.",
          },
        },
        { status: 404 }
      );
    }

    const body = await req.json();
    const parsed = reportCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid report reason or format.",
            details: parsed.error.format(),
          },
        },
        { status: 400 }
      );
    }

    // Rate limiting: 10 reports per minute per identity
    const rlCheck = await checkRateLimit(`report:user:${user.id}`, 10, 60_000);
    if (rlCheck.status === "service_unavailable") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Service temporarily unavailable. Please retry shortly.",
          },
        },
        { status: 503, headers: { "Retry-After": "5" } }
      );
    }
    if (!rlCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: "Too many reports submitted. Please wait before reporting another letter.",
          },
        },
        { status: 429 }
      );
    }

    // Rate-limiting / anti-spam: Check for existing pending report by this reporter for this letter
    const existingReport = await db.report.findFirst({
      where: {
        reporterId: user.id,
        letterId: id,
        status: "PENDING",
      },
    });

    if (existingReport) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "DUPLICATE_REPORT",
            message: "You have already submitted a report for this letter. Our stewards are reviewing it.",
          },
        },
        { status: 429 }
      );
    }

    // Create report record without modifying letter visibility automatically
    await db.report.create({
      data: {
        reporterId: user.id,
        letterId: id,
        reason: parsed.data.reason,
        details: parsed.data.details || null,
        status: "PENDING",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Thank you for looking after this sanctuary. Your report has been submitted quietly for review.",
    });
  } catch (error) {
    console.error("Submit report error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Unable to submit report. Please try again later.",
        },
      },
      { status: 500 }
    );
  }
}
