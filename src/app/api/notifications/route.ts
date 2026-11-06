import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { getUserNotifications, getUnreadNotificationCount } from "@/lib/notifications/service";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({
        success: true,
        data: {
          items: [],
          unreadCount: 0,
        },
      });
    }

    const [items, unreadCount] = await Promise.all([
      getUserNotifications(session.user.id, 30),
      getUnreadNotificationCount(session.user.id),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items,
        unreadCount,
      },
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load notifications",
        },
      },
      { status: 500 }
    );
  }
}
