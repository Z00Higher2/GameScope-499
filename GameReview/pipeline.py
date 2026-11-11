
"""
GameScope pipeline: runs every step for one game with no prompts,
so the API can call it when someone presses Analyze.

Steam -> SteamGameReviewer_.py -> filter_reviews.py
      -> csv_to_mysql_.py -> MySQL

The three scripts still work on their own from the command line.
"""

import json
import re
from pathlib import Path

import SteamGameReviewer_ as collector
import csv_to_mysql_ as importer
import steam_updates
from filter_reviews import filter_reviews


# ==========================================
# Database Schema Initialization
# ==========================================

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
# Create Database Tables if Missing
# Runs CREATE TABLE statements from the team's SQL file
# ==========================================

def ensure_schema():
    global _schema_ready

    if _schema_ready:
        return

    database = importer.DATABASE

    if not re.fullmatch(r"[A-Za-z0-9_]+", database):
        raise ValueError(f"Invalid MYSQL_DATABASE name: {database!r}")

    if not SCHEMA_FILE.exists():
        raise FileNotFoundError(
            f"Database schema file not found: {SCHEMA_FILE}"
        )

    # Remove comment lines before splitting SQL statements.
    # This prevents semicolons inside comments from interfering.
    schema = "\n".join(
        line
        for line in SCHEMA_FILE.read_text(
            encoding="utf-8-sig"
        ).splitlines()
        if not line.strip().startswith("--")
    )

    create_tables = [
        sql
        for sql in (
            statement.strip()
            for statement in schema.split(";")
        )
        if re.match(
            r"create\s+table",
            sql,
            re.IGNORECASE
        )
    ]

    connection = importer.connect_database(use_database=True)

    try:
        cursor = connection.cursor()

        try:
            for sql in create_tables:
                cursor.execute(sql)

        finally:
            cursor.close()

    finally:
        connection.close()

    _schema_ready = True


# ==========================================
# Database Connection Check
# ==========================================

def check_database():
    ensure_schema()

    db_connection = importer.connect_database()

    try:
        cursor = db_connection.cursor()

        try:
            cursor.execute("SELECT 1")
            cursor.fetchone()

        finally:
            cursor.close()

    finally:
        db_connection.close()


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
        raise GameNotFound(
            f"Steam returned no game name for App ID {app_id}."
        )

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
            f"Steam doesn't list {' or '.join(missing)} for "
            f"{game['game_name']} "
            "(it may not be released yet), so GameScope can't store it."
        )

    reviews = collector.get_reviews(
        app_id,
        max_reviews,
        language
    )

    if not reviews:
        raise PipelineError(
            f"Steam has no {language} reviews for {game['game_name']}."
        )

    kept, removed = filter_reviews(reviews)

    if not kept:
        raise PipelineError(
            f"None of the {len(reviews)} reviews for "
            f"{game['game_name']} passed the junk filter."
        )

    # Same shape as steam_reviews_filtered_<id>.csv,
    # so the importer's checks run exactly as they do for CSV files.

    rows = [
        as_csv_row(app_id, game, review)
        for review in kept
    ]

    game_data, review_rows = importer.parse_rows(rows, app_id)

    connection = importer.connect_database()

    try:
        game_id, imported, skipped = importer.import_reviews(
            connection,
            game_data,
            review_rows,
            f"steam_api_{app_id}"
        )

        save_filter_run(
            connection,
            game_id,
            len(reviews),
            len(kept),
            removed
        )

    finally:
        connection.close()

    # Patch Impact compares reviews before and after each announcement.
    # Steam's news feed failing shouldn't fail the analysis itself.

    try:
        refresh_updates(app_id, game_id)

    except Exception as error:  # noqa: BLE001 - best effort
        print(
            f"Couldn't collect announcements for {app_id}: {error}"
        )

    return {
        "collected": len(reviews),
        "kept": len(kept),
        "removed": removed,
        "imported": imported,
        "skipped": skipped,
    }


def as_csv_row(app_id, game, review):
    row = {
        "app_id": app_id,
        **game,
        **review
    }

    return {
        key: "" if value is None else str(value)
        for key, value in row.items()
    }


# ==========================================
# Record What the Junk Filter Removed
# ==========================================

def save_filter_run(
    connection,
    game_id,
    collected,
    kept,
    removed
):
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO review_filter_runs (
                game_id,
                reviews_collected,
                reviews_kept,
                removed_reasons
            )
            VALUES (%s, %s, %s, %s)
            """,
            (
                game_id,
                collected,
                kept,
                json.dumps(removed)
            )
        )

        connection.commit()

    finally:
        cursor.close()


# ==========================================
# Read Everything Stored for One Game
# Returns None if the game was never analyzed
# ==========================================

def load_game(app_id):

    connection = importer.connect_database()

    try:
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                game_id,
                app_id,
                game_name,
                game_release_date,
                game_developer,
                game_publisher,
                game_price
            FROM games
            WHERE app_id = %s
            """,
            (app_id,)
        )

        games = cursor.fetchall()

        if not games:
            return None

        game = games[0]

        cursor.execute(
            """
            SELECT
                review_id,
                review_text,
                recommended,
                playtime_hours,
                playtime_at_review_hours,
                helpful_votes,
                created_at
            FROM reviews
            WHERE game_id = %s
            """,
            (game["game_id"],)
        )

        reviews = cursor.fetchall()

        cursor.execute(
            """
            SELECT
                reviews_collected,
                reviews_kept,
                removed_reasons
            FROM review_filter_runs
            WHERE game_id = %s
            ORDER BY run_id DESC
            LIMIT 1
            """,
            (game["game_id"],)
        )

        runs = cursor.fetchall()

        cursor.execute(
            """
            SELECT MAX(import_completed_at) AS analyzed_at
            FROM reviews_import
            WHERE game_id = %s
              AND status = 'Completed'
            """,
            (game["game_id"],)
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
            "removed": json.loads(
                runs[0]["removed_reasons"] or "{}"
            ),
        }

    return {
        "game": game,
        "reviews": reviews,
        "filter_run": filter_run,
        "analyzed_at": analyzed_at,
    }


