"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "../providers";
import { STUDENT_TABS, ROUTES } from "@/lib/constants";
import {
  Home,
  BookOpen,
  MessageSquare,
  GraduationCap,
  User,
  Sparkles,
  LogOut,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  home: Home,
  journal: BookOpen,
  chat: MessageSquare,
  academics: GraduationCap,
  profile: User,
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const getActiveTab = () => {
    if (pathname === ROUTES.dashboard) return "home";
    if (pathname.startsWith(ROUTES.journal)) return "journal";
    if (pathname.startsWith(ROUTES.chat)) return "chat";
    if (pathname.startsWith(ROUTES.academics)) return "academics";
    if (pathname.startsWith(ROUTES.profile)) return "profile";
    return "home";
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Top Navbar ──────────────────────── */}
      <nav className="sticky top-0 z-40 glass border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <Link href={ROUTES.dashboard} className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/Project_logo.png"
                alt="Harmony Logo"
                className="w-9 h-9 rounded-xl object-cover border border-neutral-200"
              />
              <span className="font-display text-lg font-bold text-[var(--text-primary)]">
                Harmony
              </span>
            </Link>

            {/* Tabs */}
            <div className="hidden md:flex items-center gap-1">
              {STUDENT_TABS.map((tab) => {
                const Icon = iconMap[tab.id] || Home;
                const isActive = getActiveTab() === tab.id;
                return (
                  <Link
                    key={tab.id}
                    href={tab.href}
                    className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? "text-[var(--accent-primary)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/50"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                    {isActive && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 rounded-xl bg-[var(--accent-primary-light)] -z-10"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                      />
                    )}
                  </Link>
                );
              })}
              <Link
                href={ROUTES.rewind}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  pathname.startsWith(ROUTES.rewind)
                    ? "text-[var(--accent-purple)] bg-[var(--accent-purple-light)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/50"
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Rewind
              </Link>
            </div>

            {/* Right: user badge + logout (role switching removed — server-derived roles only) */}
            <div className="flex items-center gap-3">

              <div className="hidden sm:flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#E07A2F] to-[#F5A623] flex items-center justify-center text-white text-xs font-bold">
                  {user?.name?.charAt(0) || "A"}
                </div>
                <span className="font-medium">{user?.name || "Alex"}</span>
              </div>

              <button
                onClick={handleLogout}
                className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-red-50 transition-colors cursor-pointer"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile tabs */}
        <div className="md:hidden flex items-center gap-1 px-4 pb-3 overflow-x-auto">
          {STUDENT_TABS.map((tab) => {
            const Icon = iconMap[tab.id] || Home;
            const isActive = getActiveTab() === tab.id;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? "bg-[var(--accent-primary-light)] text-[var(--accent-primary)]"
                    : "text-[var(--text-muted)]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Main content ────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
