"""
GameScope API: connects the review pipeline and MySQL to the website.
Start it from the GameReview folder:
    python -m uvicorn api:app --reload --port 8000
"""
import re
import json
import os
from dotenv import load_dotenv

load_dotenv(
    dotenv_path=os.path.join(os.path.dirname(__file__), ".env")
)

import time
import auth
import logging
import resend
from urllib.parse import urlencode
from datetime import datetime, timedelta, timezone
from typing import Literal
from collections import defaultdict, deque
from threading import Lock
from fastapi.responses import RedirectResponse
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
from pydantic import BaseModel, Field
from mysql.connector import Error as MySQLError
from fastapi.middleware.cors import CORSMiddleware
import SteamGameReviewer_ as collector
import pipeline
import csv_to_mysql_ as importer
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




# ==========================================
# Configuration
# ==========================================
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
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
RESEND_FROM = os.getenv(
    "RESEND_FROM",
    "GameScope <onboarding@resend.dev>",
)
# Steam search and game images.
STEAM_SEARCH_URL = "https://store.steampowered.com/api/storesearch/"
MAX_APP_ID = 4_294_967_295
STEAM_IMAGE_BASE = (
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps"
)

# Steam OpenID account linking.
STEAM_OPENID_URL = "https://steamcommunity.com/openid/login"
STEAM_OPENID_RETURN_URL = os.getenv(
    "STEAM_OPENID_RETURN_URL",
    "http://localhost:8000/api/auth/steam/callback",
)
STEAM_OPENID_REALM = os.getenv(
    "STEAM_OPENID_REALM",
    "http://localhost:8000/",
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
# Environment Configuration
# ==========================================
STEAM_EXTENSION_ID = os.getenv(
    "STEAM_EXTENSION_ID",
    "",
).strip()
# ==========================================
# FastAPI Application
# ==========================================
app = FastAPI(title="GameScope API")
@app.get("/api/config")
def get_public_config():
    return {
        "steamExtensionId": STEAM_EXTENSION_ID,
    }

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
        logger.exception(
            "Unable to send password reset email through Resend."
        )
# ==========================================
# Authentication Models
# ==========================================
class SignUpRequest(BaseModel):
    username: str
    email: str
    password: str
    mode: Literal["player", "developer"]

    organization_name: str | None = Field(
        default=None,
        min_length=2,
        max_length=255,
    )

    organization_email: str | None = Field(
        default=None,
        min_length=5,
        max_length=255,
    )

class LoginRequest(BaseModel):
    email: str
    password: str
class ForgotPasswordRequest(BaseModel):
    email: str
class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class SteamLibraryGameImport(BaseModel):
    appId: str = Field(min_length=1, max_length=10)
    name: str = Field(min_length=1, max_length=255)
    playtimeMinutes: int = Field(default=0, ge=0)
    lastPlayed: str | None = Field(default=None, max_length=100)
    image: str | None = Field(default=None, max_length=1024)


class SteamLibraryImportRequest(BaseModel):
    steamId: str = Field(min_length=17, max_length=17)
    games: list[SteamLibraryGameImport] = Field(max_length=1000)


class DeveloperProfileUpdate(BaseModel):
    companyName: str = Field(default="", max_length=255)
    developerRole: str = Field(default="", max_length=100)
    companyWebsite: str = Field(default="", max_length=512)
    managedGames: list[str] = Field(default_factory=list, max_length=50)


class ProfileUpdateRequest(BaseModel):
    displayName: str | None = Field(default=None, max_length=30)
    profilePictureData: str | None = Field(
        default=None,
        max_length=1_000_000,
    )
    favoriteGenres: list[str] | None = Field(
        default=None,
        max_length=10,
    )
    developerProfile: DeveloperProfileUpdate | None = None


class ProfileActivity(BaseModel):
    appId: str = Field(min_length=1, max_length=10)
    gameName: str = Field(min_length=1, max_length=255)
    analyzedAt: datetime
    mode: Literal["player", "developer"]
    positivePercentage: float = Field(ge=0, le=100)
    negativePercentage: float = Field(ge=0, le=100)
    totalReviews: int = Field(ge=0, le=4_294_967_295)


class ProfileActivityBatch(BaseModel):
    activities: list[ProfileActivity] = Field(max_length=50)


class OrganizationRequest(BaseModel):
    organization_name: str = Field(
        min_length=2,
        max_length=255,
    )
    organization_email: str = Field(
        min_length=5,
        max_length=255,
    )

class OrganizationCreateRequest(BaseModel):
    organization_name: str = Field(
        min_length=2,
        max_length=255,
    )

class OrganizationMembershipReviewRequest(BaseModel):
    organization_id: int = Field(gt=0)
    user_id: int = Field(gt=0)
    decision: Literal["verified", "rejected"]

class OrganizationGameRequest(BaseModel):
    organization_id: int = Field(gt=0)
    app_id: int = Field(gt=0)
    relationship: Literal["developed", "published", "owned"]

class OrganizationGameReviewRequest(BaseModel):
    organization_id: int = Field(gt=0)
    game_id: int = Field(gt=0)
    relationship: Literal["developed", "published", "owned"]
    decision: Literal["verified", "rejected"]


class OrganizationMembershipRemovalRequest(BaseModel):
    organization_id: int = Field(gt=0)
    user_id: int = Field(gt=0)


class OrganizationGameRemovalRequest(BaseModel):
    organization_id: int = Field(gt=0)
    game_id: int = Field(gt=0)
    relationship: Literal["developed", "published", "owned"]



@app.delete("/api/admin/organizations/games")
def remove_organization_game(
    request: OrganizationGameRemovalRequest,
    account=Depends(require_role("admin")),
):
    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor()

        cursor.execute(
            """
            DELETE FROM organization_games
            WHERE organization_id = %s
                AND game_id = %s
                AND relationship = %s
            """,
            (
                request.organization_id,
                request.game_id,
                request.relationship,
            ),
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Organization game relationship not found.",
            )

        connection.commit()

        return {
            "message": "Organization game relationship removed successfully.",
            "organization_id": request.organization_id,
            "game_id": request.game_id,
            "relationship": request.relationship,
        }

    except HTTPException:
        if connection is not None:
            connection.rollback()
        raise

    except MySQLError as error:
        if connection is not None:
            connection.rollback()
        raise database_error(error) from error

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None and connection.is_connected():
            connection.close()


@app.delete("/api/admin/organizations/membership")
def remove_organization_membership(
    request: OrganizationMembershipRemovalRequest,
    account=Depends(require_role("admin")),
):
    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor()

        cursor.execute(
            """
            DELETE FROM organization_memberships
            WHERE organization_id = %s
                AND user_id = %s
            """,
            (
                request.organization_id,
                request.user_id,
            ),
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Organization membership not found.",
            )

        connection.commit()

        return {
            "message": "Organization membership removed successfully.",
            "organization_id": request.organization_id,
            "user_id": request.user_id,
        }

    except HTTPException:
        if connection is not None:
            connection.rollback()
        raise

    except MySQLError as error:
        if connection is not None:
            connection.rollback()
        raise database_error(error) from error

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None and connection.is_connected():
            connection.close()


@app.get("/api/admin/organizations")
def get_all_organizations(
    account=Depends(require_role("admin")),
):
    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                o.organization_id,
                o.organization_name,
                o.created_by_user_id,
                o.created_at,
                COUNT(DISTINCT CASE
                    WHEN om.affiliation_status = 'verified'
                    THEN om.user_id
                END) AS verified_members,
                COUNT(DISTINCT CASE
                    WHEN og.relationship_status = 'verified'
                    THEN CONCAT(
                        og.game_id,
                        '-',
                        og.relationship
                    )
                END) AS verified_game_relationships
            FROM organizations o
            LEFT JOIN organization_memberships om
                ON om.organization_id = o.organization_id
            LEFT JOIN organization_games og
                ON og.organization_id = o.organization_id
            GROUP BY
                o.organization_id,
                o.organization_name,
                o.created_by_user_id,
                o.created_at
            ORDER BY o.organization_name ASC
            """
        )

        organizations = cursor.fetchall()

        return {
            "organizations": organizations,
            "count": len(organizations),
        }

    except MySQLError as error:
        raise database_error(error) from error

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None and connection.is_connected():
            connection.close()


@app.get("/api/admin/organizations/{organization_id}/members")
def get_organization_members(
    organization_id: int = Path(gt=0),
    account=Depends(require_role("admin")),
):
    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT organization_id
            FROM organizations
            WHERE organization_id = %s
            """,
            (organization_id,),
        )

        if cursor.fetchone() is None:
            raise HTTPException(
                status_code=404,
                detail="Organization not found.",
            )

        cursor.execute(
            """
            SELECT
                om.organization_id,
                om.user_id,
                u.username,
                u.email,
                om.organization_email,
                om.membership_role,
                om.affiliation_status,
                om.requested_at,
                om.reviewed_at,
                om.reviewed_by_user_id
            FROM organization_memberships om
            JOIN users u
                ON u.user_id = om.user_id
            WHERE om.organization_id = %s
            ORDER BY om.requested_at ASC
            """,
            (organization_id,),
        )

        members = cursor.fetchall()

        return {
            "organization_id": organization_id,
            "members": members,
            "count": len(members),
        }

    except HTTPException:
        raise

    except MySQLError as error:
        raise database_error(error) from error

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None and connection.is_connected():
            connection.close()


