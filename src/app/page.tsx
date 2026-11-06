import Link from "next/link";
import { Header } from "@/components/ui/Header";
import { Footer } from "@/components/ui/Footer";
import { LetterPreviewCard } from "@/components/ui/LetterPreviewCard";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] paper-grain selection:bg-[#EEDCDA]">
      <Header />

      <main className="flex-1 flex flex-col justify-center">
        {/* Hero Section */}
        <section className="max-w-3xl mx-auto px-6 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 mb-8 px-3.5 py-1 rounded-full bg-[#F5F2EB] border border-[#E8E2D7] text-xs text-[#57524C]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C27D77]" />
            <span className="font-handwriting text-sm tracking-wide">
              an anonymous sanctuary for letters never sent
            </span>
          </div>

          <h1 className="font-serif text-3xl sm:text-5xl lg:text-[3.25rem] leading-[1.25] text-[#23201D] font-normal tracking-[-0.01em] mb-8">
            Some words were never meant to be spoken.{" "}
            <span className="italic block mt-2 text-[#57524C]">
              But perhaps they still deserve somewhere to exist.
            </span>
          </h1>

          <p className="max-w-xl mx-auto text-base sm:text-lg text-[#57524C] leading-relaxed mb-12 font-sans font-light">
            UNSENT is a quiet archive for thoughts held back, apologies left late,
            and confessions kept private. No audience metrics, no profiles to curate,
            no algorithmic feeds.
          </p>

          {/* Two Primary, Balanced Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 max-w-md mx-auto">
            <Link
              href="/orbit"
              className="w-full sm:w-1/2 py-3.5 px-6 rounded-sm bg-[#F5F2EB] hover:bg-[#ECE7DE] border border-[#E8E2D7] text-[#23201D] text-sm tracking-wide font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 group"
            >
              <span>Read something</span>
              <span className="font-serif italic text-[#C27D77] group-hover:translate-x-0.5 transition-transform">
                → Orbit
              </span>
            </Link>

            <Link
              href="/compose"
              className="w-full sm:w-1/2 py-3.5 px-6 rounded-sm bg-[#23201D] hover:bg-[#38332E] text-[#FBF9F5] text-sm tracking-wide font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 shadow-[0_2px_8px_rgba(35,32,29,0.08)] group"
            >
              <span>Write something</span>
              <span className="font-serif italic text-[#E5C7C4] group-hover:translate-x-0.5 transition-transform">
                → Space
              </span>
            </Link>
          </div>
        </section>

        {/* Ambient Orbit Glimpse */}
        <section className="max-w-4xl mx-auto px-6 py-12 w-full">
          <div className="flex items-center justify-between border-b border-[#E8E2D7] pb-3 mb-8">
            <h2 className="font-serif text-lg text-[#57524C] italic tracking-wide">
              Recent echoes in Orbit
            </h2>
            <Link
              href="/orbit"
              className="text-xs text-[#878077] hover:text-[#23201D] transition-colors"
            >
              explore all unread letters →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <LetterPreviewCard
              recipient="To the stranger on the evening train"
              excerpt="You were reading the same poem I used to keep folded in my wallet. I almost said something when you closed the book at 34th Street. I hope whoever gave it to you is still around."
              dateStr="an hour ago"
              tag="unspoken"
            />
            <LetterPreviewCard
              recipient="To the city we both had to leave"
              excerpt="I still measure the distance of every new street by how long it took us to walk back from the pier after midnight. Nothing here smells like salt and wet cedar."
              dateStr="yesterday"
              tag="memory"
            />
          </div>
        </section>

        {/* Quiet Principles */}
        <section className="max-w-4xl mx-auto px-6 py-16 w-full border-t border-[#E8E2D7]/60 mt-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
            <div className="p-4 rounded-sm bg-[#F5F2EB]/40 border border-[#E8E2D7]/50">
              <span className="font-serif text-sm italic text-[#C27D77] block mb-2">
                01. True Anonymity
              </span>
              <h3 className="font-serif text-base text-[#23201D] mb-2 font-medium">
                No profiles or followings
              </h3>
              <p className="text-xs text-[#57524C] leading-relaxed">
                You write under an evocative, non-indexed UNSENT ID. No real names,
                no social graphs, and no public activity trails.
              </p>
            </div>

            <div className="p-4 rounded-sm bg-[#F5F2EB]/40 border border-[#E8E2D7]/50">
              <span className="font-serif text-sm italic text-[#C27D77] block mb-2">
                02. Pure Sanctuary
              </span>
              <h3 className="font-serif text-base text-[#23201D] mb-2 font-medium">
                No likes or popularity scores
              </h3>
              <p className="text-xs text-[#57524C] leading-relaxed">
                Words are published to be read, not rewarded. Letters are discovered
                by sentiment and emotional cadence, not engagement loops.
              </p>
            </div>

            <div className="p-4 rounded-sm bg-[#F5F2EB]/40 border border-[#E8E2D7]/50">
              <span className="font-serif text-sm italic text-[#C27D77] block mb-2">
                03. Private Recovery
              </span>
              <h3 className="font-serif text-base text-[#23201D] mb-2 font-medium">
                Persistent across visits
              </h3>
              <p className="text-xs text-[#57524C] leading-relaxed">
                Your letters remain yours. A private cryptographic recovery key
                allows you to restore or permanently retract your writing from any device.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
