"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  fetchAuthConfig,
  getStoredToken,
  redirectToLogin,
  clearTokens,
  type AuthConfig,
} from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { authenticatedFetch } from "@/services/http";
import { UserProvider, type UserProfile } from "@/context/UserContext";

/** Paths that do not require authentication or DB role check. */
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/auth/callback",
  "/auth/register",
  "/unauthorized",
  "/access-denied",
  "/_not-found",
  "/_global-error",
  "/404",
];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [roleVerified, setRoleVerified] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const currentPath = pathname || "/";
  const isPublicPath = PUBLIC_PATHS.some((p) => (p === "/" ? currentPath === "/" : currentPath.startsWith(p)));

  // --- GLOBAL INACTIVITY TIMER (15 minutes idle timeout shared across tabs) ---
  useEffect(() => {
    if (typeof window === "undefined") return;

    const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
    const ACTIVITY_KEY = "mcp_last_activity";
    let lastUpdate = 0;

    const recordActivity = () => {
      const now = Date.now();
      if (now - lastUpdate > 1000) {
        lastUpdate = now;
        try {
          localStorage.setItem(ACTIVITY_KEY, now.toString());
        } catch (_) {}
      }
    };

    if (!localStorage.getItem(ACTIVITY_KEY)) {
      localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
    }

    const events = ["mousedown", "keydown", "click", "visibilitychange"];
    events.forEach((evt) => window.addEventListener(evt, recordActivity, { passive: true }));

    const checkInterval = setInterval(() => {
      const storedLast = localStorage.getItem(ACTIVITY_KEY);
      const lastTime = storedLast ? Number(storedLast) : Date.now();
      if (Date.now() - lastTime > INACTIVITY_TIMEOUT_MS) {
        const curPath = window.location.pathname;
        if (
          curPath !== "/" &&
          !curPath.startsWith("/login") &&
          !curPath.startsWith("/auth/")
        ) {
          console.warn("[InactivityTimer] 15-minute idle limit reached — logging out");
          clearTokens();
          window.location.href = "/";
        }
      }
    }, 5000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, recordActivity));
      clearInterval(checkInterval);
    };
  }, []);

  useEffect(() => {
    if (!hydrated || isPublicPath) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const config: AuthConfig = await fetchAuthConfig(publicEnv.NEXT_PUBLIC_BE_API_URL);

        // If auth is disabled globally in config, allow access
        if (!config.auth_enabled) {
          if (!cancelled) {
            setUserProfile({
              username: "admin",
              sub: "dev-admin",
              roles: ["admin"],
              primary_role: "admin",
            });
            setRoleVerified(true);
            setLoading(false);
          }
          return;
        }

        // Check if user has an active session flag
        if (!getStoredToken()) {
          if (!cancelled) {
            await redirectToLogin(config);
          }
          return;
        }

        // --- STRICT GATEKEEPER: Call /api/me to verify DB role BEFORE rendering ---
        const res = await authenticatedFetch("/api/proxy/api/me");

        if (cancelled) return;

        if (res.ok) {
          const profile: UserProfile = await res.json();
          // User exists in DB and has an active primary_role ("admin" | "developer")
          if (profile.primary_role) {
            setUserProfile(profile);
            setRoleVerified(true);
            setLoading(false);
          } else {
            // Authenticated but no role assigned in DB
            router?.replace("/access-denied");
          }
        } else if (res.status === 403) {
          // No application role assigned -> Redirect immediately to /access-denied
          router?.replace("/access-denied");
        } else if (res.status === 401) {
          // Token/cookie invalid or expired -> Clear and redirect to login
          clearTokens();
          await redirectToLogin(config);
        } else {
          throw new Error(`HTTP ${res.status}: Failed to verify access role`);
        }
      } catch (err) {
        console.error("AuthGuard verification error:", err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to verify authorization");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, isPublicPath, pathname, attempt, router, currentPath]);

  // Render public pages immediately wrapped in UserProvider
  if (typeof window === "undefined" || !hydrated || isPublicPath) {
    return (
      <UserProvider user={userProfile} loading={false} setUser={setUserProfile}>
        {children}
      </UserProvider>
    );
  }

  // Show loading spinner while verifying authorization on client (prevents UI flashing)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500 mx-auto mb-4" />
          <p className="text-slate-300 font-medium text-sm">Verifying access permissions...</p>
        </div>
      </div>
    );
  }

  // Show error UI if backend is unreachable
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
        <div className="max-w-md w-full rounded-2xl border border-red-500/30 bg-slate-800 shadow-xl p-6 text-center text-slate-100">
          <h2 className="text-lg font-semibold text-red-400 mb-2">Authentication Unavailable</h2>
          <p className="text-sm text-slate-300 mb-4">
            Unable to verify your authorization with the server.
          </p>
          <p className="text-xs font-mono text-red-300/80 mb-6 bg-slate-900/60 p-3 rounded-lg break-words">
            {error}
          </p>
          <button
            onClick={() => setAttempt((v) => v + 1)}
            className="w-full inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-white text-sm font-semibold hover:bg-indigo-500 transition-colors shadow-md cursor-pointer"
          >
            Retry Verification
          </button>
        </div>
      </div>
    );
  }

  // Only render protected children after role verification succeeds
  if (roleVerified) {
    return (
      <UserProvider user={userProfile} loading={loading} setUser={setUserProfile}>
        {children}
      </UserProvider>
    );
  }

  return null;
}
