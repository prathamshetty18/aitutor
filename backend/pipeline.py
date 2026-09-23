import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Tuple, Dict, Any, List

from config import settings
from database import get_connection, save_embedding

logger = logging.getLogger("ai_tutor.pipeline")

# Lazy global model instances for performance
_whisper_model = None
_embedding_model = None

def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            logger.info(f"Loading faster-whisper model '{settings.WHISPER_MODEL}'...")
            _whisper_model = WhisperModel(settings.WHISPER_MODEL, device="cpu", compute_type="int8")
        except Exception as e:
            logger.error(f"Error loading faster-whisper model: {e}")
            raise e
    return _whisper_model

def get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        try:
            from sentence_transformers import SentenceTransformer
            logger.info(f"Loading embedding model '{settings.EMBEDDING_MODEL}'...")
            _embedding_model = SentenceTransformer(settings.EMBEDDING_MODEL)
        except Exception as e:
            logger.warning(f"Could not load SentenceTransformer ({e}). Using embedding fallback vector.")
            return None
    return _embedding_model

def load_prompt_file(filename: str) -> str:
    """Loads prompt template dynamically from prompts directory."""
    path = Path(settings.PROMPTS_DIR) / filename
    if not path.exists():
        raise FileNotFoundError(f"Prompt file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def load_fallback_response(fallback_key: str) -> Any:
    """Loads fallback response content from fallback_responses.json."""
    path = Path(settings.FALLBACK_RESPONSES_PATH)
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get(fallback_key)
    return None

def call_groq(prompt_content: str, fallback_key: str, as_json: bool = True) -> Any:
    """
    Calls Groq API with Qwen 3.8.
    Wrapped in try/except; if API key is missing, timeout occurs, rate limit hits,
    or GROQ_FORCE_FALLBACK=True, returns fallback content and logs GROQ FALLBACK USED.
    """
    if settings.GROQ_FORCE_FALLBACK or not settings.GROQ_API_KEY or settings.GROQ_API_KEY == "your_groq_api_key_here":
        print("[GROQ FALLBACK USED] Configured for fallback or missing API key.")
        return load_fallback_response(fallback_key)
        
    try:
        from groq import Groq
        client = Groq(api_key=settings.GROQ_API_KEY)
        
        kwargs: Dict[str, Any] = {
            "model": settings.GROQ_MODEL,
            "messages": [
                {"role": "user", "content": prompt_content}
            ],
            "temperature": 0.2,
        }
        if as_json:
            kwargs["response_format"] = {"type": "json_object"}
            
        chat_completion = client.chat.completions.create(**kwargs)
        raw_response = chat_completion.choices[0].message.content
        
        if as_json:
            return json.loads(raw_response)
        return raw_response.strip()
    except Exception as e:
        print(f"[GROQ FALLBACK USED] Groq API call failed ({e}). Reverting to fallback response.")
        return load_fallback_response(fallback_key)

def transcribe_audio_file(audio_path: str) -> str:
    """Transcribes audio using local faster-whisper model without cloud STT."""
    whisper = get_whisper_model()
    segments, info = whisper.transcribe(audio_path, beam_size=1)
    transcript_parts = [segment.text.strip() for segment in segments]
    full_transcript = " ".join(transcript_parts).strip()
    return full_transcript if full_transcript else "No audible speech detected."

def generate_embedding_vector(text: str) -> List[float]:
    """Generates 384-dimensional dense embedding using all-MiniLM-L6-v2 (with fallback)."""
    try:
        model = get_embedding_model()
        if model is not None:
            embedding = model.encode(text)
            return embedding.tolist()
    except Exception as e:
        logger.warning(f"Embedding encoding failed ({e}). Using deterministic fallback vector.")

    # Fallback: Deterministic 384-dimensional vector based on SHA-256 of text
    import hashlib
    h = hashlib.sha256(text.encode("utf-8")).digest()
    vector = []
    for i in range(384):
        val = (h[i % len(h)] + i * 7) % 256
        vector.append(round((val / 127.5) - 1.0, 4))
    return vector

def analyze_heuristic_sentiment(transcript: str) -> Tuple[float, str]:
    """
    Intelligent heuristic classifier for local/offline mode when Groq API key is not set.
    Evaluates student emotional valence and maps to standard schema labels.
    """
    lower = transcript.lower()
    
    positive_words = ["great", "good", "happy", "excited", "fun", "proud", "confident", "relieved", "easy", "loved", "awesome", "enjoyed", "clarity", "understood", "progress", "better", "solved", "success", "wonderful", "amazing"]
    stress_words = ["stressed", "overwhelmed", "anxious", "panic", "behind", "drowning", "too much", "burnout", "pressure", "scared", "nervous"]
    exhaust_words = ["tired", "exhausted", "sleepy", "fatigue", "drained", "no sleep", "all night", "spent"]
    frustrate_words = ["frustrated", "stuck", "annoyed", "confused", "hate", "bug", "error", "failing", "broken", "hard", "difficult", "impossible", "giving up"]
    curious_words = ["wondering", "curious", "interesting", "learned", "explored", "trying", "experiment", "reading", "lecture"]
    calm_words = ["calm", "okay", "fine", "chilling", "quiet", "normal", "steady", "peaceful"]

    pos = sum(1 for w in positive_words if w in lower)
    stress = sum(1 for w in stress_words if w in lower)
    exh = sum(1 for w in exhaust_words if w in lower)
    frust = sum(1 for w in frustrate_words if w in lower)
    cur = sum(1 for w in curious_words if w in lower)
    calm = sum(1 for w in calm_words if w in lower)

    if stress > 0 and stress >= pos:
        return -0.72, "Overwhelmed"
    if exh > 0 and exh >= pos:
        return -0.58, "Exhausted"
    if frust > 0 and frust >= pos:
        return -0.62, "Frustrated"
    if pos > 0:
        if any(w in lower for w in ["confident", "easy", "solved", "success", "understood"]):
            return min(0.90, 0.40 + 0.15 * pos), "Confident"
        if any(w in lower for w in ["relieved", "better"]):
            return min(0.85, 0.35 + 0.15 * pos), "Relieved"
        return min(0.95, 0.50 + 0.15 * pos), "Joyful"
    if cur > 0:
        return 0.35, "Curious"
    if calm > 0:
        return 0.25, "Calm"
        
    return -0.20, "Neutral"

def classify_sentiment(transcript: str) -> Tuple[float, str]:
    """
    Classifies transcript into sentiment_score (-1.0 to 1.0) and emotion_label
    using Groq with prompts/sentiment.txt, falling back to heuristic analysis.
    """
    if settings.GROQ_FORCE_FALLBACK or not settings.GROQ_API_KEY or settings.GROQ_API_KEY == "your_groq_api_key_here":
        return analyze_heuristic_sentiment(transcript)

    prompt_template = load_prompt_file("sentiment.txt")
    prompt = prompt_template.replace("{transcript}", transcript)
    
    result = call_groq(prompt, fallback_key="sentiment_fallback", as_json=True)
    if isinstance(result, dict) and "sentiment_score" in result:
        score = float(result.get("sentiment_score", 0.0))
        # Clamp score between -1.0 and 1.0
        score = max(-1.0, min(1.0, score))
        label = str(result.get("emotion_label", "Neutral"))
        return score, label
        
    return analyze_heuristic_sentiment(transcript)

def process_journal_entry(
    student_id: str,
    transcript: str,
    timestamp_str: str,
    entry_type: str = "voice",
    forced_sentiment: Optional[float] = None,
    forced_emotion: Optional[str] = None
) -> Dict[str, Any]:
    """
    REUSABLE CORE PIPELINE:
    Used identically by both /journal/voice and /seed.
    1. Sentiment & emotion classification (via Groq or calibrated target)
    2. Embedding generation via MiniLM
    3. Storing into journal_entries, emotion_tags, embedding_vectors (PostgreSQL)
    """
    from database import insert_journal_entry, insert_emotion_tag

    if forced_sentiment is not None and forced_emotion is not None:
        sentiment_score = forced_sentiment
        emotion_label = forced_emotion
    else:
        sentiment_score, emotion_label = classify_sentiment(transcript)

    # 2. Embed transcript
    vector = generate_embedding_vector(transcript)

    # 3. Insert into PostgreSQL
    conn = get_connection()
    try:
        ts = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00")) if isinstance(timestamp_str, str) else timestamp_str
        entry_id = insert_journal_entry(conn, student_id, entry_type, transcript, ts)
        insert_emotion_tag(conn, entry_id, sentiment_score, emotion_label, settings.GROQ_MODEL)
    finally:
        conn.close()

    # Save embedding
    save_embedding(entry_id, vector)

    return {
        "entry_id": entry_id,
        "transcript": transcript,
        "sentiment_score": sentiment_score,
        "emotion_label": emotion_label,
        "timestamp": timestamp_str
    }

