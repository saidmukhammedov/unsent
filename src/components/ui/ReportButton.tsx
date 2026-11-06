"use client";

import { useState } from "react";
import { ReportModal } from "./ReportModal";

interface ReportButtonProps {
  letterId: string;
  className?: string;
}

export function ReportButton({ letterId, className = "" }: ReportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Report this letter"
        className={`inline-flex items-center gap-1.5 text-xs text-[#878077] hover:text-[#C27D77] transition-colors font-serif italic ${className}`}
        title="Report this letter if it exposes private or harmful content"
      >
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
        <span>Report</span>
      </button>

      <ReportModal
        letterId={letterId}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
