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


# ==========================================
# Topic-Level Sentiment (Pros and Cons)
# ==========================================

POSITIVE_CUES = re.compile(
    r"\b(?:"
    r"love|loved|liked|enjoy|enjoyed|"
    r"amazing|excellent|great|good|fantastic|"
    r"fun|beautiful|brilliant|smooth|impressive|"
    r"awesome|incredible|perfect|best|solid|polished|"
    r"gorgeous|stunning|memorable|masterpiece|"
    r"well[- ]made|well[- ]designed|satisfying|"
    r"engaging|immersive|addictive|"
    r"works well|runs well|worth it|"
    r"improved|improvements"
    r")\b",
    re.IGNORECASE,
)

NEGATIVE_CUES = re.compile(
    r"\b(?:"
    r"hate|hated|dislike|disliked|"
    r"terrible|awful|bad|poor|horrible|"
    r"boring|frustrating|frustrated|annoying|"
    r"broken|buggy|unplayable|unfinished|"
    r"laggy|lagging|stuttering|stutter|"
    r"crashes|crashing|crashed|"
    r"worse|worst|disappointing|disappointed|"
    r"overpriced|unbalanced|"
    r"lackluster|mediocre|repetitive|tedious|grindy|"
    r"clunky|janky|shallow|trash|garbage|ruined|"
    r"doesn't work|does not work|"
    r"not worth|waste of"
    r")\b",
    re.IGNORECASE,
)

NEGATION_CUES = re.compile(
    r"\b(?:not|never|no|hardly|isn't|aren't|"
    r"wasn't|weren't|don't|doesn't|didn't|"
    r"cannot|can't|without)\b",
    re.IGNORECASE,
)

CLAUSE_BREAKS = re.compile(
    r"[.!?;\n]+|\b(?:but|however|although|though|despite|except|whereas)\b",
    re.IGNORECASE,
)

NEGATION_REACH = 3


def clause_around(text, start, end):
    clause_start = 0
    for brk in CLAUSE_BREAKS.finditer(text, 0, start):
        clause_start = brk.end()
    next_break = CLAUSE_BREAKS.search(text, end)
    clause = text[clause_start : next_break.start() if next_break else len(text)]
    return comma_part(clause, start - clause_start, end - clause_start)


def comma_part(clause, start, end):
    # "great story, awful servers": read only the comma-separated part with
    # the topic, unless that part has no sentiment words of its own
    part_start = clause.rfind(",", 0, start) + 1
    part_end = clause.find(",", end)
    part = clause[part_start : part_end if part_end != -1 else len(clause)]
    if POSITIVE_CUES.search(part) or NEGATIVE_CUES.search(part):
        return part
    return clause


def negated(clause, cue_start):
    words_before = clause[:cue_start].split()[-NEGATION_REACH:]
    return any(NEGATION_CUES.fullmatch(word.strip(",:\"'()")) for word in words_before)


def topic_sentiment(text, topic_pattern):
    """
    Estimate sentiment around mentions of one topic.

    Only the clause containing the topic is read, so "great story but awful
    servers" is positive for Story. A negation only flips a cue it sits
    right in front of ("not good"). Returns positive, negative, or neutral.
    This is a keyword-based estimate, not an AI sentiment model.
    """
    positive = 0
    negative = 0

    for match in topic_pattern.finditer(text):
        clause = clause_around(text, match.start(), match.end())
        for cue_pattern, is_positive in ((POSITIVE_CUES, True), (NEGATIVE_CUES, False)):
            for cue in cue_pattern.finditer(clause):
                if is_positive != negated(clause, cue.start()):
                    positive += 1
                else:
                    negative += 1

    if positive > negative:
        return "positive"
    if negative > positive:
        return "negative"
    return "neutral"



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


