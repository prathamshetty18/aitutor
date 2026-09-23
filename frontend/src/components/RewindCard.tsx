"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, BookOpen, Compass, RefreshCw } from "lucide-react";

export interface WeeklyRewindData {
  week_title: string;
  summary: string;
  highlight: string;
  mood_trend: string;
  top_emotions: string[];
  recommended_topic: string;
  actionable_tip: string;
  visual_config?: {
    palette?: string;
    primary_color?: string;
    accent_color?: string;
    highlight_color?: string;
  };
}

interface RewindCardProps {
  rewindData: WeeklyRewindData | null;
  isLoading: boolean;
  onGenerate: () => void;
  onTopicSelected?: (topic: string) => void;
}

export const RewindCard: React.FC<RewindCardProps> = ({
  rewindData,
  isLoading,
  onGenerate,
  onTopicSelected,
}) => {
  const getEmotionPillClass = (emotion: string) => {
    switch (emotion.toLowerCase()) {
      case "joyful":
      case "confident":
        return "bg-[#E4F7EC] text-[#2FAE60]";
      case "calm":
      case "relieved":
      case "curious":
        return "bg-[#EFF3FF] text-[#4B6BFB]";
      case "anxious":
      case "pensive":
        return "bg-[#FCF1DE] text-[#E8A33D]";
      case "frustrated":
      case "overwhelmed":
        return "bg-[#F0ECFD] text-[#7B5CF0]";
      case "exhausted":
      case "despair":
        return "bg-[#FCE9E9] text-[#E5484D]";
      default:
        return "bg-[#F4F6FB] text-[#7C8398]";
    }
  };

  return (
    <div className="axiom-card p-5 space-y-4">
      {/* Eyebrow Pill + Timestamp Header */}
      <div className="flex items-center justify-between">
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#F0ECFD] text-[#7B5CF0]">
          Weekly rewind
        </span>
        <span className="text-[12px] text-[#7C8398]">
          7-day batch summary
        </span>
      </div>

      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="py-10 flex flex-col items-center justify-center space-y-2 text-center"
          >
            <div className="w-8 h-8 rounded-full border-2 border-[#ECEEF5] border-t-[#4B6BFB] animate-spin" />
            <p className="text-sm font-medium text-[#16192B]">Synthesizing reflection...</p>
            <p className="text-xs text-[#7C8398]">Groq Qwen 3.8 analyzing daily Mini-JSONs</p>
          </motion.div>
        ) : rewindData ? (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="space-y-4"
          >
            {/* Title & Narrative */}
            <div>
              <h3 className="text-base font-semibold text-[#16192B] leading-snug">
                {rewindData.week_title}
              </h3>
              <p className="text-sm text-[#16192B] mt-1.5 leading-relaxed">
                {rewindData.summary}
              </p>
            </div>

            {/* Inline Stat / Trajectory Bar */}
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#ECEEF5] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#7C8398] font-medium">Mood trajectory</span>
                <span className="text-[#16192B] font-semibold">{rewindData.mood_trend}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {rewindData.top_emotions.map((emotion, idx) => (
                  <span
                    key={idx}
                    className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium ${getEmotionPillClass(
                      emotion
                    )}`}
                  >
                    {emotion}
                  </span>
                ))}
              </div>
            </div>

            {/* Breakthrough Highlight */}
            <div className="text-xs space-y-1">
              <span className="font-semibold text-[#2FAE60] block">
                Weekly breakthrough
              </span>
              <p className="text-[#7C8398] leading-relaxed">
                {rewindData.highlight}
              </p>
            </div>

            {/* Recommended Topic & Tip */}
            <div className="p-3.5 rounded-xl bg-[#EFF3FF] border border-[#DCE4FA] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-semibold text-[#4B6BFB] block">
                  Recommended review
                </span>
                <span className="text-xs font-semibold text-[#16192B]">
                  {rewindData.recommended_topic}
                </span>
                <p className="text-[11px] text-[#7C8398] mt-0.5">
                  {rewindData.actionable_tip}
                </p>
              </div>

              {onTopicSelected && (
                <button
                  type="button"
                  onClick={() => onTopicSelected(rewindData.recommended_topic)}
                  className="flex items-center gap-1 text-xs text-[#4B6BFB] hover:underline font-medium whitespace-nowrap cursor-pointer shrink-0"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>View video</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </motion.div>
        ) : (
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-2 text-[#7C8398]">
            <Compass className="w-6 h-6 stroke-1 text-[#4B6BFB]" />
            <p className="text-xs text-[#16192B] font-medium">Ready to create your weekly rewind</p>
            <p className="text-[11px] text-[#7C8398] max-w-xs">
              Synthesize 7 days of reflections into a personalized learning summary card.
            </p>
          </div>
        )}
      </AnimatePresence>

      {/* Footer Action */}
      <div className="pt-2 border-t border-[#ECEEF5] flex items-center justify-between">
        <span className="text-[11px] text-[#7C8398]">Zero hardcoded copy</span>
        <button
          onClick={onGenerate}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#4B6BFB] hover:bg-[#3B5BEB] text-white text-xs font-medium transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
          <span>{isLoading ? "Synthesizing..." : "Generate rewind"}</span>
        </button>
      </div>
    </div>
  );
};
