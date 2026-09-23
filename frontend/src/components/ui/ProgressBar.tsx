"use client";

import React from "react";

interface ProgressBarProps {
  progress: number; // 0-100
  height?: number;
  color?: string;
  bgColor?: string;
  showLabel?: boolean;
  className?: string;
}

export function ProgressBar({
  progress,
  height = 8,
  color = "var(--accent-primary)",
  bgColor = "var(--border-light)",
  showLabel = false,
  className = "",
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, progress));
  return (
    <div className={`w-full ${className}`}>
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ height, backgroundColor: bgColor }}
      >
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${clamped}%`, backgroundColor: color }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-[var(--text-muted)] mt-1 block text-right">
          {Math.round(clamped)}%
        </span>
      )}
    </div>
  );
}
