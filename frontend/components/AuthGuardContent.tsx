"use client";

import { useEffect, useState, useSyncExternalStore, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  fetchAuthConfig,
  getStoredToken,
  redirectToLogin,
  clearTokens,
  type AuthConfig,
} from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { authenticatedFetch } from "@/services/http";

/** Paths that do not require authentication or DB role check. */
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/new",
  "/auth/callback",
  "/auth/register",
  "/unauthorized",
  "/access-denied",
  "/_not-found",
  "/_global-error",
  "/404",
];

export default function AuthGuardContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [roleVerified, setRoleVerified] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // System Maintenance Mode state
  const [maintenanceActive, setMaintenanceActive] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [checkingMaint, setCheckingMaint] = useState(false);

  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const currentPath = pathname || "/";
  const isPublicPath = PUBLIC_PATHS.some((p) => (p === "/" ? currentPath === "/" : currentPath.startsWith(p)));

  const checkMaintenanceStatus = useCallback(async () => {
    try {
      setCheckingMaint(true);
      const maintRes = await fetch("/api/proxy/api/system/maintenance", { cache: "no-store" });
      if (maintRes.ok) {
        const maintData = await maintRes.json();
        setMaintenanceActive(Boolean(maintData.enabled));
        if (maintData.message) {
          setMaintenanceMessage(maintData.message);
        }
      }
    } catch (err) {
      console.warn("AuthGuard: failed to check maintenance status", err);
    } finally {
      setCheckingMaint(false);
    }
  }, []);

  // --- GLOBAL INACTIVITY TIMER (15 minutes idle timeout shared across tabs) ---
  useEffect(() => {
    if (typeof window === "undefined") return;

    const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
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
        const currentPath = window.location.pathname;
        if (
          currentPath !== "/" &&
          !currentPath.startsWith("/login") &&
          !currentPath.startsWith("/new") &&
          !currentPath.startsWith("/auth/")
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
    if (!hydrated) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setRoleVerified(false);

      try {
        // 1. Check System Maintenance Mode status FIRST
        let isMaintMode = false;
        let maintMsg = "";
        try {
          const maintRes = await fetch("/api/proxy/api/system/maintenance", { cache: "no-store" });
          if (maintRes.ok) {
            const maintData = await maintRes.json();
            isMaintMode = Boolean(maintData.enabled);
            maintMsg = maintData.message || "System is undergoing scheduled maintenance.";
          }
        } catch (_) {}

        if (!cancelled) {
          setMaintenanceActive(isMaintMode);
          setMaintenanceMessage(maintMsg);
        }

        // 2. Fetch User Profile if token exists
        let currentRole: string | null = null;
        if (getStoredToken()) {
          try {
            const res = await authenticatedFetch("/api/proxy/api/me");
            if (res.ok) {
              const profile = await res.json();
              currentRole = profile.primary_role || null;
              if (!cancelled) {
                setUserRole(currentRole);
                if (currentRole) setRoleVerified(true);
              }
            }
          } catch (_) {}
        }

        // 3. STRICT MAINTENANCE MODE RULE:
        const isSecretAdminRoute = currentPath.startsWith("/new") || currentPath.startsWith("/auth/");
        const isAdminUser = currentRole === "admin" || currentRole === "super_admin";

        if (isMaintMode && !isSecretAdminRoute && !isAdminUser) {
          if (!cancelled) {
            setLoading(false);
          }
          return; // STOP execution — do NOT redirect to Keycloak!
        }

        // 4. Handle Public Paths for normal operating mode
        if (isPublicPath) {
          if (!cancelled) setLoading(false);
          return;
        }

        const config: AuthConfig = await fetchAuthConfig(publicEnv.NEXT_PUBLIC_BE_API_URL);

        if (!config.auth_enabled) {
          if (!cancelled) {
            setRoleVerified(true);
            setLoading(false);
          }
          return;
        }

        if (!getStoredToken()) {
          if (!cancelled) {
            await redirectToLogin(config);
          }
          return;
        }

        if (!currentRole) {
          const res = await authenticatedFetch("/api/proxy/api/me");
          if (cancelled) return;
          if (res.ok) {
            const profile = await res.json();
            if (profile.primary_role) {
              setUserRole(profile.primary_role);
              setRoleVerified(true);
              setLoading(false);
            } else {
              router?.replace("/access-denied");
            }
          } else if (res.status === 403) {
            router?.replace("/access-denied");
          } else if (res.status === 401) {
            clearTokens();
            await redirectToLogin(config);
          } else {
            throw new Error(`HTTP ${res.status}: Failed to verify access role`);
          }
        } else {
          if (!cancelled) setLoading(false);
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
  }, [hydrated, isPublicPath, currentPath, attempt, router]);

  // --- SELF-CONTAINED PERFECTLY CENTERED MAINTENANCE MODE SCREEN ---
  const isSecretAdminRoute = currentPath.startsWith("/new") || currentPath.startsWith("/auth/");
  const isAdminUser = userRole === "admin" || userRole === "super_admin";

  if (maintenanceActive && !isSecretAdminRoute && !isAdminUser) {
    return (
      <div className="maint-wrapper">
        <style jsx global>{`
          .maint-wrapper {
            min-height: 100vh;
            width: 100%;
            background-color: #060a10;
            color: #eaf2fa;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            padding: 24px 16px;
            box-sizing: border-box;
            position: relative;
            overflow-x: hidden;
          }
          .maint-grid-bg {
            position: fixed;
            inset: 0;
            pointer-events: none;
            opacity: 0.15;
            background-image: radial-gradient(#38bdf8 1px, transparent 1px);
            background-size: 24px 24px;
          }
          .maint-card {
            background-color: rgba(13, 19, 28, 0.92);
            border: 1px solid rgba(245, 181, 76, 0.25);
            border-radius: 24px;
            padding: 36px 28px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
            max-width: 560px;
            width: 100%;
            margin: auto;
            text-align: center;
            position: relative;
            z-index: 20;
            backdrop-filter: blur(16px);
            box-sizing: border-box;
          }
          .maint-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 5px 14px;
            border-radius: 999px;
            background: rgba(245, 181, 76, 0.12);
            border: 1px solid rgba(245, 181, 76, 0.3);
            color: #f5b54c;
            font-family: ui-monospace, monospace;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
          }
          .maint-btn-primary {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 10px 20px;
            border-radius: 12px;
            background-color: #1e293b;
            color: #eaf2fa;
            border: 1px solid #334155;
            font-size: 12.5px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.15s ease, border-color 0.15s ease;
          }
          .maint-btn-primary:hover {
            background-color: #334155;
            border-color: #475569;
          }
          .maint-btn-admin {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 10px 20px;
            border-radius: 12px;
            background-color: rgba(245, 181, 76, 0.12);
            color: #f5b54c;
            border: 1px solid rgba(245, 181, 76, 0.3);
            font-size: 12.5px;
            font-weight: 600;
            text-decoration: none;
            transition: background 0.15s ease;
          }
          .maint-btn-admin:hover {
            background-color: rgba(245, 181, 76, 0.22);
          }
        `}</style>

        <div className="maint-grid-bg" />

        {/* Top Header */}
        <header className="relative z-20 flex items-center justify-between w-full max-w-[560px] mx-auto pt-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center font-bold text-slate-950 text-sm shadow-md shadow-amber-500/20">
              M
            </div>
            <span className="font-bold text-sm text-white tracking-tight">MCP Manager</span>
          </div>

          <div className="maint-badge">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            MAINTENANCE MODE ACTIVE
          </div>
        </header>

        {/* Center Maintenance Content Card */}
        <main className="maint-card">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 text-2xl mb-4">
            ⚠️
          </div>

          <h1 className="text-2xl font-extrabold text-white tracking-tight mb-2">
            System Under Maintenance
          </h1>

          <p className="text-slate-300 text-xs leading-relaxed max-w-md mx-auto mb-6">
            {maintenanceMessage || "The MCP Server Manager control plane is currently undergoing scheduled system maintenance and database updates."}
          </p>

          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 font-mono text-[11px] text-slate-400 text-left space-y-1.5 mb-6">
            <div className="flex items-center justify-between text-slate-200 font-bold border-b border-slate-800 pb-1.5">
              <span>SYSTEM STATUS</span>
              <span className="text-amber-400">UPDATING</span>
            </div>
            <div className="flex justify-between pt-1">
              <span>Control Plane Engine:</span>
              <span className="text-slate-300">FastMCP v3.4.4</span>
            </div>
            <div className="flex justify-between">
              <span>Public Endpoints:</span>
              <span className="text-amber-400">Temporarily Paused</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => void checkMaintenanceStatus()}
              disabled={checkingMaint}
              className="maint-btn-primary"
            >
              {checkingMaint ? "Checking..." : "Refresh Status"}
            </button>

            <Link href="/new" className="maint-btn-admin">
              Admin Gateway →
            </Link>
          </div>
        </main>

        {/* Footer */}
        <footer className="relative z-20 w-full max-w-[560px] mx-auto flex items-center justify-between text-[11px] text-slate-500 font-mono pb-2">
          <span>MCP SERVER MANAGER</span>
          <span className="text-right">ENTERPRISE MAINTENANCE ENGINE</span>
        </footer>
      </div>
    );
  }

  // 1. Render public pages or un-hydrated SSR prerenders immediately without blocking
  if (!hydrated || isPublicPath) {
    return <>{children}</>;
  }

  // 2. Show error UI if verification encountered backend error
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

  // 3. Render protected children ONLY after role verification succeeds on client
  if (hydrated && !loading && roleVerified) {
    return <>{children}</>;
  }

  // 4. Gatekeeper Loading Screen: Prevents ANY flash of protected content before authorization
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 backdrop-blur-xl">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mx-auto shadow-lg shadow-indigo-500/10">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-400" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-200">Verifying Permissions</h3>
          <p className="text-xs text-slate-400 mt-1">Checking Keycloak authorization & RBAC role access...</p>
        </div>
      </div>
    </div>
  );
}
