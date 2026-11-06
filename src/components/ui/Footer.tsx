import Link from "next/link";

export function Footer() {
  return (
    <footer className="w-full border-t border-[#E8E2D7] bg-[#F5F2EB]/50 py-12 mt-auto">
      <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-[#878077]">
        <div className="flex flex-col items-center sm:items-start gap-1">
          <p className="font-serif italic text-sm text-[#57524C]">
            “Some words were never meant to be spoken.”
          </p>
          <p className="tracking-wide">
            UNSENT is an anonymous sanctuary. No tracking. No metrics. No audience optimization.
          </p>
        </div>

        <div className="flex items-center gap-6">
          <Link
            href="/orbit"
            className="hover:text-[#23201D] transition-colors underline-offset-4 hover:underline"
          >
            Orbit
          </Link>
          <Link
            href="/compose"
            className="hover:text-[#23201D] transition-colors underline-offset-4 hover:underline"
          >
            Write
          </Link>
          <Link
            href="/recover"
            className="hover:text-[#23201D] transition-colors underline-offset-4 hover:underline"
          >
            Restore Identity
          </Link>
        </div>
      </div>
    </footer>
  );
}
