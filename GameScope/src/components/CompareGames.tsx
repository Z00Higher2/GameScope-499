
import { useEffect, useRef, useState } from "react";
import Navbar from "./Navbar";
import "./CompareGames.css";

import type { Page, Mode } from "../type";

interface CompareGamesProps {
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  currentPage: Page;
  setCurrentPage: React.Dispatch<React.SetStateAction<Page>>;
  onLogoClick: () => void;
  mode: Mode;
  setMode: React.Dispatch<React.SetStateAction<Mode>>;
}

interface Game {
  appId: string;
  name: string;
  image?: string;
}

interface Review {
  review?: string;
  review_text?: string;
  text?: string;
  recommendation?: boolean | string | number;
  recommended?: boolean | string | number;
  voted_up?: boolean;
  helpful_votes?: number;
  helpful?: number;
  playtime_hours?: number;
  quality_score?: number;
  quality?: number;
  [key: string]: unknown;
}

interface GameData {
  appId: string;
  name: string;
  image?: string;
  description?: string;
  totalReviews?: number;
  positiveReviews?: number;
  negativeReviews?: number;
  positiveRate?: number;
  averageQuality?: number;
  helpfulVotes?: number;
  reviews: Review[];
  issues: string[];
  strengths: string[];
}

const API_BASE = (
  import.meta.env.VITE_API_URL ?? "/api"
).replace(/\/$/, "");

function getArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;

    for (const key of [
      "results",
      "games",
      "reviews",
      "items",
      "data",
      "issues",
    ]) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
  }

  return [];
}

function getObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function asNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return undefined;
}

function getRecommended(review: Review): boolean | undefined {
  const value =
    review.recommended ??
    review.recommendation ??
    review.voted_up;

  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  if (typeof value === "string") {
    const normalized = value.toLowerCase();

    if (["true", "1", "positive", "recommended", "yes"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "negative", "not recommended", "no"].includes(normalized)) {
      return false;
    }
  }

  return undefined;
}

function getReviewText(review: Review): string {
  const value =
    review.review_text ??
    review.review ??
    review.text;

  return typeof value === "string" ? value.trim() : "";
}

