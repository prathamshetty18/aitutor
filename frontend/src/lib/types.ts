// ──────────────────────────────────────────────
// Shared types for the AI Tutor scaffold
// ──────────────────────────────────────────────

export type Role = "student" | "teacher" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  collegeId: string;
  avatarUrl?: string;
  department?: string;
}

// ── Onboarding ───────────────────────────────
export interface SwotData {
  strengths: string;
  weaknesses: string;
  opportunities: string;
  threats: string;
}

export interface OnboardingData {
  swot: SwotData;
  marksheetFile: File | null;
  goals: string;
  goalTags: string[];
}

// ── Journal ──────────────────────────────────
export type EmotionLabel =
  | "joyful"
  | "confident"
  | "calm"
  | "curious"
  | "anxious"
  | "pensive"
  | "frustrated"
  | "overwhelmed"
  | "exhausted";

export interface JournalEntry {
  id: string;
  timestamp: string;
  transcript: string;
  emotionLabel: EmotionLabel;
  sentimentScore: number;
  mode: "voice" | "photo";
  hasMismatch?: boolean;
}

// ── Chat ─────────────────────────────────────
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// ── Academics ────────────────────────────────
export interface SubjectMarks {
  subject: string;
  mse1?: number;
  mse2?: number;
  college?: number;
  maxMarks: number;
  tenth?: number;
  twelfth?: number;
}

export interface AttendanceRecord {
  subject: string;
  percentage: number;
  totalClasses: number;
  attended: number;
}

export interface StudyMaterial {
  id: string;
  subject: string;
  title: string;
  youtubeUrl: string;
  thumbnailUrl: string;
  isWeakSubject?: boolean;
}

// ── Goals / Progress ─────────────────────────
export interface DailyGoal {
  id: string;
  label: string;
  progress: number; // 0-100
  completed: boolean;
}

// ── Weekly Rewind ────────────────────────────
export interface RewindSlide {
  id: string;
  headline: string;
  value: string | number;
  subtext: string;
  gradient: string;
  icon?: string;
}

// ── Teacher ──────────────────────────────────
export interface StudentRecord {
  id: string;
  name: string;
  email: string;
  department: string;
  semester: number;
  gpa: number;
}

export interface ExtracurricularEntry {
  id: string;
  studentId: string;
  studentName: string;
  activity: string;
  role: string;
  date: string;
}

// ── Admin ────────────────────────────────────
export interface AlertLogEntry {
  id: string;
  studentId: string;
  reason: string;
  timestamp: string;
  routedTo: string;
  status: "sent" | "acknowledged" | "resolved";
}

export interface DepartmentRoute {
  id: string;
  department: string;
  hodName: string;
  hodEmail: string;
  subject: string;
}

export interface AdminStat {
  label: string;
  value: number;
  delta?: number;
  icon: string;
}
