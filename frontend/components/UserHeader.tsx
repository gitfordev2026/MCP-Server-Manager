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

interface UserHeaderProps {
  isCollapsed?: boolean;
}

export default function UserHeader({ isCollapsed = false }: UserHeaderProps) {
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
          const wasAuthenticated = localStorage.getItem("mcp_is_authenticated") === "true";
          clearTokens();
          if (wasAuthenticated) {
            window.location.href = "/login";
          }
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
      <div className="relative w-full" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className={`w-full flex items-center gap-3 p-2 rounded-xl border transition-all shadow-2xs group cursor-pointer ${
            isCollapsed ? "justify-center" : "justify-between"
          } ${
            isDark
              ? "border-slate-800 bg-slate-900/90 hover:bg-slate-800/90 text-slate-100"
              : "border-slate-200/90 bg-slate-50 hover:bg-slate-100 text-slate-800"
          }`}
          title={isCollapsed ? `${profile?.username || 'User'} (${role.toUpperCase()})` : undefined}
        >
          {/* Avatar Icon */}
          <div className="relative flex-shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
              {profile?.username ? profile.username.charAt(0).toUpperCase() : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              )}
            </div>
            {/* Role Status Dot */}
            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 ${
              isDark ? "border-slate-900" : "border-white"
            } ${isAdmin ? "bg-purple-500" : "bg-blue-500"}`} />
          </div>

          {/* User Info & Badge (Visible when expanded) */}
          {!isCollapsed && (
            <div className="text-left flex-1 min-w-0">
              <div className="flex items-center gap-1.5 justify-between">
                <span className={`text-xs font-semibold truncate ${
                  isDark ? "text-slate-100" : "text-slate-800"
                }`}>
                  {profile?.username || "Authenticating..."}
                </span>
                {isAdmin ? (
                  <span className={`px-1.5 py-0.2 text-[9px] font-bold rounded-md border flex-shrink-0 ${
                    isDark ? "bg-purple-500/20 text-purple-300 border-purple-500/40" : "bg-purple-100 text-purple-700 border-purple-300"
                  }`}>
                    ADMIN
                  </span>
                ) : (
                  <span className={`px-1.5 py-0.2 text-[9px] font-bold rounded-md border flex-shrink-0 ${
                    isDark ? "bg-blue-500/20 text-blue-300 border-blue-500/40" : "bg-blue-100 text-blue-700 border-blue-300"
                  }`}>
                    DEV
                  </span>
                )}
              </div>
              <span className={`text-[10px] block truncate font-mono ${
                isDark ? "text-slate-400" : "text-slate-500"
              }`}>
                {profile?.sub ? `ID: ${profile.sub.substring(0, 12)}...` : "Loading..."}
              </span>
            </div>
          )}

          {!isCollapsed && (
            <svg className={`w-4 h-4 transition-transform duration-200 flex-shrink-0 ${
              dropdownOpen ? "rotate-180" : ""
            } ${isDark ? "text-slate-400" : "text-slate-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>

        {/* Dropdown Menu Popover */}
        {dropdownOpen && (
          <div className={`absolute z-50 w-60 rounded-2xl border shadow-2xl backdrop-blur-md py-2 animate-in fade-in duration-150 ${
            isCollapsed ? "left-20 bottom-0" : "bottom-full mb-2 left-0 w-full"
          } ${
            isDark
              ? "border-slate-800 bg-slate-900/95 text-slate-100 shadow-black/50"
              : "border-slate-200 bg-white/95 text-slate-800 shadow-slate-300/50"
          }`}>
            {/* Header Profile Summary */}
            <div className={`px-3.5 py-2.5 border-b ${isDark ? "border-slate-800" : "border-slate-100"}`}>
              <p className={`text-[10px] font-medium uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>Signed in as</p>
              <p className={`text-xs font-bold truncate ${isDark ? "text-slate-100" : "text-slate-900"}`}>{profile?.username || "User"}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isAdmin ? "bg-purple-500" : "bg-blue-500"}`} />
                <span className={`text-[11px] font-semibold capitalize ${isAdmin ? "text-purple-400" : "text-blue-400"}`}>
                  {role} Role
                </span>
              </div>
            </div>

            {/* Admin-Only Menu Options */}
            {isAdmin && (
              <div className="py-1 border-b border-slate-100 dark:border-slate-800/80">
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    setIsManagementOpen(true);
                  }}
                  className={`w-full text-left px-3.5 py-2 text-xs flex items-center gap-2.5 transition-colors font-medium cursor-pointer ${
                    isDark ? "text-slate-200 hover:bg-slate-800/80" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <svg className="w-4 h-4 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  User Management
                </button>

                <a
                  href="/admin/feedback"
                  onClick={() => setDropdownOpen(false)}
                  className={`w-full text-left px-3.5 py-2 text-xs flex items-center gap-2.5 transition-colors font-medium cursor-pointer ${
                    isDark ? "text-slate-200 hover:bg-slate-800/80" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                  Feedback Dashboard
                </a>
              </div>
            )}

            {/* Logout Option */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleLogoutClick}
                className={`w-full text-left px-3.5 py-2 text-xs flex items-center gap-2.5 transition-colors font-medium cursor-pointer ${
                  isDark
                    ? "text-rose-400 hover:bg-rose-500/10"
                    : "text-rose-600 hover:bg-rose-50"
                }`}
              >
                <svg className="w-4 h-4 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign Out
              </button>
            </div>
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
