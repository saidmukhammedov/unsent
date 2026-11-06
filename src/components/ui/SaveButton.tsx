"use client";

import { useState } from "react";

interface SaveButtonProps {
  letterId: string;
  initialSaved?: boolean;
  variant?: "icon-only" | "full";
  className?: string;
  onToggle?: (newSavedState: boolean) => void;
}

export function SaveButton({
  letterId,
  initialSaved = false,
  variant = "icon-only",
  className = "",
  onToggle,
}: SaveButtonProps) {
  const [isSaved, setIsSaved] = useState<boolean>(initialSaved);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isLoading) return;

    const nextState = !isSaved;
    setIsSaved(nextState);
    setIsLoading(true);

    try {
      const res = await fetch(`/api/orbit/${letterId}/save`, {
        method: nextState ? "POST" : "DELETE",
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        // Revert on error
        setIsSaved(!nextState);
        setFeedback("Failed to update");
      } else {
        setFeedback(nextState ? "Saved quietly" : "Removed");
        onToggle?.(nextState);
      }
    } catch {
      setIsSaved(!nextState);
      setFeedback("Network error");
    } finally {
      setIsLoading(false);
      setTimeout(() => setFeedback(null), 2500);
    }
  };

  if (variant === "full") {
    return (
      <div className="relative inline-flex items-center">
        <button
          type="button"
          onClick={handleToggle}
          disabled={isLoading}
          aria-label={isSaved ? "Remove from saved collection" : "Save to personal collection"}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-sm border text-xs font-medium transition-all duration-200 ${
            isSaved
              ? "bg-[#C27D77]/10 border-[#C27D77]/40 text-[#8E443D] hover:bg-[#C27D77]/15"
              : "bg-[#F5F2EB] border-[#E8E2D7] text-[#57524C] hover:bg-[#ECE7DE] hover:text-[#23201D]"
          } ${className}`}
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              isSaved ? "fill-[#C27D77] text-[#C27D77] scale-105" : "fill-none text-current"
            }`}
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <span className="font-serif italic text-[13px]">
            {isSaved ? "Saved in your collection" : "Save to collection"}
          </span>
        </button>

        {feedback && (
          <span className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#23201D] text-[#FBF9F5] text-[10px] rounded shadow-xs whitespace-nowrap animate-fade-in pointer-events-none">
            {feedback}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isLoading}
        title={isSaved ? "Remove from saved collection" : "Save letter to private collection"}
        aria-label={isSaved ? "Remove from saved collection" : "Save letter to private collection"}
        className={`p-1.5 rounded-sm transition-all duration-200 ${
          isSaved
            ? "text-[#C27D77] hover:text-[#8E443D] bg-[#C27D77]/10"
            : "text-[#878077] hover:text-[#23201D] hover:bg-[#F5F2EB]"
        } ${className}`}
      >
        <svg
          className={`w-4 h-4 transition-transform ${
            isSaved ? "fill-[#C27D77] scale-110" : "fill-none"
          }`}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {feedback && (
        <span className="absolute -top-6 right-0 px-2 py-0.5 bg-[#23201D] text-[#FBF9F5] text-[10px] rounded shadow-xs whitespace-nowrap pointer-events-none z-10">
          {feedback}
        </span>
      )}
    </div>
  );
}