@app.get("/api/admin/organizations/{organization_id}/games")
def get_organization_game_relationships(
    organization_id: int = Path(gt=0),
    account=Depends(require_role("admin")),
):
    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT organization_id
            FROM organizations
            WHERE organization_id = %s
            """,
            (organization_id,),
        )

        if cursor.fetchone() is None:
            raise HTTPException(
                status_code=404,
                detail="Organization not found.",
            )

        cursor.execute(
            """
            SELECT
                og.organization_id,
                og.game_id,
                g.app_id,
                g.game_name,
                og.relationship,
                og.relationship_status,
                og.added_by_user_id,
                added.username AS submitted_by,
                og.added_at,
                og.reviewed_by_user_id,
                reviewed.username AS reviewed_by,
                og.reviewed_at
            FROM organization_games og
            JOIN games g
                ON g.game_id = og.game_id
            LEFT JOIN users added
                ON added.user_id = og.added_by_user_id
            LEFT JOIN users reviewed
                ON reviewed.user_id = og.reviewed_by_user_id
            WHERE og.organization_id = %s
            ORDER BY og.added_at DESC
            """,
            (organization_id,),
        )

        games = cursor.fetchall()

        return {
            "organization_id": organization_id,
            "games": games,
            "count": len(games),
        }

    except HTTPException:
        raise

    except MySQLError as error:
        raise database_error(error) from error

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None and connection.is_connected():
            connection.close()


@app.post("/api/admin/organizations", status_code=201)
def create_organization(
    request: OrganizationCreateRequest,
    account=Depends(require_role("admin")),
):
    organization_name = request.organization_name.strip()

    if not organization_name:
        raise HTTPException(
            status_code=400,
            detail="Organization name is required.",
        )

    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT organization_id
            FROM organizations
            WHERE LOWER(organization_name) = LOWER(%s)
            """,
            (organization_name,),
        )

        if cursor.fetchone():
            raise HTTPException(
                status_code=409,
                detail="This organization is already registered.",
            )

        cursor.execute(
            """
            INSERT INTO organizations (
                organization_name,
                created_by_user_id
            )
            VALUES (%s, %s)
            """,
            (organization_name, account["user_id"]),
        )

        organization_id = cursor.lastrowid

        cursor.execute(
            """
            INSERT INTO organization_memberships (
                organization_id,
                user_id,
                membership_role,
                affiliation_status,
                email_verified_at,
                reviewed_at,
                reviewed_by_user_id
            )
            VALUES (
                %s, %s, 'admin', 'verified',
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP,
                %s
            )
            """,
            (
                organization_id,
                account["user_id"],
                account["user_id"],
            ),
        )

        connection.commit()

        return {
            "message": "Organization registered successfully.",
            "organization_id": organization_id,
            "organization_name": organization_name,
        }

    except HTTPException:
        if connection is not None:
            connection.rollback()
        raise

    except MySQLError as error:
        if connection is not None:
            connection.rollback()
        raise database_error(error) from error

    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()

