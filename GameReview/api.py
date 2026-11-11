
"""
GameScope API: connects the review pipeline and MySQL to the website.

Start it from the GameReview folder:

    python -m uvicorn api:app --reload --port 8000
"""

import json
import os
import time
import auth
import logging
import resend

from urllib.parse import urlencode
from datetime import datetime, timedelta, timezone
from typing import Literal
from collections import defaultdict, deque
from threading import Lock

import requests

from fastapi import (
    FastAPI,
    HTTPException,
    Path,
    Query,
    Request,
    Response,
    BackgroundTasks,
    Depends,
)

from pydantic import BaseModel
from mysql.connector import Error as MySQLError
from fastapi.middleware.cors import CORSMiddleware

import SteamGameReviewer_ as collector
import pipeline

from analysis import (
    MIN_ISSUE_COMPLAINTS,
    TOPIC_PATTERNS,
    MIN_PATCH_REVIEWS,
    PATCH_WINDOW_DAYS,
    build_analysis,
    build_issues,
    build_patch_impact,
    build_review_cards,
    topic_standing,
)


logger = logging.getLogger(__name__)

# Browser session cookie.
SESSION_COOKIE_NAME = "gamescope_session"
SESSION_DURATION_DAYS = auth.SESSION_DURATION_DAYS

# Password reset configuration.
PASSWORD_RESET_RESPONSE = (
    "If an account exists with that email address, "
    "a password reset link will be sent."
)

FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "https://gamescope-five.vercel.app",
).rstrip("/")

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM = os.getenv(
    "RESEND_FROM",
    "GameScope <onboarding@resend.dev>",
)

STEAM_SEARCH_URL = "https://store.steampowered.com/api/storesearch/"
MAX_APP_ID = 4_294_967_295

STEAM_IMAGE_BASE = (
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps"
)

# Steam appdetails cache.
DETAILS_CACHE_SECONDS = 3600
DETAILS_CACHE_MAX = 256

_details_cache = {}
_standing_cache = {}

# Games whose Steam announcements were already looked up since the API
# started, so a game with no announcements isn't re-fetched on every visit.
_updates_checked = set()


# ==========================================
# FastAPI Application
# ==========================================

app = FastAPI(title="GameScope API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://gamescope-five.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# Helpers
# ==========================================

def database_error(error):
    logger.error(
        "Database operation failed: %s",
        type(error).__name__,
    )

    return HTTPException(
        status_code=503,
        detail="The database is temporarily unavailable.",
    )


def get_fallback_capsule(app_id):
    return f"{STEAM_IMAGE_BASE}/{app_id}/capsule_sm_120.jpg"


def get_fallback_header(app_id):
    return f"{STEAM_IMAGE_BASE}/{app_id}/header.jpg"


def fetch_store_details(app_id):
    now = time.time()
    cached = _details_cache.get(app_id)

    if cached and now - cached[0] < DETAILS_CACHE_SECONDS:
        return cached[1]

    game = collector.get_game_details(app_id)

    if len(_details_cache) >= DETAILS_CACHE_MAX:
        _details_cache.clear()

    _details_cache[app_id] = (now, game)

    return game


def fetch_steam_standing(app_id):
    """Steam's overall review rating for a game, cached for an hour."""
    now = time.time()
    cached = _standing_cache.get(app_id)

    if cached and now - cached[0] < DETAILS_CACHE_SECONDS:
        return cached[1]

    response = requests.get(
        collector.STEAM_REVIEWS_URL,
        params={
            "input_json": json.dumps(
                {
                    "appid": app_id,
                    "filter": collector.REVIEWS_FILTER_RECENT,
                    "languages": ["all"],
                    "review_type": collector.REVIEWS_TYPE_ALL,
                    "purchase_type": collector.REVIEWS_PURCHASE_TYPE_ALL,
                    "num_per_page": 1,
                    "cursor": "*",
                }
            )
        },
        timeout=10,
    )
    response.raise_for_status()
    data = collector.parse_steam_json(response, "reviews")
    summary = (data.get("response") or {}).get("query_summary") or {}

    total = summary.get("total_reviews") or 0
    positive = summary.get("total_positive") or 0

    # review_score: 1-4 negative, 5 mixed, 6-9 positive, 0 too few reviews.
    standing = {
        "appId": str(app_id),
        "summary": summary.get("review_score_desc") or None,
        "score": summary.get("review_score") or 0,
        "totalReviews": total,
        "positivePercent": round(100 * positive / total) if total else None,
    }

    if len(_standing_cache) >= DETAILS_CACHE_MAX:
        _standing_cache.clear()

    _standing_cache[app_id] = (now, standing)
    return standing


def reviews_within(reviews, days):
    if days is None:
        return reviews

    cutoff = (
        datetime.now(timezone.utc).replace(tzinfo=None)
        - timedelta(days=days)
    )

    return [
        review
        for review in reviews
        if review["created_at"]
        and review["created_at"] >= cutoff
    ]


def within_days(stored, days):
    if days is None:
        return stored

    recent = reviews_within(stored["reviews"], days)

    if not recent:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No stored reviews are from the last {days} "
                f"{'day' if days == 1 else 'days'}. "
                "Choose a longer review time range in Settings."
            ),
        )

    return {
        **stored,
        "reviews": recent,
    }