# ==========================================
# Issue Statuses Set on the Issues Page
# ==========================================

def list_games():
    """Every game that has stored reviews, for Issue Search."""

    connection = importer.connect_database()

    try:
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT app_id, game_name
            FROM games
            WHERE EXISTS (
                SELECT 1
                FROM reviews
                WHERE reviews.game_id = games.game_id
            )
            ORDER BY game_name
            """
        )

        games = cursor.fetchall()
        cursor.close()

    finally:
        connection.close()

    return games


# ==========================================
# Game Search Tracking
# ==========================================

def record_search(app_id, game_name=None):
    """Count one search for a game and return its new total."""

    ensure_schema()

    connection = importer.connect_database()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            INSERT INTO game_searches (
                app_id,
                game_name,
                searches
            )
            VALUES (%s, %s, 1)

            ON DUPLICATE KEY UPDATE
                searches = searches + 1,
                game_name = COALESCE(
                    VALUES(game_name),
                    game_name
                )
            """,
            (app_id, game_name)
        )

        connection.commit()

        cursor.execute(
            """
            SELECT searches
            FROM game_searches
            WHERE app_id = %s
            """,
            (app_id,)
        )

        searches = cursor.fetchone()[0]
        cursor.close()

    finally:
        connection.close()

    return searches


# ==========================================
# Trending Games
# ==========================================

def load_trending(limit):
    """The most-searched games, most first (only games Steam named)."""

    ensure_schema()

    connection = importer.connect_database()

    try:
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                app_id,
                game_name,
                searches
            FROM game_searches
            WHERE searches > 0
              AND game_name IS NOT NULL
            ORDER BY searches DESC, last_searched_at DESC
            LIMIT %s
            """,
            (limit,)
        )

        rows = cursor.fetchall()
        cursor.close()

    finally:
        connection.close()

    return rows


# ==========================================
# Find Game ID
# ==========================================

def find_game_id(app_id):

    connection = importer.connect_database()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT game_id
            FROM games
            WHERE app_id = %s
            """,
            (app_id,)
        )

        row = cursor.fetchone()
        cursor.close()

    finally:
        connection.close()

    return row[0] if row else None


# ==========================================
# Issue Status Management
# ==========================================

def load_issue_statuses(game_id):

    connection = importer.connect_database()

    try:
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT topic, status
            FROM issue_statuses
            WHERE game_id = %s
            """,
            (game_id,)
        )

        rows = cursor.fetchall()
        cursor.close()

    finally:
        connection.close()

    return {
        row["topic"]: row["status"]
        for row in rows
    }


def save_issue_status(game_id, topic, status):

    connection = importer.connect_database()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            INSERT INTO issue_statuses (
                game_id,
                topic,
                status
            )
            VALUES (%s, %s, %s)

            ON DUPLICATE KEY UPDATE
                status = VALUES(status)
            """,
            (game_id, topic, status)
        )

        connection.commit()
        cursor.close()

    finally:
        connection.close()


# ==========================================
# Developer Announcements (Patch Impact)
# Collected by steam_updates.py
# Stored in game_updates
# ==========================================

MAX_UPDATES = 100


def refresh_updates(app_id, game_id):
    """Collect the game's latest Steam announcements and store them."""

    updates = steam_updates.get_updates(
        app_id,
        max_posts=MAX_UPDATES
    )

    save_updates(game_id, updates)

    return len(updates)


def save_updates(game_id, updates):

    if not updates:
        return

    connection = importer.connect_database()

    try:
        cursor = connection.cursor()

        cursor.executemany(
            """
            INSERT INTO game_updates (
                update_id,
                game_id,
                title,
                url,
                posted_at,
                is_patch_notes
            )
            VALUES (%s, %s, %s, %s, %s, %s)

            ON DUPLICATE KEY UPDATE
                title = VALUES(title),
                url = VALUES(url),
                posted_at = VALUES(posted_at),
                is_patch_notes = VALUES(is_patch_notes)
            """,
            [
                (
                    str(update["update_id"])[:32],
                    game_id,
                    (
                        update["title"]
                        or "Untitled announcement"
                    )[:255],
                    (
                        update["url"][:512]
                        if update["url"]
                        else None
                    ),
                    update["posted_at"],
                    bool(update["is_patch_notes"]),
                )
                for update in updates
            ]
        )

        connection.commit()
        cursor.close()

    finally:
        connection.close()


def load_updates(game_id):
    """Stored announcements for a game, oldest first."""

    connection = importer.connect_database()

    try:
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                update_id,
                title,
                url,
                posted_at,
                is_patch_notes
            FROM game_updates
            WHERE game_id = %s
            ORDER BY posted_at
            """,
            (game_id,)
        )

        rows = cursor.fetchall()
        cursor.close()

    finally:
        connection.close()

    return rows
