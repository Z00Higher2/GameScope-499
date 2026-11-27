import csv
import json
import os
import sys
import unicodedata
from datetime import datetime
from decimal import Decimal, InvalidOperation

import mysql.connector
from dotenv import load_dotenv
from mysql.connector import Error

# ==========================================
# Database Configuration
# Settings come from GameReview/.env (see .env.example)
# ==========================================

load_dotenv()

DATABASE = os.getenv("MYSQL_DATABASE", "game_reviews")
MAX_APP_ID = 4_294_967_295
MAX_TAG_NAME_LENGTH = 191
TAG_SOURCES = {"genre", "category", "community", "user"}
REFRESHABLE_TAG_SOURCES = {"genre", "category", "community"}

# ==========================================
# Convert and Validate Dates
# ==========================================

def parse_date(value):
    value = (value or "").strip()
    for date_format in ("%Y-%m-%d", "%d %b, %Y", "%b %d, %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(value, date_format).date()
        except ValueError:
            continue
    raise ValueError(
        f"Invalid or missing game release date: {value or '(empty)'}. "
        "The games table requires a valid release date."
    )

# ==========================================
# Convert and Validate Review Timestamps
# Empty is allowed (older CSVs have no review dates)
# ==========================================

def parse_datetime(value, field_name):
    normalized = (value or "").strip()
    if not normalized:
        return None
    try:
        return datetime.strptime(normalized, "%Y-%m-%d %H:%M:%S")
    except ValueError as error:
        raise ValueError(f"Invalid {field_name} value: {value!r}") from error

# ==========================================
# Convert and Validate Boolean Values
# ==========================================

def parse_bool(value, field_name):
    normalized = (value or "").strip().lower()
    if normalized in ("true", "1", "yes"):
        return 1
    if normalized in ("false", "0", "no"):
        return 0
    raise ValueError(f"Invalid {field_name} value: {value!r}")

# ==========================================
# Convert and Validate Decimal Numbers
# ==========================================

def parse_decimal(value, field_name, allow_empty=False):
    normalized = (value or "").strip()
    if not normalized and allow_empty:
        return None
    try:
        number = Decimal(normalized)
    except InvalidOperation as error:
        raise ValueError(f"Invalid {field_name} value: {value!r}") from error
    if not number.is_finite() or number < 0:
        raise ValueError(f"{field_name} must be a non-negative number.")
    return number

# ==========================================
# Check Required Text Fields
# ==========================================

def required_text(row, field_name):
    value = (row.get(field_name) or "").strip()
    if not value:
        raise ValueError(f"CSV is missing a value for {field_name}.")
    return value


def normalize_tag_name(value):
    if not isinstance(value, str):
        return ""
    return " ".join(unicodedata.normalize("NFKC", value).split())


def parse_game_tags(value):
    if not (value or "").strip():
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as error:
        raise ValueError("game_tags must contain a JSON array.") from error
    if not isinstance(parsed, list):
        raise ValueError("game_tags must contain a JSON array.")

    tags = []
    seen = set()
    for item in parsed:
        if not isinstance(item, dict):
            raise ValueError("Each game tag must be a JSON object.")
        name = normalize_tag_name(item.get("tag_name"))
        source = item.get("tag_source")
        rank = item.get("tag_rank")
        if not name or len(name) > MAX_TAG_NAME_LENGTH:
            raise ValueError("Tag names must contain 1 to 191 characters.")
        if not isinstance(source, str) or source not in TAG_SOURCES:
            raise ValueError(f"Invalid tag source: {source!r}.")
        if rank is not None and (
            isinstance(rank, bool)
            or not isinstance(rank, int)
            or not 0 < rank <= MAX_APP_ID
        ):
            raise ValueError(f"Invalid tag rank for {name!r}.")
        key = (source, name.casefold())
        if key in seen:
            continue
        seen.add(key)
        tags.append(
            {
                "tag_name": name,
                "tag_source": source,
                "tag_rank": rank,
            }
        )
    return tags


def parse_tag_sources(value):
    if not (value or "").strip():
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as error:
        raise ValueError(
            "tag_sources_refreshed must contain a JSON array."
        ) from error
    if not isinstance(parsed, list):
        raise ValueError("tag_sources_refreshed must contain a JSON array.")

    sources = []
    for source in parsed:
        if not isinstance(source, str) or source not in REFRESHABLE_TAG_SOURCES:
            raise ValueError(f"Invalid refreshed tag source: {source!r}.")
        if source not in sources:
            sources.append(source)
    return sources


def sync_game_tags(cursor, game_id, tags, refreshed_sources):
    if refreshed_sources:
        placeholders = ", ".join(["%s"] * len(refreshed_sources))
        cursor.execute(
            f"""
            DELETE assignment
            FROM game_tag_assignments assignment
            JOIN game_tags tag ON tag.tag_id = assignment.tag_id
            WHERE assignment.game_id = %s
                AND tag.tag_source IN ({placeholders})
            """,
            (game_id, *refreshed_sources),
        )

    for tag in tags or []:
        cursor.execute(
            """
            INSERT INTO game_tags (tag_name, tag_source)
            VALUES (%s, %s)
            ON DUPLICATE KEY UPDATE tag_name = VALUES(tag_name)
            """,
            (tag["tag_name"], tag["tag_source"]),
        )
        cursor.execute(
            """
            SELECT tag_id
            FROM game_tags
            WHERE tag_name = %s AND tag_source = %s
            """,
            (tag["tag_name"], tag["tag_source"]),
        )
        tag_id = cursor.fetchone()[0]
        cursor.execute(
            """
            INSERT INTO game_tag_assignments (game_id, tag_id, tag_rank)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE tag_rank = VALUES(tag_rank)
            """,
            (game_id, tag_id, tag["tag_rank"]),
        )

# ==========================================
# Read and Validate the CSV File
# ==========================================

def load_csv(input_file, requested_app_id):
    required_columns = {
        "game_name",
        "app_id",
        "game_release_date",
        "game_description",
        "game_developer",
        "game_publisher",
        "game_price",
        "review_id",
        "review_text",
        "recommended",
        "playtime_hours",
        "playtime_at_review_hours",
        "helpful_votes",
        "language",
    }

    with open(input_file, "r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        missing = required_columns.difference(reader.fieldnames or [])
        if missing:
            raise ValueError(
                "CSV is missing required columns: " + ", ".join(sorted(missing))
            )
        rows = list(reader)

    return parse_rows(rows, requested_app_id)

# ==========================================
# Validate Rows and Convert Them for MySQL
# Used for CSV files and by pipeline.py for live Steam data
# ==========================================

def parse_rows(rows, requested_app_id):
    if not rows:
        raise ValueError("The filtered CSV contains no reviews to import.")

    games = []
    reviews = []
    tag_payloads = []
    for line_number, row in enumerate(rows, start=2):
        try:
            app_id = int(required_text(row, "app_id"))
            if app_id != requested_app_id:
                raise ValueError(
                    f"CSV app_id {app_id} does not match requested App ID "
                    f"{requested_app_id}."
                )
            if not 0 < app_id <= MAX_APP_ID:
                raise ValueError("App ID is outside the MySQL INT UNSIGNED range.")

            game_name = required_text(row, "game_name")
            game_developer = required_text(row, "game_developer")
            release_date = parse_date(row.get("game_release_date"))
            game_price = parse_decimal(row.get("game_price"), "game_price")
            review_id = required_text(row, "review_id")
            playtime = parse_decimal(row.get("playtime_hours"), "playtime_hours")
            playtime_at_review = parse_decimal(
                row.get("playtime_at_review_hours"),
                "playtime_at_review_hours",
            )
            helpful_votes = int((row.get("helpful_votes") or "0").strip() or "0")
            if helpful_votes < 0:
                raise ValueError("helpful_votes cannot be negative.")
            # SteamGameReviewer_.py names these review_posted_at and
            # review_updated_at; older CSV files use created_at/updated_at
            created_at = parse_datetime(
                row.get("review_posted_at") or row.get("created_at"),
                "review_posted_at",
            )
            updated_at = parse_datetime(
                row.get("review_updated_at") or row.get("updated_at"),
                "review_updated_at",
            )
            game_tags = (
                parse_game_tags(row.get("game_tags"))
                if "game_tags" in row
                else None
            )
            refreshed_sources = (
                parse_tag_sources(row.get("tag_sources_refreshed"))
                if "tag_sources_refreshed" in row
                else []
            )
        except (ValueError, InvalidOperation) as error:
            raise ValueError(f"Invalid CSV data on line {line_number}: {error}") from error

        games.append(
            (
                app_id,
                game_name,
                release_date,
                row.get("game_description") or None,
                game_developer,
                (row.get("game_publisher") or "").strip() or None,
                game_price,
            )
        )
        reviews.append(
            (
                review_id,
                (row.get("review_text") or "").strip() or None,
                parse_bool(row.get("recommended"), "recommended"),
                playtime,
                playtime_at_review,
                helpful_votes,
                (row.get("language") or "").strip() or None,
                created_at,
                updated_at,
            )
        )
        tag_payloads.append((game_tags, refreshed_sources))

    game_data = games[0]
    if any(game != game_data for game in games[1:]):
        raise ValueError("Game metadata differs between rows in the CSV.")
    tag_data = tag_payloads[0]
    if any(tags != tag_data for tags in tag_payloads[1:]):
        raise ValueError("Game tags differ between rows in the CSV.")
    return game_data, reviews, tag_data

# ==========================================
# Connect to MySQL Database
# ==========================================


def connect_database(use_database=True):
    user = os.getenv("MYSQL_USER")
    password = os.getenv("MYSQL_PASSWORD")

    if not user or not password:
        raise RuntimeError(
            "MYSQL_USER and MYSQL_PASSWORD must be configured."
    )
    settings = {
        "host": os.getenv("MYSQL_HOST", "localhost"),
        "port": int(os.getenv("MYSQL_PORT", "3306")),
        "user": user,
        "password": password,
    }

    # Enable SSL certificate verification when a CA certificate is configured.
    ssl_ca = os.getenv("MYSQL_SSL_CA")
    if ssl_ca:
        settings["ssl_ca"] = ssl_ca
        settings["ssl_verify_cert"] = True

    # Include the database only when requested.
    if use_database:
        settings["database"] = DATABASE

    return mysql.connector.connect(**settings)


# ==========================================
# Import Game and Reviews into MySQL
# ==========================================

def import_reviews(connection, game_data, reviews, input_file, tag_data=None):
    cursor = connection.cursor()
    import_id = None
    game_id = None
    imported = 0
    skipped = 0
    reviews_committed = False

    try:
        cursor.execute(
            "SELECT game_id FROM games WHERE app_id = %s ORDER BY game_id",
            (game_data[0],),
        )
        existing_games = cursor.fetchall()
        if len(existing_games) > 1:
            raise ValueError(
                f"More than one games row has App ID {game_data[0]}; "
                "resolve the duplicate before importing."
            )

        if existing_games:
            game_id = existing_games[0][0]
            cursor.execute(
                """
                UPDATE games
                SET game_name = %s, game_release_date = %s,
                    game_description = %s, game_developer = %s,
                    game_publisher = %s, game_price = %s
                WHERE game_id = %s
                """,
                (*game_data[1:], game_id),
            )
        else:
            cursor.execute(
                """
                INSERT INTO games (
                    app_id, game_name, game_release_date, game_description,
                    game_developer, game_publisher, game_price
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                game_data,
            )
            game_id = cursor.lastrowid
        if tag_data is not None:
            tags, refreshed_sources = tag_data
            sync_game_tags(cursor, game_id, tags, refreshed_sources)
        connection.commit()

        cursor.execute(
            """
            INSERT INTO reviews_import (
                game_id, source_filename, reviews_in_file, status
            )
            VALUES (%s, %s, %s, 'Started')
            """,
            (game_id, os.path.basename(input_file), len(reviews)),
        )
        import_id = cursor.lastrowid
        connection.commit()

        for review in reviews:
            cursor.execute(
                """
                INSERT INTO reviews (
                    game_id, review_id, review_text, recommended,
                    playtime_hours, playtime_at_review_hours,
                    helpful_votes, language, created_at, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    -- Fill in dates missing from earlier imports; an
                    -- already-stored review is otherwise left unchanged
                    created_at = COALESCE(created_at, VALUES(created_at)),
                    updated_at = COALESCE(updated_at, VALUES(updated_at))
                """,
                (game_id, *review),
            )
            if cursor.rowcount == 1:
                imported += 1
            else:
                skipped += 1

        connection.commit()
        reviews_committed = True
        cursor.execute(
            """
            UPDATE reviews_import
            SET import_completed_at = CURRENT_TIMESTAMP,
                reviews_imported = %s, reviews_skipped = %s,
                status = 'Completed'
            WHERE import_id = %s
            """,
            (imported, skipped, import_id),
        )
        connection.commit()
        return game_id, imported, skipped
    except Exception as error:
        connection.rollback()
        if import_id is not None:
            if not reviews_committed:
                imported = 0
                skipped = 0
            try:
                cursor.execute(
                    """
                    UPDATE reviews_import
                    SET import_completed_at = CURRENT_TIMESTAMP,
                        reviews_imported = %s, reviews_skipped = %s,
                        status = 'Failed', error_message = %s
                    WHERE import_id = %s
                    """,
                    (imported, skipped, str(error), import_id),
                )
                connection.commit()
            except Error as status_error:
                connection.rollback()
                raise RuntimeError(
                    f"Import failed ({error}); also failed to record its status "
                    f"({status_error})."
                ) from status_error
        raise
    finally:
        cursor.close()

# ==========================================
# Main Program
# Ask for App ID and import the matching CSV
# ==========================================

def main():
    app_id_input = input("Enter Steam App ID: ").strip()
    if not app_id_input.isdigit() or int(app_id_input) <= 0:
        print("Error: enter a positive numeric Steam App ID.")
        return 1
    app_id = int(app_id_input)
    input_file = f"steam_reviews_filtered_{app_id}.csv"

    try:
        game_data, reviews, tag_data = load_csv(input_file, app_id)
    except (OSError, ValueError) as error:
        print(f"Error: {error}")
        return 1

    connection = None
    try:
        connection = connect_database()
        game_id, imported, skipped = import_reviews(
            connection, game_data, reviews, input_file, tag_data
        )
    except (Error, ValueError, RuntimeError) as error:
        print(f"Import failed: {error}")
        return 1
    finally:
        if connection is not None and connection.is_connected():
            connection.close()

    print(f"Game: {game_data[1]} (game_id={game_id})")
    print(f"Reviews in file: {len(reviews)}")
    print(f"Reviews imported: {imported}")
    print(f"Duplicate reviews skipped: {skipped}")
    print("Import status recorded as Completed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
