"use client";

import { useEffect, useState, useRef } from "react";
import { useTheme } from "@/context/ThemeContext";
import { authenticatedFetch } from "@/services/http";
import { clearTokens } from "@/lib/auth";
import UserManagementModal from "./UserManagementModal";
import FeedbackModal from "./FeedbackModal";

export interface UserProfile {
  username: string;
  sub: string;
  roles: string[];
  primary_role: "admin" | "developer" | null;
}

export default function UserHeader() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isManagementOpen, setIsManagementOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await authenticatedFetch("/api/proxy/api/me");
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
        } else if (res.status === 403) {
          window.location.href = "/access-denied";
        } else if (res.status === 401) {
          // Cookie expired or not set. Only redirect to login if we
          // believe the user was previously authenticated (has the flag).
          const wasAuthenticated = localStorage.getItem("mcp_is_authenticated") === "true";
          clearTokens();
          if (wasAuthenticated) {
            window.location.href = "/login";
          }
          // If not previously authenticated, just stay — the page layout
          // or other guards will handle the redirect.
        }
      } catch (err) {
        console.error("Failed to load user profile:", err);
      }
    }
    loadProfile();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogoutClick = () => {
    setDropdownOpen(false);
    setIsFeedbackOpen(true);
  };

  const role = profile?.primary_role || "developer";
  const isAdmin = role === "admin";

  return (
    <>
      <div className="relative inline-block text-left" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className={`flex items-center gap-3 px-3 py-1.5 rounded-xl border transition-all shadow-sm group cursor-pointer ${
            isDark
              ? "border-slate-700/60 bg-slate-900/80 hover:bg-slate-800/80 text-slate-100"
              : "border-slate-200 bg-white hover:bg-slate-50 text-slate-800"
          }`}
        >
          {/* Avatar Icon */}
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center text-white font-semibold text-sm shadow-md flex-shrink-0">
            {profile?.username ? profile.username.charAt(0).toUpperCase() : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            )}
          </div>

          {/* User Info & Badge */}
          <div className="text-left hidden sm:block">
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-semibold transition-colors ${
                isDark ? "text-slate-100 group-hover:text-white" : "text-slate-800 group-hover:text-slate-900"
              }`}>
                {profile?.username || "Authenticating..."}
              </span>
              {/* Role Badge */}
              {isAdmin ? (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                  isDark
                    ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                    : "bg-purple-100 text-purple-700 border-purple-300"
                }`}>
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  ADMIN
                </span>
              ) : (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                  isDark
                    ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
                    : "bg-blue-100 text-blue-700 border-blue-300"
                }`}>
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  DEVELOPER
                </span>
              )}
            </div>
            <span className={`text-[11px] block truncate max-w-[140px] font-mono ${
              isDark ? "text-slate-400" : "text-slate-500"
            }`}>
              ID: {profile?.sub ? profile.sub.substring(0, 10) + "..." : "..."}
            </span>
          </div>

          <svg className={`w-4 h-4 transition-transform duration-200 ${
            isDark ? "text-slate-400 group-hover:text-slate-200" : "text-slate-500 group-hover:text-slate-700"
          }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown Menu */}
        {dropdownOpen && (
          <div className={`absolute right-0 mt-2 w-64 rounded-2xl border shadow-2xl backdrop-blur-md py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150 ${
            isDark
              ? "border-slate-700/80 bg-slate-900/95 text-slate-100"
              : "border-slate-200 bg-white/95 text-slate-800"
          }`}>
            {/* Header Profile Summary */}
            <div className={`px-4 py-3 border-b ${
              isDark ? "border-slate-800" : "border-slate-100"
            }`}>
              <p className={`text-xs font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>Signed in as</p>
              <p className={`text-sm font-bold truncate ${isDark ? "text-slate-100" : "text-slate-900"}`}>{profile?.username || "User"}</p>
              <p className={`text-xs font-mono truncate ${isDark ? "text-slate-400" : "text-slate-500"}`}>ID: {profile?.sub || "N/A"}</p>
              <div className="mt-2 flex items-center gap-1.5">
                <svg className={`w-3.5 h-3.5 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span className={`text-xs font-medium capitalize ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                  {role} Role Active
                </span>
              </div>
            </div>

            {/* Admin Options */}
            {isAdmin && (
              <>
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    setIsManagementOpen(true);
                  }}
                  className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2 transition-colors font-medium cursor-pointer ${
                    isDark ? "text-slate-200 hover:bg-slate-800/80" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  User Management
                </button>

                <a
                  href="/admin/feedback"
                  className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2 transition-colors font-medium cursor-pointer ${
                    isDark ? "text-slate-200 hover:bg-slate-800/80" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                  Feedback Dashboard
                </a>
              </>
            )}

            {/* Logout Button */}
            <button
              onClick={handleLogoutClick}
              className={`w-full text-left px-4 py-2.5 text-xs flex items-center gap-2 transition-colors font-medium border-t mt-1 cursor-pointer ${
                isDark
                  ? "text-rose-400 hover:bg-rose-500/10 border-slate-800/60"
                  : "text-rose-600 hover:bg-rose-50 border-slate-100"
              }`}
            >
              <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        )}
      </div>

      {/* Admin User Management Modal */}
      {isManagementOpen && (
        <UserManagementModal isOpen={isManagementOpen} onClose={() => setIsManagementOpen(false)} />
      )}

      {/* Feedback Rating Modal on Logout */}
      {isFeedbackOpen && (
        <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
      )}
    </>
  );
}
