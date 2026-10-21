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
  setCurrentPage: React.Dispatch<
    React.SetStateAction<Page>
  >;
  onLogoClick: () => void;
  analyzed: boolean;
  analyzedAppId: string;
  analysis: GameAnalysis | null;
  mode: Mode;
}

/*
 * Reviews come from the GameScope API, ranked by the
 * quality score in GameReview/analysis.py.
 */
type Review = ReviewCard;

/*
 * Icons for the top player signal cards.
 */
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
  const [sentimentFilter, setSentimentFilter] =
    useState("all");

  const [qualityFilter, setQualityFilter] =
    useState("all");

  const [sortBy, setSortBy] =
    useState("quality");

  const [searchQuery, setSearchQuery] =
    useState("");

  /*
   * Tracks the selected player signal.
   *
   * Clicking a signal filters the review cards.
   * Clicking the same signal again clears the filter.
   */
  const [activeSignal, setActiveSignal] =
    useState<string | null>(null);

  /*
   * Review cards for the analyzed game, loaded from
   * the GameScope API.
   */
  const [reviewCards, setReviewCards] =
    useState<Review[]>([]);

  const [isLoading, setIsLoading] =
    useState(analyzed);

  const [loadError, setLoadError] =
    useState("");

  useEffect(() => {
    if (!analyzed || !analyzedAppId) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();

    setIsLoading(true);
    setLoadError("");

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

    return () => {
      controller.abort();
    };

    // analysis changes after Re-analyze, so reload then too
  }, [analyzed, analyzedAppId, analysis]);

  const gameName =
    analysis?.game.name ||
    (analyzedAppId
      ? `Steam Game ${analyzedAppId}`
      : "No game selected");

  /*
   * Top player signals: the topics mentioned in the
   * most reviews.
   */
  const playerSignals = (
    analysis?.playerSignals ?? []
  ).map((signal) => ({
    ...signal,
    icon: signalIcons[signal.name] ?? "◆",
  }));

  /*
   * Filter and sort reviews.
   */
  const filteredReviews = useMemo(() => {
    let reviews = [...reviewCards];

    /*
     * Sentiment
     */
    if (sentimentFilter !== "all") {
      reviews = reviews.filter(
        (review) =>
          review.sentiment === sentimentFilter
      );
    }

    /*
     * Quality
     */
    if (qualityFilter !== "all") {
      reviews = reviews.filter(
        (review) =>
          review.quality === qualityFilter
      );
    }

    /*
     * Player signal
     */
    if (activeSignal) {
      reviews = reviews.filter((review) =>
        review.signals.some(
          (signal) =>
            signal.toLowerCase() ===
            activeSignal.toLowerCase()
        )
      );
    }

    /*
     * Search
     */
    if (searchQuery.trim()) {
      const query =
        searchQuery.toLowerCase();

      reviews = reviews.filter((review) => {
        const searchableText = [
          review.text,
          ...review.tags,
          ...review.signals,
          review.developerSignal,
        ]
          .join(" ")
          .toLowerCase();

        return searchableText.includes(query);
      });
    }

    /*
     * Sorting
     */
    if (sortBy === "quality") {
      reviews.sort(
        (a, b) =>
          b.qualityScore - a.qualityScore
      );
    }

    if (sortBy === "helpful") {
      reviews.sort(
        (a, b) =>
          b.helpfulVotes - a.helpfulVotes
      );
    }

    if (sortBy === "playtime") {
      reviews.sort(
        (a, b) =>
          b.playtime - a.playtime
      );
    }

    if (sortBy === "newest") {
      reviews.sort(
        (a, b) => b.id - a.id
      );
    }

    if (sortBy === "oldest") {
      reviews.sort(
        (a, b) => a.id - b.id
      );
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

  /*
   * Handle clicking a player signal.
   */
  const handleSignalClick = (
    signal: string
  ) => {
    if (activeSignal === signal) {
      setActiveSignal(null);
      return;
    }

    setActiveSignal(signal);

    /*
     * Clear text search when using a signal filter
     * so the two filters do not conflict.
     */
    setSearchQuery("");
  };

  /*
   * Determines whether the filter controls
   * are currently changing the results.
   */
  const filtersActive =
    sentimentFilter !== "all" ||
    qualityFilter !== "all" ||
    searchQuery.trim() !== "" ||
    activeSignal !== null;

  /*
   * Analysis values from the GameScope API.
   */
  const summary = analysis?.summary;

  const totalReviews =
    summary?.totalReviews ?? reviewCards.length;
  const positiveReviews = summary?.positiveReviews ?? 0;
  const negativeReviews = summary?.negativeReviews ?? 0;
  const positivePercentage =
    summary?.positivePercentage ?? 0;
  const negativePercentage =
    summary?.negativePercentage ?? 0;
  const qualityScore = summary?.reviewQuality ?? 0;
  const highQualityPercentage =
    summary?.highQualityPercentage ?? 0;
  const detailedPercentage =
    summary?.detailedPercentage ?? 0;
  const reliablePercentage =
    summary?.reliablePercentage ?? 0;

  /*
   * Backend-ready loading screen.
   */
  if (isLoading) {
    return (
      <main
        className={`reviews-page ${
          darkMode ? "dark-mode" : ""
        }`}
      >
        <Navbar
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          onLogoClick={onLogoClick}
          mode={mode}
        />

        <section className="reviews-loading">
          <div className="reviews-loading-content">
            <div className="reviews-loading-icon">
              <span />
            </div>

            <span className="reviews-eyebrow">
              PLAYER TELEMETRY
            </span>

            <h1>
              ANALYZING REVIEW DATA...
            </h1>

            <p>
              Processing player feedback and
              identifying meaningful signals.
            </p>

            <div className="reviews-loading-line">
              <span />
            </div>

            <small>
              GAME: {gameName.toUpperCase()}
              {" • "}
              APP ID: {analyzedAppId}
            </small>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      className={`reviews-page ${
        darkMode ? "dark-mode" : ""
      }`}
    >
      <Navbar
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        onLogoClick={onLogoClick}
        mode={mode}
      />

      {!analyzed ? (
        /*
         * Empty state before a game has been analyzed.
         */
        <section className="reviews-empty reviews-animate reviews-animate-1">
          <div className="reviews-empty-icon">
            ◉
          </div>

          <span className="reviews-eyebrow">
            PLAYER TELEMETRY
          </span>

          <h1>No Game Analyzed</h1>

          <p>
            Analyze a Steam game from the Dashboard
            to view individual player feedback,
            review quality, and developer signals.
          </p>

          <button
            onClick={() =>
              setCurrentPage("dashboard")
            }
          >
            Go to Dashboard
          </button>
        </section>
      ) : loadError ? (
        /*
         * The API couldn't return the reviews.
         */
        <section className="reviews-empty reviews-animate reviews-animate-1">
          <div className="reviews-empty-icon">
            !
          </div>

          <span className="reviews-eyebrow">
            PLAYER TELEMETRY
          </span>

          <h1>Couldn't Load Reviews</h1>

          <p>{loadError}</p>

          <button
            onClick={() =>
              setCurrentPage("dashboard")
            }
          >
            Go to Dashboard
          </button>
        </section>
      ) : (
        <div className="reviews-container">

          {/* =================================================
              HEADER
             ================================================= */}

          <section className="reviews-header reviews-animate reviews-animate-1">
            <div>
              <p className="reviews-eyebrow">
                PLAYER FEEDBACK / TELEMETRY
              </p>

              <h1>Reviews</h1>

              <p className="reviews-subtitle">
                Explore the player feedback behind the
                analysis. GameScope ranks reviews by
                quality, detail, engagement, and
                actionable information.
              </p>
            </div>

            <div className="reviews-current-game">
              <div className="reviews-live-status">
                <span className="reviews-live-dot" />

                <span>
                  LIVE ANALYSIS
                </span>
              </div>

              <strong>
                {gameName}
              </strong>

              <small>
                STEAM APP ID: {analyzedAppId}
              </small>
            </div>
          </section>

          {/* =================================================
              REVIEW INTELLIGENCE
             ================================================= */}

          <section className="reviews-intelligence reviews-animate reviews-animate-2">

            <div className="reviews-intelligence-header">
              <div>
                <span className="section-label">
                  REVIEW INTELLIGENCE
                </span>

                <h2>
                  Feedback Overview
                </h2>
              </div>

              <span className="reviews-intelligence-status">
                ANALYSIS COMPLETE
              </span>
            </div>

            <div className="reviews-intelligence-grid">

              <div className="intelligence-stat">
                <span>
                  TOTAL REVIEWS
                </span>

                <strong>
                  {totalReviews}
                </strong>

                <small>
                  REVIEWS ANALYZED
                </small>
              </div>

              <div className="intelligence-stat positive-stat">
                <span>
                  POSITIVE
                </span>

                <strong>
                  {positiveReviews}
                </strong>

                <small>
                  {positivePercentage}% OF REVIEWS
                </small>
              </div>

              <div className="intelligence-stat negative-stat">
                <span>
                  NEGATIVE
                </span>

                <strong>
                  {negativeReviews}
                </strong>

                <small>
                  {negativePercentage}% OF REVIEWS
                </small>
              </div>

              <div className="intelligence-stat quality-stat">
                <span>
                  QUALITY SCORE
                </span>

                <strong>
                  {qualityScore}
                </strong>

                <small>
                  OVERALL SIGNAL
                </small>

                <div className="quality-progress">
                  <div
                    style={{
                      width:
                        `${qualityScore}%`,
                    }}
                  />
                </div>
              </div>

            </div>
          </section>

          {/* =================================================
              SUMMARY
             ================================================= */}

          <section className="reviews-summary reviews-animate reviews-animate-3">

            <div>
              <span>
                PLAYER SIGNAL
              </span>

              <strong>
                {positivePercentage}%
              </strong>

              <small>
                Positive sentiment
              </small>
            </div>

            <div>
              <span>
                HIGH QUALITY
              </span>

              <strong>
                {highQualityPercentage}%
              </strong>

              <small>
                Actionable reviews
              </small>
            </div>

            <div>
              <span>
                DETAILED FEEDBACK
              </span>

              <strong>
                {detailedPercentage}%
              </strong>

              <small>
                Specific issue context
              </small>
            </div>

            <div>
              <span>
                COMMUNITY SIGNAL
              </span>

              <strong>
                {reliablePercentage}%
              </strong>

              <small>
                Reliable feedback
              </small>
            </div>

          </section>

          {/* =================================================
              TOP PLAYER SIGNALS
             ================================================= */}

          <section className="reviews-player-signals reviews-animate reviews-animate-4">

            <div className="reviews-player-signals-header">

              <div>
                <span className="section-label">
                  TOP PLAYER SIGNALS
                </span>

                <h2>
                  What players are talking about
                </h2>
              </div>

              {activeSignal && (
                <button
                  className="clear-signal-button"
                  onClick={() =>
                    setActiveSignal(null)
                  }
                >
                  CLEAR SIGNAL
                </button>
              )}

            </div>

            <div className="player-signals-grid">

              {playerSignals.map(
                (signal) => (
                  <button
                    key={signal.name}
                    className={`player-signal ${
                      activeSignal ===
                      signal.name
                        ? "active"
                        : ""
                    }`}
                    onClick={() =>
                      handleSignalClick(
                        signal.name
                      )
                    }
                  >

                    <div className="player-signal-icon">
                      {signal.icon}
                    </div>

                    <div className="player-signal-info">

                      <span>
                        {signal.name}
                      </span>

                      <strong>
                        {signal.count}
                      </strong>

                      <small>
                        MENTIONS
                      </small>

                    </div>

                    <div className="player-signal-arrow">
                      →
                    </div>

                  </button>
                )
              )}

            </div>

            {activeSignal && (
              <div className="active-signal-message">

                <span className="active-signal-dot" />

                Showing reviews mentioning{" "}

                <strong>
                  {activeSignal}
                </strong>

                <span>
                  {filteredReviews.length} matching
                  reviews
                </span>

              </div>
            )}

          </section>

          {/* =================================================
              FILTERS
             ================================================= */}

          <section className="reviews-filters reviews-animate reviews-animate-5">

            <div className="reviews-filter-status">
              <span
                className={
                  filtersActive
                    ? "filter-status-dot active"
                    : "filter-status-dot"
                }
              />

              <span>
                {filtersActive
                  ? "FILTER ACTIVE"
                  : "ALL REVIEWS"}
              </span>
            </div>

            <div className="review-search">

              <label>
                SEARCH FEEDBACK
              </label>

              <input
                type="text"
                placeholder="Search reviews, issues, or signals..."
                value={searchQuery}
                onChange={(event) => {

                  setSearchQuery(
                    event.target.value
                  );

                  /*
                   * Clear the active signal when
                   * manually searching.
                   */
                  if (event.target.value) {
                    setActiveSignal(null);
                  }

                }}
              />

            </div>

            <div className="review-filter">

              <label>
                SENTIMENT
              </label>

              <select
                value={sentimentFilter}
                onChange={(event) =>
                  setSentimentFilter(
                    event.target.value
                  )
                }
              >

                <option value="all">
                  All Reviews
                </option>

                <option value="positive">
                  Positive
                </option>

                <option value="negative">
                  Negative
                </option>

              </select>

            </div>

            <div className="review-filter">

              <label>
                QUALITY
              </label>

              <select
                value={qualityFilter}
                onChange={(event) =>
                  setQualityFilter(
                    event.target.value
                  )
                }
              >

                <option value="all">
                  All Quality
                </option>

                <option value="high">
                  High Quality
                </option>

                <option value="moderate">
                  Moderate
                </option>

                <option value="low">
                  Low Quality
                </option>

              </select>

            </div>

            <div className="review-filter">

              <label>
                SORT BY
              </label>

              <select
                value={sortBy}
                onChange={(event) =>
                  setSortBy(
                    event.target.value
                  )
                }
              >

                <option value="quality">
                  Highest Quality
                </option>

                <option value="helpful">
                  Most Helpful
                </option>

                <option value="playtime">
                  Highest Playtime
                </option>

                <option value="newest">
                  Newest
                </option>

                <option value="oldest">
                  Oldest
                </option>

              </select>

            </div>

          </section>

          {/* =================================================
              RESULTS HEADER
             ================================================= */}

          <div className="reviews-results-header reviews-animate reviews-animate-6">

            <div>

              <span className="section-label">
                PLAYER SIGNALS
              </span>

              <h2>
                {filteredReviews.length} Reviews
              </h2>

            </div>

            <span>
              {activeSignal
                ? `Filtered by ${activeSignal}`
                : "Ranked by review intelligence"}
            </span>

          </div>

          {/* =================================================
              REVIEW CARDS
             ================================================= */}

          {filteredReviews.length === 0 ? (

            <div className="reviews-no-results reviews-animate reviews-animate-6">

              <div className="no-results-indicator">
                <span />
              </div>

              <span className="no-results-label">
                SIGNAL QUERY RETURNED 0 MATCHES
              </span>

              <h2>
                No matching reviews
              </h2>

              <p>
                The current telemetry filters did not
                return any player feedback.
              </p>

              <div className="no-results-line" />

              {activeSignal && (
                <button
                  onClick={() =>
                    setActiveSignal(null)
                  }
                >
                  CLEAR SIGNAL FILTER
                </button>
              )}

            </div>

          ) : (

            <div className="reviews-list">

              {filteredReviews.map(
                (review, index) => (

                  <article
                    className={`review-card reviews-animate reviews-review-${Math.min(
                      index + 5,
                      10
                    )} ${review.priority
                      .toLowerCase()
                      .replace(
                        " ",
                        "-"
                      )}`}
                    key={review.id}
                  >

                    {/* =================================================
                        CARD TOP
                       ================================================= */}

                    <div className="review-card-top">

                      <div className="review-card-identity">

                        <span className="review-id">
                          REVIEW #
                          {String(
                            review.id
                          ).padStart(4, "0")}
                        </span>

                        <div className="review-quality">

                          <span
                            className={`quality-dot ${review.quality}`}
                          />

                          <span>
                            {review.quality.toUpperCase()}{" "}
                            QUALITY
                          </span>

                        </div>

                      </div>

                      <div className="review-card-status">

                        <div
                          className={`quality-ring ${review.quality}`}
                          style={
                            {
                              "--quality-progress":
                                `${review.qualityScore * 3.6}deg`,
                            } as React.CSSProperties
                          }
                        >

                          <div className="quality-ring-inner">

                            <strong>
                              {review.qualityScore}
                            </strong>

                            <span>
                              /100
                            </span>

                          </div>

                        </div>

                        <span
                          className={`review-sentiment ${review.sentiment}`}
                        >
                          {review.sentiment ===
                          "positive"
                            ? "POSITIVE"
                            : "NEGATIVE"}
                        </span>

                      </div>

                    </div>

                    {/* =================================================
                        REVIEW TEXT
                       ================================================= */}

                    <p className="review-text">
                      {review.text}
                    </p>

                    {/* =================================================
                        SIGNALS
                       ================================================= */}

                    <div className="review-signal-section">

                      <div className="review-section-heading">

                        <span>
                          SIGNALS DETECTED
                        </span>

                        <small>
                          {review.signals.length}{" "}
                          SIGNALS
                        </small>

                      </div>

                      <div className="review-tags">

                        {review.signals.map(
                          (signal) => (

                            <button
                              key={signal}
                              type="button"
                              className={
                                activeSignal ===
                                signal
                                  ? "active"
                                  : ""
                              }
                              onClick={() =>
                                handleSignalClick(
                                  signal
                                )
                              }
                            >
                              {signal}
                            </button>

                          )
                        )}

                      </div>

                    </div>

                    {/* =================================================
                        WHY THIS REVIEW MATTERS
                       ================================================= */}

                    <div className="review-why">

                      <div className="review-section-heading">

                        <span>
                          WHY THIS REVIEW MATTERS
                        </span>

                      </div>

                      <div className="review-reasons">

                        {review.detailed && (
                          <span>
                            ✓ Detailed feedback
                          </span>
                        )}

                        {review.playtime >= 20 && (
                          <span>
                            ✓ Experienced player
                          </span>
                        )}

                        {review.helpfulVotes >= 10 && (
                          <span>
                            ✓ Community agreement
                          </span>
                        )}

                        {review.signals.length >= 3 && (
                          <span>
                            ✓ Specific issues identified
                          </span>
                        )}

                        {!review.detailed &&
                          review.playtime < 20 &&
                          review.helpfulVotes < 10 && (
                            <span>
                              • Limited actionable detail
                            </span>
                          )}

                      </div>

                    </div>

                    {/* =================================================
                        DEVELOPER SIGNAL
                       ================================================= */}

                    <div
                      className={`developer-signal ${review.priority
                        .toLowerCase()
                        .replace(
                          " ",
                          "-"
                        )}`}
                    >

                      <div className="developer-signal-header">

                        <span>
                          DEVELOPER SIGNAL
                        </span>

                        <strong>
                          {review.priority}
                        </strong>

                      </div>

                      <p>
                        {review.developerSignal}
                      </p>

                    </div>

                    {/* =================================================
                        METADATA
                       ================================================= */}

                    <div className="review-metadata">

                      <div>

                        <span>
                          PLAYTIME
                        </span>

                        <strong>
                          {review.playtime} HRS
                        </strong>

                      </div>

                      <div>

                        <span>
                          AT REVIEW
                        </span>

                        <strong>
                          {review.playtimeAtReview} HRS
                        </strong>

                      </div>

                      <div>

                        <span>
                          HELPFUL
                        </span>

                        <strong>
                          {review.helpfulVotes}
                        </strong>

                      </div>

                      <div>

                        <span>
                          SIGNAL STRENGTH
                        </span>

                        <strong>
                          {review.quality.toUpperCase()}
                        </strong>

                      </div>

                    </div>

                  </article>

                )
              )}

            </div>

          )}

          {/* =================================================
              DATA SOURCE
             ================================================= */}

          <footer className="reviews-data-footer reviews-animate reviews-animate-7">

            <div>

              <span className="reviews-footer-indicator" />

              <strong>
                STEAM PLAYER REVIEWS
              </strong>

            </div>

            <span>
              Meaningful feedback prioritized by
              quality, sentiment, specificity, and
              engagement.
            </span>

          </footer>

        </div>
      )}
    </main>
  );
}

export default Reviews;