"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/ui/Header";
import { Footer } from "@/components/ui/Footer";
import { KeyRound, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";

export default function RecoverPage() {
  const router = useRouter();
  const [recoveryKey, setRecoveryKey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveredUser, setRecoveredUser] = useState<{ unsentId: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryKey.trim()) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recoveryKey: recoveryKey.trim() }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setRecoveredUser(json.data);
      } else {
        setError(json.error?.message || "Invalid recovery credential. Please check and try again.");
      }
    } catch (err) {
      console.error("Recovery failed:", err);
      setError("An unexpected network error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] paper-grain selection:bg-[#EEDCDA]">
      <Header />

      <main className="flex-1 max-w-xl mx-auto px-6 py-20 flex flex-col justify-center w-full">
        <div className="bg-[#FBF9F5] border border-[#E8E2D7] rounded-sm p-8 sm:p-11 shadow-[0_2px_20px_rgba(35,32,29,0.03)]">
          <div className="flex items-center gap-2.5 text-[#C27D77] mb-3">
            <KeyRound className="w-5 h-5 stroke-[1.5]" />
            <span className="font-handwriting text-sm tracking-wide text-[#57524C]">
              cryptographic identity restoration
            </span>
          </div>

          <h1 className="font-serif text-2xl sm:text-3xl text-[#23201D] font-normal tracking-[-0.01em] mb-3">
            Restore Your Sanctuary
          </h1>

          <p className="text-xs text-[#57524C] leading-relaxed mb-8">
            Enter your secret Recovery Key to regain access to your private letters,
            notes, and anonymous identity across devices or after browser cache clears.
          </p>

          {recoveredUser ? (
            <div className="p-6 rounded-sm bg-[#F5F2EB] border border-[#E8E2D7] text-center animate-in fade-in">
              <CheckCircle2 className="w-8 h-8 text-emerald-800 mx-auto mb-3" />
              <h2 className="font-serif text-lg text-[#23201D] mb-1">
                Identity Successfully Restored
              </h2>
              <p className="text-xs text-[#57524C] mb-4">
                You are now active as{" "}
                <span className="font-mono font-medium text-[#23201D] px-1.5 py-0.5 rounded bg-[#FBF9F5] border border-[#E8E2D7]">
                  {recoveredUser.unsentId}
                </span>
                . Your private letters and notes have been reconnected.
              </p>

              <button
                type="button"
                onClick={() => router.push("/compose")}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-sm bg-[#23201D] hover:bg-[#38332E] text-[#FBF9F5] text-xs font-medium tracking-wide transition-colors cursor-pointer"
              >
                <span>Go to Writing Space</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="recovery-key-input"
                  className="block text-xs font-medium text-[#23201D] mb-2"
                >
                  Secret Recovery Key
                </label>
                <input
                  id="recovery-key-input"
                  type="text"
                  required
                  value={recoveryKey}
                  onChange={(e) => setRecoveryKey(e.target.value)}
                  placeholder="REC-XXXXXXXX-..."
                  className="w-full font-mono text-xs sm:text-sm px-4 py-3 rounded-sm bg-[#F5F2EB]/50 border border-[#E8E2D7] text-[#23201D] placeholder:text-[#B5AEA4] focus:outline-hidden focus:border-[#C27D77] transition-colors"
                />
                <p className="text-[11px] text-[#878077] mt-2">
                  Format: <code className="font-mono text-[#57524C]">REC-XXXXXXXX-...</code> (Saved when your anonymous identity was first created).
                </p>
              </div>

              {error && (
                <div className="p-3.5 rounded-sm bg-red-50/70 border border-red-200 text-xs text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <Link
                  href="/"
                  className="text-xs text-[#878077] hover:text-[#23201D] transition-colors"
                >
                  ← Back to home
                </Link>

                <button
                  type="submit"
                  disabled={!recoveryKey.trim() || isSubmitting}
                  className="px-6 py-2.5 rounded-sm bg-[#23201D] hover:bg-[#38332E] text-[#FBF9F5] text-xs font-medium tracking-wide transition-all shadow-sm cursor-pointer disabled:opacity-40"
                >
                  {isSubmitting ? "Verifying..." : "Restore Identity"}
                </button>
              </div>
            </form>
          )}

          <div className="mt-8 pt-6 border-t border-[#E8E2D7]/70 text-[11px] text-[#878077] leading-relaxed">
            <strong className="text-[#57524C] font-medium block mb-1">
              Privacy Notice:
            </strong>
            Visible UNSENT IDs (@adjective-noun-###) cannot be used to recover accounts. Only the secret Recovery Key possesses the cryptographic entropy required to reauthorize your session.
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
