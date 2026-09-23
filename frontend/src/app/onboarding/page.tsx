"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useAuth } from "../providers";
import { TagChip } from "@/components/ui/TagChip";
import { GOAL_TAG_OPTIONS } from "@/lib/constants";
import {
  ArrowRight,
  ArrowLeft,
  Upload,
  CheckCircle2,
  FileText,
  Target,
  Shield,
  Lightbulb,
  AlertTriangle,
  Star,
  Loader2,
} from "lucide-react";

import { authedFetch } from "@/lib/backend";
import { generateGoalsFromProfile, persistGeneratedPlan, GeneratedGoals } from "@/lib/generate-goals";


const stepTitles = ["SWOT Analysis", "Upload Marksheet", "Set Goals", "Confirm"];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const { user, onboardingData, updateOnboarding, updateSwot } = useAuth();
  const router = useRouter();
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [generatedGoals, setGeneratedGoals] = useState<GeneratedGoals | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [dbGoals, setDbGoals] = useState<string[] | null>(null);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [goalsRefreshKey, setGoalsRefreshKey] = useState(0);

  const [isSaving, setIsSaving] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  const saveStepProgress = async (stepIndex: number) => {
    if (!user?.id) return;
    try {
      if (stepIndex === 0) {
        await authedFetch("/api/user/profile", {
          method: "POST",
          body: JSON.stringify({ swot: onboardingData.swot }),
        });
      }
    } catch (e) {
      console.warn("[onboarding] Auto-save error:", e);
    }
  };

  const next = async () => {
    await saveStepProgress(step);
    setStep((s) => Math.min(s + 1, 3));
  };
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setUploadedFile(f.name);
      updateOnboarding({ marksheetFile: f });
    }
  };

  const toggleTag = (tag: string) => {
    const tags = onboardingData.goalTags.includes(tag)
      ? onboardingData.goalTags.filter((t) => t !== tag)
      : [...onboardingData.goalTags, tag];
    updateOnboarding({ goalTags: tags });
  };

  // ---------------------------------------------------------------------------
  // Groq goal generation — fires when leaving the "Set Goals" step, so the
  // SWOT + goals the student just entered are actually part of the prompt.
  // Never throws: generateGoalsFromProfile falls back internally.
  // ---------------------------------------------------------------------------
  const handleGenerateGoals = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setDbError(null);
    try {
      const result = await generateGoalsFromProfile({
        swot: onboardingData.swot,
        goals: onboardingData.goals,
        goalTags: onboardingData.goalTags,
      });
      setGeneratedGoals(result);

      // Persist via backend API: one roadmap + one DailyGoal row PER TASK
      // (day_plan flattened — 3-4 tasks/day, not one vague row every 2 days)
      if (user?.id && result.day_plan.length > 0) {
        try {
          const inserted = await persistGeneratedPlan(result, authedFetch);
          console.log(`[onboarding] Persisted ${inserted} daily tasks.`);
        } catch (e) {
          console.error("[onboarding] Plan persistence failed:", e);
        }
      }
      setGoalsRefreshKey((k) => k + 1);
    } finally {
      setIsGenerating(false);
      setStep(3);
    }
  };

  // ---------------------------------------------------------------------------
  // Load persisted goals (from seeded DailyGoal rows) for the summary step.
  // ---------------------------------------------------------------------------
  React.useEffect(() => {
    if (step !== 3 || !user?.id) return;
    let mounted = true;
    const timer = setTimeout(() => {
      if (mounted) setGoalsLoading(true);
    }, 0);
    (async () => {
      try {
        const res = await authedFetch("/api/goals");
        if (res.ok) {
          const data = await res.json();
          const goals = (data.goals || []) as Array<{ topics?: string[] }>;
          if (mounted && goals.length > 0) {
            const topics = goals.flatMap((g) =>
              Array.isArray(g.topics) ? g.topics.filter((t: unknown): t is string => typeof t === "string") : []
            );
            if (topics.length > 0) setDbGoals(topics);
          }
        }
      } catch {
        // Non-fatal
      } finally {
        if (mounted) setGoalsLoading(false);
      }
    })();
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [step, goalsRefreshKey, user?.id]);

  const handleEnterDashboard = async () => {
    setIsSaving(true);
    setDbError(null);
    try {
      if (user?.id) {
        const res = await authedFetch("/api/user/profile", {
          method: "POST",
          body: JSON.stringify({
            swot: onboardingData.swot,
            goals: onboardingData.goals,
            goal_tags: onboardingData.goalTags,
            onboarding_completed: true,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: "" }));
          setDbError(`Profile save failed: ${err?.detail || res.status}`);
        }
        // Also sync to /api/auth/onboarding for the JWT-based session record
        await authedFetch("/api/auth/onboarding", {
          method: "POST",
          body: JSON.stringify({
            swot: onboardingData.swot,
            goals: onboardingData.goals,
            goal_tags: onboardingData.goalTags,
            completed: true,
          }),
        }).catch(() => {});
      }
    } catch (err: unknown) {
      console.error("[onboarding] Error saving:", err);
      const msg = err instanceof Error ? err.message : "Failed to save profile";
      setDbError(msg);
    } finally {
      setIsSaving(false);
      // Mirror the backend cookie so middleware redirects ("/" → /dashboard)
      // work immediately instead of after the next login.
      document.cookie = `onboarding_completed=true; path=/; max-age=${8 * 3600}; samesite=lax`;
      router.push("/dashboard");
    }
  };

  const variants = {
    enter: { opacity: 0, x: 40 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -40 },
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      {/* ── Stepper ─────────────────────────── */}
      <div className="max-w-lg w-full mb-8">
        <div className="flex items-center justify-between mb-2">
          {stepTitles.map((title, i) => (
            <div key={title} className="flex items-center gap-2">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  i < step
                    ? "bg-[var(--accent-primary)] text-white"
                    : i === step
                    ? "bg-[var(--accent-primary)] text-white animate-pulse-glow"
                    : "bg-[var(--border-light)] text-[var(--text-muted)]"
                }`}
              >
                {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              {i < stepTitles.length - 1 && (
                <div
                  className={`hidden sm:block w-12 md:w-20 h-0.5 ${
                    i < step ? "bg-[var(--accent-primary)]" : "bg-[var(--border-light)]"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-[var(--text-muted)]">
          Step {step + 1} of 4 — {stepTitles[step]}
        </p>
      </div>

      {/* ── Steps ───────────────────────────── */}
      <div className="axiom-card p-8 max-w-lg w-full overflow-hidden">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="swot"
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="space-y-5"
            >
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-5 h-5 text-[var(--accent-primary)]" />
                <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">
                  Know Yourself — SWOT
                </h2>
              </div>
              <p className="text-sm text-[var(--text-muted)]">
                Help your AI tutor understand you better. Be honest — this stays private.
              </p>

              {[
                { key: "strengths" as const, label: "Strengths", icon: Star, color: "#2FAE60" },
                { key: "weaknesses" as const, label: "Weaknesses", icon: AlertTriangle, color: "#E8A33D" },
                { key: "opportunities" as const, label: "Opportunities", icon: Lightbulb, color: "#4B6BFB" },
                { key: "threats" as const, label: "Threats", icon: Shield, color: "#E5484D" },
              ].map((field) => {
                const Icon = field.icon;
                return (
                  <div key={field.key}>
                    <label className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)] mb-1.5">
                      <Icon className="w-4 h-4" style={{ color: field.color }} />
                      {field.label}
                    </label>
                    <textarea
                      value={onboardingData.swot[field.key]}
                      onChange={(e) => updateSwot({ [field.key]: e.target.value })}
                      rows={2}
                      className="w-full px-4 py-3 rounded-xl border border-[var(--border-light)] bg-[var(--bg-warm-solid)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/30 focus:border-[var(--accent-primary)] resize-none transition-all"
                      placeholder={`What are your ${field.label.toLowerCase()}?`}
                    />
                  </div>
                );
              })}
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="upload"
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="space-y-5"
            >
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-5 h-5 text-[var(--accent-primary)]" />
                <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">
                  Upload Marksheet
                </h2>
              </div>
              <p className="text-sm text-[var(--text-muted)]">
                Upload your latest semester or MSE marksheet so we can personalize your study plan.
              </p>

              <label
                className={`flex flex-col items-center justify-center gap-3 py-16 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
                  uploadedFile
                    ? "border-[var(--accent-primary)] bg-[var(--accent-primary-light)]"
                    : "border-[var(--border-medium)] hover:border-[var(--accent-primary)] bg-[var(--bg-warm-solid)]"
                }`}
              >
                {uploadedFile ? (
                  <>
                    <CheckCircle2 className="w-12 h-12 text-[var(--accent-primary)]" />
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {uploadedFile}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      Click to replace
                    </span>
                  </>
                ) : (
                  <>
                    <Upload className="w-12 h-12 text-[var(--text-muted)]" />
                    <span className="text-sm text-[var(--text-muted)]">
                      Drag & drop or click to upload
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      PDF, JPG, or PNG — max 10 MB
                    </span>
                  </>
                )}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileUpload} />
              </label>

              <p className="text-xs text-[var(--text-muted)] text-center">
                📋 For this demo, no actual parsing happens — just the upload UI.
              </p>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="goals"
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="space-y-5"
            >
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-5 h-5 text-[var(--accent-secondary)]" />
                <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">
                  Set Your Goals
                </h2>
              </div>
              <p className="text-sm text-[var(--text-muted)]">
                What do you want to accomplish by graduation?
              </p>

              <textarea
                value={onboardingData.goals}
                onChange={(e) => updateOnboarding({ goals: e.target.value })}
                rows={4}
                className="w-full px-4 py-3 rounded-xl border border-[var(--border-light)] bg-[var(--bg-warm-solid)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-secondary)]/30 focus:border-[var(--accent-secondary)] resize-none transition-all"
                placeholder="I want to..."
              />

              <div>
                <p className="text-sm font-medium text-[var(--text-primary)] mb-3">
                  Quick tags (optional)
                </p>
                <div className="flex flex-wrap gap-2">
                  {GOAL_TAG_OPTIONS.map((tag) => (
                    <TagChip
                      key={tag}
                      label={tag}
                      selected={onboardingData.goalTags.includes(tag)}
                      onToggle={() => toggleTag(tag)}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="confirm"
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="space-y-5"
            >
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-5 h-5 text-[var(--success)]" />
                <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">
                  You&apos;re all set!
                </h2>
              </div>
              <p className="text-sm text-[var(--text-muted)]">
                Here&apos;s a summary of what you shared. You can always edit this later in your Profile.
              </p>

              {/* SWOT summary */}
              <div className="space-y-3">
                {[
                  { label: "Strengths", value: onboardingData.swot.strengths, color: "#2FAE60" },
                  { label: "Weaknesses", value: onboardingData.swot.weaknesses, color: "#E8A33D" },
                  { label: "Opportunities", value: onboardingData.swot.opportunities, color: "#4B6BFB" },
                  { label: "Threats", value: onboardingData.swot.threats, color: "#E5484D" },
                ].map((item) => (
                  <div key={item.label} className="p-3 rounded-xl bg-[var(--bg-warm-solid)] border border-[var(--border-light)]">
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: item.color }}>
                      {item.label}
                    </span>
                    <p className="text-sm text-[var(--text-secondary)] mt-1 line-clamp-2">
                      {item.value || "Not provided"}
                    </p>
                  </div>
                ))}
              </div>

              {/* Goals */}
              <div className="p-3 rounded-xl bg-[var(--bg-warm-solid)] border border-[var(--border-light)]">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-secondary)]">
                  Goals
                </span>
                <p className="text-sm text-[var(--text-secondary)] mt-1 line-clamp-3">
                  {onboardingData.goals || "Not provided"}
                </p>
                {onboardingData.goalTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {onboardingData.goalTags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 rounded-full bg-[var(--accent-secondary-light)] text-[var(--accent-secondary)] text-xs font-medium">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* AI-generated personalized plan (Groq) */}
              <div className="p-3 rounded-xl bg-[var(--bg-warm-solid)] border border-[var(--border-light)]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-secondary)]">
                    AI-Generated Plan
                  </span>
                  {generatedGoals?.source === "groq" && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-secondary-light)] text-[var(--accent-secondary)] font-medium">
                      Personalized via Groq
                    </span>
                  )}
                </div>

                {goalsLoading ? (
                  <div className="flex items-center gap-2 mt-2 text-sm text-[var(--text-muted)]">
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-secondary)]" />
                    Loading your personalized goals...
                  </div>
                ) : (dbGoals && dbGoals.length > 0) || (generatedGoals && generatedGoals.visible_goals.length > 0) ? (
                  <ul className="mt-2 space-y-1.5">
                    {(dbGoals && dbGoals.length > 0
                      ? dbGoals
                      : generatedGoals!.visible_goals
                    ).slice(0, 6).map((g, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 text-[var(--accent-secondary)] flex-shrink-0" />
                        <span>{g}</span>
                      </li>
                    ))}
                    {(dbGoals?.length ?? 0) > 6 && (
                      <li className="text-xs text-[var(--text-muted)] pl-6">
                        + {dbGoals!.length - 6} more daily tasks scheduled across your 7-day plan
                      </li>
                    )}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--text-muted)] mt-2">
                    No goals generated yet — go back and fill in your SWOT + goals, then continue.
                  </p>
                )}
              </div>

              {/* File */}
              {uploadedFile && (
                <div className="p-3 rounded-xl bg-[var(--bg-warm-solid)] border border-[var(--border-light)] flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--accent-primary)]" />
                  <span className="text-sm text-[var(--text-secondary)]">{uploadedFile}</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Navigation buttons ──────────────── */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-[var(--border-light)]">
          {step > 0 ? (
            <button
              onClick={prev}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--border-light)] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              onClick={step === 2 ? handleGenerateGoals : next}
              disabled={isGenerating}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[var(--accent-primary)] text-white text-sm font-semibold shadow-sm hover:shadow-md transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating your plan...
                </>
              ) : (
                <>
                  {step === 2 ? "Generate My Plan" : "Next"}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          ) : (
            <div className="flex flex-col items-end gap-1">
              {dbError && <span className="text-xs text-rose-500 font-medium">{dbError}</span>}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleEnterDashboard}
                disabled={isSaving}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#E07A2F] to-[#2BA89C] text-white text-sm font-bold shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-60"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    Enter Dashboard
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