# ==========================================
# Organization Membership Requests
# ==========================================

@app.get("/api/admin/organization-requests")
def get_pending_organization_requests(
    account=Depends(require_role("admin")),
):
    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                om.organization_id,
                o.organization_name,
                om.user_id,
                u.username,
                u.email AS account_email,
                om.organization_email,
                om.requested_at
            FROM organization_memberships om
            JOIN organizations o
                ON o.organization_id = om.organization_id
            JOIN users u
                ON u.user_id = om.user_id
            WHERE om.affiliation_status = 'pending'
            ORDER BY om.requested_at ASC
            """
        )

        requests = cursor.fetchall()

        return {
            "requests": requests,
            "count": len(requests),
        }

    except MySQLError as error:
        raise database_error(error) from error

    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()

@app.get("/api/organizations/membership")
def get_organization_membership(
    account=Depends(get_current_account),
):
    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                om.organization_id,
                o.organization_name,
                om.organization_email,
                om.membership_role,
                om.affiliation_status,
                om.requested_at,
                om.reviewed_at
            FROM organization_memberships om
            JOIN organizations o
                ON o.organization_id = om.organization_id
            WHERE om.user_id = %s
            ORDER BY om.requested_at DESC
            """,
            (account["user_id"],),
        )

        memberships = cursor.fetchall()

        return {
            "memberships": memberships,
            "count": len(memberships),
        }

    except MySQLError as error:
        raise database_error(error) from error

    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()

@app.patch("/api/admin/organizations/membership")
def review_organization_membership(
    request: OrganizationMembershipReviewRequest,
    account=Depends(require_role("admin")),
):
    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor()

        cursor.execute(
            """
            UPDATE organization_memberships
            SET
                affiliation_status = %s,
                reviewed_at = CURRENT_TIMESTAMP,
                reviewed_by_user_id = %s
            WHERE organization_id = %s
                AND user_id = %s
                AND affiliation_status = 'pending'
            """,
            (
                request.decision,
                account["user_id"],
                request.organization_id,
                request.user_id,
            ),
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="No pending membership request was found.",
            )

        connection.commit()

        return {
            "message": (
                "Membership request approved."
                if request.decision == "verified"
                else "Membership request rejected."
            ),
            "organization_id": request.organization_id,
            "user_id": request.user_id,
            "status": request.decision,
        }

    except HTTPException:
        if connection is not None:
            connection.rollback()
        raise

    except MySQLError as error:
        if connection is not None:
            connection.rollback()
        raise database_error(error) from error

    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()


@app.patch("/api/admin/organization-games")
def review_organization_game(
    request: OrganizationGameReviewRequest,
    account=Depends(require_role("admin")),
):
    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor()

        cursor.execute(
            """
            UPDATE organization_games
            SET
                relationship_status = %s,
                reviewed_by_user_id = %s,
                reviewed_at = CURRENT_TIMESTAMP
            WHERE organization_id = %s
                AND game_id = %s
                AND relationship = %s
                AND relationship_status = 'pending'
            """,
            (
                request.decision,
                account["user_id"],
                request.organization_id,
                request.game_id,
                request.relationship,
            ),
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="No pending game submission was found.",
            )

        connection.commit()

        return {
            "message": (
                "Organization game relationship approved."
                if request.decision == "verified"
                else "Organization game relationship rejected."
            ),
            "organization_id": request.organization_id,
            "game_id": request.game_id,
            "relationship": request.relationship,
            "status": request.decision,
        }

    except HTTPException:
        if connection is not None:
            connection.rollback()
        raise

    except MySQLError as error:
        if connection is not None:
            connection.rollback()
        raise database_error(error) from error

    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()

