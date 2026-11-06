"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/ui/Header";
import { Footer } from "@/components/ui/Footer";
import {
  LogIn,
  AlertCircle,
  ArrowRight,
  Phone,
  Lock,
  Info,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!phone.trim() || !password) {
      setError("Please enter your phone number and password.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          password,
        }),
      });

      const json = await res.json();

      if (json.success && json.data) {
        // Successfully authenticated
        router.push("/archive");
        router.refresh();
      } else {
        setError(json.error?.message || "Invalid phone number or password.");
      }
    } catch (err) {
      console.error("Login failed:", err);
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
          <div className="flex items-center gap-2.5 text-[#C27D77] mb-3">
            <LogIn className="w-5 h-5 stroke-[1.5]" />
            <span className="font-handwriting text-sm tracking-wide text-[#57524C]">
              authenticated sanctuary access
            </span>
          </div>

          <h1 className="font-serif text-2xl sm:text-3xl text-[#23201D] font-normal tracking-[-0.01em] mb-3">
            Sign In to Your Sanctuary
          </h1>

          <p className="text-xs text-[#878077] leading-relaxed mb-6">
            Enter your registered phone number and password to return to your personal archive and writings.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-sm bg-[#FDF0EE] border border-[#F4D3CF] text-[#9B3B30] text-xs leading-relaxed">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#C24D40]" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="loginPhone"
                className="block font-mono text-xs uppercase tracking-wider text-[#57524C] mb-2"
              >
                Phone Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3.5 top-3 text-[#878077] stroke-[1.5]" />
                <input
                  id="loginPhone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+998 90 123 45 67 or +1 (555) 234-5678"
                  required
                  className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-[#E8E2D7] rounded-sm text-[#23201D] placeholder:text-[#B8B0A5] focus:outline-hidden focus:border-[#C27D77] transition-colors font-mono"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="loginPassword"
                  className="block font-mono text-xs uppercase tracking-wider text-[#57524C]"
                >
                  Password
                </label>
                <Link
                  href="/recover"
                  className="text-[11px] text-[#C27D77] hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-3 text-[#878077] stroke-[1.5]" />
                <input
                  id="loginPassword"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your account password"
                  required
                  className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-[#E8E2D7] rounded-sm text-[#23201D] placeholder:text-[#B8B0A5] focus:outline-hidden focus:border-[#C27D77] transition-colors font-mono"
                />
              </div>
            </div>

            <div className="p-3.5 bg-[#FAF8F5] border border-[#E8E2D7] rounded-sm text-xs text-[#878077] space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium text-[#57524C]">
                <Info className="w-3.5 h-3.5 text-[#878077]" />
                <span>No-SMS Security Model</span>
              </div>
              <p className="text-[11px] leading-relaxed text-[#57524C]">
                Phone numbers are login identifiers only. Phone ownership is not verified and UNSENT never sends SMS messages.
                Password and <Link href="/recover" className="text-[#C27D77] hover:underline">Recovery Key</Link> are your only recovery methods; losing both means permanent loss of account access.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-2.5 px-4 rounded-sm bg-[#23201D] text-[#FBF9F5] text-sm font-medium tracking-wide hover:bg-[#3D3834] transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              <span>{isSubmitting ? "Signing In..." : "Enter Sanctuary"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="pt-4 border-t border-[#E8E2D7] flex flex-col sm:flex-row items-center justify-between text-xs text-[#878077] gap-3">
              <span>
                New here?{" "}
                <Link href="/register" className="text-[#C27D77] hover:underline font-medium">
                  Register your account
                </Link>
              </span>
              <Link href="/compose" className="hover:text-[#23201D] transition-colors">
                Write anonymously &rarr;
              </Link>
            </div>
          </form>
        </div>
      </main>

      <Footer />
    </div>
  );
}
