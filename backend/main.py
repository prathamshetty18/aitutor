import json
import logging
import os
import sys
import shutil
import tempfile
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, List, Dict, Any

# Ensure local backend imports resolve regardless of CWD
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from fastapi import FastAPI, UploadFile, File, HTTPException, status, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from config import settings
from database import (
    init_db, get_connection,
    get_user_by_id, update_user_onboarding,
    create_roadmap, get_roadmap, create_daily_goals,
    get_daily_goals, update_goal_status, delete_goals_by_roadmap,
)
from models import (
    VoiceJournalResponse,
    TextJournalRequest,
    SeedResponse,
    WeeklyRewindResponse,
    DistressCheckResponse,
    ResourceItem
)
from pipeline import (
    transcribe_audio_file,
    process_journal_entry,
    load_prompt_file,
    call_groq
)
from ocr import extract_text_from_image
from auth import router as auth_router
from deps import verify_local_jwt, current_user

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai_tutor.api")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize database, run migrations, seed default student and resources
    logger.info("Initializing database and seeding default data...")
    init_db()
    yield
    # Shutdown
    logger.info("Shutting down AI Tutor backend...")

app = FastAPI(
    title="AI Tutor MVP API",
    description="Privacy-first AI Tutor backend with local Whisper STT, PostgreSQL, Groq sentiment, and distress detection.",
    version="2.0.0",
    lifespan=lifespan
)

# Configure CORS with FRONTEND_ORIGIN from env
origins = [origin.strip() for origin in settings.FRONTEND_ORIGIN.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Authentication Routes
app.include_router(auth_router)

@app.get("/")
def health_check():
    """Liveness probe. Deliberately leaks no configuration internals."""
    return {"status": "healthy", "service": "AI Tutor MVP"}

# -----------------------------------------------------------------------------
# 1. POST /journal/voice — Voice journaling pipeline
# -----------------------------------------------------------------------------
@app.post("/journal/voice", response_model=VoiceJournalResponse)
def upload_voice_journal(
    file: UploadFile = File(...),
    student: Dict[str, Any] = Depends(current_user),
):
    target_student = student["id"]  # identity from verified session, NEVER request params
    
    # REQUIREMENT 3: Audio format safety check from ACCEPTED_AUDIO_FORMATS env var
    accepted_formats = [fmt.strip().lower() for fmt in settings.ACCEPTED_AUDIO_FORMATS.split(",") if fmt.strip()]
    file_ext = Path(file.filename or "").suffix.lstrip(".").lower()
    content_type = file.content_type or ""
    
    is_valid_format = (
        file_ext in accepted_formats or
        any(f"audio/{fmt}" in content_type.lower() for fmt in accepted_formats)
    )
    if not is_valid_format:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported audio format. Allowed formats: {settings.ACCEPTED_AUDIO_FORMATS}. For .wav reliability, ffmpeg is required for other formats."
        )

    # Save uploaded audio to temporary file
    temp_dir = tempfile.gettempdir()
    temp_audio_path = os.path.join(temp_dir, f"voice_{datetime.now().timestamp()}.{file_ext or 'wav'}")
    try:
        with open(temp_audio_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # 1. Local Whisper transcription
        transcript = transcribe_audio_file(temp_audio_path)
        
        # 2. Unified pipeline execution: sentiment + embedding + DB insertion
        now_iso = datetime.now(timezone.utc).isoformat()
        result = process_journal_entry(
            student_id=target_student,
            transcript=transcript,
            timestamp_str=now_iso,
            entry_type="voice"
        )
        
        return VoiceJournalResponse(
            entry_id=result["entry_id"],
            transcript=result["transcript"],
            emotion_label=result["emotion_label"],
            sentiment_score=result["sentiment_score"]
        )
    finally:
        if os.path.exists(temp_audio_path):
            try:
                os.remove(temp_audio_path)
            except Exception:
                pass

@app.post("/journal/text", response_model=VoiceJournalResponse)
def submit_text_journal(
    payload: TextJournalRequest,
    student: Dict[str, Any] = Depends(current_user),
):
    target_student = student["id"]
    if not payload.text or not payload.text.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Text cannot be empty.")
    
    now_iso = datetime.now(timezone.utc).isoformat()
    result = process_journal_entry(
        student_id=target_student,
        transcript=payload.text.strip(),
        timestamp_str=now_iso,
        entry_type="text"
    )
    return VoiceJournalResponse(
        entry_id=result["entry_id"],
        transcript=result["transcript"],
        emotion_label=result["emotion_label"],
        sentiment_score=result["sentiment_score"]
    )

@app.post("/journal/photo", response_model=VoiceJournalResponse)
def submit_photo_journal(
    file: UploadFile = File(...),
    student: Dict[str, Any] = Depends(current_user),
):
    target_student = student["id"]
    
    filename = file.filename or "photo.png"
    ext = os.path.splitext(filename)[1].lower()
    allowed_exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".jfif"}
    if ext and ext not in allowed_exts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported image format ({ext}). Supported formats: {', '.join(sorted(allowed_exts))}"
        )
        
    temp_dir = tempfile.gettempdir()
    temp_img_path = os.path.join(temp_dir, f"diary_{datetime.now().timestamp()}{ext or '.png'}")
    
    try:
        with open(temp_img_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        try:
            extracted_text = extract_text_from_image(temp_img_path).strip()
        except Exception as ocr_err:
            logger.error(f"OCR extraction failed: {ocr_err}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"OCR recognition error: {str(ocr_err)}"
            )
            
        if not extracted_text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No readable text could be detected in this photo. Please make sure handwritten notes or printed diary pages are clearly visible."
            )
            
        now_iso = datetime.now(timezone.utc).isoformat()
        result = process_journal_entry(
            student_id=target_student,
            transcript=extracted_text,
            timestamp_str=now_iso,
            entry_type="photo"
        )
        
        return VoiceJournalResponse(
            entry_id=result["entry_id"],
            transcript=result["transcript"],
            emotion_label=result["emotion_label"],
            sentiment_score=result["sentiment_score"]
        )
    finally:
        if os.path.exists(temp_img_path):
            try:
                os.remove(temp_img_path)
            except Exception:
                pass