@app.get("/api/admin/organization-games")
def get_pending_organization_games(
    account=Depends(require_role("admin")),
):
    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                og.organization_id,
                o.organization_name,
                og.game_id,
                g.app_id,
                g.game_name,
                og.relationship,
                og.relationship_status,
                og.added_by_user_id,
                u.username AS submitted_by,
                u.email AS submitter_email,
                og.added_at
            FROM organization_games og
            JOIN organizations o
                ON o.organization_id = og.organization_id
            JOIN games g
                ON g.game_id = og.game_id
            LEFT JOIN users u
                ON u.user_id = og.added_by_user_id
            WHERE og.relationship_status = 'pending'
            ORDER BY og.added_at ASC
            """
        )

        submissions = cursor.fetchall()

        return {
            "submissions": submissions,
            "count": len(submissions),
        }

    except MySQLError as error:
        raise database_error(error) from error

    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()


@app.post("/api/organizations/games", status_code=201)
def add_organization_game(
    request: OrganizationGameRequest,
    account=Depends(require_role("developer")),
):
    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor(dictionary=True)

        # Confirm verified membership in the requested organization.
        cursor.execute(
            """
            SELECT organization_id
            FROM organization_memberships
            WHERE organization_id = %s
                AND user_id = %s
                AND affiliation_status = 'verified'
            """,
            (
                request.organization_id,
                account["user_id"],
            ),
        )

        membership = cursor.fetchone()

        if membership is None:
            raise HTTPException(
                status_code=403,
                detail="You are not a verified member of this organization.",
            )

        # Retrieve the game from Steam.
        steam_response = requests.get(
            "https://store.steampowered.com/api/appdetails",
            params={"appids": request.app_id},
            timeout=15,
        )
        steam_response.raise_for_status()

        steam_data = steam_response.json().get(
            str(request.app_id)
        )

        if not steam_data or not steam_data.get("success"):
            raise HTTPException(
                status_code=404,
                detail="The requested Steam game could not be found.",
            )

        details = steam_data["data"]

        game_name = details.get("name")

        if not game_name:
            raise HTTPException(
                status_code=404,
                detail="Steam did not return a valid game name.",
            )

        release_date = None
        release_date_text = details.get(
            "release_date", {}
        ).get("date")

        if release_date_text:
            try:
                from datetime import datetime

                release_date = datetime.strptime(
                    release_date_text,
                    "%d %b, %Y",
                ).date()
            except ValueError:
                release_date = None

        developers = details.get("developers") or []
        publishers = details.get("publishers") or []

        game_developer = (
            ", ".join(developers) if developers else None
        )

        game_publisher = (
            ", ".join(publishers) if publishers else None
        )

        # Check whether the game already exists.
        cursor.execute(
            """
            SELECT game_id
            FROM games
            WHERE app_id = %s
            """,
            (request.app_id,),
        )

        existing_game = cursor.fetchone()

        if existing_game:
            game_id = existing_game["game_id"]
        else:
            cursor.execute(
                """
                INSERT INTO games (
                    app_id,
                    game_name,
                    game_release_date,
                    game_developer,
                    game_publisher
                )
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    request.app_id,
                    game_name,
                    release_date,
                    game_developer,
                    game_publisher,
                ),
            )

            game_id = cursor.lastrowid

        # Check for an existing organization-game relationship.
        cursor.execute(
            """
            SELECT relationship_status
            FROM organization_games
            WHERE organization_id = %s
                AND game_id = %s
                AND relationship = %s
            """,
            (
                request.organization_id,
                game_id,
                request.relationship,
            ),
        )

        existing_relationship = cursor.fetchone()

        if existing_relationship:
            raise HTTPException(
                status_code=409,
                detail="This game relationship has already been submitted.",
            )

        # Submit the relationship for administrator verification.
        cursor.execute(
            """
            INSERT INTO organization_games (
                organization_id,
                game_id,
                relationship,
                relationship_status,
                added_by_user_id
            )
            VALUES (%s, %s, %s, 'pending', %s)
            """,
            (
                request.organization_id,
                game_id,
                request.relationship,
                account["user_id"],
            ),
        )

        connection.commit()

        return {
            "message": "Game submitted for organization verification.",
            "organization_id": request.organization_id,
            "game_id": game_id,
            "app_id": request.app_id,
            "game_name": game_name,
            "relationship": request.relationship,
            "status": "pending",
        }

    except HTTPException:
        if connection is not None:
            connection.rollback()
        raise

    except MySQLError as error:
        if connection is not None:
            connection.rollback()
        raise database_error(error) from error

    except requests.RequestException as error:
        if connection is not None:
            connection.rollback()
        raise HTTPException(
            status_code=502,
            detail="Unable to retrieve game details from Steam.",
        ) from error

    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()


@app.get("/api/organizations/games")
def get_organization_games(
    account=Depends(get_current_account),
):
    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                o.organization_id,
                o.organization_name,
                g.game_id,
                g.app_id,
                g.game_name,
                g.game_release_date,
                g.game_developer,
                g.game_publisher,
                og.relationship,
                og.relationship_status,
                og.added_at
            FROM organization_memberships om
            JOIN organizations o
                ON o.organization_id = om.organization_id
            JOIN organization_games og
                ON og.organization_id = o.organization_id
            JOIN games g
                ON g.game_id = og.game_id
            WHERE om.user_id = %s
                AND om.affiliation_status = 'verified'
            ORDER BY o.organization_name, g.game_name
            """,
            (account["user_id"],),
        )

        games = cursor.fetchall()

        return {
            "games": games,
            "count": len(games),
        }

    except MySQLError as error:
        raise database_error(error) from error

    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()

@app.post("/api/organizations/request", status_code=201)
def request_organization_membership(
    request: OrganizationRequest,
    account=Depends(get_current_account),
):
    organization_name = request.organization_name.strip()
    organization_email = request.organization_email.strip().lower()

    if not organization_name or not organization_email:
        raise HTTPException(
            status_code=400,
            detail="Organization name and email are required.",
        )

    if not re.fullmatch(
        r"[^@\s]+@[^@\s]+\.[^@\s]+",
        organization_email,
    ):
        raise HTTPException(
            status_code=400,
            detail="Enter a valid organization email address.",
        )

    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT organization_id
            FROM organizations
            WHERE LOWER(organization_name) = LOWER(%s)
            """,
            (organization_name,),
        )

        organization = cursor.fetchone()

        if organization is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    "This organization has not been registered yet. "
                    "Contact the GameScope administrator."
                ),
            )

        organization_id = organization["organization_id"]
        user_id = account["user_id"]

        cursor.execute(
            """
            SELECT affiliation_status
            FROM organization_memberships
            WHERE organization_id = %s
                AND user_id = %s
            """,
            (organization_id, user_id),
        )

        existing = cursor.fetchone()

        if existing and existing["affiliation_status"] == "verified":
            raise HTTPException(
                status_code=409,
                detail="You are already a verified member of this organization.",
            )

        if existing and existing["affiliation_status"] == "pending":
            raise HTTPException(
                status_code=409,
                detail="Your membership request is already pending.",
            )

        cursor.execute(
            """
            INSERT INTO organization_memberships (
                organization_id,
                user_id,
                organization_email,
                membership_role,
                affiliation_status
            )
            VALUES (%s, %s, %s, 'member', 'pending')
            ON DUPLICATE KEY UPDATE
                organization_email = VALUES(organization_email),
                affiliation_status = 'pending',
                requested_at = CURRENT_TIMESTAMP,
                reviewed_at = NULL,
                reviewed_by_user_id = NULL
            """,
            (organization_id, user_id, organization_email),
        )

        connection.commit()

        return {
            "message": (
                "Organization membership request submitted. "
                "Developer access will be available after administrator approval."
            ),
            "status": "pending",
        }

    except HTTPException:
        if connection is not None:
            connection.rollback()
        raise

    except MySQLError as error:
        if connection is not None:
            connection.rollback()
        raise database_error(error) from error

    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()

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
        organization_name=request.organization_name,
        organization_email=request.organization_email,
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


