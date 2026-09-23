// ──────────────────────────────────────────────
// Constants: routes, colors, misc
// ──────────────────────────────────────────────

export const ROUTES = {
  landing: "/",
  onboarding: "/onboarding",
  dashboard: "/dashboard",
  journal: "/dashboard/journal",
  chat: "/dashboard/chat",
  academics: "/dashboard/academics",
  profile: "/dashboard/profile",
  rewind: "/dashboard/rewind",
  teacher: "/teacher",
  teacherStudents: "/teacher/students",
  teacherMarks: "/teacher/marks",
  teacherAttendance: "/teacher/attendance",
  teacherExtracurriculars: "/teacher/extracurriculars",
  admin: "/admin",
  adminUsers: "/admin/users",
  adminAlerts: "/admin/alerts",
  adminRouting: "/admin/routing",
  adminAnalytics: "/admin/analytics",
  hodInbox: "/admin/hod-inbox",
} as const;

export const STUDENT_TABS = [
  { id: "home", label: "Home", href: ROUTES.dashboard },
  { id: "journal", label: "Journal", href: ROUTES.journal },
  { id: "chat", label: "AI Chat", href: ROUTES.chat },
  { id: "academics", label: "Academics", href: ROUTES.academics },
  { id: "profile", label: "Profile", href: ROUTES.profile },
] as const;

export const TEACHER_TABS = [
  { id: "home", label: "Home", href: ROUTES.teacher },
  { id: "students", label: "My Students", href: ROUTES.teacherStudents },
  { id: "marks", label: "Add Marks", href: ROUTES.teacherMarks },
  { id: "attendance", label: "Attendance", href: ROUTES.teacherAttendance },
  { id: "extracurriculars", label: "Extracurriculars", href: ROUTES.teacherExtracurriculars },
] as const;

export const ADMIN_TABS = [
  { id: "home", label: "Home", href: ROUTES.admin },
  { id: "users", label: "Users", href: ROUTES.adminUsers },
  { id: "alerts", label: "Alert Log", href: ROUTES.adminAlerts },
  { id: "routing", label: "Dept Routing", href: ROUTES.adminRouting },
  { id: "analytics", label: "Analytics", href: ROUTES.adminAnalytics },
] as const;

// Emotion → color mapping
export const EMOTION_COLORS: Record<string, { bg: string; text: string }> = {
  joyful: { bg: "#FEF3C7", text: "#B45309" },
  confident: { bg: "#D1FAE5", text: "#065F46" },
  calm: { bg: "#DBEAFE", text: "#1E40AF" },
  curious: { bg: "#E0E7FF", text: "#3730A3" },
  anxious: { bg: "#FEF3C7", text: "#B45309" },
  pensive: { bg: "#F3E8FF", text: "#6B21A8" },
  frustrated: { bg: "#FFE4E6", text: "#9F1239" },
  overwhelmed: { bg: "#FFE4E6", text: "#9F1239" },
  exhausted: { bg: "#FEE2E2", text: "#991B1B" },
};

export const REWIND_GRADIENTS = [
  "from-amber-400 via-orange-500 to-rose-500",
  "from-teal-400 via-cyan-500 to-blue-500",
  "from-violet-500 via-purple-500 to-fuchsia-500",
  "from-emerald-400 via-teal-500 to-cyan-600",
] as const;

export const GOAL_TAG_OPTIONS = [
  "Get Internship",
  "Improve GPA",
  "Learn Python",
  "Learn Web Dev",
  "Research Paper",
  "Public Speaking",
  "Competitive Programming",
  "Build Portfolio",
] as const;
