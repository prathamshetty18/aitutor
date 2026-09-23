"use client";

import React from "react";
import { ScoreGauge } from "@/components/ScoreGauge";
import { ResourcePanel } from "@/components/ResourcePanel";
import { AlertTriangle } from "lucide-react";

interface RightSidePanelProps {
  apiUrl: string;
  studentId: string;
  studentName?: string;
  collegeId?: string;
  currentSentimentScore: number;
  deltaPercent?: number;
  activeTopic: string | null;
  onSimulateDecline: () => void;
  isSimulatingDecline: boolean;
}

export const RightSidePanel: React.FC<RightSidePanelProps> = ({
  apiUrl,
  studentId,
  studentName = "Alex Rivers",
  collegeId = "COL-2026-8942",
  currentSentimentScore = -0.34,
  deltaPercent = -24,
  activeTopic,
  onSimulateDecline,
  isSimulatingDecline,
}) => {
  return (
    <aside className="w-[280px] shrink-0 flex flex-col gap-4 h-full p-4 overflow-y-auto">
      {/* 1. Profile Card */}
      <div className="axiom-card p-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-[#7B5CF0] to-[#4B6BFB] flex items-center justify-center text-white font-semibold text-sm shadow-sm shrink-0">
          AR
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-[#16192B] truncate">
            {studentName}
          </h4>
          <span className="text-[11px] text-[#7C8398] block font-mono truncate" title={`ID: ${studentId}`}>
            UID: {collegeId}
          </span>
        </div>
      </div>

      {/* 2. Hero Score Gauge Card */}
      <div className="axiom-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[#16192B]">
            Emotional wellbeing
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#EFF3FF] text-[#4B6BFB]">
            7-day rolling
          </span>
        </div>

        {/* Hero visual */}
        <ScoreGauge
          score={currentSentimentScore}
          deltaPercent={deltaPercent}
          label="Sentiment index"
          sublabel="Evaluated across rolling window"
        />

        {/* Supporting Stat Lines */}
        <div className="pt-3 border-t border-[#ECEEF5] space-y-2 text-[11px]">
          <div className="flex items-center justify-between text-[#7C8398]">
            <span>Threshold trigger</span>
            <span className="font-mono font-medium text-[#16192B]">-0.20</span>
          </div>
          <div className="flex items-center justify-between text-[#7C8398]">
            <span>Local STT engine</span>
            <span className="font-medium text-[#16192B]">Whisper.cpp / base</span>
          </div>
          <div className="flex items-center justify-between text-[#7C8398]">
            <span>Vector storage</span>
            <span className="font-medium text-[#16192B]">sqlite-vec (384d)</span>
          </div>
        </div>
      </div>

      {/* 3. Safety Net Simulation Control */}
      <div className="axiom-card p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[#16192B]">
            Early-warning safety net
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FCF1DE] text-[#E8A33D]">
            Demo tool
          </span>
        </div>
        <p className="text-[11px] text-[#7C8398] leading-snug">
          Simulate a 7-day declining emotional trajectory to verify counseling distress alert dispatch.
        </p>
        <button
          onClick={onSimulateDecline}
          disabled={isSimulatingDecline}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-full bg-[#FCE9E9] hover:bg-[#F9D6D6] text-[#E5484D] text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>{isSimulatingDecline ? "Simulating decline..." : "Simulate decline & alert"}</span>
        </button>
      </div>

      {/* 4. Curated Video Resource Card */}
      <ResourcePanel apiUrl={apiUrl} topicTag={activeTopic} />
    </aside>
  );
};
