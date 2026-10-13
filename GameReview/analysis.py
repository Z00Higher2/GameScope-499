"""
GameScope analysis: turns the reviews stored in MySQL into the numbers,
charts and review cards the website shows.

Two parts are first versions meant to be tuned:

- Topics are keyword-based. A review "mentions" a topic when it uses
  one of that topic's words (TOPIC_KEYWORDS).
- The quality score is the ranking from the "Ranking the Reviews" slide:
  helpful votes, playtime when the review was written, and how detailed
  the review is (QUALITY_WEIGHTS).
"""

import math
import re
from collections import Counter
from datetime import datetime, timedelta


# ==========================================
# Topics (whole words, case-insensitive)
# ==========================================

TOPIC_KEYWORDS = {
    "Performance": [
        r"performance", r"fps", r"frame ?rates?", r"frame drops?",
        r"stutter\w*", r"lag\w*", r"optimi[sz]\w*",
    ],
    "Bugs": [r"bugs?", r"buggy", r"glitch\w*", r"broken", r"crash\w*", r"freez\w*"],
    "Multiplayer": [
        r"multiplayer", r"co-?op", r"online", r"servers?", r"matchmaking",
        r"pvp", r"lobb(?:y|ies)", r"netcode",
    ],
    "Inventory": [r"inventory", r"stash", r"loot", r"items?", r"crafting"],
    "Progression": [
        r"progression", r"grind\w*", r"level(?:l)?ing", r"end ?game",
        r"unlocks?", r"quests?",
    ],
    "Combat": [
        r"combat", r"fights?", r"fighting", r"boss(?:es)?", r"weapons?",
        r"gunplay", r"enemies",
    ],
    "Graphics": [r"graphics", r"visuals?", r"art ?style", r"textures?", r"animations?"],
    "Story": [r"story", r"narrative", r"characters?", r"writing", r"lore", r"plot", r"dialogue"],
    "Sound": [r"sound", r"music", r"soundtrack", r"audio", r"voice acting"],
    "Price": [
        r"price", r"priced", r"expensive", r"worth", r"refund\w*", r"money",
        r"dlcs?", r"microtransactions?", r"pay ?to ?win",
    ],
    "Controls": [r"controls?", r"controller", r"keybind\w*", r"input lag"],
    "UI": [r"ui", r"interface", r"menus?", r"hud"],
    "Difficulty": [r"difficulty", r"too hard", r"too easy", r"challenging"],
    "Developers": [r"devs?", r"developers?", r"updates?", r"patch(?:es)?"],
    "Content": [r"content", r"replayability", r"replay value", r"repetitive", r"variety"],
}

TOPIC_PATTERNS = {
    topic: re.compile(r"\b(?:" + "|".join(words) + r")\b", re.IGNORECASE)
    for topic, words in TOPIC_KEYWORDS.items()
}


# ==========================================
# Quality Score (0-100), from the "Ranking the Reviews" slide
# ==========================================

QUALITY_WEIGHTS = {"helpful_votes": 0.30, "playtime": 0.30, "detail": 0.40}

# The value that earns full marks for each part of the score.
# Recent reviews have had little time to collect votes, so the vote
# target is low. Tuned on Portal 2 and Path of Exile 2 (500 reviews each).
FULL_HELPFUL_VOTES = 10
FULL_PLAYTIME_HOURS = 50
FULL_WORD_COUNT = 100
FULL_TOPIC_COUNT = 3

HIGH_QUALITY = 65
MODERATE_QUALITY = 40

# A topic must appear in this many reviews before the summary calls it a pattern
MIN_PATTERN_REVIEWS = 3


