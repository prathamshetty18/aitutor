// ──────────────────────────────────────────────
// Mock data for all views
// ──────────────────────────────────────────────
import type {
  User,
  JournalEntry,
  ChatMessage,
  SubjectMarks,
  AttendanceRecord,
  StudyMaterial,
  DailyGoal,
  RewindSlide,
  StudentRecord,
  ExtracurricularEntry,
  AlertLogEntry,
  DepartmentRoute,
  AdminStat,
  SwotData,
} from "./types";

// ── Current user ─────────────────────────────
export const MOCK_USER: User = {
  id: "student_alex",
  name: "Alex Rivers",
  email: "alex.rivers@university.edu",
  role: "student",
  collegeId: "COL-2026-8942",
  department: "Computer Science",
};

export const MOCK_TEACHER: User = {
  id: "teacher_smith",
  name: "Dr. Sarah Smith",
  email: "sarah.smith@university.edu",
  role: "teacher",
  collegeId: "FAC-2024-1201",
  department: "Computer Science",
};

export const MOCK_ADMIN: User = {
  id: "admin_jones",
  name: "Prof. Michael Jones",
  email: "m.jones@university.edu",
  role: "admin",
  collegeId: "ADM-2020-0001",
  department: "Administration",
};

// ── Onboarding SWOT ──────────────────────────
export const MOCK_SWOT: SwotData = {
  strengths: "Good at problem solving and logical thinking. Strong in mathematics and programming fundamentals.",
  weaknesses: "Struggle with time management and procrastination. Public speaking makes me anxious.",
  opportunities: "Upcoming hackathon season, open-source contributions, summer internship applications.",
  threats: "Heavy course load this semester, competitive job market, tendency to burn out.",
};

export const MOCK_GOAL_TEXT =
  "I want to secure a solid internship at a top tech company by the end of this semester, improve my GPA to 3.8+, and build a strong portfolio of personal projects.";

export const MOCK_SELECTED_TAGS = ["Get Internship", "Improve GPA", "Learn Web Dev", "Build Portfolio"];

// ── Journal entries ──────────────────────────
export const MOCK_JOURNAL_ENTRIES: JournalEntry[] = [
  {
    id: "j1",
    timestamp: "2026-09-22T14:30:00",
    transcript: "Today's calculus lecture was actually really interesting. I finally understood integration by parts after struggling with it for weeks.",
    emotionLabel: "confident",
    sentimentScore: 0.72,
    mode: "voice",
  },
  {
    id: "j2",
    timestamp: "2026-09-21T20:15:00",
    transcript: "Group project meeting was frustrating. Nobody had done their part and we're presenting next week.",
    emotionLabel: "frustrated",
    sentimentScore: -0.45,
    mode: "voice",
    hasMismatch: true,
  },
  {
    id: "j3",
    timestamp: "2026-09-20T09:00:00",
    transcript: "Morning meditation really helped. Feeling centered and ready for the day. Have a big data structures exam coming up but I feel prepared.",
    emotionLabel: "calm",
    sentimentScore: 0.55,
    mode: "voice",
  },
  {
    id: "j4",
    timestamp: "2026-09-19T22:45:00",
    transcript: "Stayed up way too late debugging that linked list problem. Exhausted but I finally got all test cases passing.",
    emotionLabel: "exhausted",
    sentimentScore: -0.12,
    mode: "photo",
  },
  {
    id: "j5",
    timestamp: "2026-09-18T16:00:00",
    transcript: "Had a great conversation with Prof. Smith about research opportunities. She mentioned a machine learning project I could join next semester!",
    emotionLabel: "joyful",
    sentimentScore: 0.88,
    mode: "voice",
  },
];

// ── Chat messages ────────────────────────────
export const MOCK_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: "c1",
    role: "user",
    content: "I'm struggling with dynamic programming. Any tips?",
    timestamp: "2026-09-22T15:00:00",
  },
  {
    id: "c2",
    role: "assistant",
    content: "Dynamic programming can feel overwhelming at first! Here's my approach:\n\n1. **Start with recursion** — solve the problem recursively first\n2. **Identify overlapping subproblems** — draw the recursion tree\n3. **Memoize** — add a cache to avoid recomputation\n4. **Bottom-up** — convert to iterative tabulation\n\nWould you like to work through a specific problem together? I noticed from your marks that algorithms is one of your stronger subjects — you have the foundation!",
    timestamp: "2026-09-22T15:00:05",
  },
  {
    id: "c3",
    role: "user",
    content: "Can you help with the Longest Common Subsequence problem?",
    timestamp: "2026-09-22T15:01:00",
  },
  {
    id: "c4",
    role: "assistant",
    content: "Of course! LCS is a classic DP problem. Let's break it down:\n\n**Problem:** Given two strings, find the length of their longest common subsequence.\n\n**Step 1 — Recursive thinking:**\nCompare characters from the end. If they match, that's part of LCS. If not, try skipping one from each string.\n\n```\nif s1[i] == s2[j]:\n  return 1 + lcs(i-1, j-1)\nelse:\n  return max(lcs(i-1, j), lcs(i, j-1))\n```\n\nShall I walk through the tabulation step next?",
    timestamp: "2026-09-22T15:01:10",
  },
];

