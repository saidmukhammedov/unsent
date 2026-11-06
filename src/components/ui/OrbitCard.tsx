"use client";

import Link from "next/link";
import { SaveButton } from "./SaveButton";

export interface OrbitCardProps {
  id: string;
  recipientName?: string | null;
  title?: string | null;
  content: string;
  theme?: string | null;
  createdAt: string | Date;
  isSaved?: boolean;
  onToggleSave?: (id: string, isSaved: boolean) => void;
}

export function OrbitCard({
  id,
  recipientName,
  title,
  content,
  theme,
  createdAt,
  isSaved = false,
  onToggleSave,
}: OrbitCardProps) {
  const formattedDate = new Date(createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <article className="group relative bg-[#FBF9F5] border border-[#E8E2D7] p-6 sm:p-7 rounded-sm shadow-[0_2px_12px_rgba(35,32,29,0.02)] hover:border-[#D8D0C4] hover:shadow-[0_4px_20px_rgba(35,32,29,0.04)] transition-all duration-300 flex flex-col justify-between">
      <div>
        <div className="flex items-baseline justify-between mb-3 border-b border-[#E8E2D7]/50 pb-2.5">
          <span className="font-serif italic text-base text-[#57524C] tracking-wide">
            {recipientName ? `To: ${recipientName}` : "To: Someone"}
          </span>
          <span className="font-handwriting text-xs text-[#878077] tracking-wider">
            {formattedDate}
          </span>
        </div>

        {title && (
          <h3 className="font-serif font-medium text-lg text-[#23201D] mb-2 leading-snug">
            {title}
          </h3>
        )}

        <p className="font-serif text-[1.05rem] leading-relaxed text-[#23201D]/90 whitespace-pre-line line-clamp-4">
          “{content}”
        </p>
      </div>

      <div className="mt-5 pt-3 flex items-center justify-between text-xs text-[#878077] border-t border-[#E8E2D7]/40">
        <div className="flex items-center gap-2">
          {theme ? (
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#F5F2EB] text-[#57524C] border border-[#E8E2D7]/70 text-[11px] tracking-wide">
              {theme}
            </span>
          ) : (
            <span />
          )}
        </div>

        <div className="flex items-center gap-3">
          <SaveButton
            letterId={id}
            initialSaved={isSaved}
            onToggle={(state) => onToggleSave?.(id, state)}
          />

          <Link
            href={`/orbit/${id}`}
            className="font-serif italic text-[#C27D77] hover:text-[#AB6863] transition-colors group-hover:translate-x-0.5 transform inline-flex items-center gap-1"
          >
            <span>read letter</span>
            <span>→</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
