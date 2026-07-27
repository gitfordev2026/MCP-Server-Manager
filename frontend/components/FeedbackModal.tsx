"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fetchAuthConfig, buildLogoutUrl, clearTokens } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { useTheme } from "@/context/ThemeContext";
import { authenticatedFetch } from "@/services/http";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ isOpen, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const performLogout = async () => {
    try {
      const config = await fetchAuthConfig(publicEnv.NEXT_PUBLIC_BE_API_URL);
      clearTokens();
      if (config.auth_enabled && config.logout_endpoint) {
        window.location.href = buildLogoutUrl(config);
        return;
      }
    } catch (_) {
      clearTokens();
    }
    window.location.href = "/login";
  };

  const handleSubmitAndLogout = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // If user provided a rating or feedback text, submit to backend
      if (rating > 0 || feedbackText.trim().length > 0) {
        await authenticatedFetch("/api/proxy/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rating: rating > 0 ? rating : 5,
            feedback_text: feedbackText.trim() || undefined,
          }),
        }).catch((err) => console.error("Feedback submit error:", err));
      }
    } catch (err) {
      console.error("Error during feedback submission:", err);
    } finally {
      await performLogout();
    }
  };

  return createPortal(
    <div className={`fixed inset-0 z-[99999] overflow-y-auto p-4 backdrop-blur-md grid place-items-center animate-in fade-in duration-200 ${
      isDark ? "bg-slate-950/80" : "bg-slate-900/50"
    }`}>
      <div className={`relative w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden p-6 text-center my-auto ${
        isDark
          ? "border-slate-700/80 bg-slate-900 text-slate-100"
          : "border-slate-200 bg-white text-slate-900"
      }`}>
        {/* Header */}
        <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-500 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </div>

        <h3 className="text-lg font-bold mb-1">Your Experience Matters</h3>
        <p className={`text-xs mb-6 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          Before signing out, please take a moment to rate your experience and provide feedback.
        </p>

        <form onSubmit={handleSubmitAndLogout} className="space-y-4">
          {/* Star Rating Input */}
          <div className="flex items-center justify-center gap-2 py-2">
            {[1, 2, 3, 4, 5].map((star) => {
              const active = (hoverRating || rating) >= star;
              return (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 transition-transform hover:scale-125 focus:outline-none cursor-pointer"
                >
                  <svg
                    className={`w-8 h-8 ${
                      active
                        ? "text-amber-400 fill-amber-400 drop-shadow"
                        : isDark
                        ? "text-slate-700"
                        : "text-slate-300"
                    }`}
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                  </svg>
                </button>
              );
            })}
          </div>

          {/* Feedback Text Area */}
          <div>
            <textarea
              rows={3}
              placeholder="Feedback and Suggestions (optional)..."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              className={`w-full p-3 rounded-xl border text-xs outline-none transition-colors ${
                isDark
                  ? "bg-slate-950 border-slate-700 text-white placeholder-slate-500 focus:border-purple-500"
                  : "bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-purple-500"
              }`}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 py-2 px-4 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                isDark
                  ? "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {submitting ? "Signing Out..." : "Submit & Logout"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
