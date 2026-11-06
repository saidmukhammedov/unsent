import { NextRequest, NextResponse } from "next/server";
import { restoreSessionWithRecoveryKey } from "@/lib/auth/session";
import { recoveryKeySchema } from "@/lib/validation/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

    // Rate limiting: 5 recovery attempts per minute per IP
    const ipLimit = await checkRateLimit(`recover:ip:${clientIp}`, 5, 60_000);
    if (ipLimit.status === "service_unavailable") {
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
    if (!ipLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: "Too many recovery attempts. Please wait a moment before trying again.",
          },
        },
        { status: 429 }
      );
    }

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
