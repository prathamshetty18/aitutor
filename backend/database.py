"""
database.py — Dual PostgreSQL / SQLite datastore layer for HS-210 Harmony.

Supports PostgreSQL when configured and reachable, and seamlessly falls back to
local SQLite (ai_tutor.db) for zero-dependency local development and hackathon execution.
"""

import json
import logging
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

try:
    import psycopg2
    import psycopg2.extras
    from psycopg2.extras import RealDictCursor
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False

from config import settings

logger = logging.getLogger("ai_tutor.database")

IS_SQLITE = False


# ---------------------------------------------------------------------------
# SQLite Compatibility Wrapper
# ---------------------------------------------------------------------------

class SQLiteCursorWrapper:
    def __init__(self, cursor):
        self.cursor = cursor
        self.lastrowid = None

    def execute(self, query: str, params=()):
        sql = query.replace("%s", "?")

        cleaned_params = []
        for p in params:
            if isinstance(p, datetime):
                cleaned_params.append(p.isoformat())
            elif isinstance(p, (dict, list)) and not isinstance(p, (bytes, str)):
                cleaned_params.append(json.dumps(p))
            else:
                cleaned_params.append(p)

        self.cursor.execute(sql, tuple(cleaned_params))
        self.lastrowid = self.cursor.lastrowid
        return self

    def fetchone(self):
        row = self.cursor.fetchone()
        if row is None:
            return None
        return dict(row)

    def fetchall(self):
        rows = self.cursor.fetchall()
        if not rows:
            return []
        return [dict(r) for r in rows]

    @property
    def rowcount(self):
        return self.cursor.rowcount

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass


class SQLiteConnectionWrapper:
    def __init__(self, conn):
        self.conn = conn
        self.conn.row_factory = sqlite3.Row

    def cursor(self):
        return SQLiteCursorWrapper(self.conn.cursor())

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()


# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------

def get_connection():
    """Opens a connection to PostgreSQL if available, otherwise falls back to SQLite."""
    global IS_SQLITE
    db_url = settings.DATABASE_URL.lower()

    if db_url.startswith("sqlite") or not HAS_PSYCOPG2:
        IS_SQLITE = True
        db_file = Path(__file__).resolve().parent / "ai_tutor.db"
        conn = sqlite3.connect(str(db_file))
        return SQLiteConnectionWrapper(conn)

    try:
        conn = psycopg2.connect(settings.DATABASE_URL, cursor_factory=RealDictCursor)
        IS_SQLITE = False
        return conn
    except Exception as err:
        logger.warning(f"PostgreSQL connection failed ({err}). Falling back to SQLite.")
        IS_SQLITE = True
        db_file = Path(__file__).resolve().parent / "ai_tutor.db"
        conn = sqlite3.connect(str(db_file))
        return SQLiteConnectionWrapper(conn)


