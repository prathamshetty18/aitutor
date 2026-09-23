"use client";

import React from "react";

interface TagChipProps {
  label: string;
  selected?: boolean;
  onToggle?: () => void;
  removable?: boolean;
  onRemove?: () => void;
}

export function TagChip({ label, selected = false, onToggle, removable, onRemove }: TagChipProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer border ${
        selected
          ? "bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]"
          : "bg-white text-[var(--text-secondary)] border-[var(--border-light)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
      }`}
    >
      {label}
      {removable && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className="ml-1 hover:text-red-400"
        >
          ×
        </span>
      )}
    </button>
  );
}