def waiting_for_reviews(app_id):
    """
    True when the game isn't released on Steam yet or has no Steam reviews,
    so analyzing it would only waste a crawl. Early Access games are allowed.
    """
    if fetch_store_details(app_id).get("game_coming_soon"):
        return True

    try:
        return fetch_steam_standing(app_id)["totalReviews"] == 0
    except (requests.RequestException, ValueError):
        # The review summary is only a shortcut; the pipeline still checks.
        return False


def load_stored(app_id, days=None):
    try:
        stored = pipeline.load_game(app_id)

    except MySQLError as error:
        raise database_error(error) from error

    if stored is None or not stored["reviews"]:
        raise HTTPException(
            status_code=404,
            detail=f"App ID {app_id} hasn't been analyzed yet.",
        )

    return within_days(stored, days)


# ==========================================
# Role-Based Authorization
# ==========================================

def get_current_account(request: Request):
    """
    Validate the browser session and return
    the authenticated account.
    """

    token = request.cookies.get(SESSION_COOKIE_NAME)

    try:
        account = auth.validate_session(token)

    except MySQLError as error:
        raise database_error(error) from error

    if account is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
        )

    return account


def require_role(required_role):
    """
    Require the authenticated account to have
    a specific role.
    """

    def role_checker(
        account=Depends(get_current_account),
    ):
        roles = account.get("roles", [])

        if required_role not in roles:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to access this resource.",
            )

        return account

    return role_checker


def require_player_or_developer(
    account=Depends(get_current_account),
):
    """
    Allow authenticated players and developers.
    """

    roles = account.get("roles", [])

    if not any(
        role in roles
        for role in ("player", "developer")
    ):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to access this resource.",
        )

    return account


# ==========================================
# Analysis Rate Limiting
# ==========================================

ANALYSIS_RATE_LIMIT = 5
ANALYSIS_RATE_WINDOW = 60

_analysis_requests = defaultdict(deque)
_analysis_lock = Lock()


def check_analysis_rate_limit(client_ip):
    now = time.monotonic()
    cutoff = now - ANALYSIS_RATE_WINDOW

    with _analysis_lock:
        expired_ips = []

        for ip, timestamps in _analysis_requests.items():
            while timestamps and timestamps[0] <= cutoff:
                timestamps.popleft()

            if not timestamps:
                expired_ips.append(ip)

        for ip in expired_ips:
            del _analysis_requests[ip]

        requests_for_ip = _analysis_requests[client_ip]

        if len(requests_for_ip) >= ANALYSIS_RATE_LIMIT:
            return False

        requests_for_ip.append(now)

        return True


