"use client";

import { useState, useEffect } from "react";
import type { LetterResponseItem } from "@/types/domain";
import { ReportButton } from "./ReportButton";

interface LetterResponsesSectionProps {
  letterId: string;
}

export function LetterResponsesSection({ letterId }: LetterResponsesSectionProps) {
  const [responses, setResponses] = useState<LetterResponseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "info" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadResponses() {
      try {
        const res = await fetch(`/api/orbit/${letterId}/responses`);
        const json = await res.json();
        if (!ignore && json.success) {
          setResponses(json.data || []);
        }
      } catch {
        // Quiet failure for responses fetch
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadResponses();

    return () => {
      ignore = true;
    };
  }, [letterId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || submitting) return;

    setSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/orbit/${letterId}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setStatusMessage({
          type: "error",
          text: json.error?.message || "Unable to send response. Please check your submission.",
        });
      } else if (json.isHeld) {
        setStatusMessage({
          type: "info",
          text: json.message || "Your response was received and held for review. It will appear once approved by a steward.",
        });
        setContent("");
      } else {
        setStatusMessage({
          type: "success",
          text: "Your response was released into orbit.",
        });
        setContent("");
        if (json.data) {
          setResponses((prev) => [...prev, json.data]);
        }
      }
    } catch {
      setStatusMessage({
        type: "error",
        text: "Network error sending response. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-16 pt-12 border-t border-[#E8E2D7]/80">
      {/* Section Header */}
      <div className="flex items-baseline justify-between mb-8">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#F5F2EB] border border-[#E8E2D7] text-xs text-[#57524C] mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C27D77]" />
            <span className="font-serif italic text-xs">Quiet Echoes</span>
          </div>
          <h2 className="font-serif text-2xl text-[#23201D] font-normal">
            Responses
          </h2>
        </div>

        <span className="font-handwriting text-xs text-[#878077]">
          {responses.length} {responses.length === 1 ? "echo" : "echoes"}
        </span>
      </div>

      {/* Existing Responses List */}
      <div className="space-y-5 mb-12">
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((n) => (
              <div
                key={n}
                className="p-5 bg-[#FBF9F5] border border-[#E8E2D7]/70 rounded-sm animate-pulse space-y-2"
              >
                <div className="h-3 bg-[#E8E2D7]/60 rounded w-24" />
                <div className="h-4 bg-[#E8E2D7]/40 rounded w-full" />
                <div className="h-4 bg-[#E8E2D7]/30 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : responses.length === 0 ? (
          <div className="p-8 text-center bg-[#F5F2EB]/40 border border-[#E8E2D7]/70 rounded-sm">
            <p className="font-serif italic text-sm text-[#57524C]">
              No one has whispered back yet.
            </p>
            <p className="text-xs text-[#878077] mt-1">
              Be the first to leave a standalone anonymous echo.
            </p>
          </div>
        ) : (
          responses.map((resp) => (
            <article
              key={resp.id}
              className="p-5 sm:p-6 bg-[#FBF9F5] border border-[#E8E2D7] rounded-sm shadow-[0_2px_8px_rgba(35,32,29,0.02)] space-y-3 relative group"
            >
              <div className="flex items-center justify-between border-b border-[#E8E2D7]/40 pb-2 text-xs">
                <span className="font-serif italic text-[#878077]">An anonymous echo</span>
                <span className="font-handwriting text-[#878077]">
                  {new Date(resp.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>

              <p className="font-serif text-[1.05rem] leading-relaxed text-[#23201D]/90 whitespace-pre-wrap">
                {resp.content}
              </p>

              <div className="flex justify-end pt-1">
                <ReportButton letterId={resp.id} className="text-[11px]" />
              </div>
            </article>
          ))
        )}
      </div>

      {/* Response Writing Box */}
      <div className="p-6 sm:p-8 bg-[#F5F2EB]/60 border border-[#E8E2D7] rounded-sm space-y-4">
        <div>
          <h3 className="font-serif text-lg text-[#23201D] font-medium">
            Whisper back into orbit
          </h3>
          <p className="text-xs text-[#57524C] mt-0.5 leading-relaxed">
            Leave a standalone anonymous thought. Responses are not conversational threads;
            they exist as quiet echoes beside the letter.
          </p>
        </div>

        {statusMessage && (
          <div
            className={`p-3 rounded-sm text-xs border ${
              statusMessage.type === "success"
                ? "bg-[#EBF3ED] border-[#C5DEC9] text-[#2D5A38]"
                : statusMessage.type === "info"
                ? "bg-[#F5F2EB] border-[#E8E2D7] text-[#57524C]"
                : "bg-[#F8F2F1] border-[#E5C7C4] text-[#8E443D]"
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <textarea
              rows={4}
              maxLength={1000}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What did these words stir in you? (Anonymous to the public)"
              className="w-full text-sm p-4 rounded-sm bg-[#FBF9F5] border border-[#E8E2D7] focus:border-[#C27D77] focus:outline-hidden font-serif leading-relaxed text-[#23201D] placeholder:text-[#878077]/70 resize-none shadow-xs"
            />
            <div className="text-right text-[11px] text-[#878077] mt-1 font-mono">
              {content.length}/1000
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="font-serif italic text-xs text-[#878077]">
              Strictly anonymous. Never reveals your UNSENT ID.
            </span>

            <button
              type="submit"
              disabled={submitting || !content.trim()}
              className="px-4 py-2 rounded-sm bg-[#23201D] text-[#FBF9F5] text-xs font-medium hover:bg-[#3D3833] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Releasing..." : "Send Response"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
