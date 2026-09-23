-- AI Tutor MVP SQLite Schema

CREATE TABLE IF NOT EXISTS Student (
    student_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    college_id TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS JournalEntry (
    entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    type TEXT NOT NULL,
    raw_transcript_or_ocr_text TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY(student_id) REFERENCES Student(student_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS EmotionTag (
    entry_id INTEGER NOT NULL,
    sentiment_score REAL NOT NULL,
    emotion_label TEXT NOT NULL,
    model_used TEXT NOT NULL,
    computed_at TEXT NOT NULL,
    FOREIGN KEY(entry_id) REFERENCES JournalEntry(entry_id) ON DELETE CASCADE
);

-- EmbeddingVector table (stored via sqlite-vec vec0 or fallback vector_json)
CREATE TABLE IF NOT EXISTS EmbeddingVector (
    entry_id INTEGER PRIMARY KEY,
    vector_json TEXT,
    FOREIGN KEY(entry_id) REFERENCES JournalEntry(entry_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS MiniJSON (
    student_id TEXT NOT NULL,
    date TEXT NOT NULL,
    summary_stats TEXT NOT NULL,
    PRIMARY KEY(student_id, date),
    FOREIGN KEY(student_id) REFERENCES Student(student_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS WeeklyRewindCard (
    card_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    week_range TEXT NOT NULL,
    generated_content TEXT NOT NULL,
    visual_config TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(student_id) REFERENCES Student(student_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS DistressAlert (
    alert_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    trigger_reason TEXT NOT NULL,
    pattern_window INTEGER NOT NULL,
    sent_to TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    FOREIGN KEY(student_id) REFERENCES Student(student_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ResourceMapping (
    topic_tag TEXT PRIMARY KEY,
    youtube_url TEXT NOT NULL,
    title TEXT NOT NULL
);
