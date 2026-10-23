
import { useEffect, useMemo, useState } from "react";
import "./RightGameForPlayer.css";

type Category = "performance" | "story" | "multiplayer" | "value";

interface Preferences {
  performance: number;
  story: number;
  multiplayer: number;
  value: number;
}

interface Review {
  text: string;
  sentiment: "positive" | "negative" | "unknown";
  helpfulVotes: number;
}

interface Evidence {
  category: Category;
  label: string;
  positive: string[];
  negative: string[];
}

interface ApiData {
  analysis: unknown;
  issues: unknown;
  reviews: unknown;
}

interface Props {
  appId: string;
  gameName: string;
  apiBase?: string;
  darkMode?: boolean;
}

const CATEGORIES: {
  key: Category;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    key: "performance",
    label: "Performance & stability",
    description: "Frame rate, crashes, optimization, and bugs",
    icon: "⚡",
  },
  {
    key: "story",
    label: "Story & immersion",
    description: "Narrative, characters, world, and atmosphere",
    icon: "📖",
  },
  {
    key: "multiplayer",
    label: "Multiplayer",
    description: "Online play, matchmaking, and co-op",
    icon: "🎮",
  },
  {
    key: "value",
    label: "Price & value",
    description: "Pricing, content, progression, and perceived value",
    icon: "💎",
  },
];

const KEYWORDS: Record<Category, string[]> = {
  performance: [
    "performance", "fps", "frame rate", "stutter", "stuttering",
    "lag", "crash", "crashing", "optimization", "optimisation",
    "bug", "bugs", "buggy", "freeze", "freezing",
  ],
  story: [
    "story", "storyline", "narrative", "writing", "character",
    "characters", "dialogue", "dialog", "plot", "worldbuilding",
    "world building", "immersion", "campaign",
  ],
  multiplayer: [
    "multiplayer", "co-op", "coop", "online", "matchmaking",
    "server", "servers", "pvp", "pve", "connection", "crossplay",
    "cross-play", "friends", "disconnect",
  ],
  value: [
    "price", "pricing", "worth it", "worth the money", "value",
    "expensive", "overpriced", "microtransaction", "microtransactions",
    "pay to win", "pay-to-win", "dlc", "content", "grind",
    "grindy", "purchase",
  ],
};

const POSITIVE_WORDS = [
  "great", "good", "excellent", "love", "amazing", "enjoy",
  "enjoyable", "smooth", "stable", "beautiful", "fun", "recommend",
  "fantastic", "well optimized", "well-optimized", "worth it",
  "immersive", "engaging", "polished", "impressive",
];

const NEGATIVE_WORDS = [
  "bad", "poor", "terrible", "awful", "hate", "broken",
  "unplayable", "crash", "crashes", "crashing", "lag", "stutter",
  "stuttering", "bug", "bugs", "boring", "disappointing",
  "overpriced", "waste", "frustrating", "unoptimized",
  "unoptimised", "pay to win", "pay-to-win",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstValue(
  object: Record<string, unknown>,
  keys: string[]
): unknown {
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null) {
      return object[key];
    }
  }
  return undefined;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getReviewText(review: unknown): string {
  if (typeof review === "string") return review;
  if (!isRecord(review)) return "";

  return asText(
    firstValue(review, ["text", "review_text", "reviewText", "content"])
  );
}

function getSentiment(review: unknown): Review["sentiment"] {
  if (!isRecord(review)) return "unknown";

  const direct = firstValue(review, [
    "sentiment",
    "recommended",
    "recommendation",
    "voted_up",
  ]);

  if (typeof direct === "boolean") {
    return direct ? "positive" : "negative";
  }

  if (typeof direct === "number") {
    return direct > 0 ? "positive" : "negative";
  }

  const value = asText(direct).toLowerCase();

  if (["positive", "recommended", "true", "yes", "1"].includes(value)) {
    return "positive";
  }

  if (["negative", "not recommended", "false", "no", "0"].includes(value)) {
    return "negative";
  }

  return "unknown";
}

