import { NextResponse } from "next/server";
import { getActiveSessions } from "@/lib/auth/session";

export async function GET() {
  try {
    const stats = await getActiveSessions();

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Fetch sessions error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Active session required to view session security.",
        },
      },
      { status: 401 }
    );
  }
}