def quality_score(helpful_votes, playtime_at_review, word_count, topic_count):
    # Votes and hours use a log scale, so the first few count the most
    helpful = min(math.log1p(helpful_votes) / math.log1p(FULL_HELPFUL_VOTES), 1)
    playtime = min(
        math.log1p(playtime_at_review) / math.log1p(FULL_PLAYTIME_HOURS), 1
    )
    detail = (
        0.6 * min(word_count / FULL_WORD_COUNT, 1)
        + 0.4 * min(topic_count / FULL_TOPIC_COUNT, 1)
    )
    return round(
        100
        * (
            QUALITY_WEIGHTS["helpful_votes"] * helpful
            + QUALITY_WEIGHTS["playtime"] * playtime
            + QUALITY_WEIGHTS["detail"] * detail
        )
    )


def quality_label(score):
    if score >= HIGH_QUALITY:
        return "high"
    if score >= MODERATE_QUALITY:
        return "moderate"
    return "low"


# ==========================================
# Text Helpers
# ==========================================

BBCODE_TAG = re.compile(r"\[/?[a-z0-9*]+(?:=[^\]]*)?\]", re.IGNORECASE)


def clean_text(text):
    # Steam reviews use BBCode ([b], [h1], [list] ...); show plain text
    return " ".join(BBCODE_TAG.sub(" ", text or "").split())


def shorten(text, limit):
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0] + "…"


def find_topics(text):
    counts = {
        topic: len(pattern.findall(text))
        for topic, pattern in TOPIC_PATTERNS.items()
    }
    ranked = sorted(counts.items(), key=lambda item: -item[1])
    return [topic for topic, count in ranked if count]


def topic_word(topic):
    return topic if topic.isupper() else topic.lower()


def join_words(words):
    if len(words) <= 1:
        return "".join(words)
    return ", ".join(words[:-1]) + " and " + words[-1]


def count_of(count, noun):
    return f"{count:,} {noun}" + ("" if count == 1 else "s")


# ==========================================
# Number Helpers
# ==========================================

def percent(part, whole):
    return round(100 * part / whole) if whole else 0


def average(values):
    return sum(values) / len(values) if values else 0


def split_percentages(values):
    """Round shares to whole percentages that still add up to 100."""
    total = sum(values)
    if not total:
        return [0] * len(values)
    exact = [100 * value / total for value in values]
    result = [math.floor(share) for share in exact]
    by_remainder = sorted(
        range(len(values)), key=lambda i: exact[i] - result[i], reverse=True
    )
    for i in by_remainder[: 100 - sum(result)]:
        result[i] += 1
    return result


# ==========================================
# Score Every Stored Review
# ==========================================

def score_reviews(rows):
    scored = []
    for row in rows:
        text = clean_text(row["review_text"])
        topics = find_topics(text)
        words = len(text.split())
        helpful_votes = int(row["helpful_votes"] or 0)
        playtime_at_review = float(row["playtime_at_review_hours"] or 0)
        score = quality_score(helpful_votes, playtime_at_review, words, len(topics))
        scored.append(
            {
                "review_id": str(row["review_id"]),
                "text": text,
                "topics": topics,
                "recommended": bool(row["recommended"]),
                "playtime": float(row["playtime_hours"] or 0),
                "playtime_at_review": playtime_at_review,
                "helpful_votes": helpful_votes,
                "created_at": row["created_at"],
                "quality_score": score,
                "quality": quality_label(score),
                "detailed": words >= 60 or len(topics) >= 3,
            }
        )
    return scored


def numeric_id(review):
    # Steam review IDs grow over time, so they also sort newest-last
    return int(review["review_id"]) if review["review_id"].isdigit() else 0


def newest_first(review):
    return (review["created_at"] or datetime.min, numeric_id(review))


# ==========================================
# Sentiment Over Time
# ==========================================

TREND_LABELS = {
    "6 hours": "%b %d %H:00",
    "day": "%b %d",
    "week": "Wk of %b %d",
    "month": "%b %Y",
}


def bucket_start(moment, size):
    if size == "6 hours":
        return moment.replace(
            hour=moment.hour - moment.hour % 6, minute=0, second=0, microsecond=0
        )
    day = moment.replace(hour=0, minute=0, second=0, microsecond=0)
    if size == "day":
        return day
    if size == "week":
        return day - timedelta(days=day.weekday())
    return day.replace(day=1)


