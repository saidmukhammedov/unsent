import { NextRequest, NextResponse } from "next/server";
import { verifyModerator } from "@/lib/auth/moderator";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyModerator();
    if (!auth.authorized) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: auth.statusCode === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
            message: auth.error || "Moderator privileges required.",
          },
        },
        { status: auth.statusCode || 403 }
      );
    }

    const { searchParams } = req.nextUrl;
    const filter = searchParams.get("filter") || "held";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));

    const where: Prisma.LetterWhereInput = {};

    if (filter === "held") {
      // Submissions held by the automated safety gate awaiting human review
      where.isModerated = true;
      where.moderationStatus = "HELD";
    } else if (filter === "reported") {
      // Letters with pending user reports
      where.reports = {
        some: { status: "PENDING" },
      };
    } else if (filter === "removed") {
      // Letters removed by moderators
      where.moderationStatus = "REMOVED";
    } else if (filter === "approved") {
      where.moderationStatus = "APPROVED";
    }

    const total = await db.letter.count({ where });

    const letters = await db.letter.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        title: true,
        recipientName: true,
        content: true,
        theme: true,
        visibility: true,
        entryType: true,
        isModerated: true,
        moderationReason: true,
        moderationStatus: true,
        createdAt: true,
        reports: {
          select: {
            id: true,
            reason: true,
            details: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: { reports: true },
        },
      },
    });

    const items = letters.map((l) => ({
      id: l.id,
      title: l.title,
      recipientName: l.recipientName,
      content: l.content,
      theme: l.theme,
      visibility: l.visibility,
      entryType: l.entryType,
      isModerated: l.isModerated,
      moderationReason: l.moderationReason,
      moderationStatus: l.moderationStatus,
      createdAt: l.createdAt,
      reportsCount: l._count.reports,
      reports: l.reports,
    }));

    return NextResponse.json({
      success: true,
      data: {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        filter,
      },
    });
  } catch (error) {
    console.error("Moderation letters list error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to retrieve moderation queue",
        },
      },
      { status: 500 }
    );
  }
}
