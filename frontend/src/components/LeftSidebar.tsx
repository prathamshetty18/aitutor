"use client";

import React from "react";
import {
  MessageSquareText,
  Sparkles,
  BookOpen,
  ShieldCheck,
  LifeBuoy,
  Lock,
} from "lucide-react";

interface LeftSidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  isBackendOnline?: boolean | null;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  activeTab,
  onSelectTab,
  isBackendOnline = true,
}) => {
  const navItems = [
    { id: "feed", label: "Learning feed", icon: MessageSquareText },
    { id: "rewind", label: "Weekly rewind", icon: Sparkles },
    { id: "resources", label: "Curated videos", icon: BookOpen },
    { id: "safety", label: "Safety alerts", icon: ShieldCheck },
  ];

  return (
    <aside className="w-[220px] shrink-0 flex flex-col justify-between h-full p-4 select-none">
      <div className="space-y-6">
        {/* Brand / Logo Orb */}
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#7B5CF0] to-[#4B6BFB] flex items-center justify-center shadow-sm">
            {/* Simple friendly face dots */}
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white opacity-95" />
              <span className="w-1.5 h-1.5 rounded-full bg-white opacity-95" />
            </div>
          </div>
          <div>
            <span className="font-semibold text-base text-[#16192B] tracking-tight block">
              AI Tutor
            </span>
            <span className="text-[11px] text-[#7C8398] block -mt-0.5">
              Knowledge brain
            </span>
          </div>
        </div>

        {/* Navigation List */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-full text-xs font-medium transition-colors cursor-pointer text-left ${
                  isActive
                    ? "bg-[#EFF3FF] text-[#4B6BFB]"
                    : "text-[#7C8398] hover:text-[#16192B] hover:bg-white/60"
                }`}
              >
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? "text-[#4B6BFB]" : "text-[#7C8398]"
                  }`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Privacy & Help Card */}
      <div className="space-y-3">
        <div className="axiom-card p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#16192B]">
            <Lock className="w-3.5 h-3.5 text-[#4B6BFB]" />
            <span>Local-first guarantee</span>
          </div>
          <p className="text-[11px] text-[#7C8398] leading-snug">
            Transcripts &amp; vectors stay offline. Only aggregate trends notify counselors.
          </p>
          <div className="pt-1 flex items-center gap-1.5 text-[10px] text-[#7C8398]">
            <span
              className={`w-2 h-2 rounded-full ${
                isBackendOnline === true
                  ? "bg-[#2FAE60]"
                  : isBackendOnline === false
                  ? "bg-[#E5484D]"
                  : "bg-[#E8A33D]"
              }`}
            />
            <span>{isBackendOnline ? "System ready" : "Connecting..."}</span>
          </div>
        </div>

        <div className="px-2 flex items-center justify-between text-[11px] text-[#7C8398]">
          <span className="flex items-center gap-1">
            <LifeBuoy className="w-3 h-3" />
            Support
          </span>
          <span className="font-mono text-[10px]">v1.0 MVP</span>
        </div>
      </div>
    </aside>
  );
};