# ==========================================
# Password Reset Rate Limiting
# ==========================================

PASSWORD_RESET_RATE_LIMIT = 3
PASSWORD_RESET_RATE_WINDOW = 15 * 60

_password_reset_requests = defaultdict(deque)
_password_reset_lock = Lock()


def check_password_reset_rate_limit(client_ip):
    now = time.monotonic()
    cutoff = now - PASSWORD_RESET_RATE_WINDOW

    with _password_reset_lock:
        requests_for_ip = _password_reset_requests[client_ip]

        while requests_for_ip and requests_for_ip[0] <= cutoff:
            requests_for_ip.popleft()

        if len(requests_for_ip) >= PASSWORD_RESET_RATE_LIMIT:
            return False

        requests_for_ip.append(now)

        return True


# ==========================================
# Resend Email Configuration
# ==========================================

def email_is_configured():
    """Check whether Resend credentials are configured."""
    return bool(
        RESEND_API_KEY
        and RESEND_FROM
    )


def send_password_reset_email(email, token):
    """
    Send a password reset email using Resend.

    The API key is read from environment variables.
    The raw reset token is never logged or returned by the API.
    """

    if not email_is_configured():
        logger.error(
            "Password reset email was not sent: Resend is not configured."
        )
        return

    reset_query = urlencode({"token": token})

    reset_url = (
        f"{FRONTEND_URL}/reset-password?{reset_query}"
    )

    resend.api_key = RESEND_API_KEY

    params = {
        "from": RESEND_FROM,
        "to": [email],
        "subject": "Reset your GameScope password",
        "text": f"""
Hello,

We received a request to reset your GameScope password.

Use the following link to choose a new password:

{reset_url}

This link expires in 15 minutes and can only be used once.

If you did not request a password reset, you can ignore this email.

GameScope Support
""",
        "html": f"""
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
    <h2>Reset your GameScope password</h2>

    <p>Hello,</p>

    <p>
        We received a request to reset your GameScope password.
    </p>

    <p>
        Click the button below to choose a new password:
    </p>

    <p style="margin: 30px 0;">
        <a
            href="{reset_url}"
            style="
                background-color: #7065ee;
                color: white;
                padding: 12px 22px;
                text-decoration: none;
                border-radius: 8px;
                display: inline-block;
            "
        >
            Reset Password
        </a>
    </p>

    <p>
        This link expires in 15 minutes and can only be used once.
    </p>

    <p>
        If you did not request a password reset, you can ignore this email.
    </p>

    <p>GameScope Support</p>
</div>
""",
    }

    try:
        resend.Emails.send(params)

        logger.info(
            "Password reset email submitted to Resend."
        )

    except Exception as error:
        logger.error(
            "Unable to send password reset email through Resend: %s",
            type(error).__name__,
        )


# ==========================================
# Authentication Models
# ==========================================

class SignUpRequest(BaseModel):
    username: str
    email: str
    password: str
    mode: Literal["player", "developer"]


class LoginRequest(BaseModel):
    email: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


# ==========================================
# Authentication Routes
# ==========================================

@app.post("/api/auth/signup", status_code=201)
def signup(request: SignUpRequest):
    try:
        account = auth.register_user(
            username=request.username,
            email=request.email,
            password=request.password,
            selected_mode=request.mode,
        )

        return {
            "message": "Account created successfully.",
            "user": account,
        }

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    except MySQLError as error:
        raise database_error(error) from error


@app.post("/api/auth/login")
def login(request: LoginRequest, response: Response):
    try:
        account = auth.login_user(
            email=request.email,
            password=request.password,
        )

        session = auth.create_session(account["user_id"])

        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=session["token"],
            max_age=SESSION_DURATION_DAYS * 24 * 60 * 60,
            httponly=True,
            secure=True,
            samesite="none",
            path="/",
        )

        return {
            "message": "Login successful.",
            "user": account,
            "expires_at": session["expires_at"],
        }

    except ValueError:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password.",
        )

    except MySQLError as error:
        raise database_error(error) from error


