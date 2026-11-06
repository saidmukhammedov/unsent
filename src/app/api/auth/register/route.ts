import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession, createSessionForUser } from "@/lib/auth/session";
import { generateUnsentId } from "@/lib/auth/identity";
import { generateRecoveryKey, hashSecret } from "@/lib/auth/crypto";
import { hashPassword } from "@/lib/auth/password";
import { normalizePhoneNumber } from "@/lib/validation/phone";
import { registerSchema } from "@/lib/validation/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

    // Rate limiting: 5 registration attempts per minute per IP
    const ipLimit = await checkRateLimit(`reg:ip:${clientIp}`, 5, 60_000);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: "Too many registration attempts. Please wait a moment before trying again.",
          },
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message || "Validation failed";
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: firstIssue,
            details: parsed.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhoneNumber(parsed.data.phone);
    if (!normalizedPhone) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_PHONE",
            message: "Please provide a valid phone number with country code.",
          },
        },
        { status: 400 }
      );
    }

    // Check collision: Does an account with this phone number already exist?
    const existingWithPhone = await db.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (existingWithPhone) {
      // Strictly reject with 409: Do not overwrite, do not merge, do not transfer content.
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PHONE_ALREADY_REGISTERED",
            message: "This phone number is already registered to an account. Please sign in instead.",
          },
        },
        { status: 409 }
      );
    }

    // Check current session: Is there an existing identity to convert in place?
    const currentSession = await getCurrentSession();
    const passwordHash = await hashPassword(parsed.data.password);

    let resultingUnsentId: string;
    let newRecoveryKeyCreated: string | undefined;

    if (currentSession) {
      // User has an active session
      if (currentSession.user.accountType === "REGISTERED") {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "ALREADY_REGISTERED",
              message: "Your account is already registered.",
            },
          },
          { status: 400 }
        );
      }

      // Convert anonymous identity in place:
      // - Preserve internal UUID
      // - Preserve UNSENT ID
      // - Preserve recoveryTokenId and recoveryKeyHash
      // - Preserve all letters, notes, responses, saved letters, reflection notes, and notifications
      // - Never mark phoneVerifiedAt as verified (null)
      const updatedUser = await db.user.update({
        where: { id: currentSession.user.id },
        data: {
          phone: normalizedPhone,
          passwordHash,
          accountType: "REGISTERED",
          phoneVerifiedAt: null, // explicitly unverified
        },
      });

      resultingUnsentId = updatedUser.unsentId;
    } else {
      // Brand new visitor registering directly
      const unsentId = generateUnsentId();
      const { recoveryKey, recoveryTokenId } = generateRecoveryKey();
      const recoveryKeyHash = await hashSecret(recoveryKey);

      const newUser = await db.user.create({
        data: {
          unsentId,
          accountType: "REGISTERED",
          recoveryTokenId,
          recoveryKeyHash,
          phone: normalizedPhone,
          passwordHash,
          phoneVerifiedAt: null,
        },
      });

      await createSessionForUser(newUser.id);

      resultingUnsentId = newUser.unsentId;
      newRecoveryKeyCreated = recoveryKey;
    }

    return NextResponse.json({
      success: true,
      data: {
        unsentId: resultingUnsentId,
        accountType: "REGISTERED",
        ...(newRecoveryKeyCreated ? { newRecoveryKey: newRecoveryKeyCreated } : {}),
      },
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PHONE_ALREADY_REGISTERED",
            message: "This phone number is already registered to an account. Please sign in instead.",
          },
        },
        { status: 409 }
      );
    }

    console.error("Registration error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Registration failed. Please try again.",
        },
      },
      { status: 500 }
    );
  }
}
