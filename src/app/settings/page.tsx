"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/ui/Header";
import { Footer } from "@/components/ui/Footer";
import {
  Shield,
  KeyRound,
  Eye,
  Palette,
  Bell,
  Copy,
  Check,
  AlertTriangle,
  Trash2,
  LogOut,
  Laptop,
  CheckCircle2,
  ExternalLink,
  Info,
  Clock,
} from "lucide-react";

type SettingsSection = "identity" | "security" | "privacy" | "appearance" | "notifications";

interface SessionStats {
  totalCount: number;
  currentSessionCreatedAt: string;
  otherSessionsCount: number;
}

interface UserIdentity {
  unsentId: string;
  accountType: string;
  role: string;
  createdAt: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<SettingsSection>("identity");
  const [user, setUser] = useState<UserIdentity | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Appearance preferences (persisted in localStorage)
  const [atmosphere, setAtmosphere] = useState<"ivory" | "dusk" | "sepia">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("unsent_pref_atmosphere") as "ivory" | "dusk" | "sepia" | null;
      if (saved) return saved;
    }
    return "ivory";
  });

  const [fontSize, setFontSize] = useState<"compact" | "normal" | "large">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("unsent_pref_fontsize") as "compact" | "normal" | "large" | null;
      if (saved) return saved;
    }
    return "normal";
  });

  // Notification preferences (persisted in localStorage)
  const [notifyOnResponses, setNotifyOnResponses] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("unsent_pref_notify_responses");
      if (saved !== null) return saved === "true";
    }
    return true;
  });

  // Deletion modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Load user identity and session info on mount
  useEffect(() => {
    let ignore = false;

    async function loadSettings() {
      try {
        const [meRes, sessRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/auth/sessions"),
        ]);

        const meJson = await meRes.json();
        const sessJson = await sessRes.json();

        if (!ignore) {
          if (meJson.success && meJson.data) {
            setUser(meJson.data);
          }
          if (sessJson.success && sessJson.data) {
            setSessionStats(sessJson.data);
          }
          setLoading(false);
        }
      } catch (err) {
        if (!ignore) {
          console.error("Settings load error:", err);
          setErrorMessage("Failed to load settings data");
          setLoading(false);
        }
      }
    }

    loadSettings();

    return () => {
      ignore = true;
    };
  }, []);

  const flashStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const flashError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), 5000);
  };

  // Copy UNSENT ID
  const handleCopyId = () => {
    if (!user) return;
    navigator.clipboard.writeText(user.unsentId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2500);
    flashStatus("UNSENT ID copied to clipboard.");
  };

  // Invalidate other sessions
  const handleInvalidateOthers = async () => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/sessions/invalidate-others", {
          method: "POST",
        });
        const json = await res.json();
        if (json.success) {
          flashStatus(json.message || "Other active sessions terminated.");
          // Refresh session stats
          const sessRes = await fetch("/api/auth/sessions");
          const sessJson = await sessRes.json();
          if (sessJson.success) setSessionStats(sessJson.data);
        } else {
          flashError(json.error?.message || "Failed to invalidate sessions.");
        }
      } catch (err) {
        console.error("Invalidate error:", err);
        flashError("Failed to invalidate other sessions.");
      }
    });
  };

  // Terminate current session (Logout)
  const handleTerminateSession = async () => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/logout", { method: "POST" });
        const json = await res.json();
        if (json.success) {
          router.push("/");
          router.refresh();
        } else {
          flashError(json.error?.message || "Failed to end session.");
        }
      } catch (err) {
        console.error("Logout error:", err);
        flashError("Failed to end session.");
      }
    });
  };

  // Change atmosphere
  const handleSelectAtmosphere = (atmo: "ivory" | "dusk" | "sepia") => {
    setAtmosphere(atmo);
    localStorage.setItem("unsent_pref_atmosphere", atmo);
    flashStatus(`Reading atmosphere set to ${atmo.toUpperCase()}`);
  };

  // Change font size
  const handleSelectFontSize = (size: "compact" | "normal" | "large") => {
    setFontSize(size);
    localStorage.setItem("unsent_pref_fontsize", size);
    flashStatus(`Typography scale set to ${size}`);
  };

  // Change notification preference
  const handleToggleNotification = (val: boolean) => {
    setNotifyOnResponses(val);
    localStorage.setItem("unsent_pref_notify_responses", String(val));
    flashStatus(
      val
        ? "In-app notifications enabled for responses."
        : "In-app notifications silenced for responses."
    );
  };

  // Account deletion
  const handleDeleteAccount = async () => {
    if (confirmPhrase.trim() !== "ERASE MY SANCTUARY") {
      setDeleteError('You must type "ERASE MY SANCTUARY" exactly.');
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/delete-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmPhrase: confirmPhrase.trim() }),
        });

        const json = await res.json();
        if (json.success) {
          // Clear any local caches
          localStorage.removeItem("unsent_draft_private_letter");
          localStorage.removeItem("unsent_draft_public_letter");
          localStorage.removeItem("unsent_draft_personal_note");
          router.push("/");
          router.refresh();
        } else {
          setDeleteError(json.error?.message || "Failed to delete account.");
        }
      } catch (err) {
        console.error("Delete error:", err);
        setDeleteError("Failed to delete account. Please try again.");
      }
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] text-[#23201D] font-sans">
      <Header />

      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-10 sm:py-14">
        {/* Top Header */}
        <div className="pb-6 border-b border-[#E8E2D7]">
          <h1 className="font-serif text-3xl sm:text-4xl text-[#23201D] font-normal tracking-tight">
            Settings & Sanctuary
          </h1>
          <p className="mt-1.5 text-sm text-[#878077] font-serif italic">
            Manage your anonymous identity, session security, privacy boundaries, and reading atmosphere.
          </p>
        </div>

        {/* Status Alerts */}
        {statusMessage && (
          <div className="mt-4 p-3 rounded-sm bg-[#F5F2EB] border border-[#D5CFC4] text-xs text-[#57524C] flex items-center gap-2 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 p-3 rounded-sm bg-[#FDF2F2] border border-[#F0D5D5] text-xs text-[#9E4747] flex items-center gap-2 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Section Navigation Tabs */}
        <div className="mt-8 flex items-center gap-2 sm:gap-3 border-b border-[#E8E2D7] overflow-x-auto pb-px">
          <button
            type="button"
            onClick={() => setActiveSection("identity")}
            className={`flex items-center gap-2 px-3 py-2.5 text-xs sm:text-sm font-medium tracking-wide border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeSection === "identity"
                ? "border-[#23201D] text-[#23201D]"
                : "border-transparent text-[#878077] hover:text-[#57524C]"
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Identity</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("security")}
            className={`flex items-center gap-2 px-3 py-2.5 text-xs sm:text-sm font-medium tracking-wide border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeSection === "security"
                ? "border-[#23201D] text-[#23201D]"
                : "border-transparent text-[#878077] hover:text-[#57524C]"
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Recovery & Security</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("privacy")}
            className={`flex items-center gap-2 px-3 py-2.5 text-xs sm:text-sm font-medium tracking-wide border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeSection === "privacy"
                ? "border-[#23201D] text-[#23201D]"
                : "border-transparent text-[#878077] hover:text-[#57524C]"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Privacy & Data</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("appearance")}
            className={`flex items-center gap-2 px-3 py-2.5 text-xs sm:text-sm font-medium tracking-wide border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeSection === "appearance"
                ? "border-[#23201D] text-[#23201D]"
                : "border-transparent text-[#878077] hover:text-[#57524C]"
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Appearance</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("notifications")}
            className={`flex items-center gap-2 px-3 py-2.5 text-xs sm:text-sm font-medium tracking-wide border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeSection === "notifications"
                ? "border-[#23201D] text-[#23201D]"
                : "border-transparent text-[#878077] hover:text-[#57524C]"
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Notifications</span>
          </button>
        </div>

        {/* Section Content */}
        <div className="mt-8">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-[#878077]">
              <Clock className="w-6 h-6 animate-spin text-[#A8A196] mb-3" />
              <p className="font-serif italic text-sm">Loading sanctuary settings...</p>
            </div>
          ) : (
            <>
              {/* SECTION 1: IDENTITY */}
              {activeSection === "identity" && (
                <div className="space-y-6">
                  <div className="border border-[#E8E2D7] bg-[#FDFBF7] p-6 sm:p-7 rounded-sm shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 pb-3 border-b border-[#E8E2D7]/60">
                      <div>
                        <span className="text-[11px] uppercase tracking-wider text-[#878077] font-medium">
                          Active Identity
                        </span>
                        <h3 className="font-serif text-xl sm:text-2xl text-[#23201D] mt-0.5">
                          {user?.unsentId || "Anonymous Writer"}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] px-2.5 py-0.5 rounded-sm bg-[#F5F2EB] text-[#57524C] border border-[#E8E2D7] font-mono">
                          {user?.accountType || "ANONYMOUS"}
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyId}
                          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs border border-[#E8E2D7] bg-white hover:bg-[#F5F2EB] rounded-sm transition-colors cursor-pointer text-[#57524C]"
                        >
                          {copiedId ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-700" />
                              <span className="text-emerald-700 font-medium">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy ID</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="text-xs sm:text-sm text-[#57524C] leading-relaxed space-y-3 pt-2">
                      <p>
                        Your <strong>UNSENT ID</strong> is a human-readable pseudonym generated
                        automatically when you first arrived. It acts as an identifier for your
                        sanctuary and allows you to confirm that you are writing from your correct
                        identity.
                      </p>
                      <div className="p-3 bg-[#F5F2EB] border border-[#E8E2D7] rounded-sm space-y-1.5">
                        <p className="font-medium text-[#23201D] flex items-center gap-1.5">
                          <Info className="w-4 h-4 text-[#878077]" />
                          <span>Important Distinction: Visible ID vs. Secret Recovery Key</span>
                        </p>
                        <p className="text-xs text-[#57524C]">
                          Your visible UNSENT ID (e.g. <code>{user?.unsentId}</code>) is{" "}
                          <strong>never an authentication credential</strong>. Knowing someone’s
                          UNSENT ID grants zero access to their letters or private records. Only
                          your secret <strong>Recovery Key</strong> (which is kept exclusively by
                          you offline) can restore your sanctuary on another browser.
                        </p>
                      </div>
                      <p className="text-xs text-[#878077]">
                        Created on:{" "}
                        {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Active"}
                      </p>

                      {user?.accountType === "ANONYMOUS" ? (
                        <div className="mt-4 p-4 rounded-sm bg-white border border-[#E8E2D7] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <h4 className="font-serif text-sm font-medium text-[#23201D]">
                              Convert to Registered Account
                            </h4>
                            <p className="text-xs text-[#878077] mt-0.5">
                              Add an optional phone number and password to sign in across devices. Preserves all your writings.
                            </p>
                          </div>
                          <Link
                            href="/register"
                            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs bg-[#23201D] text-[#FBF9F5] rounded-sm hover:bg-[#3D3834] transition-colors shrink-0"
                          >
                            <span>Convert Identity</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      ) : (
                        <div className="mt-4 p-3.5 rounded-sm bg-[#EBF3ED]/60 border border-[#D5E3D8] text-xs text-[#2B543A] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <p className="font-medium text-[#1E3B29]">
                              This sanctuary is registered with phone-number-and-password credentials.
                            </p>
                            <p className="text-[11px] text-[#3A6B4C] mt-0.5">
                              Phone numbers are login identifiers only; ownership is not verified and numbers are never displayed publicly.
                            </p>
                          </div>
                          <span className="font-mono text-[11px] px-2 py-0.5 bg-white border border-[#D5E3D8] rounded-sm text-[#1E3B29] self-start sm:self-auto">
                            REGISTERED
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 2: RECOVERY & SECURITY */}
              {activeSection === "security" && (
                <div className="space-y-6">
                  {/* Recovery Explanation Card */}
                  <div className="border border-[#E8E2D7] bg-[#FDFBF7] p-6 sm:p-7 rounded-sm shadow-xs space-y-4">
                    <div className="flex items-center gap-2 pb-3 border-b border-[#E8E2D7]/60">
                      <KeyRound className="w-5 h-5 text-[#878077]" />
                      <h3 className="font-serif text-lg text-[#23201D]">
                        Recovery Credentials & Restoration
                      </h3>
                    </div>

                    <p className="text-xs sm:text-sm text-[#57524C] leading-relaxed">
                      UNSENT provides two secure authentication methods: anonymous identities use a
                      256-bit cryptographic Recovery Key displayed upon creation, while registered accounts
                      use a phone number and password. Because UNSENT never sends SMS messages, there are
                      no SMS password resets. Please keep your Recovery Key safe; losing both your password
                      and your Recovery Key will result in permanent loss of access.
                    </p>

                    <div className="pt-2 flex flex-wrap items-center gap-3">
                      <Link
                        href="/recover"
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs text-[#23201D] border border-[#23201D]/30 hover:border-[#23201D]/60 bg-[#F5F2EB] hover:bg-[#EFECE3] rounded-sm transition-all"
                      >
                        <span>Restore Sanctuary via Recovery Key</span>
                        <ExternalLink className="w-3.5 h-3.5 text-[#878077]" />
                      </Link>
                      {user?.accountType === "ANONYMOUS" ? (
                        <Link
                          href="/register"
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs text-[#57524C] border border-[#E8E2D7] bg-white hover:bg-[#F5F2EB] rounded-sm transition-all"
                        >
                          <span>Register Phone & Password</span>
                        </Link>
                      ) : (
                        <Link
                          href="/login"
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs text-[#57524C] border border-[#E8E2D7] bg-white hover:bg-[#F5F2EB] rounded-sm transition-all"
                        >
                          <span>Sign In to Another Device</span>
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Active Sessions Card */}
                  <div className="border border-[#E8E2D7] bg-[#FDFBF7] p-6 sm:p-7 rounded-sm shadow-xs space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D7]/60">
                      <div className="flex items-center gap-2">
                        <Laptop className="w-5 h-5 text-[#878077]" />
                        <h3 className="font-serif text-lg text-[#23201D]">Active Devices & Sessions</h3>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-sm bg-[#F5F2EB] text-[#57524C] border border-[#E8E2D7]">
                        {sessionStats?.totalCount || 1} active session
                        {(sessionStats?.totalCount || 1) > 1 ? "s" : ""}
                      </span>
                    </div>

                    <div className="text-xs sm:text-sm text-[#57524C] space-y-2">
                      <p>
                        Current session established on:{" "}
                        <strong className="text-[#23201D]">
                          {sessionStats?.currentSessionCreatedAt
                            ? new Date(sessionStats.currentSessionCreatedAt).toLocaleString()
                            : "Current device"}
                        </strong>
                      </p>
                      {sessionStats && sessionStats.otherSessionsCount > 0 ? (
                        <p className="text-[#878077]">
                          There are currently {sessionStats.otherSessionsCount} other active browser
                          session(s) connected to this identity.
                        </p>
                      ) : (
                        <p className="text-[#878077]">
                          This is currently your only active browser session.
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-[#E8E2D7]/60 flex flex-wrap items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={handleInvalidateOthers}
                        disabled={isPending || (sessionStats?.otherSessionsCount || 0) === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#57524C] hover:text-[#23201D] border border-[#E8E2D7] bg-[#F5F2EB] hover:bg-[#EFECE3] rounded-sm transition-all disabled:opacity-40 cursor-pointer"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span>Invalidate All Other Devices</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleTerminateSession}
                        disabled={isPending}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#9E4747] hover:text-[#7A3030] border border-[#F0D5D5] bg-[#FDF2F2] hover:bg-[#F9EAEA] rounded-sm transition-all cursor-pointer font-medium"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Terminate Current Session (Logout)</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 3: PRIVACY & DATA */}
              {activeSection === "privacy" && (
                <div className="space-y-6">
                  {/* Privacy Guarantees Card */}
                  <div className="border border-[#E8E2D7] bg-[#FDFBF7] p-6 sm:p-7 rounded-sm shadow-xs space-y-4">
                    <div className="flex items-center gap-2 pb-3 border-b border-[#E8E2D7]/60">
                      <Eye className="w-5 h-5 text-[#878077]" />
                      <h3 className="font-serif text-lg text-[#23201D]">
                        Privacy Boundaries & Sanctuary Principles
                      </h3>
                    </div>

                    <div className="text-xs sm:text-sm text-[#57524C] leading-relaxed space-y-3">
                      <div>
                        <h4 className="font-serif text-sm text-[#23201D] font-medium">
                          1. What remains strictly confidential
                        </h4>
                        <p className="mt-0.5 text-xs">
                          Your private letters, personal notes, saved letters, and private
                          reflection notes are encrypted and isolated to your verified session. No
                          other user or reader can view them.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-serif text-sm text-[#23201D] font-medium">
                          2. What becomes visible in Orbit
                        </h4>
                        <p className="mt-0.5 text-xs">
                          Letters marked as <strong>PUBLIC</strong> pass through our automated
                          sanctuary safety gate. Once approved, they appear in Orbit without your
                          UNSENT ID, IP, or personal information. They become anonymous literature.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-serif text-sm text-[#23201D] font-medium">
                          3. Standalone response privacy
                        </h4>
                        <p className="mt-0.5 text-xs">
                          Responses left under Orbit letters are strictly anonymous. We track
                          authorship internally only to prevent abuse and deliver private
                          notifications to the letter author. Responders never have public profiles
                          or avatars.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-serif text-sm text-[#23201D] font-medium">
                          4. Moderation & Safety Gate
                        </h4>
                        <p className="mt-0.5 text-xs">
                          Public submissions are checked on the server for private phone numbers,
                          addresses, and harmful content. Held letters remain strictly private until
                          reviewed by sanctuary stewards.
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[#E8E2D7]/60">
                      <Link
                        href="/archive"
                        className="text-xs text-[#23201D] hover:underline underline-offset-4 inline-flex items-center gap-1 font-medium"
                      >
                        <span>Export your complete personal archive (Markdown or JSON)</span>
                        <ExternalLink className="w-3 h-3 text-[#878077]" />
                      </Link>
                    </div>
                  </div>

                  {/* Deliberate Account Deletion Zone */}
                  <div className="border border-[#F0D5D5] bg-[#FDF2F2]/40 p-6 sm:p-7 rounded-sm shadow-xs space-y-4">
                    <div className="flex items-center gap-2 pb-3 border-b border-[#F0D5D5]">
                      <Trash2 className="w-5 h-5 text-[#9E4747]" />
                      <h3 className="font-serif text-lg text-[#9E4747]">
                        Deliberate Sanctuary & Data Deletion
                      </h3>
                    </div>

                    <div className="text-xs text-[#57524C] leading-relaxed space-y-2">
                      <p>
                        Permanent deletion will irreversibly erase your private records, including:
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-[#7A3030]">
                        <li>All private letters and drafts.</li>
                        <li>All personal notes and reflections.</li>
                        <li>All saved letters and private reflection notes.</li>
                        <li>All notifications and active sessions.</li>
                        <li>Your anonymous identity and cryptographic recovery keys.</li>
                      </ul>
                      <p className="pt-1 text-[#7A3030] font-medium">
                        Public Letters in Orbit: In accordance with our literary philosophy, letters
                        and responses already released into Orbit remain as permanent, detached,
                        authorless records. Their ownership ties to your identity will be severed
                        completely.
                      </p>
                    </div>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowDeleteModal(true);
                          setConfirmPhrase("");
                          setDeleteError(null);
                        }}
                        className="px-4 py-2 text-xs text-white bg-[#9E4747] hover:bg-[#853838] rounded-sm transition-colors cursor-pointer font-medium inline-flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Begin Sanctuary Deletion</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 4: APPEARANCE */}
              {activeSection === "appearance" && (
                <div className="space-y-6">
                  <div className="border border-[#E8E2D7] bg-[#FDFBF7] p-6 sm:p-7 rounded-sm shadow-xs space-y-6">
                    <div>
                      <h3 className="font-serif text-lg text-[#23201D]">Reading Atmosphere</h3>
                      <p className="mt-1 text-xs text-[#878077]">
                        Choose the quiet paper tone that feels most comfortable for contemplation.
                      </p>

                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <button
                          type="button"
                          onClick={() => handleSelectAtmosphere("ivory")}
                          className={`p-4 rounded-sm border text-left transition-all cursor-pointer ${
                            atmosphere === "ivory"
                              ? "border-[#23201D] bg-[#FBF9F5] shadow-xs"
                              : "border-[#E8E2D7] bg-[#F5F2EB]/50 hover:bg-[#F5F2EB]"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-serif text-sm text-[#23201D]">Parchment Ivory</span>
                            {atmosphere === "ivory" && (
                              <CheckCircle2 className="w-4 h-4 text-[#23201D]" />
                            )}
                          </div>
                          <p className="text-[11px] text-[#878077]">
                            Classic quiet paper with soft neutral warmth.
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectAtmosphere("dusk")}
                          className={`p-4 rounded-sm border text-left transition-all cursor-pointer ${
                            atmosphere === "dusk"
                              ? "border-[#23201D] bg-[#F4EFEA] shadow-xs"
                              : "border-[#E8E2D7] bg-[#F5F2EB]/50 hover:bg-[#F5F2EB]"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-serif text-sm text-[#23201D]">Warm Dusk</span>
                            {atmosphere === "dusk" && (
                              <CheckCircle2 className="w-4 h-4 text-[#23201D]" />
                            )}
                          </div>
                          <p className="text-[11px] text-[#878077]">
                            Muted twilight paper tone for evening reflection.
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectAtmosphere("sepia")}
                          className={`p-4 rounded-sm border text-left transition-all cursor-pointer ${
                            atmosphere === "sepia"
                              ? "border-[#23201D] bg-[#EFE8DC] shadow-xs"
                              : "border-[#E8E2D7] bg-[#F5F2EB]/50 hover:bg-[#F5F2EB]"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-serif text-sm text-[#23201D]">Sepia Candlelight</span>
                            {atmosphere === "sepia" && (
                              <CheckCircle2 className="w-4 h-4 text-[#23201D]" />
                            )}
                          </div>
                          <p className="text-[11px] text-[#878077]">
                            Aged archival parchment with rich earthy depth.
                          </p>
                        </button>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-[#E8E2D7]/60">
                      <h3 className="font-serif text-lg text-[#23201D]">Typography Scale</h3>
                      <p className="mt-1 text-xs text-[#878077]">
                        Adjust the reading scale of letters and reflections.
                      </p>

                      <div className="mt-3 flex items-center gap-3">
                        {(["compact", "normal", "large"] as const).map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => handleSelectFontSize(sz)}
                            className={`px-4 py-2 text-xs capitalize border rounded-sm transition-all cursor-pointer ${
                              fontSize === sz
                                ? "border-[#23201D] bg-[#23201D] text-white font-medium"
                                : "border-[#E8E2D7] bg-[#F5F2EB] text-[#57524C] hover:bg-[#EFECE3]"
                            }`}
                          >
                            {sz}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 5: NOTIFICATIONS */}
              {activeSection === "notifications" && (
                <div className="space-y-6">
                  <div className="border border-[#E8E2D7] bg-[#FDFBF7] p-6 sm:p-7 rounded-sm shadow-xs space-y-5">
                    <div className="pb-3 border-b border-[#E8E2D7]/60">
                      <h3 className="font-serif text-lg text-[#23201D]">In-App Echo Alerts</h3>
                      <p className="mt-1 text-xs text-[#878077]">
                        Control whether subtle indicator badges appear when someone responds to your
                        writings.
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-4 py-2">
                      <div>
                        <p className="text-sm font-medium text-[#23201D]">
                          Responses to your Orbit letters
                        </p>
                        <p className="text-xs text-[#878077] mt-0.5">
                          Show a quiet unread bell indicator in navigation when readers whisper an echo.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleNotification(!notifyOnResponses)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                          notifyOnResponses ? "bg-[#23201D]" : "bg-[#D5CFC4]"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            notifyOnResponses ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    <div className="p-3 bg-[#F5F2EB] border border-[#E8E2D7] rounded-sm text-xs text-[#57524C]">
                      <p>
                        <strong>Sanctuary Guarantee:</strong> UNSENT will never send email blasts,
                        SMS messages, or intrusive push notifications. All communication is silent
                        and confined to your active in-app navigation.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Account Deletion Confirmation Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 bg-[#23201D]/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
        >
          <div className="bg-[#FBF9F5] border border-[#F0D5D5] rounded-sm p-6 sm:p-8 max-w-lg w-full shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-[#9E4747]">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 id="delete-account-title" className="font-serif text-lg text-[#9E4747]">
                Permanent Sanctuary Deletion
              </h3>
            </div>

            <p className="text-xs sm:text-sm text-[#57524C] leading-relaxed">
              This action cannot be undone. All your private letters, personal notes, saved collections,
              reflection notes, and recovery credentials will be permanently erased.
            </p>

            <p className="text-xs text-[#57524C]">
              To confirm, type <strong className="font-mono text-[#9E4747]">ERASE MY SANCTUARY</strong> below:
            </p>

            <input
              type="text"
              value={confirmPhrase}
              onChange={(e) => {
                setConfirmPhrase(e.target.value);
                setDeleteError(null);
              }}
              placeholder="ERASE MY SANCTUARY"
              className="w-full text-xs sm:text-sm font-mono px-3 py-2 border border-[#E8E2D7] rounded-sm bg-white focus:outline-hidden focus:border-[#9E4747]"
            />

            {deleteError && (
              <p className="text-xs text-[#9E4747] font-medium">{deleteError}</p>
            )}

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isPending}
                className="px-3.5 py-1.5 text-xs text-[#57524C] border border-[#E8E2D7] bg-[#F5F2EB] hover:bg-[#EFECE3] rounded-sm transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={isPending || confirmPhrase.trim() !== "ERASE MY SANCTUARY"}
                className="px-4 py-1.5 text-xs text-white bg-[#9E4747] hover:bg-[#853838] rounded-sm transition-colors cursor-pointer font-medium disabled:opacity-50"
              >
                {isPending ? "Erasing..." : "Permanently Erase"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