@app.get("/api/auth/me")
def current_user(request: Request):
    token = request.cookies.get(SESSION_COOKIE_NAME)

    try:
        account = auth.validate_session(token)

    except MySQLError as error:
        raise database_error(error) from error

    if account is None:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated.",
        )

    return {"user": account}


@app.post("/api/auth/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE_NAME)

    try:
        auth.revoke_session(token)

    except MySQLError as error:
        raise database_error(error) from error

    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=True,
        samesite="none",
    )

    return {"message": "Logged out successfully."}


# ==========================================
# Account Security
# Active Sessions and Logout All Devices
# ==========================================

@app.get("/api/auth/sessions")
def get_account_sessions(
    request: Request,
    account=Depends(get_current_account),
):
    """
    Return the authenticated user's active sessions.

    Session tokens and token hashes are never exposed.
    """

    token = request.cookies.get(SESSION_COOKIE_NAME)

    try:
        sessions = auth.get_active_sessions(
            user_id=account["user_id"],
            current_token=token,
        )

        return {
            "sessions": sessions,
        }

    except MySQLError as error:
        raise database_error(error) from error


@app.post("/api/auth/logout-all")
def logout_all_devices(
    request: Request,
    response: Response,
    account=Depends(get_current_account),
):
    """
    Revoke every active session belonging to the account,
    including the current browser session.
    """

    try:
        revoked_count = auth.revoke_all_sessions(
            account["user_id"]
        )

    except MySQLError as error:
        raise database_error(error) from error

    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=True,
        samesite="none",
    )

    return {
        "message": "All devices have been logged out.",
        "revoked_sessions": revoked_count,
    }


# ==========================================
# Forgot Password
# ==========================================

@app.post("/api/auth/forgot-password")
def forgot_password(
    request: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    http_request: Request,
):
    client_ip = (
        http_request.client.host
        if http_request.client
        else "unknown"
    )

    if not check_password_reset_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Too many password reset requests. Please try again later.",
            headers={
                "Retry-After": str(PASSWORD_RESET_RATE_WINDOW)
            },
        )

    email = request.email.strip().lower()

    if not email or len(email) > 255:
        return {"message": PASSWORD_RESET_RESPONSE}

    if not email_is_configured():
        logger.error(
            "Forgot-password request received, but Resend is not configured."
        )
        return {"message": PASSWORD_RESET_RESPONSE}

    try:
        reset = auth.create_password_reset_token(email)

        if reset:
            background_tasks.add_task(
                send_password_reset_email,
                email,
                reset["token"],
            )

    except MySQLError as error:
        raise database_error(error) from error

    return {"message": PASSWORD_RESET_RESPONSE}


# ==========================================
# Reset Password
# ==========================================

@app.post("/api/auth/reset-password")
def reset_password(request: ResetPasswordRequest):
    if not request.token or len(request.token) > 256:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired password reset link.",
        )

    if len(request.new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least 8 characters.",
        )

    if len(request.new_password) > 128:
        raise HTTPException(
            status_code=400,
            detail="Password cannot exceed 128 characters.",
        )

    try:
        auth.reset_user_password(
            token=request.token,
            new_password=request.new_password,
        )

        return {
            "message": (
                "Your password has been reset successfully. "
                "Please log in using your new password."
            )
        }

    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired password reset link.",
        )

    except MySQLError as error:
        raise database_error(error) from error


# ==========================================
# Health Check
# ==========================================

@app.get("/api/health")
def health():
    try:
        pipeline.check_database()

        return {
            "status": "ok",
            "database": "connected",
        }

    except MySQLError as error:
        logger.error(
            "Health check database failure: %s: %s",
            type(error).__name__,
            error,
        )

        return {
            "status": "ok",
            "database": "unavailable",
        }


# ==========================================
# Steam Search
# ==========================================

