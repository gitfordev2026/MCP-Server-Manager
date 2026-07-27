"use client";

import { useEffect, useState } from "react";
import { fetchAuthConfig, buildLogoutUrl, clearTokens } from "@/lib/auth";
import { publicEnv } from "@/lib/env";

export default function UnauthorizedPage() {
  const [user, setUser] = useState<{ username: string; email: string; sub: string } | null>(null);

  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch(`${publicEnv.NEXT_PUBLIC_BE_API_URL}/api/me`);
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        }
      } catch (_) {}
    }
    loadUser();
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
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full rounded-2xl border border-amber-500/30 bg-slate-900/90 shadow-2xl p-8 text-center relative z-10 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
        {/* Shield Alert Header Icon */}
        <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto mb-6 shadow-lg shadow-amber-500/10">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-slate-100 mb-2">Account Role Approval Required</h1>
        <p className="text-xs text-slate-400 mb-6 leading-relaxed">
          Your account is successfully authenticated, but no application role (<span className="text-purple-400 font-medium">Admin</span> or <span className="text-blue-400 font-medium">Developer</span>) has been assigned yet. Please contact a system administrator to approve access.
        </p>

        {/* User Account Details Card */}
        {user && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-left mb-6 text-xs space-y-2">
            <div className="flex items-center justify-between text-slate-400 border-b border-slate-800/80 pb-2">
              <span className="flex items-center gap-1.5 font-medium text-slate-300">
                <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Authenticated User
              </span>
              <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                Pending Role
              </span>
            </div>
            <div className="pt-1">
              <span className="text-slate-500 block text-[10px]">Username</span>
              <span className="font-semibold text-slate-200 truncate block">{user.username}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Email</span>
              <span className="text-slate-300 truncate block">{user.email || "No email provided"}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Keycloak Subject (ID)</span>
              <span className="font-mono text-[10px] text-slate-400 truncate block">{user.sub}</span>
            </div>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleLogout}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold py-3 px-4 shadow-lg shadow-rose-600/20 transition-all cursor-pointer"
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
