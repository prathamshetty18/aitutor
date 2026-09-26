"""
auth.py — Direct Google OAuth 2.0 + backend-issued JWT sessions.

Flow:
  1. GET /api/auth/google          → redirect browser to Google consent
  2. GET /api/auth/google/callback → exchange code, fetch user info, upsert DB,
                                     issue HS256 JWT in HttpOnly cookie, redirect
  3. GET /api/auth/me              → verify JWT, return user profile
  4. POST /api/auth/logout         → clear cookie
  5. POST /api/auth/onboarding     → save SWOT / goals (authenticated)
"""

import json
import logging
import urllib.parse
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import httpx
import jwt as pyjwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from config import settings
from deps import verify_local_jwt
from database import (
    get_connection,
    get_user_by_id,
    ensure_local_user,
    update_user_onboarding,
    update_user_last_login,
)

logger = logging.getLogger("ai_tutor.auth")
router = APIRouter(prefix="/api/auth", tags=["Authentication"])

SESSION_COOKIE = "session_token"
TOKEN_EXPIRE_HOURS = 8

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

ALLOWED_DOMAINS = [d.strip().lower() for d in settings.ALLOWED_EMAIL_DOMAINS.split(",") if d.strip()]


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class UserProfile(BaseModel):
    id: str
    name: str
    email: str
    role: str
    collegeId: str
    department: Optional[str] = None
    avatarUrl: Optional[str] = None
    onboardingCompleted: bool = False
    swot: Optional[Dict[str, Any]] = None
    goals: Optional[str] = None
    goalTags: Optional[list] = None


class OnboardingPayload(BaseModel):
    swot: Optional[Dict[str, Any]] = None
    goals: Optional[str] = None
    goal_tags: Optional[list] = None
    completed: Optional[bool] = True