function getHelpfulVotes(review: unknown): number {
  if (!isRecord(review)) return 0;

  return Math.max(
    0,
    asNumber(
      firstValue(review, [
        "helpfulVotes",
        "helpful_votes",
        "votes",
        "votes_up",
      ])
    )
  );
}

function getReviewList(data: unknown): Review[] {
  const raw = Array.isArray(data)
    ? data
    : isRecord(data)
      ? firstValue(data, ["reviews", "reviewCards", "items", "results"])
      : [];

  return asArray(raw)
    .map((item) => ({
      text: getReviewText(item),
      sentiment: getSentiment(item),
      helpfulVotes: getHelpfulVotes(item),
    }))
    .filter((review) => review.text.length > 0);
}

function containsKeyword(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}

function classifyReview(text: string): Review["sentiment"] {
  const positive = POSITIVE_WORDS.some((word) =>
    containsKeyword(text, word)
  );
  const negative = NEGATIVE_WORDS.some((word) =>
    containsKeyword(text, word)
  );

  if (positive && !negative) return "positive";
  if (negative && !positive) return "negative";
  return "unknown";
}

function hasNegativeContext(text: string, keyword: string): boolean {
  const index = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (index < 0) return false;

  const context = text
    .slice(
      Math.max(0, index - 70),
      Math.min(text.length, index + keyword.length + 70)
    )
    .toLowerCase();

  return [
    "not ", "never ", "no ", "bad ", "poor ", "terrible ",
    "awful ", "broken ", "unplayable", "crash", "lag",
    "stutter", "bug", "boring", "overpriced", "disappointing",
  ].some((word) => context.includes(word));
}

function buildEvidence(reviews: Review[]): Evidence[] {
  return CATEGORIES.map(({ key, label }) => {
    const matched = reviews.filter((review) =>
      KEYWORDS[key].some((keyword) =>
        containsKeyword(review.text, keyword)
      )
    );

    const positive: string[] = [];
    const negative: string[] = [];

    matched.forEach((review) => {
      const sentiment =
        review.sentiment === "unknown"
          ? classifyReview(review.text)
          : review.sentiment;

      const hasNegative = KEYWORDS[key].some((keyword) =>
        hasNegativeContext(review.text, keyword)
      );

      if (sentiment === "negative" || hasNegative) {
        negative.push(review.text);
      } else if (sentiment === "positive") {
        positive.push(review.text);
      }
    });

    return {
      category: key,
      label,
      positive: [...new Set(positive)],
      negative: [...new Set(negative)],
    };
  });
}

function countEvidence(item: Evidence): number {
  return item.positive.length + item.negative.length;
}

function getFitResult(
  evidence: Evidence[],
  preferences: Preferences
): {
  title: string;
  description: string;
  status: "good" | "mixed" | "caution" | "unknown";
} {
  const relevant = evidence.filter(
    (item) => preferences[item.category] >= 3 && countEvidence(item) > 0
  );

  const highPriorityEvidence = relevant.filter(
    (item) => preferences[item.category] >= 4
  );

  if (relevant.length === 0) {
    return {
      title: "Not enough evidence yet",
      description:
        "Available reviews don't clearly address your main priorities.",
      status: "unknown",
    };
  }

  const positive = relevant.reduce(
    (sum, item) => sum + item.positive.length * preferences[item.category],
    0
  );
  const negative = relevant.reduce(
    (sum, item) => sum + item.negative.length * preferences[item.category],
    0
  );

  const total = positive + negative;

  if (total === 0) {
    return {
      title: "More evidence needed",
      description: "We found relevant reviews but couldn't classify their sentiment.",
      status: "unknown",
    };
  }

  const negativeRatio = negative / total;
  const highPriorityConcerns = highPriorityEvidence.some(
    (item) => item.negative.length > item.positive.length
  );

  if (negativeRatio >= 0.65 || highPriorityConcerns) {
    return {
      title: "Potential mismatch",
      description: "Reviews raise concerns in areas you've marked as important.",
      status: "caution",
    };
  }

  if (negativeRatio >= 0.4) {
    return {
      title: "A mixed fit",
      description: "Players report both strengths and drawbacks in your priority areas.",
      status: "mixed",
    };
  }

  return {
    title: "Potentially a good fit",
    description: "Classified reviews lean positive in the areas you care about.",
    status: "good",
  };
}

