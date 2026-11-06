import { NextResponse } from "next/server";
import { invalidateOtherSessions } from "@/lib/auth/session";

export async function POST() {
  try {
    const result = await invalidateOtherSessions();

    return NextResponse.json({
      success: true,
      count: result.count,
      message: `${result.count} other session${result.count === 1 ? "" : "s"} invalidated. This device is now your only active session.`,
    });
  } catch (error) {
    console.error("Invalidate other sessions error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Active session required to manage devices.",
        },
      },
      { status: 401 }
    );
  }
}