def topic_pros_cons(scored, limit=5):
    """
    Identify the topics players discuss most positively and negatively.

    Each review contributes at most once to each topic, preventing
    repeated mentions from one review from dominating the results.
    """
    topic_stats = {}

    for review in scored:
        # score_reviews() stores cleaned review text under "text".
        text = review.get("text", "")

        if not text:
            continue

        # Use the topics already detected for this review.
        topics = review.get("topics", [])

        for topic in set(topics):
            pattern = TOPIC_PATTERNS.get(topic)

            if pattern is None:
                continue

            sentiment = topic_sentiment(text, pattern)

            if topic not in topic_stats:
                topic_stats[topic] = {
                    "positive": 0,
                    "negative": 0,
                    "neutral": 0,
                }

            topic_stats[topic][sentiment] += 1

    # Only show topics with a clear positive or negative signal.
    pros = []
    cons = []

    for topic, counts in topic_stats.items():
        positive = counts["positive"]
        negative = counts["negative"]
        neutral = counts["neutral"]
        total = positive + negative + neutral

        if total == 0:
            continue

        if positive > negative and positive >= 2:
            pros.append({
                "topic": topic,
                "mentions": positive,
                "totalMentions": total,
                "sentiment": "positive",
            })

        if negative > positive and negative >= 2:
            cons.append({
                "topic": topic,
                "mentions": negative,
                "totalMentions": total,
                "sentiment": "negative",
            })

    # Put the most frequently positive/negative topics first.
    pros.sort(key=lambda item: item["mentions"], reverse=True)
    cons.sort(key=lambda item: item["mentions"], reverse=True)

    return {
        "pros": pros[:limit],
        "cons": cons[:limit],
    }

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
# Issues (Issues page)
# ==========================================

ISSUE_TREND_PERIODS = 7
MIN_ISSUE_COMPLAINTS = 3


def issue_priority(complaints, total_reviews):
    share = complaints / total_reviews if total_reviews else 0
    if complaints >= 5 and share >= 0.04:
        return "Critical"
    if complaints >= 3 and share >= 0.02:
        return "High"
    if complaints >= 2:
        return "Medium"
    return "Low"


def is_complaint(review, topic):
    # The topic's own clause decides; a neutral mention follows the review's verdict
    sentiment = topic_sentiment(review["text"], TOPIC_PATTERNS[topic])
    return sentiment == "negative" or (sentiment == "neutral" and not review["recommended"])


def trend_periods(scored):
    dates = sorted(r["created_at"] for r in scored if r["created_at"])
    if len(dates) < 2 or dates[0] == dates[-1]:
        return None, []
    start = dates[0]
    width = (dates[-1] - start) / ISSUE_TREND_PERIODS
    label_format = "%b %d %H:00" if dates[-1] - start <= timedelta(days=2) else "%b %d"
    labels = [
        (start + width * i).strftime(label_format)
        for i in range(ISSUE_TREND_PERIODS)
    ]
    return (start, width), labels


def issue_trend(reviews, periods):
    if periods is None:
        return []
    start, width = periods
    counts = [0] * ISSUE_TREND_PERIODS
    for review in reviews:
        if review["created_at"]:
            index = int((review["created_at"] - start) / width)
            counts[min(index, ISSUE_TREND_PERIODS - 1)] += 1
    busiest = max(counts)
    return [round(100 * count / busiest) if busiest else 0 for count in counts]


def issue_examples(complaints, others):
    by_quality = lambda r: (r["quality_score"], r["helpful_votes"])
    complaints = sorted(complaints, key=by_quality, reverse=True)
    others = sorted(others, key=by_quality, reverse=True)
    picked = [(r, "negative") for r in complaints[:2]] + [(r, "positive") for r in others[:1]]
    spare = [(r, "negative") for r in complaints[2:]] + [(r, "positive") for r in others[1:]]
    picked += spare[: 3 - len(picked)]
    return [{"type": kind, "text": shorten(r["text"], 240)} for r, kind in picked]


