"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { MOCK_REWIND_SLIDES } from "@/lib/mockData";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Share2,
} from "lucide-react";

function AnimatedNumber({ value, duration = 1.5 }: { value: string | number; duration?: number }) {
  const [display, setDisplay] = useState<string>("");

  useEffect(() => {
    const str = String(value);
    // If it's a number or ratio, animate it
    if (/^[\d.+/-]+$/.test(str.replace(/[/]/g, ""))) {
      const steps = 30;
      let step = 0;
      const interval = setInterval(() => {
        step++;
        if (step >= steps) {
          setDisplay(str);
          clearInterval(interval);
        } else {
          // Random characters for first half, then converge
          if (step < steps * 0.6) {
            setDisplay(
              str
                .split("")
                .map((c) =>
                  /\d/.test(c) ? String(Math.floor(Math.random() * 10)) : c
                )
                .join("")
            );
          } else {
            setDisplay(str);
          }
        }
      }, (duration * 1000) / steps);
      return () => clearInterval(interval);
    } else {
      // For text values, just reveal letter by letter
      let i = 0;
      const interval = setInterval(() => {
        i++;
        if (i > str.length) {
          clearInterval(interval);
        } else {
          setDisplay(str.slice(0, i));
        }
      }, (duration * 1000) / str.length);
      return () => clearInterval(interval);
    }
  }, [value, duration]);

  return <span>{display}</span>;
}

export default function RewindPage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [hasEnoughData] = useState(true);
  const router = useRouter();
  const slides = MOCK_REWIND_SLIDES;

  const goNext = useCallback(() => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide((s) => s + 1);
    }
  }, [currentSlide, slides.length]);

  const goPrev = useCallback(() => {
    if (currentSlide > 0) {
      setCurrentSlide((s) => s - 1);
    }
  }, [currentSlide]);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -60) goNext();
    else if (info.offset.x > 60) goPrev();
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") goNext();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "Escape") router.push("/dashboard");
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev, router]);

  // Confetti on last slide
  useEffect(() => {
    if (currentSlide === slides.length - 1) {
      import("canvas-confetti").then((mod) => {
        const confetti = mod.default;
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#E07A2F", "#F5A623", "#2BA89C", "#7B5CF0", "#4B6BFB"],
        });
      });
    }
  }, [currentSlide, slides.length]);

  if (!hasEnoughData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600">
        <div className="text-center text-white p-8">
          <span className="text-6xl mb-6 block">📊</span>
          <h2 className="font-display text-3xl font-bold mb-3">Not Enough Data Yet</h2>
          <p className="text-white/70 text-lg mb-8 max-w-md">
            Journal for at least 3 days this week to unlock your personalized Weekly Rewind.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-3 rounded-2xl bg-white text-purple-600 font-bold text-sm shadow-lg hover:shadow-xl transition-all cursor-pointer"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const slide = slides[currentSlide];

  return (
    <div className={`fixed inset-0 z-50 flex flex-col bg-gradient-to-br ${slide.gradient}`}>
      {/* ── Top bar ──────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4">
        <button
          onClick={() => router.push("/dashboard")}
          className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Progress dots */}
        <div className="flex items-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                i === currentSlide
                  ? "w-8 bg-white"
                  : i < currentSlide
                  ? "w-3 bg-white/60"
                  : "w-3 bg-white/30"
              }`}
            />
          ))}
        </div>

        <button
          className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors cursor-pointer"
        >
          <Share2 className="w-5 h-5" />
        </button>
      </div>

      {/* ── Slide content ────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, scale: 0.8, rotateY: -15 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            exit={{ opacity: 0, scale: 0.8, rotateY: 15 }}
            transition={{ type: "spring", damping: 20, stiffness: 150 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.3}
            onDragEnd={handleDragEnd}
            className="max-w-lg w-full text-center text-white cursor-grab active:cursor-grabbing select-none"
          >
            {/* Icon */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: "spring", damping: 12 }}
              className="text-7xl mb-8"
            >
              {slide.icon}
            </motion.div>

            {/* Headline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-xl md:text-2xl font-medium text-white/80 mb-4 tracking-wide"
            >
              {slide.headline}
            </motion.p>

            {/* Big value */}
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5, type: "spring", damping: 10 }}
              className="font-display text-7xl md:text-8xl lg:text-9xl font-black mb-6 tracking-tight drop-shadow-lg"
            >
              <AnimatedNumber value={slide.value} />
            </motion.div>

            {/* Subtext */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="text-lg md:text-xl text-white/70 max-w-md mx-auto leading-relaxed"
            >
              {slide.subtext}
            </motion.p>

            {/* Final slide CTA */}
            {currentSlide === slides.length - 1 && (
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2 }}
                onClick={() => router.push("/dashboard")}
                className="mt-10 px-8 py-4 rounded-2xl bg-white text-[var(--text-primary)] font-bold text-lg shadow-xl hover:shadow-2xl transition-all cursor-pointer hover:scale-105"
              >
                Back to Dashboard 🚀
              </motion.button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Bottom navigation ────────────────── */}
      <div className="flex items-center justify-between px-6 py-6">
        <button
          onClick={goPrev}
          disabled={currentSlide === 0}
          className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        <span className="text-sm text-white/60 font-medium">
          {currentSlide + 1} / {slides.length}
        </span>

        <button
          onClick={goNext}
          disabled={currentSlide === slides.length - 1}
          className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* Decorative circles */}
      <div className="fixed -bottom-20 -left-20 w-60 h-60 rounded-full bg-white/5 pointer-events-none" />
      <div className="fixed -top-16 -right-16 w-48 h-48 rounded-full bg-white/5 pointer-events-none" />
      <div className="fixed top-1/3 -left-10 w-32 h-32 rounded-full bg-white/3 pointer-events-none" />
    </div>
  );
}
