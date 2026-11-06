"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/ui/Header";
import { Footer } from "@/components/ui/Footer";
import { OrbitCard } from "@/components/ui/OrbitCard";
import { APPROVED_THEMES, type Theme } from "@/lib/constants/themes";
import type { PublicLetterItem } from "@/types/domain";

type OrbitMode = "discover" | "latest";

function OrbitFeed() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read initial query parameters
  const initialMode = (searchParams.get("mode") as OrbitMode) || "latest";
  const initialTheme = (searchParams.get("theme") as Theme) || "";
  const initialPage = parseInt(searchParams.get("page") || "1", 10) || 1;

  const [mode, setMode] = useState<OrbitMode>(initialMode);
  const [selectedTheme, setSelectedTheme] = useState<string>(initialTheme);
  const [page, setPage] = useState<number>(initialPage);
  const [limit] = useState<number>(8);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const [letters, setLetters] = useState<PublicLetterItem[]>([]);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Sync state to URL without hard reloading
  const updateUrl = useCallback(
    (newMode: OrbitMode, newTheme: string, newPage: number) => {
      const params = new URLSearchParams();
      if (newMode !== "latest") params.set("mode", newMode);
      if (newTheme) params.set("theme", newTheme);
      if (newPage > 1) params.set("page", newPage.toString());

      const query = params.toString();
      const target = query ? `/orbit?${query}` : "/orbit";
      router.replace(target, { scroll: false });
    },
    [router]
  );

  useEffect(() => {
    let ignore = false;

    async function loadData() {
      try {
        const params = new URLSearchParams({
          mode,
          page: page.toString(),
          limit: limit.toString(),
        });
        if (selectedTheme) {
          params.set("theme", selectedTheme);
        }

        const res = await fetch(`/api/orbit?${params.toString()}`);
        const json = await res.json();

        if (!ignore) {
          if (!res.ok || !json.success) {
            setError(json.error?.message || "Failed to load Orbit letters.");
            setLetters([]);
          } else {
            setLetters(json.data.items || []);
            setTotalPages(json.data.totalPages || 1);
            setTotalCount(json.data.total || 0);
            setError(null);
          }
          setLoading(false);
        }
      } catch {
        if (!ignore) {
          setError("Unable to reach the Orbit archive. Please check your connection.");
          setLetters([]);
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      ignore = true;
    };
  }, [mode, selectedTheme, page, limit, refreshKey]);

  const handleModeChange = (newMode: OrbitMode) => {
    if (newMode === mode) return;
    setLoading(true);
    setMode(newMode);
    setPage(1);
    updateUrl(newMode, selectedTheme, 1);
  };

  const handleThemeChange = (themeName: string) => {
    const nextTheme = selectedTheme === themeName ? "" : themeName;
    setLoading(true);
    setSelectedTheme(nextTheme);
    setPage(1);
    updateUrl(mode, nextTheme, 1);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setLoading(true);
    setPage(newPage);
    updateUrl(mode, selectedTheme, newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleRefresh = () => {
    setLoading(true);
    setRefreshKey((k) => k + 1);
  };

  const handleToggleSave = (letterId: string, isSaved: boolean) => {
    setLetters((prev) =>
      prev.map((letter) => (letter.id === letterId ? { ...letter, isSaved } : letter))
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] paper-grain">
      <Header />

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-10 sm:py-14">
        {/* Editorial Heading */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-2 mb-3.5 px-3 py-1 rounded-full bg-[#F5F2EB] border border-[#E8E2D7] text-xs text-[#57524C]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C27D77] animate-pulse" />
            <span className="font-serif italic text-xs tracking-wider">Orbit Archive</span>
          </div>

          <h1 className="font-serif text-3xl sm:text-4xl text-[#23201D] font-normal tracking-tight mb-3">
            Words Cast into Orbit
          </h1>

          <p className="text-sm text-[#57524C] leading-relaxed">
            A quiet constellation of anonymous letters and unaddressed echoes, released into
            the open without expectation of a reply.
          </p>
        </div>

        {/* Discovery Mode Selector & Theme Filters */}
        <div className="flex flex-col gap-5 mb-10">
          {/* Top Control Bar: Mode Toggle & Discover Shuffle */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-[#E8E2D7]/70">
            {/* Mode Switcher */}
            <div className="inline-flex p-1 rounded-sm bg-[#F5F2EB] border border-[#E8E2D7]">
              <button
                type="button"
                onClick={() => handleModeChange("latest")}
                className={`px-4 py-1.5 text-xs font-medium rounded-xs transition-all duration-200 ${
                  mode === "latest"
                    ? "bg-[#FBF9F5] text-[#23201D] shadow-xs"
                    : "text-[#57524C] hover:text-[#23201D]"
                }`}
              >
                Latest Echoes
              </button>
              <button
                type="button"
                onClick={() => handleModeChange("discover")}
                className={`px-4 py-1.5 text-xs font-medium rounded-xs transition-all duration-200 ${
                  mode === "discover"
                    ? "bg-[#FBF9F5] text-[#23201D] shadow-xs"
                    : "text-[#57524C] hover:text-[#23201D]"
                }`}
              >
                Discover (Anthology)
              </button>
            </div>

            {/* Context stats or Discovery Shuffle */}
            <div className="flex items-center gap-3 text-xs text-[#878077]">
              {mode === "discover" ? (
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 text-xs text-[#57524C] hover:text-[#23201D] font-serif italic py-1 px-2.5 rounded-sm border border-[#E8E2D7] bg-[#F5F2EB]/60 hover:bg-[#F5F2EB] transition-colors"
                >
                  <svg
                    className={`w-3.5 h-3.5 text-[#C27D77] ${loading ? "animate-spin" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                  </svg>
                  <span>Wander another echo</span>
                </button>
              ) : (
                <span className="font-handwriting text-xs text-[#878077]">
                  {totalCount} {totalCount === 1 ? "letter" : "letters"} in orbit
                </span>
              )}
            </div>
          </div>

          {/* Editorial Theme Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none">
            <button
              type="button"
              onClick={() => handleThemeChange("")}
              className={`px-3 py-1 rounded-full text-xs transition-all whitespace-nowrap border ${
                selectedTheme === ""
                  ? "bg-[#23201D] text-[#FBF9F5] border-[#23201D]"
                  : "bg-[#F5F2EB]/80 text-[#57524C] border-[#E8E2D7] hover:bg-[#ECE7DE] hover:text-[#23201D]"
              }`}
            >
              All Echoes
            </button>

            {APPROVED_THEMES.map((theme) => {
              const isActive = selectedTheme === theme;
              return (
                <button
                  key={theme}
                  type="button"
                  onClick={() => handleThemeChange(theme)}
                  className={`px-3 py-1 rounded-full text-xs transition-all whitespace-nowrap border ${
                    isActive
                      ? "bg-[#C27D77]/15 text-[#8E443D] border-[#C27D77]/50 font-medium"
                      : "bg-[#F5F2EB]/80 text-[#57524C] border-[#E8E2D7] hover:bg-[#ECE7DE] hover:text-[#23201D]"
                  }`}
                >
                  {theme}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Section */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="bg-[#FBF9F5] border border-[#E8E2D7]/60 p-7 rounded-sm animate-pulse space-y-4"
              >
                <div className="flex justify-between items-center border-b border-[#E8E2D7]/40 pb-3">
                  <div className="h-4 bg-[#E8E2D7]/60 rounded w-24" />
                  <div className="h-3 bg-[#E8E2D7]/60 rounded w-16" />
                </div>
                <div className="space-y-2 py-2">
                  <div className="h-4 bg-[#E8E2D7]/50 rounded w-full" />
                  <div className="h-4 bg-[#E8E2D7]/40 rounded w-5/6" />
                  <div className="h-4 bg-[#E8E2D7]/30 rounded w-2/3" />
                </div>
                <div className="h-4 bg-[#E8E2D7]/40 rounded w-20 mt-4" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-16 px-4 bg-[#F5F2EB]/50 border border-[#E8E2D7] rounded-sm max-w-lg mx-auto">
            <p className="font-serif italic text-base text-[#23201D] mb-2">{error}</p>
            <p className="text-xs text-[#57524C] mb-6">
              The archive could not be reached or refreshed.
            </p>
            <button
              type="button"
              onClick={handleRefresh}
              className="text-xs font-medium px-4 py-1.5 rounded-sm bg-[#23201D] text-[#FBF9F5] hover:bg-[#3D3833] transition-colors"
            >
              Try again
            </button>
          </div>
        ) : letters.length === 0 ? (
          <div className="text-center py-20 px-6 bg-[#F5F2EB]/40 border border-[#E8E2D7]/80 rounded-sm max-w-md mx-auto">
            <p className="font-serif italic text-lg text-[#23201D] mb-2">
              The silence remains unbroken here.
            </p>
            <p className="text-xs text-[#57524C] leading-relaxed mb-6">
              {selectedTheme
                ? `No public letters have been released under "${selectedTheme}" yet.`
                : "No letters have been released into Orbit yet."}
            </p>
            <Link
              href="/compose"
              className="inline-flex items-center gap-1.5 text-xs font-serif italic text-[#C27D77] hover:underline underline-offset-4"
            >
              <span>Release your unspoken words</span>
              <span>→</span>
            </Link>
          </div>
        ) : (
          <div>
            {/* Grid of letters */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {letters.map((letter) => (
                <OrbitCard
                  key={letter.id}
                  id={letter.id}
                  recipientName={letter.recipientName}
                  title={letter.title}
                  content={letter.content}
                  theme={letter.theme}
                  createdAt={letter.createdAt}
                  isSaved={letter.isSaved}
                  onToggleSave={handleToggleSave}
                />
              ))}
            </div>

            {/* Pagination Controls for Latest Mode */}
            {mode === "latest" && totalPages > 1 && (
              <div className="mt-12 pt-6 border-t border-[#E8E2D7]/70 flex items-center justify-between text-xs text-[#57524C]">
                <button
                  type="button"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1}
                  className="px-3.5 py-1.5 rounded-sm border border-[#E8E2D7] bg-[#F5F2EB]/60 hover:bg-[#F5F2EB] disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-serif italic"
                >
                  ← Earlier whispers
                </button>

                <span className="font-handwriting text-xs text-[#878077]">
                  Page {page} of {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3.5 py-1.5 rounded-sm border border-[#E8E2D7] bg-[#F5F2EB]/60 hover:bg-[#F5F2EB] disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-serif italic"
                >
                  Later echoes →
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

export default function OrbitPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col bg-[#FBF9F5] paper-grain">
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <span className="font-serif italic text-sm text-[#878077] animate-pulse">
              Listening to Orbit...
            </span>
          </div>
          <Footer />
        </div>
      }
    >
      <OrbitFeed />
    </Suspense>
  );
}
