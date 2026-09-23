"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/app/providers";
import { TagChip } from "@/components/ui/TagChip";
import { GOAL_TAG_OPTIONS } from "@/lib/constants";
import { authedFetch } from "@/lib/backend";
import {
  Star,
  AlertTriangle,
  Lightbulb,
  Shield,
  Target,
  LogOut,
  Save,
  Mail,
  Building2,
  Hash,
  Loader2,
} from "lucide-react";

export default function ProfilePage() {
  const { user, onboardingData, updateSwot, updateOnboarding, logout } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      if (user?.id) {
        const res = await authedFetch("/api/user/profile", {
          method: "POST",
          body: JSON.stringify({
            swot: onboardingData.swot,
            goals: onboardingData.goals,
            goal_tags: onboardingData.goalTags,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: "" }));
          setSaveError(`Save failed: ${err?.detail || res.status}`);
          return;
        }
      }
      setIsEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      console.error("[profile] Error saving profile:", err);
      const msg = err instanceof Error ? err.message : "Failed to save profile changes.";
      setSaveError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleTag = (tag: string) => {
    const tags = onboardingData.goalTags.includes(tag)
      ? onboardingData.goalTags.filter((t) => t !== tag)
      : [...onboardingData.goalTags, tag];
    updateOnboarding({ goalTags: tags });
  };

  const swotFields = [
    { key: "strengths" as const, label: "Strengths", icon: Star, color: "#2FAE60" },
    { key: "weaknesses" as const, label: "Weaknesses", icon: AlertTriangle, color: "#E8A33D" },
    { key: "opportunities" as const, label: "Opportunities", icon: Lightbulb, color: "#4B6BFB" },
    { key: "threats" as const, label: "Threats", icon: Shield, color: "#E5484D" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-3xl mx-auto"
    >
      {/* ── Header ───────────────────────────── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">Profile</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Your SWOT analysis, goals, and account info
          </p>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent-primary)] text-white text-sm font-semibold shadow-sm hover:shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isSaving ? "Saving..." : "Save"}
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 rounded-xl border border-[var(--border-light)] text-sm font-medium text-[var(--text-secondary)] hover:bg-white hover:border-[var(--border-medium)] transition-all cursor-pointer"
            >
              Edit Profile
            </button>
          )}
        </div>
      </div>

      {saveError && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700 font-medium"
        >
          ❌ {saveError}
        </motion.div>
      )}

      {saved && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-700 font-medium"
        >
          ✅ Profile updated successfully!
        </motion.div>
      )}

      {/* ── Account info ─────────────────────── */}
      <div className="axiom-card p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[var(--accent-primary)] to-[#F5A623] flex items-center justify-center text-white text-2xl font-bold shadow-md">
            {user?.name?.charAt(0) || "A"}
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">
              {user?.name || "Alex Rivers"}
            </h2>
            <p className="text-sm text-[var(--text-muted)]">{user?.role || "Student"}</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { icon: Mail, label: "Email", value: user?.email || "alex.rivers@university.edu" },
            { icon: Hash, label: "College ID", value: user?.collegeId || "COL-2026-8942" },
            { icon: Building2, label: "Department", value: user?.department || "Computer Science" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="p-3 rounded-xl bg-[var(--bg-warm-solid)] border border-[var(--border-light)]">
                <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] mb-1">
                  <Icon className="w-3 h-3" />
                  {item.label}
                </div>
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">{item.value}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── SWOT ─────────────────────────────── */}
      <div className="axiom-card p-6 mb-6">
        <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-[var(--accent-primary)]" />
          SWOT Analysis
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {swotFields.map((field) => {
            const Icon = field.icon;
            return (
              <div key={field.key}>
                <label className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)] mb-1.5">
                  <Icon className="w-4 h-4" style={{ color: field.color }} />
                  {field.label}
                </label>
                {isEditing ? (
                  <textarea
                    value={onboardingData.swot[field.key]}
                    onChange={(e) => updateSwot({ [field.key]: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-[var(--border-light)] bg-white text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/30 focus:border-[var(--accent-primary)] resize-none transition-all"
                  />
                ) : (
                  <div className="px-4 py-3 rounded-xl bg-[var(--bg-warm-solid)] border border-[var(--border-light)] text-sm text-[var(--text-secondary)] leading-relaxed">
                    {onboardingData.swot[field.key] || "Not provided"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Goals ────────────────────────────── */}
      <div className="axiom-card p-6 mb-6">
        <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">
          🎯 Goals
        </h2>
        {isEditing ? (
          <>
            <textarea
              value={onboardingData.goals}
              onChange={(e) => updateOnboarding({ goals: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-[var(--border-light)] bg-white text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-secondary)]/30 focus:border-[var(--accent-secondary)] resize-none transition-all mb-4"
            />
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
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
              {onboardingData.goals || "No goals set yet."}
            </p>
            {onboardingData.goalTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {onboardingData.goalTags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 rounded-full bg-[var(--accent-secondary-light)] text-[var(--accent-secondary)] text-xs font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Logout ───────────────────────────── */}
      <button
        onClick={logout}
        className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium text-[var(--danger)] hover:bg-red-50 border border-red-100 transition-colors cursor-pointer"
      >
        <LogOut className="w-4 h-4" />
        Log out
      </button>
    </motion.div>
  );
}
