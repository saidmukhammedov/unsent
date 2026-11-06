import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, deleteAccountAndData } from "@/lib/auth/session";
import { deleteAccountSchema } from "@/lib/validation/settings";

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Active session required to perform account deletion.",
          },
        },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = deleteAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CONFIRMATION_REQUIRED",
            message: 'You must type "ERASE MY SANCTUARY" exactly to confirm permanent deletion.',
            details: parsed.error.format(),
          },
        },
        { status: 400 }
      );
    }

    await deleteAccountAndData(session.user.id);

    return NextResponse.json({
      success: true,
      message: "Your sanctuary, private letters, personal notes, reflections, and identity records have been permanently erased.",
    });
  } catch (error) {
    console.error("Account deletion error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to delete account. Please try again.",
        },
      },
      { status: 500 }
    );
  }
}
