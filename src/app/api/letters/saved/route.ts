import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getCurrentSession();

    if (!session) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    const savedRecords = await db.savedLetter.findMany({
      where: {
        userId: session.user.id,
        letter: {
          visibility: "PUBLIC",
          isModerated: false,
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        privateNote: true,
        createdAt: true,
        letter: {
          select: {
            id: true,
            title: true,
            recipientName: true,
            content: true,
            theme: true,
            createdAt: true,
          },
        },
      },
    });

    const items = savedRecords.map((record) => ({
      savedId: record.id,
      savedAt: record.createdAt,
      privateNote: record.privateNote,
      letter: {
        ...record.letter,
        isSaved: true,
      },
    }));

    return NextResponse.json({
      success: true,
      data: items,
    });
  } catch (error) {
    console.error("Fetch saved letters error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load saved letters",
        },
      },
      { status: 500 }
    );
  }
}