def sentiment_trend(scored, max_points=8):
    dated = [review for review in scored if review["created_at"]]
    if len(dated) < 2:
        return []

    # Pick a bucket size that fits how spread out the reviews are
    span = max(r["created_at"] for r in dated) - min(r["created_at"] for r in dated)
    if span <= timedelta(days=2):
        size = "6 hours"
    elif span <= timedelta(days=21):
        size = "day"
    elif span <= timedelta(days=150):
        size = "week"
    else:
        size = "month"

    groups = {}
    for review in dated:
        start = bucket_start(review["created_at"], size)
        groups.setdefault(start, []).append(review["recommended"])

    trend = []
    for start in sorted(groups)[-max_points:]:
        votes = groups[start]
        positive, negative = split_percentages([sum(votes), len(votes) - sum(votes)])
        trend.append(
            {
                "period": start.strftime(TREND_LABELS[size]),
                "positive": positive,
                "negative": negative,
                "reviews": len(votes),
            }
        )
    return trend


# ==========================================
# Playtime Charts
# ==========================================

PLAYTIME_RANGES = [
    (10, "0-10"),
    (50, "10-50"),
    (100, "50-100"),
    (250, "100-250"),
    (None, "250+"),
]


def playtime_range(hours):
    for limit, label in PLAYTIME_RANGES:
        if limit is None or hours < limit:
            return label


def playtime_charts(scored):
    groups = {label: [] for _, label in PLAYTIME_RANGES}
    for review in scored:
        groups[playtime_range(review["playtime"])].append(review["recommended"])

    distribution = []
    recommendation = []
    for label, votes in groups.items():
        recommended, not_recommended = split_percentages(
            [sum(votes), len(votes) - sum(votes)]
        )
        distribution.append({"range": f"{label} Hours", "reviews": len(votes)})
        recommendation.append(
            {
                "range": label,
                "recommended": recommended,
                "notRecommended": not_recommended,
                "reviews": len(votes),
            }
        )
    return distribution, recommendation


# ==========================================
# Topics, Reliability and Highlights
# ==========================================

def topic_counts(scored, recommended, limit=5):
    counts = Counter(
        topic
        for review in scored
        if review["recommended"] == recommended
        for topic in review["topics"]
    )
    return [
        {"topic": topic, "mentions": count}
        for topic, count in counts.most_common(limit)
    ]


def reliability(scored, filter_run):
    # Reliable = kept by the junk filter and at least moderate quality
    reliable = sum(1 for r in scored if r["quality_score"] >= MODERATE_QUALITY)
    questionable = len(scored) - reliable

    filtered_share = 0
    if filter_run and filter_run["collected"]:
        filtered_share = (
            filter_run["collected"] - filter_run["kept"]
        ) / filter_run["collected"]
    kept_share = 1 - filtered_share

    values = split_percentages(
        [
            kept_share * reliable,
            kept_share * questionable,
            filtered_share * len(scored),
        ]
    )
    return [
        {"name": "Reliable", "value": values[0]},
        {"name": "Questionable", "value": values[1]},
        {"name": "Filtered", "value": values[2]},
    ]


def patterns(topics):
    return [t for t in topics if t["mentions"] >= MIN_PATTERN_REVIEWS]


def summary_text(game_name, total, positive_pct, negative_topics, positive_topics):
    if not total:
        return f"No reviews have been stored for {game_name} yet."

    parts = [
        f"{positive_pct}% of the {count_of(total, 'review')} that passed the "
        f"junk filter recommend {game_name}."
    ]
    complaints = patterns(negative_topics)
    if complaints:
        words = [topic_word(t["topic"]) for t in complaints[:2]]
        parts.append(
            f"Players who don't recommend it most often mention {join_words(words)}."
        )
    else:
        parts.append("No single complaint comes up repeatedly in the negative reviews.")
    praise = patterns(positive_topics)
    if praise:
        words = [topic_word(t["topic"]) for t in praise[:2]]
        parts.append(
            f"Recommended reviews most often talk about {join_words(words)}."
        )
    return " ".join(parts)


