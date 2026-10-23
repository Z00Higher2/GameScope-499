
import { useEffect, useMemo, useState } from "react";
import Navbar from "./Navbar";
import { getReviewCards } from "../api";
import type { GameAnalysis, ReviewCard } from "../api";
import type { Page, Mode } from "../type";
import "./Reviews.css";

interface ReviewsProps {
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  currentPage: Page;
  setCurrentPage: React.Dispatch<React.SetStateAction<Page>>;
  onLogoClick: () => void;
  analyzed: boolean;
  analyzedAppId: string;
  analysis: GameAnalysis | null;
  mode: Mode;
}

type Review = ReviewCard;

const signalIcons: Record<string, string> = {
  Inventory: "▦",
  Performance: "◒",
  Bugs: "⚠",
  Multiplayer: "◉",
  Story: "✎",
  Combat: "⚔",
  Sound: "♫",
  Graphics: "◐",
  Content: "▤",
  Progression: "▲",
  Price: "◈",
  Controls: "◎",
  UI: "▣",
  Difficulty: "◭",
  Developers: "⚙",
};

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : "0";
}

function formatPostedDate(createdAt: string | null): string {
  if (!createdAt) return "Date unavailable";

  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeTime(createdAt: string | null): string {
  if (!createdAt) return "";

  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) return "";

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 0) return "In the future";
  if (seconds < 60) return "Just now";

  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }

  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }

  if (seconds < 2592000) {
    const days = Math.floor(seconds / 86400);
    return `${days} ${days === 1 ? "day" : "days"} ago`;
  }

  if (seconds < 31536000) {
    const months = Math.floor(seconds / 2592000);
    return `${months} ${months === 1 ? "month" : "months"} ago`;
  }

  const years = Math.floor(seconds / 31536000);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

