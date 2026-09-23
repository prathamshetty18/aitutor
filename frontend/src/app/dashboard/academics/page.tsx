"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { MOCK_MARKS, MOCK_ATTENDANCE, MOCK_STUDY_MATERIALS } from "@/lib/mockData";
import {
  BookOpen,
  BarChart3,
  Video,
  ExternalLink,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

const tabs = [
  { id: "marks", label: "Marks", icon: BarChart3 },
  { id: "attendance", label: "Attendance", icon: BookOpen },
  { id: "materials", label: "Study Material", icon: Video },
];

export default function AcademicsPage() {
  const [activeTab, setActiveTab] = useState("marks");

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-4xl mx-auto"
    >
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">Academics</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Your marks, attendance, and personalized study resources
        </p>
      </div>

      {/* ── Inner tabs ───────────────────────── */}
      <div className="flex gap-2 mb-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                activeTab === tab.id
                  ? "bg-[var(--accent-primary)] text-white shadow-md"
                  : "bg-white text-[var(--text-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)]"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Marks table ──────────────────────── */}
      {activeTab === "marks" && (
        <motion.div
          key="marks"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="axiom-card overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th className="text-center">MSE 1</th>
                  <th className="text-center">MSE 2</th>
                  <th className="text-center">End Sem</th>
                  <th className="text-center">Trend</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_MARKS.map((m, i) => {
                  const trend = m.mse1 != null && m.mse2 != null ? m.mse2 - m.mse1 : 0;
                  return (
                    <motion.tr
                      key={m.subject}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <td className="font-medium text-[var(--text-primary)]">{m.subject}</td>
                      <td className="text-center font-medium">{m.mse1 ?? "—"}</td>
                      <td className="text-center font-medium">{m.mse2 ?? "—"}</td>
                      <td className="text-center">
                        <span
                          className={`font-semibold ${
                            (m.college ?? 0) >= 80
                              ? "text-[var(--success)]"
                              : (m.college ?? 0) >= 70
                              ? "text-[var(--warning)]"
                              : "text-[var(--danger)]"
                          }`}
                        >
                          {m.college ?? "—"}
                        </span>
                      </td>
                      <td className="text-center">
                        {trend !== 0 && (
                          <span
                            className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                              trend > 0 ? "text-[var(--success)]" : "text-[var(--danger)]"
                            }`}
                          >
                            {trend > 0 ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {trend > 0 ? "+" : ""}
                            {trend}
                          </span>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* ── Attendance ───────────────────────── */}
      {activeTab === "attendance" && (
        <motion.div
          key="attendance"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-3"
        >
          {MOCK_ATTENDANCE.map((a, i) => (
            <motion.div
              key={a.subject}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="axiom-card p-5"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {a.subject}
                  </span>
                  {a.percentage < 75 && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-xs font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      Low
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span
                    className={`text-lg font-bold ${
                      a.percentage >= 85
                        ? "text-[var(--success)]"
                        : a.percentage >= 75
                        ? "text-[var(--warning)]"
                        : "text-[var(--danger)]"
                    }`}
                  >
                    {a.percentage}%
                  </span>
                  <p className="text-xs text-[var(--text-muted)]">
                    {a.attended}/{a.totalClasses} classes
                  </p>
                </div>
              </div>
              <ProgressBar
                progress={a.percentage}
                height={8}
                color={
                  a.percentage >= 85
                    ? "var(--success)"
                    : a.percentage >= 75
                    ? "var(--warning)"
                    : "var(--danger)"
                }
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* ── Study materials ──────────────────── */}
      {activeTab === "materials" && (
        <motion.div
          key="materials"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          {/* Weak subjects banner */}
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-100">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-700">
              <span className="font-semibold">Weak subjects highlighted</span> — resources for Calculus II and Digital Electronics are prioritized.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {MOCK_STUDY_MATERIALS.map((sm, i) => (
              <motion.a
                key={sm.id}
                href={sm.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="axiom-card-interactive overflow-hidden group block"
              >
                {/* Thumbnail */}
                <div className="relative h-36 bg-gray-100 overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent z-10" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform z-20">
                      <div className="w-0 h-0 border-l-[10px] border-l-red-500 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent ml-1" />
                    </div>
                  </div>
                  {sm.isWeakSubject && (
                    <span className="absolute top-2 left-2 z-20 px-2 py-0.5 rounded-full bg-amber-500 text-white text-xs font-bold">
                      ⚡ Priority
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <p className="text-xs text-[var(--accent-primary)] font-semibold mb-1">
                    {sm.subject}
                  </p>
                  <h3 className="text-sm font-medium text-[var(--text-primary)] mb-2 line-clamp-2">
                    {sm.title}
                  </h3>
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
                    <ExternalLink className="w-3 h-3" />
                    YouTube
                  </span>
                </div>
              </motion.a>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
