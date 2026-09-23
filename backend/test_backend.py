"""
Backend integration tests.

Auth model (Phase 0): every protected route derives identity from a verified
Supabase JWT via deps.verify_supabase_token / deps.current_user. Tests override
those dependencies with a synthetic institutional session instead of disabling
auth — so the tests exercise the same identity flow production uses.

NOTE: FastAPI dependency_overrides are app-global, so the unauthenticated
rejection check MUST run BEFORE any overrides are installed.

Run: cd backend && python -m pytest test_backend.py -v
"""

import math
import os
import struct
import uuid
import wave

from fastapi.testclient import TestClient

from config import settings
from database import ensure_local_user, init_db
from deps import current_user, verify_local_jwt
from main import app

TEST_SUB = "11111111-1111-4111-8111-111111111111"  # 36-char UUID format
TEST_EMAIL = "test.student@nmamit.in"
TEST_NAME = "Test Student"


def _fake_token_payload():
    return {
        "sub": TEST_SUB,
        "email": TEST_EMAIL,
        "role": "authenticated",
        "aud": "authenticated",
    }


def _fake_current_user():
    return ensure_local_user(
        user_id=TEST_SUB, email=TEST_EMAIL, name=TEST_NAME, avatar_url=None
    )


def generate_sample_wav(filepath: str, duration_sec: float = 1.0):
    """Generates a small valid WAV file for testing /journal/voice."""
    sample_rate = 16000
    n_samples = int(sample_rate * duration_sec)
    with wave.open(filepath, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        frames = bytearray()
        for i in range(n_samples):
            val = int(5000 * math.sin(2 * math.pi * 440 * i / sample_rate))
            frames.extend(struct.pack("<h", val))
        wav_file.writeframes(frames)


def test_full_pipeline():
    init_db()

    # ------------------------------------------------------------------
    # 1. Protected route rejects anonymous callers (overrides NOT applied)
    # ------------------------------------------------------------------
    with TestClient(app) as anon_client:
        res = anon_client.get("/journal")
        assert res.status_code in (401, 403), (
            f"Unauthenticated request was NOT rejected (got {res.status_code})"
        )
        print(f"[PASS] 1. Unauthenticated GET /journal rejected with {res.status_code}")

    # ------------------------------------------------------------------
    # Authenticated flow: install the synthetic institutional session
    # ------------------------------------------------------------------
    app.dependency_overrides[verify_local_jwt] = _fake_token_payload
    app.dependency_overrides[current_user] = _fake_current_user

    try:
        with TestClient(app) as client:
            # 2. Health check (unauthenticated route, leaks nothing)
            res = client.get("/")
            assert res.status_code == 200, f"Health check failed: {res.text}"
            assert res.json()["status"] == "healthy"
            print("[PASS] 2. GET / health check passed:", res.json())

            # 3. Text journal under the authenticated identity (heuristic sentiment:
            #    no GROQ_API_KEY in test env -> deterministic 'Overwhelmed' -0.72)
            res = client.post("/journal/text", json={"text": "I am overwhelmed and stressed about exams"})
            assert res.status_code == 200, f"Text journal failed: {res.text}"
            assert res.json()["emotion_label"]
            print(f"[PASS] 3. POST /journal/text passed: {res.json()['emotion_label']}")

            # 4. GET /journal returns the caller's entries only (no student_id param)
            res = client.get("/journal")
            assert res.status_code == 200, f"Journal fetch failed: {res.text}"
            entries = res.json()
            assert isinstance(entries, list) and len(entries) >= 1
            print(f"[PASS] 4. GET /journal passed: {len(entries)} entries for the session identity")

            # 5. Weekly Rewind for the authenticated identity
            res = client.get("/rewind")
            assert res.status_code == 200, f"Rewind failed: {res.text}"
            rewind_data = res.json()
            assert "week_title" in rewind_data and "recommended_topic" in rewind_data
            print(f"[PASS] 5. GET /rewind passed: '{rewind_data['week_title']}'")

            # 6. Distress check — negative seeded sentiment must trigger the alert
            res = client.post("/distress/check")
            assert res.status_code == 200, f"Distress check failed: {res.text}"
            distress_data = res.json()
            assert distress_data["alert_triggered"] is True, f"Expected alert, got: {distress_data}"
            assert os.path.exists("alerts.log") or os.path.exists("backend/alerts.log") or os.path.exists(settings.ALERTS_LOG_PATH), "alerts.log was not created!"
            print(f"[PASS] 6. POST /distress/check passed: alert fired, avg={distress_data['avg_sentiment']}")

            # 7. Voice journal with a real WAV
            sample_wav = "sample_test.wav"
            generate_sample_wav(sample_wav, duration_sec=1.5)
            try:
                with open(sample_wav, "rb") as f:
                    res = client.post(
                        "/journal/voice",
                        files={"file": ("test.wav", f, "audio/wav")},
                    )
                assert res.status_code == 200, f"Voice upload failed: {res.text}"
                voice_data = res.json()
                assert "emotion_label" in voice_data and "sentiment_score" in voice_data
                print(f"[PASS] 7. POST /journal/voice passed: {voice_data['emotion_label']}")
            finally:
                if os.path.exists(sample_wav):
                    os.remove(sample_wav)

            # 8. Curated resources lookup (public route)
            res = client.get("/resources/Dynamic Programming")
            assert res.status_code == 200, f"Resources failed: {res.text}"
            assert "youtube_url" in res.json()
            print(f"[PASS] 8. GET /resources passed: {res.json()['title']}")

        print("\nALL BACKEND ENDPOINT INTEGRATION TESTS PASSED.")
    finally:
        app.dependency_overrides.clear()


if __name__ == "__main__":
    test_full_pipeline()
