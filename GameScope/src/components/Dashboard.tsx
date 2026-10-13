import { useEffect, useState } from "react";

import Navbar from "./Navbar";
import { analyzeGame, searchGames } from "../api";
import type { GameAnalysis, GameSearchResult } from "../api";

import "./Dashboard.css";

interface DashboardProps {
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;

 currentPage: "dashboard" | "reviews" | "analytics";
 setCurrentPage: React.Dispatch<
    React.SetStateAction<"dashboard" | "reviews" | "analytics">
  >;

  // ==================================================
  // SHARED ANALYSIS STATE
  // ==================================================

  analyzed: boolean;

  setAnalyzed: React.Dispatch<React.SetStateAction<boolean>>;

  analyzedAppId: string;

  setAnalyzedAppId: React.Dispatch<React.SetStateAction<string>>;

  // Results from the GameScope API for the analyzed game
  analysis: GameAnalysis | null;

  setAnalysis: React.Dispatch<React.SetStateAction<GameAnalysis | null>>;

  onLogoClick: () => void;
}

function Dashboard({
  darkMode,
  setDarkMode,
  currentPage,
  setCurrentPage,
  analyzed,
  setAnalyzed,
  analyzedAppId,
  setAnalyzedAppId,
  analysis,
  setAnalysis,
  onLogoClick,
}: DashboardProps) {
  // ==================================================
  // GAME SEARCH
  // ==================================================
  // Users can search for a Steam game by name.
  //
  // The GameScope API asks Steam's store search for
  // matching games and returns their App IDs.
  // ==================================================

  const [gameSearch, setGameSearch] = useState("");

  // This is the game the user is CURRENTLY preparing
  // to analyze.
  //
  // IMPORTANT:
  // This is separate from the analyzed game.
  // Selecting a new game should NOT change the
  // currently displayed analysis.
  const [selectedGame, setSelectedGame] =
    useState<GameSearchResult | null>(null);

  // App ID input.
  const [appId, setAppId] = useState(analyzedAppId);

  // ==================================================
  // LOADING / ERRORS
  // ==================================================

  const [loading, setLoading] = useState(false);

  // Why the last Analyze failed (shown under the card)
  const [error, setError] = useState("");

  // ==================================================
  // GAME SEARCH RESULTS
  // ==================================================

  const [gameSearchResults, setGameSearchResults] =
    useState<GameSearchResult[]>([]);

  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    const query = gameSearch.trim();

    // Nothing to search, or a result was already picked
    if (!query || selectedGame) {
      setGameSearchResults([]);
      setSearchError("");
      return;
    }

    const controller = new AbortController();

    // Wait until the user stops typing before searching.
    const timer = window.setTimeout(() => {
      searchGames(query, controller.signal)
        .then((results) => {
          setGameSearchResults(results);
          setSearchError(
            results.length === 0
              ? "No Steam games found. Try another name or enter the App ID."
              : ""
          );
        })
        .catch((searchFailure: Error) => {
          if (searchFailure.name !== "AbortError") {
            setGameSearchResults([]);
            setSearchError(searchFailure.message);
          }
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [gameSearch, selectedGame]);

  // ==================================================
  // ANALYZED GAME
  // ==================================================
  // The game whose results are currently displayed.
  //
  // analysis only changes AFTER Analyze finishes, so
  // picking a new game doesn't change the displayed
  // analysis early.
  // ==================================================

  const gameName =
    analysis?.game.name ||
    (analyzedAppId
      ? `Steam Game ${analyzedAppId}`
      : "Enter a Steam App ID");

  // Steam IDs are intentionally NOT displayed with
  // feedback because the project treats reviews as
  // anonymous.
  const topIssues = analysis?.topIssues ?? [];

  const recentFeedback = analysis?.recentFeedback ?? [];

  // ==================================================
  // ANALYZE GAME
  // ==================================================

  const handleAnalyze = async (
    gameToAnalyze?: GameSearchResult,
    refresh = false
  ) => {
    // If a game was selected from search, use that game.
    //
    // Otherwise use the manually entered App ID.
    const trimmedAppId =
      gameToAnalyze?.appId || appId.trim();

    // Don't analyze an empty App ID.
    if (!trimmedAppId) {
      return;
    }

    if (!/^\d+$/.test(trimmedAppId)) {
      setError(
        "Steam App IDs are numbers only, for example 620 for Portal 2."
      );
      return;
    }

    setError("");
    setLoading(true);

    // ==================================================
    // BACKEND:
    //
    // The GameScope API (GameReview/api.py):
    //
    // 1. Receives the Steam App ID
    // 2. Collects Steam reviews
    // 3. Filters low-quality reviews
    // 4. Stores/reads reviews from MySQL
    // 5. Calculates analytics
    // 6. Returns the results
    //
    // Games analyzed before load straight from MySQL.
    // Re-analyze (refresh) collects fresh reviews.
    // ==================================================

    try {
      const result = await analyzeGame(
        trimmedAppId,
        refresh
      );

      // ==================================================
      // SAVE THE ANALYZED GAME
      // ==================================================
      // The displayed game changes ONLY here, after
      // Analyze has actually finished.
      // ==================================================

      setAnalysis(result);

      // Tell App.tsx that analysis is complete.
      setAnalyzed(true);

      // Save the App ID.
      setAnalyzedAppId(result.game.appId);

      // Clear the search after analysis so the old
      // results don't pop back open.
      setSelectedGame(null);
      setGameSearch("");

      window.scrollTo({
        top: 0,
        left: 0,
        behavior: "smooth",
      });
    } catch (analyzeFailure) {
      setError(
        analyzeFailure instanceof Error
          ? analyzeFailure.message
          : "The analysis failed."
      );
    } finally {
      setLoading(false);
    }
  };

  // ==================================================
  // RE-ANALYZE
  // ==================================================
  // Re-analyze the game that is CURRENTLY displayed,
  // collecting fresh reviews from Steam.
  //
  // It should NOT use the search box or selected game.
  // ==================================================

  const handleReanalyze = () => {
    if (!analyzedAppId) {
      return;
    }

    handleAnalyze(
      {
        name: gameName,
        appId: analyzedAppId,
      },
      true
    );
  };

  // ==================================================
  // SELECT GAME
  // ==================================================
  // Selecting a game prepares it for analysis.
  //
  // IMPORTANT:
  // We do NOT change the analyzed game here.
  // ==================================================

  const handleSelectGame = (game: GameSearchResult) => {
    setSelectedGame(game);

    setAppId(game.appId);

    setGameSearch(game.name);
  };

  return (
    <div className="dashboard-page">
      <Navbar
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        onLogoClick={onLogoClick}
      />

      <main className="dashboard-main">
        {/* ==================================================
            HEADER
        ================================================== */}

        <section className="dashboard-header">
          <div>
            <span className="dashboard-label">
              GAMESCOPE
            </span>

            <h1>Game Review Dashboard</h1>

            <p>
              Analyze Steam player reviews and discover
              meaningful feedback about a game.
            </p>
          </div>
        </section>

        {/* ==================================================
            ANALYZE CARD
        ================================================== */}

        <section className="analyze-card">
          <div className="analyze-content">
            <div className="analyze-title">
              <h2>Analyze a Game</h2>

              <p>
                Search for a Steam game by name or enter
                its App ID.
              </p>
            </div>

            {/* ==================================================
                GAME NAME SEARCH
            ================================================== */}

            <div className="search-container">
              <input
                type="text"
                value={gameSearch}
                onChange={(event) => {
                  setGameSearch(event.target.value);

                  // Searching for another game means the
                  // previous search selection is no longer
                  // the pending game.
                  setSelectedGame(null);
                }}
                placeholder="Search for a Steam game..."
                disabled={loading}
              />
            </div>

            {/* ==================================================
                SEARCH RESULTS
            ================================================== */}

            {searchError && !selectedGame && (
              <p className="app-id-help">
                {searchError}
              </p>
            )}

            {gameSearchResults.length > 0 &&
              !selectedGame && (
                <div className="game-search-results">
                  {gameSearchResults.map((game) => (
                    <button
                      type="button"
                      className="game-search-result"
                      key={game.appId}
                      onClick={() =>
                        handleSelectGame(game)
                      }
                      disabled={loading}
                    >
                      <span>
                        <strong>{game.name}</strong>

                        <small>
                          Steam App ID: {game.appId}
                        </small>
                      </span>

                      <span className="game-select-label">
                        Select
                      </span>
                    </button>
                  ))}
                </div>
              )}

            {/* ==================================================
                SELECTED GAME
            ================================================== */}

            {selectedGame && (
              <div className="selected-game">
                <div>
                  <span className="selected-game-label">
                    SELECTED GAME
                  </span>

                  <strong>
                    {selectedGame.name}
                  </strong>

                  <small>
                    Steam App ID: {selectedGame.appId}
                  </small>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleAnalyze(selectedGame)
                  }
                  disabled={loading}
                >
                  {loading
                    ? "Analyzing..."
                    : "Analyze"}
                </button>
              </div>
            )}

            {/* ==================================================
                OR DIVIDER
            ================================================== */}

            <div className="app-id-divider">
              <span>OR</span>
            </div>

            {/* ==================================================
                MANUAL APP ID
            ================================================== */}

            <div className="search-container">
              <input
                type="text"
                value={appId}
                onChange={(event) => {
                  setAppId(event.target.value);

                  // Manual App ID entry cancels the selected
                  // search result.
                  setSelectedGame(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleAnalyze();
                  }
                }}
                placeholder="Enter Steam App ID..."
                disabled={loading}
              />

              <button
                type="button"
                onClick={() => handleAnalyze()}
                disabled={
                  loading || !appId.trim()
                }
              >
                {loading
                  ? "Analyzing..."
                  : "Analyze"}
              </button>
            </div>

            <p className="app-id-help">
              Example:{" "}
              <strong>2694490</strong> for Path
              of Exile 2
            </p>
          </div>
        </section>

        {/* ==================================================
            ERROR
        ================================================== */}

        {error && !loading && (
          <section
            className="analyze-error"
            role="alert"
          >
            <strong>Couldn't analyze that game</strong>

            <p>{error}</p>
          </section>
        )}

        {/* ==================================================
            LOADING
        ================================================== */}

        {loading && (
          <section className="loading-card">
            <div className="loading-spinner"></div>

            <h3>Analyzing Reviews...</h3>

            <p>
              Collecting and processing player feedback.
              A game analyzed for the first time takes
              about 15 seconds.
            </p>
          </section>
        )}

        {/* ==================================================
            ANALYZED GAME RESULTS
        ================================================== */}

        {analyzed && analysis && !loading && (
          <>
            {/* ==================================================
                CURRENT GAME
            ================================================== */}

            <section className="game-status">
              <div>
                <span className="status-label">
                  CURRENTLY ANALYZED
                </span>

                <h2>{gameName}</h2>

                <p>
                  Steam App ID:{" "}
                  <strong>
                    {analyzedAppId}
                  </strong>
                </p>
              </div>

              <button
                type="button"
                onClick={handleReanalyze}
                disabled={loading}
              >
                Re-analyze
              </button>
            </section>

            {/* ==================================================
                STATS
            ================================================== */}

            <section className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">
                  TOTAL REVIEWS
                </span>

                <strong className="stat-value">
                  {analysis.summary.totalReviews.toLocaleString()}
                </strong>
              </div>

              <div className="stat-card">
                <span className="stat-label">
                  POSITIVE REVIEWS
                </span>

                <strong className="stat-value">
                  {analysis.summary.positivePercentage}%
                </strong>

                <span className="stat-detail">
                  {analysis.summary.positiveReviews.toLocaleString()}{" "}
                  reviews
                </span>
              </div>

              <div className="stat-card">
                <span className="stat-label">
                  NEGATIVE REVIEWS
                </span>

                <strong className="stat-value">
                  {analysis.summary.negativePercentage}%
                </strong>

                <span className="stat-detail">
                  {analysis.summary.negativeReviews.toLocaleString()}{" "}
                  reviews
                </span>
              </div>
            </section>

            {/* ==================================================
                ANALYSIS SUMMARY
            ================================================== */}

            <section className="analysis-summary">
              <div>
                <span className="summary-label">
                  ANALYSIS SUMMARY
                </span>

                <h2>
                  What are players saying?
                </h2>

                <p>
                  {analysis.analysisSummary}
                </p>
              </div>

              <div className="summary-stat">
                <strong>
                  {analysis.summary.positivePercentage}%
                </strong>

                <span>Recommended</span>
              </div>
            </section>

            {/* ==================================================
                TOP ISSUES
            ================================================== */}

            <section className="dashboard-card">
              <div className="card-header">
                <div>
                  <span className="card-label">
                    REVIEW ANALYSIS
                  </span>

                  <h2>Top Issues</h2>
                </div>
              </div>

              <div className="issue-list">
                {topIssues.length === 0 && (
                  <p className="dashboard-note">
                    No common topics found in the
                    negative reviews.
                  </p>
                )}

                {topIssues.map((issue) => (
                  <div
                    className="issue-item"
                    key={issue.name}
                  >
                    <div className="issue-info">
                      <span>
                        {issue.name}
                      </span>

                      <strong>
                        {issue.count.toLocaleString()}
                      </strong>
                    </div>

                    <div className="issue-bar">
                      <div
                        className="issue-bar-fill"
                        style={{
                          width: `${
                            (issue.count /
                              topIssues[0].count) *
                            100
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ==================================================
                RECENT FEEDBACK
            ================================================== */}

            <section className="dashboard-card">
              <div className="card-header">
                <div>
                  <span className="card-label">
                    PLAYER FEEDBACK
                  </span>

                  <h2>Recent Feedback</h2>
                </div>
              </div>

              <div className="feedback-list">
                {recentFeedback.map(
                  (feedback, index) => (
                    <div
                      className="feedback-item"
                      key={index}
                    >
                      <span
                        className={`feedback-type ${feedback.type}`}
                      >
                        {feedback.type ===
                        "positive"
                          ? "Positive"
                          : "Negative"}
                      </span>

                      <p>
                        {feedback.text}
                      </p>
                    </div>
                  )
                )}
              </div>
            </section>
          </>
        )}

        {/* ==================================================
            EMPTY STATE
        ================================================== */}

        {!analyzed && !loading && (
          <section className="dashboard-empty">
            <h2>
              Ready to analyze a game?
            </h2>

            <p>
              Search for a Steam game above or enter
              its App ID to begin analyzing player
              reviews.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

export default Dashboard;