"use client";

import { useState } from "react";
import { KeyRound, Copy, Check, ShieldCheck } from "lucide-react";

interface RecoveryCredentialModalProps {
  unsentId: string;
  recoveryKey: string;
  onDismiss: () => void;
}

export function RecoveryCredentialModal({
  unsentId,
  recoveryKey,
  onDismiss,
}: RecoveryCredentialModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback if clipboard API is blocked
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#23201D]/40 backdrop-blur-xs animate-in fade-in duration-300">
      <div className="w-full max-w-lg bg-[#FBF9F5] border border-[#E8E2D7] rounded-sm p-7 sm:p-9 shadow-2xl relative">
        <div className="flex items-center gap-3 mb-4 text-[#C27D77]">
          <KeyRound className="w-5 h-5 stroke-[1.5]" />
          <span className="font-handwriting text-base text-[#57524C] tracking-wide">
            your sanctuary identity is created
          </span>
        </div>

        <h2 className="font-serif text-2xl text-[#23201D] font-normal mb-3">
          Save your Recovery Credential
        </h2>

        <p className="text-xs text-[#57524C] leading-relaxed mb-6 font-sans">
          You are writing anonymously as <span className="font-mono font-medium text-[#23201D] px-1.5 py-0.5 rounded bg-[#F5F2EB] border border-[#E8E2D7]">{unsentId}</span>.
          Because we do not store passwords or personal information, this credential is your
          <strong className="text-[#23201D] font-medium"> only key</strong> to restoring access to your private letters and notes if you clear your browser.
        </p>

        <div className="mb-6 p-4 rounded-sm bg-[#F5F2EB] border border-[#E8E2D7] relative group">
          <label className="block text-[11px] font-mono uppercase tracking-wider text-[#878077] mb-1.5">
            Secret Recovery Key (Do not share)
          </label>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs sm:text-sm text-[#23201D] break-all select-all font-semibold tracking-wide">
              {recoveryKey}
            </span>
            <button
              onClick={handleCopy}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-[#FBF9F5] hover:bg-[#ECE7DE] border border-[#E8E2D7] text-xs font-medium text-[#23201D] transition-all shrink-0 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                  <span className="text-emerald-800">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#57524C]" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-start gap-2.5 mb-7 text-xs text-[#878077]">
          <ShieldCheck className="w-4 h-4 text-[#C27D77] shrink-0 mt-0.5" />
          <p>
            This credential is shown only once and stored on the server as an encrypted one-way cryptographic hash. It can never be recovered for you.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-[#E8E2D7]/70">
          <button
            type="button"
            onClick={onDismiss}
            className="px-5 py-2.5 rounded-sm bg-[#23201D] hover:bg-[#38332E] text-[#FBF9F5] text-xs font-medium tracking-wide transition-colors cursor-pointer"
          >
            I have saved my key
          </button>
        </div>
      </div>
    </div>
  );
}
