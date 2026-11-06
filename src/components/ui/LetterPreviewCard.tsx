interface LetterPreviewCardProps {
  recipient: string;
  excerpt: string;
  dateStr: string;
  tag?: string;
}

export function LetterPreviewCard({
  recipient,
  excerpt,
  dateStr,
  tag,
}: LetterPreviewCardProps) {
  return (
    <article className="group relative bg-[#FBF9F5] border border-[#E8E2D7] p-7 rounded-sm shadow-[0_2px_12px_rgba(35,32,29,0.02)] hover:border-[#D8D0C4] transition-all duration-300 flex flex-col justify-between">
      <div>
        <div className="flex items-baseline justify-between mb-3 border-b border-[#E8E2D7]/50 pb-2.5">
          <span className="font-serif italic text-base text-[#57524C] tracking-wide">
            {recipient}
          </span>
          <span className="font-handwriting text-xs text-[#878077] tracking-wider">
            {dateStr}
          </span>
        </div>

        <p className="font-serif text-[1.05rem] leading-relaxed text-[#23201D]/90 whitespace-pre-line line-clamp-4">
          “{excerpt}”
        </p>
      </div>

      <div className="mt-5 pt-3 flex items-center justify-between text-xs text-[#878077]">
        {tag ? (
          <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#F5F2EB] text-[#57524C] border border-[#E8E2D7]/60 text-[11px] tracking-wide">
            {tag}
          </span>
        ) : (
          <span />
        )}
        <span className="font-serif italic text-[#C27D77] group-hover:translate-x-0.5 transition-transform">
          read letter →
        </span>
      </div>
    </article>
  );
}
