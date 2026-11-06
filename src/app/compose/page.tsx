"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import Link from "next/link";
import { Header } from "@/components/ui/Header";
import { Footer } from "@/components/ui/Footer";
import { RecoveryCredentialModal } from "@/components/ui/RecoveryCredentialModal";
import { APPROVED_THEMES, type Theme } from "@/lib/constants/themes";
import { Lock, Globe, FileText, CheckCircle2, AlertCircle, Trash2, Edit3, ShieldAlert } from "lucide-react";

type WritingMode = "PRIVATE_LETTER" | "PUBLIC_LETTER" | "PERSONAL_NOTE";

interface SavedItem {
  id: string;
  title: string | null;
  recipientName: string | null;
  content: string;
  theme?: string | null;
  entryType: "LETTER" | "NOTE";
  visibility: "PRIVATE" | "PUBLIC";
  isModerated?: boolean;
  moderationReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function ComposePage() {
  const [mode, setMode] = useState<WritingMode>("PRIVATE_LETTER");
  const [recipient, setRecipient] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [theme, setTheme] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error" | "held">("idle");
  const [statusMessage, setStatusMessage] = useState("Draft saved locally");

  // Active identity state
  const [unsentId, setUnsentId] = useState<string | null>(null);
  const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  // User's existing items
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [activeEditingId, setActiveEditingId] = useState<string | null>(null);

  // Public confirm modal
  const [showPublicConfirm, setShowPublicConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const getDraftKey = useCallback(
    (targetMode: WritingMode) => `unsent_draft_${targetMode.toLowerCase()}`,
    []
  );

  // Load session, initial draft, and saved items on initial mount
  useEffect(() => {
    async function initSessionAndData() {
      try {
        const authRes = await fetch("/api/auth/me");
        const authJson = await authRes.json();
        if (authJson.success && authJson.data) {
          setUnsentId(authJson.data.unsentId);
          if (authJson.data.newRecoveryKey) {
            setNewRecoveryKey(authJson.data.newRecoveryKey);
            setShowRecoveryModal(true);
          }
        }

        const lettersRes = await fetch("/api/letters");
        const lettersJson = await lettersRes.json();
        if (lettersJson.success && Array.isArray(lettersJson.data)) {
          setSavedItems(lettersJson.data);
        }

        // Restore initial draft for default mode
        const saved = localStorage.getItem("unsent_draft_private_letter");
        if (saved) {
          const parsed = JSON.parse(saved);
          setRecipient(parsed.recipient || "");
          setTitle(parsed.title || "");
          setContent(parsed.content || "");
          setTheme(parsed.theme || "");
          setStatusMessage("Draft restored from previous visit");
        }
      } catch (err) {
        console.error("Initialization error:", err);
      }
    }

    initSessionAndData();
  }, []);

  // Handle mode switching
  const handleSwitchMode = (newMode: WritingMode) => {
    setActiveEditingId(null);
    setMode(newMode);

    try {
      const saved = localStorage.getItem(getDraftKey(newMode));
      if (saved) {
        const parsed = JSON.parse(saved);
        setRecipient(parsed.recipient || "");
        setTitle(parsed.title || "");
        setContent(parsed.content || "");
        setTheme(parsed.theme || "");
        setStatusMessage("Draft restored from previous visit");
      } else {
        setRecipient("");
        setTitle("");
        setContent("");
        setTheme("");
        setStatusMessage("Ready to write");
      }
    } catch {
      // LocalStorage access error
    }
  };

  // Autosave to localStorage on typing
  useEffect(() => {
    if (activeEditingId) return; // Do not overwrite mode draft when editing a saved item

    const timeout = setTimeout(() => {
      try {
        if (content.trim() || recipient.trim() || title.trim() || theme) {
          localStorage.setItem(
            getDraftKey(mode),
            JSON.stringify({ recipient, title, content, theme, updatedAt: Date.now() })
          );
          setSaveStatus("saved");
          setStatusMessage("Draft saved locally");
        }
      } catch {
        // LocalStorage quota or access error
      }
    }, 400);

    return () => clearTimeout(timeout);
  }, [recipient, title, content, theme, mode, activeEditingId, getDraftKey]);

  const handleClearDraft = () => {
    if (window.confirm("Clear this draft? Your written text will be cleared.")) {
      setRecipient("");
      setTitle("");
      setContent("");
      setTheme("");
      setActiveEditingId(null);
      localStorage.removeItem(getDraftKey(mode));
      setStatusMessage("Draft cleared");
    }
  };

  const handleSaveOrPublish = async () => {
    if (mode === "PUBLIC_LETTER" && !showPublicConfirm) {
      setShowPublicConfirm(true);
      return;
    }

    setShowPublicConfirm(false);
    setSaveStatus("saving");
    setStatusMessage("Saving to sanctuary...");

    const payload = {
      title: title.trim() || undefined,
      recipientName: mode === "PERSONAL_NOTE" ? undefined : recipient.trim() || undefined,
      content: content.trim(),
      theme: mode === "PERSONAL_NOTE" ? undefined : theme || undefined,
      visibility: mode === "PUBLIC_LETTER" ? "PUBLIC" : "PRIVATE",
      entryType: mode === "PERSONAL_NOTE" ? "NOTE" : "LETTER",
    };

    startTransition(async () => {
      try {
        let res: Response;
        if (activeEditingId) {
          res = await fetch(`/api/letters/${activeEditingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: payload.title,
              content: payload.content,
              theme: payload.theme,
            }),
          });
        } else {
          res = await fetch("/api/letters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }

        const json = await res.json();
        if (json.success) {
          if (json.message) {
            // Held for moderation review
            setSaveStatus("held");
            setStatusMessage(json.message);
          } else {
            setSaveStatus("saved");
            setStatusMessage(
              mode === "PUBLIC_LETTER"
                ? "Letter released into Orbit anonymously"
                : activeEditingId
                ? "Changes saved"
                : "Saved to your private space"
            );
          }

          localStorage.removeItem(getDraftKey(mode));

          if (!activeEditingId) {
            setRecipient("");
            setTitle("");
            setContent("");
            setTheme("");
          }
          setActiveEditingId(null);

          const refreshRes = await fetch("/api/letters");
          const refreshJson = await refreshRes.json();
          if (refreshJson.success && Array.isArray(refreshJson.data)) {
            setSavedItems(refreshJson.data);
          }
        } else {
          setSaveStatus("error");
          setStatusMessage(json.error?.message || "Failed to save");
        }
      } catch (err) {
        console.error("Save error:", err);
        setSaveStatus("error");
        setStatusMessage("Network error while saving");
      }
    });
  };

  const handleEditItem = (item: SavedItem) => {
    if (item.visibility === "PUBLIC") {
      alert("Published public letters cannot be edited once released into Orbit.");
      return;
    }

    setActiveEditingId(item.id);
    setMode(item.entryType === "NOTE" ? "PERSONAL_NOTE" : "PRIVATE_LETTER");
    setRecipient(item.recipientName || "");
    setTitle(item.title || "");
    setContent(item.content);
    setTheme(item.theme || "");
    setStatusMessage(`Editing saved ${item.entryType === "NOTE" ? "note" : "letter"}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteItem = async (item: SavedItem) => {
    if (item.visibility === "PUBLIC") {
      alert("Published public letters cannot be deleted by authors.");
      return;
    }

    if (!window.confirm("Permanently delete this item from your private space?")) return;

    try {
      const res = await fetch(`/api/letters/${item.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setSavedItems((prev) => prev.filter((i) => i.id !== item.id));
        if (activeEditingId === item.id) {
          setActiveEditingId(null);
          setRecipient("");
          setTitle("");
          setContent("");
          setTheme("");
        }
      } else {
        alert(json.error?.message || "Failed to delete");
      }
    } catch {
      alert("Error deleting item");
    }
  };

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] paper-grain selection:bg-[#EEDCDA]">
      <Header />

      {showRecoveryModal && newRecoveryKey && unsentId && (
        <RecoveryCredentialModal
          unsentId={unsentId}
          recoveryKey={newRecoveryKey}
          onDismiss={() => setShowRecoveryModal(false)}
        />
      )}

      {/* Public Letter Release Confirmation Dialog */}
      {showPublicConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#23201D]/45 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="public-confirm-title"
        >
          <div className="w-full max-w-md bg-[#FBF9F5] border border-[#E8E2D7] rounded-sm p-7 shadow-2xl">
            <div className="flex items-center gap-2.5 text-[#C27D77] mb-3">
              <Globe className="w-5 h-5 stroke-[1.5]" />
              <span id="public-confirm-title" className="font-serif italic text-base text-[#23201D]">
                Releasing into Orbit
              </span>
            </div>

            <p className="text-xs text-[#57524C] leading-relaxed mb-6 font-sans">
              This letter will be published completely anonymously into Orbit.
              <strong className="text-[#23201D] block mt-2">
                Important: Once released, public letters cannot be edited or erased by their authors. All submissions are automatically screened for personal identifying information to protect anonymity.
              </strong>
            </p>

            <div className="flex justify-end gap-3 pt-3 border-t border-[#E8E2D7]">
              <button
                type="button"
                onClick={() => setShowPublicConfirm(false)}
                className="px-4 py-2 rounded-sm border border-[#E8E2D7] text-xs font-medium text-[#57524C] hover:bg-[#F5F2EB] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleSaveOrPublish}
                className="px-5 py-2 rounded-sm bg-[#23201D] hover:bg-[#38332E] text-[#FBF9F5] text-xs font-medium tracking-wide cursor-pointer disabled:opacity-50"
              >
                {isPending ? "Releasing..." : "Confirm & Release"}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-3xl mx-auto px-6 py-12 w-full flex flex-col">
        {/* Identity Indicator & Mode Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-[#E8E2D7] pb-5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#C27D77]" />
            <span className="text-xs font-mono text-[#878077]">
              Writing as: <strong className="text-[#23201D] font-medium">{unsentId || "Anonymous"}</strong>
            </span>
            <Link
              href="/recover"
              className="text-[11px] text-[#C27D77] hover:underline underline-offset-4 ml-2"
            >
              Restore previous key
            </Link>
          </div>

          <div className="inline-flex rounded-sm bg-[#F5F2EB] p-1 border border-[#E8E2D7]">
            <button
              type="button"
              onClick={() => handleSwitchMode("PRIVATE_LETTER")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xs text-xs font-medium transition-all cursor-pointer ${
                mode === "PRIVATE_LETTER"
                  ? "bg-[#FBF9F5] text-[#23201D] shadow-xs"
                  : "text-[#878077] hover:text-[#23201D]"
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Private Letter</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchMode("PUBLIC_LETTER")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xs text-xs font-medium transition-all cursor-pointer ${
                mode === "PUBLIC_LETTER"
                  ? "bg-[#FBF9F5] text-[#23201D] shadow-xs"
                  : "text-[#878077] hover:text-[#23201D]"
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Public Letter</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchMode("PERSONAL_NOTE")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xs text-xs font-medium transition-all cursor-pointer ${
                mode === "PERSONAL_NOTE"
                  ? "bg-[#FBF9F5] text-[#23201D] shadow-xs"
                  : "text-[#878077] hover:text-[#23201D]"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Personal Note</span>
            </button>
          </div>
        </div>

        {/* Mode Guidance Alert */}
        <div className="mb-6 p-3.5 rounded-sm bg-[#F5F2EB]/60 border border-[#E8E2D7]/80 text-xs text-[#57524C] flex items-center justify-between">
          <span>
            {mode === "PRIVATE_LETTER" && (
              <>
                <strong>Private Letter:</strong> Strictly confidential. Saved to your personal space; never shared into Orbit.
              </>
            )}
            {mode === "PUBLIC_LETTER" && (
              <>
                <strong>Public Letter:</strong> Released anonymously to Orbit. Cannot be edited or deleted once published.
              </>
            )}
            {mode === "PERSONAL_NOTE" && (
              <>
                <strong>Personal Note:</strong> Short-form reflection. Only you can revisit and edit this note.
              </>
            )}
          </span>
          {activeEditingId && (
            <span className="text-[11px] font-mono text-[#C27D77] ml-2 shrink-0">
              [Editing saved entry]
            </span>
          )}
        </div>

        {/* Writing Paper Canvas */}
        <div className="bg-[#FBF9F5] border border-[#E8E2D7] rounded-sm p-6 sm:p-10 shadow-[0_2px_18px_rgba(35,32,29,0.03)] flex flex-col flex-1">
          {mode !== "PERSONAL_NOTE" && (
            <div className="mb-6 border-b border-[#E8E2D7]/70 pb-3">
              <label htmlFor="recipient" className="block text-[11px] font-handwriting text-[#878077] tracking-wider mb-1">
                recipient moniker
              </label>
              <input
                id="recipient"
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="To someone who never called back..."
                className="w-full font-serif italic text-lg sm:text-xl text-[#23201D] placeholder:text-[#B5AEA4] focus:outline-hidden bg-transparent"
              />
            </div>
          )}

          {/* Optional Theme Selection for Letters */}
          {mode !== "PERSONAL_NOTE" && (
            <div className="mb-6 border-b border-[#E8E2D7]/50 pb-4">
              <label className="block text-[11px] font-mono uppercase tracking-wider text-[#878077] mb-2">
                Editorial Theme (Optional)
              </label>
              <div className="flex flex-wrap gap-2">
                {APPROVED_THEMES.map((t: Theme) => {
                  const isSelected = theme.toLowerCase() === t.toLowerCase();
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTheme(isSelected ? "" : t)}
                      className={`px-3 py-1 rounded-full text-xs font-serif transition-colors cursor-pointer border ${
                        isSelected
                          ? "bg-[#23201D] text-[#FBF9F5] border-[#23201D]"
                          : "bg-[#F5F2EB] text-[#57524C] border-[#E8E2D7] hover:border-[#D8D0C4]"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mb-6 border-b border-[#E8E2D7]/50 pb-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={mode === "PERSONAL_NOTE" ? "Note title (optional)..." : "Letter title (optional)..."}
              className="w-full font-serif text-base sm:text-lg text-[#57524C] placeholder:text-[#B5AEA4] focus:outline-hidden bg-transparent"
            />
          </div>

          <div className="flex-1 min-h-[320px] flex flex-col">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                mode === "PERSONAL_NOTE"
                  ? "Write a private thought, a fleeting realization, or an unsaid moment..."
                  : "Write your letter here. Take your time..."
              }
              className="w-full flex-1 min-h-[320px] font-serif text-base sm:text-lg leading-relaxed text-[#23201D] placeholder:text-[#B5AEA4] focus:outline-hidden bg-transparent resize-y"
            />
          </div>

          {/* Action Bar & Save Status */}
          <div className="mt-8 pt-5 border-t border-[#E8E2D7] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-xs text-[#878077]">
              {saveStatus === "saving" && <span className="animate-pulse">Saving...</span>}
              {saveStatus === "saved" && (
                <span className="flex items-center gap-1 text-emerald-800">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{statusMessage}</span>
                </span>
              )}
              {saveStatus === "held" && (
                <span className="flex items-center gap-1 text-amber-800">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                  <span>{statusMessage}</span>
                </span>
              )}
              {saveStatus === "error" && (
                <span className="flex items-center gap-1 text-red-700">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{statusMessage}</span>
                </span>
              )}
              {saveStatus === "idle" && <span>{statusMessage}</span>}

              <span className="text-[#E8E2D7]">•</span>
              <span>{wordCount} {wordCount === 1 ? "word" : "words"}</span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              {(content.trim() || recipient.trim() || title.trim() || theme) && (
                <button
                  type="button"
                  onClick={handleClearDraft}
                  className="px-3.5 py-2 rounded-sm border border-[#E8E2D7] hover:bg-[#F5F2EB] text-xs text-[#878077] hover:text-[#23201D] transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}

              <button
                type="button"
                disabled={!content.trim() || isPending}
                onClick={handleSaveOrPublish}
                className="px-6 py-2.5 rounded-sm bg-[#23201D] hover:bg-[#38332E] text-[#FBF9F5] text-xs font-medium tracking-wide transition-all shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPending
                  ? "Saving..."
                  : activeEditingId
                  ? "Update Entry"
                  : mode === "PUBLIC_LETTER"
                  ? "Release to Orbit"
                  : mode === "PERSONAL_NOTE"
                  ? "Save Note"
                  : "Save Private Letter"}
              </button>
            </div>
          </div>
        </div>

        {/* Existing Saved Private Letters & Personal Notes */}
        {savedItems.length > 0 && (
          <section className="mt-14 pt-8 border-t border-[#E8E2D7]">
            <h2 className="font-serif text-lg text-[#23201D] mb-4 font-normal">
              Your Saved Items & Drafts ({savedItems.length})
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savedItems.map((item) => (
                <div
                  key={item.id}
                  className="p-5 rounded-sm bg-[#FBF9F5] border border-[#E8E2D7] flex flex-col justify-between hover:border-[#D8D0C4] transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-[#878077] mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="uppercase px-1.5 py-0.5 rounded bg-[#F5F2EB]">
                          {item.entryType === "NOTE" ? "Note" : item.visibility === "PUBLIC" ? "Orbit Letter" : "Private Letter"}
                        </span>
                        {item.theme && (
                          <span className="px-1.5 py-0.5 rounded bg-[#F5F2EB] text-[#57524C]">
                            {item.theme}
                          </span>
                        )}
                        {item.isModerated && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">
                            Held for Review
                          </span>
                        )}
                      </div>
                      <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>

                    {item.recipientName && (
                      <p className="font-serif italic text-sm text-[#57524C] mb-1">
                        {item.recipientName}
                      </p>
                    )}

                    <p className="font-serif text-sm text-[#23201D] line-clamp-3 leading-relaxed mb-3">
                      {item.content}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-[#E8E2D7]/60 flex items-center justify-between text-xs">
                    {item.visibility === "PUBLIC" ? (
                      <span className="text-[11px] font-serif italic text-[#878077]">
                        {item.isModerated
                          ? "Held for review (not in Orbit)"
                          : "Published into Orbit (immutable)"}
                      </span>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleEditItem(item)}
                          className="inline-flex items-center gap-1 text-[#57524C] hover:text-[#23201D] cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item)}
                          className="inline-flex items-center gap-1 text-[#C27D77] hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
