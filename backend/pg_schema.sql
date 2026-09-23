-- ============================================================================
-- HS-210 Harmony — Local PostgreSQL Schema
-- Run automatically by database.py on startup (idempotent, IF NOT EXISTS).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Core auth + identity
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,               -- Google sub (stable UUID)
    google_id       TEXT UNIQUE NOT NULL,
    email           TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'student',
    college_id      TEXT,
    avatar_url      TEXT,
    department      TEXT DEFAULT 'Computer Science & Engineering',
    onboarding_completed BOOLEAN NOT NULL DEFAULT false,
    swot            JSONB DEFAULT '{}'::jsonb,
    goals           TEXT DEFAULT '',
    goal_tags       TEXT[] DEFAULT ARRAY[]::text[],
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS students (
    student_id  TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL,
    college_id  TEXT,
    department  TEXT,
    semester    INTEGER DEFAULT 4,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Journal & Emotion
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS journal_entries (
    entry_id    SERIAL PRIMARY KEY,
    student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK (type IN ('voice','text','photo')),
    raw_transcript_or_ocr_text TEXT NOT NULL,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emotion_tags (
    entry_id        INTEGER PRIMARY KEY REFERENCES journal_entries(entry_id) ON DELETE CASCADE,
    sentiment_score REAL NOT NULL,
    emotion_label   TEXT NOT NULL,
    model_used      TEXT NOT NULL,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS embedding_vectors (
    entry_id    INTEGER PRIMARY KEY REFERENCES journal_entries(entry_id) ON DELETE CASCADE,
    vector_json JSONB
);

-- ---------------------------------------------------------------------------
-- Distress & Rewind
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mini_json (
    student_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date            DATE NOT NULL,
    summary_stats   JSONB NOT NULL,
    PRIMARY KEY (student_id, date)
);

CREATE TABLE IF NOT EXISTS weekly_rewind_cards (
    card_id           SERIAL PRIMARY KEY,
    student_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_range        TEXT NOT NULL,
    generated_content JSONB NOT NULL,
    visual_config     JSONB NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS distress_alerts (
    alert_id        SERIAL PRIMARY KEY,
    student_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trigger_reason  TEXT NOT NULL,
    pattern_window  INTEGER NOT NULL,
    sent_to         TEXT NOT NULL,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Learning Plan (Roadmap + DailyGoal)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roadmaps (
    roadmap_id   TEXT PRIMARY KEY DEFAULT 'rmp_' || gen_random_uuid()::text,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    source       TEXT NOT NULL DEFAULT 'custom',
    total_topics INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_goals (
    goal_id         TEXT PRIMARY KEY DEFAULT 'goal_' || gen_random_uuid()::text,
    roadmap_id      TEXT REFERENCES roadmaps(roadmap_id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_date     DATE NOT NULL,
    topics          JSONB NOT NULL,
    problems_count  INTEGER NOT NULL DEFAULT 3,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','completed','partial','missed','rescheduled')),
    completed_at    TIMESTAMPTZ,
    rescheduled_to  DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Resources
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resource_mappings (
    topic_tag   TEXT PRIMARY KEY,
    youtube_url TEXT NOT NULL,
    title       TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Performance indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_journal_student_ts  ON journal_entries(student_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_daily_goals_user    ON daily_goals(user_id, target_date);
CREATE INDEX IF NOT EXISTS idx_daily_goals_roadmap ON daily_goals(roadmap_id);

-- ---------------------------------------------------------------------------
-- Backwards-compatible aliases
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "JournalEntry" AS SELECT * FROM journal_entries;
CREATE OR REPLACE VIEW journalentry AS SELECT * FROM journal_entries;
CREATE OR REPLACE VIEW "EmotionTag" AS SELECT * FROM emotion_tags;
CREATE OR REPLACE VIEW emotiontag AS SELECT * FROM emotion_tags;
CREATE OR REPLACE VIEW "EmbeddingVector" AS SELECT * FROM embedding_vectors;
CREATE OR REPLACE VIEW embeddingvector AS SELECT * FROM embedding_vectors;
CREATE OR REPLACE VIEW "MiniJSON" AS SELECT * FROM mini_json;
CREATE OR REPLACE VIEW minijson AS SELECT * FROM mini_json;
CREATE OR REPLACE VIEW "WeeklyRewindCard" AS SELECT * FROM weekly_rewind_cards;
CREATE OR REPLACE VIEW weeklyrewindcard AS SELECT * FROM weekly_rewind_cards;
CREATE OR REPLACE VIEW "DistressAlert" AS SELECT * FROM distress_alerts;
CREATE OR REPLACE VIEW distressalert AS SELECT * FROM distress_alerts;
CREATE OR REPLACE VIEW "ResourceMapping" AS SELECT * FROM resource_mappings;
CREATE OR REPLACE VIEW resourcemapping AS SELECT * FROM resource_mappings;
CREATE OR REPLACE VIEW "Roadmap" AS SELECT * FROM roadmaps;
CREATE OR REPLACE VIEW roadmap AS SELECT * FROM roadmaps;
CREATE OR REPLACE VIEW "DailyGoal" AS SELECT * FROM daily_goals;
CREATE OR REPLACE VIEW dailygoal AS SELECT * FROM daily_goals;
CREATE OR REPLACE VIEW "User" AS SELECT * FROM users;
CREATE OR REPLACE VIEW "Student" AS SELECT * FROM students;