function getSteamImage(appId: string, preferred?: string): string[] {
  return [
    preferred,
    `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
    `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/capsule_616x353.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/capsule_616x353.jpg`,
  ].filter((url): url is string => Boolean(url));
}

function GameArtwork({
  appId,
  image,
  name,
}: {
  appId: string;
  image?: string;
  name: string;
}) {
  const sources = getSteamImage(appId, image);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [appId, image]);

  return (
    <div className="compare-artwork">
      {sources[sourceIndex] ? (
        <img
          src={sources[sourceIndex]}
          alt={`${name} cover`}
          onError={() => setSourceIndex((current) => current + 1)}
        />
      ) : (
        <div className="compare-artwork-fallback">
          <span>GAME</span>
          <strong>{name.slice(0, 1).toUpperCase()}</strong>
          <small>Artwork unavailable</small>
        </div>
      )}
    </div>
  );
}

function normalizeGame(value: unknown): Game | null {
  const item = getObject(value);

  const appId = String(
    item.appId ?? item.app_id ?? item.id ?? ""
  );

  const name = String(
    item.name ?? item.title ?? ""
  ).trim();

  if (!appId || !name) return null;

  const image =
    typeof item.image === "string"
      ? item.image
      : typeof item.headerImage === "string"
        ? item.headerImage
        : typeof item.header_image === "string"
          ? item.header_image
          : typeof item.tiny_image === "string"
            ? item.tiny_image
            : undefined;

  return { appId, name, image };
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return response.json();
}

function getNamedIssues(value: unknown): string[] {
  const items = getArray(value);

  return items
    .map((item) => {
      if (typeof item === "string") return item;

      const obj = getObject(item);
      const name =
        obj.name ??
        obj.issue ??
        obj.topic ??
        obj.label ??
        obj.title;

      return typeof name === "string" ? name : "";
    })
    .filter(Boolean)
    .slice(0, 5);
}

async function loadGameData(game: Game): Promise<GameData> {
  const [detailsResult, analysisResult, issuesResult, reviewsResult] =
    await Promise.allSettled([
      fetchJson(`${API_BASE}/games/${encodeURIComponent(game.appId)}/details`),
      fetchJson(`${API_BASE}/games/${encodeURIComponent(game.appId)}/analysis`),
      fetchJson(`${API_BASE}/games/${encodeURIComponent(game.appId)}/issues`),
      fetchJson(
        `${API_BASE}/games/${encodeURIComponent(game.appId)}/reviews?limit=500`
      ),
    ]);

  const details =
    detailsResult.status === "fulfilled"
      ? getObject(detailsResult.value)
      : {};

  const analysis =
    analysisResult.status === "fulfilled"
      ? getObject(analysisResult.value)
      : {};

  const issuesResponse =
    issuesResult.status === "fulfilled"
      ? issuesResult.value
      : [];

  const reviewsResponse =
    reviewsResult.status === "fulfilled"
      ? reviewsResult.value
      : [];

  const reviewItems = getArray(reviewsResponse).map(
    (item) => getObject(item) as Review
  );

  const positiveFromReviews = reviewItems.filter(
    (review) => getRecommended(review) === true
  ).length;

  const negativeFromReviews = reviewItems.filter(
    (review) => getRecommended(review) === false
  ).length;

  const knownSentimentCount =
    positiveFromReviews + negativeFromReviews;

  const analysisReviews = asNumber(
    analysis.totalReviews,
    analysis.total_reviews,
    analysis.reviewCount,
    analysis.review_count,
    analysis.total
  );

  const positiveReviews = asNumber(
    analysis.positiveReviews,
    analysis.positive_reviews,
    analysis.positiveCount,
    analysis.positive_count
  );

  const negativeReviews = asNumber(
    analysis.negativeReviews,
    analysis.negative_reviews,
    analysis.negativeCount,
    analysis.negative_count
  );

  const totalReviews =
    analysisReviews ??
    (knownSentimentCount > 0
      ? knownSentimentCount
      : reviewItems.length);

  const positiveCount =
    positiveReviews ?? positiveFromReviews;

  const negativeCount =
    negativeReviews ?? negativeFromReviews;

  const rateValue = asNumber(
    analysis.positiveRate,
    analysis.positive_rate,
    analysis.recommendationRate,
    analysis.recommendation_rate,
    analysis.positivePercentage,
    analysis.positive_percentage
  );

  const positiveRate =
    rateValue !== undefined
      ? rateValue <= 1
        ? rateValue * 100
        : rateValue
      : knownSentimentCount > 0
        ? (positiveFromReviews / knownSentimentCount) * 100
        : undefined;

  const qualityScores = reviewItems
    .map((review) =>
      asNumber(review.quality_score, review.quality)
    )
    .filter((score): score is number => score !== undefined);

  const qualityFromReviews =
    qualityScores.length > 0
      ? qualityScores.reduce((sum, score) => sum + score, 0) /
        qualityScores.length
      : undefined;

  const qualityValue = asNumber(
    analysis.averageQuality,
    analysis.average_quality,
    analysis.reviewQuality,
    analysis.review_quality,
    analysis.qualityScore,
    analysis.quality_score
  );

  const averageQuality =
    qualityValue !== undefined
      ? qualityValue
      : qualityFromReviews;

  const helpfulVotes = reviewItems.reduce(
    (sum, review) =>
      sum +
      (asNumber(review.helpful_votes, review.helpful) ?? 0),
    0
  );

  const issueObject = getObject(issuesResponse);
  const issueList =
    Array.isArray(issuesResponse)
      ? getNamedIssues(issuesResponse)
      : getNamedIssues(
          issueObject.issues ??
          issueObject.topIssues ??
          issueObject.top_issues ??
          issueObject.topics ??
          issueObject.data
        );

  const strengths = getNamedIssues(
    analysis.strengths ?? analysis.topStrengths ?? analysis.top_strengths
  );

  return {
    appId: game.appId,
    name: String(details.name ?? game.name),
    image:
      typeof details.headerImage === "string"
        ? details.headerImage
        : typeof details.header_image === "string"
          ? details.header_image
          : game.image,
    description:
      typeof details.shortDescription === "string"
        ? details.shortDescription
        : typeof details.short_description === "string"
          ? details.short_description
          : undefined,
    totalReviews,
    positiveReviews: positiveCount,
    negativeReviews: negativeCount,
    positiveRate,
    averageQuality,
    helpfulVotes,
    reviews: reviewItems,
    issues: issueList,
    strengths,
  };
}

function formatNumber(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString();
}

function formatPercent(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}

function CompareMetric({
  label,
  left,
  right,
}: {
  label: string;
  left: string;
  right: string;
}) {
  return (
    <div className="compare-metric">
      <div className="compare-metric-value">{left}</div>
      <div className="compare-metric-label">{label}</div>
      <div className="compare-metric-value">{right}</div>
    </div>
  );
}

function CompareGames({
  darkMode,
  setDarkMode,
  currentPage,
  setCurrentPage,
  onLogoClick,
  mode,
  setMode,
}: CompareGamesProps) {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Game[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchTarget, setSearchTarget] = useState<"left" | "right">("left");
  const [leftGame, setLeftGame] = useState<Game | null>(null);
  const [rightGame, setRightGame] = useState<Game | null>(null);
  const [leftData, setLeftData] = useState<GameData | null>(null);
  const [rightData, setRightData] = useState<GameData | null>(null);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [comparisonError, setComparisonError] = useState("");
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (search.trim().length < 2) {
      setSearchResults([]);
      setSearchError("");
      setSearching(false);
      return;
    }

    let cancelled = false;

    const timeout = window.setTimeout(async () => {
      setSearching(true);
      setSearchError("");

      try {
        const result = await fetchJson(
          `${API_BASE}/search?q=${encodeURIComponent(search.trim())}`
        );

        if (!cancelled) {
          const games = getArray(result)
            .map(normalizeGame)
            .filter((game): game is Game => game !== null);

          setSearchResults(games.slice(0, 8));

          if (games.length === 0) {
            setSearchError("No games found. Try another title.");
          }
        }
      } catch {
        if (!cancelled) {
          setSearchResults([]);
          setSearchError(
            "Couldn't search games. Check your API connection and try again."
          );
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [search]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setSearchResults([]);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const selectGame = (game: Game) => {
    if (searchTarget === "left") {
      setLeftGame(game);
      setLeftData(null);
    } else {
      setRightGame(game);
      setRightData(null);
    }

    setSearch("");
    setSearchResults([]);
    setSearchError("");
    setShowResults(false);
    setComparisonError("");
  };

  const handleCompare = async () => {
    if (!leftGame || !rightGame) return;

    if (leftGame.appId === rightGame.appId) {
      setComparisonError("Choose two different games to compare.");
      return;
    }

    setLoadingComparison(true);
    setComparisonError("");
    setShowResults(false);

    try {
      const [first, second] = await Promise.all([
        loadGameData(leftGame),
        loadGameData(rightGame),
      ]);

      setLeftData(first);
      setRightData(second);
      setShowResults(true);
    } catch {
      setComparisonError(
        "We couldn't load the comparison. Please try again."
      );
    } finally {
      setLoadingComparison(false);
    }
  };

  const clearSelection = (side: "left" | "right") => {
    if (side === "left") {
      setLeftGame(null);
      setLeftData(null);
    } else {
      setRightGame(null);
      setRightData(null);
    }

    setShowResults(false);
    setComparisonError("");
  };

  const sharedNavbarProps = {
    darkMode,
    setDarkMode,
    currentPage,
    setCurrentPage,
    onLogoClick,
    mode,
    setMode,
  };

  return (
    <div className={`compare-page ${darkMode ? "compare-dark" : ""}`}>
      <Navbar {...sharedNavbarProps} />

      <main className="compare-main">
        <section className="compare-hero">
          <div className="compare-eyebrow">
            <span className="compare-eyebrow-dot" />
            PLAYER INTELLIGENCE
          </div>

          <h1>
            Two games.
            <br />
            <span>One clear choice.</span>
          </h1>

          <p>
            Compare real player feedback, recommendations, and recurring
            complaints before you decide what to play.
          </p>
        </section>

        <section className="compare-builder">
          <div className="compare-builder-heading">
            <div>
              <span className="compare-section-kicker">BUILD YOUR MATCHUP</span>
              <h2>Choose your games</h2>
            </div>

            <span className="compare-step-label">01 / SELECT</span>
          </div>

          <div className="compare-game-slots">
            {(
              [
                { side: "left" as const, game: leftGame, label: "GAME A" },
                { side: "right" as const, game: rightGame, label: "GAME B" },
              ]
            ).map(({ side, game, label }) => (
              <div className="compare-game-slot" key={side}>
                <div className="compare-slot-label">{label}</div>

                {game ? (
                  <div className="compare-selected-game">
                    <GameArtwork
                      appId={game.appId}
                      image={game.image}
                      name={game.name}
                    />

                    <div className="compare-selected-info">
                      <strong>{game.name}</strong>
                      <span>Steam App ID: {game.appId}</span>
                      <button
                        type="button"
                        className="compare-text-button"
                        onClick={() => {
                          setSearchTarget(side);
                          setSearch("");
                          setSearchError("");
                          setSearchResults([]);
                          searchRef.current?.querySelector("input")?.focus();
                        }}
                      >
                        Change game
                      </button>
                      <button
                        type="button"
                        className="compare-remove-button"
                        onClick={() => clearSelection(side)}
                        aria-label={`Remove ${game.name}`}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="compare-empty-slot"
                    onClick={() => {
                      setSearchTarget(side);
                      setSearch("");
                      setSearchResults([]);
                      setSearchError("");
                      searchRef.current?.querySelector("input")?.focus();
                    }}
                  >
                    <span className="compare-plus">+</span>
                    <strong>Add a game</strong>
                    <span>Search Steam's catalog</span>
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="compare-search-area" ref={searchRef}>
            <label htmlFor="compare-game-search">
              {searchTarget === "left" ? "Find Game A" : "Find Game B"}
            </label>

            <div className="compare-search-box">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.8" cy="10.8" r="6.8" />
                <path d="m16 16 4.5 4.5" />
              </svg>

              <input
                id="compare-game-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onFocus={() => setSearchTarget((target) => target)}
                placeholder="Search by game title..."
                autoComplete="off"
              />

              {searching && (
                <span className="compare-search-spinner" />
              )}
            </div>

            {search.length > 0 && search.trim().length < 2 && (
              <p className="compare-search-hint">
                Enter at least two characters.
              </p>
            )}

            {searchResults.length > 0 && (
              <div className="compare-search-results">
                {searchResults.map((game) => (
                  <button
                    type="button"
                    className="compare-search-result"
                    key={game.appId}
                    onClick={() => selectGame(game)}
                  >
                    <GameArtwork
                      appId={game.appId}
                      image={game.image}
                      name={game.name}
                    />
                    <span className="compare-result-name">
                      <strong>{game.name}</strong>
                      <small>App ID: {game.appId}</small>
                    </span>
                    <span className="compare-result-add">Add</span>
                  </button>
                ))}
              </div>
            )}

            {searchError && (
              <p className="compare-search-hint compare-error">
                {searchError}
              </p>
            )}

            <div className="compare-search-targets">
              <span>Adding to:</span>
              <button
                type="button"
                className={searchTarget === "left" ? "selected" : ""}
                onClick={() => setSearchTarget("left")}
              >
                Game A
              </button>
              <button
                type="button"
                className={searchTarget === "right" ? "selected" : ""}
                onClick={() => setSearchTarget("right")}
              >
                Game B
              </button>
            </div>
          </div>

          {comparisonError && (
            <div className="compare-inline-error" role="alert">
              {comparisonError}
            </div>
          )}

          <button
            type="button"
            className="compare-submit-button"
            disabled={!leftGame || !rightGame || loadingComparison}
            onClick={handleCompare}
          >
            {loadingComparison ? (
              <>
                <span className="compare-button-spinner" />
                Analyzing both games...
              </>
            ) : (
              <>
                Compare games
                <span aria-hidden="true">→</span>
              </>
            )}
          </button>

          <p className="compare-privacy-note">
            Comparisons use available GameScope and Steam review data.
          </p>
        </section>

        {showResults && leftData && rightData && (
          <section className="compare-results">
            <div className="compare-results-heading">
              <div>
                <span className="compare-section-kicker">
                  YOUR MATCHUP
                </span>
                <h2>The side-by-side</h2>
              </div>
              <span className="compare-step-label">02 / RESULTS</span>
            </div>

            <div className="compare-result-cards">
              {[leftData, rightData].map((game, index) => (
                <article className="compare-result-card" key={game.appId}>
                  <GameArtwork
                    appId={game.appId}
                    image={game.image}
                    name={game.name}
                  />

                  <div className="compare-result-card-content">
                    <span className="compare-card-letter">
                      GAME {index === 0 ? "A" : "B"}
                    </span>
                    <h3>{game.name}</h3>
                    {game.description && (
                      <p className="compare-description">
                        {game.description}
                      </p>
                    )}

                    <div className="compare-primary-stat">
                      <span>Positive recommendation rate</span>
                      <strong>{formatPercent(game.positiveRate)}</strong>
                      {game.positiveRate !== undefined && (
                        <div className="compare-progress">
                          <span
                            style={{
                              width: `${Math.max(
                                0,
                                Math.min(100, game.positiveRate)
                              )}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="compare-mini-stats">
                      <div>
                        <span>Total reviews</span>
                        <strong>{formatNumber(game.totalReviews)}</strong>
                      </div>
                      <div>
                        <span>Positive</span>
                        <strong className="compare-positive">
                          {formatNumber(game.positiveReviews)}
                        </strong>
                      </div>
                      <div>
                        <span>Negative</span>
                        <strong className="compare-negative">
                          {formatNumber(game.negativeReviews)}
                        </strong>
                      </div>
                    </div>

                    <div className="compare-detail-stat">
                      <span>Average review quality</span>
                      <strong>
                        {game.averageQuality !== undefined
                          ? game.averageQuality.toFixed(1)
                          : "Not available"}
                      </strong>
                    </div>

                    <div className="compare-detail-stat">
                      <span>Helpful votes in loaded reviews</span>
                      <strong>{formatNumber(game.helpfulVotes)}</strong>
                    </div>

                    <div className="compare-detail-list">
                      <h4>Common complaints</h4>
                      {game.issues.length > 0 ? (
                        <ul>
                          {game.issues.slice(0, 5).map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>
                          No issue summary was returned by the API.
                        </p>
                      )}
                    </div>

                    <div className="compare-detail-list">
                      <h4>Reported strengths</h4>
                      {game.strengths.length > 0 ? (
                        <ul>
                          {game.strengths.slice(0, 5).map((strength) => (
                            <li key={strength}>{strength}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>
                          No separate strengths summary was returned.
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="compare-metrics-panel">
              <h3>Quick comparison</h3>
              <CompareMetric
                label="Positive recommendation rate"
                left={formatPercent(leftData.positiveRate)}
                right={formatPercent(rightData.positiveRate)}
              />
              <CompareMetric
                label="Total reviews"
                left={formatNumber(leftData.totalReviews)}
                right={formatNumber(rightData.totalReviews)}
              />
              <CompareMetric
                label="Positive reviews"
                left={formatNumber(leftData.positiveReviews)}
                right={formatNumber(rightData.positiveReviews)}
              />
              <CompareMetric
                label="Negative reviews"
                left={formatNumber(leftData.negativeReviews)}
                right={formatNumber(rightData.negativeReviews)}
              />
              <CompareMetric
                label="Helpful votes in loaded reviews"
                left={formatNumber(leftData.helpfulVotes)}
                right={formatNumber(rightData.helpfulVotes)}
              />
            </div>

            <p className="compare-disclaimer">
              A dash means the API did not provide enough data to calculate
              that metric. Review totals may reflect the records available
              to GameScope, not every review published on Steam. Review
              quality is shown only when a quality score is returned.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

export default CompareGames;
