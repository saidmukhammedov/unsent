import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { markNotificationAsRead } from "@/lib/notifications/service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required to update notifications.",
          },
        },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const updated = await markNotificationAsRead(session.user.id, id);

    if (!updated) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Notification not found or access denied.",
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Notification marked as read.",
    });
  } catch (error) {
    console.error("Mark notification read error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to update notification",
        },
      },
      { status: 500 }
    );
  }
}
