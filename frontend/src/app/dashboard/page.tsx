"use client";

import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ROUTES } from "@/lib/constants";
import { useAuth } from "../providers";
import { authedFetch } from "@/lib/backend";
import { generateGoalsFromProfile, persistGeneratedPlan } from "@/lib/generate-goals";
import { subscribePlanUpdates } from "@/lib/plan-events";
import {
  BookOpen,
  MessageSquare,
  GraduationCap,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Flame,
  Circle,
  RefreshCw,
  Zap,
  Loader2,
} from "lucide-react";

// ── Types ─────────────────────────────────────
interface LiveGoal {
  goal_id: string;
  topics: string[];
  problems_count: number;
  status: "pending" | "completed" | "partial" | "missed" | "rescheduled";
  target_date: string;
}

interface DisplayGoal {
  id: string;
  label: string;
  progress: number;
  completed: boolean;
  goalId: string;
  dateLabel: string;
}

// ── Helpers ───────────────────────────────────
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

function getFirstName(fullName: string): string {
  return fullName?.split(" ")[0] || "there";
}

function mapGoalToDisplay(g: LiveGoal, index: number): DisplayGoal {
  const completed = g.status === "completed";
  const partial = g.status === "partial";
  const progress = completed ? 100 : partial ? 50 : 0;
  // Build a readable label from topics array
  const topicsArr: string[] = Array.isArray(g.topics)
    ? g.topics
    : (typeof g.topics === "string" ? JSON.parse(g.topics) : []);
  const label =
    topicsArr.length > 0
      ? topicsArr.slice(0, 2).join(" + ")
      : `Study Session ${index + 1}`;
  const dateLabel = g.target_date
    ? new Date(`${g.target_date}T00:00:00`).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "";
  return {
    id: g.goal_id,
    label,
    progress,
    completed,
    goalId: g.goal_id,
    dateLabel,
  };
}

// ── Quick access cards (static navigation, not data) ──
const quickCards = [
  {
    title: "Journal",
    desc: "Record your thoughts",
    icon: BookOpen,
    href: ROUTES.journal,
    color: "#E07A2F",
    bg: "var(--accent-primary-light)",
  },
  {
    title: "AI Chat",
    desc: "Ask anything academic",
    icon: MessageSquare,
    href: ROUTES.chat,
    color: "#2BA89C",
    bg: "var(--accent-secondary-light)",
  },
  {
    title: "Academics",
    desc: "Marks & study material",
    icon: GraduationCap,
    href: ROUTES.academics,
    color: "#4B6BFB",
    bg: "#EFF3FF",
  },
  {
    title: "Weekly Rewind",
    desc: "Your week in review",
    icon: Sparkles,
    href: ROUTES.rewind,
    color: "#7B5CF0",
    bg: "var(--accent-purple-light)",
  },
];