@app.get("/api/search")
def search_games(
    q: str = Query(min_length=1, max_length=100)
):
    try:
        response = requests.get(
            STEAM_SEARCH_URL,
            params={
                "term": q,
                "l": "english",
                "cc": "US",
            },
            timeout=10,
        )

        response.raise_for_status()

    except requests.RequestException as error:
        logger.warning(
            "Steam search request failed: %s",
            type(error).__name__,
        )

        raise HTTPException(
            status_code=502,
            detail="Steam search is temporarily unavailable.",
        ) from error

    items = response.json().get("items", [])

    results = []

    for item in items:
        if item.get("type") != "app":
            continue

        app_id = item.get("id")

        if not app_id:
            continue

        image = (
            item.get("tiny_image")
            or get_fallback_capsule(app_id)
        )

        results.append(
            {
                "name": item.get("name", ""),
                "appId": str(app_id),
                "image": image,
            }
        )

        if len(results) >= 8:
            break

    return results


# ==========================================
# Steam Game Details
# ==========================================

@app.post("/api/games/{app_id}/searches")
def record_game_search(app_id: int = Path(gt=0, le=MAX_APP_ID)):
    """Count a search for a game (picked from search or analyzed by App ID)."""
    # The name comes from Steam, never the browser, so the trending cards
    # only ever show real game titles.
    try:
        game_name = fetch_store_details(app_id)["game_name"] or None
    except (requests.RequestException, ValueError):
        game_name = None

    try:
        searches = pipeline.record_search(app_id, game_name)
    except MySQLError as error:
        raise database_error(error) from error

    return {"appId": str(app_id), "searches": searches}


@app.get("/api/trending")
def trending_games(limit: int = Query(3, ge=1, le=20)):
    """The most-searched games on the site, most first."""
    try:
        rows = pipeline.load_trending(limit)
    except MySQLError as error:
        raise database_error(error) from error

    return [
        {
            "appId": str(row["app_id"]),
            "name": row["game_name"],
            "searches": row["searches"],
        }
        for row in rows
    ]


@app.get("/api/games/{app_id}/standing")
def game_standing(app_id: int = Path(gt=0, le=MAX_APP_ID)):
    """
    Steam's overall review rating for a game, e.g. "Very Positive".
    Works before the game has been analyzed.
    """
    try:
        return fetch_steam_standing(app_id)

    except (requests.RequestException, ValueError) as error:
        logger.warning(
            "Steam review summary failed for app_id=%s: %s",
            app_id,
            type(error).__name__,
        )
        raise HTTPException(
            status_code=502,
            detail="Steam's review summary is temporarily unavailable.",
        ) from error


@app.get("/api/games/{app_id}/details")
def game_details(
    app_id: int = Path(gt=0, le=MAX_APP_ID)
):
    try:
        game = fetch_store_details(app_id)

    except ValueError as error:
        logger.info(
            "Steam game details unavailable for app_id=%s: %s",
            app_id,
            type(error).__name__,
        )

        raise HTTPException(
            status_code=404,
            detail="Game details were not found.",
        ) from error

    except requests.RequestException as error:
        logger.warning(
            "Steam game details request failed for app_id=%s: %s",
            app_id,
            type(error).__name__,
        )

        raise HTTPException(
            status_code=502,
            detail="Steam game details are temporarily unavailable.",
        ) from error

    price = game["game_price"]

    header_image = (
        game.get("game_header_image")
        or get_fallback_header(app_id)
    )

    return {
        "appId": str(app_id),
        "name": game["game_name"],
        "developer": game["game_developer"] or None,
        "publisher": game["game_publisher"] or None,
        "releaseDate": game["game_release_date"] or None,
        "price": float(price) if price else None,
        "shortDescription": game["game_description"] or None,
        "headerImage": header_image,
        "comingSoon": game.get("game_coming_soon", False),
        "earlyAccess": game.get("game_early_access", False),
    }


# ==========================================
# Game Analysis
# Player or Developer
# ==========================================

