
import { useEffect, useState } from "react";
import {
  searchGames,
  getGameDetails,
  analyzeGame,
} from "../api";
import type { GameDetails, GameAnalysis } from "../api";
import Navbar from "./Navbar";
import type { Page, Mode } from "../type";
import "./PlayerHome.css";

interface PlayerHomeProps {
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  currentPage: Page;
  setCurrentPage: React.Dispatch<React.SetStateAction<Page>>;
  onLogoClick: () => void;
  mode: Mode;
  onAnalyzeGame?: (appId: string) => void;
}

interface SearchGame {
  name: string;
  appId: string;
  image?: string | null;
}

const sampleGame = {
  name: "Path of Exile 2",
  appId: "2694490",
  developer: "Grinding Gear Games",
  releaseDate: "Dec 6, 2024",
  price: "Free to Play",
  positive: 72,
  negative: 28,
  totalReviews: 1284,
  issues: ["Performance", "Bugs", "Inventory"],
};

// ==================================================
// PRICE AND DATE FORMATTING
// ==================================================

function formatPrice(details: GameDetails): string {
  if (details.price === 0) return "Free to Play";
  if (details.price === null) return "Not available";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(details.price);
}

function formatReleaseDate(value: string | null): string {
  if (!value) return "Not listed";

  const date = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

// ==================================================
// GAME COVER
// ==================================================

function GameCover({
  appId,
  name,
  headerImage,
}: {
  appId: string;
  name: string;
  headerImage?: string | null;
}) {
  const sources = [
    headerImage,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
    `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
  ].filter((source): source is string => Boolean(source));

  const [sourceIndex, setSourceIndex] = useState(0);

  if (sourceIndex >= sources.length) {
    return (
      <div className="player-game-icon">
        <span>{(name || "G").charAt(0).toUpperCase()}</span>
      </div>
    );
  }

  return (
    <img
      className="player-game-cover"
      src={sources[sourceIndex]}
      alt={`${name} cover art`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setSourceIndex((index) => index + 1)}
    />
  );
}

// ==================================================
// SEARCH THUMBNAIL
// ==================================================

function SearchThumb({
  appId,
  name,
  image,
}: {
  appId: string;
  name: string;
  image?: string | null;
}) {
  const sources = [
    image,
    `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
  ].filter((source): source is string => Boolean(source));

  const [sourceIndex, setSourceIndex] = useState(0);

  if (sourceIndex >= sources.length) {
    return (
      <span className="player-search-thumb player-search-thumb-fallback">
        {(name || "G").charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      className="player-search-thumb"
      src={sources[sourceIndex]}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setSourceIndex((index) => index + 1)}
    />
  );
}

// ==================================================
// SEARCH RESULT WITH PRICE
// ==================================================

function SearchResultItem({
  game,
  onSelect,
}: {
  game: SearchGame;
  onSelect: (game: SearchGame) => void;
}) {
  const [price, setPrice] = useState("Loading price...");
  const [priceUnavailable, setPriceUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    getGameDetails(game.appId, controller.signal)
      .then((details) => {
        if (!controller.signal.aborted) {
          setPrice(formatPrice(details));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPrice("Price unavailable");
          setPriceUnavailable(true);
        }
      });

    return () => controller.abort();
  }, [game.appId]);

  return (
    <button
      type="button"
      className="player-search-result"
      role="option"
      onClick={() => onSelect(game)}
    >
      <span className="player-search-main">
        <SearchThumb
          appId={game.appId}
          name={game.name}
          image={game.image}
        />

        <span className="player-search-name">{game.name}</span>
      </span>

      <span className="player-search-result-details">
        <span className="player-search-appid">
          App ID: {game.appId}
        </span>

        <strong
          className={`player-search-price ${
            priceUnavailable ? "price-unavailable" : ""
          }`}
        >
          {price}
        </strong>
      </span>
    </button>
  );
}

// ==================================================
// GAME META
// ==================================================

function GameMeta({
  developer,
  releaseDate,
  price,
}: {
  developer: string;
  releaseDate: string;
  price: string;
}) {
  return (
    <div className="player-game-meta">
      <div className="player-meta-item">
        <span>Developer</span>
        <strong>{developer}</strong>
      </div>

      <div className="player-meta-item">
        <span>Release date</span>
        <strong>{releaseDate}</strong>
      </div>

      <div className="player-meta-item">
        <span>Price</span>
        <strong>{price}</strong>
      </div>
    </div>
  );
}

// ==================================================
// ANALYSIS RESULTS
// ==================================================

function AnalysisResults({
  analysis,
  onChooseAnother,
  onRefresh,
  refreshing,
}: {
  analysis: GameAnalysis;
  onChooseAnother: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const { summary } = analysis;

  return (
    <section className="player-analysis" aria-live="polite">
      <div className="player-section-heading">
        <div>
          <span className="player-eyebrow">GAME INTELLIGENCE</span>
          <h2>Analysis results</h2>
          <p>
            Player feedback for {analysis.game.name}.
          </p>
        </div>

        <span className="player-demo-tag">ANALYSIS COMPLETE</span>
      </div>

      <div className="player-analysis-stats">
        <article className="player-analysis-stat">
          <span>Total reviews</span>
          <strong>{formatNumber(summary.totalReviews)}</strong>
        </article>

        <article className="player-analysis-stat positive">
          <span>Positive sentiment</span>
          <strong>{summary.positivePercentage.toFixed(1)}%</strong>
          <small>
            {formatNumber(summary.positiveReviews)} reviews
          </small>
        </article>

        <article className="player-analysis-stat negative">
          <span>Negative sentiment</span>
          <strong>{summary.negativePercentage.toFixed(1)}%</strong>
          <small>
            {formatNumber(summary.negativeReviews)} reviews
          </small>
        </article>

        <article className="player-analysis-stat">
          <span>Review quality</span>
          <strong>{summary.reviewQuality.toFixed(0)}/100</strong>
        </article>
      </div>

      <article className="player-analysis-card">
        <span className="player-eyebrow">SENTIMENT BREAKDOWN</span>
        <h3>What are players saying?</h3>

        <div className="player-sentiment-bar" aria-label="Review sentiment">
          <div
            className="player-sentiment-positive"
            style={{
              width: `${Math.max(
                0,
                Math.min(100, summary.positivePercentage)
              )}%`,
            }}
          />
          <div
            className="player-sentiment-negative"
            style={{
              width: `${Math.max(
                0,
                Math.min(100, summary.negativePercentage)
              )}%`,
            }}
          />
        </div>

        <div className="player-sentiment-legend">
          <span>
            <i className="player-legend-dot positive-dot" />
            Positive {summary.positivePercentage.toFixed(1)}%
          </span>
          <span>
            <i className="player-legend-dot negative-dot" />
            Negative {summary.negativePercentage.toFixed(1)}%
          </span>
        </div>

        {analysis.analysisSummary && (
          <p className="player-analysis-summary">
            {analysis.analysisSummary}
          </p>
        )}
      </article>

      <div className="player-analysis-columns">
        <article className="player-analysis-card">
          <span className="player-eyebrow">PLAYER COMPLAINTS</span>
          <h3>Top issues</h3>

          {analysis.topIssues.length > 0 ? (
            <div className="player-analysis-list">
              {analysis.topIssues.slice(0, 6).map((issue, index) => (
                <div className="player-analysis-list-item" key={issue.name}>
                  <span className="player-analysis-rank">
                    {index + 1}
                  </span>

                  <span className="player-analysis-issue-name">
                    {issue.name}
                  </span>

                  <strong>{formatNumber(issue.count)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="player-analysis-empty">
              No common issues were returned for this analysis.
            </p>
          )}
        </article>

        <article className="player-analysis-card">
          <span className="player-eyebrow">KEY TAKEAWAYS</span>
          <h3>Player insights</h3>

          {analysis.keyInsights.length > 0 ? (
            <div className="player-insights-list">
              {analysis.keyInsights.slice(0, 5).map((insight, index) => (
                <div
                  className={`player-insight-item ${insight.tone}`}
                  key={`${insight.label}-${index}`}
                >
                  <strong>{insight.label}</strong>
                  <p>{insight.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="player-analysis-empty">
              No additional insights were returned.
            </p>
          )}
        </article>
      </div>

      <div className="player-analysis-extra">
        <div>
          <span>Average player playtime</span>
          <strong>{summary.averagePlaytime.toFixed(1)} hours</strong>
        </div>

        <div>
          <span>High-quality reviews</span>
          <strong>{summary.highQualityPercentage.toFixed(1)}%</strong>
        </div>

        <div>
          <span>Detailed reviews</span>
          <strong>{summary.detailedPercentage.toFixed(1)}%</strong>
        </div>

        <div>
          <span>Reliable feedback</span>
          <strong>{summary.reliablePercentage.toFixed(1)}%</strong>
        </div>
      </div>

      {analysis.mostHelpfulReviews.length > 0 && (
        <article className="player-analysis-card">
          <span className="player-eyebrow">COMMUNITY FEEDBACK</span>
          <h3>Most helpful reviews</h3>

          <div className="player-helpful-reviews">
            {analysis.mostHelpfulReviews.slice(0, 3).map((review) => (
              <div
                className="player-helpful-review"
                key={review.reviewNumber}
              >
                <div className="player-helpful-review-heading">
                  <span
                    className={
                      review.sentiment === "Positive"
                        ? "positive"
                        : "negative"
                    }
                  >
                    {review.sentiment}
                  </span>

                  <small>
                    {formatNumber(review.helpfulVotes)} helpful votes
                  </small>
                </div>

                <p>{review.text}</p>
              </div>
            ))}
          </div>
        </article>
      )}

      {analysis.analyzedAt && (
        <p className="player-analysis-timestamp">
          Analysis timestamp:{" "}
          {new Date(analysis.analyzedAt).toLocaleString()}
        </p>
      )}

      <div className="player-analysis-actions">
        <button
          type="button"
          className="player-analysis-secondary"
          onClick={onChooseAnother}
        >
          Choose Another Game
        </button>

        <button
          type="button"
          className="player-analysis-primary"
          onClick={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing reviews..." : "Refresh Analysis"}
        </button>
      </div>
    </section>
  );
}

// ==================================================
// PLAYER HOME
// ==================================================

function PlayerHome({
  darkMode,
  setDarkMode,
  currentPage,
  setCurrentPage,
  onLogoClick,
  mode,
}: PlayerHomeProps) {
  const [searchValue, setSearchValue] = useState("");
  const [searchResults, setSearchResults] = useState<SearchGame[]>([]);
  const [selectedGame, setSelectedGame] = useState<SearchGame | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [sampleImage, setSampleImage] = useState<string | null>(null);
  const [details, setDetails] = useState<GameDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");

  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const typedValue = searchValue.trim();
  const detailsAppId =
    selectedGame?.appId ??
    (/^\d+$/.test(typedValue) ? typedValue : "");

  // Search Steam games.
  useEffect(() => {
    const query = searchValue.trim();

    if (query.length < 2 || /^\d+$/.test(query)) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError("");
      return;
    }

    const controller = new AbortController();

    const timeoutId = window.setTimeout(async () => {
      try {
        setSearchLoading(true);
        setSearchError("");

        const games = await searchGames(query, controller.signal);

        if (!controller.signal.aborted) {
          setSearchResults(games);
        }
      } catch {
        if (!controller.signal.aborted) {
          setSearchError("Unable to search games. Please try again.");
          setSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearchLoading(false);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [searchValue]);

  // Load the sample game's cover.
  useEffect(() => {
    const controller = new AbortController();

    getGameDetails(sampleGame.appId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setSampleImage(result.headerImage ?? null);
        }
      })
      .catch(() => {
        // The cover component will try fallback URLs.
      });

    return () => controller.abort();
  }, []);

  // Load details for the selected game or typed App ID.
  useEffect(() => {
    if (!detailsAppId) {
      setDetails(null);
      setDetailsLoading(false);
      setDetailsError("");
      return;
    }

    const controller = new AbortController();

    setDetails(null);
    setDetailsError("");
    setDetailsLoading(true);

    const timeoutId = window.setTimeout(() => {
      getGameDetails(detailsAppId, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) {
            setDetails(result);
          }
        })
        .catch((error: Error) => {
          if (!controller.signal.aborted) {
            setDetailsError(
              error.message || "Couldn't load store details for this game."
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setDetailsLoading(false);
          }
        });
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [detailsAppId]);

  // Analyze directly in Player Home. Do not navigate to Dashboard.
  const runAnalysis = async (
    appId: string,
    refresh = false
  ) => {
    if (!appId || analysisLoading || refreshing) return;

    setAnalysisError("");

    if (refresh) {
      setRefreshing(true);
    } else {
      setAnalysis(null);
      setAnalysisLoading(true);
    }

    try {
      const result = await analyzeGame(appId, refresh);
      setAnalysis(result);
    } catch (error) {
      setAnalysisError(
        error instanceof Error
          ? error.message
          : "Unable to analyze this game. Please try again."
      );
    } finally {
      setAnalysisLoading(false);
      setRefreshing(false);
    }
  };

  const handleSearch = () => {
    const value = searchValue.trim();

    if (!value) {
      setSearchError("Enter a game name or Steam App ID.");
      return;
    }

    if (/^\d+$/.test(value)) {
      void runAnalysis(value);
      return;
    }

    if (selectedGame && selectedGame.name === value) {
      void runAnalysis(selectedGame.appId);
      return;
    }

    setSearchError(
      "Select a game from the search results before analyzing it."
    );
  };

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    setSelectedGame(null);
    setSearchError("");
    setAnalysis(null);
    setAnalysisError("");
  };

  const handleSelectGame = (game: SearchGame) => {
    setSelectedGame(game);
    setSearchValue(game.name);
    setSearchResults([]);
    setSearchError("");
    setAnalysis(null);
    setAnalysisError("");
  };

  const handleChooseAnother = () => {
    setSearchValue("");
    setSelectedGame(null);
    setSearchResults([]);
    setAnalysis(null);
    setAnalysisError("");
    setSearchError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main
      className={`player-home ${darkMode ? "player-home-dark" : ""}`}
    >
      <Navbar
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        onLogoClick={onLogoClick}
        mode={mode}
      />

      <section className="player-hero">
        <span className="player-eyebrow">
          YOUR NEXT GAME STARTS HERE
        </span>

        <h1>
          Find your next game.
          <br />
          <span>Know before you buy.</span>
        </h1>

        <p className="player-hero-description">
          Explore real Steam player feedback, discover common
          complaints, and decide which games are right for you.
        </p>

        <form
          className="player-search"
          onSubmit={(event) => {
            event.preventDefault();
            handleSearch();
          }}
        >
          <input
            value={searchValue}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Search a game or enter its Steam App ID..."
            aria-label="Search a Steam game or enter its App ID"
            autoComplete="off"
          />

          <button
            type="submit"
            disabled={analysisLoading || searchLoading}
          >
            {analysisLoading
              ? "Analyzing..."
              : searchLoading
                ? "Searching..."
                : "Analyze Game"}
          </button>
        </form>

        {searchLoading && (
          <p className="player-search-hint">Searching Steam games...</p>
        )}

        {searchError && (
          <p className="player-search-error" role="alert">
            {searchError}
          </p>
        )}

        {!searchLoading &&
          !searchError &&
          searchValue.trim().length >= 2 &&
          !/^\d+$/.test(searchValue.trim()) &&
          searchResults.length === 0 &&
          !selectedGame && (
            <p className="player-search-hint">
              No matching results yet, or no search has completed.
            </p>
          )}

        {searchResults.length > 0 && (
          <div
            className="player-search-results"
            role="listbox"
            aria-label="Matching Steam games"
          >
            {searchResults.map((game) => (
              <SearchResultItem
                key={game.appId}
                game={game}
                onSelect={handleSelectGame}
              />
            ))}
          </div>
        )}

        <p className="player-search-hint">
          Search by game name or enter an App ID, such as 2694490.
        </p>
      </section>

      {/* SELECTED GAME OVERVIEW */}

      <section className="player-overview">
        <div className="player-section-heading">
          <div>
            <span className="player-eyebrow">PLAYER INSIGHTS</span>
            <h2>Game overview</h2>
          </div>

          <span className="player-demo-tag">
            {detailsAppId ? "STEAM STORE DATA" : "SAMPLE DATA"}
          </span>
        </div>

        {detailsAppId ? (
          <article className="player-game-card">
            <div className="player-game-heading">
              <GameCover
                key={`${detailsAppId}-${details?.headerImage ?? ""}`}
                appId={detailsAppId}
                name={details?.name ?? selectedGame?.name ?? ""}
                headerImage={details?.headerImage}
              />

              <div>
                <h3>
                  {details?.name ??
                    selectedGame?.name ??
                    `App ${detailsAppId}`}
                </h3>

                <p>Steam App ID: {detailsAppId}</p>
              </div>
            </div>

            {detailsLoading && (
              <p className="player-game-description">
                Loading game details...
              </p>
            )}

            {!detailsLoading && detailsError && (
              <p className="player-search-error" role="alert">
                {detailsError}
              </p>
            )}

            {details && (
              <>
                {details.shortDescription && (
                  <p className="player-game-description">
                    {details.shortDescription}
                  </p>
                )}

                <GameMeta
                  developer={details.developer ?? "Not listed"}
                  releaseDate={formatReleaseDate(details.releaseDate)}
                  price={formatPrice(details)}
                />
              </>
            )}

            {!detailsLoading && !detailsError && !details && (
              <p className="player-game-description">
                No store details were found for this App ID.
              </p>
            )}

            <p className="player-data-disclaimer">
              Analyze this game to see its review sentiment and common
              complaints right here on this page.
            </p>
          </article>
        ) : (
          <article className="player-game-card">
            <div className="player-game-heading">
              <GameCover
                key={`${sampleGame.appId}-${sampleImage ?? ""}`}
                appId={sampleGame.appId}
                name={sampleGame.name}
                headerImage={sampleImage}
              />

              <div>
                <h3>{sampleGame.name}</h3>
                <p>Steam App ID: {sampleGame.appId}</p>
              </div>
            </div>

            <p className="player-game-description">
              Get a quick picture of player sentiment and the problems
              most often discussed in reviews.
            </p>

            <GameMeta
              developer={sampleGame.developer}
              releaseDate={sampleGame.releaseDate}
              price={sampleGame.price}
            />

            <div className="player-stats">
              <div className="player-stat positive">
                <span>Positive reviews</span>
                <strong>{sampleGame.positive}%</strong>
              </div>

              <div className="player-stat negative">
                <span>Negative reviews</span>
                <strong>{sampleGame.negative}%</strong>
              </div>

              <div className="player-stat">
                <span>Reviews analyzed</span>
                <strong>{formatNumber(sampleGame.totalReviews)}</strong>
              </div>
            </div>

            <div className="player-issues">
              <h4>Common complaints</h4>

              <div className="player-issue-list">
                {sampleGame.issues.map((issue) => (
                  <span key={issue} className="player-issue">
                    {issue}
                  </span>
                ))}
              </div>
            </div>

            <p className="player-data-disclaimer">
              This overview uses demonstration values. Analyze a game
              above to request its review analysis.
            </p>
          </article>
        )}
      </section>

      {/* ANALYSIS LOADING */}

      {analysisLoading && (
        <section className="player-analysis-loading" aria-live="polite">
          <div className="player-analysis-spinner" />
          <h2>Analyzing player feedback...</h2>
          <p>
            GameScope is requesting review statistics and player insights.
            This may take a little while for a game that has not been
            analyzed before.
          </p>
        </section>
      )}

      {/* ANALYSIS ERROR */}

      {analysisError && !analysisLoading && (
        <section className="player-analysis-error" role="alert">
          <h2>Analysis could not be completed</h2>
          <p>{analysisError}</p>
          <button
            type="button"
            className="player-analysis-primary"
            onClick={() => {
              if (detailsAppId) void runAnalysis(detailsAppId);
            }}
          >
            Try Again
          </button>
        </section>
      )}

      {/* REAL ANALYSIS RESULTS ON THE SAME PAGE */}

      {analysis && !analysisLoading && (
        <AnalysisResults
          analysis={analysis}
          onChooseAnother={handleChooseAnother}
          onRefresh={() => void runAnalysis(analysis.game.appId, true)}
          refreshing={refreshing}
        />
      )}

      <footer className="player-footer">
        <span>GameScope</span>
        <span>Make informed gaming decisions.</span>
      </footer>
    </main>
  );
}

export default PlayerHome;
