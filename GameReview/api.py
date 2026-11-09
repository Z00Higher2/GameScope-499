
"""
GameScope API: connects the review pipeline and MySQL to the website.

Start it from the GameReview folder:

    python -m uvicorn api:app --reload --port 8000

The website's dev server forwards every /api request here
(see GameScope/vite.config.ts).
"""

import json
import time
import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import FastAPI, HTTPException, Path, Query, Request
from pydantic import BaseModel


import requests
from fastapi import FastAPI, HTTPException, Path, Query
from mysql.connector import Error as MySQLError
from fastapi.middleware.cors import CORSMiddleware

import SteamGameReviewer_ as collector
import pipeline
from analysis import (
    MIN_ISSUE_COMPLAINTS,
    TOPIC_PATTERNS,
    build_analysis,
    build_issues,
    build_review_cards,
    topic_standing,
)

#
#=================================================
from collections import defaultdict, deque
from threading import Lock
logger = logging.getLogger(__name__)

#====================================================


STEAM_SEARCH_URL = "https://store.steampowered.com/api/storesearch/"
MAX_APP_ID = 4_294_967_295

STEAM_IMAGE_BASE = (
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps"
)

# Steam rate-limits appdetails, so store details are cached for a while.
DETAILS_CACHE_SECONDS = 3600
DETAILS_CACHE_MAX = 256
_details_cache = {}
_standing_cache = {}


app = FastAPI(title="GameScope API")
logger = logging.getLogger(__name__)

# Allow the deployed frontend and local development frontend to call the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://gamescope-five.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
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
    """Build a standard Steam small-capsule image URL."""
    return (
        f"{STEAM_IMAGE_BASE}/{app_id}/capsule_sm_120.jpg"
    )


def get_fallback_header(app_id):
    """Build a standard Steam header image URL."""
    return f"{STEAM_IMAGE_BASE}/{app_id}/header.jpg"


def fetch_store_details(app_id):
    """Steam store details for a game, cached for an hour."""
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

    # review_score: 1-4 negative, 5 mixed, 6-9 positive, 0 too few reviews
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

    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    return [
        review
        for review in reviews
        if review["created_at"] and review["created_at"] >= cutoff
    ]


def within_days(stored, days):
    """Keep only reviews posted in the last `days` days (Settings > Review time range)."""
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

    return {**stored, "reviews": recent}


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
        # The review summary is only a shortcut; the pipeline still checks
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


# Basic in-memory rate limit for expensive analysis requests.
ANALYSIS_RATE_LIMIT = 5
ANALYSIS_RATE_WINDOW = 60  # seconds

_analysis_requests = defaultdict(deque)
_analysis_lock = Lock()



def check_analysis_rate_limit(client_ip):
    """Allow up to 5 analysis requests per IP in a 60-second window."""
    now = time.monotonic()
    cutoff = now - ANALYSIS_RATE_WINDOW

    with _analysis_lock:
        # Remove expired timestamps and delete IP entries that are empty.
        expired_ips = []

        for ip, timestamps in _analysis_requests.items():
            while timestamps and timestamps[0] <= cutoff:
                timestamps.popleft()

            if not timestamps:
                expired_ips.append(ip)

        for ip in expired_ips:
            del _analysis_requests[ip]

        # Check the current IP after expired entries are cleaned up.
        requests_for_ip = _analysis_requests[client_ip]

        if len(requests_for_ip) >= ANALYSIS_RATE_LIMIT:
            return False

        requests_for_ip.append(now)
        return True

# ==========================================
# Routes
# ==========================================

@app.get("/api/health")
def health():
    try:
        pipeline.check_database()
        return {"status": "ok", "database": "connected"}

    except MySQLError as error:
        # Keep the public health response generic, but log the database error
        # message on the server so cloud connection failures can be diagnosed.
        logger.error(
            "Health check database failure: %s: %s",
            type(error).__name__,
            error,
        )

        return {
            "status": "ok",
            "database": "unavailable",
        }


