"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Header } from "@/components/ui/Header";
import { Footer } from "@/components/ui/Footer";
import {
  ShieldCheck,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Phone,
  Lock,
  Copy,
  Check,
  Info,
} from "lucide-react";

interface MeData {
  unsentId: string;
  accountType: "ANONYMOUS" | "REGISTERED";
}

export default function RegisterPage() {
  const [currentUser, setCurrentUser] = useState<MeData | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [registrationSuccess, setRegistrationSuccess] = useState<{
    unsentId: string;
    newRecoveryKey?: string;
  } | null>(null);

  const [copiedKey, setCopiedKey] = useState(false);

  useEffect(() => {
    async function loadIdentity() {
      try {
        const res = await fetch("/api/auth/me");
        const json = await res.json();
        if (json.success && json.data) {
          setCurrentUser(json.data);
        }
      } catch (err) {
        console.error("Failed to check identity:", err);
      } finally {
        setLoadingUser(false);
      }
    }
    loadIdentity();
  }, []);

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorCode(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          password,
          confirmPassword,
        }),
      });

      const json = await res.json();

      if (json.success && json.data) {
        setRegistrationSuccess(json.data);
      } else {
        setErrorCode(json.error?.code || null);
        setError(json.error?.message || "Registration failed. Please check your details.");
      }
    } catch (err) {
      console.error("Registration error:", err);
      setError("An unexpected network error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] paper-grain selection:bg-[#EEDCDA]">
      <Header />

      <main className="flex-1 max-w-xl mx-auto px-6 py-16 sm:py-20 flex flex-col justify-center w-full">
        <div className="bg-[#FBF9F5] border border-[#E8E2D7] rounded-sm p-8 sm:p-11 shadow-[0_2px_20px_rgba(35,32,29,0.03)]">
          {/* Header indicator */}
          <div className="flex items-center gap-2.5 text-[#C27D77] mb-3">
            <ShieldCheck className="w-5 h-5 stroke-[1.5]" />
            <span className="font-handwriting text-sm tracking-wide text-[#57524C]">
              {currentUser?.accountType === "ANONYMOUS"
                ? "anonymous identity conversion"
                : "account registration"}
            </span>
          </div>

          <h1 className="font-serif text-2xl sm:text-3xl text-[#23201D] font-normal tracking-[-0.01em] mb-3">
            {currentUser?.accountType === "ANONYMOUS"
              ? "Preserve Your Sanctuary"
              : "Register an Account"}
          </h1>

          {/* Current anonymous identity callout */}
          {!loadingUser && currentUser?.accountType === "ANONYMOUS" && !registrationSuccess && (
            <div className="mb-6 p-4 rounded-sm bg-[#F5F2EB]/80 border border-[#E8E2D7] text-sm text-[#57524C]">
              <div className="flex items-center gap-2 mb-1.5 font-medium text-[#23201D]">
                <span>Active Anonymous Identity:</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded-sm bg-white border border-[#E8E2D7] text-[#C27D77]">
                  {currentUser.unsentId}
                </span>
              </div>
              <p className="text-xs text-[#878077] leading-relaxed">
                Registering converts your current anonymous identity in place. All your private letters,
                Orbit submissions, reflections, and notifications will remain attached to this exact sanctuary.
              </p>
            </div>
          )}

          {/* Already registered warning */}
          {!loadingUser && currentUser?.accountType === "REGISTERED" && !registrationSuccess && (
            <div className="mb-6 p-4 rounded-sm bg-[#F5F2EB]/80 border border-[#E8E2D7] text-sm text-[#57524C]">
              <div className="flex items-center gap-2 mb-1 font-medium text-[#23201D]">
                <span>Already Registered</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded-sm bg-white border border-[#E8E2D7] text-[#57524C]">
                  {currentUser.unsentId}
                </span>
              </div>
              <p className="text-xs text-[#878077] mb-3">
                This browser is already signed into a registered account.
              </p>
              <div className="flex gap-4 text-xs">
                <Link href="/archive" className="text-[#C27D77] hover:underline">
                  Visit Archive &rarr;
                </Link>
                <Link href="/settings" className="text-[#57524C] hover:underline">
                  Account Settings &rarr;
                </Link>
              </div>
            </div>
          )}

          {registrationSuccess ? (
            <div className="space-y-6">
              <div className="flex items-start gap-3 p-4 rounded-sm bg-[#EBF3ED] border border-[#D5E3D8] text-[#2B543A]">
                <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0 text-[#3A6B4C]" />
                <div>
                  <h3 className="font-serif font-medium text-base text-[#1E3B29] mb-1">
                    Sanctuary Successfully Secured
                  </h3>
                  <p className="text-xs text-[#3A6B4C] leading-relaxed">
                    Your account is registered. Your UNSENT ID remains{" "}
                    <span className="font-mono font-medium">{registrationSuccess.unsentId}</span>. All your
                    existing writings and reflections are preserved.
                  </p>
                </div>
              </div>

              {registrationSuccess.newRecoveryKey && (
                <div className="p-4 rounded-sm bg-[#FAF8F5] border border-[#E8E2D7] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase tracking-wider text-[#878077]">
                      Your Recovery Key (Keep Safe)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyKey(registrationSuccess.newRecoveryKey!)}
                      className="inline-flex items-center gap-1.5 text-xs text-[#C27D77] hover:text-[#9B5B56] cursor-pointer"
                    >
                      {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                  <div className="p-3 bg-white border border-[#E8E2D7] rounded-sm font-mono text-xs text-[#23201D] break-all select-all">
                    {registrationSuccess.newRecoveryKey}
                  </div>
                  <p className="text-[11px] text-[#878077] leading-relaxed">
                    Store this in a secure password manager. Because no SMS verification exists, this key is your
                    only secondary recovery method if you forget your password.
                  </p>
                </div>
              )}

              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/archive"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-sm bg-[#23201D] text-[#FBF9F5] text-sm hover:bg-[#3D3834] transition-colors"
                >
                  <span>Go to Personal Archive</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/settings"
                  className="inline-flex items-center justify-center px-4 py-2.5 rounded-sm border border-[#E8E2D7] text-[#57524C] text-sm hover:bg-[#F5F2EB] transition-colors"
                >
                  Settings
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-sm bg-[#FDF0EE] border border-[#F4D3CF] text-[#9B3B30] text-xs leading-relaxed">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#C24D40]" />
                  <div>
                    <span>{error}</span>
                    {errorCode === "PHONE_ALREADY_REGISTERED" && (
                      <div className="mt-2">
                        <Link
                          href="/login"
                          className="font-medium underline hover:text-[#7A2B22] inline-flex items-center gap-1"
                        >
                          Sign in to existing account &rarr;
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="phone"
                  className="block font-mono text-xs uppercase tracking-wider text-[#57524C] mb-2"
                >
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3.5 top-3 text-[#878077] stroke-[1.5]" />
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+998 90 123 45 67 or +1 (555) 234-5678"
                    required
                    className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-[#E8E2D7] rounded-sm text-[#23201D] placeholder:text-[#B8B0A5] focus:outline-hidden focus:border-[#C27D77] transition-colors font-mono"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-[#878077] leading-relaxed flex items-start gap-1">
                  <Info className="w-3 h-3 mt-0.5 shrink-0 text-[#878077]" />
                  <span>
                    Include your international country code (e.g. +998 for Uzbekistan, +1 for US/Canada). Local numbers without country code will be rejected.
                  </span>
                </p>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block font-mono text-xs uppercase tracking-wider text-[#57524C] mb-2"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-3 text-[#878077] stroke-[1.5]" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters with letters & numbers"
                    required
                    minLength={8}
                    className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-[#E8E2D7] rounded-sm text-[#23201D] placeholder:text-[#B8B0A5] focus:outline-hidden focus:border-[#C27D77] transition-colors font-mono"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block font-mono text-xs uppercase tracking-wider text-[#57524C] mb-2"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-3 text-[#878077] stroke-[1.5]" />
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    required
                    minLength={8}
                    className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-[#E8E2D7] rounded-sm text-[#23201D] placeholder:text-[#B8B0A5] focus:outline-hidden focus:border-[#C27D77] transition-colors font-mono"
                  />
                </div>
              </div>

              {/* Informative notice on privacy & recovery */}
              <div className="p-4 bg-[#FAF8F5] border border-[#E8E2D7] rounded-sm text-xs text-[#878077] space-y-2">
                <div className="flex items-center gap-1.5 font-medium text-[#57524C]">
                  <KeyRound className="w-3.5 h-3.5 text-[#C27D77]" />
                  <span>No-SMS Security Model & Account Recovery</span>
                </div>
                <ul className="text-[11px] leading-relaxed space-y-1 list-disc pl-4 text-[#57524C]">
                  <li>
                    <strong>Login Identifier Only:</strong> Phone numbers act solely as a login identifier. UNSENT does not send SMS messages, and phone ownership is not verified.
                  </li>
                  <li>
                    <strong>Two Recovery Keys Only:</strong> Your password and your cryptographic Recovery Key are your sole methods of access.
                  </li>
                  <li>
                    <strong>Permanent Loss Warning:</strong> Because no SMS verification or reset gateway exists, losing both your password and your offline Recovery Key means permanent loss of account access.
                  </li>
                </ul>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 py-2.5 px-4 rounded-sm bg-[#23201D] text-[#FBF9F5] text-sm font-medium tracking-wide hover:bg-[#3D3834] transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>{isSubmitting ? "Securing Sanctuary..." : "Register Account"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="pt-4 border-t border-[#E8E2D7] flex flex-col sm:flex-row items-center justify-between text-xs text-[#878077] gap-3">
                <span>
                  Already registered?{" "}
                  <Link href="/login" className="text-[#C27D77] hover:underline font-medium">
                    Sign in here
                  </Link>
                </span>
                <Link href="/recover" className="hover:text-[#23201D] transition-colors">
                  Have a recovery key?
                </Link>
              </div>
            </form>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