@app.post(
    "/api/analyze/{app_id}",
    dependencies=[Depends(require_player_or_developer)],
)
def analyze_game(
    request: Request,
    app_id: int = Path(gt=0, le=MAX_APP_ID),
    refresh: bool = False,
    max_reviews: int = Query(500, ge=50, le=5000),
    days: int | None = Query(None, ge=1, le=3650),
):
    client_ip = (
        request.client.host
        if request.client
        else "unknown"
    )

    if not check_analysis_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail=(
                "Too many analysis requests. "
                "Please wait a minute and try again."
            ),
            headers={
                "Retry-After": str(ANALYSIS_RATE_WINDOW)
            },
        )

    try:
        stored = pipeline.load_game(app_id)

        if refresh or stored is None or not stored["reviews"]:
            # Don't crawl Steam for a game that has nothing to review yet.
            if waiting_for_reviews(app_id):
                raise HTTPException(
                    status_code=409,
                    detail="Waiting for this game to be reviewed...",
                )
            pipeline.run_pipeline(app_id, max_reviews)
            stored = pipeline.load_game(app_id)

    except pipeline.GameNotFound as error:
        logger.info(
            "Game not found during analysis for app_id=%s: %s",
            app_id,
            type(error).__name__,
        )

        raise HTTPException(
            status_code=404,
            detail="Game was not found.",
        ) from error

    except (pipeline.PipelineError, ValueError) as error:
        logger.warning(
            "Game analysis failed for app_id=%s: %s",
            app_id,
            type(error).__name__,
        )

        raise HTTPException(
            status_code=422,
            detail="Game analysis could not be completed.",
        ) from error

    except requests.RequestException as error:
        logger.warning(
            "Steam request failed during analysis for app_id=%s: %s",
            app_id,
            type(error).__name__,
        )

        raise HTTPException(
            status_code=502,
            detail="Steam is temporarily unavailable.",
        ) from error

    except MySQLError as error:
        raise database_error(error) from error

    if stored is None or not stored["reviews"]:
        raise HTTPException(
            status_code=404,
            detail="No reviews are currently available for this game.",
        )

    return build_analysis(
        within_days(stored, days)
    )


# ==========================================
# Stored Game Analysis
# Player or Developer
# ==========================================

@app.get(
    "/api/games/{app_id}/analysis",
    dependencies=[Depends(require_player_or_developer)],
)
def get_analysis(
    app_id: int = Path(gt=0, le=MAX_APP_ID),
    days: int | None = Query(None, ge=1, le=3650),
):
    return build_analysis(
        load_stored(app_id, days)
    )


# ==========================================
# Game Issues
# Player or Developer
# ==========================================

@app.get(
    "/api/games/{app_id}/issues",
    dependencies=[Depends(require_player_or_developer)],
)
def get_issues(
    app_id: int = Path(gt=0, le=MAX_APP_ID),
    min_mentions: int = Query(
        MIN_ISSUE_COMPLAINTS,
        ge=1,
        le=5000,
    ),
    days: int | None = Query(None, ge=1, le=3650),
):
    stored = load_stored(app_id, days)

    report = build_issues(
        stored,
        min_mentions,
    )

    try:
        statuses = pipeline.load_issue_statuses(
            stored["game"]["game_id"]
        )

    except MySQLError as error:
        raise database_error(error) from error

    for issue in report["issues"]:
        issue["status"] = statuses.get(
            issue["name"],
            "Detected",
        )

    return report


# ==========================================
# Issue Status Update
# Developer Only
# ==========================================

class IssueStatusUpdate(BaseModel):
    status: Literal[
        "Detected",
        "Investigating",
        "In Progress",
        "Resolved",
    ]


