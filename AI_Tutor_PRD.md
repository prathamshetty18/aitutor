# AI Tutor (HS-210 Harmony) — Product Requirements Document (PRD)

## 1. PROJECT OBJECTIVES & OUTCOMES

**High-level goal:** Build a zero-knowledge, privacy-first AI Tutor that constructs a personalized "knowledge brain" per student by fusing academic performance data with continuous daily emotional signals (voice, text, and diary image journals). It surfaces insights through two distinct channels:
1. **Student-Facing Reflection & Growth:** Interactive, animated weekly "Rewind" reports (Spotify-Wrapped style), daily adaptive goal roadmaps, and curated YouTube learning resources.
2. **Institutional Early-Warning Distress Alerting:** A proactive distress detection system that alerts counselors and Head of Department (HOD) without ever exposing the student's private journal text.

**Core Technical & Architectural Pillars:**
- **Hybrid Local-First + Cloud Architecture:**
  - **Local Engine (SQLite 3 + sqlite-vec):** Powers the on-device/backend core (`ai_tutor.db`) with local vector similarity search (`sqlite-vec`), fast emotion scoring, daily `MiniJSON` rollups, and offline-capable demo resilience with zero cloud network latency.
  - **Cloud Vault (Supabase Postgres + RLS):** Manages Google OAuth 2.0 sessions, student profile & SWOT persistence, and client-side zero-knowledge encrypted backups across devices.
- **Zero-Knowledge Encryption Architecture:** Sensitive student reflections (journal transcripts, diary content, companion memory notes) are encrypted client-side using AES-256-CBC with PBKDF2-derived keys before cloud sync. Supabase stores only ciphertext; even database administrators cannot read private student journals.
- **Local-First ML Pipeline:** Private STT using `faster-whisper` and 384-dimensional dense semantic embeddings using `all-MiniLM-L6-v2` running in-memory on the backend, eliminating external cloud STT privacy leaks and reducing API costs.
- **High-Speed Cloud LLM Reasoning:** High-throughput inference via **Groq (`qwen/qwen3.8-27b`)** for Weekly Rewind synthesis, AI companion conversations, and adaptive curriculum goal seeding.
- **Multi-Modal Onboarding & Self-Discovery:** A comprehensive onboarding flow capturing student Strengths, Weaknesses, Opportunities, and Threats (**SWOT Analysis**), marksheet OCR intake, and automated curriculum goal generation.
- **Emotion-Academic Correlation Engine (Differentiator):** Cross-correlates student emotional valence against academic deadlines, exams, and attendance to prove this is not a generic "ChatGPT wrapper".
- **Dual-Layer Early-Warning Distress Safety Net:**
  - *Slow Drift*: Per-student baseline drift detection tracking multi-day rolling emotional trajectories.
  - *Crisis Keyword Bypass*: Instant heuristic bypass layer detecting acute crisis indicators immediately without waiting for weekly batch evaluations.

**Success Criteria for Demo:**
- Live voice journal entry → transcribed in-memory via `faster-whisper` → emotion-tagged → stored in local SQLite (`ai_tutor.db`) with vector index (`sqlite-vec`) → encrypted client-side → synced to Supabase Postgres.
- Multi-step onboarding with SWOT analysis and marksheet analysis persisting directly into Supabase and local SQLite.
- Seeded multi-day history → generates an animated Weekly Rewind card via Groq (`qwen/qwen3.8-27b`) and Framer Motion.
- Distress detection simulation → automatically dispatches early-warning alerts to HOD/counselor with sanitized reason strings.
- Academic doubt solving and emotional check-in via AI Tutor chat with Groq (`qwen/qwen3.8-27b`).

---

## 2. TARGET USERS & ACCESS CONTROL (RLS)

Strict role-based access control enforced at the database layer via **Supabase Row-Level Security (RLS)**:

### 1. Student (Primary User)
- Authenticated via Google OAuth 2.0 (OIDC) mapped to college-issued email (`@nmamit.in`).
- Owns: Voice/text/image journals, SWOT analysis, personal goals, AI chat history, weekly rewind cards, and personalized recommendations.
- **Privacy Guarantee:** Journal transcripts, diary OCR text, and AI companion memories are encrypted with AES-256 before leaving the client. Neither teachers, admins, nor counselors can decrypt or view them.

### 2. Teacher / Faculty
- Authenticated via Google OAuth (domain-restricted to `@nitte.edu.in`).
- Capabilities: Add/update student subject-wise marks, log attendance, and record extracurricular participation.
- **Data Boundary:** Strictly forbidden from accessing student journals, chat history, emotional scores, or SWOT analyses. Enforced via Supabase RLS and FastAPI auth policies.