@app.get("/api/profile")
def get_profile(account=Depends(get_current_account)):
    """Return profile data belonging to the authenticated user."""
    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT
                u.username,
                COALESCE(NULLIF(u.display_name, ''), u.username)
                    AS display_name,
                u.profile_picture_data,
                dp.company_name,
                dp.developer_role,
                dp.company_website
            FROM users AS u
            LEFT JOIN developer_profiles AS dp
                ON dp.user_id = u.user_id
            WHERE u.user_id = %s
            LIMIT 1
            """,
            (account["user_id"],),
        )
        profile = cursor.fetchone()

        if profile is None:
            raise HTTPException(
                status_code=404,
                detail="Profile not found.",
            )

        cursor.execute(
            """
            SELECT genre
            FROM user_favorite_genres
            WHERE user_id = %s
            ORDER BY genre
            """,
            (account["user_id"],),
        )
        favorite_genres = [
            row["genre"] for row in cursor.fetchall()
        ]

        cursor.execute(
            """
            SELECT game_name
            FROM developer_managed_games
            WHERE user_id = %s
            ORDER BY game_name
            """,
            (account["user_id"],),
        )
        managed_games = [
            row["game_name"] for row in cursor.fetchall()
        ]

        return {
            "username": profile["username"],
            "displayName": profile["display_name"],
            "profilePictureData": profile["profile_picture_data"],
            "favoriteGenres": favorite_genres,
            "developerProfile": {
                "companyName": profile["company_name"] or "",
                "developerRole": profile["developer_role"] or "",
                "companyWebsite": profile["company_website"] or "",
                "managedGames": managed_games,
            },
        }

    except MySQLError as error:
        raise database_error(error) from error

    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()


@app.patch("/api/profile")
def update_profile(
    request: ProfileUpdateRequest,
    account=Depends(get_current_account),
):
    """Update profile fields and replace submitted preference lists."""
    updates = request.model_dump(exclude_unset=True)

    if not updates:
        raise HTTPException(
            status_code=400,
            detail="No profile fields were provided.",
        )

    display_name = updates.get("displayName")
    if display_name is not None:
        display_name = display_name.strip()
        if not display_name:
            raise HTTPException(
                status_code=400,
                detail="Display name cannot be empty.",
            )
        updates["displayName"] = display_name

    profile_picture = updates.get("profilePictureData")
    if profile_picture is not None and not re.fullmatch(
        r"data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}",
        profile_picture,
    ):
        raise HTTPException(
            status_code=400,
            detail="Profile picture must be a JPEG data URL.",
        )

    favorite_genres = updates.get("favoriteGenres")
    allowed_genres = {
        "Action",
        "Adventure",
        "RPG",
        "FPS",
        "Strategy",
        "Simulation",
        "Horror",
        "Racing",
        "Sports",
        "Indie",
    }
    if favorite_genres is not None and (
        len(favorite_genres) != len(set(favorite_genres))
        or any(genre not in allowed_genres for genre in favorite_genres)
    ):
        raise HTTPException(
            status_code=400,
            detail="Favorite genres contain duplicates or unsupported values.",
        )

    developer_profile = updates.get("developerProfile")
    if developer_profile is not None:
        managed_games = [
            game.strip()
            for game in developer_profile.get("managedGames", [])
        ]
        if any(not game or len(game) > 255 for game in managed_games):
            raise HTTPException(
                status_code=400,
                detail="Managed game names must contain 1 to 255 characters.",
            )
        normalized_games = [game.casefold() for game in managed_games]
        if len(normalized_games) != len(set(normalized_games)):
            raise HTTPException(
                status_code=400,
                detail="Managed games cannot contain duplicates.",
            )
        developer_profile["managedGames"] = managed_games
        developer_profile["companyName"] = (
            developer_profile.get("companyName", "").strip()
        )
        developer_profile["developerRole"] = (
            developer_profile.get("developerRole", "").strip()
        )
        developer_profile["companyWebsite"] = (
            developer_profile.get("companyWebsite", "").strip()
        )

    connection = None
    cursor = None
    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor()

        user_fields = []
        user_values = []
        if "displayName" in updates:
            user_fields.append("display_name = %s")
            user_values.append(updates["displayName"])
        if "profilePictureData" in updates:
            user_fields.append("profile_picture_data = %s")
            user_values.append(updates["profilePictureData"])
        if user_fields:
            cursor.execute(
                f"UPDATE users SET {', '.join(user_fields)} "
                "WHERE user_id = %s",
                (*user_values, account["user_id"]),
            )

        if favorite_genres is not None:
            cursor.execute(
                "DELETE FROM user_favorite_genres WHERE user_id = %s",
                (account["user_id"],),
            )
            if favorite_genres:
                cursor.executemany(
                    """
                    INSERT INTO user_favorite_genres (user_id, genre)
                    VALUES (%s, %s)
                    """,
                    [
                        (account["user_id"], genre)
                        for genre in favorite_genres
                    ],
                )

        if developer_profile is not None:
            cursor.execute(
                """
                INSERT INTO developer_profiles (
                    user_id,
                    company_name,
                    developer_role,
                    company_website
                )
                VALUES (%s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    company_name = VALUES(company_name),
                    developer_role = VALUES(developer_role),
                    company_website = VALUES(company_website)
                """,
                (
                    account["user_id"],
                    developer_profile["companyName"],
                    developer_profile["developerRole"],
                    developer_profile["companyWebsite"],
                ),
            )
            cursor.execute(
                """
                DELETE FROM developer_managed_games
                WHERE user_id = %s
                """,
                (account["user_id"],),
            )
            if developer_profile["managedGames"]:
                cursor.executemany(
                    """
                    INSERT INTO developer_managed_games
                        (user_id, game_name)
                    VALUES (%s, %s)
                    """,
                    [
                        (account["user_id"], game)
                        for game in developer_profile["managedGames"]
                    ],
                )

        connection.commit()

    except MySQLError as error:
        if connection is not None:
            connection.rollback()
        raise database_error(error) from error

    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()

    return get_profile(account)


def serialize_profile_activity(row):
    analyzed_at = row["analyzed_at"]
    return {
        "appId": str(row["app_id"]),
        "gameName": row["game_name"],
        "analyzedAt": (
            analyzed_at.isoformat()
            if isinstance(analyzed_at, datetime)
            else str(analyzed_at)
        ),
        "mode": row["analysis_mode"],
        "positivePercentage": float(row["positive_percentage"]),
        "negativePercentage": float(row["negative_percentage"]),
        "totalReviews": int(row["total_reviews"]),
    }


@app.get("/api/profile/activity")
def get_profile_activity(account=Depends(get_current_account)):
    """Return the latest 50 analyses for the authenticated user."""
    connection = None
    cursor = None
    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT
                app_id,
                game_name,
                analyzed_at,
                analysis_mode,
                positive_percentage,
                negative_percentage,
                total_reviews
            FROM user_analysis_history
            WHERE user_id = %s
            ORDER BY analyzed_at DESC, activity_id DESC
            LIMIT 50
            """,
            (account["user_id"],),
        )
        return {
            "activities": [
                serialize_profile_activity(row)
                for row in cursor.fetchall()
            ],
        }

    except MySQLError as error:
        raise database_error(error) from error

    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()


