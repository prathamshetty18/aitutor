"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

interface ScoreGaugeProps {
  score: number; // -1.0 to 1.0
  deltaPercent?: number; // e.g. -34
  label?: string;
  sublabel?: string;
}

export const ScoreGauge: React.FC<ScoreGaugeProps> = ({
  score = 0,
  deltaPercent = -18,
  label = "Wellbeing score",
  sublabel = "Based on 7-day emotional velocity",
}) => {
  // Map score from [-1.0, 1.0] to [0, 100]
  const percentage = Math.round(((score + 1) / 2) * 100);
  const clamped = Math.max(0, Math.min(100, percentage));

  // Semi-circle SVG gauge geometry
  const radius = 70;
  const strokeWidth = 12;
  const circumference = Math.PI * radius; // Half-circle perimeter
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  const isNegativeDelta = (deltaPercent ?? 0) < 0;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-48 h-28 flex items-end justify-center">
        <svg
          viewBox="0 0 160 90"
          className="w-full h-full overflow-visible"
        >
          <defs>
            {/* Axiom heat scale: red -> orange -> yellow -> green */}
            <linearGradient id="axiomHeatGradient" x1="0%" y1="100%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#E5484D" />
              <stop offset="35%" stopColor="#F5A623" />
              <stop offset="70%" stopColor="#F7D154" />
              <stop offset="100%" stopColor="#3DBE6C" />
            </linearGradient>
          </defs>

          {/* Background track arc */}
          <path
            d="M 10 80 A 70 70 0 0 1 150 80"
            fill="none"
            stroke="#ECEEF5"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Animated value arc */}
          <motion.path
            d="M 10 80 A 70 70 0 0 1 150 80"
            fill="none"
            stroke="url(#axiomHeatGradient)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        </svg>

        {/* Center Percentage Display */}
        <div className="absolute bottom-1 text-center flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tracking-tight text-[#16192B]">
            {clamped}%
          </span>
          <span className="text-[11px] text-[#7C8398] font-medium mt-0.5">
            {label}
          </span>
        </div>
      </div>

      {/* Low / High Endpoint Labels */}
      <div className="w-44 flex items-center justify-between text-[11px] text-[#7C8398] font-medium px-1 mt-1">
        <span>0%</span>
        <span>100%</span>
      </div>

      {/* Delta Line */}
      <div className="mt-3 flex items-center gap-1 text-[12px] font-medium">
        {deltaPercent !== undefined && deltaPercent !== 0 ? (
          isNegativeDelta ? (
            <span className="flex items-center gap-0.5 text-[#E5484D]">
              <ArrowDownRight className="w-3.5 h-3.5" />
              {Math.abs(deltaPercent)}% vs last day
            </span>
          ) : (
            <span className="flex items-center gap-0.5 text-[#2FAE60]">
              <ArrowUpRight className="w-3.5 h-3.5" />
              {deltaPercent}% vs last day
            </span>
          )
        ) : (
          <span className="flex items-center gap-0.5 text-[#7C8398]">
            <Minus className="w-3.5 h-3.5" />
            Steady baseline
          </span>
        )}
      </div>

      <p className="text-[11px] text-[#7C8398] text-center mt-1">
        {sublabel}
      </p>
    </div>
  );
};
