import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { markAllNotificationsAsRead } from "@/lib/notifications/service";

export async function POST() {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required.",
          },
        },
        { status: 401 }
      );
    }

    const count = await markAllNotificationsAsRead(session.user.id);

    return NextResponse.json({
      success: true,
      count,
      message: `${count} notifications marked as read.`,
    });
  } catch (error) {
    console.error("Mark all notifications read error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to update notifications",
        },
      },
      { status: 500 }
    );
  }
}