function Reviews({
  darkMode,
  setDarkMode,
  currentPage,
  setCurrentPage,
  onLogoClick,
  analyzed,
  analyzedAppId,
  analysis,
  mode,
}: ReviewsProps) {
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [qualityFilter, setQualityFilter] = useState("all");
  const [sortBy, setSortBy] = useState("quality");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSignal, setActiveSignal] = useState<string | null>(null);

  const [reviewCards, setReviewCards] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(analyzed);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!analyzed || !analyzedAppId) {
      setReviewCards([]);
      setLoadError("");
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();

    setIsLoading(true);
    setLoadError("");
    setReviewCards([]);

    getReviewCards(analyzedAppId, controller.signal)
      .then(setReviewCards)
      .catch((loadFailure: Error) => {
        if (loadFailure.name !== "AbortError") {
          setReviewCards([]);
          setLoadError(loadFailure.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [analyzed, analyzedAppId, analysis]);

  const gameName =
    analysis?.game.name ||
    (analyzedAppId ? `Steam Game ${analyzedAppId}` : "No game selected");

  const playerSignals = (analysis?.playerSignals ?? []).map((signal) => ({
    ...signal,
    icon: signalIcons[signal.name] ?? "◆",
  }));

  const filteredReviews = useMemo(() => {
    let reviews = [...reviewCards];

    if (sentimentFilter !== "all") {
      reviews = reviews.filter(
        (review) => review.sentiment === sentimentFilter
      );
    }

    if (qualityFilter !== "all") {
      reviews = reviews.filter(
        (review) => review.quality === qualityFilter
      );
    }

    if (activeSignal) {
      reviews = reviews.filter((review) =>
        review.signals.some(
          (signal) =>
            signal.toLowerCase() === activeSignal.toLowerCase()
        )
      );
    }

    const query = searchQuery.trim().toLowerCase();

    if (query) {
      reviews = reviews.filter((review) => {
        const searchableText = [
          review.text,
          ...review.tags,
          ...review.signals,
          review.developerSignal,
          review.sentiment,
          review.quality,
        ]
          .join(" ")
          .toLowerCase();

        return searchableText.includes(query);
      });
    }

    const getTimestamp = (review: Review): number => {
      if (!review.createdAt) return Number.NaN;
      return Date.parse(review.createdAt);
    };

    const compareDates = (
      a: Review,
      b: Review,
      direction: "newest" | "oldest"
    ): number => {
      const dateA = getTimestamp(a);
      const dateB = getTimestamp(b);
      const validA = Number.isFinite(dateA);
      const validB = Number.isFinite(dateB);

      // Keep reviews without usable dates at the bottom.
      if (!validA && !validB) return 0;
      if (!validA) return 1;
      if (!validB) return -1;

      return direction === "newest"
        ? dateB - dateA
        : dateA - dateB;
    };

    switch (sortBy) {
      case "quality":
        reviews.sort((a, b) => b.qualityScore - a.qualityScore);
        break;

      case "helpful":
        reviews.sort((a, b) => b.helpfulVotes - a.helpfulVotes);
        break;

      case "playtime":
        reviews.sort((a, b) => b.playtime - a.playtime);
        break;

      case "newest":
        reviews.sort((a, b) => compareDates(a, b, "newest"));
        break;

      case "oldest":
        reviews.sort((a, b) => compareDates(a, b, "oldest"));
        break;
    }

    return reviews;
  }, [
    reviewCards,
    sentimentFilter,
    qualityFilter,
    sortBy,
    searchQuery,
    activeSignal,
  ]);

  const handleSignalClick = (signal: string) => {
    setActiveSignal((current) =>
      current === signal ? null : signal
    );
  };

  const resetFilters = () => {
    setSentimentFilter("all");
    setQualityFilter("all");
    setSortBy("quality");
    setSearchQuery("");
    setActiveSignal(null);
  };

  const filtersActive =
    sentimentFilter !== "all" ||
    qualityFilter !== "all" ||
    searchQuery.trim() !== "" ||
    activeSignal !== null;

  const summary = analysis?.summary;

  const totalReviews = summary?.totalReviews ?? reviewCards.length;
  const positiveReviews = summary?.positiveReviews ?? 0;
  const negativeReviews = summary?.negativeReviews ?? 0;
  const positivePercentage = summary?.positivePercentage ?? 0;
  const negativePercentage = summary?.negativePercentage ?? 0;
  const qualityScore = summary?.reviewQuality ?? 0;
  const highQualityPercentage = summary?.highQualityPercentage ?? 0;
  const detailedPercentage = summary?.detailedPercentage ?? 0;
  const reliablePercentage = summary?.reliablePercentage ?? 0;

  const clampScore = (score: number) =>
    Math.max(0, Math.min(score, 100));

  const getSortLabel = () => {
    switch (sortBy) {
      case "quality":
        return "quality";
      case "helpful":
        return "helpfulness";
      case "playtime":
        return "playtime";
      case "newest":
        return "newest first";
      case "oldest":
        return "oldest first";
      default:
        return sortBy;
    }
  };

  if (isLoading) {
    return (
      <main className={`reviews-page ${darkMode ? "dark-mode" : ""}`}>
        <Navbar
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          onLogoClick={onLogoClick}
          mode={mode}
        />

        <section className="reviews-loading" aria-live="polite">
          <div className="reviews-loading-content">
            <div className="reviews-loading-icon">
              <span />
            </div>

            <span className="reviews-eyebrow">PLAYER TELEMETRY</span>
            <h1>ANALYZING REVIEW DATA...</h1>

            <p>
              Processing player feedback and identifying meaningful signals.
            </p>

            <div className="reviews-loading-line">
              <span />
            </div>

            <small>
              GAME: {gameName.toUpperCase()} {" • "} APP ID: {analyzedAppId}
            </small>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={`reviews-page ${darkMode ? "dark-mode" : ""}`}>
      <Navbar
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        onLogoClick={onLogoClick}
        mode={mode}
      />

      {!analyzed ? (
        <section className="reviews-empty reviews-animate reviews-animate-1">
          <div className="reviews-empty-icon">◉</div>
          <span className="reviews-eyebrow">PLAYER TELEMETRY</span>
          <h1>No Game Analyzed</h1>
          <p>
            Analyze a Steam game from the Dashboard to view individual player
            feedback, review quality, and developer signals.
          </p>
          <button
            type="button"
            onClick={() => setCurrentPage("dashboard")}
          >
            Go to Dashboard
          </button>
        </section>
      ) : loadError ? (
        <section className="reviews-empty reviews-animate reviews-animate-1">
          <div className="reviews-empty-icon">!</div>
          <span className="reviews-eyebrow">PLAYER TELEMETRY</span>
          <h1>Couldn't Load Reviews</h1>
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => setCurrentPage("dashboard")}
          >
            Go to Dashboard
          </button>
        </section>
      ) : (
        <div className="reviews-container">
          {/* HEADER */}
          <section className="reviews-header reviews-animate reviews-animate-1">
            <div>
              <p className="reviews-eyebrow">PLAYER FEEDBACK</p>
              <h1>Reviews</h1>
              <p className="reviews-subtitle">
                Explore the player feedback behind the analysis. GameScope
                ranks reviews by quality, detail, engagement, and actionable
                information.
              </p>
            </div>

            <div className="reviews-current-game">
              <div className="reviews-live-status">
                <span className="reviews-live-dot" />
                <span>LIVE ANALYSIS</span>
              </div>
              <strong>{gameName}</strong>
              <small>STEAM APP ID: {analyzedAppId}</small>
            </div>
          </section>

          {/* REVIEW INTELLIGENCE */}
          <section className="reviews-intelligence reviews-animate reviews-animate-2">
            <div className="reviews-intelligence-header">
              <div>
                <span className="section-label">REVIEW INTELLIGENCE</span>
                <h2>Feedback Overview</h2>
              </div>
              <span className="reviews-intelligence-status">
                ANALYSIS COMPLETE
              </span>
            </div>

            <div className="reviews-intelligence-grid">
              <div className="intelligence-stat">
                <span>TOTAL REVIEWS</span>
                <strong>{formatNumber(totalReviews)}</strong>
                <small>REVIEWS ANALYZED</small>
              </div>

              <div className="intelligence-stat positive-stat">
                <span>POSITIVE</span>
                <strong>{formatNumber(positiveReviews)}</strong>
                <small>{positivePercentage}% OF REVIEWS</small>
              </div>

              <div className="intelligence-stat negative-stat">
                <span>NEGATIVE</span>
                <strong>{formatNumber(negativeReviews)}</strong>
                <small>{negativePercentage}% OF REVIEWS</small>
              </div>

              <div className="intelligence-stat quality-stat">
                <span>QUALITY SCORE</span>
                <strong>{qualityScore}</strong>
                <small>OVERALL SIGNAL</small>
                <div
                  className="quality-progress"
                  role="progressbar"
                  aria-label="Overall review quality"
                  aria-valuenow={clampScore(qualityScore)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    style={{
                      width: `${clampScore(qualityScore)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* SUMMARY */}
          <section className="reviews-summary reviews-animate reviews-animate-3">
            <div>
              <span>PLAYER SIGNAL</span>
              <strong>{positivePercentage}%</strong>
              <small>Positive sentiment</small>
            </div>
            <div>
              <span>HIGH QUALITY</span>
              <strong>{highQualityPercentage}%</strong>
              <small>Actionable reviews</small>
            </div>
            <div>
              <span>DETAILED FEEDBACK</span>
              <strong>{detailedPercentage}%</strong>
              <small>Specific issue context</small>
            </div>
            <div>
              <span>COMMUNITY SIGNAL</span>
              <strong>{reliablePercentage}%</strong>
              <small>Reliable feedback</small>
            </div>
          </section>

          {/* TOP PLAYER SIGNALS */}
          <section className="reviews-player-signals reviews-animate reviews-animate-4">
            <div className="reviews-player-signals-header">
              <div>
                <span className="section-label">TOP PLAYER SIGNALS</span>
                <h2>What players are talking about</h2>
              </div>

              {activeSignal && (
                <button
                  type="button"
                  className="clear-signal-button"
                  onClick={() => setActiveSignal(null)}
                >
                  CLEAR SIGNAL
                </button>
              )}
            </div>

            <div className="player-signals-grid">
              {playerSignals.map((signal) => (
                <button
                  key={signal.name}
                  type="button"
                  className={`player-signal ${
                    activeSignal === signal.name ? "active" : ""
                  }`}
                  aria-pressed={activeSignal === signal.name}
                  onClick={() => handleSignalClick(signal.name)}
                >
                  <div className="player-signal-icon">{signal.icon}</div>

                  <div className="player-signal-info">
                    <span>{signal.name}</span>
                    <strong>{formatNumber(signal.count)}</strong>
                    <small>MENTIONS</small>
                  </div>

                  <div className="player-signal-arrow">→</div>
                </button>
              ))}
            </div>

            {activeSignal && (
              <div className="active-signal-message" aria-live="polite">
                <span className="active-signal-dot" />
                Showing reviews mentioning <strong>{activeSignal}</strong>
                <span>{filteredReviews.length} matching reviews</span>
              </div>
            )}
          </section>

          {/* FILTERS */}
          <section className="reviews-filters reviews-animate reviews-animate-5">
            <div className="reviews-filter-status">
              <span
                className={
                  filtersActive
                    ? "filter-status-dot active"
                    : "filter-status-dot"
                }
              />
              <span>{filtersActive ? "FILTERS ACTIVE" : "ALL REVIEWS"}</span>

              {filtersActive && (
                <button
                  type="button"
                  className="reviews-reset-filters"
                  onClick={resetFilters}
                >
                  Reset filters
                </button>
              )}
            </div>

            <div className="review-search">
              <label htmlFor="reviews-search">SEARCH FEEDBACK</label>
              <input
                id="reviews-search"
                type="text"
                placeholder="Search reviews, issues, or signals..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>

            <div className="review-filter">
              <label htmlFor="reviews-sentiment">SENTIMENT</label>
              <select
                id="reviews-sentiment"
                value={sentimentFilter}
                onChange={(event) => setSentimentFilter(event.target.value)}
              >
                <option value="all">All Reviews</option>
                <option value="positive">Positive</option>
                <option value="negative">Negative</option>
              </select>
            </div>

            <div className="review-filter">
              <label htmlFor="reviews-quality">QUALITY</label>
              <select
                id="reviews-quality"
                value={qualityFilter}
                onChange={(event) => setQualityFilter(event.target.value)}
              >
                <option value="all">All Quality</option>
                <option value="high">High Quality</option>
                <option value="moderate">Moderate</option>
                <option value="low">Low Quality</option>
              </select>
            </div>

            <div className="review-filter">
              <label htmlFor="reviews-sort">SORT BY</label>
              <select
                id="reviews-sort"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
              >
                <option value="quality">Highest Quality</option>
                <option value="helpful">Most Helpful</option>
                <option value="playtime">Highest Playtime</option>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </div>
          </section>

          {/* ACTIVE FILTER CHIPS */}
          {filtersActive && (
            <section
              className="reviews-active-filters"
              aria-label="Active review filters"
            >
              <span className="reviews-active-filters-label">
                ACTIVE FILTERS
              </span>

              {sentimentFilter !== "all" && (
                <button
                  type="button"
                  className="reviews-filter-chip"
                  onClick={() => setSentimentFilter("all")}
                  aria-label={`Remove ${sentimentFilter} sentiment filter`}
                >
                  Sentiment: {sentimentFilter}
                  <span aria-hidden="true">×</span>
                </button>
              )}

              {qualityFilter !== "all" && (
                <button
                  type="button"
                  className="reviews-filter-chip"
                  onClick={() => setQualityFilter("all")}
                  aria-label={`Remove ${qualityFilter} quality filter`}
                >
                  Quality: {qualityFilter}
                  <span aria-hidden="true">×</span>
                </button>
              )}

              {activeSignal && (
                <button
                  type="button"
                  className="reviews-filter-chip"
                  onClick={() => setActiveSignal(null)}
                  aria-label={`Remove ${activeSignal} signal filter`}
                >
                  Signal: {activeSignal}
                  <span aria-hidden="true">×</span>
                </button>
              )}

              {searchQuery.trim() && (
                <button
                  type="button"
                  className="reviews-filter-chip"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear review search"
                >
                  Search: "{searchQuery.trim()}"
                  <span aria-hidden="true">×</span>
                </button>
              )}
            </section>
          )}

          {/* RESULTS HEADER */}
          <div className="reviews-results-header reviews-animate reviews-animate-6">
            <div>
              <span className="section-label">PLAYER FEEDBACK</span>
              <h2>
                {filteredReviews.length}{" "}
                {filteredReviews.length === 1 ? "Review" : "Reviews"}
              </h2>
              <p className="reviews-result-count" aria-live="polite">
                Showing {filteredReviews.length} of {reviewCards.length} loaded
                reviews
              </p>
            </div>

            <span>
              {activeSignal
                ? `Filtered by ${activeSignal}`
                : `Sorted by ${getSortLabel()}`}
            </span>
          </div>

          {/* REVIEW CARDS */}
          {filteredReviews.length === 0 ? (
            <div className="reviews-no-results reviews-animate reviews-animate-6">
              <div className="no-results-indicator">
                <span />
              </div>

              <span className="no-results-label">NO MATCHING REVIEWS</span>
              <h2>No reviews match these filters</h2>
              <p>
                Try removing a filter or changing your search to discover more
                player feedback.
              </p>
              <div className="no-results-line" />

              {filtersActive && (
                <button type="button" onClick={resetFilters}>
                  CLEAR ALL FILTERS
                </button>
              )}
            </div>
          ) : (
            <div className="reviews-list">
              {filteredReviews.map((review, index) => (
                <article
                  className={`review-card reviews-animate reviews-review-${Math.min(
                    index + 5,
                    10
                  )} ${review.priority.toLowerCase().replace(/\s+/g, "-")}`}
                  key={review.id}
                >
                  {/* CARD TOP */}
                  <div className="review-card-top">
                    <div className="review-card-identity">
                      <span className="review-id">
                        REVIEW #{String(review.id).padStart(4, "0")}
                      </span>

                      <div className="review-quality">
                        <span className={`quality-dot ${review.quality}`} />
                        <span>{review.quality.toUpperCase()} QUALITY</span>
                      </div>
                    </div>

                    <div className="review-card-status">
                      <div
                        className={`quality-ring ${review.quality}`}
                        role="img"
                        aria-label={`Review quality score: ${clampScore(
                          review.qualityScore
                        )} out of 100`}
                        style={
                          {
                            "--quality-progress": `${
                              clampScore(review.qualityScore) * 3.6
                            }deg`,
                          } as React.CSSProperties
                        }
                      >
                        <div className="quality-ring-inner">
                          <strong>{clampScore(review.qualityScore)}</strong>
                          <span>/100</span>
                        </div>
                      </div>

                      <div className="review-quality-details">
                        <div className="review-quality-details-heading">
                          <span>REVIEW QUALITY</span>
                          <strong>
                            {clampScore(review.qualityScore)}/100
                          </strong>
                        </div>

                        <div
                          className="review-quality-track"
                          role="progressbar"
                          aria-label="Review quality"
                          aria-valuenow={clampScore(review.qualityScore)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <div
                            className={`review-quality-fill ${review.quality}`}
                            style={{
                              width: `${clampScore(review.qualityScore)}%`,
                            }}
                          />
                        </div>
                      </div>

                      <span
                        className={`review-sentiment ${review.sentiment}`}
                        aria-label={`Review sentiment: ${review.sentiment}`}
                      >
                        {review.sentiment === "positive"
                          ? "POSITIVE"
                          : "NEGATIVE"}
                      </span>
                    </div>
                  </div>

                  {/* REVIEW TEXT */}
                  <p className="review-text">{review.text}</p>

                  {/* SIGNALS */}
                  <div className="review-signal-section">
                    <div className="review-section-heading">
                      <span>SIGNALS DETECTED</span>
                      <small>
                        {review.signals.length}{" "}
                        {review.signals.length === 1 ? "SIGNAL" : "SIGNALS"}
                      </small>
                    </div>

                    <div className="review-tags">
                      {review.signals.length > 0 ? (
                        review.signals.map((signal) => (
                          <button
                            key={signal}
                            type="button"
                            className={`review-signal-tag ${
                              activeSignal === signal ? "active" : ""
                            }`}
                            aria-pressed={activeSignal === signal}
                            onClick={() => handleSignalClick(signal)}
                            title={`Show reviews mentioning ${signal}`}
                          >
                            <span className="review-signal-tag-dot" />
                            {signal}
                            <span className="review-signal-tag-arrow">
                              ↗
                            </span>
                          </button>
                        ))
                      ) : (
                        <span className="review-no-signals">
                          No specific player issues detected
                        </span>
                      )}
                    </div>
                  </div>

                  {/* WHY THIS REVIEW MATTERS */}
                  <div className="review-why">
                    <div className="review-section-heading">
                      <span>WHY THIS REVIEW MATTERS</span>
                    </div>

                    <div className="review-reasons">
                      {review.detailed && (
                        <span>✓ Detailed feedback</span>
                      )}

                      {review.playtime >= 20 && (
                        <span>✓ Experienced player</span>
                      )}

                      {review.helpfulVotes >= 10 && (
                        <span>✓ Community agreement</span>
                      )}

                      {review.signals.length >= 3 && (
                        <span>✓ Specific issues identified</span>
                      )}

                      {!review.detailed &&
                        review.playtime < 20 &&
                        review.helpfulVotes < 10 &&
                        review.signals.length < 3 && (
                          <span>• Limited actionable detail</span>
                        )}
                    </div>
                  </div>

                  {/* DEVELOPER SIGNAL */}
                  <div
                    className={`developer-signal ${review.priority
                      .toLowerCase()
                      .replace(/\s+/g, "-")}`}
                  >
                    <div className="developer-signal-header">
                      <div className="developer-signal-heading">
                        <span
                          className="developer-signal-icon"
                          aria-hidden="true"
                        >
                          {review.priority.toLowerCase().includes("high")
                            ? "!"
                            : review.priority.toLowerCase().includes("medium")
                              ? "◈"
                              : "✓"}
                        </span>

                        <div>
                          <span className="developer-signal-label">
                            DEVELOPER SIGNAL
                          </span>
                          <small>PLAYER FEEDBACK PRIORITY</small>
                        </div>
                      </div>

                      <span
                        className={`developer-priority-badge ${review.priority
                          .toLowerCase()
                          .replace(/\s+/g, "-")}`}
                      >
                        {review.priority}
                      </span>
                    </div>

                    <p>{review.developerSignal}</p>

                    <div className="developer-signal-footer">
                      <span>
                        Based on this review's detected feedback
                      </span>
                      <span className="developer-signal-quality">
                        {review.qualityScore}/100 QUALITY
                      </span>
                    </div>
                  </div>

                  {/* METADATA */}
                  <div className="review-metadata">
                    <div className="review-metadata-item playtime-metadata">
                      <span
                        className="review-metadata-icon"
                        aria-hidden="true"
                      >
                        ◷
                      </span>

                      <div>
                        <span className="review-metadata-label">
                          TOTAL PLAYTIME
                        </span>
                        <strong>
                          {formatNumber(review.playtime)} HRS
                        </strong>
                      </div>
                    </div>

                    <div className="review-metadata-item">
                      <span
                        className="review-metadata-icon"
                        aria-hidden="true"
                      >
                        ◴
                      </span>

                      <div>
                        <span className="review-metadata-label">
                          AT REVIEW
                        </span>
                        <strong>
                          {formatNumber(review.playtimeAtReview)} HRS
                        </strong>
                      </div>
                    </div>

                    <div className="review-metadata-item helpful-metadata">
                      <span
                        className="review-metadata-icon"
                        aria-hidden="true"
                      >
                        ↑
                      </span>

                      <div>
                        <span className="review-metadata-label">
                          HELPFUL VOTES
                        </span>
                        <strong>
                          {formatNumber(review.helpfulVotes)}
                        </strong>
                      </div>
                    </div>

                    <div className="review-metadata-item">
                      <span
                        className="review-metadata-icon"
                        aria-hidden="true"
                      >
                        ◆
                      </span>

                      <div>
                        <span className="review-metadata-label">
                          SIGNAL STRENGTH
                        </span>
                        <strong
                          className={`metadata-quality ${review.quality}`}
                        >
                          {review.quality.toUpperCase()}
                        </strong>
                      </div>
                    </div>

                    {/* POSTED DATE */}
                    <div className="review-metadata-item review-posted-date">
                      <span
                        className="review-metadata-icon"
                        aria-hidden="true"
                      >
                        ◷
                      </span>

                      <div>
                        <span className="review-metadata-label">
                          POSTED
                        </span>
                        <strong>
                          {formatPostedDate(review.createdAt)}
                        </strong>

                        {review.createdAt &&
                          formatRelativeTime(review.createdAt) && (
                            <small className="review-posted-relative">
                              {formatRelativeTime(review.createdAt)}
                            </small>
                          )}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* DATA SOURCE */}
          <footer className="reviews-data-footer reviews-animate reviews-animate-7">
            <div>
              <span className="reviews-footer-indicator" />
              <strong>STEAM PLAYER REVIEWS</strong>
            </div>

            <span>
              Meaningful feedback prioritized by quality, sentiment,
              specificity, and engagement.
            </span>
          </footer>
        </div>
      )}
    </main>
  );
}

export default Reviews;
