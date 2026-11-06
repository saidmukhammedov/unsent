import { NextResponse } from "next/server";
import { ensureSession } from "@/lib/auth/session";

export async function GET() {
  try {
    const { user, newRecoveryKey } = await ensureSession();

    return NextResponse.json({
      success: true,
      data: {
        unsentId: user.unsentId,
        accountType: user.accountType,
        role: user.role,
        createdAt: user.createdAt,
        ...(newRecoveryKey ? { newRecoveryKey } : {}),
      },
    });
  } catch (error) {
    console.error("Auth me error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to establish anonymous session",
        },
      },
      { status: 500 }
    );
  }
}
