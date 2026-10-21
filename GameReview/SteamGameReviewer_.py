import csv
import time
from datetime import datetime, timezone

import requests

# ==========================================
# Steam API Endpoints
# ==========================================

STEAM_DETAILS_URL = "https://store.steampowered.com/api/appdetails"
STEAM_REVIEWS_URL = "https://store.steampowered.com/appreviews/{app_id}"


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
# Convert Steam Review Timestamp to MySQL DATETIME (UTC)
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
        params={"appids": app_id},
        timeout=15,
    )
    response.raise_for_status()
    payload = response.json().get(str(app_id), {})
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
    return {
        "game_name": data.get("name", ""),
        "game_release_date": parse_release_date(release_info.get("date")),
        "game_description": data.get("short_description", ""),
        "game_developer": ", ".join(data.get("developers") or []),
        "game_publisher": ", ".join(data.get("publishers") or []),
        "game_price": price,
        "game_header_image": data.get("header_image", ""),
    }

# ==========================================
# Collect Reviews from Steam
# ==========================================

def get_reviews(app_id, max_reviews=1000, language="english"):
    url = STEAM_REVIEWS_URL.format(app_id=app_id)
    reviews = []
    review_ids = set()
    cursor = "*"

    print(f"Collecting up to {max_reviews} reviews for App ID {app_id}...")
    while len(reviews) < max_reviews:
        params = {
            "json": 1,
            "filter": "recent",
            "language": language,
            "review_type": "all",
            "purchase_type": "all",
            "num_per_page": 100,
            "cursor": cursor,
        }
        response = requests.get(url, params=params, timeout=15)
        response.raise_for_status()
        data = response.json()
        if data.get("success") != 1:
            raise ValueError("Steam's review API returned an unsuccessful response.")

        batch = data.get("reviews", [])
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
                    "created_at": format_timestamp(review.get("timestamp_created")),
                    "updated_at": format_timestamp(review.get("timestamp_updated")),
                }
            )
            if len(reviews) >= max_reviews:
                break

        print(f"Collected {len(reviews)} / {max_reviews} reviews")
        new_cursor = data.get("cursor")
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
        "review_id",
        "review_text",
        "recommended",
        "playtime_hours",
        "playtime_at_review_hours",
        "helpful_votes",
        "language",
        "created_at",
        "updated_at",
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
        reviews = get_reviews(app_id, max_reviews, language)
        save_reviews(reviews, app_id, game)
    except (requests.RequestException, ValueError) as error:
        print(f"Could not collect Steam data: {error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())