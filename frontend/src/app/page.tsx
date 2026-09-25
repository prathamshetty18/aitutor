"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  MessageSquare,
  Sparkles,
  ShieldAlert,
  GraduationCap,
  Lock,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "./providers";
import type { User } from "@/lib/types";

const features = [
  {
    icon: BookOpen,
    label: "Journaling",
    desc: "Voice & photo diary with AI analysis",
    color: "#E07A2F",
  },
  {
    icon: MessageSquare,
    label: "AI Chat",
    desc: "Context-aware academic assistant",
    color: "#2BA89C",
  },
  {
    icon: Sparkles,
    label: "Weekly Rewind",
    desc: "Spotify Wrapped for your week",
    color: "#7B5CF0",
  },
  {
    icon: ShieldAlert,
    label: "Smart Alerts",
    desc: "Early-warning wellbeing detection",
    color: "#E5484D",
  },
  {
    icon: GraduationCap,
    label: "Academics",
    desc: "Marks, attendance & study resources",
    color: "#4B6BFB",
  },
];

export default function LandingPage() {
  const { isLoggedIn, user, role, loginWithGoogle, onboardingData } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);

  // Surface OAuth/provisioning errors passed back by /auth/callback
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      const detail = params.get("detail");
      const table = params.get("table");
      const message =
        err === "db_write_failed"
          ? `Sign-in failed: could not create your ${table || "profile"} row. ${detail || ""} Ask your admin to run backend/migrations/ensure_cloud_schema.sql.`
          : err === "domain_not_allowed"
          ? "Only @nmamit.in student accounts can sign in."
          : `Sign-in error: ${err}. Please try again.`;

      const timer = setTimeout(() => {
        setAuthError(message);
        window.history.replaceState({}, "", window.location.pathname);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleGoToApp = () => {
    const extUser = user as (User & { onboarding_completed?: boolean }) | null;
    const isOnboarded = Boolean(onboardingData.goals) || extUser?.onboarding_completed;
    const destination =
      role === "teacher"
        ? "/teacher"
        : role === "admin"
        ? "/admin"
        : isOnboarded !== false
        ? "/dashboard"
        : "/onboarding";
    window.location.href = destination;
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Nav ─────────────────────────────── */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto w-full"
      >
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Project_logo.png"
            alt="Harmony Logo"
            className="w-10 h-10 rounded-xl object-cover shadow-sm border border-neutral-200"
          />
          <span className="font-display text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Harmony
          </span>
        </div>

        {isLoggedIn ? (
          <button
            onClick={handleGoToApp}
            className="px-5 py-2.5 rounded-full bg-gradient-to-r from-[#E07A2F] to-[#F5A623] text-white text-sm font-semibold shadow-md hover:shadow-lg transition-all hover:scale-[1.02] cursor-pointer flex items-center gap-2"
          >
            <span>Dashboard ({user?.name?.split(" ")[0] || "Account"})</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={loginWithGoogle}
            className="px-5 py-2.5 rounded-full bg-[var(--accent-primary)] text-white text-sm font-semibold shadow-md hover:shadow-lg transition-all hover:scale-[1.02] cursor-pointer flex items-center gap-2"
          >
            Login with Google
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </motion.nav>

      {/* ── Hero ────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-12">
        {authError && (
          <div className="mb-6 max-w-xl w-full p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {authError}
          </div>
        )}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          {/* Floating orbs background */}
          <div className="relative mb-8">
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-8 -left-12 w-32 h-32 rounded-full bg-gradient-to-br from-amber-200/40 to-orange-200/20 blur-2xl"
            />
            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-4 -right-8 w-40 h-40 rounded-full bg-gradient-to-br from-purple-200/30 to-blue-200/20 blur-2xl"
            />
            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-[var(--text-primary)] leading-[1.1] relative">
              The AI Tutor that knows
              <br />
              <span className="bg-gradient-to-r from-[#E07A2F] via-[#F5A623] to-[#2BA89C] bg-clip-text text-transparent">
                your grades AND your struggles
              </span>
            </h1>
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-lg md:text-xl text-[var(--text-secondary)] max-w-xl mx-auto leading-relaxed mb-10"
          >
            Journal your thoughts, chat with AI that understands your curriculum,
            track your academics, and get a beautiful weekly rewind of your progress.
          </motion.p>

          {isLoggedIn ? (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleGoToApp}
              className="px-8 py-4 rounded-2xl bg-gradient-to-r from-[#E07A2F] to-[#F5A623] text-white text-lg font-bold shadow-lg hover:shadow-xl transition-shadow cursor-pointer flex items-center gap-3 mx-auto"
            >
              <span>Go to Your Dashboard ({user?.name || "Student"})</span>
              <ArrowRight className="w-5 h-5" />
            </motion.button>
          ) : (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={loginWithGoogle}
              className="px-8 py-4 rounded-2xl bg-gradient-to-r from-[#E07A2F] to-[#F5A623] text-white text-lg font-bold shadow-lg hover:shadow-xl transition-shadow cursor-pointer flex items-center gap-3 mx-auto"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Login with Google
            </motion.button>
          )}
        </motion.div>

        {/* ── Feature strip ──────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="grid grid-cols-2 md:grid-cols-5 gap-4 max-w-5xl mx-auto w-full mb-16"
        >
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 + i * 0.1 }}
                whileHover={{ y: -4, scale: 1.02 }}
                className="axiom-card-interactive p-5 flex flex-col items-center text-center gap-3 cursor-default"
              >
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: f.color + "18" }}
                >
                  <Icon className="w-6 h-6" style={{ color: f.color }} />
                </div>
                <h3 className="font-display font-semibold text-sm text-[var(--text-primary)]">
                  {f.label}
                </h3>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">{f.desc}</p>
              </motion.div>
            );
          })}
        </motion.div>

        {/* ── Trust badge ────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-emerald-50 border border-emerald-100 mb-6"
        >
          <Lock className="w-4 h-4 text-emerald-600" />
          <span className="text-sm text-emerald-700 font-medium">
            Your journal is encrypted before it ever leaves your device.
          </span>
        </motion.div>
      </main>
    </div>
  );
}
