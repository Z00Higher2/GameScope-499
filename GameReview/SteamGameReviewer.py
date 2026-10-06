import requests
import csv
import time
from datetime import datetime, timezone


# ==========================================
# STEAM GAME INFORMATION
# ==========================================

def get_game_name(app_id):
    """
    Get the game name from a Steam App ID.
    """

    url = f"https://store.steampowered.com/api/appdetails?appids={app_id}"

    try:
        response = requests.get(
            url,
            timeout=15
        )

        response.raise_for_status()

        data = response.json()

        app_data = data.get(str(app_id), {})

        if not app_data.get("success"):
            return None

        game_name = app_data.get("data", {}).get("name")

        return game_name

    except requests.RequestException as error:

        print(f"Could not retrieve game information: {error}")
        return None

    except ValueError:

        print("Steam returned invalid JSON.")
        return None


def format_timestamp(timestamp):

    if not timestamp:
        return ""

    return datetime.fromtimestamp(
        timestamp,
        timezone.utc
    ).strftime("%Y-%m-%d %H:%M:%S")


# ==========================================
# STEAM REVIEW COLLECTOR
# ==========================================

def get_reviews(app_id, max_reviews=1000, language="english"):

    """
    Collect reviews from any Steam game.
    """

    url = f"https://store.steampowered.com/appreviews/{app_id}"

    reviews = []
    review_ids = set()
    cursor = "*"

    print()
    print("------------------------------------------")
    print(f"Collecting reviews for App ID: {app_id}")
    print(f"Language: {language}")
    print(f"Target reviews: {max_reviews}")
    print("------------------------------------------")
    print()

    while len(reviews) < max_reviews:

        params = {
            "json": 1,
            "filter": "recent",
            "language": language,
            "review_type": "all",
            "purchase_type": "all",
            "num_per_page": 100,
            "cursor": cursor
        }

        try:

            response = requests.get(
                url,
                params=params,
                timeout=15
            )

            response.raise_for_status()

            data = response.json()

        except requests.RequestException as error:

            print(f"Request error: {error}")
            break

        except ValueError:

            print("Steam returned invalid JSON.")
            break

        # ==========================================
        # CHECK RESPONSE
        # ==========================================

        if data.get("success") != 1:

            print("Steam API request was unsuccessful.")
            break

        batch = data.get("reviews", [])

        if not batch:

            print("No more reviews found.")
            break

        # ==========================================
        # PROCESS REVIEWS
        # ==========================================

        for review in batch:

            # Steam's actual review ID
            review_id = review.get("recommendationid")

            if not review_id:

                print("Skipped review without review ID.")
                continue

            # Prevent duplicates
            if review_id in review_ids:

                continue

            review_ids.add(review_id)

            author = review.get("author", {})

            # Recommended
            recommended = review.get(
                "voted_up",
                False
            )

            # Playtime
            playtime_forever = author.get(
                "playtime_forever",
                0
            )

            playtime_at_review = author.get(
                "playtime_at_review",
                0
            )

            playtime_hours = round(
                playtime_forever / 60,
                2
            )

            playtime_at_review_hours = round(
                playtime_at_review / 60,
                2
            )

            review_data = {

                "review_id": review_id,

                "app_id": app_id,

                "review_text": review.get(
                    "review",
                    ""
                ),

                "recommended": recommended,

                "playtime_hours": playtime_hours,

                "playtime_at_review_hours":
                    playtime_at_review_hours,

                "helpful_votes":
                    review.get(
                        "votes_up",
                        0
                    ),

                "created_at": format_timestamp(
                    review.get("timestamp_created")
                ),

                "updated_at": format_timestamp(
                    review.get("timestamp_updated")
                )
            }

            reviews.append(review_data)

            if len(reviews) >= max_reviews:
                break

        print(
            f"Collected {len(reviews)} "
            f"/ {max_reviews} reviews"
        )

        # ==========================================
        # NEXT PAGE
        # ==========================================

        new_cursor = data.get("cursor")

        if not new_cursor:

            print("No next page available.")
            break

        if new_cursor == cursor:

            print("Pagination stopped.")
            break

        cursor = new_cursor

        time.sleep(1)

    return reviews


# ==========================================
# SAVE REVIEWS TO CSV
# ==========================================

def save_reviews(reviews, app_id, game_name):

    filename = f"steam_reviews_{app_id}.csv"

    if not reviews:

        print()
        print("No reviews were collected.")
        return

    fieldnames = [
        "game_name",
        "review_id",
        "app_id",
        "review_text",
        "recommended",
        "playtime_hours",
        "playtime_at_review_hours",
        "helpful_votes",
        "created_at",
        "updated_at"
    ]

    with open(
        filename,
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as file:

        writer = csv.DictWriter(
            file,
            fieldnames=fieldnames
        )

        writer.writeheader()

        for review in reviews:

            row = {
                "game_name": game_name,
                **review
            }

            writer.writerow(row)

    print()
    print("------------------------------------------")
    print("Finished!")
    print(f"Game: {game_name}")
    print(f"App ID: {app_id}")
    print(f"Reviews collected: {len(reviews)}")
    print(f"File created: {filename}")
    print("------------------------------------------")


# ==========================================
# MAIN PROGRAM
# ==========================================

if __name__ == "__main__":

    print("------------------------------------------")
    print("       STEAM REVIEW COLLECTOR")
    print("------------------------------------------")
    print()

    # ==========================================
    # GET APP ID
    # ==========================================

    while True:

        app_id_input = input(
            "Enter Steam App ID: "
        ).strip()

        try:

            app_id = int(app_id_input)

            if app_id <= 0:

                print(
                    "App ID must be greater than 0."
                )

                continue

            break

        except ValueError:

            print(
                "Please enter a valid Steam App ID."
            )

    # ==========================================
    # GET GAME NAME
    # ==========================================

    print()
    print("Looking up game information...")

    game_name = get_game_name(app_id)

    if not game_name:

        print()
        print(
            "Could not find a game for this App ID."
        )

        exit()

    print(f"Game found: {game_name}")

    # ==========================================
    # NUMBER OF REVIEWS
    # ==========================================

    max_reviews_input = input(
        "How many reviews do you want? "
        "(default: 1000): "
    ).strip()

    if max_reviews_input == "":

        max_reviews = 1000

    else:

        try:

            max_reviews = int(
                max_reviews_input
            )

            if max_reviews <= 0:

                print(
                    "Invalid number. "
                    "Using 1000 reviews."
                )

                max_reviews = 1000

        except ValueError:

            print(
                "Invalid number. "
                "Using 1000 reviews."
            )

            max_reviews = 1000

    # ==========================================
    # LANGUAGE
    # ==========================================

    language = input(
        "Language (default: english): "
    ).strip()

    if language == "":

        language = "english"

    # ==========================================
    # COLLECT
    # ==========================================

    reviews = get_reviews(
        app_id=app_id,
        max_reviews=max_reviews,
        language=language
    )

    # ==========================================
    # SAVE
    # ==========================================

    save_reviews(
        reviews,
        app_id,
        game_name
    )