@app.get("/journal")
def get_student_journal_entries(student: Dict[str, Any] = Depends(current_user)):
    student_id = student["id"]
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT j.entry_id, j.student_id, j.type, j.raw_transcript_or_ocr_text, j.timestamp,
                   e.emotion_label, e.sentiment_score
            FROM journal_entries j
            LEFT JOIN emotion_tags e ON j.entry_id = e.entry_id
            WHERE j.student_id = %s
            ORDER BY j.timestamp DESC
        """, (student_id,))
        rows = cur.fetchall()
        return [
            {
                "id": f"db-{r['entry_id']}",
                "timestamp": r["timestamp"],
                "transcript": r["raw_transcript_or_ocr_text"],
                "emotionLabel": (r["emotion_label"] or "Neutral").lower(),
                "sentimentScore": r["sentiment_score"] if r["sentiment_score"] is not None else 0.0,
                "mode": r["type"] or "voice",
            }
            for r in rows
        ]
    finally:
        conn.close()

# -----------------------------------------------------------------------------
# 2. POST /seed — Backdated 7-day declining pattern data seeding
# -----------------------------------------------------------------------------
@app.post("/seed", response_model=SeedResponse)
async def seed_demo_data(_: Dict[str, Any] = Depends(verify_local_jwt)):
    target_student = settings.DEFAULT_STUDENT_ID  # local demo seeding only
    seed_path = Path(settings.SEED_JSON_PATH)
    if not seed_path.exists():
        raise HTTPException(status_code=500, detail=f"Seed file not found at {seed_path}")
        
    with open(seed_path, "r", encoding="utf-8") as f:
        seed_entries = json.load(f)
        
    now = datetime.now(timezone.utc)
    seeded_count = 0
    
    # Process each seed object through the SAME unified pipeline
    for entry in seed_entries:
        day_offset = entry.get("day_offset", 0)
        entry_time = now - timedelta(days=day_offset)
        timestamp_str = entry_time.isoformat()
        
        process_journal_entry(
            student_id=target_student,
            transcript=entry["transcript_text"],
            timestamp_str=timestamp_str,
            entry_type="voice",
            forced_sentiment=entry.get("target_sentiment"),
            forced_emotion=entry.get("target_emotion")
        )
        seeded_count += 1
        
    return SeedResponse(
        status="success",
        count=seeded_count,
        student_id=target_student
    )

# -----------------------------------------------------------------------------
# 3. GET /rewind/{student_id} — Spotify Wrapped-style weekly summary card
# -----------------------------------------------------------------------------
@app.get("/rewind", response_model=WeeklyRewindResponse)
def get_weekly_rewind(student: Dict[str, Any] = Depends(current_user)):
    student_id = student["id"]
    conn = get_connection()
    try:
        cur = conn.cursor()
        # Query last 7 days EmotionTag + JournalEntry rows
        cur.execute("""
            SELECT j.entry_id, j.timestamp, e.sentiment_score, e.emotion_label
            FROM journal_entries j
            JOIN emotion_tags e ON j.entry_id = e.entry_id
            WHERE j.student_id = %s
            ORDER BY j.timestamp ASC
        """, (student_id,))
        rows = cur.fetchall()
        
        if not rows:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No journal entries found for student '{student_id}'. Please record a journal or run /seed first."
            )
            
        # Aggregate rows into daily mini_json
        daily_stats: Dict[str, Dict[str, Any]] = {}
        for r in rows:
            ts = r["timestamp"]
            date_key = ts.strftime("%Y-%m-%d") if hasattr(ts, "strftime") else str(ts)[:10]
            if date_key not in daily_stats:
                daily_stats[date_key] = {"scores": [], "emotions": []}
            daily_stats[date_key]["scores"].append(r["sentiment_score"])
            daily_stats[date_key]["emotions"].append(r["emotion_label"])
            
        mini_json_summary = {}
        for d, vals in daily_stats.items():
            avg_score = round(sum(vals["scores"]) / len(vals["scores"]), 2)
            mini_json_summary[d] = {
                "avg_sentiment": avg_score,
                "emotions": list(set(vals["emotions"])),
                "entry_count": len(vals["scores"])
            }
            # Persist into mini_json table
            cur.execute("""
                INSERT INTO mini_json(student_id, date, summary_stats)
                VALUES (%s, %s, %s)
                ON CONFLICT (student_id, date) DO UPDATE SET
                    summary_stats = EXCLUDED.summary_stats
            """, (student_id, d, json.dumps(mini_json_summary[d])))
            
        conn.commit()
        
        # Prepare context for rewind prompt
        mini_json_context = json.dumps(mini_json_summary, indent=2)
        rewind_prompt_template = load_prompt_file("rewind.txt")
        prompt = rewind_prompt_template.replace("{mini_json_context}", mini_json_context)
        
        # Call Groq (or fallback)
        llm_response = call_groq(prompt, fallback_key="rewind_fallback", as_json=True)
        if not isinstance(llm_response, dict):
            llm_response = {
                "week_title": "Weekly Resilience Snapshot",
                "summary": "You navigated varied challenges this week while keeping up with engineering coursework.",
                "highlight": "Consistent engagement across academic problem sets.",
                "mood_trend": "Gradual Adaptation",
                "top_emotions": ["Pensive", "Determined", "Calm"],
                "recommended_topic": "Recursion & Dynamic Programming",
                "actionable_tip": "Focus on core recursive base cases before branching out."
            }
            
        week_range = f"{list(daily_stats.keys())[0]} to {list(daily_stats.keys())[-1]}"
        visual_config = {
            "palette": "midnight_neon",
            "primary_color": "#6366f1",
            "accent_color": "#ec4899",
            "highlight_color": "#10b981"
        }
        
        # Persist weekly_rewind_cards in database
        now_created = datetime.now(timezone.utc).isoformat()
        cur.execute("""
            INSERT INTO weekly_rewind_cards(student_id, week_range, generated_content, visual_config, created_at)
            VALUES (%s, %s, %s, %s, %s)
        """, (
            student_id,
            week_range,
            json.dumps(llm_response),
            json.dumps(visual_config),
            now_created
        ))
        conn.commit()
        
        return WeeklyRewindResponse(
            week_title=llm_response.get("week_title", "Weekly Rewind"),
            summary=llm_response.get("summary", ""),
            highlight=llm_response.get("highlight", ""),
            mood_trend=llm_response.get("mood_trend", "Steady"),
            top_emotions=llm_response.get("top_emotions", []),
            recommended_topic=llm_response.get("recommended_topic", "Recursion & Dynamic Programming"),
            actionable_tip=llm_response.get("actionable_tip", ""),
            visual_config=visual_config
        )
    finally:
        conn.close()

# -----------------------------------------------------------------------------
# 4. POST /distress/check/{student_id} — Safety-net early warning distress signal
# -----------------------------------------------------------------------------
@app.post("/distress/check", response_model=DistressCheckResponse)
def check_student_distress(student: Dict[str, Any] = Depends(current_user)):
    student_id = student["id"]
    conn = get_connection()
    try:
        cur = conn.cursor()
        window_days = settings.ROLLING_WINDOW_DAYS
        
        # Pull last ROLLING_WINDOW_DAYS sentiment rows
        cur.execute("""
            SELECT e.sentiment_score, j.timestamp
            FROM emotion_tags e
            JOIN journal_entries j ON e.entry_id = j.entry_id
            WHERE j.student_id = %s
            ORDER BY j.timestamp DESC
            LIMIT %s
        """, (student_id, window_days * 3))
        rows = cur.fetchall()
        
        if not rows:
            return DistressCheckResponse(
                alert_triggered=False,
                student_id=student_id,
                avg_sentiment=0.0,
                message="No recent journal entries to evaluate."
            )
            
        scores = [r["sentiment_score"] for r in rows]
        avg_sentiment = round(sum(scores) / len(scores), 2)
        
        # Check distress threshold
        if avg_sentiment < settings.SENTIMENT_THRESHOLD:
            # REQUIREMENT 7: Pass ONLY aggregate stats into prompt context.
            # Never pass raw_transcript_or_ocr_text!
            trend_direction = "Steep Negative Trajectory" if scores[0] < scores[-1] else "Sustained Negative Baseline"
            alert_prompt_template = load_prompt_file("alert_reason.txt")
            prompt = (
                alert_prompt_template
                .replace("{student_id}", student_id)
                .replace("{window_days}", str(window_days))
                .replace("{avg_sentiment:.2f}", f"{avg_sentiment:.2f}")
                .replace("{avg_sentiment}", f"{avg_sentiment:.2f}")
                .replace("{sentiment_threshold}", str(settings.SENTIMENT_THRESHOLD))
                .replace("{trend_direction}", trend_direction)
            )
            
            # Call Groq to generate short generic reason (max 15 words)
            reason = call_groq(prompt, fallback_key="alert_reason_fallback", as_json=False)
            if not reason or not isinstance(reason, str):
                reason = "Sustained declining sentiment trajectory across 7-day evaluation window."
            # Safety net: enforce max 15 words
            words = reason.split()
            if len(words) > 15:
                reason = " ".join(words[:15]) + "..."
                
            # Fill alert_template.txt
            template_path = Path(settings.ALERT_TEMPLATE_PATH)
            with open(template_path, "r", encoding="utf-8") as f:
                template_text = f.read()
                
            rendered_alert = (
                template_text
                .replace("{student_id}", student_id)
                .replace("{reason}", reason)
                .replace("{window}", str(window_days))
                .replace("{hod_email}", settings.HOD_EMAIL)
            )
            
            # Write to alerts.log (mock email delivery)
            now_iso = datetime.now(timezone.utc).isoformat()
            log_entry = (
                f"\n--- DISPATCH TIMESTAMP: {now_iso} | RECIPIENT: {settings.HOD_EMAIL} ---\n"
                f"{rendered_alert}\n"
            )
            alerts_log_path = Path(settings.ALERTS_LOG_PATH)
            with open(alerts_log_path, "a", encoding="utf-8") as f:
                f.write(log_entry)
                
            # Insert distress_alerts row
            cur.execute("""
                INSERT INTO distress_alerts(student_id, trigger_reason, pattern_window, sent_to, sent_at)
                VALUES (%s, %s, %s, %s, %s)
            """, (student_id, reason, window_days, settings.HOD_EMAIL, now_iso))
            conn.commit()
            
            return DistressCheckResponse(
                alert_triggered=True,
                student_id=student_id,
                avg_sentiment=avg_sentiment,
                message="Distress threshold reached. Early-warning alert dispatched to HOD.",
                recipient=settings.HOD_EMAIL,
                reason=reason,
                window_days=window_days,
                alert_text=rendered_alert
            )
            
        return DistressCheckResponse(
            alert_triggered=False,
            student_id=student_id,
            avg_sentiment=avg_sentiment,
            message="Student sentiment is within normal parameters."
        )
    finally:
        conn.close()

# -----------------------------------------------------------------------------
# 5. GET /resources and GET /resources/{topic_tag} — Curated YouTube video lookup
# -----------------------------------------------------------------------------
@app.get("/resources", response_model=List[ResourceItem])
def get_all_resources(topic_tag: Optional[str] = None):
    if topic_tag:
        res = get_resource_by_topic(topic_tag)
        return [res]
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT topic_tag, youtube_url, title FROM resource_mappings")
        rows = cur.fetchall()
        if rows:
            return [ResourceItem(topic_tag=r["topic_tag"], youtube_url=r["youtube_url"], title=r["title"]) for r in rows]
        # Fallback to resources.json
        resources_path = Path(settings.RESOURCES_JSON_PATH)
        if resources_path.exists():
            with open(resources_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return [ResourceItem(topic_tag=k, youtube_url=v["youtube_url"], title=v["title"]) for k, v in data.items()]
        return []
    finally:
        conn.close()

@app.get("/resources/{topic_tag}", response_model=ResourceItem)
def get_resource_by_topic(topic_tag: str):
    conn = get_connection()
    try:
        cur = conn.cursor()
        # 1. Exact or partial SQL match
        cur.execute("""
            SELECT topic_tag, youtube_url, title
            FROM resource_mappings
            WHERE topic_tag = %s OR topic_tag LIKE %s
        """, (topic_tag, f"%{topic_tag}%"))
        row = cur.fetchone()
        
        if row:
            return ResourceItem(
                topic_tag=row["topic_tag"],
                youtube_url=row["youtube_url"],
                title=row["title"]
            )
            
        # 2. Token-based word search against all rows in resource_mappings
        cur.execute("SELECT topic_tag, youtube_url, title FROM resource_mappings")
        all_rows = cur.fetchall()
        tokens = [t.lower() for t in topic_tag.replace("&", " ").replace("-", " ").split() if len(t) > 2]
        for r in all_rows:
            target_str = r["topic_tag"].lower()
            if any(t in target_str for t in tokens):
                return ResourceItem(
                    topic_tag=r["topic_tag"],
                    youtube_url=r["youtube_url"],
                    title=r["title"]
                )
            
        # 3. Fallback to resources.json
        resources_path = Path(settings.RESOURCES_JSON_PATH)
        if resources_path.exists():
            with open(resources_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if topic_tag in data:
                    item = data[topic_tag]
                    return ResourceItem(
                        topic_tag=topic_tag,
                        youtube_url=item["youtube_url"],
                        title=item["title"]
                    )
                # First available as graceful fallback
                first_key = next(iter(data))
                return ResourceItem(
                    topic_tag=first_key,
                    youtube_url=data[first_key]["youtube_url"],
                    title=data[first_key]["title"]
                )
                
        # 4. If table had any rows, return the first
        if all_rows:
            return ResourceItem(
                topic_tag=all_rows[0]["topic_tag"],
                youtube_url=all_rows[0]["youtube_url"],
                title=all_rows[0]["title"]
            )
            
        return ResourceItem(
            topic_tag="Recursion & Dynamic Programming",
            youtube_url="https://www.youtube.com/watch?v=oBt53YbR9Kk",
            title="Dynamic Programming - Learn to Solve Algorithmic Problems"
        )
    finally:
        conn.close()

# -----------------------------------------------------------------------------
# 6. POST /chat — Real AI Tutor Chat via Groq (student-context-aware)
# -----------------------------------------------------------------------------
from pydantic import BaseModel as PydanticBaseModel

class ChatHistoryMessage(PydanticBaseModel):
    role: str   # "user" | "assistant"
    content: str

class ChatRequest(PydanticBaseModel):
    message: str
    history: Optional[List[ChatHistoryMessage]] = []

class PlanUpdate(BaseModel):
    """Structured change requests the tutor detected in a chat message."""
    action: str  # "swap_task" | "add_task" | "remove_task" | "regenerate_week" | "update_profile"
    date: Optional[str] = None      # YYYY-MM-DD target date for task actions
    task_index: Optional[int] = None
    new_topic: Optional[str] = None
    updated_swot: Optional[Dict[str, Any]] = None
    updated_goals: Optional[str] = None

class ChatResponse(PydanticBaseModel):
    reply: str
    plan_update: Optional[PlanUpdate] = None

def _apply_plan_update(conn_factory, user_id: str, update: Dict[str, Any]) -> Optional[str]:
    """
    Persists a plan_update detected by the chat tutor. Supports:
      - swap_task / add_task / remove_task on a specific date
      - regenerate_week: clears pending tasks (completed history is kept)
      - update_profile: SWOT and/or goals text update
    Returns a short human-readable confirmation (or None if nothing applied).
    """
    action = update.get("action")
    date_str = update.get("date")
    task_index = update.get("task_index")
    new_topic = (update.get("new_topic") or "").strip()
    conn = conn_factory()
    try:
        with conn.cursor() as cur:
            if action in ("swap_task", "remove_task"):
                if date_str is None or task_index is None:
                    return None
                # Fetch that day's pending tasks (same ordering as the chat context)
                cur.execute(
                    """
                    SELECT goal_id, topics FROM daily_goals
                    WHERE user_id = %s AND target_date = %s AND status != 'completed'
                    ORDER BY created_at ASC, goal_id ASC
                """,
                    (user_id, date_str),
                )
                rows = cur.fetchall()
                if task_index < 0 or task_index >= len(rows):
                    return None
                goal_id, topics = rows[task_index]["goal_id"], rows[task_index]["topics"]
                if isinstance(topics, str):
                    try:
                        topics = json.loads(topics)
                    except Exception:
                        topics = [topics]
                topics = list(topics)

                if action == "swap_task":
                    if not new_topic:
                        return None
                    topics[0] = new_topic
                    cur.execute(
                        "UPDATE daily_goals SET topics = %s WHERE goal_id = %s AND user_id = %s",
                        (json.dumps(topics), goal_id, user_id),
                    )
                    return f"Swapped task on {date_str} to: {new_topic}"

                cur.execute(
                    "DELETE FROM daily_goals WHERE goal_id = %s AND user_id = %s",
                    (goal_id, user_id),
                )
                return f"Removed task on {date_str}"

            elif action == "add_task":
                if not date_str or not new_topic:
                    return None
                cur.execute(
                    """
                    INSERT INTO daily_goals (roadmap_id, user_id, target_date, topics, problems_count, status, created_at)
                    VALUES (NULL, %s, %s, %s, 3, 'pending', %s)
                """,
                    (user_id, date_str, json.dumps([new_topic]), datetime.now(timezone.utc)),
                )
                return f"Added task on {date_str}: {new_topic}"

            elif action == "regenerate_week":
                # Frontend will regenerate via /api/goals DELETE + re-run of its generator,
                # so here we only clear pending rows; completed history is preserved.
                cur.execute(
                    "DELETE FROM daily_goals WHERE user_id = %s AND status != 'completed'",
                    (user_id,),
                )
                return "Cleared pending tasks for regeneration"

            elif action == "update_profile":
                updates, params = [], []
                swot = update.get("updated_swot")
                if isinstance(swot, dict) and swot:
                    updates.append("swot = %s")
                    params.append(json.dumps(swot))
                goals_text = update.get("updated_goals")
                if isinstance(goals_text, str) and goals_text.strip():
                    updates.append("goals = %s")
                    params.append(goals_text.strip())
                if updates:
                    params.append(user_id)
                    cur.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = %s", tuple(params))
                    return "Updated your SWOT/goals"
                return None

        conn.commit()
    finally:
        conn.close()
    return None

@app.post("/chat", response_model=ChatResponse)
def ai_tutor_chat(
    payload: ChatRequest,
    student: Dict[str, Any] = Depends(current_user),
):
    """
    Real AI tutor chat endpoint (Groq, RAG context arrives in Phase 3).
    Identity comes from the verified session; student IDs are never echoed
    into the prompt or the response.
    """
    student_id = student["id"]
    student_name = student.get("name") or "Student"
    department = "Computer Science & Engineering"  # Phase 3: from Student row

    conn = get_connection()
    try:
        # Fetch recent journal sentiment context
        sentiment_context = ""
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT e.sentiment_score, e.emotion_label, j.timestamp
                FROM emotion_tags e
                JOIN journal_entries j ON e.entry_id = j.entry_id
                WHERE j.student_id = %s
                ORDER BY j.timestamp DESC
                LIMIT 5
            """, (student_id,))
            rows = cur.fetchall()
            if rows:
                avg_sent = round(sum(r["sentiment_score"] for r in rows) / len(rows), 2)
                recent_emotions = list(dict.fromkeys([r["emotion_label"] for r in rows]))[:3]
                sentiment_context = (
                    f"Recent journal sentiment average: {avg_sent} "
                    f"(recent emotions: {', '.join(recent_emotions)})."
                )
        except Exception as e:
            logger.warning(f"[chat] Could not fetch sentiment context: {e}")

        # ── Plan-aware context: pending tasks + SWOT/goals ──
        goals_context = ""
        pending_tasks_context = ""
        try:
            user_row = get_user_by_id(conn, student_id) or {}
            swot = user_row.get("swot") if isinstance(user_row.get("swot"), dict) else {}
            goals_context = (
                f"SWOT — S: {swot.get('strengths', 'n/a')}; W: {swot.get('weaknesses', 'n/a')}; "
                f"O: {swot.get('opportunities', 'n/a')}; T: {swot.get('threats', 'n/a')}. "
                f"Stated goals: {user_row.get('goals') or 'n/a'}"
            )

            cur = conn.cursor()
            cur.execute("""
                SELECT goal_id, target_date, topics, status
                FROM daily_goals
                WHERE user_id = %s AND status != 'completed'
                ORDER BY target_date ASC
                LIMIT 14
            """, (student_id,))
            task_rows = cur.fetchall()
            if task_rows:
                today_iso = datetime.now(timezone.utc).date().isoformat()
                task_lines = []
                for i, r in enumerate(task_rows):
                    topics = r["topics"]
                    if isinstance(topics, str):
                        try:
                            topics = json.loads(topics)
                        except Exception:
                            topics = [topics]
                    day_label = r["target_date"].isoformat() if hasattr(r["target_date"], "isoformat") else str(r["target_date"])
                    rel = "today" if day_label == today_iso else day_label
                    task_lines.append(f"{i}. [{day_label}] ({rel}) {', '.join(topics)} — status: {r['status']}")
                pending_tasks_context = "\n".join(task_lines)
        except Exception as e:
            logger.warning(f"[chat] Could not fetch plan context: {e}")
    finally:
        conn.close()

    # Build system prompt
    system_prompt = f"""You are Harmony's AI Tutor — a warm, intelligent academic companion for engineering students.

Student Profile:
- Name: {student_name}
- Department: {department}
- SWOT & goals: {goals_context}
- Emotional context: {sentiment_context}

Current study plan — pending tasks (index. [date] (relative) topics — status):
{pending_tasks_context or "(no pending tasks)"}

Your role:
1. Answer academic questions clearly with examples and step-by-step breakdowns.
2. Provide study strategies and motivation tailored to the student's profile.
3. Be encouraging, concise, and conversational — not overly formal.
4. If a student seems stressed (negative sentiment), acknowledge their feelings first.
5. Use markdown formatting (bold, numbered lists, code blocks) for structured answers.

PLAN CHANGE PROTOCOL — respond to plan-change demands with a JSON plan_update:
- If the user's message is a GENERAL question, complaint, or chat (even about being busy or tired), do
  NOT output plan_update — just reply normally with advice/encouragement.
- ONLY when the user EXPLICITLY requests a change to their study plan, tasks, SWOT or goals (e.g. "I
  can't do today's tasks, move them", "replace X with Y", "add Z on Thursday", "remove the mock",
  "regenerate my week", "change my goal to X"), you MUST end your reply with the token
  <<<PLAN_UPDATE>>> followed by a JSON object on the next line, matching EXACTLY one of:
  {"action": "swap_task", "date": "YYYY-MM-DD", "task_index": <int>, "new_topic": "..."}
  {"action": "add_task", "date": "YYYY-MM-DD", "new_topic": "..."}
  {"action": "remove_task", "date": "YYYY-MM-DD", "task_index": <int>}
  {"action": "regenerate_week"}
  {"action": "update_profile", "updated_swot": {"strengths": "...", "weaknesses": "...", "opportunities": "...", "threats": "..."}, "updated_goals": "..."}
- Dates must be copied EXACTLY from the plan above (never invent dates).
- task_index is the index shown in the plan list (0-based).
- Keep the human-readable part of your reply short and friendly. Confirm what you changed.

Keep responses focused and under 300 words unless a detailed technical explanation is required."""

    # Build message list for Groq
    messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]

    # Append conversation history (last 10 turns to stay within token limits)
    history = payload.history or []
    for h in history[-10:]:
        if h.role not in ("user", "assistant"):
            continue  # client-supplied "system" roles are never honored
        messages.append({"role": h.role, "content": h.content})

    # Append the new user message
    messages.append({"role": "user", "content": payload.message})

    # Call Groq directly (not via call_groq wrapper to support custom messages list)
    if settings.GROQ_FORCE_FALLBACK or not settings.GROQ_API_KEY or settings.GROQ_API_KEY == "your_groq_api_key_here":
        reply = (
            "I'm your AI tutor! It looks like the AI service isn't configured yet. "
            "Please set the GROQ_API_KEY in the backend .env file to enable real responses. "
            "In the meantime, feel free to browse your study materials in the Academics section!"
        )
    else:
        try:
            from groq import Groq
            client = Groq(api_key=settings.GROQ_API_KEY)
            completion = client.chat.completions.create(
                model=settings.GROQ_MODEL,
                messages=messages,  # type: ignore[arg-type]
                temperature=0.5,
                max_tokens=600,
            )
            reply = completion.choices[0].message.content or "I couldn't generate a response. Please try again."
        except Exception as e:
            logger.error(f"[chat] Groq API error: {e}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"AI service temporarily unavailable: {str(e)}"
            )

    # ── Parse optional plan_update from the reply ──
    plan_update_payload = None
    if "<<<PLAN_UPDATE>>>" in reply:
        human_part, _, json_part = reply.partition("<<<PLAN_UPDATE>>>")
        reply = human_part.strip()
        try:
            cleaned = json_part.strip().strip("`")
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            candidate = json.loads(cleaned.strip())
            if isinstance(candidate, dict) and "action" in candidate:
                plan_update_payload = candidate
        except Exception as e:
            logger.warning(f"[chat] Failed to parse plan_update JSON: {e}")

    # ── Persist recognized plan updates ──
    if plan_update_payload:
        try:
            _apply_plan_update(get_connection, student_id, plan_update_payload)
        except Exception as e:
            logger.error(f"[chat] Failed to apply plan update: {e}")

    return ChatResponse(
        reply=reply.strip(),
        plan_update=PlanUpdate(**plan_update_payload) if plan_update_payload else None,
    )


