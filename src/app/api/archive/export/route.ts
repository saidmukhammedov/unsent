import { NextRequest, NextResponse } from "next/server";
import { ensureSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ArchiveExportData } from "@/types/domain";

function getLetterStatus(visibility: string, isModerated: boolean, moderationStatus: string | null): string {
  if (visibility === "PRIVATE") return "Private Sanctuary";
  if (moderationStatus === "HELD" || (isModerated && moderationStatus !== "REMOVED" && moderationStatus !== "REJECTED")) {
    return "Awaiting Moderation";
  }
  if (moderationStatus === "REJECTED") return "Rejected by Moderation";
  if (moderationStatus === "REMOVED") return "Removed from Orbit";
  return "In Orbit (Published)";
}

function getResponseStatus(isModerated: boolean, moderationStatus: string | null): string {
  if (moderationStatus === "HELD" || (isModerated && moderationStatus !== "REMOVED" && moderationStatus !== "REJECTED")) {
    return "Awaiting Moderation";
  }
  if (moderationStatus === "REJECTED") return "Rejected by Moderation";
  if (moderationStatus === "REMOVED") return "Removed from Orbit";
  return "Published (In Orbit)";
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await ensureSession();

    // Sensitive operation rate limiting
    const rateCheck = await checkRateLimit(`export:${user.id}`, 10, 60_000);
    if (rateCheck.status === "service_unavailable") {
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
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: "Too many export requests. Please wait a moment before downloading again.",
          },
        },
        { status: 429 }
      );
    }

    const { searchParams } = req.nextUrl;
    const format = searchParams.get("format") === "json" ? "json" : "markdown";

    // Retrieve strictly verified user's content in parallel
    const [letters, responses, savedLetters, notes] = await Promise.all([
      db.letter.findMany({
        where: {
          authorId: user.id,
          entryType: "LETTER",
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          recipientName: true,
          content: true,
          theme: true,
          visibility: true,
          isModerated: true,
          moderationStatus: true,
          tags: true,
          createdAt: true,
          updatedAt: true,
        },
      }),

      db.letter.findMany({
        where: {
          authorId: user.id,
          entryType: "RESPONSE",
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          content: true,
          parentLetterId: true,
          isModerated: true,
          moderationStatus: true,
          createdAt: true,
          parentLetter: {
            select: {
              id: true,
              title: true,
              recipientName: true,
            },
          },
        },
      }),

      db.savedLetter.findMany({
        where: {
          userId: user.id,
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
      }),

      db.letter.findMany({
        where: {
          authorId: user.id,
          entryType: "NOTE",
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          content: true,
          tags: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const exportData: ArchiveExportData = {
      exportedAt: new Date().toISOString(),
      identity: {
        unsentId: user.unsentId,
        accountType: user.accountType,
        memberSince: user.createdAt.toISOString(),
      },
      myLetters: letters.map((l) => ({
        id: l.id,
        title: l.title,
        recipient: l.recipientName,
        content: l.content,
        theme: l.theme,
        tags: l.tags,
        visibility: l.visibility,
        status: getLetterStatus(l.visibility, l.isModerated, l.moderationStatus),
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString(),
      })),
      myResponses: responses.map((r) => ({
        id: r.id,
        parentLetterId: r.parentLetterId || "",
        parentLetterTitle: r.parentLetter?.title || null,
        parentLetterRecipient: r.parentLetter?.recipientName || null,
        content: r.content,
        status: getResponseStatus(r.isModerated, r.moderationStatus),
        createdAt: r.createdAt.toISOString(),
      })),
      myPersonalNotes: notes.map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content,
        tags: n.tags,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
      })),
      savedLetters: savedLetters.map((s) => ({
        savedAt: s.createdAt.toISOString(),
        privateReflectionNote: s.privateNote,
        originalLetter: {
          id: s.letter.id,
          title: s.letter.title,
          recipient: s.letter.recipientName,
          content: s.letter.content,
          theme: s.letter.theme,
          publishedAt: s.letter.createdAt.toISOString(),
        },
      })),
    };

    const dateSlug = new Date().toISOString().split("T")[0];

    if (format === "json") {
      const jsonContent = JSON.stringify(exportData, null, 2);
      return new NextResponse(jsonContent, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="unsent-archive-${user.unsentId}-${dateSlug}.json"`,
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    // Generate Markdown export
    const mdLines: string[] = [];
    mdLines.push(`# UNSENT — Personal Archive`);
    mdLines.push(``);
    mdLines.push(`**Identity**: \`${user.unsentId}\`  `);
    mdLines.push(`**Account Type**: ${user.accountType}  `);
    mdLines.push(`**Export Date**: ${exportData.exportedAt}  `);
    mdLines.push(`**Total Records**: ${letters.length} letters, ${responses.length} responses, ${notes.length} personal notes, ${savedLetters.length} saved letters  `);
    mdLines.push(``);
    mdLines.push(`> UNSENT is an anonymous sanctuary. This export contains your personal writings and reflections. Keep this file safe.`);
    mdLines.push(``);
    mdLines.push(`---`);
    mdLines.push(``);

    // Section 1: My Letters
    mdLines.push(`## 1. My Authored Letters (${letters.length})`);
    mdLines.push(``);
    if (letters.length === 0) {
      mdLines.push(`*No letters written yet.*`);
      mdLines.push(``);
    } else {
      letters.forEach((letter, idx) => {
        const title = letter.title ? `“${letter.title}”` : `Letter #${idx + 1}`;
        const recipient = letter.recipientName ? `To: ${letter.recipientName}` : `To: Unknown`;
        const status = getLetterStatus(letter.visibility, letter.isModerated, letter.moderationStatus);

        mdLines.push(`### ${idx + 1}. ${title} (${recipient})`);
        mdLines.push(`- **Status**: ${status}`);
        mdLines.push(`- **Visibility**: ${letter.visibility}`);
        if (letter.theme) mdLines.push(`- **Theme**: ${letter.theme}`);
        if (letter.tags.length > 0) mdLines.push(`- **Tags**: ${letter.tags.join(", ")}`);
        mdLines.push(`- **Date**: ${letter.createdAt.toISOString()}`);
        mdLines.push(``);
        mdLines.push(`\`\`\``);
        mdLines.push(letter.content);
        mdLines.push(`\`\`\``);
        mdLines.push(``);
      });
    }
    mdLines.push(`---`);
    mdLines.push(``);

    // Section 2: My Standalone Responses
    mdLines.push(`## 2. My Standalone Responses (${responses.length})`);
    mdLines.push(``);
    if (responses.length === 0) {
      mdLines.push(`*No responses sent yet.*`);
      mdLines.push(``);
    } else {
      responses.forEach((resp, idx) => {
        const targetTitle = resp.parentLetter?.title ? `“${resp.parentLetter.title}”` : "Orbit Letter";
        const targetRecipient = resp.parentLetter?.recipientName ? `for ${resp.parentLetter.recipientName}` : "";
        const status = getResponseStatus(resp.isModerated, resp.moderationStatus);

        mdLines.push(`### Response #${idx + 1} (to ${targetTitle} ${targetRecipient})`);
        mdLines.push(`- **Status**: ${status}`);
        mdLines.push(`- **Date**: ${resp.createdAt.toISOString()}`);
        mdLines.push(``);
        mdLines.push(`> ${resp.content.replace(/\n/g, "\n> ")}`);
        mdLines.push(``);
      });
    }
    mdLines.push(`---`);
    mdLines.push(``);

    // Section 3: Personal Notes
    mdLines.push(`## 3. My Personal Notes (${notes.length})`);
    mdLines.push(``);
    if (notes.length === 0) {
      mdLines.push(`*No personal notes written yet.*`);
      mdLines.push(``);
    } else {
      notes.forEach((note, idx) => {
        const title = note.title ? `“${note.title}”` : `Note #${idx + 1}`;
        mdLines.push(`### ${title}`);
        mdLines.push(`- **Date**: ${note.createdAt.toISOString()}`);
        if (note.tags.length > 0) mdLines.push(`- **Tags**: ${note.tags.join(", ")}`);
        mdLines.push(``);
        mdLines.push(note.content);
        mdLines.push(``);
      });
    }
    mdLines.push(`---`);
    mdLines.push(``);

    // Section 4: Saved Letters & Reflections
    mdLines.push(`## 4. Saved Orbit Letters & Personal Reflections (${savedLetters.length})`);
    mdLines.push(``);
    mdLines.push(`> *Notice: The letters below are public letters written by other anonymous authors that you have saved to your personal sanctuary. Your private reflections attached to them remain strictly confidential.*`);
    mdLines.push(``);
    if (savedLetters.length === 0) {
      mdLines.push(`*No saved letters in your collection.*`);
      mdLines.push(``);
    } else {
      savedLetters.forEach((saved, idx) => {
        const title = saved.letter.title ? `“${saved.letter.title}”` : `Letter #${idx + 1}`;
        const recipient = saved.letter.recipientName ? `To: ${saved.letter.recipientName}` : `To: Someone`;

        mdLines.push(`### Saved Letter #${idx + 1}: ${title} (${recipient})`);
        mdLines.push(`- **Original Publication Date**: ${saved.letter.createdAt.toISOString()}`);
        mdLines.push(`- **Saved on**: ${saved.createdAt.toISOString()}`);
        if (saved.letter.theme) mdLines.push(`- **Theme**: ${saved.letter.theme}`);
        mdLines.push(``);
        mdLines.push(`\`\`\``);
        mdLines.push(saved.letter.content);
        mdLines.push(`\`\`\``);
        mdLines.push(``);
        if (saved.privateNote) {
          mdLines.push(`**Your Private Reflection Note**:`);
          mdLines.push(`> ${saved.privateNote.replace(/\n/g, "\n> ")}`);
        } else {
          mdLines.push(`*No private reflection recorded for this letter.*`);
        }
        mdLines.push(``);
      });
    }

    const markdownContent = mdLines.join("\n");
    return new NextResponse(markdownContent, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="unsent-archive-${user.unsentId}-${dateSlug}.md"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Archive export error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to generate archive export",
        },
      },
      { status: 500 }
    );
  }
}
