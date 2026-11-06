"use client";

import { useState, useEffect } from "react";
import type { ModerationQueueItem } from "@/types/domain";
import { getReasonLabel } from "@/lib/constants/reports";

type ModerationFilter = "held" | "reported" | "removed" | "approved";

export function ModeratorDashboard() {
  const [filter, setFilter] = useState<ModerationFilter>("held");
  const [items, setItems] = useState<ModerationQueueItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Action modal state
  const [actionItem, setActionItem] = useState<{
    letter: ModerationQueueItem;
    action: "APPROVE" | "REJECT" | "REMOVE" | "DISMISS_REPORTS";
  } | null>(null);
  const [actionReason, setActionReason] = useState<string>("");
  const [actionNotes, setActionNotes] = useState<string>("");
  const [submittingAction, setSubmittingAction] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState<number>(0);

  useEffect(() => {
    let ignore = false;

    async function loadQueue() {
      try {
        const res = await fetch(`/api/moderation/letters?filter=${filter}&page=${page}&limit=15`);
        const data = await res.json();
        if (!ignore) {
          if (!res.ok || !data.success) {
            setError(data.error?.message || "Failed to load moderation queue.");
            setItems([]);
          } else {
            setItems(data.data.items);
            setTotalPages(data.data.totalPages);
            setTotalCount(data.data.total);
            setError(null);
          }
          setLoading(false);
        }
      } catch {
        if (!ignore) {
          setError("Network error loading queue.");
          setItems([]);
          setLoading(false);
        }
      }
    }

    loadQueue();

    return () => {
      ignore = true;
    };
  }, [filter, page, refreshKey]);

  const handleFilterChange = (newFilter: ModerationFilter) => {
    if (newFilter === filter) return;
    setLoading(true);
    setFilter(newFilter);
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setLoading(true);
    setPage(newPage);
  };

  const handleRefresh = () => {
    setLoading(true);
    setRefreshKey((k) => k + 1);
  };

  const openActionModal = (
    letter: ModerationQueueItem,
    action: "APPROVE" | "REJECT" | "REMOVE" | "DISMISS_REPORTS"
  ) => {
    setActionItem({ letter, action });
    // Default reason text based on action
    if (action === "APPROVE") setActionReason("Reviewed by steward; safe for public Orbit.");
    else if (action === "REJECT") setActionReason("Content violates sanctuary safety guidelines.");
    else if (action === "REMOVE") setActionReason("Removed from Orbit following moderation review.");
    else if (action === "DISMISS_REPORTS") setActionReason("Reported content reviewed and found compliant.");
    setActionNotes("");
    setActionFeedback(null);
  };

  const handleExecuteAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionItem || !actionReason.trim()) return;

    setSubmittingAction(true);
    setActionFeedback(null);

    try {
      const res = await fetch(`/api/moderation/letters/${actionItem.letter.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actionItem.action,
          reason: actionReason.trim(),
          notes: actionNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setActionFeedback(data.error?.message || "Action failed.");
      } else {
        setActionItem(null);
        handleRefresh();
      }
    } catch {
      setActionFeedback("Network error executing action.");
    } finally {
      setSubmittingAction(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Control Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E8E2D7]">
        <div className="inline-flex p-1 rounded-sm bg-[#F5F2EB] border border-[#E8E2D7]">
          <button
            type="button"
            onClick={() => handleFilterChange("held")}
            className={`px-4 py-1.5 text-xs font-medium rounded-xs transition-colors ${
              filter === "held"
                ? "bg-[#FBF9F5] text-[#23201D] shadow-xs"
                : "text-[#57524C] hover:text-[#23201D]"
            }`}
          >
            Held Submissions
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange("reported")}
            className={`px-4 py-1.5 text-xs font-medium rounded-xs transition-colors ${
              filter === "reported"
                ? "bg-[#FBF9F5] text-[#23201D] shadow-xs"
                : "text-[#57524C] hover:text-[#23201D]"
            }`}
          >
            Reported Letters
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange("removed")}
            className={`px-4 py-1.5 text-xs font-medium rounded-xs transition-colors ${
              filter === "removed"
                ? "bg-[#FBF9F5] text-[#23201D] shadow-xs"
                : "text-[#57524C] hover:text-[#23201D]"
            }`}
          >
            Removed Archive
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange("approved")}
            className={`px-4 py-1.5 text-xs font-medium rounded-xs transition-colors ${
              filter === "approved"
                ? "bg-[#FBF9F5] text-[#23201D] shadow-xs"
                : "text-[#57524C] hover:text-[#23201D]"
            }`}
          >
            Approved Letters
          </button>
        </div>

        <div className="text-xs text-[#878077] font-serif italic">
          {totalCount} {totalCount === 1 ? "letter" : "letters"} in view
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="p-6 bg-[#FBF9F5] border border-[#E8E2D7] rounded-sm animate-pulse space-y-3">
              <div className="h-4 bg-[#E8E2D7]/70 rounded w-1/4" />
              <div className="h-16 bg-[#E8E2D7]/40 rounded w-full" />
              <div className="h-4 bg-[#E8E2D7]/50 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12 px-4 bg-[#F5F2EB]/50 border border-[#E8E2D7] rounded-sm max-w-md mx-auto">
          <p className="font-serif italic text-sm text-[#23201D] mb-4">{error}</p>
          <button
            type="button"
            onClick={handleRefresh}
            className="px-3 py-1 bg-[#23201D] text-[#FBF9F5] text-xs rounded-sm hover:bg-[#3D3833]"
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 px-4 bg-[#F5F2EB]/40 border border-[#E8E2D7]/80 rounded-sm">
          <p className="font-serif italic text-base text-[#23201D]">
            Queue is clear.
          </p>
          <p className="text-xs text-[#57524C] mt-1">
            No letters match the &ldquo;{filter}&rdquo; filter at this time.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {items.map((letter) => (
            <article
              key={letter.id}
              className="bg-[#FBF9F5] border border-[#E8E2D7] p-6 sm:p-7 rounded-sm shadow-[0_2px_10px_rgba(35,32,29,0.02)] space-y-4"
            >
              {/* Meta row */}
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-b border-[#E8E2D7]/60 pb-3">
                <div className="flex items-center gap-3">
                  <span className="font-serif italic text-base text-[#23201D]">
                    {letter.recipientName ? `To: ${letter.recipientName}` : "To: Someone"}
                  </span>
                  {letter.theme && (
                    <span className="px-2 py-0.5 rounded-full bg-[#F5F2EB] text-[#57524C] border border-[#E8E2D7] text-[11px]">
                      {letter.theme}
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded-xs text-[10px] font-mono uppercase tracking-wider ${
                      letter.isModerated
                        ? "bg-[#F8F2F1] text-[#8E443D] border border-[#E5C7C4]"
                        : "bg-[#EBF3ED] text-[#2D5A38] border border-[#C5DEC9]"
                    }`}
                  >
                    {letter.moderationStatus || (letter.isModerated ? "HELD" : "ACTIVE")}
                  </span>
                </div>

                <span className="font-handwriting text-xs text-[#878077]">
                  {new Date(letter.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              {/* Title & Content */}
              {letter.title && (
                <h3 className="font-serif font-medium text-lg text-[#23201D]">
                  {letter.title}
                </h3>
              )}

              <div className="font-serif text-base leading-relaxed text-[#23201D]/90 whitespace-pre-wrap bg-[#F5F2EB]/30 p-4 rounded-xs border border-[#E8E2D7]/40">
                {letter.content}
              </div>

              {/* Held explanation */}
              {letter.moderationReason && (
                <div className="text-xs p-3 rounded-sm bg-[#F8F2F1] border border-[#E5C7C4] text-[#8E443D] flex items-baseline gap-2">
                  <span className="font-mono text-[10px] uppercase font-bold">Safety Gate Flag:</span>
                  <span>{letter.moderationReason}</span>
                </div>
              )}

              {/* Reports list if present */}
              {letter.reports && letter.reports.length > 0 && (
                <div className="space-y-2 p-3 bg-[#F5F2EB]/80 border border-[#E8E2D7] rounded-sm text-xs">
                  <div className="font-serif italic font-medium text-[#23201D]">
                    Reports ({letter.reports.length}):
                  </div>
                  <div className="space-y-1.5">
                    {letter.reports.map((r) => (
                      <div key={r.id} className="flex items-start justify-between text-[11px] border-b border-[#E8E2D7]/40 pb-1">
                        <div>
                          <span className="font-medium text-[#8E443D]">
                            [{getReasonLabel(r.reason)}]
                          </span>{" "}
                          <span className="text-[#57524C]">{r.details || "No details provided"}</span>
                        </div>
                        <span className="font-mono text-[10px] text-[#878077] whitespace-nowrap ml-2">
                          {r.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Moderator Action Buttons */}
              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-[#E8E2D7]/60">
                {filter === "held" && (
                  <>
                    <button
                      type="button"
                      onClick={() => openActionModal(letter, "APPROVE")}
                      className="px-3.5 py-1.5 rounded-sm bg-[#2D5A38] text-white text-xs font-medium hover:bg-[#23452B] transition-colors"
                    >
                      Approve & Release to Orbit
                    </button>
                    <button
                      type="button"
                      onClick={() => openActionModal(letter, "REJECT")}
                      className="px-3.5 py-1.5 rounded-sm bg-[#8E443D] text-white text-xs font-medium hover:bg-[#723630] transition-colors"
                    >
                      Reject Submission
                    </button>
                  </>
                )}

                {filter === "reported" && (
                  <>
                    <button
                      type="button"
                      onClick={() => openActionModal(letter, "DISMISS_REPORTS")}
                      className="px-3.5 py-1.5 rounded-sm bg-[#F5F2EB] border border-[#E8E2D7] text-[#57524C] text-xs font-medium hover:bg-[#ECE7DE] transition-colors"
                    >
                      Dismiss Reports
                    </button>
                    <button
                      type="button"
                      onClick={() => openActionModal(letter, "REMOVE")}
                      className="px-3.5 py-1.5 rounded-sm bg-[#8E443D] text-white text-xs font-medium hover:bg-[#723630] transition-colors"
                    >
                      Remove from Orbit
                    </button>
                  </>
                )}

                {(filter === "removed" || filter === "approved") && (
                  <button
                    type="button"
                    onClick={() =>
                      openActionModal(
                        letter,
                        filter === "removed" ? "APPROVE" : "REMOVE"
                      )
                    }
                    className="px-3.5 py-1.5 rounded-sm border border-[#E8E2D7] bg-[#F5F2EB] text-[#23201D] text-xs font-medium hover:bg-[#ECE7DE] transition-colors"
                  >
                    {filter === "removed" ? "Re-Approve to Orbit" : "Remove from Orbit"}
                  </button>
                )}
              </div>
            </article>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pt-6 border-t border-[#E8E2D7] flex items-center justify-between text-xs text-[#57524C]">
              <button
                type="button"
                onClick={() => handlePageChange(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-sm border border-[#E8E2D7] bg-[#F5F2EB] disabled:opacity-40"
              >
                ← Previous
              </button>
              <span className="font-handwriting">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-sm border border-[#E8E2D7] bg-[#F5F2EB] disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Action Confirmation Modal */}
      {actionItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#23201D]/40 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-[#FBF9F5] border border-[#E8E2D7] p-6 rounded-sm shadow-xl space-y-4">
            <h3 className="font-serif text-lg text-[#23201D] font-medium">
              Confirm Action: {actionItem.action}
            </h3>

            {actionFeedback && (
              <div className="p-3 bg-[#F8F2F1] border border-[#E5C7C4] text-xs text-[#8E443D] rounded-sm">
                {actionFeedback}
              </div>
            )}

            <form onSubmit={handleExecuteAction} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#23201D] mb-1">
                  Reason <span className="text-[#8E443D]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-sm bg-[#F5F2EB] border border-[#E8E2D7] text-[#23201D] focus:border-[#C27D77] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#23201D] mb-1">
                  Internal Steward Notes <span className="text-[#878077]">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder="Additional context recorded in audit log..."
                  className="w-full text-xs p-2.5 rounded-sm bg-[#F5F2EB] border border-[#E8E2D7] text-[#23201D] focus:border-[#C27D77] focus:outline-hidden resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E8E2D7]/60">
                <button
                  type="button"
                  onClick={() => setActionItem(null)}
                  disabled={submittingAction}
                  className="px-3.5 py-1.5 rounded-sm border border-[#E8E2D7] bg-[#F5F2EB] text-[#57524C] text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction || !actionReason.trim()}
                  className={`px-4 py-1.5 rounded-sm text-xs font-medium text-white transition-colors disabled:opacity-50 ${
                    actionItem.action === "APPROVE"
                      ? "bg-[#2D5A38] hover:bg-[#23452B]"
                      : actionItem.action === "REJECT" || actionItem.action === "REMOVE"
                      ? "bg-[#8E443D] hover:bg-[#723630]"
                      : "bg-[#23201D] hover:bg-[#3D3833]"
                  }`}
                >
                  {submittingAction ? "Processing..." : `Confirm ${actionItem.action}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