### 3. Administrator / Counselor
- Authenticated via Google OAuth (administrative role flag).
- Capabilities:
  - User management (student and faculty verification, UID mapping).
  - Institutional distress alert oversight (student ID, timestamp, and generic trigger reason string only).
  - Department routing configuration (mapping courses and departments to HOD/counselor email endpoints).
  - Aggregate institutional wellbeing metrics (total journals logged, alert counts, resource interactions).
- **Data Boundary:** Zero access to raw journal text or personal diary uploads.

---

## 3. KEY FEATURES (MVP BOUNDARY)

### Must-Haves (Production & Live Demo)

1. **Google OAuth 2.0 & Session Security:**
   - Supabase SSR OAuth with Google OIDC authorization code flow.
   - Dual session support with HttpOnly anti-CSRF JWT cookie bridge for backend FastAPI endpoints.
   - Domain restriction: `@nmamit.in` (students) and `@nitte.edu.in` (faculty/staff).

2. **Onboarding & SWOT Discovery Flow:**
   - 4-step guided onboarding wizard:
     - **Step 1 — SWOT Analysis:** Captures qualitative self-reflection across Strengths, Weaknesses, Opportunities, and Threats with auto-saving.
     - **Step 2 — Marksheet Intake:** Upload PDF/image marksheet with local OCR (Tesseract / Pillow) extracting subject scores.
     - **Step 3 — Goal & Curriculum Planner:** Adaptive goal selection with AI-assisted curriculum seeding via Groq (`qwen/qwen3.8-27b`).
     - **Step 4 — Confirmation & Dashboard Handoff:** Final validation and profile compilation.

3. **Multi-Modal Journaling Pipeline:**
   - **Voice Journaling:** Real-time audio recording → in-memory transcription via `faster-whisper` (base model) → emotion tagging → 384-dimensional dense embedding generation (`all-MiniLM-L6-v2`) → stored locally in SQLite (`ai_tutor.db`) with `sqlite-vec` → client-side AES-256 encryption → synced to Supabase `JournalEntry`.
   - **Text Journaling:** Typed reflection with identical emotion classification, local SQLite logging, and zero-knowledge cloud sync.
   - **Photo / Diary Journaling:** Image upload with OCR text extraction feeding into the local pipeline and zero-knowledge vault.

4. **Zero-Knowledge Encryption Engine (`SecureVault`):**
   - Client-side encryption using AES-256-CBC with PBKDF2 (100,000 iterations, SHA-256).
   - Master key derived from student's Google OIDC `sub` claim and per-user salt (`User.key_salt`).
   - Ciphertext stored in format `<salt>$<iv>$<ciphertext>` in Supabase Postgres.

5. **AI Tutor Companion Chat:**
   - Contextual chat interface powered by **Groq (`qwen/qwen3.8-27b`)**.
   - Dual-purpose conversational scope: academic problem breakdown and warm, empathetic check-in.
   - Context injection incorporates recent emotion trends and student profile without exceeding token limits or exposing sensitive history.

6. **Animated Weekly Rewind (Spotify Wrapped Style):**
   - Batches 7 days of daily `MiniJSON` aggregated emotional metadata.
   - Synthesizes weekly narrative, title, mood trend, and recommended study focus via Groq (`qwen/qwen3.8-27b`).
   - Rendered using interactive Framer Motion animations with dynamic color palettes based on emotional valence.