function truncateReview(text: string, maxLength = 220): string {
  const cleaned = text.replace(/\s+/g, " ").trim();

  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).trimEnd()}…`;
}

export default function RightGameForPlayer({
  appId,
  gameName,
  apiBase = "/api",
  darkMode = false,
}: Props) {
  const [preferences, setPreferences] = useState<Preferences>({
    performance: 5,
    story: 4,
    multiplayer: 3,
    value: 4,
  });

  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!appId) {
      setData(null);
      return;
    }

    const controller = new AbortController();

    async function loadEvidence() {
      setLoading(true);
      setError("");
      setData(null);

      const base = apiBase.replace(/\/$/, "");
      const endpoints = [
        `${base}/games/${encodeURIComponent(appId)}/analysis`,
        `${base}/games/${encodeURIComponent(appId)}/issues`,
        `${base}/games/${encodeURIComponent(appId)}/reviews?limit=500`,
      ];

      try {
        const responses = await Promise.all(
          endpoints.map((url) => fetch(url, { signal: controller.signal }))
        );

        const payloads = await Promise.all(
          responses.map(async (response) => {
            if (!response.ok) return null;
            try {
              return await response.json();
            } catch {
              return null;
            }
          })
        );

        if (controller.signal.aborted) return;

        const [analysis, issues, reviews] = payloads;

        if (!analysis && !issues && !reviews) {
          throw new Error(
            "No review evidence available. Analyze this game first."
          );
        }

        setData({ analysis, issues, reviews });
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Couldn't load review evidence."
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadEvidence();

    return () => controller.abort();
  }, [appId, apiBase]);

  const reviews = useMemo(() => getReviewList(data?.reviews), [data]);
  const evidence = useMemo(() => buildEvidence(reviews), [reviews]);

  const result = useMemo(
    () => getFitResult(evidence, preferences),
    [evidence, preferences]
  );

  const totalRelevant = evidence.reduce(
    (sum, item) => sum + countEvidence(item),
    0
  );

  // Select no more than three unique quotes, prioritizing categories
  // the player cares about most.
  const selectedQuotes = useMemo(() => {
    const candidates: {
      text: string;
      sentiment: "positive" | "negative";
      category: Category;
      priority: number;
    }[] = [];

    evidence.forEach((item) => {
      item.positive.forEach((text) => {
        candidates.push({
          text,
          sentiment: "positive",
          category: item.category,
          priority: preferences[item.category],
        });
      });

      item.negative.forEach((text) => {
        candidates.push({
          text,
          sentiment: "negative",
          category: item.category,
          priority: preferences[item.category],
        });
      });
    });

    const unique = Array.from(
      new Map(candidates.map((item) => [item.text, item])).values()
    );

    return unique
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        if (a.sentiment !== b.sentiment) {
          return a.sentiment === "negative" ? -1 : 1;
        }
        return b.text.length - a.text.length;
      })
      .slice(0, 3);
  }, [evidence, preferences]);

  function updatePreference(category: Category, value: number) {
    setPreferences((current) => ({
      ...current,
      [category]: value,
    }));
  }

  return (
    <section className={`right-for-me ${darkMode ? "right-for-me-dark" : ""}`}>
      <header className="right-for-me-header">
        <div>
          <span className="right-for-me-eyebrow">PERSONAL GAME MATCH</span>
          <h2>Is {gameName || "this game"} right for me?</h2>
          <p>Choose your priorities to see how this game matches up.</p>
        </div>
        <span className="right-for-me-icon" aria-hidden="true">✦</span>
      </header>

      <div className="right-for-me-layout">
        <div className="right-for-me-preferences">
          <div className="right-for-me-section-title">
            <h3>Your priorities</h3>
            <p>How important is each category?</p>
          </div>

          {CATEGORIES.map((category) => (
            <div className="right-for-me-priority" key={category.key}>
              <div className="right-for-me-priority-heading">
                <span className="right-for-me-category-icon">
                  {category.icon}
                </span>
                <div>
                  <strong>{category.label}</strong>
                  <p>{category.description}</p>
                </div>
              </div>

              <div className="right-for-me-levels">
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    type="button"
                    key={level}
                    className={preferences[category.key] === level ? "selected" : ""}
                    aria-label={`${category.label}: ${level} out of 5`}
                    aria-pressed={preferences[category.key] === level}
                    onClick={() => updatePreference(category.key, level)}
                  >
                    {level}
                  </button>
                ))}
              </div>

              <div className="right-for-me-level-labels">
                <span>Not important</span>
                <span>Must-have</span>
              </div>
            </div>
          ))}
        </div>

        <div className="right-for-me-results">
          <div className="right-for-me-section-title">
            <h3>Your assessment</h3>
            <p>Based on available player reviews</p>
          </div>

          {loading ? (
            <div className="right-for-me-state">
              <span className="right-for-me-spinner" />
              <strong>Checking player feedback...</strong>
            </div>
          ) : error ? (
            <div className="right-for-me-state right-for-me-error">
              <strong>Evidence unavailable</strong>
              <p>{error}</p>
            </div>
          ) : (
            <>
              <div className={`right-for-me-verdict ${result.status}`}>
                <span className="right-for-me-verdict-label">
                  GAME MATCH
                </span>
                <h3>{result.title}</h3>
                <p>{result.description}</p>
              </div>

              <div className="right-for-me-evidence-count">
                <div>
                  <strong>{totalRelevant.toLocaleString("en-US")}</strong>
                  <span>classified category mentions</span>
                </div>
                <small>{reviews.length.toLocaleString("en-US")} reviews loaded</small>
              </div>

              <div className="right-for-me-evidence-list">
                {evidence.map((item) => (
                  <article className="right-for-me-evidence-card" key={item.category}>
                    <div className="right-for-me-evidence-heading">
                      <div>
                        <strong>{item.label}</strong>
                        <span className="right-for-me-priority-tag">
                          Priority {preferences[item.category]}/5
                        </span>
                      </div>
                      <span className="right-for-me-mention-count">
                        {countEvidence(item)} classified
                      </span>
                    </div>

                    <div className="right-for-me-mini-stats">
                      <span className="positive">+ {item.positive.length} positive</span>
                      <span className="negative">− {item.negative.length} negative</span>
                    </div>
                  </article>
                ))}
              </div>

              {selectedQuotes.length > 0 && (
                <div className="right-for-me-quotes">
                  <div className="right-for-me-section-title">
                    <h3>Review highlights</h3>
                    <p>Up to 3 examples from player feedback</p>
                  </div>

                  {selectedQuotes.map((quote, index) => {
                    const categoryLabel =
                      CATEGORIES.find((item) => item.key === quote.category)?.label ??
                      quote.category;

                    return (
                      <blockquote
                        key={`${quote.category}-${quote.sentiment}-${index}`}
                        className={
                          quote.sentiment === "positive" ? "positive-quote" : ""
                        }
                      >
                        <span>
                          {categoryLabel} ·{" "}
                          {quote.sentiment === "positive" ? "Positive" : "Concern"}
                        </span>
                        {truncateReview(quote.text)}
                      </blockquote>
                    );
                  })}
                </div>
              )}

              <p className="right-for-me-disclaimer">
                Experimental keyword-based assessment. Review sentiment and
                category matches may be imperfect.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
