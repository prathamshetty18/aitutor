"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { GraduationCap, RefreshCw } from "lucide-react";
import type { Role, User, OnboardingData, SwotData } from "@/lib/types";
import { getBackendUrl } from "@/lib/backend";

interface AuthContextType {
  user: User | null;
  role: Role;
  isLoggedIn: boolean;
  isLoading: boolean;
  onboardingData: OnboardingData;
  loginWithGoogle: () => void;
  logout: () => Promise<void>;
  setRole: (role: Role) => void;
  updateOnboarding: (data: Partial<OnboardingData>) => void;
  updateSwot: (swot: Partial<SwotData>) => void;
  /** @deprecated Use loginWithGoogle() instead */
  login: (role: Role, email?: string) => void;
  /** @deprecated no-op — Supabase removed */
  setAuthenticatedUser: (user: User) => void;
}

const defaultOnboarding: OnboardingData = {
  swot: { strengths: "", weaknesses: "", opportunities: "", threats: "" },
  marksheetFile: null,
  goals: "",
  goalTags: [],
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PROTECTED_PREFIXES = ["/dashboard", "/onboarding", "/teacher", "/admin", "/demo"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [role, setRoleState] = useState<Role>("student");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [onboardingData, setOnboardingData] = useState<OnboardingData>(defaultOnboarding);

  const isProtectedRoute = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  // ---------------------------------------------------------------------------
  // 1. Session Hydration — single call to /api/auth/me (backend-managed JWT)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true;

    async function checkSession() {
      try {
        const headers: Record<string, string> = {};
        if (typeof window !== "undefined") {
          const token = localStorage.getItem("session_token");
          if (token) {
            headers["Authorization"] = `Bearer ${token}`;
          }
        }

        const res = await fetch(`${getBackendUrl()}/api/auth/me`, {
          method: "GET",
          headers,
          credentials: "include",
        });

        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.user) {
            const u = data.user;
            const activeUser: User = {
              id: u.id,
              email: u.email,
              name: u.name,
              role: (u.role as Role) || "student",
              collegeId: u.collegeId || u.id,
              avatarUrl: u.avatarUrl || undefined,
              department: u.department || "Computer Science & Engineering",
            };
            setUser(activeUser);
            setRoleState(activeUser.role);
            setIsLoggedIn(true);

            // Track onboarding completion for redirect logic.
            // /api/auth/me returns camelCase (onboardingCompleted) via UserProfile.
            const rawUser = u as { onboardingCompleted?: boolean };
            const extUser = activeUser as User & { onboarding_completed?: boolean };
            if (rawUser.onboardingCompleted !== undefined) {
              extUser.onboarding_completed = rawUser.onboardingCompleted;
            }

            // Hydrate onboarding data if present
            if (u.swot || u.goals) {
              setOnboardingData({
                swot: u.swot || defaultOnboarding.swot,
                marksheetFile: null,
                goals: u.goals || "",
                goalTags: u.goalTags || [],
              });
            }
          }
        } else {
          if (isMounted) {
            setUser(null);
            setIsLoggedIn(false);
          }
        }
      } catch {
        if (isMounted) {
          setUser(null);
          setIsLoggedIn(false);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    checkSession();
    return () => { isMounted = false; };
  }, []);

  // ---------------------------------------------------------------------------
  // 2. Client-Side Route Protection & Redirects
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isLoading) {
      if (!isLoggedIn && isProtectedRoute) {
        router.replace("/");
      } else if (isLoggedIn && pathname === "/") {
        const extUser = user as (User & { onboarding_completed?: boolean }) | null;
        const isOnboarded = Boolean(onboardingData.goals) || extUser?.onboarding_completed;
        if (role === "teacher") {
          router.replace("/teacher");
        } else if (role === "admin") {
          router.replace("/admin");
        } else {
          router.replace(isOnboarded ? "/dashboard" : "/onboarding");
        }
      } else if (isLoggedIn && pathname === "/onboarding" && (user as (User & { onboarding_completed?: boolean }) | null)?.onboarding_completed) {
        // Already onboarded — never trap them in the wizard again
        router.replace("/dashboard");
      }
    }
  }, [isLoading, isLoggedIn, isProtectedRoute, pathname, role, router, onboardingData.goals, user]);

  // ---------------------------------------------------------------------------
  // 3. Google OAuth — redirects to backend which handles the full flow
  // ---------------------------------------------------------------------------
  const loginWithGoogle = useCallback(() => {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `${getBackendUrl()}/api/auth/google`;
  }, []);

  // ---------------------------------------------------------------------------
  // 4. Logout
  // ---------------------------------------------------------------------------
  const logout = useCallback(async () => {
    try {
      await fetch(`${getBackendUrl()}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore
    } finally {
      setUser(null);
      setIsLoggedIn(false);
      setRoleState("student");
      setOnboardingData(defaultOnboarding);
      router.push("/");
    }
  }, [router]);

  // ---------------------------------------------------------------------------
  // 5. Onboarding data helpers
  // ---------------------------------------------------------------------------
  const updateOnboarding = useCallback((data: Partial<OnboardingData>) => {
    setOnboardingData((prev) => ({ ...prev, ...data }));
  }, []);

  const updateSwot = useCallback((swot: Partial<SwotData>) => {
    setOnboardingData((prev) => ({
      ...prev,
      swot: { ...prev.swot, ...swot },
    }));
  }, []);

  // ---------------------------------------------------------------------------
  // 6. Legacy stubs (kept for interface compatibility)
  // ---------------------------------------------------------------------------
  const login = useCallback(() => {
    console.warn("[auth] mock login() is disabled — use loginWithGoogle()");
  }, []);

  const setAuthenticatedUser = useCallback(() => {
    // no-op — auth is backend-managed
  }, []);

  const setRole = useCallback((newRole: Role) => {
    setRoleState(newRole);
  }, []);

  // Block protected routes while loading
  if (isProtectedRoute && (isLoading || !isLoggedIn)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--background,#f9fafb)]">
        <div className="w-14 h-14 rounded-2xl bg-[#E07A2F]/10 flex items-center justify-center text-[#E07A2F] mb-4">
          <GraduationCap className="w-7 h-7" />
        </div>
        <div className="flex items-center gap-2.5 text-sm text-[var(--text-muted)] font-medium">
          <RefreshCw className="w-4 h-4 animate-spin text-[#E07A2F]" />
          <span>Verifying secure session...</span>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isLoggedIn,
        isLoading,
        onboardingData,
        loginWithGoogle,
        setAuthenticatedUser,
        login,
        logout,
        setRole,
        updateOnboarding,
        updateSwot,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
