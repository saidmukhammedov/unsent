"use client";

import { useState } from "react";
import { REPORT_REASONS, type ReportReasonKey } from "@/lib/constants/reports";

interface ReportModalProps {
  letterId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ReportModal({ letterId, isOpen, onClose }: ReportModalProps) {
  const [reason, setReason] = useState<ReportReasonKey>("PERSONAL_INFO");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/orbit/${letterId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          details: details.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error?.message || "Unable to submit report. Please try again.");
      } else {
        setSuccess(true);
        setTimeout(() => {
          onClose();
          setSuccess(false);
          setDetails("");
        }, 2200);
      }
    } catch {
      setError("Network error while submitting report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#23201D]/40 backdrop-blur-xs animate-fade-in">
      <div
        className="w-full max-w-lg bg-[#FBF9F5] border border-[#E8E2D7] p-6 sm:p-8 rounded-sm shadow-[0_12px_40px_rgba(35,32,29,0.12)] relative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-[#878077] hover:text-[#23201D] text-lg font-mono p-1"
          aria-label="Close modal"
        >
          ✕
        </button>

        {success ? (
          <div className="text-center py-8 space-y-3">
            <div className="w-10 h-10 mx-auto rounded-full bg-[#C27D77]/10 flex items-center justify-center text-[#C27D77]">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="font-serif text-xl text-[#23201D]">Report Received</h3>
            <p className="text-xs text-[#57524C] max-w-sm mx-auto leading-relaxed">
              Thank you for looking after this sanctuary. Our stewards will privately review this letter.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#F5F2EB] border border-[#E8E2D7] text-[11px] text-[#57524C] mb-2">
                <span className="w-1 h-1 rounded-full bg-[#C27D77]" />
                <span className="font-serif italic">Sanctuary Safety</span>
              </div>
              <h2 id="report-modal-title" className="font-serif text-xl sm:text-2xl text-[#23201D] font-medium">
                Report this letter
              </h2>
              <p className="text-xs text-[#57524C] mt-1 leading-relaxed">
                If this letter violates privacy, reveals personal information, or contains harmful content, please let us know. Reports remain strictly private.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-[#F8F2F1] border border-[#E5C7C4] text-xs text-[#8E443D] rounded-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-medium text-[#23201D]">
                Reason for report
              </label>
              <div className="space-y-2">
                {REPORT_REASONS.map((r) => (
                  <label
                    key={r.id}
                    className={`flex items-center gap-3 p-2.5 rounded-sm border cursor-pointer text-xs transition-colors ${
                      reason === r.id
                        ? "bg-[#F5F2EB] border-[#C27D77]/60 text-[#23201D]"
                        : "bg-[#FBF9F5] border-[#E8E2D7] text-[#57524C] hover:bg-[#F5F2EB]/60"
                    }`}
                  >
                    <input
                      type="radio"
                      name="report-reason"
                      value={r.id}
                      checked={reason === r.id}
                      onChange={() => setReason(r.id)}
                      className="accent-[#C27D77]"
                    />
                    <span>{r.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="report-details" className="block text-xs font-medium text-[#23201D]">
                Additional context <span className="text-[#878077] font-normal">(optional)</span>
              </label>
              <textarea
                id="report-details"
                rows={3}
                maxLength={500}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Briefly describe the issue if necessary..."
                className="w-full text-xs p-3 rounded-sm bg-[#F5F2EB]/60 border border-[#E8E2D7] focus:bg-[#FBF9F5] focus:border-[#C27D77] focus:outline-hidden text-[#23201D] placeholder:text-[#878077]/70 resize-none"
              />
              <div className="text-right text-[11px] text-[#878077]">
                {details.length}/500
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#E8E2D7]/60">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-3.5 py-1.5 rounded-sm border border-[#E8E2D7] bg-[#F5F2EB] text-[#57524C] text-xs hover:bg-[#ECE7DE] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 rounded-sm bg-[#23201D] text-[#FBF9F5] text-xs font-medium hover:bg-[#3D3833] transition-colors disabled:opacity-50"
              >
                {loading ? "Submitting..." : "Submit Report"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