@app.post("/api/profile/activity")
def save_profile_activity(
    request: ProfileActivityBatch,
    account=Depends(get_current_account),
):
    """Save analysis events, skipping duplicate imports from old local data."""
    connection = None
    cursor = None
    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor(dictionary=True)

        for activity in request.activities:
            app_id_text = activity.appId.strip()
            if not app_id_text.isdigit():
                raise HTTPException(
                    status_code=400,
                    detail="Analysis history contains an invalid App ID.",
                )
            app_id = int(app_id_text)
            if app_id < 1 or app_id > MAX_APP_ID:
                raise HTTPException(
                    status_code=400,
                    detail="Analysis history contains an invalid App ID.",
                )

            game_name = activity.gameName.strip()
            if not game_name:
                raise HTTPException(
                    status_code=400,
                    detail="Analysis history contains an empty game name.",
                )

            analyzed_at = activity.analyzedAt
            if analyzed_at.tzinfo is not None:
                analyzed_at = analyzed_at.astimezone(
                    timezone.utc
                ).replace(tzinfo=None)
            analyzed_at = analyzed_at.replace(microsecond=0)

            cursor.execute(
                """
                SELECT activity_id
                FROM user_analysis_history
                WHERE user_id = %s
                    AND app_id = %s
                    AND analyzed_at = %s
                    AND analysis_mode = %s
                LIMIT 1
                """,
                (
                    account["user_id"],
                    app_id,
                    analyzed_at,
                    activity.mode,
                ),
            )
            if cursor.fetchone():
                continue

            cursor.execute(
                """
                INSERT INTO user_analysis_history (
                    user_id,
                    app_id,
                    game_name,
                    analyzed_at,
                    analysis_mode,
                    positive_percentage,
                    negative_percentage,
                    total_reviews
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    account["user_id"],
                    app_id,
                    game_name,
                    analyzed_at,
                    activity.mode,
                    activity.positivePercentage,
                    activity.negativePercentage,
                    activity.totalReviews,
                ),
            )

        cursor.execute(
            """
            DELETE FROM user_analysis_history
            WHERE user_id = %s
                AND activity_id NOT IN (
                    SELECT activity_id
                    FROM (
                        SELECT activity_id
                        FROM user_analysis_history
                        WHERE user_id = %s
                        ORDER BY analyzed_at DESC, activity_id DESC
                        LIMIT 50
                    ) AS recent_activity
                )
            """,
            (account["user_id"], account["user_id"]),
        )
        cursor.execute(
            """
            SELECT
                app_id,
                game_name,
                analyzed_at,
                analysis_mode,
                positive_percentage,
                negative_percentage,
                total_reviews
            FROM user_analysis_history
            WHERE user_id = %s
            ORDER BY analyzed_at DESC, activity_id DESC
            LIMIT 50
            """,
            (account["user_id"],),
        )
        activities = [
            serialize_profile_activity(row)
            for row in cursor.fetchall()
        ]
        connection.commit()
        return {"activities": activities}

    except HTTPException:
        if connection is not None:
            connection.rollback()
        raise

    except MySQLError as error:
        if connection is not None:
            connection.rollback()
        raise database_error(error) from error

    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()


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
# Steam Account Linking
# Start Steam OpenID Authentication
# ==========================================
@app.get("/api/auth/steam/link")
def start_steam_link(request: Request):
    """
    Start Steam OpenID authentication for the logged-in
    GameScope account.
    """
    account = get_current_account(request)
    session_token = request.cookies.get(SESSION_COOKIE_NAME)
    if not session_token:
        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
        )
    try:
        state = auth.create_steam_link_state(
            account["user_id"],
            session_token,
        )
    except MySQLError as error:
        raise database_error(error) from error
    return_to = (
        f"{STEAM_OPENID_RETURN_URL}"
        f"?{urlencode({'state': state})}"
    )
    params = {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": return_to,
        "openid.realm": STEAM_OPENID_REALM,
        "openid.identity": (
            "http://specs.openid.net/auth/2.0/"
            "identifier_select"
        ),
        "openid.claimed_id": (
            "http://specs.openid.net/auth/2.0/"
            "identifier_select"
        ),
    }
    steam_url = f"{STEAM_OPENID_URL}?{urlencode(params)}"
    return RedirectResponse(
        url=steam_url,
        status_code=303,
        headers={"Cache-Control": "no-store"},
    )
# ==========================================
# Steam Account Linking
# Verify Steam OpenID Callback
# ==========================================
@app.get("/api/auth/steam/callback")
def steam_link_callback(
    request: Request,
    state: str = Query(..., min_length=20, max_length=256),
):
    """
    Receive and verify Steam OpenID authentication.
    The Steam ID is only trusted after Steam confirms
    the OpenID assertion.
    """
    account = get_current_account(request)
    session_token = request.cookies.get(SESSION_COOKIE_NAME)
    if not session_token:
        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
        )
    # Make sure Steam returned a successful authentication.
    if request.query_params.get("openid.mode") != "id_res":
        raise HTTPException(
            status_code=400,
            detail="Steam authentication was cancelled or failed.",
        )
    # Collect the OpenID response fields.
    openid_fields = {
        key: value
        for key, value in request.query_params.items()
        if key.startswith("openid.")
    }
    claimed_id = openid_fields.get("openid.claimed_id", "")
    identity = openid_fields.get("openid.identity", "")
    response_nonce = openid_fields.get("openid.response_nonce", "")
    return_to = openid_fields.get("openid.return_to", "")
    # Confirm the response came from the expected OpenID provider.
    if (
        openid_fields.get("openid.ns")
        != "http://specs.openid.net/auth/2.0"
        or openid_fields.get("openid.op_endpoint")
        != STEAM_OPENID_URL
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid Steam OpenID provider response.",
        )
    # Both identifiers must refer to the same Steam account.
    steam_id_match = re.fullmatch(
        r"https?://steamcommunity\.com/openid/id/([0-9]{17})",
        claimed_id,
    )
    if not steam_id_match or identity != claimed_id:
        raise HTTPException(
            status_code=400,
            detail="Steam returned an invalid account identity.",
        )
    steam_id = steam_id_match.group(1)
    # Require the exact callback URL and state originally generated.
    expected_return_to = (
        f"{STEAM_OPENID_RETURN_URL}"
        f"?{urlencode({'state': state})}"
    )
    if return_to != expected_return_to:
        raise HTTPException(
            status_code=400,
            detail="Invalid Steam authentication response.",
        )
    if not response_nonce:
        raise HTTPException(
            status_code=400,
            detail="Steam authentication response is incomplete.",
        )
    # Ask Steam to verify the original signed assertion.
    verification_fields = dict(openid_fields)
    verification_fields["openid.mode"] = "check_authentication"
    try:
        verification_response = requests.post(
            STEAM_OPENID_URL,
            data=verification_fields,
            timeout=10,
        )
        verification_response.raise_for_status()
    except requests.RequestException as error:
        logger.warning(
            "Steam OpenID verification request failed: %s",
            type(error).__name__,
        )
        raise HTTPException(
            status_code=502,
            detail="Unable to verify your Steam account right now.",
        ) from error
    verification_text = verification_response.text
    if not re.search(
        r"(?m)^is_valid:true\s*$",
        verification_text,
    ):
        raise HTTPException(
            status_code=400,
            detail="Steam could not verify this account.",
        )
    # Consume the state only after Steam has verified the assertion.
    try:
        state_valid = auth.consume_steam_link_state(
            state,
            account["user_id"],
            session_token,
        )
        if not state_valid:
            raise HTTPException(
                status_code=400,
                detail=(
                    "This Steam linking request has expired "
                    "or was already used."
                ),
            )
        auth.link_steam_account(
            account["user_id"],
            steam_id,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=409,
            detail=str(error),
        ) from error
    except MySQLError as error:
        raise database_error(error) from error
    logger.info(
        "Steam account successfully linked for GameScope user_id=%s.",
        account["user_id"],
    )
    # Redirect to the React application root.
    # GameScope uses internal page state rather than /profile routing.
    return RedirectResponse(
        url=f"{FRONTEND_URL}/?steam=linked",
        status_code=303,
        headers={"Cache-Control": "no-store"},
    )
# ==========================================
# Steam Account Linking
# Get Linked Steam Account
# ==========================================
@app.get("/api/auth/steam/account")
def get_linked_steam_account(request: Request):
    """
    Return the Steam account linked to the
    currently authenticated GameScope user.
    """
    account = get_current_account(request)
    try:
        steam_account = auth.get_steam_account(
            account["user_id"]
        )
    except MySQLError as error:
        raise database_error(error) from error
    return {
        "linked": steam_account is not None,
        "steam_account": steam_account,
    }

# ==========================================
# Steam Library
# Save Games Imported by the Browser Extension
# ==========================================

@app.post("/api/auth/steam/library/imported")
def import_steam_library(
    request: SteamLibraryImportRequest,
    account=Depends(get_current_account),
):
    """Save Steam library data collected by the GameScope browser extension.

    The submitted Steam ID is checked against the Steam account already
    linked to the authenticated GameScope user. The extension cannot choose
    which GameScope account receives the imported games.
    """
    steam_id = request.steamId.strip()

    if not re.fullmatch(r"[0-9]{17}", steam_id):
        raise HTTPException(
            status_code=400,
            detail="The imported Steam account ID is invalid.",
        )

    try:
        steam_account = auth.get_steam_account(account["user_id"])
    except MySQLError as error:
        raise database_error(error) from error

    if not steam_account:
        raise HTTPException(
            status_code=404,
            detail="Connect your Steam account before importing your library.",
        )

    linked_steam_id = str(steam_account.get("steam_id") or "")
    if steam_id != linked_steam_id:
        raise HTTPException(
            status_code=403,
            detail="The imported Steam account does not match your linked account.",
        )

    rows = []
    for game in request.games:
        app_id_text = game.appId.strip()
        if not app_id_text.isdigit():
            raise HTTPException(
                status_code=400,
                detail="One or more imported games have an invalid App ID.",
            )

        app_id = int(app_id_text)
        if app_id < 1 or app_id > MAX_APP_ID:
            raise HTTPException(
                status_code=400,
                detail="One or more imported games have an invalid App ID.",
            )

        game_name = game.name.strip()
        if not game_name:
            raise HTTPException(
                status_code=400,
                detail="One or more imported games have an empty name.",
            )

        image_url = game.image.strip() if game.image else None
        if image_url and not re.match(
            r"^https://(?:[a-z0-9-]+\.)*steamstatic\.com/",
            image_url,
            flags=re.IGNORECASE,
        ):
            image_url = None

        last_played = game.lastPlayed.strip() if game.lastPlayed else None
        rows.append((
            account["user_id"],
            steam_id,
            app_id,
            game_name[:255],
            game.playtimeMinutes,
            last_played[:100] if last_played else None,
            image_url[:1024] if image_url else None,
        ))

    connection = None
    cursor = None
    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor()

        if rows:
            cursor.executemany(
                """
                INSERT INTO steam_library_games
                    (user_id, steam_id, app_id, game_name,
                     playtime_minutes, last_played, image_url)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    steam_id = VALUES(steam_id),
                    game_name = VALUES(game_name),
                    playtime_minutes = VALUES(playtime_minutes),
                    last_played = VALUES(last_played),
                    image_url = VALUES(image_url),
                    imported_at = CURRENT_TIMESTAMP
                """,
                rows,
            )

        connection.commit()

    except MySQLError as error:
        if connection is not None:
            try:
                connection.rollback()
            except MySQLError:
                pass
        raise database_error(error) from error

    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()

    return {
        "message": "Steam library imported successfully.",
        "steamId": steam_id,
        "importedCount": len(rows),
        "gameCount": len(rows),
    }


# ==========================================
# Steam Library
# Retrieve Games Imported by the Extension
# ==========================================

@app.get("/api/auth/steam/library/imported")
def get_imported_steam_library(
    account=Depends(get_current_account),
):
    """Return the authenticated user's persisted extension-imported library."""
    try:
        steam_account = auth.get_steam_account(account["user_id"])
    except MySQLError as error:
        raise database_error(error) from error

    if not steam_account:
        raise HTTPException(
            status_code=404,
            detail="Connect your Steam account before viewing your library.",
        )

    steam_id = str(steam_account.get("steam_id") or "")
    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT app_id, game_name, playtime_minutes, last_played, image_url
            FROM steam_library_games
            WHERE user_id = %s AND steam_id = %s
            ORDER BY playtime_minutes DESC, game_name ASC
            """,
            (account["user_id"], steam_id),
        )
        stored_games = cursor.fetchall()

    except MySQLError as error:
        raise database_error(error) from error

    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()

    games = [
        {
            "appId": str(row["app_id"]),
            "name": row["game_name"],
            "playtime": round(int(row["playtime_minutes"] or 0) / 60, 1),
            "lastPlayed": row["last_played"],
            "image": row["image_url"],
        }
        for row in stored_games
    ]

    return {
        "steamId": steam_id,
        "gameCount": len(games),
        "games": games,
    }
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
# Open to guests; limited per IP by check_analysis_rate_limit
# ==========================================
@app.post("/api/analyze/{app_id}")
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
# Open to guests
# ==========================================
@app.get("/api/games/{app_id}/analysis")
def get_analysis(
    app_id: int = Path(gt=0, le=MAX_APP_ID),
    days: int | None = Query(None, ge=1, le=3650),
):
    return build_analysis(
        load_stored(app_id, days)
    )
# ==========================================
# Game Issues
# Open to guests; changing a status is developer only (below)
# ==========================================
@app.get("/api/games/{app_id}/issues")
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
@app.patch("/api/games/{app_id}/issues/{topic}/status")
def update_issue_status(
    update: IssueStatusUpdate,
    app_id: int = Path(gt=0, le=MAX_APP_ID),
    topic: str = Path(max_length=50),
    account=Depends(require_role("developer")),
):
    if topic not in TOPIC_PATTERNS:
        raise HTTPException(
            status_code=404,
            detail="Unknown issue topic.",
        )

    connection = None
    cursor = None

    try:
        game_id = pipeline.find_game_id(app_id)

        if game_id is None:
            raise HTTPException(
                status_code=404,
                detail=f"App ID {app_id} hasn't been analyzed yet.",
            )

        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor(dictionary=True)

        # Verify that the developer belongs to an
        # organization with an approved relationship to this game.
        cursor.execute(
            """
            SELECT EXISTS (
                SELECT 1
                FROM organization_memberships om
                JOIN organization_games og
                    ON og.organization_id = om.organization_id
                WHERE om.user_id = %s
                    AND om.affiliation_status = 'verified'
                    AND og.game_id = %s
                    AND og.relationship_status = 'verified'
            ) AS can_manage_game
            """,
            (
                account["user_id"],
                game_id,
            ),
        )

        permission = cursor.fetchone()

        if not permission["can_manage_game"]:
            raise HTTPException(
                status_code=403,
                detail=(
                    "You do not have permission to manage "
                    "this game's issues."
                ),
            )

        pipeline.save_issue_status(
            game_id,
            topic,
            update.status,
        )

    except MySQLError as error:
        raise database_error(error) from error

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None and connection.is_connected():
            connection.close()

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
# Open to guests
# ==========================================
@app.get("/api/topics/{topic}/games")
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
# Open to guests
# ==========================================
@app.get("/api/games/{app_id}/reviews")
def get_review_cards(
    app_id: int = Path(gt=0, le=MAX_APP_ID),
    limit: int = Query(300, ge=1, le=2000),
    days: int | None = Query(None, ge=1, le=3650),
):
    return build_review_cards(
        load_stored(app_id, days)
    )[:limit]
# ==========================================
# Steam Account Linking
# Disconnect Steam Account
# ==========================================
@app.post("/api/auth/steam/unlink")
def unlink_steam_account(
    account=Depends(get_current_account),
):
    """
    Disconnect the Steam account belonging to the
    currently authenticated GameScope user.
    """
    try:
        unlinked = auth.unlink_steam_account(
            account["user_id"]
        )
    except MySQLError as error:
        raise database_error(error) from error
    if not unlinked:
        return {
            "message": "No Steam account is currently linked.",
            "unlinked": False,
        }
    logger.info(
        "Steam account disconnected for GameScope user_id=%s.",
        account["user_id"],
    )
    return {
        "message": "Steam account disconnected successfully.",
        "unlinked": True,
    }