// ── Academics ────────────────────────────────
export const MOCK_MARKS: SubjectMarks[] = [
  { subject: "Mathematics", mse1: 42, mse2: 46, college: 84, maxMarks: 50 },
  { subject: "Physics", mse1: 36, mse2: 40, college: 76, maxMarks: 50 },
  { subject: "Computer Science", mse1: 47, mse2: 48, college: 94, maxMarks: 50 },
  { subject: "Data Structures", mse1: 41, mse2: 45, college: 88, maxMarks: 50 },
  { subject: "Calculus II", mse1: 29, mse2: 34, college: 68, maxMarks: 50 },
  { subject: "Digital Electronics", mse1: 38, mse2: 42, college: 80, maxMarks: 50 },
  { subject: "English", mse1: 40, mse2: 43, college: 85, maxMarks: 50 },
];

export const MOCK_ATTENDANCE: AttendanceRecord[] = [
  { subject: "Data Structures", percentage: 92, totalClasses: 48, attended: 44 },
  { subject: "Calculus II", percentage: 68, totalClasses: 44, attended: 30 },
  { subject: "Computer Networks", percentage: 85, totalClasses: 40, attended: 34 },
  { subject: "Digital Electronics", percentage: 78, totalClasses: 36, attended: 28 },
  { subject: "English Communication", percentage: 95, totalClasses: 20, attended: 19 },
  { subject: "Physics Lab", percentage: 100, totalClasses: 12, attended: 12 },
];

export const MOCK_STUDY_MATERIALS: StudyMaterial[] = [
  {
    id: "sm1",
    subject: "Calculus II",
    title: "Integration by Parts — Full Lecture",
    youtubeUrl: "https://youtube.com/watch?v=example1",
    thumbnailUrl: "https://img.youtube.com/vi/7gigNsz4Oe8/maxresdefault.jpg",
    isWeakSubject: true,
  },
  {
    id: "sm2",
    subject: "Calculus II",
    title: "Differential Equations Made Easy",
    youtubeUrl: "https://youtube.com/watch?v=example2",
    thumbnailUrl: "https://img.youtube.com/vi/p_di4Zn4wz4/maxresdefault.jpg",
    isWeakSubject: true,
  },
  {
    id: "sm3",
    subject: "Data Structures",
    title: "Dynamic Programming for Beginners",
    youtubeUrl: "https://youtube.com/watch?v=example3",
    thumbnailUrl: "https://img.youtube.com/vi/oBt53YbR9Kk/maxresdefault.jpg",
  },
  {
    id: "sm4",
    subject: "Digital Electronics",
    title: "Boolean Algebra & Logic Gates",
    youtubeUrl: "https://youtube.com/watch?v=example4",
    thumbnailUrl: "https://img.youtube.com/vi/gI-qXk7XojA/maxresdefault.jpg",
    isWeakSubject: true,
  },
  {
    id: "sm5",
    subject: "Computer Networks",
    title: "TCP/IP Protocol Suite Explained",
    youtubeUrl: "https://youtube.com/watch?v=example5",
    thumbnailUrl: "https://img.youtube.com/vi/VwN91x5i25g/maxresdefault.jpg",
  },
  {
    id: "sm6",
    subject: "Data Structures",
    title: "Graph Algorithms — BFS & DFS",
    youtubeUrl: "https://youtube.com/watch?v=example6",
    thumbnailUrl: "https://img.youtube.com/vi/tWVWeAqZ0WU/maxresdefault.jpg",
  },
];

// ── Daily goals ──────────────────────────────
export const MOCK_DAILY_GOALS: DailyGoal[] = [
  { id: "g1", label: "Journal today", progress: 100, completed: true },
  { id: "g2", label: "Study 30 min Calculus", progress: 60, completed: false },
  { id: "g3", label: "Review Data Structures notes", progress: 0, completed: false },
  { id: "g4", label: "Complete Physics Lab report", progress: 40, completed: false },
  { id: "g5", label: "Practice 2 LeetCode problems", progress: 50, completed: false },
];

// ── Weekly Rewind slides ─────────────────────
export const MOCK_REWIND_SLIDES: RewindSlide[] = [
  {
    id: "r1",
    headline: "You journaled",
    value: "5/7",
    subtext: "days this week — your best streak yet! 🔥",
    gradient: "from-amber-400 via-orange-500 to-rose-500",
    icon: "📝",
  },
  {
    id: "r2",
    headline: "Your most positive day was",
    value: "Tuesday",
    subtext: "You felt confident after acing the DSA quiz",
    gradient: "from-teal-400 via-cyan-500 to-blue-500",
    icon: "☀️",
  },
  {
    id: "r3",
    headline: "Subject needing attention",
    value: "Calculus II",
    subtext: "Your attendance dropped to 68% — let's turn it around",
    gradient: "from-violet-500 via-purple-500 to-fuchsia-500",
    icon: "📊",
  },
  {
    id: "r4",
    headline: "Overall mood score",
    value: "+0.34",
    subtext: "Above average! Keep up the great work this semester 🎉",
    gradient: "from-emerald-400 via-teal-500 to-cyan-600",
    icon: "✨",
  },
];

