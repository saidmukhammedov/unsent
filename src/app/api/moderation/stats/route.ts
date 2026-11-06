import { NextResponse } from "next/server";
import { verifyModerator } from "@/lib/auth/moderator";
import { db } from "@/lib/db";

export async function GET() {
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

    const [heldCount, pendingReportsCount, approvedCount, removedCount] = await Promise.all([
      db.letter.count({ where: { isModerated: true, moderationStatus: "HELD" } }),
      db.report.count({ where: { status: "PENDING" } }),
      db.letter.count({ where: { moderationStatus: "APPROVED" } }),
      db.letter.count({ where: { moderationStatus: "REMOVED" } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        held: heldCount,
        pendingReports: pendingReportsCount,
        approved: approvedCount,
        removed: removedCount,
      },
    });
  } catch (error) {
    console.error("Moderation stats error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch moderation statistics",
        },
      },
      { status: 500 }
    );
  }
}
