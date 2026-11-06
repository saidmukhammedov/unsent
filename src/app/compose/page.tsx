import Link from "next/link";
import { Header } from "@/components/ui/Header";
import { Footer } from "@/components/ui/Footer";

export default function ComposePlaceholderPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] paper-grain">
      <Header />

      <main className="flex-1 max-w-2xl mx-auto px-6 py-24 text-center flex flex-col items-center justify-center">
        <div className="inline-flex items-center gap-2 mb-6 px-3.5 py-1 rounded-full bg-[#F5F2EB] border border-[#E8E2D7] text-xs text-[#57524C]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#C27D77]" />
          <span className="font-handwriting text-sm tracking-wide">
            Phase 2 Milestone 2
          </span>
        </div>

        <h1 className="font-serif text-3xl sm:text-4xl text-[#23201D] font-normal tracking-[-0.01em] mb-4">
          Writing Space
        </h1>

        <p className="text-sm text-[#57524C] leading-relaxed max-w-md mb-8">
          The distraction-free letter editor, anonymous identity bootstrap, and private draft
          autosave engine will be activated in Milestone 2.
        </p>

        <div className="p-6 rounded-sm bg-[#F5F2EB]/60 border border-[#E8E2D7] text-xs text-[#57524C] text-left max-w-md w-full mb-8">
          <p className="font-serif italic text-sm text-[#23201D] mb-2">
            Planned Writing Features:
          </p>
          <ul className="space-y-1.5 list-disc list-inside text-[#57524C]">
            <li>Recipient designations (“To M”, “To my past self”)</li>
            <li>Private letters, public Orbit publishing, and personal notes</li>
            <li>Cryptographic recovery credentials separate from public handles</li>
            <li>Local offline draft recovery</li>
          </ul>
        </div>

        <Link
          href="/"
          className="font-serif italic text-sm text-[#C27D77] hover:underline underline-offset-4"
        >
          ← Return to sanctuary
        </Link>
      </main>

      <Footer />
    </div>
  );
}
