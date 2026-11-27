import csv
import json
import os
import re
import time
import unicodedata
from datetime import datetime, timezone

import requests

# ==========================================
# Steam API Endpoints
# ==========================================

STEAM_DETAILS_URL = "https://store.steampowered.com/api/appdetails"
STEAMSPY_DETAILS_URL = "https://steamspy.com/api.php"
STEAM_REVIEWS_URL = (
    "https://api.steampowered.com/"
    "IUserReviewsService/GetAppReviews/v1/"
)
STEAM_STORE_PAGE_URL = "https://store.steampowered.com/app/{app_id}/"
REVIEWS_FILTER_RECENT = 1
REVIEWS_TYPE_ALL = 0
REVIEWS_PURCHASE_TYPE_ALL = 1
MAX_TAG_NAME_LENGTH = 191


def normalize_tag_name(value):
    if not isinstance(value, str):
        return ""
    return " ".join(unicodedata.normalize("NFKC", value).split())


def extract_official_tags(data):
    tags = []
    for field, source in (("genres", "genre"), ("categories", "category")):
        values = data.get(field) or []
        if not isinstance(values, list):
            continue
        seen = set()
        for value in values:
            if not isinstance(value, dict):
                continue
            name = normalize_tag_name(value.get("description"))
            key = name.casefold()
            if not name or len(name) > MAX_TAG_NAME_LENGTH or key in seen:
                continue
            seen.add(key)
            tags.append(
                {
                    "tag_name": name,
                    "tag_source": source,
                    "tag_rank": len(seen),
                }
            )
    return tags


def extract_community_tags(payload):
    raw_tags = payload.get("tags")
    if not isinstance(raw_tags, dict):
        return None

    valid_tags = [
        (name, count)
        for name, count in raw_tags.items()
        if isinstance(name, str)
        and not isinstance(count, bool)
        and isinstance(count, int)
        and count >= 0
    ]
    tags = []
    for name, _ in sorted(
        valid_tags,
        key=lambda item: (-item[1], item[0].casefold()),
    ):
        normalized_name = normalize_tag_name(name)
        if not normalized_name or len(normalized_name) > MAX_TAG_NAME_LENGTH:
            continue
        tags.append(
            {
                "tag_name": normalized_name,
                "tag_source": "community",
                "tag_rank": len(tags) + 1,
            }
        )
    return tags


def get_community_tags(app_id):
    try:
        response = requests.get(
            STEAMSPY_DETAILS_URL,
            params={"request": "appdetails", "appid": app_id},
            timeout=15,
        )
        response.raise_for_status()
        payload = parse_steam_json(response, "community tags")
    except requests.RequestException as error:
        print(f"Warning: Steam community tags unavailable: {error}")
        return [], False

    if not isinstance(payload, dict):
        print("Warning: Steam community tags returned an invalid response.")
        return [], False

    tags = extract_community_tags(payload)
    if tags is None:
        print("Warning: Steam community tags were missing from the response.")
        return [], False
    return tags, True


def parse_user_tags(value):
    tags = []
    seen = set()
    for name in (value or "").split(","):
        normalized_name = normalize_tag_name(name)
        key = normalized_name.casefold()
        if len(normalized_name) > MAX_TAG_NAME_LENGTH:
            raise ValueError(
                f"User-defined tags must be at most "
                f"{MAX_TAG_NAME_LENGTH} characters: {normalized_name!r}"
            )
        if (
            normalized_name
            and key not in seen
        ):
            seen.add(key)
            tags.append(
                {
                    "tag_name": normalized_name,
                    "tag_source": "user",
                    "tag_rank": None,
                }
            )
    return tags


def parse_steam_json(response, endpoint):
    try:
        return response.json()
    except requests.exceptions.JSONDecodeError as error:
        content_type = response.headers.get("Content-Type", "unknown")
        raise requests.RequestException(
            f"Steam's {endpoint} endpoint returned a non-JSON response "
            f"(HTTP {response.status_code}, content type {content_type}, "
            f"final URL {response.url}). Steam may be redirecting or blocking "
            "the request; please wait and retry."
        ) from error


# ==========================================
# Convert Steam Release Date to Standard Format
# ==========================================