class AuthResponse(BaseModel):
    status: str
    user: UserProfile


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mint_jwt(user_id: str, email: str, name: str, picture: Optional[str]) -> str:
    """Issues a short-lived HS256 JWT containing the user's identity claims."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "name": name,
        "picture": picture,
        "iat": now,
        "exp": now + timedelta(hours=TOKEN_EXPIRE_HOURS),
    }
    return pyjwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")


def _set_session_cookie(response: Response, token: str) -> None:
    is_prod = settings.ENVIRONMENT.lower() == "production"
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        samesite="none" if is_prod else "lax",
        secure=is_prod,
        max_age=TOKEN_EXPIRE_HOURS * 3600,
        path="/",
    )


def _user_to_profile(user: dict) -> UserProfile:
    swot = user.get("swot")
    if isinstance(swot, str):
        try:
            swot = json.loads(swot)
        except Exception:
            swot = {}

    goal_tags = user.get("goal_tags")
    if isinstance(goal_tags, str):
        try:
            goal_tags = json.loads(goal_tags)
        except Exception:
            goal_tags = []

    return UserProfile(
        id=user["id"],
        name=user["name"],
        email=user["email"],
        role=user["role"],
        collegeId=user.get("college_id") or user["id"],
        department=user.get("department"),
        avatarUrl=user.get("avatar_url"),
        onboardingCompleted=bool(user.get("onboarding_completed")),
        swot=swot or {},
        goals=user.get("goals") or "",
        goalTags=goal_tags or [],
    )


# ---------------------------------------------------------------------------
# Route 1: Start Google OAuth
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Helpers for Dynamic Deployment Origins & Callbacks
# ---------------------------------------------------------------------------

def _get_frontend_origin(request: Request) -> str:
    query_origin = request.query_params.get("origin") or request.query_params.get("state")
    if query_origin and query_origin.startswith("http"):
        return query_origin.rstrip("/")

    referer = request.headers.get("referer")
    if referer and referer.startswith("http"):
        parsed = urllib.parse.urlparse(referer)
        return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")

    origins = [o.strip() for o in settings.FRONTEND_ORIGIN.split(",") if o.strip()]
    if settings.ENVIRONMENT.lower() == "production":
        for o in origins:
            if "localhost" not in o and "127.0.0.1" not in o:
                return o.rstrip("/")
    return origins[0].rstrip("/") if origins else "http://localhost:3000"


def _get_callback_url(request: Request) -> str:
    configured = settings.GOOGLE_CALLBACK_URL.strip()
    if "localhost" in configured or "127.0.0.1" in configured or not configured:
        host = request.headers.get("x-forwarded-host") or request.headers.get("host")
        scheme = request.headers.get("x-forwarded-proto") or ("https" if settings.ENVIRONMENT.lower() == "production" else "http")
        if host:
            return f"{scheme}://{host}/api/auth/google/callback"
    return configured


# ---------------------------------------------------------------------------
# Route 1: Start Google OAuth
# ---------------------------------------------------------------------------

@router.get("/google")
def google_login(request: Request, dev: bool = False):
    """Redirects the browser to Google OAuth consent screen, or creates local dev session if unconfigured/dev mode."""
    origin = _get_frontend_origin(request)
    callback_url = _get_callback_url(request)

    if not settings.GOOGLE_CLIENT_ID or dev:
        logger.warning("[auth/google] GOOGLE_CLIENT_ID missing or dev mode requested — minting local dev session.")
        dev_id = "11111111-1111-4111-8111-111111111111"
        dev_email = "student@nmamit.in"
        dev_name = "Student User"
        user = ensure_local_user(
            user_id=dev_id,
            email=dev_email,
            name=dev_name,
            avatar_url=None,
            role="student",
            google_id=dev_id,
        )
        is_onboarded = bool(user.get("onboarding_completed"))
        token = _mint_jwt(dev_id, dev_email, dev_name, None)
        redirect_url = f"{origin}/auth/callback?token={token}&onboarded={'true' if is_onboarded else 'false'}"
        response = RedirectResponse(url=redirect_url)
        _set_session_cookie(response, token)
        response.set_cookie(
            key="onboarding_completed",
            value="true" if is_onboarded else "false",
            httponly=False,
            samesite="none" if settings.ENVIRONMENT.lower() == "production" else "lax",
            secure=settings.ENVIRONMENT.lower() == "production",
            max_age=TOKEN_EXPIRE_HOURS * 3600,
            path="/",
        )
        return response

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": callback_url,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
        "state": origin,
    }
    url = f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}"
    return RedirectResponse(url=url)


# ---------------------------------------------------------------------------
# Route 2: Google OAuth Callback
# ---------------------------------------------------------------------------

@router.get("/google/callback")
async def google_callback(request: Request):
    """
    Exchanges the authorization code for user info, upserts user in PostgreSQL,
    issues our own HS256 JWT in an HttpOnly cookie, and redirects to the frontend.
    """
    origin = _get_frontend_origin(request)
    callback_url = _get_callback_url(request)

    code = request.query_params.get("code")
    error = request.query_params.get("error")

    if error or not code:
        logger.warning(f"[auth/google/callback] OAuth error: {error}")
        return RedirectResponse(url=f"{origin}/?error=oauth_denied")

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        try:
            token_resp = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "redirect_uri": callback_url,
                    "grant_type": "authorization_code",
                },
            )
            token_resp.raise_for_status()
            tokens = token_resp.json()
        except Exception as e:
            logger.error(f"[auth/google/callback] Token exchange failed: {e}")
            return RedirectResponse(url=f"{origin}/?error=token_exchange_failed")

        # Fetch Google user info
        try:
            info_resp = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {tokens['access_token']}"},
            )
            info_resp.raise_for_status()
            google_user = info_resp.json()
        except Exception as e:
            logger.error(f"[auth/google/callback] User info fetch failed: {e}")
            return RedirectResponse(url=f"{origin}/?error=userinfo_failed")

    email = (google_user.get("email") or "").lower().strip()
    domain = email.split("@")[1] if "@" in email else ""

    # Institutional domain check
    if ALLOWED_DOMAINS and domain not in ALLOWED_DOMAINS:
        logger.warning(f"[auth/google/callback] Rejected domain: {domain}")
        return RedirectResponse(url=f"{origin}/?error=domain_not_allowed")

    google_id = google_user.get("sub") or google_user.get("id")
    name = google_user.get("name") or email.split("@")[0]
    picture = google_user.get("picture")

    # Upsert user in local PostgreSQL
    user = ensure_local_user(
        user_id=google_id,
        email=email,
        name=name,
        avatar_url=picture,
        role="student",
        google_id=google_id,
    )

    is_onboarded = bool(user.get("onboarding_completed"))

    # Issue our own JWT
    token = _mint_jwt(google_id, email, name, picture)

    # Build redirect response with the session cookie
    redirect_url = f"{origin}/auth/callback?token={token}&onboarded={'true' if is_onboarded else 'false'}"
    response = RedirectResponse(url=redirect_url)
    _set_session_cookie(response, token)
    response.set_cookie(
        key="onboarding_completed",
        value="true" if is_onboarded else "false",
        httponly=False,
        samesite="none" if settings.ENVIRONMENT.lower() == "production" else "lax",
        secure=settings.ENVIRONMENT.lower() == "production",
        max_age=TOKEN_EXPIRE_HOURS * 3600,
        path="/",
    )

    logger.info(f"[auth/google/callback] Logged in: {email}, onboarded={is_onboarded}")
    return response


# ---------------------------------------------------------------------------
# Route 3: GET /api/auth/me
# ---------------------------------------------------------------------------

@router.get("/me", response_model=AuthResponse)
def get_current_session(payload: Dict[str, Any] = Depends(verify_local_jwt)):
    """Returns the verified user's profile from PostgreSQL."""
    user_id = str(payload["sub"])
    conn = get_connection()
    try:
        user = get_user_by_id(conn, user_id)
        if not user:
            # Auto-provision on first call (edge case)
            email = payload.get("email", "")
            name = payload.get("name", email.split("@")[0])
            user = ensure_local_user(
                user_id=user_id,
                email=email,
                name=name,
                avatar_url=payload.get("picture"),
                google_id=user_id,
            )
        update_user_last_login(conn, user_id)
    finally:
        conn.close()

    return AuthResponse(status="authenticated", user=_user_to_profile(user))


# ---------------------------------------------------------------------------
# Route 4: POST /api/auth/logout
# ---------------------------------------------------------------------------

@router.post("/logout")
def logout():
    """Clears the session cookie."""
    response = Response(status_code=200, content='{"status":"logged_out"}', media_type="application/json")
    response.delete_cookie(key=SESSION_COOKIE, path="/")
    response.delete_cookie(key="onboarding_completed", path="/")
    return response


# ---------------------------------------------------------------------------
# Route 5: POST /api/auth/onboarding
# ---------------------------------------------------------------------------

@router.post("/onboarding")
def save_onboarding(
    payload: OnboardingPayload,
    token_payload: Dict[str, Any] = Depends(verify_local_jwt),
):
    """Persists SWOT / goals to PostgreSQL, scoped to the verified caller."""
    user_id = str(token_payload["sub"])
    conn = get_connection()
    try:
        update_user_onboarding(
            conn=conn,
            user_id=user_id,
            swot=payload.swot,
            goals=payload.goals,
            goal_tags=payload.goal_tags,
            completed=payload.completed,
        )
    finally:
        conn.close()
    return {"status": "success"}
