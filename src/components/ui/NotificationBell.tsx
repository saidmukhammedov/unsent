"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { NotificationItem } from "@/types/domain";

export function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ignore = false;

    async function loadNotifications() {
      try {
        const res = await fetch("/api/notifications");
        const json = await res.json();
        if (!ignore && json.success) {
          setNotifications(json.data.items || []);
          setUnreadCount(json.data.unreadCount || 0);
        }
      } catch {
        // Quiet failure
      }
    }

    loadNotifications();

    // Poll quietly every 60 seconds
    const interval = setInterval(loadNotifications, 60000);
    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, []);

  // Close panel on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // Quiet ignore
    }
    setIsOpen(false);
  };

  const handleMarkAllRead = async () => {
    if (loading || unreadCount === 0) return;
    setLoading(true);
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // Quiet ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="View echoes and notifications"
        title="Notifications"
        className="relative p-1.5 text-[#57524C] hover:text-[#23201D] transition-colors rounded-sm hover:bg-[#F5F2EB]"
      >
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-[#C27D77] text-[9px] font-mono text-white flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Drawer / Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] max-w-sm sm:w-96 bg-[#FBF9F5] border border-[#E8E2D7] rounded-sm shadow-[0_8px_30px_rgba(35,32,29,0.08)] z-50 animate-fade-in overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#E8E2D7]/70 flex items-center justify-between bg-[#F5F2EB]/50">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C27D77]" />
              <span className="font-serif italic text-xs text-[#23201D]">
                Echoes & Whispers
              </span>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={loading}
                className="text-[11px] font-serif italic text-[#878077] hover:text-[#C27D77] transition-colors"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-[#E8E2D7]/50 scrollbar-none">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#878077]">
                <p className="font-serif italic text-sm text-[#57524C] mb-1">
                  The sanctuary is quiet.
                </p>
                <p>When someone whispers an echo to your letters, it will appear here.</p>
              </div>
            ) : (
              notifications.map((n) => {
                const targetUrl = n.letterId ? `/orbit/${n.letterId}` : "#";
                const preview = n.payload?.preview || "Someone left an anonymous echo.";
                const recipient = n.payload?.recipientName
                  ? `To: ${n.payload.recipientName}`
                  : "To: Someone";

                return (
                  <div
                    key={n.id}
                    className={`p-3.5 transition-colors text-xs ${
                      !n.isRead
                        ? "bg-[#F5F2EB]/80 border-l-2 border-l-[#C27D77]"
                        : "hover:bg-[#F5F2EB]/40"
                    }`}
                  >
                    <Link
                      href={targetUrl}
                      onClick={() => handleMarkAsRead(n.id)}
                      className="block space-y-1"
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="font-serif italic text-[11px] text-[#57524C]">
                          {recipient}
                        </span>
                        <span className="font-handwriting text-[10px] text-[#878077]">
                          {new Date(n.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>

                      <p className="font-serif text-xs text-[#23201D]/90 line-clamp-2 italic">
                        &ldquo;{preview}&rdquo;
                      </p>
                    </Link>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
