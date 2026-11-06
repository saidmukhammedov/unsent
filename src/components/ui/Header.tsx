import Link from "next/link";
import { NotificationBell } from "@/components/ui/NotificationBell";

export function Header() {
  return (
    <header className="w-full border-b border-[#E8E2D7]/70 bg-[#FBF9F5]/90 backdrop-blur-xs sticky top-0 z-40 transition-colors">
      <div className="max-w-4xl mx-auto px-6 h-18 flex items-center justify-between">
        <Link
          href="/"
          className="group flex items-baseline gap-2.5 transition-opacity hover:opacity-80"
        >
          <span className="font-serif text-2xl tracking-[0.18em] text-[#23201D] font-normal uppercase">
            UNSENT
          </span>
          <span className="hidden sm:inline font-handwriting text-sm text-[#878077] tracking-normal">
            a quiet archive
          </span>
        </Link>

        <nav className="flex items-center gap-5 sm:gap-7 text-sm">
          <Link
            href="/orbit"
            className="text-[#57524C] hover:text-[#23201D] transition-colors font-medium tracking-wide"
          >
            Orbit
          </Link>

          <Link
            href="/archive"
            className="text-[#57524C] hover:text-[#23201D] transition-colors font-medium tracking-wide"
          >
            Archive
          </Link>

          <NotificationBell />

          <Link
            href="/compose"
            className="text-[#23201D] border border-[#23201D]/20 hover:border-[#23201D]/40 px-3.5 py-1.5 rounded-sm transition-all hover:bg-[#F5F2EB] font-medium tracking-wide"
          >
            Write a letter
          </Link>
        </nav>
      </div>
    </header>
  );
}
