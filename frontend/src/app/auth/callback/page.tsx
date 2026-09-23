"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");
    const onboarded = searchParams.get("onboarded");

    if (token) {
      localStorage.setItem("session_token", token);
    }
    if (onboarded !== null) {
      localStorage.setItem("onboarding_completed", onboarded);
    }

    // Force page refresh or navigation so AuthProvider picks up the token
    const destination = onboarded === "true" ? "/dashboard" : "/onboarding";
    window.location.href = destination;
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      <p className="font-mono text-sm text-slate-300">Completing sign in...</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="font-mono text-sm text-slate-300">Loading...</p>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
