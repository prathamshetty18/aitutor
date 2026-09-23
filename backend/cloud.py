"""
cloud.py — No-op stub. Supabase has been removed.

All sync functions return False immediately. The local PostgreSQL database
is the sole store — no cloud sync layer needed.
"""

import logging
from typing import Any, Dict

logger = logging.getLogger("ai_tutor.cloud")


def get_supabase_admin():
    return None


def sync_minijson(student_id: str, date_key: str, summary_stats: Dict[str, Any]) -> bool:
    return False


def sync_rewind_card(student_id: str, week_range: str, generated_content: Dict[str, Any], visual_config: Dict[str, Any]) -> bool:
    return False


def sync_distress_alert(student_id: str, trigger_reason: str, pattern_window: int, sent_to: str, sent_at: str) -> bool:
    return False


def sync_user_row(user_row: Dict[str, Any]) -> bool:
    return False


def sync_user_update(user_id: str, update_dict: Dict[str, Any]) -> bool:
    return False
