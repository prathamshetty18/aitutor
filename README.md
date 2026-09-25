# AI Tutor MVP — Local‑First Student Brain & Distress Detection

> **Hackathon Demo Vertical Slice**: A privacy‑first AI Tutor that fuses continuous student emotional signals (voice journals) with academic insights. Features local STT (`faster‑whisper`), on‑device vector search (`sqlite‑vec`), Groq‑powered weekly rewind cards (`Llama 3.3`), and an institutional early‑warning distress alert system that notifies counselors/HOD without ever exposing raw journal text.

---

## 🚀 Quick‑Start (3‑Command Setup)

### 1️⃣ Install Dependencies:
```bash
# Backend (Python 3.12)
cd backend && .\.venv\Scripts\pip install -r requirements.txt

# Frontend (Node.js)
cd ../frontend && npm install
```

### 2️⃣ Configure Environment
```bash
# Backend environment (optional for live Groq API)
cp .env.example backend/.env

# Frontend Supabase variables (placeholder values – replace with real credentials if you have a Supabase project)
cat <<EOF > frontend/.env.local
NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
EOF
```
> **Note** – The backend also expects Supabase variables (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`) which are already present in `backend/.env`. Replace the placeholder values there as well when you have a real project.

### 3️⃣ Install Supabase SSR client (required by the updated code)
```bash
cd frontend && npm install @supabase/ssr
```

### 4️⃣ Launch Services
```bash
# Terminal 1 – Backend
cd backend && .\.venv\Scripts\python -m uvicorn main:app --reload --port 8000

# Terminal 2 – Frontend
cd ../frontend && npm run dev
```
- Backend UI: **http://127.0.0.1:8000**
- Frontend UI: **http://localhost:3000** (if port 3000 is busy, Next.js will automatically fall back to the next free port and log the URL).

---

## 🎯 Demo Flow (1‑Minute Hackathon Pitch)
1. **Voice Journal** – Upload a `.wav` file, transcribed locally with `faster‑whisper`.
2. **Weekly Rewind** – Generates a Framer‑Motion card with AI‑crafted insights.
3. **Distress Alert** – Simulates a declining sentiment trajectory, triggers a privacy‑preserving alert to `HOD_EMAIL`.
4. **Curated Resources** – Dynamically links to YouTube tutorials based on weak topics.

---

## 🔒 Privacy & Architecture Guarantees
| Zone | Components | Data Policy |
|------|------------|-------------|
| **Offline / Local** | Audio files, raw transcripts, MiniLM embeddings, `JournalEntry`, `sqlite‑vec` | **Never leaves device / local DB** |
| **Escalation / Sync** | Daily aggregates, `WeeklyRewindCard`, `DistressAlert` | **Only aggregated numerical signals cross the boundary** |

---

## ⚙️ Hardening & Safety Configs
- **Audio Safety** – Only `.wav` is accepted (`ACCEPTED_AUDIO_FORMATS="wav"`). Enabling other formats requires `ffmpeg` on `PATH`.
- **sqlite‑vec Fallback** – If the extension cannot be loaded, the app falls back to JSON‑serialized vectors (`EmbeddingVectorFallback`). Override with `USE_SQLITE_VEC=false`.
- **Groq Fallback** – Missing API key or offline mode triggers graceful fallback to static JSON responses (`backend/fallback_responses.json`).
- **Foreign Key Integrity** – `PRAGMA foreign_keys = ON;` is enforced on every SQLite connection.
- **Startup Seeding** – Default student (`student_alex`) and resource mappings are inserted automatically.

---

## 🛠️ Tech Stack
- **Frontend**: Next.js (App Router), TailwindCSS, Framer Motion, Lucide Icons, Canvas‑Confetti
- **Backend**: FastAPI, Uvicorn, Pydantic Settings
- **STT**: `faster‑whisper` (local CPU, int8 quantization)
- **Vector DB**: SQLite + `sqlite‑vec` (`vec0` virtual table)
- **Embeddings**: `sentence‑transformers` (`all‑MiniLM‑L6‑v2`)
- **LLM**: Groq API (`Llama 3.3 70B Versatile`)

---

## 📦 Running Tests
```bash
# Backend tests (if any)
cd backend && pytest

# Frontend lint / type‑check
cd ../frontend && npm run lint && npm run type-check
```

Enjoy building and experimenting with the AI Tutor!