// ── Teacher: Student roster ──────────────────
export const MOCK_STUDENT_ROSTER: StudentRecord[] = [
  { id: "s1", name: "Alex Rivers", email: "alex.rivers@uni.edu", department: "Computer Science", semester: 4, gpa: 3.62 },
  { id: "s2", name: "Priya Sharma", email: "priya.s@uni.edu", department: "Computer Science", semester: 4, gpa: 3.85 },
  { id: "s3", name: "Jordan Lee", email: "j.lee@uni.edu", department: "Computer Science", semester: 4, gpa: 3.21 },
  { id: "s4", name: "Maria Garcia", email: "m.garcia@uni.edu", department: "Computer Science", semester: 4, gpa: 3.94 },
  { id: "s5", name: "Ahmed Hassan", email: "a.hassan@uni.edu", department: "Computer Science", semester: 4, gpa: 3.45 },
  { id: "s6", name: "Emily Chen", email: "e.chen@uni.edu", department: "Computer Science", semester: 4, gpa: 3.77 },
  { id: "s7", name: "David Kim", email: "d.kim@uni.edu", department: "Computer Science", semester: 4, gpa: 2.98 },
  { id: "s8", name: "Sofia Rodriguez", email: "s.rod@uni.edu", department: "Computer Science", semester: 4, gpa: 3.55 },
];

// ── Teacher: Extracurriculars ────────────────
export const MOCK_EXTRACURRICULARS: ExtracurricularEntry[] = [
  { id: "e1", studentId: "s1", studentName: "Alex Rivers", activity: "Hackathon — HackSpectra 2026", role: "Team Lead", date: "2026-09-15" },
  { id: "e2", studentId: "s2", studentName: "Priya Sharma", activity: "IEEE Paper Presentation", role: "Presenter", date: "2026-09-10" },
  { id: "e3", studentId: "s4", studentName: "Maria Garcia", activity: "Google Summer of Code", role: "Contributor", date: "2026-08-20" },
  { id: "e4", studentId: "s6", studentName: "Emily Chen", activity: "ACM ICPC Regionals", role: "Participant", date: "2026-09-01" },
];

// ── Admin: Alert log ─────────────────────────
export const MOCK_ALERT_LOG: AlertLogEntry[] = [
  { id: "a1", studentId: "STU-4821", reason: "Sustained sentiment decline over 7-day window", timestamp: "2026-09-22T10:30:00", routedTo: "counselor@university.edu", status: "sent" },
  { id: "a2", studentId: "STU-3192", reason: "Attendance drop below 60% threshold", timestamp: "2026-09-21T14:15:00", routedTo: "hod.cs@university.edu", status: "acknowledged" },
  { id: "a3", studentId: "STU-7734", reason: "Sustained sentiment decline over 7-day window", timestamp: "2026-09-20T09:45:00", routedTo: "counselor@university.edu", status: "resolved" },
  { id: "a4", studentId: "STU-2056", reason: "Academic performance significant drop", timestamp: "2026-09-19T16:00:00", routedTo: "hod.math@university.edu", status: "sent" },
  { id: "a5", studentId: "STU-9981", reason: "Sustained sentiment decline over 7-day window", timestamp: "2026-09-18T11:20:00", routedTo: "counselor@university.edu", status: "acknowledged" },
];

// ── Admin: Department routing ────────────────
export const MOCK_DEPT_ROUTING: DepartmentRoute[] = [
  { id: "d1", department: "Computer Science", hodName: "Dr. Rajeev Mehta", hodEmail: "hod.cs@university.edu", subject: "Data Structures & Algorithms" },
  { id: "d2", department: "Mathematics", hodName: "Prof. Linda Zhang", hodEmail: "hod.math@university.edu", subject: "Calculus & Linear Algebra" },
  { id: "d3", department: "Physics", hodName: "Dr. Alan Foster", hodEmail: "hod.physics@university.edu", subject: "Mechanics & Thermodynamics" },
  { id: "d4", department: "English", hodName: "Prof. Grace Okonkwo", hodEmail: "hod.eng@university.edu", subject: "Technical Communication" },
  { id: "d5", department: "Electronics", hodName: "Dr. Kenji Tanaka", hodEmail: "hod.ece@university.edu", subject: "Digital Electronics" },
  { id: "d6", department: "Counseling Center", hodName: "Dr. Maya Williams", hodEmail: "counselor@university.edu", subject: "Student Wellbeing" },
];

// ── Admin: Aggregate stats ───────────────────
export const MOCK_ADMIN_STATS: AdminStat[] = [
  { label: "Active Journaling Students", value: 234, delta: 12, icon: "📝" },
  { label: "Alerts Sent This Month", value: 18, delta: -3, icon: "🚨" },
  { label: "Resource Clicks This Week", value: 1847, delta: 23, icon: "📚" },
  { label: "Avg. Sentiment Score", value: 0.42, delta: 5, icon: "😊" },
];
