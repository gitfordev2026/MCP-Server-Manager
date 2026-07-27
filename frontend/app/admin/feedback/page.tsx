"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import { authenticatedFetch } from "@/services/http";
import Navigation from "@/components/Navigation";

interface FeedbackItem {
  id: number;
  user_id: number | null;
  username: string;
  rating: number;
  feedback_text: string;
  created_on: string;
}

export default function AdminFeedbackPage() {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [avgRating, setAvgRating] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    async function loadFeedbackData() {
      setLoading(true);
      try {
        const res = await authenticatedFetch("/api/proxy/api/admin/feedback");
        if (res.ok) {
          const data = await res.json();
          setFeedbacks(data.feedbacks || []);
          setTotalCount(data.total_count || 0);
          setAvgRating(data.average_rating || 0);
        } else if (res.status === 403) {
          setError("Access Denied: You must be an Admin to view the Feedback Dashboard.");
        } else {
          setError(`HTTP ${res.status}: Failed to load feedback submissions.`);
        }
      } catch (err) {
        console.error("Failed to load feedback:", err);
        setError("Network error while connecting to feedback service.");
      } finally {
        setLoading(false);
      }
    }
    loadFeedbackData();
  }, []);

  return (
    <div className={`min-h-screen flex flex-col transition-colors ${
      isDark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"
    }`}>
      <Navigation />

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-700/40 pb-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <svg className="w-7 h-7 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
              </svg>
              User Feedback & Satisfaction Dashboard
            </h1>
            <p className={`text-xs mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Admin-only overview of user ratings and logout feedback submissions
            </p>
          </div>

          <a
            href="/dashboard"
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              isDark
                ? "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            ← Back to Dashboard
          </a>
        </div>

        {/* Error State */}
        {error ? (
          <div className="p-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-center max-w-lg mx-auto">
            <svg className="w-10 h-10 mx-auto mb-2 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="font-bold text-sm">{error}</p>
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className={`p-5 rounded-2xl border ${
                isDark ? "border-slate-800 bg-slate-900/80" : "border-slate-200 bg-white"
              }`}>
                <p className={`text-xs font-semibold uppercase ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Total Submissions
                </p>
                <p className="text-3xl font-extrabold mt-2 text-indigo-500">{totalCount}</p>
              </div>

              <div className={`p-5 rounded-2xl border ${
                isDark ? "border-slate-800 bg-slate-900/80" : "border-slate-200 bg-white"
              }`}>
                <p className={`text-xs font-semibold uppercase ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Average Rating
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <p className="text-3xl font-extrabold text-amber-400">{avgRating} / 5.0</p>
                  <div className="flex text-amber-400">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <svg
                        key={s}
                        className={`w-4 h-4 ${s <= Math.round(avgRating) ? "fill-amber-400" : "text-slate-600"}`}
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                      </svg>
                    ))}
                  </div>
                </div>
              </div>

              <div className={`p-5 rounded-2xl border ${
                isDark ? "border-slate-800 bg-slate-900/80" : "border-slate-200 bg-white"
              }`}>
                <p className={`text-xs font-semibold uppercase ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Satisfaction Score
                </p>
                <p className="text-3xl font-extrabold mt-2 text-emerald-500">
                  {totalCount > 0 ? Math.round((avgRating / 5) * 100) : 0}%
                </p>
              </div>
            </div>

            {/* Table Section */}
            <div className={`rounded-2xl border overflow-hidden shadow-lg ${
              isDark ? "border-slate-800 bg-slate-900/80" : "border-slate-200 bg-white"
            }`}>
              <div className={`px-6 py-4 border-b font-bold text-sm ${
                isDark ? "border-slate-800 bg-slate-900" : "border-slate-100 bg-slate-50"
              }`}>
                User Feedback History
              </div>

              {loading ? (
                <div className="p-12 text-center text-slate-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-3" />
                  Loading feedback responses...
                </div>
              ) : feedbacks.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-sm">
                  No feedback submissions recorded yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className={`font-semibold border-b ${
                      isDark ? "bg-slate-950/60 text-slate-400 border-slate-800" : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}>
                      <tr>
                        <th className="px-6 py-3.5">User</th>
                        <th className="px-6 py-3.5">Rating</th>
                        <th className="px-6 py-3.5">Feedback & Suggestions</th>
                        <th className="px-6 py-3.5 text-right">Submitted Date</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${
                      isDark ? "divide-slate-800/60" : "divide-slate-200/60"
                    }`}>
                      {feedbacks.map((item) => (
                        <tr key={item.id} className={`transition-colors ${
                          isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"
                        }`}>
                          <td className="px-6 py-4 font-semibold">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-md bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold">
                                {item.username.charAt(0).toUpperCase()}
                              </div>
                              {item.username}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <svg
                                  key={star}
                                  className={`w-3.5 h-3.5 ${
                                    star <= item.rating
                                      ? "text-amber-400 fill-amber-400"
                                      : isDark
                                      ? "text-slate-700"
                                      : "text-slate-300"
                                  }`}
                                  fill="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                                </svg>
                              ))}
                              <span className="ml-1 text-[11px] font-bold text-amber-400">{item.rating}.0</span>
                            </div>
                          </td>
                          <td className={`px-6 py-4 max-w-md ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                            {item.feedback_text ? (
                              <p className="whitespace-pre-wrap">{item.feedback_text}</p>
                            ) : (
                              <span className="italic text-slate-500 text-[11px]">No written feedback provided</span>
                            )}
                          </td>
                          <td className={`px-6 py-4 text-right font-mono text-[11px] ${
                            isDark ? "text-slate-400" : "text-slate-500"
                          }`}>
                            {item.created_on ? new Date(item.created_on).toLocaleString() : "N/A"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
