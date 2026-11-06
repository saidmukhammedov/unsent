import Link from "next/link";
import { Header } from "@/components/ui/Header";
import { Footer } from "@/components/ui/Footer";
import { SaveButton } from "@/components/ui/SaveButton";
import { getCurrentSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OrbitLetterPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getCurrentSession();

  // Query letter strictly by public & unmoderated criteria
  const letter = await db.letter.findFirst({
    where: {
      id,
      visibility: "PUBLIC",
      isModerated: false,
      entryType: "LETTER",
    },
    select: {
      id: true,
      title: true,
      recipientName: true,
      content: true,
      theme: true,
      createdAt: true,
    },
  });

  if (!letter) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FBF9F5] paper-grain">
        <Header />
        <main className="flex-1 max-w-xl mx-auto px-6 py-24 text-center flex flex-col items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-[#F5F2EB] border border-[#E8E2D7] flex items-center justify-center mb-5 text-[#878077]">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
              />
            </svg>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl text-[#23201D] font-normal mb-3">
            This letter is not in Orbit
          </h1>
          <p className="text-sm text-[#57524C] leading-relaxed max-w-sm mb-8">
            The letter you are looking for may have returned to silence, remains held for
            review, or was never released into Orbit.
          </p>
          <Link
            href="/orbit"
            className="inline-flex items-center gap-1.5 text-xs font-serif italic text-[#C27D77] hover:underline underline-offset-4"
          >
            <span>← Return to Orbit archive</span>
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  // Check if saved by active identity
  let isSaved = false;
  if (session?.user.id) {
    const savedRecord = await db.savedLetter.findUnique({
      where: {
        userId_letterId: {
          userId: session.user.id,
          letterId: letter.id,
        },
      },
    });
    isSaved = !!savedRecord;
  }

  const formattedDate = new Date(letter.createdAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] paper-grain">
      <Header />

      <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-12 sm:py-16">
        {/* Navigation Breadcrumb */}
        <div className="mb-8">
          <Link
            href="/orbit"
            className="inline-flex items-center gap-1.5 text-xs font-serif italic text-[#57524C] hover:text-[#23201D] transition-colors"
          >
            <span>←</span>
            <span>Return to Orbit</span>
          </Link>
        </div>

        {/* Letter Reading Sheet */}
        <article className="bg-[#FBF9F5] border border-[#E8E2D7] p-8 sm:p-12 rounded-sm shadow-[0_4px_30px_rgba(35,32,29,0.03)] relative">
          {/* Header Metadata */}
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 pb-6 border-b border-[#E8E2D7]/60 mb-8">
            <div>
              <span className="font-serif italic text-xl sm:text-2xl text-[#23201D] block">
                {letter.recipientName ? `To: ${letter.recipientName}` : "To: Someone"}
              </span>
              <span className="font-handwriting text-xs sm:text-sm text-[#878077] tracking-wide block mt-1">
                Released on {formattedDate}
              </span>
            </div>

            <div className="flex items-center gap-3 self-start sm:self-auto">
              {letter.theme && (
                <span className="inline-block px-3 py-1 rounded-full bg-[#F5F2EB] text-[#57524C] border border-[#E8E2D7] text-xs tracking-wide">
                  {letter.theme}
                </span>
              )}
            </div>
          </div>

          {/* Optional Title */}
          {letter.title && (
            <h1 className="font-serif text-2xl sm:text-3xl text-[#23201D] font-medium tracking-tight mb-6">
              {letter.title}
            </h1>
          )}

          {/* Letter Body */}
          <div className="font-serif text-[1.125rem] sm:text-[1.2rem] leading-[1.85] text-[#23201D]/90 whitespace-pre-wrap font-normal selection:bg-[#EEDCDA]">
            {letter.content}
          </div>

          {/* Action Footer */}
          <div className="mt-12 pt-6 border-t border-[#E8E2D7]/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <SaveButton
              letterId={letter.id}
              initialSaved={isSaved}
              variant="full"
            />

            <Link
              href="/compose"
              className="font-serif italic text-xs text-[#878077] hover:text-[#C27D77] transition-colors"
            >
              Have words of your own? Release a letter →
            </Link>
          </div>
        </article>

        {/* Quiet Footnote */}
        <p className="mt-8 text-center text-xs text-[#878077] font-serif italic max-w-sm mx-auto">
          This letter is anonymous and immutable. It exists here as an echo released into orbit.
        </p>
      </main>

      <Footer />
    </div>
  );
}
