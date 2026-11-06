import { NextResponse } from "next/server";
import { terminateCurrentSession } from "@/lib/auth/session";

export async function POST() {
  try {
    await terminateCurrentSession();

    return NextResponse.json({
      success: true,
      message: "Session quietly ended. You have stepped out of your sanctuary.",
    });
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to end session.",
        },
      },
      { status: 500 }
    );
  }
}
