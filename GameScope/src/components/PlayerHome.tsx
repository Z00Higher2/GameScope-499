
import { useEffect, useRef, useState } from "react";
import {
  searchGames,
  getGameDetails,
  analyzeGame,
  recordSearch,
} from "../api";
import type { GameDetails, GameAnalysis } from "../api";
import { getSteamImageSources } from "../steamImages";
import Navbar from "./Navbar";
import ReviewHero from "./ReviewHero";
import type { SearchGame } from "./ReviewHero";
import type { Page, Mode } from "../type";
import "./PlayerHome.css";
import RightGameForPlayer from "./RightGameForPlayer";

interface PlayerHomeProps {
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  currentPage: Page;
  setCurrentPage: React.Dispatch<React.SetStateAction<Page>>;
  onLogoClick: () => void;
  mode: Mode;
  onAnalyzeGame?: (appId: string, analysis: GameAnalysis) => void;

  // Authentication
  setMode: React.Dispatch<React.SetStateAction<Mode>>;
  isLoggedIn: boolean;
  accountEmail: string;
  onLogout: () => void;
  steamConnected: boolean;
}

// ==================================================
// SCROLL REVEAL
// ==================================================

function useScrollReveal() {
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
          } else {
            entry.target.classList.remove("is-visible");
          }
        });
      },
      {
        threshold: 0.05,
        rootMargin: "0px 0px -20px 0px",
      }
    );

    const observeRevealElements = (root: Element) => {
      if (root.matches(".scroll-reveal")) {
        revealObserver.observe(root);
      }

      root.querySelectorAll(".scroll-reveal").forEach((element) => {
        revealObserver.observe(element);
      });
    };

    // Observe elements already on the page.
    observeRevealElements(container);

    // Also observe elements added after Analyze Game is clicked.
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) {
            observeRevealElements(node);
          }
        });
      });
    });

    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
    });

    return () => {
      revealObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return containerRef;
}

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
  const sources = getSteamImageSources(appId, headerImage);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [appId, headerImage]);

  if (sourceIndex >= sources.length) {
    return (
      <div
        className="player-game-icon"
        aria-label={`${name} image unavailable`}
      >
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
      onError={() => setSourceIndex((index) => index + 1)}
    />
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
    <section className="player-analysis scroll-reveal">
      <div className="player-section-heading">
        <div>
          <span className="player-eyebrow">GAME INTELLIGENCE</span>
          <h2>Analysis results</h2>
          <p>Player feedback for {analysis.game.name}.</p>
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
          <small>{formatNumber(summary.positiveReviews)} reviews</small>
        </article>

        <article className="player-analysis-stat negative">
          <span>Negative sentiment</span>
          <strong>{summary.negativePercentage.toFixed(1)}%</strong>
          <small>{formatNumber(summary.negativeReviews)} reviews</small>
        </article>

        <article className="player-analysis-stat">
          <span>Review quality</span>
          <strong>{summary.reviewQuality.toFixed(0)}/100</strong>
        </article>
      </div>

      <article className="player-analysis-card scroll-reveal">
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
        <article className="player-analysis-card scroll-reveal">
          <span className="player-eyebrow">PLAYER COMPLAINTS</span>
          <h3>Top issues</h3>

          {analysis.topIssues.length > 0 ? (
            <div className="player-analysis-list">
              {analysis.topIssues.slice(0, 6).map((issue, index) => (
                <div className="player-analysis-list-item" key={issue.name}>
                  <span className="player-analysis-rank">{index + 1}</span>
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

        <article className="player-analysis-card scroll-reveal">
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

      <div className="player-analysis-extra scroll-reveal">
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
        <article className="player-analysis-card scroll-reveal">
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
          Analysis timestamp: {new Date(analysis.analyzedAt).toLocaleString()}
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
  onAnalyzeGame,

  // Authentication
  setMode,
  isLoggedIn = false,
  steamConnected = false,
  accountEmail = "",
  onLogout,
}: PlayerHomeProps) {
  const revealRef = useScrollReveal();

  const [searchValue, setSearchValue] = useState("");
  const [searchResults, setSearchResults] = useState<SearchGame[]>([]);
  const [selectedGame, setSelectedGame] = useState<SearchGame | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [details, setDetails] = useState<GameDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");

  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const searchRequestId = useRef(0);
  const analysisRequestId = useRef(0);

  const typedValue = searchValue.trim();

  const detailsAppId =
    selectedGame?.appId ??
    (/^\d+$/.test(typedValue) ? typedValue : "");

  // Search suggestions only. Selecting a result does not analyze it.
  useEffect(() => {
    const query = searchValue.trim();

    if (
      query.length < 2 ||
      /^\d+$/.test(query) ||
      selectedGame !== null
    ) {
      searchRequestId.current += 1;
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError("");
      return;
    }

    const controller = new AbortController();
    const requestId = ++searchRequestId.current;

    const timeoutId = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError("");

      try {
        const games = await searchGames(query, controller.signal);

        if (
          !controller.signal.aborted &&
          requestId === searchRequestId.current
        ) {
          setSearchResults(games);
        }
      } catch {
        if (
          !controller.signal.aborted &&
          requestId === searchRequestId.current
        ) {
          setSearchError("Unable to search games. Please try again.");
          setSearchResults([]);
        }
      } finally {
        if (
          !controller.signal.aborted &&
          requestId === searchRequestId.current
        ) {
          setSearchLoading(false);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [searchValue, selectedGame]);

  // Fetch store details only; never trigger review analysis here.
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

  // This is the only function that requests a review analysis.
  const runAnalysis = async (appId: string, refresh = false) => {
    if (!appId || analysisLoading || refreshing) return;

    const requestId = ++analysisRequestId.current;

    setAnalysisError("");

    if (refresh) {
      setRefreshing(true);
    } else {
      setAnalysis(null);
      setAnalysisLoading(true);
    }

    try {
      const result = await analyzeGame(appId, refresh);

      // Ignore stale responses if the user changed games.
      if (requestId !== analysisRequestId.current) return;

      setAnalysis(result);
      onAnalyzeGame?.(result.game.appId || appId, result);
    } catch (error) {
      if (requestId !== analysisRequestId.current) return;

      setAnalysisError(
        error instanceof Error
          ? error.message
          : "Unable to analyze this game. Please try again."
      );
    } finally {
      if (requestId === analysisRequestId.current) {
        setAnalysisLoading(false);
        setRefreshing(false);
      }
    }
  };

  // An unreleased game has nothing to review, so it is never analyzed
  const notReleased =
    details !== null &&
    details.appId === detailsAppId &&
    details.comingSoon;

  const earlyAccess =
    details !== null &&
    details.appId === detailsAppId &&
    details.earlyAccess;

  // Form submission is what starts the analysis.
  const handleSearch = () => {
    const value = searchValue.trim();

    if (!value) {
      setSearchError("Enter a game name or Steam App ID.");
      return;
    }

    if (notReleased) {
      setSearchError("Waiting for this game to be reviewed...");
      return;
    }

    if (selectedGame && selectedGame.name === value) {
      void runAnalysis(selectedGame.appId);
      return;
    }

    if (/^\d+$/.test(value)) {
      recordSearch(value).catch(() => undefined);
      void runAnalysis(value);
      return;
    }

    setSearchError(
      "Select a game from the search results before analyzing it."
    );
  };

  const handleSearchChange = (value: string) => {
    searchRequestId.current += 1;
    analysisRequestId.current += 1;

    setSearchValue(value);
    setSelectedGame(null);
    setSearchResults([]);
    setSearchLoading(false);
    setSearchError("");

    setAnalysis(null);
    setAnalysisError("");
    setAnalysisLoading(false);
    setRefreshing(false);
  };

  const handleSelectGame = (game: SearchGame) => {
    searchRequestId.current += 1;
    analysisRequestId.current += 1;

    setSelectedGame(game);
    setSearchValue(game.name);
    setSearchResults([]);
    setSearchLoading(false);
    setSearchError("");

    setAnalysis(null);
    setAnalysisError("");
    setAnalysisLoading(false);
    setRefreshing(false);
  };

  const handleChooseAnother = () => {
    searchRequestId.current += 1;
    analysisRequestId.current += 1;

    setSearchValue("");
    setSelectedGame(null);
    setSearchResults([]);
    setSearchLoading(false);
    setSearchError("");

    setAnalysis(null);
    setAnalysisError("");
    setAnalysisLoading(false);
    setRefreshing(false);

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main
      ref={revealRef}
      className={`player-home ${darkMode ? "player-home-dark" : ""}`}
    >
      
        <Navbar
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          onLogoClick={onLogoClick}
          mode={mode}
          setMode={setMode}
          isLoggedIn={isLoggedIn}
          steamConnected={steamConnected}
          accountEmail={accountEmail}
          onLogout={onLogout}
        />

      <ReviewHero
        mode={mode}
        announcement="New frontend layout! Enjoy and find little secrets scattered across pages."
        searchValue={searchValue}
        onSearchChange={handleSearchChange}
        results={selectedGame ? [] : searchResults}
        searching={searchLoading}
        onSelect={handleSelectGame}
        onSubmit={handleSearch}
        status={
          searchError ||
          (searchLoading
            ? "Searching Steam..."
            : notReleased
              ? "Waiting for this game to be reviewed... It isn't out on Steam yet."
              : earlyAccess
                ? "This game is in Early Access, so its reviews can change a lot between updates."
                : "Type a game's name and pick it from the list, or enter its App ID.")
        }
        statusIsError={searchError !== ""}
        buttonLabel={
          notReleased
            ? "NOT OUT YET"
            : analysisLoading
              ? "ANALYZING..."
              : refreshing
                ? "REFRESHING..."
                : "ANALYZE GAME"
        }
        buttonDisabled={analysisLoading || refreshing || notReleased}
        links={[
          {
            label: "COMPARE GAMES",
            // Compare is for logged-in players, like the navbar link
            onClick: () => setCurrentPage(isLoggedIn ? "compare" : "login"),
          },
          { label: "REVIEW SETTINGS", onClick: () => setCurrentPage("settings") },
        ]}
      />

      {/* SELECTED GAME DETAILS */}
      <section className="player-overview scroll-reveal">
        <div className="player-section-heading">
          <div>
            <span className="player-eyebrow">PLAYER INSIGHTS</span>
            <h2>Game overview</h2>
          </div>

          <span className="player-demo-tag">
            {detailsAppId ? "STEAM STORE DATA" : "NO GAME SELECTED"}
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
              Click Analyze Game to view review sentiment, common issues,
              and personalized game-fit insights.
            </p>
          </article>
        ) : (
          <article className="player-game-card player-empty-overview">
            <div className="player-empty-overview-content">
              <span className="player-eyebrow">READY TO EXPLORE?</span>
              <h3>No game selected yet</h3>

              <p className="player-game-description">
                Search for a Steam game above or enter its App ID to view
                its details and explore player feedback.
              </p>
            </div>
          </article>
        )}
      </section>

      {/* ANALYSIS LOADING */}
      {analysisLoading && (
        <section className="player-analysis-loading scroll-reveal" aria-live="polite">
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
        <section className="player-analysis-error scroll-reveal" role="alert">
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

      {/* RESULTS APPEAR AFTER ANALYSIS */}
      {analysis && !analysisLoading && (
        <>
          <AnalysisResults
            analysis={analysis}
            onChooseAnother={handleChooseAnother}
            onRefresh={() => void runAnalysis(analysis.game.appId, true)}
            refreshing={refreshing}
          />

          {/* Personalized assessment is hidden until analysis succeeds. */}
          <section className="scroll-reveal">
            <RightGameForPlayer
              key={analysis.game.appId}
              appId={analysis.game.appId}
              gameName={analysis.game.name}
              darkMode={darkMode}
            />
          </section>
        </>
      )}

      <footer className="player-footer scroll-reveal">
        <span>GameScope</span>
        <span>Make informed gaming decisions.</span>
      </footer>
    </main>
  );
}

export default PlayerHome;