# =============================================================================
# API: User Profile
# =============================================================================

class ProfileUpdatePayload(BaseModel):
    swot: Optional[Dict[str, Any]] = None
    goals: Optional[str] = None
    goal_tags: Optional[list] = None
    onboarding_completed: Optional[bool] = None

@app.get("/api/user/profile")
def get_user_profile(student: Dict[str, Any] = Depends(current_user)):
    """Returns the full user profile including SWOT, goals, and onboarding status."""
    conn = get_connection()
    try:
        user = get_user_by_id(conn, student["id"])
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")
        swot = user.get("swot") or {}
        goal_tags = user.get("goal_tags") or []
        return {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
            "collegeId": user.get("college_id") or user["id"],
            "department": user.get("department"),
            "avatarUrl": user.get("avatar_url"),
            "onboardingCompleted": bool(user.get("onboarding_completed")),
            "swot": swot if isinstance(swot, dict) else {},
            "goals": user.get("goals") or "",
            "goalTags": goal_tags if isinstance(goal_tags, list) else [],
        }
    finally:
        conn.close()

@app.post("/api/user/profile")
def update_user_profile(
    payload: ProfileUpdatePayload,
    student: Dict[str, Any] = Depends(current_user),
):
    """Updates SWOT, goals, goal_tags, and onboarding_completed for the current user."""
    conn = get_connection()
    try:
        update_user_onboarding(
            conn=conn,
            user_id=student["id"],
            swot=payload.swot,
            goals=payload.goals,
            goal_tags=payload.goal_tags,
            completed=payload.onboarding_completed,
        )
    finally:
        conn.close()
    return {"status": "ok"}


