import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { letterUpdateSchema } from "@/lib/validation/letters";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await getCurrentSession();

    const letter = await db.letter.findUnique({
      where: { id },
      select: {
        id: true,
        authorId: true,
        title: true,
        recipientName: true,
        content: true,
        entryType: true,
        visibility: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!letter) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Letter not found" },
        },
        { status: 404 }
      );
    }

    // Access control:
    // If content is PRIVATE or a NOTE, it can only be viewed by its author.
    const isOwner = session && session.user.id === letter.authorId;
    if ((letter.visibility === "PRIVATE" || letter.entryType === "NOTE") && !isOwner) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Letter not found" },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: letter.id,
        title: letter.title,
        recipientName: letter.recipientName,
        content: letter.content,
        entryType: letter.entryType,
        visibility: letter.visibility,
        tags: letter.tags,
        createdAt: letter.createdAt,
        updatedAt: letter.updatedAt,
      },
    });
  } catch (error) {
    console.error("Get letter error:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch content" },
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await getCurrentSession();

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        { status: 401 }
      );
    }

    const existing = await db.letter.findUnique({
      where: { id },
      select: {
        id: true,
        authorId: true,
        visibility: true,
        entryType: true,
      },
    });

    if (!existing || existing.authorId !== session.user.id) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Letter not found" },
        },
        { status: 404 }
      );
    }

    // Immutability Rule: Published public letters cannot be edited
    if (existing.visibility === "PUBLIC") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "IMMUTABLE_CONTENT",
            message: "Published public letters cannot be edited once released into Orbit.",
          },
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = letterUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid update data",
            details: parsed.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const updated = await db.letter.update({
      where: { id },
      data: {
        title: parsed.data.title || null,
        content: parsed.data.content,
        tags: parsed.data.tags,
      },
      select: {
        id: true,
        title: true,
        recipientName: true,
        content: true,
        entryType: true,
        visibility: true,
        tags: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error("Update letter error:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to update content" },
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await getCurrentSession();

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        { status: 401 }
      );
    }

    const existing = await db.letter.findUnique({
      where: { id },
      select: {
        id: true,
        authorId: true,
        visibility: true,
      },
    });

    if (!existing || existing.authorId !== session.user.id) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Letter not found" },
        },
        { status: 404 }
      );
    }

    // Immutability Rule: Published public letters cannot be deleted by their authors
    if (existing.visibility === "PUBLIC") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "IMMUTABLE_CONTENT",
            message: "Published public letters cannot be deleted by their authors.",
          },
        },
        { status: 403 }
      );
    }

    await db.letter.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    console.error("Delete letter error:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to delete content" },
      },
      { status: 500 }
    );
  }
}
