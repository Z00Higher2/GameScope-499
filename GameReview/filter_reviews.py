import csv
import unicodedata

from lingua import Language, LanguageDetectorBuilder


# ==========================================
# FILTER SETTINGS
# ==========================================

MIN_WORDS = 5
MIN_UNIQUE_WORDS = 3
MIN_LETTER_RATIO = 0.5
MIN_FUNNY_VOTES = 3
MIN_CHECKBOXES = 3

CHECKBOXES = "☐☑☒✅❌✔"


# ==========================================
# STEAM LANGUAGES
# ==========================================

STEAM_LANGUAGES = [
    Language.ENGLISH,
    Language.SPANISH,
    Language.PORTUGUESE,
    Language.GERMAN,
    Language.FRENCH,
    Language.TURKISH,
    Language.POLISH,
    Language.ITALIAN,
    Language.VIETNAMESE,
    Language.CZECH,
    Language.DUTCH,
    Language.HUNGARIAN,
    Language.INDONESIAN,
]


# ==========================================
# LANGUAGE DETECTOR
# ==========================================

detector = LanguageDetectorBuilder \
    .from_languages(*STEAM_LANGUAGES) \
    .build()


# ==========================================
# HELPER FUNCTIONS
# ==========================================

def is_latin(letter):
    """
    Check whether a character belongs to
    the Latin alphabet.
    """

    return unicodedata.name(
        letter,
        ""
    ).startswith("LATIN")


def words_only(text):
    """
    Remove punctuation and symbols while
    keeping alphabetic characters.
    """

    return " ".join(
        "".join(
            c if c.isalpha() else " "
            for c in text
        ).split()
    )


# ==========================================
# DETERMINE WHY REVIEW IS JUNK
# ==========================================

def junk_reason(review, seen_texts):

    text = (
        review.get("review_text") or ""
    ).strip()

    normalized = " ".join(
        text.lower().split()
    )

    # ------------------------------------------
    # Empty review
    # ------------------------------------------

    if not text:

        return "empty review"

    # ------------------------------------------
    # Too short
    # ------------------------------------------

    if len(text.split()) < MIN_WORDS:

        return "too short"

    # ------------------------------------------
    # Letter ratio
    # ------------------------------------------

    non_space = [
        c
        for c in text
        if not c.isspace()
    ]

    letters = [
        c
        for c in non_space
        if c.isalpha()
    ]

    if not non_space:

        return "empty review"

    letter_ratio = (
        len(letters) / len(non_space)
    )

    if letter_ratio < MIN_LETTER_RATIO:

        return "ascii art / symbols"

    # ------------------------------------------
    # Checkbox template
    # ------------------------------------------

    checkbox_count = sum(
        text.count(c)
        for c in CHECKBOXES
    )

    if checkbox_count >= MIN_CHECKBOXES:

        return "checkbox template"

    # ------------------------------------------
    # Non-Latin alphabet
    # ------------------------------------------

    if letters and not all(
        is_latin(c)
        for c in letters
    ):

        return "non-latin alphabet"

    # ------------------------------------------
    # Repeated words
    # ------------------------------------------

    cleaned_words = words_only(
        text
    ).lower().split()

    if len(
        set(cleaned_words)
    ) < MIN_UNIQUE_WORDS:

        return "repeated words"

    # ------------------------------------------
    # Duplicate review
    # ------------------------------------------

    if normalized in seen_texts:

        return "duplicate"

    seen_texts.add(normalized)

    # ------------------------------------------
    # Language detection
    # ------------------------------------------

    cleaned_text = words_only(text)

    detected_language = (
        detector.detect_language_of(
            cleaned_text
        )
    )

    if detected_language != Language.ENGLISH:

        return "not english"

    # ------------------------------------------
    # Review passed all filters
    # ------------------------------------------

    return None


# ==========================================
# FILTER REVIEWS
# ==========================================

def filter_reviews(reviews):

    kept = []
    removed = {}
    seen_texts = set()

    for review in reviews:

        reason = junk_reason(
            review,
            seen_texts
        )

        if reason:

            removed[reason] = (
                removed.get(reason, 0) + 1
            )

        else:

            kept.append(review)

    return kept, removed


# ==========================================
# MAIN PROGRAM
# ==========================================

if __name__ == "__main__":

    print("------------------------------------------")
    print("       STEAM REVIEW FILTER")
    print("------------------------------------------")
    print()

    # ------------------------------------------
    # Get App ID
    # ------------------------------------------

    app_id = input(
        "Enter Steam App ID: "
    ).strip()

    if not app_id.isdigit():

        print("Invalid App ID.")
        exit()

    # ------------------------------------------
    # File names
    # ------------------------------------------

    input_file = (
        f"steam_reviews_{app_id}.csv"
    )

    output_file = (
        f"steam_reviews_filtered_{app_id}.csv"
    )

    # ------------------------------------------
    # Read CSV
    # ------------------------------------------

    try:

        with open(
            input_file,
            "r",
            encoding="utf-8-sig",
            newline=""
        ) as file:

            reader = csv.DictReader(file)

            fieldnames = reader.fieldnames

            reviews = list(reader)

    except FileNotFoundError:

        print()
        print(
            f"Could not find: {input_file}"
        )

        print(
            "Run SteamGameReviewer_.py first."
        )

        exit()

    # ------------------------------------------
    # Validate CSV
    # ------------------------------------------

    required_columns = [
        "game_name",
        "review_id",
        "app_id",
        "review_text",
        "recommended",
        "playtime_hours",
        "playtime_at_review_hours",
        "helpful_votes"
    ]

    missing_columns = [
        column
        for column in required_columns
        if column not in fieldnames
    ]

    if missing_columns:

        print()
        print("CSV is missing columns:")

        for column in missing_columns:

            print(f"  - {column}")

        exit()

    # ------------------------------------------
    # Get game name
    # ------------------------------------------

    game_name = (
        reviews[0]["game_name"]
        if reviews
        else "Unknown"
    )

    print(
        f"Game: {game_name}"
    )

    print(
        f"Reviews loaded: {len(reviews)}"
    )

    print()

    # ------------------------------------------
    # Filter
    # ------------------------------------------

    kept, removed = filter_reviews(
        reviews
    )

    # ------------------------------------------
    # Save filtered reviews
    # ------------------------------------------

    with open(
        output_file,
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as file:

        writer = csv.DictWriter(
            file,
            fieldnames=fieldnames
        )

        writer.writeheader()

        writer.writerows(kept)

    # ==========================================
    # RESULTS
    # ==========================================

    print("------------------------------------------")
    print("Filtering finished!")
    print("------------------------------------------")

    print(
        f"Kept: {len(kept)}"
    )

    print(
        f"Removed: {len(reviews) - len(kept)}"
    )

    print()

    if removed:

        print("Removal reasons:")

        for reason, count in removed.items():

            print(
                f"  removed {count}: {reason}"
            )

    print()

    print(
        f"File created: {output_file}"
    )

    print("------------------------------------------")