export default function DashboardHome() {
  const { user, onboardingData } = useAuth();

  // Goals state
  const [goals, setGoals] = useState<DisplayGoal[]>([]);
  const [nextUp, setNextUp] = useState<DisplayGoal | null>(null);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [goalsError, setGoalsError] = useState<string | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  // Self-serve week plan: SWOT + goals -> Groq -> date-wise DailyGoal rows
  const handleGeneratePlan = async () => {
    if (!user?.id || isGeneratingPlan) return;
    setIsGeneratingPlan(true);
    setGoalsError(null);
    try {
      const result = await generateGoalsFromProfile({
        swot: onboardingData.swot,
        goals: onboardingData.goals,
        goalTags: onboardingData.goalTags || [],
      });
      // Persist new plan to PostgreSQL via backend API (day_plan flattened:
      // one task = one DailyGoal row, 3-4 per day). Old plan rows cleared first.
      if (result.day_plan.length > 0) {
        try {
          const inserted = await persistGeneratedPlan(result, authedFetch);
          console.log(`[dashboard] Persisted ${inserted} daily tasks.`);
        } catch (e) {
          console.error("[dashboard] Plan persistence failed:", e);
        }
      }
      await loadGoals();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Plan generation failed.";
      setGoalsError(msg);
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  // Streak state
  const [streak, setStreak] = useState<number>(0);
  const [streakDays, setStreakDays] = useState<boolean[]>([false, false, false, false, false, false, false]);

  const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

  // ── Load goals from backend ─────────
  const loadGoals = useCallback(async () => {
    if (!user?.id) return;
    setGoalsLoading(true);
    setGoalsError(null);
    try {
      const res = await authedFetch("/api/goals");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const rows: LiveGoal[] = data.goals || [];

      // The plan spans 7 days, but the dashboard tracks DAILY progress:
      // show only tasks due today (or still outstanding from earlier days).
      // Future days are hidden so a week's worth of goals doesn't pile up here.
      const todayKey = new Date().toISOString().split("T")[0];
      const todaysRows = rows.filter((g) => {
        if (g.status === "completed") return g.target_date === todayKey;
        return Boolean(g.target_date) && g.target_date <= todayKey;
      });
      setGoals(todaysRows.map((g, i) => mapGoalToDisplay(g, i)));

      // Remember the earliest upcoming task so the empty state can show it
      const upcoming = rows
        .filter((g) => g.status !== "completed" && g.target_date > todayKey)
        .sort((a, b) => a.target_date.localeCompare(b.target_date))[0];
      setNextUp(upcoming ? mapGoalToDisplay(upcoming, 0) : null);
    } catch (err: unknown) {
      console.error("[Dashboard] Failed to load goals:", err);
      setGoalsError("Could not load goals.");
    } finally {
      setGoalsLoading(false);
    }
  }, [user?.id]);

  // ── Load journal streak from backend ────
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const loadStreak = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await authedFetch("/journal/history?limit=30");
      if (!res.ok) return;
      const data = await res.json();
      const entries: Array<{ timestamp?: string }> = data.entries || data || [];
      const journaledDates = new Set<string>(
        entries.map((r) => new Date(r.timestamp || "").toISOString().split("T")[0])
      );
      let streakCount = 0;
      const today = new Date();
      for (let i = 0; i < 30; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dateKey = d.toISOString().split("T")[0];
        if (journaledDates.has(dateKey)) streakCount++;
        else break;
      }
      setStreak(streakCount);
      const weekDays: boolean[] = [];
      const dayOfWeek = today.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + mondayOffset + i);
        weekDays.push(journaledDates.has(d.toISOString().split("T")[0]));
      }
      setStreakDays(weekDays);
    } catch (err) {
      console.error("[Dashboard] Failed to load streak:", err);
    }
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;
    if (!user?.id) return;
    const timer = setTimeout(() => {
      if (mounted) {
        loadGoals();
        loadStreak();
      }
    }, 0);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [user?.id, loadGoals, loadStreak]);

  // Chat-driven plan changes → refresh goals immediately
  useEffect(() => {
    return subscribePlanUpdates(() => {
      loadGoals();
    });
  }, [loadGoals]);

  // ── Toggle goal completion ────────────────────
  const toggleGoal = async (goal: DisplayGoal) => {
    const newStatus = goal.completed ? "pending" : "completed";

    // Optimistic update
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goal.id
          ? { ...g, completed: !g.completed, progress: newStatus === "completed" ? 100 : 0 }
          : g
      )
    );

    try {
      const res = await authedFetch(`/api/goals/${goal.goalId}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      console.error("[Dashboard] Failed to update goal:", err);
      // Revert optimistic update
      loadGoals();
    }
  };

  // ── Computed stats ────────────────────────────
  const completedCount = goals.filter((g) => g.completed).length;
  const totalGoals = goals.length;
  const overallProgress =
    totalGoals > 0
      ? Math.round(goals.reduce((sum, g) => sum + g.progress, 0) / totalGoals)
      : 0;

  const greeting = getGreeting();
  const firstName = user?.name ? getFirstName(user.name) : "there";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">
          {greeting}, {firstName} 👋
        </h1>
        <p className="text-[var(--text-muted)] mt-1">
          Here&apos;s your progress for today. Keep going!
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── Left column: Progress + Goals ─── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Progress tracker */}
          <div className="axiom-card p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
              <ProgressRing progress={overallProgress} size={140} strokeWidth={12} color="var(--accent-primary)">
                <div className="text-center">
                  <span className="font-display text-3xl font-bold text-[var(--text-primary)]">
                    {overallProgress}%
                  </span>
                  <p className="text-xs text-[var(--text-muted)]">Today</p>
                </div>
              </ProgressRing>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <Flame className="w-5 h-5 text-orange-500" />
                  <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
                    Daily Goals
                  </h2>
                  {!goalsLoading && totalGoals > 0 && (
                    <span className="ml-auto text-sm text-[var(--text-muted)]">
                      {completedCount}/{totalGoals} done
                    </span>
                  )}
                  {!goalsLoading && (
                    <button
                      onClick={loadGoals}
                      className="p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                      title="Refresh goals"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    </button>
                  )}
                  {!goalsLoading && totalGoals > 0 && (
                    <button
                      onClick={handleGeneratePlan}
                      disabled={isGeneratingPlan}
                      className="p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-60"
                      title="Regenerate plan (replaces current tasks)"
                    >
                      {isGeneratingPlan ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-primary)]" />
                      ) : (
                        <Zap className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                      )}
                    </button>
                  )}
                </div>

                {/* Loading state */}
                {goalsLoading && (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-3 animate-pulse">
                        <div className="w-5 h-5 rounded-full bg-gray-200 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="h-3 bg-gray-200 rounded w-3/4 mb-2" />
                          <div className="h-1.5 bg-gray-100 rounded w-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Error state */}
                {!goalsLoading && goalsError && (
                  <p className="text-sm text-[var(--danger)]">{goalsError}</p>
                )}

                {/* All caught up — point to the next scheduled task */}
                {!goalsLoading && !goalsError && goals.length === 0 && nextUp && (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <CheckCircle2 className="w-8 h-8 text-[var(--success)] mb-2 opacity-70" />
                    <p className="text-sm text-[var(--text-secondary)] font-medium">All caught up for today! 🎉</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      Next up on {nextUp.dateLabel}: {nextUp.label}
                    </p>
                  </div>
                )}

                {/* Empty state */}
                {!goalsLoading && !goalsError && goals.length === 0 && !nextUp && (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <Zap className="w-8 h-8 text-[var(--accent-primary)] mb-2 opacity-60" />
                    <p className="text-sm text-[var(--text-secondary)] font-medium">No goals yet</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {isGeneratingPlan
                        ? "Generating your week-long study plan..."
                        : "Generate an AI day-to-day plan for the next 7 days"}
                    </p>
                    <button
                      onClick={handleGeneratePlan}
                      disabled={isGeneratingPlan}
                      className="mt-3 px-4 py-2 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-semibold shadow-sm hover:shadow-md transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                    >
                      {isGeneratingPlan ? "Generating..." : "Generate my 7-day plan"}
                    </button>
                  </div>
                )}

                {/* Goals list */}
                {!goalsLoading && !goalsError && goals.length > 0 && (
                  <div className="space-y-3">
                    {goals.map((goal, i) => (
                      <motion.div
                        key={goal.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08 }}
                        className="flex items-center gap-3"
                      >
                        <button
                          onClick={() => toggleGoal(goal)}
                          className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all cursor-pointer ${
                            goal.completed
                              ? "bg-[var(--success)] text-white"
                              : "border-2 border-[var(--border-medium)] hover:border-[var(--success)]"
                          }`}
                        >
                          {goal.completed ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <Circle className="w-3 h-3 opacity-0" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span
                              className={`text-sm ${
                                goal.completed
                                  ? "text-[var(--text-muted)] line-through"
                                  : "text-[var(--text-primary)] font-medium"
                              }`}
                            >
                              {goal.dateLabel && (
                                <span className="text-[10px] font-semibold text-[var(--accent-primary)] mr-1.5 uppercase tracking-wide">
                                  {goal.dateLabel}
                                </span>
                              )}
                              {goal.label}
                            </span>
                            <span className="text-xs text-[var(--text-muted)] ml-2">
                              {goal.progress}%
                            </span>
                          </div>
                          <ProgressBar
                            progress={goal.progress}
                            height={5}
                            color={goal.completed ? "var(--success)" : "var(--accent-primary)"}
                          />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick access cards */}
          <div className="grid grid-cols-2 gap-4">
            {quickCards.map((card, i) => {
              const Icon = card.icon;
              return (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.08 }}
                >
                  <Link href={card.href} className="block">
                    <div className="axiom-card-interactive p-5 group">
                      <div className="flex items-start justify-between">
                        <div
                          className="w-11 h-11 rounded-2xl flex items-center justify-center mb-3"
                          style={{ backgroundColor: card.bg }}
                        >
                          <Icon className="w-5 h-5" style={{ color: card.color }} />
                        </div>
                        <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent-primary)] transition-colors" />
                      </div>
                      <h3 className="font-display font-semibold text-[var(--text-primary)] mb-0.5">
                        {card.title}
                      </h3>
                      <p className="text-xs text-[var(--text-muted)]">{card.desc}</p>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* ── Right column: streak & tips ────── */}
        <div className="space-y-6">
          {/* Streak card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
            className="axiom-card p-6 bg-gradient-to-br from-orange-50 to-amber-50 border-orange-100"
          >
            <div className="flex items-center gap-2 mb-3">
              <Flame className="w-6 h-6 text-orange-500" />
              <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
                {streak > 0 ? `${streak}-Day Streak!` : "Start your streak!"}
              </h3>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {streak > 0
                ? `You've journaled ${streak} day${streak !== 1 ? "s" : ""} in a row. Keep the momentum going!`
                : "Record your first journal entry today to start your streak."}
            </p>
            <div className="flex gap-1.5">
              {DAY_LABELS.map((day, i) => (
                <div
                  key={i}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
                    streakDays[i]
                      ? "bg-orange-500 text-white shadow-sm"
                      : "bg-white text-[var(--text-muted)] border border-[var(--border-light)]"
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Weekly Rewind promo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6 }}
          >
            <Link href={ROUTES.rewind}>
              <div className="relative overflow-hidden rounded-2xl p-6 bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 text-white cursor-pointer group">
                <div className="relative z-10">
                  <Sparkles className="w-6 h-6 mb-3 text-white/90" />
                  <h3 className="font-display text-lg font-bold mb-1">Weekly Rewind</h3>
                  <p className="text-sm text-white/80 mb-3">
                    Your personalized week in review is ready
                  </p>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold group-hover:gap-2 transition-all">
                    View Rewind <ArrowRight className="w-4 h-4" />
                  </span>
                </div>
                {/* Decorative circles */}
                <div className="absolute -bottom-4 -right-4 w-24 h-24 rounded-full bg-white/10" />
                <div className="absolute -top-4 -right-8 w-16 h-16 rounded-full bg-white/5" />
              </div>
            </Link>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
