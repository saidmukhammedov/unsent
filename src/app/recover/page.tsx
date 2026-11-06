import Link from "next/link";
import { Header } from "@/components/ui/Header";
import { Footer } from "@/components/ui/Footer";

export default function RecoverPlaceholderPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] paper-grain">
      <Header />

      <main className="flex-1 max-w-2xl mx-auto px-6 py-24 text-center flex flex-col items-center justify-center">
        <div className="inline-flex items-center gap-2 mb-6 px-3.5 py-1 rounded-full bg-[#F5F2EB] border border-[#E8E2D7] text-xs text-[#57524C]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#C27D77]" />
          <span className="font-handwriting text-sm tracking-wide">
            Account & Identity Recovery
          </span>
        </div>

        <h1 className="font-serif text-3xl sm:text-4xl text-[#23201D] font-normal tracking-[-0.01em] mb-4">
          Restore Your Sanctuary
        </h1>

        <p className="text-sm text-[#57524C] leading-relaxed max-w-md mb-8">
          If you have cleared your browser cookies or switched devices, you can enter your
          secret Recovery Key to regain access to your letters and private notes.
        </p>

        <div className="p-6 rounded-sm bg-[#F5F2EB]/60 border border-[#E8E2D7] text-xs text-[#57524C] text-left max-w-md w-full mb-8">
          <p className="font-serif italic text-sm text-[#23201D] mb-2">
            Recovery Safeguards:
          </p>
          <p className="text-xs text-[#57524C] leading-relaxed">
            Recovery keys are high-entropy cryptographic phrases. They are never stored
            in plaintext on the server and are verified using Argon2id hashes.
          </p>
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
