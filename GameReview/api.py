
"""
GameScope API: connects the review pipeline and MySQL to the website.

Start it from the GameReview folder:

    python -m uvicorn api:app --reload --port 8000

The website's dev server forwards every /api request here
(see GameScope/vite.config.ts).
"""

import time

import requests
from fastapi import FastAPI, HTTPException, Path, Query
from mysql.connector import Error as MySQLError
from fastapi.middleware.cors import CORSMiddleware

import SteamGameReviewer_ as collector
import pipeline
from analysis import build_analysis, build_issues, build_review_cards


STEAM_SEARCH_URL = "https://store.steampowered.com/api/storesearch/"
MAX_APP_ID = 4_294_967_295

STEAM_IMAGE_BASE = (
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps"
)

# Steam rate-limits appdetails, so store details are cached for a while.
DETAILS_CACHE_SECONDS = 3600
DETAILS_CACHE_MAX = 256
_details_cache = {}


app = FastAPI(title="GameScope API")

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
    return HTTPException(
        status_code=503,
        detail=f"Can't reach MySQL ({error.msg or error}). Is the database running?",
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


def load_stored(app_id):
    try:
        stored = pipeline.load_game(app_id)
    except MySQLError as error:
        raise database_error(error) from error

    if stored is None or not stored["reviews"]:
        raise HTTPException(
            status_code=404,
            detail=f"App ID {app_id} hasn't been analyzed yet.",
        )

    return stored


# ==========================================
# Routes
# ==========================================

@app.get("/api/health")
def health():
    try:
        pipeline.check_database()
        database = "connected"
    except MySQLError as error:
        database = f"unavailable: {error.msg or error}"

    return {"status": "ok", "database": database}


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
        raise HTTPException(
            status_code=502,
            detail=f"Couldn't reach Steam search: {error}",
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


@app.get("/api/games/{app_id}/details")
def game_details(app_id: int = Path(gt=0, le=MAX_APP_ID)):
    """
    Return developer, release date, price and header image from Steam.
    Works before the game has been analyzed.
    """
    try:
        game = fetch_store_details(app_id)

    except ValueError as error:
        raise HTTPException(
            status_code=404,
            detail=str(error),
        ) from error

    except requests.RequestException as error:
        raise HTTPException(
            status_code=502,
            detail=f"Couldn't reach Steam: {error}",
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
    }


@app.post("/api/analyze/{app_id}")
def analyze_game(
    app_id: int = Path(gt=0, le=MAX_APP_ID),
    refresh: bool = False,
    max_reviews: int = Query(500, ge=50, le=5000),
):
    """
    Collect, filter and store reviews if they aren't stored yet
    (or refresh=true), then return the analysis.
    """
    try:
        stored = pipeline.load_game(app_id)

        if refresh or stored is None or not stored["reviews"]:
            pipeline.run_pipeline(app_id, max_reviews)
            stored = pipeline.load_game(app_id)

    except pipeline.GameNotFound as error:
        raise HTTPException(
            status_code=404,
            detail=str(error),
        ) from error

    except (pipeline.PipelineError, ValueError) as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error

    except requests.RequestException as error:
        raise HTTPException(
            status_code=502,
            detail=f"Couldn't reach Steam: {error}",
        ) from error

    except MySQLError as error:
        raise database_error(error) from error

    if stored is None or not stored["reviews"]:
        raise HTTPException(
            status_code=404,
            detail=f"No reviews were stored for App ID {app_id}.",
        )

    return build_analysis(stored)


@app.get("/api/games/{app_id}/analysis")
def get_analysis(app_id: int = Path(gt=0, le=MAX_APP_ID)):
    return build_analysis(load_stored(app_id))


@app.get("/api/games/{app_id}/issues")
def get_issues(app_id: int = Path(gt=0, le=MAX_APP_ID)):
    return build_issues(load_stored(app_id))


@app.get("/api/games/{app_id}/reviews")
def get_review_cards(
    app_id: int = Path(gt=0, le=MAX_APP_ID),
    limit: int = Query(300, ge=1, le=2000),
):
    return build_review_cards(load_stored(app_id))[:limit]
