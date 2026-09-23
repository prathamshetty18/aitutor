"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import type { ChatMessage } from "@/lib/types";
import { useAuth } from "../../providers";
import { Send, Sparkles, Bot, User, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";
import { authedFetch } from "@/lib/backend";
import { getPlanUpdateNotifier } from "@/lib/plan-events";

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi there! 👋 I'm your **Harmony AI Tutor** — context-aware of your academic profile, journal mood, and goals.\n\nAsk me anything: explain a concept, quiz you on a topic, help plan your study schedule, or just talk through something stressful. What's on your mind?",
  timestamp: new Date().toISOString(),
};

const suggestedPrompts = [
  "Explain binary search trees",
  "Help me plan my study schedule",
  "I'm feeling overwhelmed with exams",
  "Quiz me on dynamic programming",
];

function MarkdownText({ text }: { text: string }) {
  // Simple markdown renderer for bold, code blocks, numbered/bullet lists
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        // Code block (single backtick inline)
        const parts = line.split(/(`[^`]+`)/g);
        const rendered = parts.map((part, j) => {
          if (part.startsWith("`") && part.endsWith("`")) {
            return (
              <code
                key={j}
                className="px-1 py-0.5 rounded bg-gray-100 text-[#E07A2F] font-mono text-xs"
              >
                {part.slice(1, -1)}
              </code>
            );
          }
          // Bold **text**
          const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
          return boldParts.map((bp, k) => {
            if (bp.startsWith("**") && bp.endsWith("**")) {
              return <strong key={k}>{bp.slice(2, -2)}</strong>;
            }
            return <span key={k}>{bp}</span>;
          });
        });
        return <div key={i}>{rendered}</div>;
      })}
    </div>
  );
}

export default function ChatPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [planNotice, setPlanNotice] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamedText]);

  // Build conversation history for backend (exclude welcome message)
  const buildHistory = useCallback(
    (currentMessages: ChatMessage[]) =>
      currentMessages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content })),
    []
  );

  // Simulate streaming effect for the received text
  const simulateStream = useCallback(
    (fullText: string, onDone: () => void) => {
      setStreamedText("");
      let i = 0;
      // Faster streaming: larger chunks for speed
      const interval = setInterval(() => {
        if (i < fullText.length) {
          const chunkSize = Math.min(4, fullText.length - i);
          setStreamedText(fullText.slice(0, i + chunkSize));
          i += chunkSize;
        } else {
          clearInterval(interval);
          setStreamedText("");
          onDone();
        }
      }, 12);
    },
    []
  );

  const handleSend = useCallback(
    async (text?: string) => {
      const msg = (text || input).trim();
      if (!msg || isLoading) return;

      setError(null);
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: msg,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsLoading(true);

      try {
        const response = await authedFetch("/chat", {
          method: "POST",
          body: JSON.stringify({
            message: msg,
            student_id: user?.id || undefined,
            student_name: user?.name || undefined,
            department: user?.department || undefined,
            history: buildHistory([...messages, userMsg]),
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err?.detail || `Server error ${response.status}`);
        }

        const data = await response.json();
        const replyText: string = data.reply || "I couldn't generate a response. Please try again.";

        // If the tutor applied a plan/SWOT/goal change, notify + let dashboard refresh
        if (data.plan_update?.action) {
          const action = data.plan_update.action as string;
          const label =
            action === "update_profile" ? "Your SWOT/goals were updated from this chat"
            : action === "regenerate_week" ? "Pending tasks cleared — regenerate your plan on the dashboard"
            : "Your study plan was updated from this chat";
          setPlanNotice(label);
          getPlanUpdateNotifier().notify();
        }

        // Simulate streaming the received text
        simulateStream(replyText, () => {
          setMessages((prev) => [
            ...prev,
            {
              id: `ai-${Date.now()}`,
              role: "assistant",
              content: replyText,
              timestamp: new Date().toISOString(),
            },
          ]);
          setIsLoading(false);
        });
      } catch (err: unknown) {
        console.error("[Chat] Error:", err);
        const msg = err instanceof Error ? err.message : "Failed to reach the AI tutor. Make sure the backend is running.";
        setError(msg);
        setIsLoading(false);
      }
    },
    [input, isLoading, messages, user, buildHistory, simulateStream]
  );

  const clearChat = () => {
    setMessages([WELCOME_MESSAGE]);
    setError(null);
    inputRef.current?.focus();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-3xl mx-auto flex flex-col"
      style={{ height: "calc(100vh - 12rem)" }}
    >
      {/* ── Chat header ──────────────────────── */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[var(--accent-secondary)] to-[#06B6D4] flex items-center justify-center shadow-sm">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="font-display text-xl font-bold text-[var(--text-primary)]">AI Tutor</h1>
          <p className="text-xs text-[var(--text-muted)]">
            {user?.name ? `Personalised for ${user.name.split(" ")[0]}` : "Context-aware"} — knows your mood, goals &amp; academics
          </p>
        </div>
        <button
          onClick={clearChat}
          className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--accent-secondary)] hover:bg-[var(--accent-secondary-light)] transition-colors cursor-pointer"
          title="New conversation"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ── Messages ─────────────────────────── */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4 pr-2">
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[var(--accent-secondary)] to-[#06B6D4] flex items-center justify-center flex-shrink-0 mt-1">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            <div
              className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-[var(--accent-primary)] text-white rounded-br-md"
                  : "bg-white border border-[var(--border-light)] text-[var(--text-primary)] rounded-bl-md shadow-sm"
              }`}
            >
              {msg.role === "assistant" ? (
                <MarkdownText text={msg.content} />
              ) : (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[var(--accent-primary)] to-[#F5A623] flex items-center justify-center flex-shrink-0 mt-1 overflow-hidden">
                {user?.avatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white text-xs font-bold">
                    {user?.name?.charAt(0) || <User className="w-4 h-4 text-white" />}
                  </span>
                )}
              </div>
            )}
          </motion.div>
        ))}

        {/* Streaming response */}
        {(isLoading || streamedText) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[var(--accent-secondary)] to-[#06B6D4] flex items-center justify-center flex-shrink-0 mt-1">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-bl-md bg-white border border-[var(--border-light)] text-sm text-[var(--text-primary)] leading-relaxed shadow-sm">
              {streamedText ? (
                <div className="whitespace-pre-wrap">
                  <MarkdownText text={streamedText} />
                  <motion.span
                    animate={{ opacity: [1, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                    className="inline-block w-2 h-4 bg-[var(--accent-secondary)] ml-0.5 rounded-sm"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[var(--text-muted)]">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-[var(--accent-secondary)]"
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </div>
                  <span className="text-xs">Thinking...</span>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Plan-change confirmation */}
        {planNotice && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-100"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-medium text-emerald-700">Plan updated</p>
              <p className="text-xs text-emerald-600 mt-0.5">{planNotice}</p>
            </div>
            <button
              onClick={() => setPlanNotice(null)}
              className="text-emerald-400 hover:text-emerald-600 cursor-pointer"
              title="Dismiss"
            >
              <AlertCircle className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {/* Error state */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100"
          >
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-red-700">Connection error</p>
              <p className="text-xs text-red-500 mt-0.5">{error}</p>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Suggested prompts (shown until first real exchange) ── */}
      {messages.length <= 1 && !isLoading && (
        <div className="flex flex-wrap gap-2 mb-3">
          {suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => handleSend(prompt)}
              className="px-3 py-1.5 rounded-xl border border-[var(--border-light)] text-xs text-[var(--text-secondary)] hover:bg-[var(--accent-secondary-light)] hover:border-[var(--accent-secondary)] hover:text-[var(--accent-secondary)] transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Sparkles className="w-3 h-3" />
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* ── Input ────────────────────────────── */}
      <div className="flex gap-3">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask your AI tutor anything..."
          disabled={isLoading}
          className="flex-1 px-5 py-3.5 rounded-2xl border border-[var(--border-light)] bg-white text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-secondary)]/30 focus:border-[var(--accent-secondary)] transition-all disabled:opacity-50"
        />
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleSend()}
          disabled={isLoading || !input.trim()}
          className="w-12 h-12 rounded-2xl bg-gradient-to-r from-[var(--accent-secondary)] to-[#06B6D4] text-white flex items-center justify-center shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50"
        >
          <Send className="w-5 h-5" />
        </motion.button>
      </div>
    </motion.div>
  );
}