def init_db() -> None:
    """
    Initializes schema on startup and seeds resources.json.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if IS_SQLITE:
                logger.info("Applying SQLite schema...")
                sqlite_schema = """
                CREATE TABLE IF NOT EXISTS users (
                    id              TEXT PRIMARY KEY,
                    google_id       TEXT UNIQUE NOT NULL,
                    email           TEXT UNIQUE NOT NULL,
                    name            TEXT NOT NULL,
                    role            TEXT NOT NULL DEFAULT 'student',
                    college_id      TEXT,
                    avatar_url      TEXT,
                    department      TEXT DEFAULT 'Computer Science & Engineering',
                    onboarding_completed INTEGER NOT NULL DEFAULT 0,
                    swot            TEXT DEFAULT '{}',
                    goals           TEXT DEFAULT '',
                    goal_tags       TEXT DEFAULT '[]',
                    created_at      TEXT NOT NULL,
                    last_login_at   TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS students (
                    student_id  TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    name        TEXT NOT NULL,
                    email       TEXT NOT NULL,
                    college_id  TEXT,
                    department  TEXT,
                    semester    INTEGER DEFAULT 4,
                    created_at  TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS journal_entries (
                    entry_id    INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    type        TEXT NOT NULL CHECK (type IN ('voice','text','photo')),
                    raw_transcript_or_ocr_text TEXT NOT NULL,
                    timestamp   TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS emotion_tags (
                    entry_id        INTEGER PRIMARY KEY REFERENCES journal_entries(entry_id) ON DELETE CASCADE,
                    sentiment_score REAL NOT NULL,
                    emotion_label   TEXT NOT NULL,
                    model_used      TEXT NOT NULL,
                    computed_at     TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS embedding_vectors (
                    entry_id    INTEGER PRIMARY KEY REFERENCES journal_entries(entry_id) ON DELETE CASCADE,
                    vector_json TEXT
                );

                CREATE TABLE IF NOT EXISTS mini_json (
                    student_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    date            TEXT NOT NULL,
                    summary_stats   TEXT NOT NULL,
                    PRIMARY KEY (student_id, date)
                );

                CREATE TABLE IF NOT EXISTS weekly_rewind_cards (
                    card_id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    week_range        TEXT NOT NULL,
                    generated_content TEXT NOT NULL,
                    visual_config     TEXT NOT NULL,
                    created_at        TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS distress_alerts (
                    alert_id        INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    trigger_reason  TEXT NOT NULL,
                    pattern_window  INTEGER NOT NULL,
                    sent_to         TEXT NOT NULL,
                    sent_at         TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS roadmaps (
                    roadmap_id   TEXT PRIMARY KEY,
                    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    title        TEXT NOT NULL,
                    source       TEXT NOT NULL DEFAULT 'custom',
                    total_topics INTEGER NOT NULL DEFAULT 0,
                    created_at   TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS daily_goals (
                    goal_id         TEXT PRIMARY KEY,
                    roadmap_id      TEXT REFERENCES roadmaps(roadmap_id) ON DELETE CASCADE,
                    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    target_date     TEXT NOT NULL,
                    topics          TEXT NOT NULL,
                    problems_count  INTEGER NOT NULL DEFAULT 3,
                    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','partial','missed','rescheduled')),
                    completed_at    TEXT,
                    rescheduled_to  TEXT,
                    created_at      TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS resource_mappings (
                    topic_tag   TEXT PRIMARY KEY,
                    youtube_url TEXT NOT NULL,
                    title       TEXT NOT NULL
                );
                """
                for statement in sqlite_schema.split(";"):
                    stmt = statement.strip()
                    if stmt:
                        cur.execute(stmt)
            else:
                schema_path = Path(__file__).resolve().parent / "pg_schema.sql"
                if schema_path.exists():
                    cur.execute(schema_path.read_text(encoding="utf-8"))
                    logger.info("PostgreSQL schema applied (idempotent).")

            # Seed ResourceMapping from resources.json
            resources_path = Path(__file__).resolve().parent / "resources.json"
            if resources_path.exists():
                resources = json.loads(resources_path.read_text(encoding="utf-8"))
                for topic_tag, details in resources.items():
                    cur.execute(
                        """
                        INSERT INTO resource_mappings (topic_tag, youtube_url, title)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (topic_tag) DO UPDATE
                          SET youtube_url = EXCLUDED.youtube_url,
                              title = EXCLUDED.title
                        """,
                        (topic_tag, details["youtube_url"], details["title"]),
                    )
        conn.commit()
        logger.info("Database initialised and resources seeded.")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# User CRUD
# ---------------------------------------------------------------------------

def get_user_by_id(conn, user_id: str) -> Optional[dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, google_id, email, name, role, college_id, avatar_url,
                   department, onboarding_completed, swot, goals, goal_tags,
                   created_at, last_login_at
            FROM users WHERE id = %s
            """,
            (user_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def get_user_by_google_id(conn, google_id: str) -> Optional[dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, google_id, email, name, role, college_id, avatar_url,
                   department, onboarding_completed, swot, goals, goal_tags,
                   created_at, last_login_at
            FROM users WHERE google_id = %s
            """,
            (google_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def ensure_local_user(
    user_id: str,
    email: str,
    name: str,
    avatar_url: Optional[str] = None,
    role: str = "student",
    google_id: Optional[str] = None,
) -> dict:
    """
    Idempotently upserts a user into the local database table.
    """
    conn = get_connection()
    try:
        college_id = email.split("@")[0].upper()
        now = datetime.now(timezone.utc)

        prefix = college_id
        if "AD" in prefix:
            dept = "Artificial Intelligence & Data Science"
        elif "IS" in prefix:
            dept = "Information Science & Engineering"
        elif "EC" in prefix:
            dept = "Electronics & Communication Engineering"
        else:
            dept = "Computer Science & Engineering"

        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO users
                    (id, google_id, email, name, role, college_id, avatar_url, department, created_at, last_login_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    last_login_at = EXCLUDED.last_login_at,
                    avatar_url    = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
                    name          = COALESCE(EXCLUDED.name, users.name)
                """,
                (
                    user_id,
                    google_id or user_id,
                    email,
                    name,
                    role,
                    college_id,
                    avatar_url,
                    dept,
                    now,
                    now,
                ),
            )
            if role == "student":
                cur.execute(
                    """
                    INSERT INTO students (student_id, name, email, college_id, department, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (student_id) DO NOTHING
                    """,
                    (user_id, name, email, college_id, dept, now),
                )
        conn.commit()

        return get_user_by_id(conn, user_id) or {
            "id": user_id,
            "email": email,
            "name": name,
            "role": role,
            "college_id": college_id,
        }
    finally:
        conn.close()


def update_user_onboarding(
    conn,
    user_id: str,
    swot: Optional[dict] = None,
    goals: Optional[str] = None,
    goal_tags: Optional[list] = None,
    completed: Optional[bool] = None,
) -> None:
    updates = []
    params: list = []
    if swot is not None:
        updates.append("swot = %s")
        params.append(json.dumps(swot) if isinstance(swot, dict) else swot)
    if goals is not None:
        updates.append("goals = %s")
        params.append(str(goals))
    if goal_tags is not None:
        updates.append("goal_tags = %s")
        params.append(goal_tags if isinstance(goal_tags, list) else [])
    if completed is not None:
        updates.append("onboarding_completed = %s")
        params.append(1 if (completed and IS_SQLITE) else completed)
    if updates:
        params.append(user_id)
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE users SET {', '.join(updates)} WHERE id = %s",
                tuple(params),
            )
        conn.commit()


def update_user_last_login(conn, user_id: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE users SET last_login_at = %s WHERE id = %s",
            (datetime.now(timezone.utc), user_id),
        )
    conn.commit()


# ---------------------------------------------------------------------------
# Journal CRUD
# ---------------------------------------------------------------------------

def insert_journal_entry(
    conn,
    student_id: str,
    entry_type: str,
    text: str,
    timestamp: Optional[datetime] = None,
) -> int:
    ts = timestamp or datetime.now(timezone.utc)
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO journal_entries (student_id, type, raw_transcript_or_ocr_text, timestamp)
            VALUES (%s, %s, %s, %s) RETURNING entry_id
            """,
            (student_id, entry_type, text, ts),
        )
        row = cur.fetchone()
        if row and "entry_id" in row and row["entry_id"] is not None:
            entry_id = row["entry_id"]
        else:
            entry_id = getattr(cur, "lastrowid", None) or 1
    conn.commit()
    return entry_id


def insert_emotion_tag(
    conn,
    entry_id: int,
    sentiment_score: float,
    emotion_label: str,
    model_used: str,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO emotion_tags (entry_id, sentiment_score, emotion_label, model_used, computed_at)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (entry_id) DO UPDATE SET
                sentiment_score = EXCLUDED.sentiment_score,
                emotion_label   = EXCLUDED.emotion_label
            """,
            (entry_id, sentiment_score, emotion_label, model_used, datetime.now(timezone.utc)),
        )
    conn.commit()


def save_embedding(entry_id: int, vector: list) -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO embedding_vectors (entry_id, vector_json)
                VALUES (%s, %s)
                ON CONFLICT (entry_id) DO UPDATE SET vector_json = EXCLUDED.vector_json
                """,
                (entry_id, json.dumps(vector)),
            )
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Roadmap + DailyGoal CRUD
# ---------------------------------------------------------------------------

def create_roadmap(conn, user_id: str, title: str, total_topics: int = 0, source: str = "custom") -> str:
    roadmap_id = f"rmp_{uuid.uuid4().hex}"
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO roadmaps (roadmap_id, user_id, title, source, total_topics, created_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (roadmap_id, user_id, title, source, total_topics, datetime.now(timezone.utc)),
        )
    conn.commit()
    return roadmap_id


def get_roadmap(conn, user_id: str) -> Optional[dict]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT * FROM roadmaps WHERE user_id = %s ORDER BY created_at DESC LIMIT 1",
            (user_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def delete_goals_by_roadmap(conn, roadmap_id: str) -> None:
    with conn.cursor() as cur:
        cur.execute("DELETE FROM daily_goals WHERE roadmap_id = %s", (roadmap_id,))
    conn.commit()


def create_daily_goals(conn, goals: list[dict]) -> int:
    """Bulk-inserts DailyGoal rows. Returns count inserted."""
    if not goals:
        return 0
    with conn.cursor() as cur:
        for g in goals:
            goal_id = g.get("goal_id") or f"goal_{uuid.uuid4().hex}"
            topics = g.get("topics", [])
            cur.execute(
                """
                INSERT INTO daily_goals
                    (goal_id, roadmap_id, user_id, target_date, topics, problems_count, status, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    goal_id,
                    g.get("roadmap_id"),
                    g["user_id"],
                    g["target_date"],
                    json.dumps(topics) if not isinstance(topics, str) else topics,
                    g.get("problems_count", 3),
                    g.get("status", "pending"),
                    datetime.now(timezone.utc),
                ),
            )
    conn.commit()
    return len(goals)


def get_daily_goals(conn, user_id: str, limit: int = 30) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT goal_id, roadmap_id, user_id, target_date, topics,
                   problems_count, status, completed_at, rescheduled_to, created_at
            FROM daily_goals
            WHERE user_id = %s
            ORDER BY target_date ASC
            LIMIT %s
            """,
            (user_id, limit),
        )
        rows = cur.fetchall()
    result = []
    for r in rows:
        row = dict(r)
        if isinstance(row.get("topics"), str):
            try:
                row["topics"] = json.loads(row["topics"])
            except Exception:
                pass
        result.append(row)
    return result


def update_goal_status(conn, goal_id: str, user_id: str, status: str) -> bool:
    completed_at = datetime.now(timezone.utc) if status == "completed" else None
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE daily_goals
            SET status = %s, completed_at = %s
            WHERE goal_id = %s AND user_id = %s
            """,
            (status, completed_at, goal_id, user_id),
        )
        updated = cur.rowcount
    conn.commit()
    return updated > 0


# ---------------------------------------------------------------------------
# MiniJSON / Rewind (local store for distress detection)
# ---------------------------------------------------------------------------

def upsert_mini_json(conn, student_id: str, date_key: str, summary_stats: dict) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO mini_json (student_id, date, summary_stats)
            VALUES (%s, %s, %s)
            ON CONFLICT (student_id, date) DO UPDATE SET summary_stats = EXCLUDED.summary_stats
            """,
            (student_id, date_key, json.dumps(summary_stats)),
        )
    conn.commit()


def get_recent_mini_json(conn, student_id: str, days: int = 7) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT date, summary_stats FROM mini_json
            WHERE student_id = %s
            ORDER BY date DESC
            LIMIT %s
            """,
            (student_id, days),
        )
        rows = cur.fetchall()
    return [dict(r) for r in rows]
