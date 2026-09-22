
import requests
import csv
import time


# ==========================================
# STEAM REVIEW COLLECTOR
# Works with ANY Steam game
# ==========================================


def get_reviews(app_id, max_reviews=1000, language="english"):
    """
    Collect reviews from any Steam game.

    app_id:
        Steam App ID of the game.

    max_reviews:
        Maximum number of reviews to collect.

    language:
        Language of reviews to collect.
        Default is English.
    """

    url = f"https://store.steampowered.com/appreviews/{app_id}"

    reviews = []
    cursor = "*"

    print()
    print(f"Collecting reviews for Steam App ID: {app_id}")
    print(f"Language: {language}")
    print(f"Target reviews: {max_reviews}")
    print()

    while len(reviews) < max_reviews:

        params = {
            "json": 1,

            # Get reviews
            "filter": "recent",

            # Review language
            "language": language,

            # Get both positive and negative reviews
            "review_type": "all",

            # Include all purchase types
            "purchase_type": "all",

            # Maximum allowed per request
            "num_per_page": 100,

            # Pagination
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

        # Check Steam response
        if data.get("success") != 1:

            print("Steam API request was unsuccessful.")
            break

        batch = data.get("reviews", [])

        # No more reviews
        if not batch:

            print("No more reviews found.")
            break

        # ==========================================
        # PROCESS REVIEWS
        # ==========================================

        for review in batch:

            author = review.get("author", {})

            review_data = {

                # Game information
                "app_id": app_id,

                "review_text":
                    review.get("review"),

                "recommended":
                    review.get("voted_up"),

                "playtime_hours":
                    round(
                        author.get(
                            "playtime_forever", 0
                        ) / 60,
                        2
                    ),

                "playtime_at_review_hours":
                    round(
                        author.get(
                            "playtime_at_review", 0
                        ) / 60,
                        2
                    ),

                # Community feedback
                "helpful_votes":
                    review.get("votes_up", 0),

                
            }

            reviews.append(review_data)

            # Stop when target is reached
            if len(reviews) >= max_reviews:
                break

        print(
            f"Collected {len(reviews)} "
            f"/ {max_reviews} reviews"
        )

        # ==========================================
        # GET NEXT PAGE
        # ==========================================

        new_cursor = data.get("cursor")

        if not new_cursor:

            print("No next page available.")
            break

        if new_cursor == cursor:

            print("Pagination stopped.")
            break

        cursor = new_cursor

        # Small delay between requests
        time.sleep(1)

    return reviews


# ==========================================
# SAVE REVIEWS TO CSV
# ==========================================


def save_reviews(reviews, app_id):

    filename = f"steam_reviews_{app_id}.csv"

    if not reviews:

        print("No reviews were collected.")
        return

    fieldnames = reviews[0].keys()

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

        writer.writerows(reviews)

    print()
    print("------------------------------------------")
    print("Finished!")
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

    # --------------------------------------
    # Get Steam App ID
    # --------------------------------------

    while True:

        app_id_input = input(
            "Enter Steam App ID: "
        ).strip()

        try:

            app_id = int(app_id_input)

            if app_id <= 0:

                print("App ID must be greater than 0.")
                continue

            break

        except ValueError:

            print("Please enter a valid Steam App ID.")


    # --------------------------------------
    # Number of reviews
    # --------------------------------------

    max_reviews_input = input(
        "How many reviews do you want? "
        "(default: 1000): "
    ).strip()

    if max_reviews_input == "":

        max_reviews = 1000

    else:

        try:

            max_reviews = int(max_reviews_input)

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


    # --------------------------------------
    # Language
    # --------------------------------------

    language = input(
        "Language (default: english): "
    ).strip()

    if language == "":

        language = "english"


    # --------------------------------------
    # Collect reviews
    # --------------------------------------

    reviews = get_reviews(
        app_id=app_id,
        max_reviews=max_reviews,
        language=language
    )


    # --------------------------------------
    # Save reviews
    # --------------------------------------

    save_reviews(
        reviews,
        app_id
    )

