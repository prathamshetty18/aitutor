"""
diagnose_db.py — empirical Postgres/IO health check (safe to run any time).

Verifies, without printing any secret value:
  1. Which config vars are set/missing (values hidden)
  2. PostgreSQL: reachable, schema applied, row counts, full read/write roundtrip
  3. JWT session roundtrip: mint → verify (the exact auth path of every route)
  4. Groq reachability (optional — chat degrades gracefully without it)

Run:  cd backend && .venv/bin/python diagnose_db.py
"""

import sys
from datetime import datetime, timedelta, timezone

PASS, FAIL, WARN = "[PASS]", "[FAIL]", "[WARN]"
results: list[tuple[str, str, str]] = []


def record(status: str, label: str, note: str = "") -> None:
    results.append((status, label, note))
    print(f"{status}  {label}" + (f"\n         -> {note}" if note else ""))


print("=" * 72)
print("1) ENV WIRING (values hidden)")
print("=" * 72)

from config import settings  # noqa: E402  (loads .env, runs boot validation)

checks = [
    ("DATABASE_URL", settings.DATABASE_URL, lambda v: v.split("@")[-1] if "@" in v else "set"),
    ("JWT_SECRET_KEY", settings.JWT_SECRET_KEY, lambda v: f"set (len={len(v)})" if len(v) >= 32 else f"TOO SHORT ({len(v)}) — auth insecure"),
    ("GOOGLE_CLIENT_ID", settings.GOOGLE_CLIENT_ID, lambda v: f"set ({v[:8]}...)" if v else "MISSING — Google login will not work"),
    ("GOOGLE_CLIENT_SECRET", settings.GOOGLE_CLIENT_SECRET, lambda v: "set" if v else "MISSING — Google login will not work"),
    ("GROQ_API_KEY", settings.GROQ_API_KEY, lambda v: f"set (len={len(v)})" if v else "MISSING — chat falls back to canned replies"),
    ("FRONTEND_ORIGIN", settings.FRONTEND_ORIGIN, lambda v: v),
]
for name, val, describe in checks:
    if not val:
        record(FAIL, f"{name} is set", "MISSING")
    else:
        note = describe(val)
        record(FAIL if "MISSING" in note or "TOO SHORT" in note else PASS, f"{name} is set", note)

print()
print("=" * 72)
print("2) DATABASE LAYER (PostgreSQL / SQLite fallback)")
print("=" * 72)

from database import get_connection, init_db  # noqa: E402

try:
    init_db()
    conn = get_connection()
    cur = conn.cursor()

    if getattr(conn, "conn", None) is not None:
        # SQLite
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY 1")
        tables = [r["name"] for r in cur.fetchall()]
        db_type = "SQLite"
    else:
        # Postgres
        cur.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1")
        tables = [r["tablename"] for r in cur.fetchall()]
        db_type = "PostgreSQL"

    record(PASS, f"{db_type} reachable — {len(tables)} tables", ", ".join(tables) or "NO TABLES")

    expected = {"users", "students", "journal_entries", "emotion_tags", "embedding_vectors",
                "mini_json", "weekly_rewind_cards", "distress_alerts", "roadmaps", "daily_goals", "resource_mappings"}
    missing = expected - set(tables)
    if missing:
        record(FAIL, "Schema complete", f"missing tables: {sorted(missing)}")
    else:
        record(PASS, "Schema complete", f"all 11 core tables present in {db_type}")

    # Write roundtrip probe
    cur.execute("CREATE TABLE IF NOT EXISTS _diag_probe (id TEXT PRIMARY KEY)")
    cur.execute("INSERT INTO _diag_probe (id) VALUES ('probe') ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id")
    conn.commit()
    cur.execute("SELECT id FROM _diag_probe WHERE id = 'probe'")
    got = cur.fetchone()
    cur.execute("DELETE FROM _diag_probe")
    conn.commit()
    cur.execute("DROP TABLE IF EXISTS _diag_probe")
    conn.commit()
    record(PASS if got else FAIL, f"{db_type} WRITE roundtrip", "insert->select->delete->drop OK" if got else "write vanished?!")

    conn.close()
except Exception as e:
    record(FAIL, "Database connection", f"{e}".strip()[:300])
    sys.exit(1)

print()
print("=" * 72)
print("3) JWT SESSION ROUNDTRIP (the auth path of every protected route)")
print("=" * 72)

import jwt as pyjwt  # noqa: E402

try:
    now = datetime.now(timezone.utc)
    probe = {
        "sub": "diagnostic-probe-user",
        "email": "probe@nmamit.in",
        "name": "DB Probe",
        "iat": now,
        "exp": now + timedelta(hours=1),
    }
    token = pyjwt.encode(probe, settings.JWT_SECRET_KEY, algorithm="HS256")
    decoded = pyjwt.decode(
        token,
        settings.JWT_SECRET_KEY,
        algorithms=["HS256"],
        options={"require": ["exp", "sub"]},
    )
    record(PASS if decoded["sub"] == probe["sub"] else FAIL, "JWT mint->verify roundtrip",
           f"HS256 with JWT_SECRET_KEY (len={len(settings.JWT_SECRET_KEY)})")
except Exception as e:
    record(FAIL, "JWT mint->verify roundtrip", str(e)[:200])

print()
print("=" * 72)
print("4) GROQ REACHABILITY (optional - chat degrades gracefully)")
print("=" * 72)

if not settings.GROQ_API_KEY:
    record(WARN, "GROQ_API_KEY", "not set - chat will use canned fallback responses")
else:
    import httpx  # noqa: E402

    try:
        r = httpx.get(
            "https://api.groq.com/openai/v1/models",
            headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
            timeout=10,
        )
        if r.status_code == 200:
            models = r.json().get("data", [])
            record(PASS, "Groq API reachable", f"{len(models)} models available")
            configured = {m["id"] for m in models}
            if settings.GROQ_MODEL not in configured:
                record(WARN, "GROQ_MODEL check", f"'{settings.GROQ_MODEL}' not in your model list - chat will 404; pick one from: {sorted(m for m in configured if 'qwen' in m)[:3]}...")
        else:
            record(FAIL, "Groq API", f"HTTP {r.status_code} - {r.text[:120]}")
    except Exception as e:
        record(FAIL, "Groq API", str(e)[:200])

print()
print("=" * 72)
fails = [r for r in results if r[0] == FAIL]
print(f"RESULT: {len(results) - len(fails)}/{len(results)} checks passed" + (f" - {len(fails)} FAILURE(S)" if fails else " - all green"))
print("=" * 72)
sys.exit(1 if fails else 0)
