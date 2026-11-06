"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import Link from "next/link";
import { Header } from "@/components/ui/Header";
import { Footer } from "@/components/ui/Footer";
import type {
  ArchiveData,
  ArchiveLetterItem,
  ArchiveResponseItem,
  ArchiveSavedLetterItem,
  ArchiveNoteItem,
} from "@/types/domain";
import {
  Lock,
  Globe,
  FileText,
  Bookmark,
  MessageSquare,
  Download,
  Trash2,
  Edit3,
  Plus,
  Check,
  X,
  ShieldAlert,
  ExternalLink,
  Clock,
  Sparkles,
  AlertCircle,
} from "lucide-react";

type ArchiveTab = "letters" | "responses" | "saved" | "notes";

export default function ArchivePage() {
  const [data, setData] = useState<ArchiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ArchiveTab>("letters");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Export state
  const [isExporting, setIsExporting] = useState(false);

  // Note creation & editing state
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteTags, setNoteTags] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  // Private letter editing state
  const [editingLetterId, setEditingLetterId] = useState<string | null>(null);
  const [editLetterTitle, setEditLetterTitle] = useState("");
  const [editLetterContent, setEditLetterContent] = useState("");

  // Saved letter reflection note editing state
  const [editingSavedNoteId, setEditingSavedNoteId] = useState<string | null>(null);
  const [reflectionNoteText, setReflectionNoteText] = useState("");

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    type: "delete_letter" | "delete_note" | "remove_saved";
    id: string;
    title: string;
    description: string;
  } | null>(null);

  // Fetch full archive
  const fetchArchive = useCallback(async (showLoadingSpinner: boolean = false) => {
    try {
      if (showLoadingSpinner) {
        setLoading(true);
      }
      const res = await fetch("/api/archive");
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setErrorMessage(json.error?.message || "Failed to load personal archive");
      }
    } catch (err) {
      console.error("Archive fetch error:", err);
      setErrorMessage("Could not connect to sanctuary. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function loadInitial() {
      try {
        const res = await fetch("/api/archive");
        const json = await res.json();
        if (!ignore) {
          if (json.success && json.data) {
            setData(json.data);
          } else {
            setErrorMessage(json.error?.message || "Failed to load personal archive");
          }
          setLoading(false);
        }
      } catch (err) {
        if (!ignore) {
          console.error("Archive fetch error:", err);
          setErrorMessage("Could not connect to sanctuary. Please try again.");
          setLoading(false);
        }
      }
    }

    loadInitial();
    return () => {
      ignore = true;
    };
  }, []);

  // Flash message helper
  const flashStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const flashError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), 5000);
  };

  // Export handler
  const handleExport = (format: "markdown" | "json") => {
    setIsExporting(true);
    try {
      const link = document.createElement("a");
      link.href = `/api/archive/export?format=${format}`;
      link.setAttribute("download", "");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      flashStatus(`Archive export initiated (${format.toUpperCase()})`);
    } catch (err) {
      console.error("Export download error:", err);
      flashError("Failed to trigger export download.");
    } finally {
      setTimeout(() => setIsExporting(false), 1000);
    }
  };

  // -------------------------------------------------------------
  // Personal Notes Handlers
  // -------------------------------------------------------------
  const handleSaveNewNote = async () => {
    if (!noteContent.trim()) {
      flashError("Note content cannot be empty.");
      return;
    }

    startTransition(async () => {
      try {
        const tagsArray = noteTags
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 5);

        const res = await fetch("/api/letters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entryType: "NOTE",
            title: noteTitle.trim() || undefined,
            content: noteContent.trim(),
            tags: tagsArray,
          }),
        });

        const json = await res.json();
        if (json.success) {
          setIsCreatingNote(false);
          setNoteTitle("");
          setNoteContent("");
          setNoteTags("");
          flashStatus("Personal note saved quietly.");
          await fetchArchive();
        } else {
          flashError(json.error?.message || "Failed to save note");
        }
      } catch (err) {
        console.error("Note save error:", err);
        flashError("Failed to save personal note.");
      }
    });
  };

  const handleUpdateNote = async (noteId: string) => {
    if (!noteContent.trim()) {
      flashError("Note content cannot be empty.");
      return;
    }

    startTransition(async () => {
      try {
        const tagsArray = noteTags
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 5);

        const res = await fetch(`/api/letters/${noteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: noteTitle.trim() || undefined,
            content: noteContent.trim(),
            tags: tagsArray,
          }),
        });

        const json = await res.json();
        if (json.success) {
          setEditingNoteId(null);
          setNoteTitle("");
          setNoteContent("");
          setNoteTags("");
          flashStatus("Personal note updated.");
          await fetchArchive();
        } else {
          flashError(json.error?.message || "Failed to update note");
        }
      } catch (err) {
        console.error("Note update error:", err);
        flashError("Failed to update note.");
      }
    });
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmModal) return;

    startTransition(async () => {
      try {
        if (confirmModal.type === "delete_letter" || confirmModal.type === "delete_note") {
          const res = await fetch(`/api/letters/${confirmModal.id}`, {
            method: "DELETE",
          });
          const json = await res.json();
          if (json.success) {
            flashStatus(
              confirmModal.type === "delete_letter"
                ? "Private letter erased."
                : "Personal note erased."
            );
            setConfirmModal(null);
            await fetchArchive();
          } else {
            flashError(json.error?.message || "Failed to erase item");
          }
        } else if (confirmModal.type === "remove_saved") {
          const res = await fetch(`/api/archive/saved/${confirmModal.id}`, {
            method: "DELETE",
          });
          const json = await res.json();
          if (json.success) {
            flashStatus("Letter removed from your saved collection.");
            setConfirmModal(null);
            await fetchArchive();
          } else {
            flashError(json.error?.message || "Failed to remove letter");
          }
        }
      } catch (err) {
        console.error("Deletion error:", err);
        flashError("Action failed. Please try again.");
      }
    });
  };

  // -------------------------------------------------------------
  // Private Letter Edit Handlers
  // -------------------------------------------------------------
  const handleUpdateLetter = async (letterId: string) => {
    if (!editLetterContent.trim() || editLetterContent.trim().length < 10) {
      flashError("Letter must contain at least 10 characters.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/letters/${letterId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: editLetterTitle.trim() || undefined,
            content: editLetterContent.trim(),
          }),
        });

        const json = await res.json();
        if (json.success) {
          setEditingLetterId(null);
          flashStatus("Private letter updated.");
          await fetchArchive();
        } else {
          flashError(json.error?.message || "Failed to update letter");
        }
      } catch (err) {
        console.error("Letter update error:", err);
        flashError("Failed to update letter.");
      }
    });
  };

  // -------------------------------------------------------------
  // Saved Letter Reflection Note Handlers
  // -------------------------------------------------------------
  const handleSaveReflection = async (savedRecordId: string) => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/archive/saved/${savedRecordId}/note`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            privateNote: reflectionNoteText.trim() || null,
          }),
        });

        const json = await res.json();
        if (json.success) {
          setEditingSavedNoteId(null);
          setReflectionNoteText("");
          flashStatus(json.message || "Reflection note saved.");
          await fetchArchive();
        } else {
          flashError(json.error?.message || "Failed to save reflection");
        }
      } catch (err) {
        console.error("Reflection note error:", err);
        flashError("Failed to save reflection.");
      }
    });
  };

  const handleClearReflection = async (savedRecordId: string) => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/archive/saved/${savedRecordId}/note`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            privateNote: null,
          }),
        });

        const json = await res.json();
        if (json.success) {
          setEditingSavedNoteId(null);
          setReflectionNoteText("");
          flashStatus("Reflection note removed.");
          await fetchArchive();
        } else {
          flashError(json.error?.message || "Failed to remove reflection");
        }
      } catch (err) {
        console.error("Reflection removal error:", err);
        flashError("Failed to remove reflection.");
      }
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] text-[#23201D] font-sans">
      <Header />

      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-10 sm:py-14">
        {/* Top sanctuary banner */}
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 pb-6 border-b border-[#E8E2D7]">
          <div>
            <h1 className="font-serif text-3xl sm:text-4xl text-[#23201D] font-normal tracking-tight">
              Personal Archive
            </h1>
            <p className="mt-1.5 text-sm text-[#878077] font-serif italic">
              A private ledger of words written, quiet echoes sent, and thoughts held close.
            </p>
          </div>

          {/* Identity info & export */}
          <div className="flex flex-col sm:items-end gap-2 text-xs">
            {data?.identity && (
              <div className="flex items-center gap-2 text-[#57524C]">
                <span className="font-serif italic">Identity:</span>
                <span className="font-mono bg-[#F5F2EB] border border-[#E8E2D7] px-2 py-0.5 rounded-sm text-[#23201D]">
                  {data.identity.unsentId}
                </span>
              </div>
            )}

            {/* Export buttons */}
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => handleExport("markdown")}
                disabled={isExporting || loading}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border border-[#E8E2D7] bg-[#F5F2EB] hover:bg-[#EFECE3] text-[#57524C] hover:text-[#23201D] rounded-sm transition-colors disabled:opacity-50 cursor-pointer"
                title="Download your personal archive in Markdown format"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export .MD</span>
              </button>

              <button
                type="button"
                onClick={() => handleExport("json")}
                disabled={isExporting || loading}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border border-[#E8E2D7] bg-[#F5F2EB] hover:bg-[#EFECE3] text-[#57524C] hover:text-[#23201D] rounded-sm transition-colors disabled:opacity-50 cursor-pointer"
                title="Download your personal archive in JSON format"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </button>
            </div>
          </div>
        </div>

        {/* Status notification alerts */}
        {statusMessage && (
          <div className="mt-4 p-3 rounded-sm bg-[#F5F2EB] border border-[#D5CFC4] text-xs text-[#57524C] flex items-center gap-2 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 p-3 rounded-sm bg-[#FDF2F2] border border-[#F0D5D5] text-xs text-[#9E4747] flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Archive navigation tabs */}
        <div className="mt-8 flex items-center gap-2 sm:gap-3 border-b border-[#E8E2D7] overflow-x-auto pb-px">
          <button
            type="button"
            onClick={() => setActiveTab("letters")}
            className={`flex items-center gap-2 px-3 py-2.5 text-xs sm:text-sm font-medium tracking-wide border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "letters"
                ? "border-[#23201D] text-[#23201D]"
                : "border-transparent text-[#878077] hover:text-[#57524C]"
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>My Letters</span>
            <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-[#EFECE3] text-[#57524C]">
              {data?.counts.letters ?? 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("responses")}
            className={`flex items-center gap-2 px-3 py-2.5 text-xs sm:text-sm font-medium tracking-wide border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "responses"
                ? "border-[#23201D] text-[#23201D]"
                : "border-transparent text-[#878077] hover:text-[#57524C]"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>My Responses</span>
            <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-[#EFECE3] text-[#57524C]">
              {data?.counts.responses ?? 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("saved")}
            className={`flex items-center gap-2 px-3 py-2.5 text-xs sm:text-sm font-medium tracking-wide border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "saved"
                ? "border-[#23201D] text-[#23201D]"
                : "border-transparent text-[#878077] hover:text-[#57524C]"
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Saved Letters</span>
            <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-[#EFECE3] text-[#57524C]">
              {data?.counts.savedLetters ?? 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("notes")}
            className={`flex items-center gap-2 px-3 py-2.5 text-xs sm:text-sm font-medium tracking-wide border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "notes"
                ? "border-[#23201D] text-[#23201D]"
                : "border-transparent text-[#878077] hover:text-[#57524C]"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Personal Notes</span>
            <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-[#EFECE3] text-[#57524C]">
              {data?.counts.notes ?? 0}
            </span>
          </button>
        </div>

        {/* Tab Content Areas */}
        <div className="mt-8">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-[#878077]">
              <Clock className="w-6 h-6 animate-spin text-[#A8A196] mb-3" />
              <p className="font-serif italic text-sm">Quietly opening your archive...</p>
            </div>
          ) : (
            <>
              {/* TAB 1: MY LETTERS */}
              {activeTab === "letters" && (
                <LettersSection
                  letters={data?.letters || []}
                  editingLetterId={editingLetterId}
                  editLetterTitle={editLetterTitle}
                  editLetterContent={editLetterContent}
                  setEditingLetterId={setEditingLetterId}
                  setEditLetterTitle={setEditLetterTitle}
                  setEditLetterContent={setEditLetterContent}
                  handleUpdateLetter={handleUpdateLetter}
                  onDeleteClick={(letter) =>
                    setConfirmModal({
                      type: "delete_letter",
                      id: letter.id,
                      title: "Erase Private Letter",
                      description: `Are you sure you want to permanently delete “${
                        letter.title || "Untitled"
                      }”? This action cannot be undone.`,
                    })
                  }
                  isPending={isPending}
                />
              )}

              {/* TAB 2: MY RESPONSES */}
              {activeTab === "responses" && (
                <ResponsesSection responses={data?.responses || []} />
              )}

              {/* TAB 3: SAVED LETTERS */}
              {activeTab === "saved" && (
                <SavedLettersSection
                  savedLetters={data?.savedLetters || []}
                  editingSavedNoteId={editingSavedNoteId}
                  reflectionNoteText={reflectionNoteText}
                  setEditingSavedNoteId={setEditingSavedNoteId}
                  setReflectionNoteText={setReflectionNoteText}
                  handleSaveReflection={handleSaveReflection}
                  handleClearReflection={handleClearReflection}
                  onRemoveClick={(saved) =>
                    setConfirmModal({
                      type: "remove_saved",
                      id: saved.id,
                      title: "Remove Saved Letter",
                      description: `Remove “${
                        saved.letter.title || "this letter"
                      }” from your saved collection? Your private reflection will also be removed.`,
                    })
                  }
                  isPending={isPending}
                />
              )}

              {/* TAB 4: PERSONAL NOTES */}
              {activeTab === "notes" && (
                <NotesSection
                  notes={data?.notes || []}
                  isCreatingNote={isCreatingNote}
                  setIsCreatingNote={setIsCreatingNote}
                  noteTitle={noteTitle}
                  setNoteTitle={setNoteTitle}
                  noteContent={noteContent}
                  setNoteContent={setNoteContent}
                  noteTags={noteTags}
                  setNoteTags={setNoteTags}
                  editingNoteId={editingNoteId}
                  setEditingNoteId={setEditingNoteId}
                  handleSaveNewNote={handleSaveNewNote}
                  handleUpdateNote={handleUpdateNote}
                  onDeleteClick={(note) =>
                    setConfirmModal({
                      type: "delete_note",
                      id: note.id,
                      title: "Erase Personal Note",
                      description: `Are you sure you want to delete this note? It will be permanently erased from your archive.`,
                    })
                  }
                  isPending={isPending}
                />
              )}
            </>
          )}
        </div>
      </main>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-[#23201D]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FBF9F5] border border-[#E8E2D7] rounded-sm p-6 max-w-md w-full shadow-lg">
            <h3 className="font-serif text-lg text-[#23201D]">{confirmModal.title}</h3>
            <p className="mt-2 text-xs sm:text-sm text-[#57524C] leading-relaxed">
              {confirmModal.description}
            </p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                disabled={isPending}
                className="px-3.5 py-1.5 text-xs text-[#57524C] hover:text-[#23201D] border border-[#E8E2D7] bg-[#F5F2EB] hover:bg-[#EFECE3] rounded-sm transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirmed}
                disabled={isPending}
                className="px-3.5 py-1.5 text-xs text-white bg-[#9E4747] hover:bg-[#853838] rounded-sm transition-colors cursor-pointer font-medium"
              >
                {isPending ? "Erasing..." : "Confirm Erase"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

// =========================================================================
// SUB-SECTIONS
// =========================================================================

/**
 * Section: My Letters
 */
function LettersSection({
  letters,
  editingLetterId,
  editLetterTitle,
  editLetterContent,
  setEditingLetterId,
  setEditLetterTitle,
  setEditLetterContent,
  handleUpdateLetter,
  onDeleteClick,
  isPending,
}: {
  letters: ArchiveLetterItem[];
  editingLetterId: string | null;
  editLetterTitle: string;
  editLetterContent: string;
  setEditingLetterId: (id: string | null) => void;
  setEditLetterTitle: (t: string) => void;
  setEditLetterContent: (c: string) => void;
  handleUpdateLetter: (id: string) => void;
  onDeleteClick: (letter: ArchiveLetterItem) => void;
  isPending: boolean;
}) {
  if (letters.length === 0) {
    return (
      <div className="text-center py-16 px-4 border border-dashed border-[#E8E2D7] rounded-sm bg-[#F5F2EB]/30">
        <p className="font-serif italic text-base text-[#57524C]">
          “The blank page is where everything begins.”
        </p>
        <p className="mt-2 text-xs text-[#878077] max-w-sm mx-auto">
          You have not written any letters yet. When you write into the quiet, your private letters
          and Orbit submissions will rest safely here.
        </p>
        <div className="mt-6">
          <Link
            href="/compose"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs text-[#23201D] border border-[#23201D]/30 hover:border-[#23201D]/60 bg-[#F5F2EB] hover:bg-[#EFECE3] rounded-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Write your first letter</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {letters.map((letter) => {
        const isEditing = editingLetterId === letter.id;
        const isPrivate = letter.visibility === "PRIVATE";
        const isHeld = letter.moderationStatus === "HELD" || (letter.isModerated && letter.moderationStatus !== "REMOVED" && letter.moderationStatus !== "REJECTED");
        const isOrbit = letter.visibility === "PUBLIC" && !letter.isModerated && letter.moderationStatus === "APPROVED";
        const isRejected = letter.moderationStatus === "REJECTED";
        const isRemoved = letter.moderationStatus === "REMOVED";

        return (
          <article
            key={letter.id}
            className="border border-[#E8E2D7] bg-[#FDFBF7] p-5 sm:p-7 rounded-sm shadow-xs transition-all hover:border-[#D5CFC4]"
          >
            {/* Header: Recipient, Title, Status badge */}
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-3 border-b border-[#E8E2D7]/60">
              <div>
                <p className="font-serif italic text-xs text-[#878077]">
                  To:{" "}
                  <span className="font-sans text-[#57524C] font-medium not-italic">
                    {letter.recipientName || "Someone unknown"}
                  </span>
                </p>
                <h3 className="font-serif text-lg sm:text-xl text-[#23201D] mt-0.5">
                  {letter.title || "Untitled Letter"}
                </h3>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2">
                {isPrivate && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-sm bg-[#F5F2EB] text-[#57524C] border border-[#E8E2D7]">
                    <Lock className="w-3 h-3 text-[#878077]" />
                    <span>Private Sanctuary</span>
                  </span>
                )}

                {isOrbit && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-sm bg-[#EEF5EF] text-[#2F613A] border border-[#D1E6D6]">
                    <Globe className="w-3 h-3 text-[#2F613A]" />
                    <span>In Orbit</span>
                  </span>
                )}

                {isHeld && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-sm bg-[#FDF3E7] text-[#9E6219] border border-[#F5DCB7]">
                    <Clock className="w-3 h-3 text-[#9E6219]" />
                    <span>Awaiting Moderation</span>
                  </span>
                )}

                {isRejected && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-sm bg-[#FDF2F2] text-[#9E4747] border border-[#F0D5D5]">
                    <ShieldAlert className="w-3 h-3 text-[#9E4747]" />
                    <span>Rejected by Moderation</span>
                  </span>
                )}

                {isRemoved && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-sm bg-[#FDF2F2] text-[#9E4747] border border-[#F0D5D5]">
                    <ShieldAlert className="w-3 h-3 text-[#9E4747]" />
                    <span>Removed from Orbit</span>
                  </span>
                )}
              </div>
            </div>

            {/* Held letter alert banner */}
            {isHeld && (
              <div className="mt-3 p-3 bg-[#FAF5EE] border border-[#ECDDC8] text-xs text-[#7A5320] rounded-sm flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-[#9E6219]" />
                <div>
                  <p className="font-medium">Held for Sanctuary Review</p>
                  <p className="mt-0.5 text-[#87663A]">
                    {letter.moderationReason ||
                      "This letter is undergoing quiet review because it may contain contact information or identifying details."}{" "}
                    It remains private and will not appear in Orbit until reviewed by a steward.
                  </p>
                </div>
              </div>
            )}

            {/* Content Body or Edit Area */}
            {isEditing ? (
              <div className="mt-4 space-y-3">
                <input
                  type="text"
                  value={editLetterTitle}
                  onChange={(e) => setEditLetterTitle(e.target.value)}
                  placeholder="Letter Title (optional)"
                  className="w-full text-sm font-serif px-3 py-1.5 border border-[#E8E2D7] rounded-sm bg-white focus:outline-hidden focus:border-[#23201D]"
                />
                <textarea
                  value={editLetterContent}
                  onChange={(e) => setEditLetterContent(e.target.value)}
                  rows={6}
                  className="w-full text-sm font-serif px-3 py-2 border border-[#E8E2D7] rounded-sm bg-white focus:outline-hidden focus:border-[#23201D] leading-relaxed resize-y"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingLetterId(null)}
                    disabled={isPending}
                    className="px-3 py-1 text-xs text-[#57524C] border border-[#E8E2D7] bg-[#F5F2EB] hover:bg-[#EFECE3] rounded-sm cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateLetter(letter.id)}
                    disabled={isPending}
                    className="px-3 py-1 text-xs text-white bg-[#23201D] hover:bg-[#3D3833] rounded-sm cursor-pointer font-medium"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-[#38342F] font-serif leading-relaxed whitespace-pre-line line-clamp-6">
                {letter.content}
              </p>
            )}

            {/* Footer: Date, tags, and actions */}
            <div className="mt-5 pt-3 border-t border-[#E8E2D7]/50 flex flex-wrap items-center justify-between gap-3 text-xs text-[#878077]">
              <div className="flex items-center gap-3">
                <span>Written on {new Date(letter.createdAt).toLocaleDateString()}</span>
                {letter.theme && (
                  <span className="italic font-serif text-[#57524C]">#{letter.theme}</span>
                )}
                {letter.tags.length > 0 && (
                  <span className="text-[#878077]">
                    {letter.tags.map((t) => `#${t}`).join(" ")}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                {isOrbit && (
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-[#878077] italic font-serif">
                      Immutable in Orbit
                    </span>
                    <Link
                      href={`/orbit/${letter.id}`}
                      className="inline-flex items-center gap-1 text-xs text-[#23201D] hover:underline underline-offset-4 font-medium"
                    >
                      <span>View in Orbit</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                )}

                {isPrivate && !isEditing && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingLetterId(letter.id);
                        setEditLetterTitle(letter.title || "");
                        setEditLetterContent(letter.content);
                      }}
                      className="inline-flex items-center gap-1 text-[#57524C] hover:text-[#23201D] cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteClick(letter)}
                      className="inline-flex items-center gap-1 text-[#9E4747] hover:text-[#7A3030] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Erase</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/**
 * Section: My Responses
 */
function ResponsesSection({ responses }: { responses: ArchiveResponseItem[] }) {
  if (responses.length === 0) {
    return (
      <div className="text-center py-16 px-4 border border-dashed border-[#E8E2D7] rounded-sm bg-[#F5F2EB]/30">
        <p className="font-serif italic text-base text-[#57524C]">
          “An echo is words that return gently.”
        </p>
        <p className="mt-2 text-xs text-[#878077] max-w-sm mx-auto">
          You have not whispered any responses yet. While reading in Orbit, you can leave quiet
          standalone echoes beneath public letters.
        </p>
        <div className="mt-6">
          <Link
            href="/orbit"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs text-[#23201D] border border-[#23201D]/30 hover:border-[#23201D]/60 bg-[#F5F2EB] hover:bg-[#EFECE3] rounded-sm transition-all"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Read in Orbit</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="p-3 bg-[#F5F2EB] border border-[#E8E2D7] rounded-sm text-xs text-[#57524C]">
        <p>
          <strong className="font-medium">Sanctuary Anonymity:</strong> Your responses are
          displayed here for your personal record. On Orbit, they remain strictly anonymous and will
          never expose your identity.
        </p>
      </div>

      {responses.map((resp) => {
        const isOrbitAccessible =
          resp.parentLetter &&
          resp.parentLetter.visibility === "PUBLIC" &&
          !resp.parentLetter.isModerated;

        const isHeld = resp.moderationStatus === "HELD" || (resp.isModerated && resp.moderationStatus !== "REMOVED" && resp.moderationStatus !== "REJECTED");
        const isApproved = !resp.isModerated && resp.moderationStatus === "APPROVED";
        const isRejected = resp.moderationStatus === "REJECTED";
        const isRemoved = resp.moderationStatus === "REMOVED";

        return (
          <article
            key={resp.id}
            className="border border-[#E8E2D7] bg-[#FDFBF7] p-5 sm:p-6 rounded-sm shadow-xs"
          >
            {/* Header: Link to parent letter & status */}
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-3 border-b border-[#E8E2D7]/60">
              <div>
                <p className="text-xs text-[#878077] font-serif italic">
                  Echo attached to letter:
                </p>
                {isOrbitAccessible ? (
                  <Link
                    href={`/orbit/${resp.parentLetterId}`}
                    className="inline-flex items-center gap-1.5 font-serif text-base text-[#23201D] hover:underline underline-offset-4 mt-0.5"
                  >
                    <span>
                      {resp.parentLetter?.title || "Orbit Letter"}{" "}
                      {resp.parentLetter?.recipientName
                        ? `(for ${resp.parentLetter.recipientName})`
                        : ""}
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#878077]" />
                  </Link>
                ) : (
                  <span className="font-serif text-base text-[#878077] italic">
                    Original letter no longer available in Orbit
                  </span>
                )}
              </div>

              {/* Status Badge */}
              <div>
                {isApproved && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-sm bg-[#EEF5EF] text-[#2F613A] border border-[#D1E6D6]">
                    <Globe className="w-3 h-3 text-[#2F613A]" />
                    <span>In Orbit</span>
                  </span>
                )}

                {isHeld && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-sm bg-[#FDF3E7] text-[#9E6219] border border-[#F5DCB7]">
                    <Clock className="w-3 h-3 text-[#9E6219]" />
                    <span>Awaiting Moderation</span>
                  </span>
                )}

                {isRejected && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-sm bg-[#FDF2F2] text-[#9E4747] border border-[#F0D5D5]">
                    <ShieldAlert className="w-3 h-3 text-[#9E4747]" />
                    <span>Rejected</span>
                  </span>
                )}

                {isRemoved && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-sm bg-[#FDF2F2] text-[#9E4747] border border-[#F0D5D5]">
                    <ShieldAlert className="w-3 h-3 text-[#9E4747]" />
                    <span>Removed</span>
                  </span>
                )}
              </div>
            </div>

            {/* Held note if applicable */}
            {isHeld && (
              <div className="mt-3 p-2.5 bg-[#FAF5EE] border border-[#ECDDC8] text-xs text-[#7A5320] rounded-sm">
                <span>
                  {resp.moderationReason ||
                    "This response is undergoing quiet review before appearing publicly in Orbit."}
                </span>
              </div>
            )}

            {/* Response Content */}
            <div className="mt-4 pl-3.5 border-l-2 border-[#D5CFC4]">
              <p className="text-sm font-serif text-[#38342F] leading-relaxed whitespace-pre-line">
                {resp.content}
              </p>
            </div>

            {/* Timestamp */}
            <div className="mt-4 pt-2 border-t border-[#E8E2D7]/50 text-right text-[11px] text-[#878077]">
              <span>Sent on {new Date(resp.createdAt).toLocaleDateString()}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/**
 * Section: Saved Letters
 */
function SavedLettersSection({
  savedLetters,
  editingSavedNoteId,
  reflectionNoteText,
  setEditingSavedNoteId,
  setReflectionNoteText,
  handleSaveReflection,
  handleClearReflection,
  onRemoveClick,
  isPending,
}: {
  savedLetters: ArchiveSavedLetterItem[];
  editingSavedNoteId: string | null;
  reflectionNoteText: string;
  setEditingSavedNoteId: (id: string | null) => void;
  setReflectionNoteText: (t: string) => void;
  handleSaveReflection: (id: string) => void;
  handleClearReflection: (id: string) => void;
  onRemoveClick: (saved: ArchiveSavedLetterItem) => void;
  isPending: boolean;
}) {
  if (savedLetters.length === 0) {
    return (
      <div className="text-center py-16 px-4 border border-dashed border-[#E8E2D7] rounded-sm bg-[#F5F2EB]/30">
        <p className="font-serif italic text-base text-[#57524C]">
          “Some letters speak so softly they stay with you.”
        </p>
        <p className="mt-2 text-xs text-[#878077] max-w-sm mx-auto">
          Your saved collection is empty. While reading letters in Orbit, click the quiet save icon
          to keep them here along with your personal reflections.
        </p>
        <div className="mt-6">
          <Link
            href="/orbit"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs text-[#23201D] border border-[#23201D]/30 hover:border-[#23201D]/60 bg-[#F5F2EB] hover:bg-[#EFECE3] rounded-sm transition-all"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Discover letters in Orbit</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {savedLetters.map((saved) => {
        const isEditingNote = editingSavedNoteId === saved.id;

        return (
          <article
            key={saved.id}
            className="border border-[#E8E2D7] bg-[#FDFBF7] p-5 sm:p-7 rounded-sm shadow-xs"
          >
            {/* Header: Title, Recipient, Orbit Link */}
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-3 border-b border-[#E8E2D7]/60">
              <div>
                <p className="font-serif italic text-xs text-[#878077]">
                  To:{" "}
                  <span className="font-sans text-[#57524C] font-medium not-italic">
                    {saved.letter.recipientName || "Someone unknown"}
                  </span>
                </p>
                <h3 className="font-serif text-lg sm:text-xl text-[#23201D] mt-0.5">
                  {saved.letter.title || "Untitled Letter"}
                </h3>
              </div>

              <div className="flex items-center gap-3">
                {saved.letter.isOrbitAccessible && (
                  <Link
                    href={`/orbit/${saved.letter.id}`}
                    className="inline-flex items-center gap-1 text-xs text-[#23201D] hover:underline underline-offset-4 font-medium"
                  >
                    <span>Read in Orbit</span>
                    <ExternalLink className="w-3 h-3 text-[#878077]" />
                  </Link>
                )}

                <button
                  type="button"
                  onClick={() => onRemoveClick(saved)}
                  className="text-xs text-[#9E4747] hover:text-[#7A3030] cursor-pointer inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Remove</span>
                </button>
              </div>
            </div>

            {/* Letter Content Excerpt */}
            <p className="mt-4 text-sm text-[#38342F] font-serif leading-relaxed line-clamp-4 whitespace-pre-line">
              {saved.letter.content}
            </p>

            {/* Metadata */}
            <div className="mt-3 text-[11px] text-[#878077] flex items-center gap-3">
              <span>Saved on {new Date(saved.savedAt).toLocaleDateString()}</span>
              {saved.letter.theme && (
                <span className="italic font-serif text-[#57524C]">#{saved.letter.theme}</span>
              )}
            </div>

            {/* Private Reflection Note Section */}
            <div className="mt-5 pt-4 border-t border-[#E8E2D7]/60">
              <div className="bg-[#FAF7F0] border border-[#E8E2D7] p-4 rounded-sm">
                <div className="flex items-center justify-between pb-2 border-b border-[#E8E2D7]/40 text-xs">
                  <div className="flex items-center gap-1.5 text-[#57524C] font-serif italic">
                    <Sparkles className="w-3.5 h-3.5 text-[#A8A196]" />
                    <span>Your Private Reflection:</span>
                  </div>

                  {!isEditingNote && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSavedNoteId(saved.id);
                          setReflectionNoteText(saved.privateNote || "");
                        }}
                        className="inline-flex items-center gap-1 text-xs text-[#57524C] hover:text-[#23201D] cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>{saved.privateNote ? "Edit" : "Add Reflection"}</span>
                      </button>

                      {saved.privateNote && (
                        <button
                          type="button"
                          onClick={() => handleClearReflection(saved.id)}
                          disabled={isPending}
                          className="inline-flex items-center gap-1 text-xs text-[#9E4747] hover:text-[#7A3030] cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                          <span>Clear</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Reflection Note Body or Editor */}
                {isEditingNote ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={reflectionNoteText}
                      onChange={(e) => setReflectionNoteText(e.target.value)}
                      placeholder="Write your private thoughts or why you held onto this letter..."
                      rows={3}
                      maxLength={3000}
                      className="w-full text-xs sm:text-sm font-serif px-3 py-2 border border-[#E8E2D7] rounded-sm bg-white focus:outline-hidden focus:border-[#23201D] leading-relaxed resize-y"
                    />
                    <div className="flex items-center justify-between text-[11px] text-[#878077]">
                      <span>{reflectionNoteText.length} / 3000</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingSavedNoteId(null)}
                          disabled={isPending}
                          className="px-2.5 py-1 text-xs border border-[#E8E2D7] bg-[#F5F2EB] hover:bg-[#EFECE3] rounded-sm cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveReflection(saved.id)}
                          disabled={isPending}
                          className="px-2.5 py-1 text-xs text-white bg-[#23201D] hover:bg-[#3D3833] rounded-sm cursor-pointer font-medium"
                        >
                          Save Reflection
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-xs sm:text-sm font-serif text-[#38342F] italic leading-relaxed">
                    {saved.privateNote ? (
                      <p className="whitespace-pre-line">“{saved.privateNote}”</p>
                    ) : (
                      <p className="text-[#878077] not-italic text-xs">
                        No private reflection attached yet. Only you can see reflections saved here.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/**
 * Section: Personal Notes
 */
function NotesSection({
  notes,
  isCreatingNote,
  setIsCreatingNote,
  noteTitle,
  setNoteTitle,
  noteContent,
  setNoteContent,
  noteTags,
  setNoteTags,
  editingNoteId,
  setEditingNoteId,
  handleSaveNewNote,
  handleUpdateNote,
  onDeleteClick,
  isPending,
}: {
  notes: ArchiveNoteItem[];
  isCreatingNote: boolean;
  setIsCreatingNote: (b: boolean) => void;
  noteTitle: string;
  setNoteTitle: (t: string) => void;
  noteContent: string;
  setNoteContent: (c: string) => void;
  noteTags: string;
  setNoteTags: (t: string) => void;
  editingNoteId: string | null;
  setEditingNoteId: (id: string | null) => void;
  handleSaveNewNote: () => void;
  handleUpdateNote: (id: string) => void;
  onDeleteClick: (note: ArchiveNoteItem) => void;
  isPending: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* Top action bar: Create new note button */}
      <div className="flex items-center justify-between pb-2">
        <p className="text-xs text-[#878077] font-serif italic">
          Private notes are strictly confidential to your identity and never published.
        </p>

        {!isCreatingNote && (
          <button
            type="button"
            onClick={() => {
              setIsCreatingNote(true);
              setNoteTitle("");
              setNoteContent("");
              setNoteTags("");
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#23201D] border border-[#23201D]/30 hover:border-[#23201D]/60 bg-[#F5F2EB] hover:bg-[#EFECE3] rounded-sm transition-all cursor-pointer font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Note</span>
          </button>
        )}
      </div>

      {/* Inline Note Creator */}
      {isCreatingNote && (
        <div className="border border-[#23201D]/30 bg-white p-5 rounded-sm shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-serif text-base text-[#23201D]">New Personal Note</h4>
            <button
              type="button"
              onClick={() => setIsCreatingNote(false)}
              className="text-[#878077] hover:text-[#23201D] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <input
            type="text"
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            placeholder="Title (optional)"
            className="w-full text-sm font-serif px-3 py-2 border border-[#E8E2D7] rounded-sm bg-[#FDFBF7] focus:outline-hidden focus:border-[#23201D]"
          />

          <textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder="Write your private note, thoughts, or reflections..."
            rows={4}
            maxLength={5000}
            className="w-full text-sm font-serif px-3 py-2 border border-[#E8E2D7] rounded-sm bg-[#FDFBF7] focus:outline-hidden focus:border-[#23201D] leading-relaxed resize-y"
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <input
              type="text"
              value={noteTags}
              onChange={(e) => setNoteTags(e.target.value)}
              placeholder="Tags (comma separated, max 5)"
              className="text-xs px-2.5 py-1.5 border border-[#E8E2D7] rounded-sm bg-[#FDFBF7] w-full sm:w-64 focus:outline-hidden focus:border-[#23201D]"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreatingNote(false)}
                disabled={isPending}
                className="px-3 py-1.5 text-xs text-[#57524C] border border-[#E8E2D7] bg-[#F5F2EB] hover:bg-[#EFECE3] rounded-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNewNote}
                disabled={isPending || !noteContent.trim()}
                className="px-3.5 py-1.5 text-xs text-white bg-[#23201D] hover:bg-[#3D3833] rounded-sm cursor-pointer font-medium disabled:opacity-50"
              >
                {isPending ? "Saving..." : "Save Note"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes List */}
      {notes.length === 0 && !isCreatingNote ? (
        <div className="text-center py-16 px-4 border border-dashed border-[#E8E2D7] rounded-sm bg-[#F5F2EB]/30">
          <p className="font-serif italic text-base text-[#57524C]">
            “A notebook is a room of one’s own.”
          </p>
          <p className="mt-2 text-xs text-[#878077] max-w-sm mx-auto">
            No personal notes recorded yet. Notes are private to your anonymous identity and are
            never shared.
          </p>
        </div>
      ) : (
        notes.map((note) => {
          const isEditing = editingNoteId === note.id;

          return (
            <article
              key={note.id}
              className="border border-[#E8E2D7] bg-[#FDFBF7] p-5 sm:p-6 rounded-sm shadow-xs"
            >
              {isEditing ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    placeholder="Title (optional)"
                    className="w-full text-sm font-serif px-3 py-1.5 border border-[#E8E2D7] rounded-sm bg-white focus:outline-hidden focus:border-[#23201D]"
                  />
                  <textarea
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    rows={4}
                    maxLength={5000}
                    className="w-full text-sm font-serif px-3 py-2 border border-[#E8E2D7] rounded-sm bg-white focus:outline-hidden focus:border-[#23201D] leading-relaxed resize-y"
                  />
                  <input
                    type="text"
                    value={noteTags}
                    onChange={(e) => setNoteTags(e.target.value)}
                    placeholder="Tags (comma separated, max 5)"
                    className="text-xs px-2.5 py-1 border border-[#E8E2D7] rounded-sm bg-white w-full sm:w-64 focus:outline-hidden focus:border-[#23201D]"
                  />
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingNoteId(null)}
                      disabled={isPending}
                      className="px-3 py-1 text-xs text-[#57524C] border border-[#E8E2D7] bg-[#F5F2EB] hover:bg-[#EFECE3] rounded-sm cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateNote(note.id)}
                      disabled={isPending}
                      className="px-3.5 py-1 text-xs text-white bg-[#23201D] hover:bg-[#3D3833] rounded-sm cursor-pointer font-medium"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline justify-between gap-2 pb-2 border-b border-[#E8E2D7]/60">
                    <h3 className="font-serif text-lg text-[#23201D]">
                      {note.title || "Untitled Note"}
                    </h3>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNoteId(note.id);
                          setNoteTitle(note.title || "");
                          setNoteContent(note.content);
                          setNoteTags(note.tags.join(", "));
                        }}
                        className="inline-flex items-center gap-1 text-xs text-[#57524C] hover:text-[#23201D] cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteClick(note)}
                        className="inline-flex items-center gap-1 text-xs text-[#9E4747] hover:text-[#7A3030] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Erase</span>
                      </button>
                    </div>
                  </div>

                  <p className="mt-3 text-sm text-[#38342F] font-serif leading-relaxed whitespace-pre-line">
                    {note.content}
                  </p>

                  <div className="mt-4 pt-2 border-t border-[#E8E2D7]/50 flex items-center justify-between text-[11px] text-[#878077]">
                    <span>Saved on {new Date(note.createdAt).toLocaleDateString()}</span>
                    {note.tags.length > 0 && (
                      <span>{note.tags.map((t) => `#${t}`).join(" ")}</span>
                    )}
                  </div>
                </>
              )}
            </article>
          );
        })
      )}
    </div>
  );
}