# =============================================================================
# API: Roadmap
# =============================================================================

class RoadmapCreatePayload(BaseModel):
    title: str
    total_topics: int = 0
    source: str = "custom"

@app.get("/api/roadmap")
def get_user_roadmap(student: Dict[str, Any] = Depends(current_user)):
    """Returns the most recent roadmap for the current user."""
    conn = get_connection()
    try:
        roadmap = get_roadmap(conn, student["id"])
        if not roadmap:
            return {"roadmap": None}
        return {"roadmap": dict(roadmap)}
    finally:
        conn.close()

@app.post("/api/roadmap")
def create_user_roadmap(
    payload: RoadmapCreatePayload,
    student: Dict[str, Any] = Depends(current_user),
):
    """Creates a new roadmap for the current user."""
    conn = get_connection()
    try:
        roadmap_id = create_roadmap(
            conn,
            user_id=student["id"],
            title=payload.title,
            total_topics=payload.total_topics,
            source=payload.source,
        )
    finally:
        conn.close()
    return {"roadmap_id": roadmap_id}


# =============================================================================
# API: Daily Goals
# =============================================================================

class GoalInsert(BaseModel):
    roadmap_id: Optional[str] = None
    target_date: str
    topics: List[str]
    problems_count: int = 3
    status: str = "pending"