@app.patch(
    "/api/games/{app_id}/issues/{topic}/status",
    dependencies=[Depends(require_role("developer"))],
)
def update_issue_status(
    update: IssueStatusUpdate,
    app_id: int = Path(gt=0, le=MAX_APP_ID),
    topic: str = Path(max_length=50),
):
    if topic not in TOPIC_PATTERNS:
        raise HTTPException(
            status_code=404,
            detail="Unknown issue topic.",
        )

    try:
        game_id = pipeline.find_game_id(app_id)

        if game_id is None:
            raise HTTPException(
                status_code=404,
                detail=f"App ID {app_id} hasn't been analyzed yet.",
            )

        pipeline.save_issue_status(
            game_id,
            topic,
            update.status,
        )

    except MySQLError as error:
        raise database_error(error) from error

    return {
        "topic": topic,
        "status": update.status,
    }


# ==========================================
# Patch Impact
# ==========================================

@app.get("/api/games/{app_id}/patches")
def get_patch_impact(
    app_id: int = Path(gt=0, le=MAX_APP_ID),
    window_days: int = Query(PATCH_WINDOW_DAYS, ge=1, le=90),
    min_reviews: int = Query(MIN_PATCH_REVIEWS, ge=3, le=1000),
    include_announcements: bool = False,
    refresh: bool = False,
    days: int | None = Query(None, ge=1, le=3650),
):
    """
    Patch Impact: sentiment and complaints in the reviews written just
    before each developer update compared with just after it.
    """
    stored = load_stored(app_id, days)
    game_id = stored["game"]["game_id"]

    try:
        updates = pipeline.load_updates(game_id)

        # Games analyzed before Patch Impact existed have no stored updates.
        if refresh or (not updates and app_id not in _updates_checked):
            _updates_checked.add(app_id)
            try:
                pipeline.refresh_updates(app_id, game_id)
            except requests.RequestException as error:
                logger.warning(
                    "Steam news request failed for app_id=%s: %s",
                    app_id,
                    type(error).__name__,
                )
            updates = pipeline.load_updates(game_id)

        statuses = pipeline.load_issue_statuses(game_id)

    except MySQLError as error:
        raise database_error(error) from error

    return build_patch_impact(
        stored,
        updates,
        window_days=window_days,
        min_reviews=min_reviews,
        include_announcements=include_announcements,
        statuses=statuses,
    )


# ==========================================
# Topic Search
# Public Topic List
# ==========================================

@app.get("/api/topics")
def list_topics():
    return list(TOPIC_PATTERNS)


# ==========================================
# Topic Game Search
# Developer Only
# ==========================================

@app.get(
    "/api/topics/{topic}/games",
    dependencies=[Depends(require_role("developer"))],
)
def search_topic(
    topic: str = Path(max_length=50),
    min_mentions: int = Query(5, ge=1, le=5000),
    days: int | None = Query(None, ge=1, le=3650),
):
    if topic not in TOPIC_PATTERNS:
        raise HTTPException(
            status_code=404,
            detail="Unknown issue topic.",
        )

    results = []

    try:
        for game in pipeline.list_games():
            stored = pipeline.load_game(
                game["app_id"]
            )

            if stored is None:
                continue

            reviews = reviews_within(
                stored["reviews"],
                days,
            )

            if not reviews:
                continue

            standing = topic_standing(
                {
                    **stored,
                    "reviews": reviews,
                },
                topic,
            )

            if standing["mentions"] < min_mentions:
                continue

            statuses = pipeline.load_issue_statuses(
                stored["game"]["game_id"]
            )

            results.append(
                {
                    "appId": str(game["app_id"]),
                    "name": game["game_name"],
                    "status": statuses.get(topic),
                    **standing,
                }
            )

    except MySQLError as error:
        raise database_error(error) from error

    return {
        "topic": topic,
        "minMentions": min_mentions,
        "games": results,
    }


# ==========================================
# Reviews
# Player or Developer
# ==========================================

@app.get(
    "/api/games/{app_id}/reviews",
    dependencies=[Depends(require_player_or_developer)],
)
def get_review_cards(
    app_id: int = Path(gt=0, le=MAX_APP_ID),
    limit: int = Query(300, ge=1, le=2000),
    days: int | None = Query(None, ge=1, le=3650),
):
    return build_review_cards(
        load_stored(app_id, days)
    )[:limit]
