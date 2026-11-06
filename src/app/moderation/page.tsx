import Link from "next/link";
import { Header } from "@/components/ui/Header";
import { Footer } from "@/components/ui/Footer";
import { ModeratorDashboard } from "@/components/moderation/ModeratorDashboard";
import { verifyModerator } from "@/lib/auth/moderator";

export default async function ModerationPage() {
  const auth = await verifyModerator();

  if (!auth.authorized) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FBF9F5] paper-grain">
        <Header />
        <main className="flex-1 max-w-md mx-auto px-6 py-24 text-center flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-[#F8F2F1] border border-[#E5C7C4] flex items-center justify-center mb-5 text-[#8E443D]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
              />
            </svg>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl text-[#23201D] font-normal mb-3">
            Access Restricted
          </h1>
          <p className="text-xs text-[#57524C] leading-relaxed mb-6">
            This section is reserved for UNSENT platform stewards and moderators. Your current session does not hold moderator privileges.
          </p>
          <div className="p-4 rounded-sm bg-[#F5F2EB]/80 border border-[#E8E2D7] text-left text-[11px] text-[#57524C] w-full mb-8 space-y-1.5">
            <p className="font-serif italic text-xs text-[#23201D]">Operator Note:</p>
            <p>To grant moderator access to an identity, run the promotion utility:</p>
            <code className="block bg-[#ECE7DE] p-1.5 rounded-xs font-mono text-[10px] text-[#23201D]">
              pnpm exec tsx scripts/promote-moderator.ts &lt;unsentId&gt;
            </code>
            <p>Or configure <code className="font-mono text-[10px]">MODERATOR_TOKEN</code> or <code className="font-mono text-[10px]">MODERATOR_UNSENT_IDS</code> in the server environment.</p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-serif italic text-[#C27D77] hover:underline underline-offset-4"
          >
            <span>← Return to sanctuary</span>
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] paper-grain">
      <Header />

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-10 sm:py-14">
        {/* Header bar */}
        <div className="mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-[#E8E2D7]">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#F5F2EB] border border-[#E8E2D7] text-xs text-[#57524C] mb-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C27D77]" />
              <span className="font-serif italic">Archive Stewards</span>
            </div>
            <h1 className="font-serif text-3xl text-[#23201D] font-normal tracking-tight">
              Moderation Sanctuary
            </h1>
            <p className="text-xs text-[#57524C] mt-1 leading-relaxed">
              Quietly reviewing held submissions, evaluating community reports, and preserving the sanctuary&rsquo;s literary peace.
            </p>
          </div>

          <div className="text-right">
            <span className="font-mono text-xs text-[#878077] block">
              Steward: {auth.user?.unsentId}
            </span>
            <span className="font-mono text-[10px] text-[#2D5A38] uppercase tracking-wider">
              Role: {auth.user?.role}
            </span>
          </div>
        </div>

        {/* Dashboard Queue */}
        <ModeratorDashboard />
      </main>

      <Footer />
    </div>
  );
}
