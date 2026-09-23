"use client";

import React, { useEffect, useState } from "react";
import { Brain, ShieldCheck, Database, Cpu, Radio } from "lucide-react";

interface HeaderProps {
  apiUrl: string;
  studentId: string;
}

export const Header: React.FC<HeaderProps> = ({ apiUrl, studentId }) => {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [backendMeta, setBackendMeta] = useState<{
    sentiment_threshold?: number;
    rolling_window_days?: number;
  } | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${apiUrl}/`);
        if (res.ok) {
          const data = await res.json();
          setIsOnline(true);
          setBackendMeta(data);
        } else {
          setIsOnline(false);
        }
      } catch {
        setIsOnline(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, [apiUrl]);

  return (
    <header className="border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-xl sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-pink-500 p-0.5 shadow-lg shadow-indigo-500/25">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Brain className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-tight">AI Tutor</h1>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                  MVP Demo
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Privacy-First Knowledge Brain &amp; Institutional Early-Warning System
              </p>
            </div>
          </div>

          {/* Architecture badges */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
              <Radio className="w-3.5 h-3.5 text-indigo-400" />
              <span>Whisper STT (Local)</span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span>SQLite + sqlite-vec</span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
              <Cpu className="w-3.5 h-3.5 text-violet-400" />
              <span>Groq Qwen 3.8</span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
              <span>Student: <span className="font-mono text-white">{studentId}</span></span>
            </div>

            {/* Backend connection dot */}
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px]"
              title={backendMeta?.sentiment_threshold ? `Sentiment Threshold: ${backendMeta.sentiment_threshold}` : undefined}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isOnline === true
                    ? "bg-emerald-400 animate-pulse"
                    : isOnline === false
                    ? "bg-rose-400"
                    : "bg-amber-400"
                }`}
              />
              <span className={isOnline ? "text-slate-300" : "text-rose-400"}>
                {isOnline === true ? "FastAPI Online" : isOnline === false ? "Offline" : "Connecting..."}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