def build_issues(stored, min_complaints=MIN_ISSUE_COMPLAINTS):
    scored = score_reviews(stored["reviews"])
    periods, labels = trend_periods(scored)

    issues = []
    for topic, pattern in TOPIC_PATTERNS.items():
        complaints = [r for r in scored if topic in r["topics"] and is_complaint(r, topic)]
        if len(complaints) < min_complaints:
            continue
        complaint_ids = {r["review_id"] for r in complaints}
        mentioning = [r for r in scored if topic in r["topics"]]
        others = [r for r in mentioning if r["review_id"] not in complaint_ids]
        from_recommended = sum(1 for r in complaints if r["recommended"])

        words = Counter(
            match.lower() for r in complaints for match in pattern.findall(r["text"])
        )
        common = ", ".join(f'"{word}"' for word, _ in words.most_common(3))

        issues.append(
            {
                "name": topic,
                "mentions": len(mentioning),
                "negative": len(complaints),
                "positive": len(others),
                "helpfulVotes": round(
                    average([r["helpful_votes"] for r in mentioning]), 1
                ),
                "priority": issue_priority(len(complaints), len(scored)),
                "description": (
                    f"Complained about in {len(complaints)} of "
                    f"{count_of(len(scored), 'review')} "
                    f"({round(100 * len(complaints) / len(scored), 1)}%), "
                    f"including {from_recommended} that still recommend the game. "
                    f"Praised or neutral in {len(others)}. "
                    f"Common words: {common}."
                ),
                "examples": issue_examples(complaints, others),
                "trend": issue_trend(complaints, periods),
            }
        )

    issues.sort(key=lambda issue: (issue["negative"], issue["mentions"]), reverse=True)
    return {
        "trendLabels": labels,
        "minComplaints": min_complaints,
        "totalReviews": len(scored),
        "issues": issues,
    }


# ==========================================
# Issue Search: How Players Talk About One Topic in One Game
# ==========================================

MIN_TREND_MENTIONS = 5


def complaint_rate(reviews, topic):
    return percent(sum(1 for r in reviews if is_complaint(r, topic)), len(reviews))


