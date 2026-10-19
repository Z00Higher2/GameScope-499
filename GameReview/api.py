"""
GameScope API: connects the review pipeline and MySQL to the website.

Start it from the GameReview folder:

    python -m uvicorn api:app --reload --port 8000

The website's dev server forwards every /api request here
(see GameScope/vite.config.ts).
"""

import requests
from fastapi import FastAPI, HTTPException, Path, Query
from mysql.connector import Error as MySQLError

import pipeline
from analysis import build_analysis, build_issues, build_review_cards

STEAM_SEARCH_URL = "https://store.steampowered.com/api/storesearch/"
MAX_APP_ID = 4_294_967_295

app = FastAPI(title="GameScope API")


# ==========================================
# Helpers
# ==========================================

def database_error(error):
    return HTTPException(
        status_code=503,
        detail=f"Can't reach MySQL ({error.msg or error}). Is the database running?",
    )


def load_stored(app_id):
    try:
        stored = pipeline.load_game(app_id)
    except MySQLError as error:
        raise database_error(error) from error
    if stored is None or not stored["reviews"]:
        raise HTTPException(
            status_code=404, detail=f"App ID {app_id} hasn't been analyzed yet."
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
    try:
        response = requests.get(
            STEAM_SEARCH_URL,
            params={"term": q, "l": "english", "cc": "US"},
            timeout=10,
        )
        response.raise_for_status()
    except requests.RequestException as error:
        raise HTTPException(
            status_code=502, detail=f"Couldn't reach Steam search: {error}"
        ) from error

    return [
        {"name": item["name"], "appId": str(item["id"])}
        for item in response.json().get("items", [])
        if item.get("type") == "app"
    ][:8]


@app.post("/api/analyze/{app_id}")
def analyze_game(
    app_id: int = Path(gt=0, le=MAX_APP_ID),
    refresh: bool = False,
    max_reviews: int = Query(500, ge=50, le=5000),
):
    """Collect, filter and store the game's reviews if they aren't stored
    yet (or refresh=true), then return the analysis."""
    try:
        stored = pipeline.load_game(app_id)
        if refresh or stored is None or not stored["reviews"]:
            pipeline.run_pipeline(app_id, max_reviews)
            stored = pipeline.load_game(app_id)
    except pipeline.GameNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except (pipeline.PipelineError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except requests.RequestException as error:
        raise HTTPException(
            status_code=502, detail=f"Couldn't reach Steam: {error}"
        ) from error
    except MySQLError as error:
        raise database_error(error) from error

    if stored is None or not stored["reviews"]:
        raise HTTPException(
            status_code=404, detail=f"No reviews were stored for App ID {app_id}."
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
