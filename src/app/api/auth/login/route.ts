import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSessionForUser } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { normalizePhoneNumber } from "@/lib/validation/phone";
import { loginSchema } from "@/lib/validation/auth";
import { checkRateLimit } from "@/lib/rate-limit";

// Dummy hash to burn CPU cycles and prevent user enumeration timing attacks
const DUMMY_ARGON2_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$dGVzdHNhbHRmb3J0aW1pbmc$8Zk2O5H9U57i936V5Jc5+H0xU4l2sX7yY5yP+K1j6cE";

export async function POST(req: NextRequest) {
  try {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

    // Rate limiting: 5 attempts per 60 seconds per IP
    const ipLimit = checkRateLimit(`login:ip:${clientIp}`, 5, 60_000);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: "Too many login attempts. Please wait a moment before trying again.",
          },
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid phone number or password.",
          },
        },
        { status: 401 }
      );
    }

    const normalizedPhone = normalizePhoneNumber(parsed.data.phone);
    if (!normalizedPhone) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid phone number or password.",
          },
        },
        { status: 401 }
      );
    }

    // Rate limiting per phone number: 5 attempts per 60 seconds
    const phoneLimit = checkRateLimit(`login:phone:${normalizedPhone}`, 5, 60_000);
    if (!phoneLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: "Too many login attempts for this account. Please wait before trying again.",
          },
        },
        { status: 429 }
      );
    }

    const user = await db.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (!user || !user.passwordHash) {
      // Execute dummy verification to prevent timing attacks / user enumeration
      await verifyPassword(parsed.data.password, DUMMY_ARGON2_HASH);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid phone number or password.",
          },
        },
        { status: 401 }
      );
    }

    const isValidPassword = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid phone number or password.",
          },
        },
        { status: 401 }
      );
    }

    // Create session cookie for the authenticated user
    await createSessionForUser(user.id);

    return NextResponse.json({
      success: true,
      data: {
        unsentId: user.unsentId,
        accountType: user.accountType,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Sign in failed. Please try again.",
        },
      },
      { status: 500 }
    );
  }
}