def topic_trend(scored, mentioning, topic):
    # Compare the older half of the reviews with the newer half
    dates = sorted(r["created_at"] for r in scored if r["created_at"])
    if len(dates) < 2 or dates[0] == dates[-1]:
        return None
    middle = dates[len(dates) // 2]

    earlier = [r for r in mentioning if r["created_at"] and r["created_at"] < middle]
    recent = [r for r in mentioning if r["created_at"] and r["created_at"] >= middle]
    if len(earlier) < MIN_TREND_MENTIONS or len(recent) < MIN_TREND_MENTIONS:
        return None

    earlier_rate = complaint_rate(earlier, topic)
    recent_rate = complaint_rate(recent, topic)
    return {
        "since": middle.isoformat(),
        "earlierComplaintRate": earlier_rate,
        "recentComplaintRate": recent_rate,
        "change": recent_rate - earlier_rate,
    }


def topic_standing(stored, topic):
    scored = score_reviews(stored["reviews"])
    pattern = TOPIC_PATTERNS[topic]
    mentioning = [r for r in scored if topic in r["topics"]]
    complaints = sum(1 for r in mentioning if is_complaint(r, topic))
    praised = sum(
        1 for r in mentioning if topic_sentiment(r["text"], pattern) == "positive"
    )

    return {
        "totalReviews": len(scored),
        "mentions": len(mentioning),
        "praised": praised,
        "complaints": complaints,
        "praiseRate": percent(praised, len(mentioning)),
        "complaintRate": percent(complaints, len(mentioning)),
        "trend": topic_trend(scored, mentioning, topic),
    }


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

        # Preserve Steam's original review timestamp.
        created_at = review.get("created_at")

        if created_at is not None:
            created_at = (
                created_at.isoformat()
                if hasattr(created_at, "isoformat")
                else str(created_at)
            )

        cards.append(
            {
                "id": numeric_id(review),
                "createdAt": created_at,
                "sentiment": (
                    "positive" if review["recommended"] else "negative"
                ),
                "quality": review["quality"],
                "qualityScore": review["quality_score"],
                "text": shorten(review["text"], 900),
                "tags": signals,
                "playtime": round(review["playtime"], 1),
                "playtimeAtReview": round(
                    review["playtime_at_review"], 1
                ),
                "helpfulVotes": review["helpful_votes"],
                "signals": signals,
                "developerSignal": developer_signal(review),
                "priority": priority(review),
                "detailed": review["detailed"],
            }
        )

    # Keep the default ranking: highest quality, then most helpful.
    cards.sort(
        key=lambda card: (
            card["qualityScore"],
            card["helpfulVotes"],
        ),
        reverse=True,
    )

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
        "prosAndCons": topic_pros_cons(scored),
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


# ==========================================
# Patch Impact: Reviews Before and After Each Update
# ==========================================

# Days of reviews compared on each side of an update. A window also stops
# at the neighbouring update, so each comparison is about one update only.
PATCH_WINDOW_DAYS = 14
# Reviews each side needs before GameScope compares them
MIN_PATCH_REVIEWS = 10
# A topic is listed when this many reviews complain about it on either side
MIN_PATCH_COMPLAINTS = 3
# |z| at or above this is a real change, not noise (two-proportion z-test,
# about 95% confidence)
SIGNIFICANT_Z = 1.96


def proportion_z(hits_a, total_a, hits_b, total_b):
    """
    Two-proportion z-test: how many standard errors apart two rates are.
    Small samples swing a lot, so the website only calls a change real
    when |z| >= SIGNIFICANT_Z.
    """
    if not total_a or not total_b:
        return 0.0
    pooled = (hits_a + hits_b) / (total_a + total_b)
    spread = math.sqrt(pooled * (1 - pooled) * (1 / total_a + 1 / total_b))
    if not spread:
        return 0.0
    return (hits_b / total_b - hits_a / total_a) / spread


def change_direction(z, higher_is_better):
    if abs(z) < SIGNIFICANT_Z:
        return "steady"
    return "improved" if (z > 0) == higher_is_better else "worsened"


def window_summary(reviews):
    dates = [r["created_at"] for r in reviews]
    positive = sum(1 for r in reviews if r["recommended"])
    return {
        "reviews": len(reviews),
        "positive": positive,
        "positivePct": percent(positive, len(reviews)),
        "from": min(dates).isoformat() if dates else None,
        "to": max(dates).isoformat() if dates else None,
    }


def patch_topic_changes(before, after):
    changes = []
    for topic in TOPIC_PATTERNS:
        before_hits = sum(
            1 for r in before if topic in r["topics"] and is_complaint(r, topic)
        )
        after_hits = sum(
            1 for r in after if topic in r["topics"] and is_complaint(r, topic)
        )
        if max(before_hits, after_hits) < MIN_PATCH_COMPLAINTS:
            continue

        # Share of ALL reviews in the window that complain about the topic,
        # so a quieter week after the patch doesn't look like a fix
        before_rate = round(100 * before_hits / len(before), 1)
        after_rate = round(100 * after_hits / len(after), 1)
        z = proportion_z(before_hits, len(before), after_hits, len(after))
        changes.append(
            {
                "topic": topic,
                "beforeComplaints": before_hits,
                "afterComplaints": after_hits,
                "beforeRate": before_rate,
                "afterRate": after_rate,
                "change": round(after_rate - before_rate, 1),
                "direction": change_direction(z, higher_is_better=False),
            }
        )

    changes.sort(key=lambda item: abs(item["change"]), reverse=True)
    return changes


def short_date(moment):
    return f"{moment:%b} {moment.day}, {moment.year}"


def patch_summary(title, posted_at, before, after, direction, topics):
    when = short_date(posted_at)
    parts = [
        f'After "{title}" ({when}), {after["positivePct"]}% of reviews '
        f'recommend the game, compared with {before["positivePct"]}% before.'
    ]
    if direction == "steady":
        parts.append("That difference is within normal noise.")

    fixed = [t for t in topics if t["direction"] == "improved"]
    broke = [t for t in topics if t["direction"] == "worsened"]
    if fixed:
        top = fixed[0]
        parts.append(
            f"{top['topic']} complaints fell from {top['beforeRate']:g}% "
            f"to {top['afterRate']:g}% of reviews."
        )
    if broke:
        top = broke[0]
        parts.append(
            f"{top['topic']} complaints rose from {top['beforeRate']:g}% "
            f"to {top['afterRate']:g}% of reviews."
        )
    if not fixed and not broke:
        parts.append("No topic's complaint rate changed by more than noise.")
    return " ".join(parts)


def build_patch_impact(
    stored,
    updates,
    window_days=PATCH_WINDOW_DAYS,
    min_reviews=MIN_PATCH_REVIEWS,
    include_announcements=False,
    statuses=None,
):
    """
    Compare the reviews written just before each update with those
    written just after it: overall sentiment and each topic's complaints.

    updates: rows from game_updates (update_id, title, url, posted_at,
    is_patch_notes). statuses: the Issues page status for each topic.
    """
    statuses = statuses or {}
    scored = [r for r in score_reviews(stored["reviews"]) if r["created_at"]]
    scored.sort(key=lambda r: r["created_at"])

    chosen = sorted(
        (
            u
            for u in updates
            if u["posted_at"] and (include_announcements or u["is_patch_notes"])
        ),
        key=lambda u: u["posted_at"],
    )

    first_review = scored[0]["created_at"] if scored else None
    last_review = scored[-1]["created_at"] if scored else None
    window = timedelta(days=window_days)

    patches = []
    for index, update in enumerate(chosen):
        posted = update["posted_at"]
        previous = chosen[index - 1]["posted_at"] if index > 0 else None
        following = chosen[index + 1]["posted_at"] if index + 1 < len(chosen) else None

        start = max(posted - window, previous) if previous else posted - window
        end = min(posted + window, following) if following else posted + window

        before = [r for r in scored if start <= r["created_at"] < posted]
        after = [r for r in scored if posted <= r["created_at"] < end]

        entry = {
            "id": str(update["update_id"]),
            "title": update["title"],
            "url": update["url"],
            "postedAt": posted.isoformat(),
            "isPatchNotes": bool(update["is_patch_notes"]),
            "before": window_summary(before),
            "after": window_summary(after),
        }

        if not scored or posted < first_review or posted > last_review:
            entry.update(state="outside_reviews", verdict="unknown")
        elif len(before) < min_reviews or len(after) < min_reviews:
            entry.update(state="too_few_reviews", verdict="unknown")
        else:
            z = proportion_z(
                entry["before"]["positive"], len(before),
                entry["after"]["positive"], len(after),
            )
            direction = change_direction(z, higher_is_better=True)
            topics = patch_topic_changes(before, after)
            for topic in topics:
                topic["issueStatus"] = statuses.get(topic["topic"])
            entry.update(
                state="measured",
                verdict=direction,
                sentimentChange=(
                    entry["after"]["positivePct"] - entry["before"]["positivePct"]
                ),
                topics=topics,
                summary=patch_summary(
                    update["title"], posted, entry["before"], entry["after"],
                    direction, topics,
                ),
            )
        patches.append(entry)

    patches.reverse()  # newest first
    measured = [p for p in patches if p["state"] == "measured"]

    return {
        "windowDays": window_days,
        "minReviews": min_reviews,
        "includeAnnouncements": include_announcements,
        "reviewsFrom": first_review.isoformat() if first_review else None,
        "reviewsTo": last_review.isoformat() if last_review else None,
        "totalReviews": len(scored),
        "totalUpdates": len(updates),
        "patchNotes": sum(1 for u in updates if u["is_patch_notes"]),
        "measured": len(measured),
        "patches": patches,
    }
