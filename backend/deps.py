"""
deps.py — FastAPI auth dependency using backend-issued HS256 JWTs.

Supabase is gone. The backend now:
  1. Handles Google OAuth directly (auth.py /api/auth/google/callback)
  2. Issues its own HS256 JWT signed with JWT_SECRET_KEY
  3. Verifies those JWTs here on every protected request

Token delivery: HttpOnly `session_token` cookie (set by callback) OR
                Authorization: Bearer header (for API clients / curl).
"""

import logging
from typing import Any, Dict, Optional

import jwt as pyjwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import settings

logger = logging.getLogger("ai_tutor.deps")

_bearer = HTTPBearer(auto_error=False)


def verify_local_jwt(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Dict[str, Any]:
    """
    Verifies the backend-issued HS256 JWT and returns its claims.
    Token sources (priority order): Authorization header → HttpOnly cookie.
    """
    token: Optional[str] = None
    if creds and creds.credentials:
        token = creds.credentials
    if not token:
        token = request.cookies.get("session_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in.",
        )

    try:
        payload = pyjwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=["HS256"],
            options={"require": ["exp", "sub"]},
        )
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please sign in again.",
        )
    except pyjwt.InvalidTokenError as err:
        logger.warning(f"JWT verification failed: {err}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token. Please sign in again.",
        )

    email = (payload.get("email") or "").strip().lower()
    if settings.REQUIRE_INSTITUTIONAL_DOMAIN and email:
        allowed = [d.strip().lower() for d in settings.ALLOWED_EMAIL_DOMAINS.split(",") if d.strip()]
        if not any(email.endswith(d) for d in allowed):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access restricted to institutional accounts ({settings.ALLOWED_EMAIL_DOMAINS}).",
            )

    return payload


# Backwards compatibility alias
verify_supabase_token = verify_local_jwt


def current_student_id(payload: Dict[str, Any] = Depends(verify_local_jwt)) -> str:
    """Returns the verified user ID (Google sub) from the JWT."""
    return str(payload["sub"])


def current_user(payload: Dict[str, Any] = Depends(verify_local_jwt)) -> Dict[str, Any]:
    """
    Returns the verified user dict from PostgreSQL.
    Creates the user row on first sight (idempotent via ensure_local_user).
    """
    from database import ensure_local_user

    user_id = str(payload["sub"])
    email = (payload.get("email") or "").strip().lower()
    name = payload.get("name") or email.split("@")[0]
    avatar = payload.get("picture") or payload.get("avatar_url")
    return ensure_local_user(
        user_id=user_id,
        email=email,
        name=name,
        avatar_url=avatar,
        google_id=user_id,
    )
