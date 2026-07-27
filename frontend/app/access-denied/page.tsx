"use client";

import { useEffect, useState } from "react";
import { fetchAuthConfig, buildLogoutUrl, clearTokens } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { useTheme } from "@/context/ThemeContext";

export default function AccessDeniedPage() {
  const [userInfo, setUserInfo] = useState<{ username?: string; sub?: string } | null>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    async function loadInfo() {
      try {
        const res = await fetch("/api/proxy/api/me", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setUserInfo(data);
        }
      } catch (_) {}
    }
    loadInfo();
  }, []);

  const handleLogout = async () => {
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

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 transition-colors ${
      isDark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"
    }`}>
      <div className={`max-w-lg w-full rounded-2xl border shadow-2xl p-8 text-center backdrop-blur-md ${
        isDark
          ? "border-rose-500/30 bg-slate-900/90 text-slate-100"
          : "border-rose-200 bg-white text-slate-900"
      }`}>
        {/* Access Denied Icon */}
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 flex items-center justify-center mx-auto mb-6 shadow-inner">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold tracking-tight mb-2">Access Denied</h1>
        
        <div className={`p-4 rounded-xl border mb-6 text-sm ${
          isDark
            ? "bg-slate-950/60 border-slate-800 text-slate-300"
            : "bg-slate-50 border-slate-200 text-slate-700"
        }`}>
          <p className="font-semibold text-rose-500 mb-1">No Application Role Assigned</p>
          <p className="text-xs leading-relaxed">
            You do not have the required permissions to access this application.
          </p>
          <div className="mt-3 pt-3 border-t border-slate-700/40 text-xs font-bold text-amber-500">
            Contact Support and Application Owner to request access.
          </div>
        </div>

        {/* User Keycloak Identification Box */}
        {userInfo && (
          <div className={`p-3 rounded-xl border text-xs text-left mb-6 font-mono ${
            isDark ? "bg-slate-850 border-slate-800 text-slate-400" : "bg-slate-100 border-slate-200 text-slate-600"
          }`}>
            {userInfo.username && (
              <div className="flex justify-between py-0.5">
                <span className="font-sans font-semibold text-slate-500">Username:</span>
                <span className="font-bold text-slate-200">{userInfo.username}</span>
              </div>
            )}
            {userInfo.sub && (
              <div className="flex justify-between py-0.5 truncate">
                <span className="font-sans font-semibold text-slate-500">User ID (Sub):</span>
                <span className="truncate max-w-[200px]">{userInfo.sub}</span>
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleLogout}
          className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-semibold text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign Out & Return to Login
        </button>
      </div>
    </div>
  );
}
