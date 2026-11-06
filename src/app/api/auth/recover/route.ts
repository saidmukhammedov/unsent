import { NextRequest, NextResponse } from "next/server";
import { restoreSessionWithRecoveryKey } from "@/lib/auth/session";
import { recoveryKeySchema } from "@/lib/validation/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = recoveryKeySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Recovery key format is invalid. Expected format: REC-XXXXXXXX-...",
            details: parsed.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const result = await restoreSessionWithRecoveryKey(parsed.data.recoveryKey);

    if (!result.success || !result.user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: result.error || "Invalid recovery credential",
          },
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        unsentId: result.user.unsentId,
        accountType: result.user.accountType,
      },
    });
  } catch (error) {
    console.error("Recovery error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Account recovery failed. Please try again.",
        },
      },
      { status: 500 }
    );
  }
}
