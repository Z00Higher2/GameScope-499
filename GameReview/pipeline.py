"""
GameScope pipeline: runs every step for one game with no prompts,
so the API can call it when someone presses Analyze.

    Steam -> SteamGameReviewer_.py -> filter_reviews.py -> csv_to_mysql_.py -> MySQL

The three scripts still work on their own from the command line.
"""

import json
import re
from pathlib import Path

import SteamGameReviewer_ as collector
import csv_to_mysql_ as importer
from filter_reviews import filter_reviews

SCHEMA_FILE = Path(__file__).with_name(
    "GameScope Project (game review databse).sql"
)

_schema_ready = False


# ==========================================
# Pipeline Errors
# ==========================================

class PipelineError(Exception):
    """The pipeline ran, but there is nothing usable to save."""


class GameNotFound(PipelineError):
    """Steam has no game with this App ID."""


# ==========================================
# Create the Database and Tables if Missing
# Runs the CREATE TABLE statements from the team's .sql file
# ==========================================

def ensure_schema():
    global _schema_ready
    if _schema_ready:
        return

    database = importer.DATABASE
    if not re.fullmatch(r"[A-Za-z0-9_]+", database):
        raise ValueError(f"Invalid MYSQL_DATABASE name: {database!r}")

    create_tables = []
    for statement in SCHEMA_FILE.read_text(encoding="utf-8-sig").split(";"):
        sql = "\n".join(
            line
            for line in statement.splitlines()
            if not line.strip().startswith("--")
        ).strip()
        if re.match(r"create\s+table", sql, re.IGNORECASE):
            create_tables.append(sql)

    connection = importer.connect_database(use_database=True)
    try:
        cursor = connection.cursor()
        for sql in create_tables:
            cursor.execute(sql)
        cursor.close()
    finally:
        connection.close()

    _schema_ready = True


def check_database():
    ensure_schema()
    importer.connect_database().close()


# ==========================================
# Run the Whole Pipeline for One Game
# ==========================================

def run_pipeline(app_id, max_reviews=500, language="english"):
    ensure_schema()

    try:
        game = collector.get_game_details(app_id)
    except ValueError as error:
        raise GameNotFound(str(error)) from error
    if not game["game_name"]:
        raise GameNotFound(f"Steam returned no game name for App ID {app_id}.")

    # The importer requires these, and unreleased games often lack them.
    # Check before downloading reviews so the message is clear and fast.
    missing = [
        label
        for field, label in (
            ("game_release_date", "a release date"),
            ("game_developer", "a developer"),
            ("game_price", "a price"),
        )
        if not game[field]
    ]
    if missing:
        raise PipelineError(
            f"Steam doesn't list {' or '.join(missing)} for {game['game_name']} "
            "(it may not be released yet), so GameScope can't store it."
        )

    reviews = collector.get_reviews(app_id, max_reviews, language)
    if not reviews:
        raise PipelineError(
            f"Steam has no {language} reviews for {game['game_name']}."
        )

    kept, removed = filter_reviews(reviews)
    if not kept:
        raise PipelineError(
            f"None of the {len(reviews)} reviews for {game['game_name']} "
            "passed the junk filter."
        )

    # Same shape as steam_reviews_filtered_<id>.csv, so the importer's
    # checks run exactly as they do for CSV files
    rows = [as_csv_row(app_id, game, review) for review in kept]
    game_data, review_rows = importer.parse_rows(rows, app_id)

    connection = importer.connect_database()
    try:
        game_id, imported, skipped = importer.import_reviews(
            connection, game_data, review_rows, f"steam_api_{app_id}"
        )
        save_filter_run(connection, game_id, len(reviews), len(kept), removed)
    finally:
        connection.close()

    return {
        "collected": len(reviews),
        "kept": len(kept),
        "removed": removed,
        "imported": imported,
        "skipped": skipped,
    }


def as_csv_row(app_id, game, review):
    row = {"app_id": app_id, **game, **review}
    return {
        key: "" if value is None else str(value)
        for key, value in row.items()
    }


# ==========================================
# Record What the Junk Filter Removed
# ==========================================

def save_filter_run(connection, game_id, collected, kept, removed):
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO review_filter_runs (
                game_id, reviews_collected, reviews_kept, removed_reasons
            )
            VALUES (%s, %s, %s, %s)
            """,
            (game_id, collected, kept, json.dumps(removed)),
        )
        connection.commit()
    finally:
        cursor.close()


# ==========================================
# Read Everything Stored for One Game
# Returns None if the game was never analyzed
# ==========================================

def load_game(app_id):
    ensure_schema()

    connection = importer.connect_database()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT game_id, app_id, game_name, game_release_date,
                   game_developer, game_publisher, game_price
            FROM games
            WHERE app_id = %s
            """,
            (app_id,),
        )
        games = cursor.fetchall()
        if not games:
            return None
        game = games[0]

        cursor.execute(
            """
            SELECT review_id, review_text, recommended, playtime_hours,
                   playtime_at_review_hours, helpful_votes, created_at
            FROM reviews
            WHERE game_id = %s
            """,
            (game["game_id"],),
        )
        reviews = cursor.fetchall()

        cursor.execute(
            """
            SELECT reviews_collected, reviews_kept, removed_reasons
            FROM review_filter_runs
            WHERE game_id = %s
            ORDER BY run_id DESC
            LIMIT 1
            """,
            (game["game_id"],),
        )
        runs = cursor.fetchall()

        cursor.execute(
            """
            SELECT MAX(import_completed_at) AS analyzed_at
            FROM reviews_import
            WHERE game_id = %s AND status = 'Completed'
            """,
            (game["game_id"],),
        )
        analyzed_at = cursor.fetchall()[0]["analyzed_at"]
        cursor.close()
    finally:
        connection.close()

    filter_run = None
    if runs:
        filter_run = {
            "collected": runs[0]["reviews_collected"],
            "kept": runs[0]["reviews_kept"],
            "removed": json.loads(runs[0]["removed_reasons"] or "{}"),
        }

    return {
        "game": game,
        "reviews": reviews,
        "filter_run": filter_run,
        "analyzed_at": analyzed_at,
    }
