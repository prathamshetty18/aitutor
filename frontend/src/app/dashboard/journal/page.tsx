"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MOCK_JOURNAL_ENTRIES } from "@/lib/mockData";
import { EMOTION_COLORS } from "@/lib/constants";
import { EmptyState } from "@/components/layout/EmptyState";
import {
  Mic,
  Camera,
  Clock,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Square,
  X,
  Volume2,
  AlertCircle,
  Send,
  FileText,
  RotateCcw,
  Sparkles,
  Image as ImageIcon,
} from "lucide-react";
import type { JournalEntry } from "@/lib/types";
import { authedFetch } from "@/lib/backend";

type ProcessingStage = "idle" | "recording" | "transcribing" | "analyzing" | "done";

export default function JournalPage() {
  // Identity is derived server-side from the session; no client student IDs.

  const [mode, setMode] = useState<"voice" | "photo">("voice");
  const [stage, setStage] = useState<ProcessingStage>("idle");
  const [entries, setEntries] = useState<JournalEntry[]>(MOCK_JOURNAL_ENTRIES);
  const [showEmpty, setShowEmpty] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0); // 0 to 1
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");

  // Photo upload state
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoFileName, setPhotoFileName] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [photoExtractedText, setPhotoExtractedText] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const animFrameRef = useRef<number | null>(null);

  // Fetch real past entries from backend on mount
  useEffect(() => {
    const fetchEntries = async () => {
      try {
        const res = await authedFetch("/journal");
        if (res.ok) {
          const data: JournalEntry[] = await res.json();
          if (data && data.length > 0) {
            setEntries(data);
          }
        }
      } catch {
        // Use default mock entries if backend is unreachable
      }
    };
    fetchEntries();
  }, []);

  // Clean up audio resources on unmount
  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, []);

  const cleanupAudio = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setAudioLevel(0);
    setRecordingSeconds(0);
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // ---------------------------------------------------------------------------
  // WAV Encoding utilities for standard 16-bit PCM WAV (16kHz mono)
  // Ensures local faster-whisper decodes on-device without ffmpeg
  // ---------------------------------------------------------------------------
  const writeString = (view: DataView, offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  const mergeAndResample = (
    chunks: Float32Array[],
    inputSampleRate: number,
    targetSampleRate = 16000
  ): Float32Array => {
    let totalLength = 0;
    for (const chunk of chunks) {
      totalLength += chunk.length;
    }
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    if (inputSampleRate === targetSampleRate) {
      return merged;
    }

    const ratio = inputSampleRate / targetSampleRate;
    const newLength = Math.round(merged.length / ratio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const originPos = i * ratio;
      const originIndex = Math.floor(originPos);
      const fraction = originPos - originIndex;
      const s1 = merged[originIndex] || 0;
      const s2 = merged[originIndex + 1] || s1;
      result[i] = s1 + fraction * (s2 - s1);
    }

    return result;
  };

  const encodeWavBlob = (samples: Float32Array, sampleRate = 16000): Blob => {
    const numChannels = 1;
    const bytesPerSample = 2; // 16-bit PCM
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, "WAVE");

    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); // 16-bit

    writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);

    let writeOffset = 44;
    for (let i = 0; i < samples.length; i++, writeOffset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      const val = s < 0 ? Math.floor(s * 0x8000) : Math.floor(s * 0x7fff);
      view.setInt16(writeOffset, val, true);
    }

    return new Blob([view], { type: "audio/wav" });
  };

  // ---------------------------------------------------------------------------
  // Microphone Permission & Real Recording
  // ---------------------------------------------------------------------------
  const handleStartRecording = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Microphone access is not supported by your current browser.");
      return;
    }

    try {
      // 1. Ask permission from user for microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      // 2. Setup AudioContext to capture PCM buffers and measure volume
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);

      // Volume analyzer for visualizer
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      // Audio recorder node
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        audioChunksRef.current.push(new Float32Array(inputData));
      };

      // Mute feedback through speakers
      const muteGain = audioCtx.createGain();
      muteGain.gain.value = 0;
      source.connect(processor);
      processor.connect(muteGain);
      muteGain.connect(audioCtx.destination);

      // Animation loop to calculate live volume RMS
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setAudioLevel(Math.min(1, avg / 128));
        animFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      // Start elapsed timer
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

      setStage("recording");
    } catch (err: unknown) {
      cleanupAudio();
      setStage("idle");

      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setErrorMessage(
            "Microphone permission was denied. Please allow microphone access in your browser settings (look for the icon in your address bar) and try again."
          );
          return;
        }
        if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          setErrorMessage("No microphone detected. Please connect a microphone to your device.");
          return;
        }
      }

      const msg = err instanceof Error ? err.message : "Could not access microphone.";
      setErrorMessage(`Microphone error: ${msg}`);
    }
  };

  // ---------------------------------------------------------------------------
  // Stop Recording and Transcribe via local faster-whisper
  // ---------------------------------------------------------------------------
  const handleStopRecording = async () => {
    if (stage !== "recording") return;

    const recordedDuration = recordingSeconds;
    const inputSampleRate = audioContextRef.current?.sampleRate || 44100;
    const chunks = [...audioChunksRef.current];

    cleanupAudio();

    if (chunks.length === 0 || recordedDuration < 1) {
      setStage("idle");
      setErrorMessage("Recording was too short. Please speak for at least 1-2 seconds.");
      return;
    }

    try {
      setStage("transcribing");
      setErrorMessage(null);

      // Resample to 16kHz mono and encode to standard PCM WAV
      const resampledSamples = mergeAndResample(chunks, inputSampleRate, 16000);
      const wavBlob = encodeWavBlob(resampledSamples, 16000);

      await uploadAudioBlob(wavBlob, "voice_journal.wav");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error processing voice recording";
      setErrorMessage(msg);
      setStage("idle");
    }
  };

  const handleCancelRecording = () => {
    cleanupAudio();
    setStage("idle");
    setErrorMessage(null);
  };

  // ---------------------------------------------------------------------------
  // Upload Audio Blob to backend
  // ---------------------------------------------------------------------------
  const uploadAudioBlob = async (blob: Blob, filename = "voice_journal.wav") => {
    setStage("transcribing");
    setErrorMessage(null);

    const formData = new FormData();
    formData.append("file", blob, filename);

    try {
      const response = await authedFetch("/journal/voice", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Upload failed" }));
        throw new Error(errorData.detail || "Voice processing failed.");
      }

      setStage("analyzing");

      const data = await response.json();

      // Create new real entry
      const newEntry: JournalEntry = {
        id: `db-${data.entry_id || Date.now()}`,
        timestamp: new Date().toISOString(),
        transcript: data.transcript,
        emotionLabel: (data.emotion_label || "Neutral").toLowerCase(),
        sentimentScore: data.sentiment_score ?? 0.0,
        mode: "voice",
      };

      setEntries((prev) => [newEntry, ...prev]);
      setSuccessMessage(`Transcribed: "${data.transcript}" (${data.emotion_label})`);
      setStage("done");

      setTimeout(() => {
        setStage("idle");
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error processing voice upload";
      setErrorMessage(msg);
      setStage("idle");
    }
  };

  // ---------------------------------------------------------------------------
  // Submit Text Journal
  // ---------------------------------------------------------------------------
  const handleTextSubmit = async () => {
    if (!textInput.trim()) return;

    setStage("analyzing");
    setErrorMessage(null);

    try {
      const response = await authedFetch("/journal/text", {
        method: "POST",
        body: JSON.stringify({
          text: textInput.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Submission failed" }));
        throw new Error(errorData.detail || "Text journal processing failed.");
      }

      const data = await response.json();

      const newEntry: JournalEntry = {
        id: `db-${data.entry_id || Date.now()}`,
        timestamp: new Date().toISOString(),
        transcript: data.transcript,
        emotionLabel: (data.emotion_label || "Neutral").toLowerCase(),
        sentimentScore: data.sentiment_score ?? 0.0,
        mode: "voice",
      };

      setEntries((prev) => [newEntry, ...prev]);
      setSuccessMessage(`Saved: "${data.transcript}" (${data.emotion_label})`);
      setTextInput("");
      setStage("done");

      setTimeout(() => {
        setStage("idle");
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error processing journal entry";
      setErrorMessage(msg);
      setStage("idle");
    }
  };

  // Quick fallback demo audio generator
  const handleQuickDemoWav = async () => {
    const sampleRate = 16000;
    const duration = 2.0;
    const numSamples = sampleRate * duration;
    const samples = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      samples[i] = Math.sin((2 * Math.PI * 380 * i) / sampleRate) * 0.25;
    }
    const demoBlob = encodeWavBlob(samples, sampleRate);
    await uploadAudioBlob(demoBlob, "demo_voice_journal.wav");
  };

  // Photo upload and on-device OCR processing
  const handlePhotoUpload = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Please select a valid image file (PNG, JPG, WEBP).");
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsUploadingPhoto(true);
    setPhotoFileName(file.name);
    setPhotoExtractedText(null);

    // Create local preview
    const previewUrl = URL.createObjectURL(file);
    setPhotoPreviewUrl(previewUrl);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await authedFetch("/journal/photo", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Photo upload failed" }));
        throw new Error(errorData.detail || "Failed to extract text from photo.");
      }

      const data = await response.json();

      const newEntry: JournalEntry = {
        id: `db-${data.entry_id || Date.now()}`,
        timestamp: new Date().toISOString(),
        transcript: data.transcript,
        emotionLabel: (data.emotion_label || "Neutral").toLowerCase(),
        sentimentScore: data.sentiment_score ?? 0.0,
        mode: "photo",
      };

      setEntries((prev) => [newEntry, ...prev]);
      setPhotoExtractedText(data.transcript);
      setSuccessMessage(`Diary scanned & saved: "${data.transcript}" (${data.emotion_label})`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error extracting text from photo.";
      setErrorMessage(msg);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleResetPhoto = () => {
    setPhotoPreviewUrl(null);
    setPhotoFileName(null);
    setPhotoExtractedText(null);
    setIsUploadingPhoto(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSampleDiaryPhoto = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 650;
    canvas.height = 240;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Paper-like background with subtle lines
    ctx.fillStyle = "#FAF8F5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Notebook margin and faint ruled lines
    ctx.strokeStyle = "#E8E2D9";
    ctx.lineWidth = 1;
    for (let y = 60; y < canvas.height; y += 45) {
      ctx.beginPath();
      ctx.moveTo(30, y);
      ctx.lineTo(620, y);
      ctx.stroke();
    }
    // Margin line
    ctx.strokeStyle = "#F2B8B5";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(80, 0);
    ctx.lineTo(80, canvas.height);
    ctx.stroke();

    // Handwritten-style text
    ctx.fillStyle = "#1E293B";
    ctx.font = "bold 20px Georgia, serif";
    ctx.fillText("Oct 24 Diary: Studied dynamic programming today.", 95, 52);
    ctx.font = "18px Georgia, serif";
    ctx.fillText("Solved knapsack problem and feeling confident about midterms!", 95, 97);
    ctx.fillText("Need to revise operating systems memory management tomorrow.", 95, 142);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], "sample_diary_notes.png", { type: "image/png" });
        handlePhotoUpload(file);
      }
    }, "image/png");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-3xl mx-auto"
    >
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">Journal</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Record your thoughts via voice or photo — your AI tutor transcribes on-device and evaluates your emotional wellbeing.
        </p>
      </div>

      {/* ── Mode toggle ──────────────────────── */}
      <div className="flex gap-3 mb-6">
        {[
          { id: "voice" as const, label: "Record Voice", icon: Mic },
          { id: "photo" as const, label: "Upload Diary Photo", icon: Camera },
        ].map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-medium transition-all cursor-pointer border ${
                mode === m.id
                  ? "bg-[var(--accent-primary)] text-white border-[var(--accent-primary)] shadow-md"
                  : "bg-white text-[var(--text-secondary)] border-[var(--border-light)] hover:border-[var(--border-medium)]"
              }`}
            >
              <Icon className="w-4 h-4" />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* ── Recording / Upload card ──────────── */}
      <div className="axiom-card p-6 mb-8 relative">
        {mode === "voice" ? (
          <div className="flex flex-col items-center py-6">
            {/* Real-time sound wave visualizer while recording */}
            {stage === "recording" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-1.5 mb-6 h-12"
              >
                {[0.4, 0.7, 1.0, 0.6, 0.9, 0.5, 0.8, 1.0, 0.6, 0.4].map((factor, i) => (
                  <div
                    key={i}
                    className="w-1.5 rounded-full bg-gradient-to-t from-[var(--accent-primary)] to-amber-500 transition-all duration-75"
                    style={{
                      height: `${Math.max(8, Math.min(44, audioLevel * 50 * factor + 8))}px`,
                      opacity: 0.6 + audioLevel * 0.4,
                    }}
                  />
                ))}
              </motion.div>
            )}

            {/* Processing stage badges */}
            {stage === "transcribing" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 mb-6 text-[var(--accent-primary)]"
              >
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm font-medium">Transcribing locally via faster-whisper...</span>
              </motion.div>
            )}

            {stage === "analyzing" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 mb-6 text-[var(--accent-secondary)]"
              >
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm font-medium">Classifying emotional tone & sentiment...</span>
              </motion.div>
            )}

            {stage === "done" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 mb-6 text-[var(--success)]"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-sm font-medium">Reflection recorded and analyzed!</span>
              </motion.div>
            )}

            {/* Main Interactive Mic Button */}
            <div className="relative flex items-center justify-center mb-4">
              {stage === "recording" && (
                <span className="absolute -inset-3 rounded-full bg-red-400 opacity-30 animate-ping"></span>
              )}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (stage === "idle") {
                    handleStartRecording();
                  } else if (stage === "recording") {
                    handleStopRecording();
                  }
                }}
                disabled={stage === "transcribing" || stage === "analyzing"}
                className={`w-24 h-24 rounded-full flex flex-col items-center justify-center shadow-lg transition-all cursor-pointer z-10 ${
                  stage === "recording"
                    ? "bg-red-500 shadow-red-200"
                    : stage === "idle"
                    ? "bg-gradient-to-tr from-[var(--accent-primary)] to-[#F5A623] hover:shadow-xl"
                    : "bg-gray-200 opacity-70"
                }`}
              >
                {stage === "recording" ? (
                  <Square className="w-8 h-8 text-white fill-white" />
                ) : (
                  <Mic className="w-9 h-9 text-white" />
                )}
              </motion.button>
            </div>

            {/* Status caption & Timer */}
            <div className="text-center space-y-1">
              {stage === "recording" ? (
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-red-600">
                    REC {formatTimer(recordingSeconds)}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Listening to your voice... tap button or below to finish.
                  </p>
                </div>
              ) : stage === "idle" ? (
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    Tap microphone to record voice journal
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Browser will prompt for microphone permission.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">Processing your speech on-device...</p>
              )}
            </div>

            {/* Recording Controls: Stop & Transcribe + Cancel */}
            {stage === "recording" && (
              <div className="flex items-center gap-3 mt-5">
                <button
                  type="button"
                  onClick={handleCancelRecording}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-[#7C8398] hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer border border-transparent hover:border-red-100"
                >
                  <X className="w-4 h-4" />
                  <span>Cancel</span>
                </button>
                <button
                  type="button"
                  onClick={handleStopRecording}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-medium bg-red-500 hover:bg-red-600 text-white shadow-sm transition-all cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-white" />
                  <span>Stop & Transcribe</span>
                </button>
              </div>
            )}

            {/* Inline Quick Text or Sample Speech Helper */}
            {stage === "idle" && (
              <div className="w-full max-w-md mt-6 pt-5 border-t border-[var(--border-light)]">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleTextSubmit();
                    }}
                    placeholder="Or type a reflection (e.g. studied dynamic programming)..."
                    className="flex-1 text-xs px-3 py-2.5 rounded-xl border border-[var(--border-light)] bg-[#F8FAFC] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] focus:bg-white transition-all"
                  />
                  <button
                    type="button"
                    onClick={handleTextSubmit}
                    disabled={!textInput.trim()}
                    className="p-2.5 rounded-xl bg-[var(--accent-primary)] hover:opacity-90 disabled:opacity-40 text-white transition-all cursor-pointer"
                    title="Submit text reflection"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between mt-2.5 text-[11px] text-[var(--text-muted)]">
                  <button
                    onClick={handleQuickDemoWav}
                    className="flex items-center gap-1 hover:text-[var(--accent-primary)] hover:underline cursor-pointer"
                  >
                    <Volume2 className="w-3 h-3" />
                    <span>Test sample audio (.wav)</span>
                  </button>
                  <span>100% On-device privacy</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-2">
            {photoPreviewUrl ? (
              <div className="flex flex-col items-center space-y-4">
                {/* Photo Preview Container with scanning line */}
                <div className="relative w-full max-w-lg rounded-2xl overflow-hidden border border-[var(--border-medium)] bg-slate-900/5 shadow-sm">
                  {/* Image element */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoPreviewUrl}
                    alt="Uploaded diary notes"
                    className="w-full max-h-72 object-contain mx-auto bg-slate-50"
                  />

                  {/* Scanning line animation during OCR */}
                  {isUploadingPhoto && (
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                      <motion.div
                        initial={{ top: "-10%" }}
                        animate={{ top: "110%" }}
                        transition={{
                          repeat: Infinity,
                          duration: 1.6,
                          ease: "linear",
                        }}
                        className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[var(--accent-primary)] to-transparent shadow-[0_0_14px_var(--accent-primary)]"
                      />
                    </div>
                  )}

                  {/* Photo tag badge */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm text-white text-[11px] font-medium">
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>{photoFileName || "Diary Photo"}</span>
                  </div>
                </div>

                {/* Status indicator during OCR */}
                {isUploadingPhoto && (
                  <div className="flex items-center gap-2 text-sm text-[var(--accent-primary)] font-medium">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Scanning handwriting & extracting notes via on-device OCR...</span>
                  </div>
                )}

                {/* Extracted text preview once OCR succeeds */}
                {photoExtractedText && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-lg p-4 rounded-xl bg-slate-50 border border-[var(--border-light)] space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                        <FileText className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                        <span>Extracted &amp; Saved to Today&apos;s Journal</span>
                      </div>
                      <span className="text-[11px] text-[var(--text-muted)]">On-device OCR</span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap italic bg-white p-3 rounded-lg border border-[var(--border-light)] leading-relaxed">
                      &ldquo;{photoExtractedText}&rdquo;
                    </p>
                  </motion.div>
                )}

                {/* Reset / Upload Another Photo */}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleResetPhoto}
                    disabled={isUploadingPhoto}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium border border-[var(--border-medium)] hover:bg-slate-50 text-[var(--text-secondary)] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Upload Another Photo</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                {/* Drag and drop zone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const droppedFile = e.dataTransfer.files?.[0];
                    if (droppedFile) handlePhotoUpload(droppedFile);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full max-w-lg flex flex-col items-center gap-3 cursor-pointer px-8 py-10 rounded-2xl border-2 border-dashed transition-all ${
                    isDragging
                      ? "border-[var(--accent-primary)] bg-indigo-50/40 scale-[1.01]"
                      : "border-[var(--border-medium)] hover:border-[var(--accent-primary)] hover:bg-slate-50/50"
                  }`}
                >
                  <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-[var(--accent-primary)] shadow-sm">
                    <Camera className="w-7 h-7" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      Drag & drop or click to upload diary photo
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Upload photos of notebook pages, study notes, or written reflections.
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] pt-1">
                      Supports JPG, PNG, WEBP — automatically extracted & saved to journal.
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload(file);
                    }}
                  />
                </div>

                {/* Quick Test with Sample Photo */}
                <div className="mt-4 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <span>Don&apos;t have a photo ready?</span>
                  <button
                    type="button"
                    onClick={handleSampleDiaryPhoto}
                    className="flex items-center gap-1 font-medium text-[var(--accent-primary)] hover:underline cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Try sample handwritten notes</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Success Banner */}
        <AnimatePresence>
          {successMessage && stage !== "recording" && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="mt-4 p-3 rounded-xl bg-[#E8F7F0] border border-[#C3ECD8] flex items-center justify-between text-xs text-[#137A4C]"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-[#137A4C]" />
                <span className="font-medium">{successMessage}</span>
              </div>
              <button
                onClick={() => setSuccessMessage(null)}
                className="text-[#137A4C] hover:opacity-70 p-1 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Banner */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="mt-4 p-3 rounded-xl bg-[#FCE9E9] border border-[#FAD2D2] flex items-center justify-between text-xs text-[#E5484D]"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              <button
                onClick={() => setErrorMessage(null)}
                className="text-[#E5484D] hover:opacity-70 p-1 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Entry history ────────────────────── */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
          Past Reflections ({entries.length})
        </h2>
        <button
          onClick={() => setShowEmpty(!showEmpty)}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          {showEmpty ? "Show entries" : "Show empty state"}
        </button>
      </div>

      {showEmpty ? (
        <EmptyState
          icon="📝"
          title="No entries yet"
          description="Record your first voice journal or upload a diary photo to get started."
        />
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {entries.map((entry, i) => {
              const emotionKey = (entry.emotionLabel || "neutral").toLowerCase();
              const emotionColor = EMOTION_COLORS[emotionKey] || {
                bg: "#F4F6FB",
                text: "#7C8398",
              };
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: i * 0.04 }}
                  className="axiom-card p-5 space-y-2 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="px-2.5 py-1 rounded-full text-xs font-medium capitalize"
                        style={{
                          backgroundColor: emotionColor.bg,
                          color: emotionColor.text,
                        }}
                      >
                        {entry.emotionLabel}
                      </span>
                      {entry.hasMismatch && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-xs font-medium">
                          <AlertTriangle className="w-3 h-3" />
                          tone/text mismatch
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTime(entry.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    &ldquo;{entry.transcript}&rdquo;
                  </p>
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)] pt-1 border-t border-[var(--border-light)]">
                    <span className="flex items-center gap-1">
                      {entry.mode === "voice" ? "🎙️ Voice Reflection" : "📸 Photo Diary"}
                    </span>
                    <span className="font-mono">
                      Sentiment: {entry.sentimentScore > 0 ? "+" : ""}
                      {entry.sentimentScore.toFixed(2)}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
