from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class VoiceJournalResponse(BaseModel):
    entry_id: int
    transcript: str
    emotion_label: str
    sentiment_score: float

class TextJournalRequest(BaseModel):
    text: str
    student_id: Optional[str] = None


class SeedResponse(BaseModel):
    status: str
    count: int
    student_id: str

class WeeklyRewindResponse(BaseModel):
    week_title: str
    summary: str
    highlight: str
    mood_trend: str
    top_emotions: List[str]
    recommended_topic: str
    actionable_tip: str
    visual_config: Optional[Dict[str, Any]] = None

class DistressCheckResponse(BaseModel):
    alert_triggered: bool
    student_id: str
    avg_sentiment: float
    message: str
    recipient: Optional[str] = None
    reason: Optional[str] = None
    window_days: Optional[int] = None
    alert_text: Optional[str] = None

class ResourceItem(BaseModel):
    topic_tag: str
    youtube_url: str
    title: str