class GoalsBulkPayload(BaseModel):
    goals: List[GoalInsert]

class GoalStatusUpdate(BaseModel):
    status: str  # pending | completed | partial | missed | rescheduled

@app.get("/api/goals")
def list_goals(student: Dict[str, Any] = Depends(current_user)):
    """Returns all DailyGoal rows for the current user, ordered by target_date ASC."""
    conn = get_connection()
    try:
        goals = get_daily_goals(conn, student["id"])
        # Convert dates to ISO strings for JSON serialization
        result = []
        for g in goals:
            row = dict(g)
            for k in ("target_date", "completed_at", "rescheduled_to", "created_at"):
                if row.get(k) and hasattr(row[k], "isoformat"):
                    row[k] = row[k].isoformat()
            result.append(row)
        return {"goals": result}
    finally:
        conn.close()

@app.post("/api/goals")
def bulk_insert_goals(
    payload: GoalsBulkPayload,
    student: Dict[str, Any] = Depends(current_user),
):
    """Bulk-inserts DailyGoal rows for the current user."""
    conn = get_connection()
    try:
        rows = [
            {
                "roadmap_id": g.roadmap_id,
                "user_id": student["id"],
                "target_date": g.target_date,
                "topics": g.topics,
                "problems_count": g.problems_count,
                "status": g.status,
            }
            for g in payload.goals
        ]
        count = create_daily_goals(conn, rows)
    finally:
        conn.close()
    return {"inserted": count}