def key_insights(scored, positive, negative, positive_pct, negative_topics, filter_run):
    insights = []

    complaints = patterns(negative_topics)
    if complaints:
        top = complaints[0]
        insights.append(
            {
                "label": "ISSUE",
                "tone": "negative",
                "text": f"{top['topic']} is the most common topic in negative "
                f"reviews ({count_of(top['mentions'], 'review')}).",
            }
        )
    else:
        insights.append(
            {
                "label": "ISSUE",
                "tone": "positive",
                "text": "No single complaint comes up repeatedly in the negative reviews.",
            }
        )

    insights.append(
        {
            "label": "SENTIMENT",
            "tone": "positive" if positive_pct >= 50 else "negative",
            "text": f"{positive_pct}% of analyzed reviews recommend the game "
            f"({positive:,} positive, {negative:,} negative).",
        }
    )

    newcomers = [r for r in scored if r["playtime"] < 10]
    veterans = [r for r in scored if r["playtime"] >= 50]
    if newcomers and veterans:
        new_pct = percent(sum(r["recommended"] for r in newcomers), len(newcomers))
        vet_pct = percent(sum(r["recommended"] for r in veterans), len(veterans))
        insights.append(
            {
                "label": "PLAYTIME",
                "tone": "positive" if vet_pct >= new_pct else "negative",
                "text": f"Players with 50+ hours recommend it {vet_pct}% of the "
                f"time, compared with {new_pct}% of players under 10 hours.",
            }
        )
    else:
        insights.append(
            {
                "label": "PLAYTIME",
                "tone": "positive",
                "text": f"{percent(len(veterans), len(scored))}% of the analyzed "
                "reviews come from players with 50+ hours.",
            }
        )

    if filter_run and filter_run["collected"]:
        removed = filter_run["collected"] - filter_run["kept"]
        text = (
            f"The junk filter removed {removed:,} of {filter_run['collected']:,} "
            f"collected reviews ({percent(removed, filter_run['collected'])}%)"
        )
        if filter_run["removed"]:
            reason = max(filter_run["removed"].items(), key=lambda item: item[1])[0]
            text += f'. Most common reason: "{reason}".'
        else:
            text += "."
        insights.append({"label": "FILTER", "tone": "positive", "text": text})

    return insights


# ==========================================
# Review Cards (Reviews page)
# ==========================================

def priority(review):
    specific = bool(review["topics"])
    if not review["recommended"] and specific and review["quality_score"] >= MODERATE_QUALITY:
        return "HIGH PRIORITY"
    if review["quality_score"] >= MODERATE_QUALITY or (not review["recommended"] and specific):
        return "MEDIUM PRIORITY"
    return "LOW PRIORITY"


def developer_signal(review):
    topics = [topic_word(topic) for topic in review["topics"][:2]]
    if review["playtime_at_review"] >= 50:
        player = (
            f"An experienced player ({review['playtime_at_review']:,.0f} hours "
            "at review)"
        )
    else:
        player = "A player"

    if not topics:
        if review["recommended"]:
            return f"{player} recommends the game but doesn't point to anything specific."
        return "Limited detail makes it difficult to identify a specific actionable problem."
    if review["recommended"]:
        return f"{player} who recommends the game highlights {join_words(topics)}."
    return (
        f"{player} who doesn't recommend the game reports problems with "
        f"{join_words(topics)}."
    )


