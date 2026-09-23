"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  Square,
  ArrowRight,
  Upload,
  Volume2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";

interface VoiceRecorderProps {
  apiUrl: string;
  studentId: string;
  onEntryAdded?: () => void;
  onNewResult?: (result: EmotionResult) => void;
}

export interface EmotionResult {
  entry_id: number;
  transcript: string;
  emotion_label: string;
  sentiment_score: number;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  apiUrl,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  studentId: _studentId,
  onEntryAdded,
  onNewResult,
}) => {
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0); // 0 to 1 for visualizer
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const animFrameRef = useRef<number | null>(null);

  // Clean up recording resources on unmount
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

  // Helper to format recording timer mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // ---------------------------------------------------------------------------
  // WAV Encoding utilities for standard 16-bit PCM WAV (16kHz mono)
  // Ensures local faster-whisper decodes without needing ffmpeg
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

  // Synthesize standard 16-bit PCM WAV for 1-click fallback demo
  const createDemoWavBlob = (freq = 330): Blob => {
    const sampleRate = 16000;
    const duration = 2.0;
    const numSamples = sampleRate * duration;
    const samples = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      samples[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.25;
    }

    return encodeWavBlob(samples, sampleRate);
  };

  // ---------------------------------------------------------------------------
  // Microphone Permission & Start Recording
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

      setIsRecording(true);
    } catch (err: unknown) {
      cleanupAudio();
      setIsRecording(false);

      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setErrorMessage(
            "Microphone permission was denied. Please allow microphone access in your browser settings (look for the permission icon in your address bar) and try again."
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
  // Stop Recording and Transcribe to Text
  // ---------------------------------------------------------------------------
  const handleStopRecording = async () => {
    if (!isRecording) return;

    setIsRecording(false);
    const recordedDuration = recordingSeconds;
    const inputSampleRate = audioContextRef.current?.sampleRate || 44100;
    const chunks = [...audioChunksRef.current];

    cleanupAudio();

    if (chunks.length === 0 || recordedDuration < 1) {
      setErrorMessage("Recording was too short. Please speak for at least 1-2 seconds.");
      return;
    }

    try {
      setIsProcessing(true);
      setErrorMessage(null);

      // Resample to 16kHz mono and encode to standard PCM WAV
      const resampledSamples = mergeAndResample(chunks, inputSampleRate, 16000);
      const wavBlob = encodeWavBlob(resampledSamples, 16000);

      await uploadAudioBlob(wavBlob, "user_voice_journal.wav");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error processing voice recording";
      setErrorMessage(msg);
      setIsProcessing(false);
    }
  };

  const handleCancelRecording = () => {
    cleanupAudio();
    setIsRecording(false);
    setErrorMessage(null);
  };

  // ---------------------------------------------------------------------------
  // Upload Audio Blob to backend Faster-Whisper pipeline
  // ---------------------------------------------------------------------------
  const uploadAudioBlob = async (blob: Blob, filename = "voice_journal.wav") => {
    setIsProcessing(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append("file", blob, filename);

    try {
      const response = await fetch(`${apiUrl}/journal/voice`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Upload failed" }));
        throw new Error(errorData.detail || "Voice processing failed.");
      }

      const data: EmotionResult = await response.json();
      
      // Update text input with the transcribed text so user sees the conversion
      setInputText(data.transcript);
      setSuccessMessage(`Transcribed: "${data.transcript}" (${data.emotion_label})`);

      if (onNewResult) onNewResult(data);
      if (onEntryAdded) onEntryAdded();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error processing voice upload";
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Submit Text Journal (if user typed instead of spoke)
  // ---------------------------------------------------------------------------
  const handleTextSubmit = async () => {
    if (!inputText.trim()) {
      handleStartRecording();
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${apiUrl}/journal/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          text: inputText.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Submission failed" }));
        throw new Error(errorData.detail || "Text journal processing failed.");
      }

      const data: EmotionResult = await response.json();
      setSuccessMessage(`Journal saved: "${data.transcript}" (${data.emotion_label})`);

      if (onNewResult) onNewResult(data);
      if (onEntryAdded) onEntryAdded();
      setInputText("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error processing journal entry";
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Upload custom .wav file
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".wav")) {
      setErrorMessage("Safety constraint: only .wav files accepted for local Whisper reliability.");
      return;
    }

    await uploadAudioBlob(file, file.name);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Quick fallback demo
  const handleQuickDemoWav = async () => {
    const demoBlob = createDemoWavBlob(380);
    await uploadAudioBlob(demoBlob, "demo_voice_journal.wav");
  };

  return (
    <div className="w-full space-y-3">
      {/* Ask box input container */}
      <div className="axiom-card p-2 flex items-center gap-2 rounded-full border-[#ECEEF5] shadow-sm relative transition-all">
        {/* Recording active indicator view */}
        {isRecording ? (
          <div className="flex-1 flex items-center justify-between px-3 py-1">
            {/* Live recording status & timer */}
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <span className="text-xs font-semibold text-red-600 tracking-wide">
                REC {formatTime(recordingSeconds)}
              </span>
              <span className="text-xs text-[#7C8398] hidden sm:inline">
                Listening to your voice...
              </span>
            </div>

            {/* Dynamic sound wave visualizer bars */}
            <div className="flex items-center gap-1 h-5 px-2">
              {[0.4, 0.8, 1.0, 0.6, 0.9, 0.5, 0.7].map((factor, i) => (
                <div
                  key={i}
                  className="w-1 bg-[#4B6BFB] rounded-full transition-all duration-75"
                  style={{
                    height: `${Math.max(4, Math.min(20, audioLevel * 24 * factor + 4))}px`,
                    opacity: 0.5 + audioLevel * 0.5,
                  }}
                />
              ))}
            </div>

            {/* Action buttons while recording: Cancel & Stop */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCancelRecording}
                title="Cancel recording"
                className="p-1.5 rounded-full text-[#7C8398] hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleStopRecording}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs font-medium shadow-sm transition-all cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-white" />
                <span>Stop & Transcribe</span>
              </button>
            </div>
          </div>
        ) : (
          /* Normal input view */
          <>
            {/* Mic trigger button — asks for permission & starts recording */}
            <button
              type="button"
              onClick={handleStartRecording}
              disabled={isProcessing}
              title="Click to allow microphone and record voice reflection"
              className="w-10 h-10 rounded-full bg-[#EFF3FF] hover:bg-[#E2EAFF] active:scale-95 text-[#4B6BFB] flex items-center justify-center transition-all shrink-0 cursor-pointer disabled:opacity-50 relative group"
            >
              <Mic className="w-4 h-4 group-hover:scale-110 transition-transform" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
              </span>
            </button>

            {/* Input Text Field */}
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                isProcessing
                  ? "Transcribing your voice with local Whisper..."
                  : "Speak into mic or type your reflection here..."
              }
              disabled={isProcessing}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isProcessing) {
                  handleTextSubmit();
                }
              }}
              className="flex-1 text-xs text-[#16192B] placeholder-[#7C8398] bg-transparent outline-none px-2"
            />

            {/* Secondary Upload .WAV trigger */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              title="Upload existing .wav audio"
              className="p-2 rounded-full text-[#7C8398] hover:text-[#16192B] hover:bg-[#F4F6FB] transition-colors shrink-0 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
            </button>

            {/* Send / Transcribe Action Pill */}
            <button
              type="button"
              onClick={inputText.trim() ? handleTextSubmit : handleStartRecording}
              disabled={isProcessing}
              title={inputText.trim() ? "Submit text reflection" : "Record voice reflection"}
              className="w-9 h-9 rounded-full bg-[#4B6BFB] hover:bg-[#3B5BEB] active:scale-95 text-white flex items-center justify-center transition-all shrink-0 shadow-sm cursor-pointer disabled:opacity-50"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
            </button>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".wav,audio/wav"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Helper trigger row */}
      <div className="flex flex-wrap items-center justify-between px-3 text-[11px] text-[#7C8398] gap-2">
        <div className="flex items-center gap-3">
          <button
            onClick={handleStartRecording}
            disabled={isRecording || isProcessing}
            className="flex items-center gap-1 text-[#4B6BFB] hover:underline cursor-pointer font-medium"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Record Voice Journal</span>
          </button>

          <span className="text-[#D0D4DF]">•</span>

          <button
            onClick={handleQuickDemoWav}
            disabled={isRecording || isProcessing}
            className="flex items-center gap-1 hover:text-[#16192B] hover:underline cursor-pointer"
          >
            <Volume2 className="w-3 h-3" />
            <span>Test sample audio (.wav)</span>
          </button>
        </div>

        <span className="text-[10px]">Transcribed on-device via faster-whisper</span>
      </div>

      {/* Success banner with transcribed text */}
      <AnimatePresence>
        {successMessage && !isRecording && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="p-3 rounded-2xl bg-[#E8F7F0] border border-[#C3ECD8] flex items-center justify-between text-xs text-[#137A4C]"
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

      {/* Error state */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="p-3 rounded-2xl bg-[#FCE9E9] border border-[#FAD2D2] flex items-center justify-between text-xs text-[#E5484D]"
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
  );
};