@app.delete("/api/goals")
def clear_all_goals(student: Dict[str, Any] = Depends(current_user)):
    """Deletes ALL daily_goals rows for the current user (used when regenerating a plan)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM daily_goals WHERE user_id = %s", (student["id"],))
            deleted = cur.rowcount
        conn.commit()
    finally:
        conn.close()
    return {"status": "cleared", "deleted": deleted}

@app.put("/api/goals/{goal_id}")
def update_goal(
    goal_id: str,
    payload: GoalStatusUpdate,
    student: Dict[str, Any] = Depends(current_user),
):
    """Updates the status of a single DailyGoal (e.g., completed, missed)."""
    allowed = {"pending", "completed", "partial", "missed", "rescheduled"}
    if payload.status not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {allowed}")
    conn = get_connection()
    try:
        ok = update_goal_status(conn, goal_id, student["id"], payload.status)
    finally:
        conn.close()
    if not ok:
        raise HTTPException(status_code=404, detail="Goal not found or not owned by current user.")
    return {"status": "ok"}

@app.delete("/api/goals/by-roadmap/{roadmap_id}")
def clear_goals_for_roadmap(
    roadmap_id: str,
    student: Dict[str, Any] = Depends(current_user),
):
    """Deletes all DailyGoal rows for a given roadmap (used when regenerating a plan)."""
    conn = get_connection()
    try:
        delete_goals_by_roadmap(conn, roadmap_id)
    finally:
        conn.close()
    return {"status": "cleared"}

# NOTE: unauthenticated demo aliases (/rewind, /distress/check variants) were