def build_review_cards(stored):
    cards = []
    for review in score_reviews(stored["reviews"]):
        signals = review["topics"][:4] or ["General"]
        cards.append(
            {
                "id": numeric_id(review),
                "sentiment": "positive" if review["recommended"] else "negative",
                "quality": review["quality"],
                "qualityScore": review["quality_score"],
                "text": shorten(review["text"], 900),
                "tags": signals,
                "playtime": round(review["playtime"], 1),
                "playtimeAtReview": round(review["playtime_at_review"], 1),
                "helpfulVotes": review["helpful_votes"],
                "signals": signals,
                "developerSignal": developer_signal(review),
                "priority": priority(review),
                "detailed": review["detailed"],
            }
        )
    cards.sort(key=lambda card: (card["qualityScore"], card["helpfulVotes"]), reverse=True)
    return cards


# ==========================================
# Full Analysis (Dashboard and Analytics pages)
# ==========================================

def build_analysis(stored):
    game = stored["game"]
    scored = score_reviews(stored["reviews"])
    filter_run = stored["filter_run"]

    total = len(scored)
    positive = sum(1 for review in scored if review["recommended"])
    negative = total - positive
    positive_pct, negative_pct = split_percentages([positive, negative])

    negative_topics = topic_counts(scored, recommended=False)
    positive_topics = topic_counts(scored, recommended=True)
    distribution, by_playtime = playtime_charts(scored)
    signals = Counter(t for review in scored for t in review["topics"]).most_common(4)

    most_helpful = sorted(
        scored, key=lambda r: (r["helpful_votes"], r["quality_score"]), reverse=True
    )[:4]
    most_recent = sorted(scored, key=newest_first, reverse=True)[:3]

    return {
        "game": {
            "appId": str(game["app_id"]),
            "name": game["game_name"],
            "developer": game["game_developer"],
            "publisher": game["game_publisher"],
            "releaseDate": (
                game["game_release_date"].isoformat()
                if game["game_release_date"]
                else None
            ),
            "price": float(game["game_price"]) if game["game_price"] is not None else None,
        },
        "analyzedAt": (
            stored["analyzed_at"].isoformat() if stored["analyzed_at"] else None
        ),
        "summary": {
            "totalReviews": total,
            "positiveReviews": positive,
            "negativeReviews": negative,
            "positivePercentage": positive_pct,
            "negativePercentage": negative_pct,
            "averagePlaytime": round(average([r["playtime"] for r in scored])),
            "averageHelpfulVotes": round(average([r["helpful_votes"] for r in scored])),
            "reviewQuality": round(average([r["quality_score"] for r in scored])),
            "highQualityPercentage": percent(
                sum(1 for r in scored if r["quality"] == "high"), total
            ),
            "detailedPercentage": percent(sum(1 for r in scored if r["detailed"]), total),
            "reliablePercentage": percent(
                sum(1 for r in scored if r["quality_score"] >= MODERATE_QUALITY), total
            ),
        },
        "filter": filter_run,
        "sentimentTrend": sentiment_trend(scored),
        "topIssues": [
            {"name": t["topic"], "count": t["mentions"]} for t in negative_topics[:4]
        ],
        "positiveTopics": positive_topics,
        "negativeTopics": negative_topics,
        "playtimeDistribution": distribution,
        "playtimeRecommendation": by_playtime,
        "reliability": reliability(scored, filter_run),
        "mostHelpfulReviews": [
            {
                "reviewNumber": number,
                "sentiment": "Positive" if review["recommended"] else "Negative",
                "helpfulVotes": review["helpful_votes"],
                "text": shorten(review["text"], 280),
            }
            for number, review in enumerate(most_helpful, start=1)
        ],
        "recentFeedback": [
            {
                "type": "positive" if review["recommended"] else "negative",
                "text": shorten(review["text"], 220),
            }
            for review in most_recent
        ],
        "playerSignals": [{"name": name, "count": count} for name, count in signals],
        "analysisSummary": summary_text(
            game["game_name"], total, positive_pct, negative_topics, positive_topics
        ),
        "keyInsights": key_insights(
            scored, positive, negative, positive_pct, negative_topics, filter_run
        ),
    }