7. **Dual-Layer Distress Detection & Escalation:**
   - **Baseline Drift Detection:** Tracks multi-day rolling emotional valence (z-score evaluation against the student's personal baseline).
   - **Crisis Keyword Bypass:** Instant embedding similarity and keyword bypass triggering immediate alerts for acute distress.
   - Dispatches sanitized email/log alerts to HOD/counselors with non-invasive summary reasons (e.g., *"Persistent negative valence cluster observed over 7-day evaluation window"*).

8. **Emotion-Academic Correlation Engine:**
   - Evaluates academic timeline (exam schedules, assignment deadlines, attendance drops) against emotional trajectory.
   - Recommends targeted study resources based on combined emotional stress + subject struggle.

9. **Curated YouTube Learning Resources:**
   - High-yield, topic-tagged video mappings for engineering subjects (OS Concurrency, Dynamic Programming, Data Structures, Computer Networks).

---

## 4. DATA SCHEMA & DUAL-TIER ARCHITECTURE

The system implements a **Dual-Tier Data Architecture**:
1. **Local Edge Tier (SQLite 3 + sqlite-vec):** Resides on the backend server (`ai_tutor.db`) for zero-latency local operations, on-device vector search, local distress scoring, and offline reliability.
2. **Cloud Sync & Identity Tier (Supabase PostgreSQL + RLS):** Provides cross-device authentication, multi-role isolation, and client-side zero-knowledge encrypted backups.

### A. Local Edge Tier (`ai_tutor.db` via SQLite 3 + sqlite-vec)
- **`User`**: Local cache of student/staff identity (`id`, `google_id`, `email`, `role`, `college_id`, `onboarding_completed`, `swot`, `goals`, `goal_tags`).
- **`Student`**: Academic student record (`student_id`, `name`, `email`, `college_id`).
- **`JournalEntry`**: High-performance local storage for raw speech transcripts and OCR text.
- **`EmotionTag`**: Valence score (-1.0 to 1.0), emotion labels (`Calm`, `Overwhelmed`, `Anxious`, etc.), model tag, and timestamps.
- **`EmbeddingVector`**: 384-dimensional dense semantic vector indexed locally using `sqlite-vec` (`vec0` virtual table with fallback vector JSON).
- **`MiniJSON`**: Daily aggregated emotional statistics rolling up journal entries for weekly synthesis.
- **`WeeklyRewindCard`**: Synthesized Spotify-Wrapped style weekly reflection cards generated via Groq (`qwen/qwen3.8-27b`).
- **`DistressAlert`**: Anonymized distress trigger records with recipient HOD email and delivery timestamps.
- **`ResourceMapping`**: Local topic-to-YouTube video mapping.

### B. Cloud Zero-Knowledge Tier (Supabase PostgreSQL with RLS)
- **Identity & Roles**: `User` (with `key_salt`, `swot`, `goals`), `Student`, `AcademicRecord`, `Attendance`, `Extracurricular`, `DepartmentRouting`.
- **Zero-Knowledge Encrypted Vault**: `JournalEntry` (storing AES-256 ciphertext `<salt>$<iv>$<ct>`), `EmbeddingVector`, `MiniJSON`, `WeeklyRewindCard`, `DistressAlert`.
- **TUFY & Hermes Adaptive Learning**: `Roadmap`, `DailyGoal` (encrypted notes), `GoalEvent`, `HermesMemoryNode` (encrypted memory), `SkillCapsule`, `UserScheduleConstraint`, `NotificationPayload`.

---

## 5. TECHNOLOGY STACK

| Layer | Technology | Rationale & Architecture |
|---|---|---|
| **Frontend Framework** | **Next.js 16 (App Router) + React 19** | Fast SSR/CSR rendering, Turbopack builds, modular route handlers (`/auth/callback`), and robust server actions. |
| **Styling & Motion** | **Tailwind CSS + Framer Motion** | Polished, responsive UI with smooth transitions and animated "Spotify Wrapped" rewind cards. |
| **Backend API** | **FastAPI (Python 3.12)** | Asynchronous API layer natively integrating with machine learning, tensor models, and audio processing. |
| **Local Database (Edge / Offline)** | **SQLite 3 + `sqlite-vec`** | Local single-file database (`ai_tutor.db`) handling on-device structured storage and 384-dim vector similarity search with zero network latency. |
| **Cloud Database (Sync & Auth)** | **Supabase (PostgreSQL with RLS)** | Enterprise-grade cloud relational database with native Row-Level Security, JSONB support, and instant cross-device sync. |
| **Data Encryption** | **Zero-Knowledge AES-256-CBC (`crypto-js`)** | Client-side encryption with PBKDF2 key derivation. Sensitive journals and notes remain ciphertext at rest in Supabase. |
| **LLM Inference** | **Groq (`qwen/qwen3.8-27b`)** | Sub-second ultra-fast inference for Weekly Rewind synthesis, AI companion conversations, and structured JSON curriculum planning. |
| **Speech-to-Text (STT)** | **`faster-whisper` (CTranslate2 base model)** | Local, private on-device audio transcription on the backend. Zero cloud audio egress, low latency, and zero transcription cost. |
| **Embeddings** | **`sentence-transformers` (`all-MiniLM-L6-v2`)** | 384-dimensional dense vector embeddings generated in-memory for semantic similarity and crisis bypass detection. |
| **Authentication** | **Google OAuth 2.0 (OIDC)** | Strict institutional domain validation (`@nmamit.in` / `@nitte.edu.in`) with cryptographic JWT token verification. |
| **Package Managers** | **Bun (Frontend) & UV (Backend)** | Lightning-fast dependency management and deterministic execution across environments. |

---

## 6. DATA PRIVACY & BOUNDARY PRINCIPLES

1. **Client-Side Encryption First:** Raw journal transcripts and personal notes are converted to AES-256 ciphertext before being transmitted across the network to Supabase.
2. **Server In-Memory Processing:** When audio or images are uploaded to the FastAPI backend for STT or OCR, text is processed strictly in volatile RAM to extract emotion and sentiment, then returned immediately to the client for encryption.
3. **Hard Institutional Role Boundaries:** Teachers and administrators can only query academic records and sanitized alert logs. Supabase RLS policies reject any request by non-student roles to read journal tables.
4. **Sanitized Alert Content:** Distress alerts sent to counselors and HODs contain exclusively statistical summaries and generic reasons (e.g. *"7-day rolling sentiment below threshold"*), never revealing journal text or confidential reflections.