@app.get("/api/search")
def search_games(q: str = Query(min_length=1, max_length=100)):
    """Search Steam games and return a thumbnail URL for each result."""
    try:
        response = requests.get(
            STEAM_SEARCH_URL,
            params={"term": q, "l": "english", "cc": "US"},
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

        # Prefer the image returned by Steam search.
        # Use a standard capsule URL when Steam omits its thumbnail.
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




@app.post("/api/games/{app_id}/searches")
def record_game_search(app_id: int = Path(gt=0, le=MAX_APP_ID)):
    """Count a search for a game (picked from search or analyzed by App ID)."""
    # The name comes from Steam, never the browser, so the trending cards
    # only ever show real game titles
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
def game_details(app_id: int = Path(gt=0, le=MAX_APP_ID)):
    """
    Return developer, release date, price and header image from Steam.
    Works before the game has been analyzed.
    """
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

    # Prefer Steam's official header image.
    # Fall back to the standard Steam header URL if it is missing.
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


@app.post("/api/analyze/{app_id}")
def analyze_game(
    request: Request,
    app_id: int = Path(gt=0, le=MAX_APP_ID),
    refresh: bool = False,
    max_reviews: int = Query(500, ge=50, le=5000),
    days: int | None = Query(None, ge=1, le=3650),
):

    client_ip = request.client.host if request.client else "unknown"

    if not check_analysis_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Too many analysis requests. Please wait a minute and try again.",
            headers={"Retry-After": str(ANALYSIS_RATE_WINDOW)},
        )
    """
    Collect, filter and store reviews if they aren't stored yet
    (or refresh=true), then return the analysis.
    """
    try:
        stored = pipeline.load_game(app_id)

        if refresh or stored is None or not stored["reviews"]:
            # Don't crawl Steam for a game that has nothing to review yet
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

    return build_analysis(within_days(stored, days))



@app.get("/api/games/{app_id}/analysis")
def get_analysis(
    app_id: int = Path(gt=0, le=MAX_APP_ID),
    days: int | None = Query(None, ge=1, le=3650),
):
    return build_analysis(load_stored(app_id, days))


@app.get("/api/games/{app_id}/issues")
def get_issues(
    app_id: int = Path(gt=0, le=MAX_APP_ID),
    min_mentions: int = Query(MIN_ISSUE_COMPLAINTS, ge=1, le=5000),
    days: int | None = Query(None, ge=1, le=3650),
):
    stored = load_stored(app_id, days)
    report = build_issues(stored, min_mentions)

    try:
        statuses = pipeline.load_issue_statuses(stored["game"]["game_id"])
    except MySQLError as error:
        raise database_error(error) from error

    for issue in report["issues"]:
        issue["status"] = statuses.get(issue["name"], "Detected")

    return report


class IssueStatusUpdate(BaseModel):
    status: Literal["Detected", "Investigating", "In Progress", "Resolved"]


@app.patch("/api/games/{app_id}/issues/{topic}/status")
def update_issue_status(
    update: IssueStatusUpdate,
    app_id: int = Path(gt=0, le=MAX_APP_ID),
    topic: str = Path(max_length=50),
):
    if topic not in TOPIC_PATTERNS:
        raise HTTPException(status_code=404, detail="Unknown issue topic.")

    try:
        game_id = pipeline.find_game_id(app_id)
        if game_id is None:
            raise HTTPException(
                status_code=404,
                detail=f"App ID {app_id} hasn't been analyzed yet.",
            )
        pipeline.save_issue_status(game_id, topic, update.status)
    except MySQLError as error:
        raise database_error(error) from error

    return {"topic": topic, "status": update.status}


@app.get("/api/topics")
def list_topics():
    return list(TOPIC_PATTERNS)


@app.get("/api/topics/{topic}/games")
def search_topic(
    topic: str = Path(max_length=50),
    min_mentions: int = Query(5, ge=1, le=5000),
    days: int | None = Query(None, ge=1, le=3650),
):
    """
    Issue Search: how players talk about one topic in every analyzed game,
    with each game's saved status for that issue.
    """
    if topic not in TOPIC_PATTERNS:
        raise HTTPException(status_code=404, detail="Unknown issue topic.")

    results = []
    try:
        for game in pipeline.list_games():
            stored = pipeline.load_game(game["app_id"])
            if stored is None:
                continue

            reviews = reviews_within(stored["reviews"], days)
            if not reviews:
                continue

            standing = topic_standing({**stored, "reviews": reviews}, topic)
            if standing["mentions"] < min_mentions:
                continue

            statuses = pipeline.load_issue_statuses(stored["game"]["game_id"])
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

    return {"topic": topic, "minMentions": min_mentions, "games": results}


@app.get("/api/games/{app_id}/reviews")
def get_review_cards(
    app_id: int = Path(gt=0, le=MAX_APP_ID),
    limit: int = Query(300, ge=1, le=2000),
    days: int | None = Query(None, ge=1, le=3650),
):
    return build_review_cards(load_stored(app_id, days))[:limit]