def parse_release_date(value):
    value = (value or "").strip()
    for date_format in ("%d %b, %Y", "%b %d, %Y", "%B %d, %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, date_format).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return ""

# ==========================================
# Get Early Access Release Date (store page)
# The public appdetails API does not include this field, so it is read
# from the store page. Returns "" if the game has none or the page layout
# changes.
# ==========================================

def get_early_access_date(app_id):
    try:
        response = requests.get(
            STEAM_STORE_PAGE_URL.format(app_id=app_id),
            params={"l": "english"},
            cookies={"birthtime": "0", "lastagecheckage": "1-0-1990",
                     "wants_mature_content": "1"},
            timeout=15,
        )
        response.raise_for_status()
    except requests.RequestException:
        return ""

    text = re.sub(r"<[^>]+>", " ", response.text)
    text = re.sub(r"\s+", " ", text)
    match = re.search(
        r"Early Access Release Date:?\s*"
        r"(\d{1,2} [A-Za-z]{3,9},? \d{4}|[A-Za-z]{3,9} \d{1,2},? \d{4})",
        text,
        re.IGNORECASE,
    )
    return parse_release_date(match.group(1).replace(",", ", ").replace(",  ", ", ")) if match else ""

# ==========================================
# Convert Steam Unix Timestamp to DATETIME (UTC)
# ==========================================

def format_timestamp(value):
    if not value:
        return ""
    return datetime.fromtimestamp(int(value), tz=timezone.utc).strftime(
        "%Y-%m-%d %H:%M:%S"
    )

# ==========================================
# Get Game Details from Steam
# ==========================================

def get_game_details(app_id):
    response = requests.get(
        STEAM_DETAILS_URL,
        # English US store, otherwise Steam answers in the requester's
        # local language and release dates no longer parse
        params={"appids": app_id, "l": "english", "cc": "us"},
        timeout=15,
    )
    response.raise_for_status()
    payload = parse_steam_json(response, "app details").get(str(app_id), {})
    if not payload.get("success"):
        raise ValueError(f"Steam could not find game App ID {app_id}.")

    data = payload.get("data", {})
    price_overview = data.get("price_overview")
    if data.get("is_free"):
        price = "0.00"
    elif price_overview and price_overview.get("final") is not None:
        price = f"{price_overview['final'] / 100:.2f}"
    else:
        price = ""

    release_info = data.get("release_date", {})
    tags = extract_official_tags(data)
    community_tags, community_tags_refreshed = get_community_tags(app_id)
    tags.extend(community_tags)
    refreshed_sources = ["genre", "category"]
    if community_tags_refreshed:
        refreshed_sources.append("community")

    return {
        "game_name": data.get("name", ""),
        "game_release_date": parse_release_date(release_info.get("date")),
        "game_early_access_release_date": get_early_access_date(app_id),
        "game_description": data.get("short_description", ""),
        "game_developer": ", ".join(data.get("developers") or []),
        "game_publisher": ", ".join(data.get("publishers") or []),
        "game_price": price,
        "game_tags": tags,
        "tag_sources_refreshed": refreshed_sources,
        # Not out yet (Steam shows "Coming soon" or "To be announced")
        "game_coming_soon": bool(release_info.get("coming_soon")),
        # Steam's genre id 70 is Early Access
        "game_early_access": any(
            str(genre.get("id")) == "70" for genre in data.get("genres") or []
        ),
    }

# ==========================================
# Collect Reviews from Steam
# ==========================================

def get_reviews(app_id, max_reviews=1000, language="english"):
    reviews = []
    review_ids = set()
    cursor = "*"
    api_key = os.getenv("STEAM_WEB_API_KEY", "").strip()

    print(f"Collecting up to {max_reviews} reviews for App ID {app_id}...")
    while len(reviews) < max_reviews:
        input_json = {
            "appid": app_id,
            "filter": REVIEWS_FILTER_RECENT,
            "languages": [language],
            "review_type": REVIEWS_TYPE_ALL,
            "purchase_type": REVIEWS_PURCHASE_TYPE_ALL,
            "num_per_page": 100,
            "cursor": cursor,
        }
        params = {"input_json": json.dumps(input_json)}
        if api_key:
            params["key"] = api_key

        response = requests.get(STEAM_REVIEWS_URL, params=params, timeout=15)
        response.raise_for_status()
        data = parse_steam_json(response, "reviews")
        if not isinstance(data, dict):
            raise ValueError("Steam's review API returned an invalid response.")
        response_data = data.get("response")
        if not isinstance(response_data, dict):
            raise ValueError("Steam's review API returned an invalid response.")

        batch = response_data.get("reviews")
        if not isinstance(batch, list):
            raise ValueError("Steam's review API returned an invalid reviews list.")
        if not batch:
            break

        for review in batch:
            review_id = review.get("recommendationid")
            if not review_id or review_id in review_ids:
                continue
            review_ids.add(review_id)
            author = review.get("author") or {}
            reviews.append(
                {
                    "review_id": review_id,
                    "review_text": review.get("review", ""),
                    "recommended": review.get("voted_up", False),
                    "playtime_hours": round(
                        (author.get("playtime_forever") or 0) / 60, 2
                    ),
                    "playtime_at_review_hours": round(
                        (author.get("playtime_at_review") or 0) / 60, 2
                    ),
                    "helpful_votes": review.get("votes_up") or 0,
                    "language": review.get("language", ""),
                    "written_during_early_access": bool(
                        review.get("written_during_early_access", False)
                    ),
                    "review_posted_at": format_timestamp(
                        review.get("timestamp_created")
                    ),
                    "review_updated_at": format_timestamp(
                        review.get("timestamp_updated")
                    ),
                }
            )
            if len(reviews) >= max_reviews:
                break

        print(f"Collected {len(reviews)} / {max_reviews} reviews")
        new_cursor = response_data.get("cursor")
        if not new_cursor or new_cursor == cursor:
            break
        cursor = new_cursor
        time.sleep(1)

    return reviews

# ==========================================
# Save Game and Review Data to CSV
# ==========================================

def save_reviews(reviews, app_id, game):
    filename = f"steam_reviews_{app_id}.csv"
    fieldnames = [
        "game_name",
        "app_id",
        "game_release_date",
        "game_description",
        "game_developer",
        "game_publisher",
        "game_price",
        "game_early_access_release_date",
        "game_tags",
        "tag_sources_refreshed",
        "review_id",
        "review_text",
        "recommended",
        "playtime_hours",
        "playtime_at_review_hours",
        "helpful_votes",
        "language",
        "written_during_early_access",
        "review_posted_at",
        "review_updated_at",
    ]

    with open(filename, "w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        for review in reviews:
            writer.writerow(
                {
                    "game_name": game["game_name"],
                    "app_id": app_id,
                    "game_release_date": game["game_release_date"],
                    "game_description": game["game_description"],
                    "game_developer": game["game_developer"],
                    "game_publisher": game["game_publisher"],
                    "game_price": game["game_price"],
                    "game_early_access_release_date": game[
                        "game_early_access_release_date"
                    ],
                    "game_tags": json.dumps(
                        game.get("game_tags", []), ensure_ascii=False
                    ),
                    "tag_sources_refreshed": json.dumps(
                        game.get("tag_sources_refreshed", []),
                        ensure_ascii=False,
                    ),
                    **review,
                }
            )

    print(f"Saved {len(reviews)} reviews to {filename}")
    missing_fields = [
        name
        for name in (
            "game_release_date",
            "game_developer",
            "game_price",
        )
        if not game[name]
    ]
    if missing_fields:
        print(
            "Warning: Steam did not provide "
            + ", ".join(missing_fields)
            + "; the importer will require these values before inserting."
        )

# ==========================================
# Validate User's Numeric Input
# ==========================================

def read_positive_int(prompt, default):
    while True:
        value = input(prompt).strip()
        if not value:
            if default is not None:
                return default
            print("Enter a positive whole number.")
            continue
        try:
            result = int(value)
            if 0 < result <= 4_294_967_295:
                return result
        except ValueError:
            pass
        print("Enter a positive whole number within the MySQL INT UNSIGNED range.")

# ==========================================
# Main Program
# Ask for App ID, number of reviews, and language
# ==========================================

def main():
    app_id = read_positive_int("Enter Steam App ID: ", None)
    max_reviews = read_positive_int(
        "How many reviews do you want? (default: 1000): ", 1000
    )
    language = input("Language (default: english): ").strip() or "english"

    try:
        game = get_game_details(app_id)
        if not game["game_name"]:
            raise ValueError(f"Steam returned no game name for App ID {app_id}.")
        print(f"Game found: {game['game_name']}")
        user_tag_input = input(
            "Optional GameScope user-defined tags (comma-separated): "
        )
        game["game_tags"].extend(parse_user_tags(user_tag_input))
        reviews = get_reviews(app_id, max_reviews, language)
        save_reviews(reviews, app_id, game)
    except (requests.RequestException, ValueError) as error:
        print(f"Could not collect Steam data: {error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
