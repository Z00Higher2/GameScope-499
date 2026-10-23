import { useEffect, useState } from "react";

import Navbar from "./Navbar";
import { analyzeGame, searchGames } from "../api";
import type { GameAnalysis, GameSearchResult } from "../api";
import type { Page, Mode } from "../type";

import "./Dashboard.css";

interface DashboardProps {
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  currentPage: Page;
  mode: Mode;
  setCurrentPage: React.Dispatch<React.SetStateAction<Page>>;

  analyzed: boolean;
  setAnalyzed: React.Dispatch<React.SetStateAction<boolean>>;

  analyzedAppId: string;
  setAnalyzedAppId: React.Dispatch<React.SetStateAction<string>>;

  analysis: GameAnalysis | null;
  setAnalysis: React.Dispatch<React.SetStateAction<GameAnalysis | null>>;

  onLogoClick: () => void;
}

// ==================================================
// STEAM GAME THUMBNAIL
// ==================================================
// Loads the game's header image from Steam.
// If the image cannot load, show the game's first letter.
// ==================================================


function DashboardGameThumb({
  appId,
  name,
  image,
}: {
  appId: string;
  name: string;
  image?: string | null;
}) {
  const [imageIndex, setImageIndex] = useState(0);

  // Prefer Steam's search thumbnail, then try alternate Steam images.
  const imageUrls = [
    image,
    `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
  ].filter(
    (url, index, urls): url is string =>
      Boolean(url) && urls.indexOf(url) === index
  );

  return (
    <span className="dashboard-game-thumb-wrapper">
      {imageIndex < imageUrls.length ? (
        <img
          className="dashboard-game-thumb"
          src={imageUrls[imageIndex]}
          alt={`${name} game cover`}
          loading="lazy"
          onError={() => setImageIndex((index) => index + 1)}
        />
      ) : (
        <span className="dashboard-game-thumb dashboard-game-thumb-fallback">
          {name.trim().charAt(0).toUpperCase() || "?"}
        </span>
      )}
    </span>
  );
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
  mode,
}: DashboardProps) {
  // ==================================================
  // GAME SEARCH
  // ==================================================

  const [gameSearch, setGameSearch] = useState("");

  const [selectedGame, setSelectedGame] =
    useState<GameSearchResult | null>(null);

  const [appId, setAppId] = useState(analyzedAppId);

  // ==================================================
  // LOADING / ERRORS
  // ==================================================

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ==================================================
  // GAME SEARCH RESULTS
  // ==================================================

  const [gameSearchResults, setGameSearchResults] =
    useState<GameSearchResult[]>([]);

  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    const query = gameSearch.trim();

    if (!query || selectedGame) {
      setGameSearchResults([]);
      setSearchError("");
      return;
    }

    const controller = new AbortController();

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

  const gameName =
    analysis?.game.name ||
    (analyzedAppId
      ? `Steam Game ${analyzedAppId}`
      : "Enter a Steam App ID");

  const topIssues = analysis?.topIssues ?? [];
  const recentFeedback = analysis?.recentFeedback ?? [];

  const pros = [...(analysis?.prosAndCons?.pros ?? [])].sort(
    (a, b) => b.mentions - a.mentions
  );

  const cons = [...(analysis?.prosAndCons?.cons ?? [])].sort(
    (a, b) => b.mentions - a.mentions
  );

  // ==================================================
  // ANALYZE GAME
  // ==================================================

  const handleAnalyze = async (
    gameToAnalyze?: GameSearchResult,
    refresh = false
  ) => {
    const trimmedAppId =
      gameToAnalyze?.appId || appId.trim();

    if (!trimmedAppId) {
      setError("Enter a Steam App ID or select a game.");
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

    try {
      const result = await analyzeGame(
        trimmedAppId,
        refresh
      );

      setAnalysis(result);
      setAnalyzed(true);
      setAnalyzedAppId(result.game.appId);

      setSelectedGame(null);
      setGameSearch("");
      setAppId(result.game.appId);

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
  // RE-ANALYZE CURRENT GAME
  // ==================================================

  const handleReanalyze = () => {
    if (!analyzedAppId) return;

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
        mode={mode}
      />

      <main className="dashboard-main">
        {/* HEADER */}

        <section className="dashboard-header">
          <div>
            <span className="dashboard-label">GAMESCOPE</span>
            <h1>Game Review Dashboard</h1>
            <p>
              Analyze Steam player reviews and discover
              meaningful feedback about a game.
            </p>
          </div>
        </section>

        {/* ANALYZE CARD */}

        <section className="analyze-card">
          <div className="analyze-content">
            <div className="analyze-title">
              <h2>Analyze a Game</h2>
              <p>
                Search for a Steam game by name or enter
                its App ID.
              </p>
            </div>

            {/* GAME NAME SEARCH */}

            <div className="search-container">
              <input
                type="text"
                value={gameSearch}
                onChange={(event) => {
                  setGameSearch(event.target.value);
                  setSelectedGame(null);
                }}
                placeholder="Search for a Steam game..."
                disabled={loading}
              />
            </div>

            {/* SEARCH RESULTS WITH STEAM IMAGES */}

            {searchError && !selectedGame && (
              <p className="app-id-help">{searchError}</p>
            )}

            {gameSearchResults.length > 0 && !selectedGame && (
              <div className="game-search-results">
                {gameSearchResults.map((game) => (
                  <button
                    type="button"
                    className="game-search-result"
                    key={game.appId}
                    onClick={() => handleSelectGame(game)}
                    disabled={loading}
                  >
                    <span className="dashboard-search-game">
                      <DashboardGameThumb
                        appId={game.appId}
                        name={game.name}
                        image={game.image}
                      />

                      <span className="dashboard-search-game-info">
                        <strong>{game.name}</strong>
                        <small>Steam App ID: {game.appId}</small>
                      </span>
                    </span>

                    <span className="game-select-label">
                      Select
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* SELECTED GAME WITH STEAM IMAGE */}

            {selectedGame && (
              <div className="selected-game">
                <div className="dashboard-selected-game-info">
                  <DashboardGameThumb
                    appId={selectedGame.appId}
                    name={selectedGame.name}
                    image={selectedGame.image}
                  />

                  <div>
                    <span className="selected-game-label">
                      SELECTED GAME
                    </span>

                    <strong>{selectedGame.name}</strong>

                    <small>
                      Steam App ID: {selectedGame.appId}
                    </small>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleAnalyze(selectedGame)}
                  disabled={loading}
                >
                  {loading ? "Analyzing..." : "Analyze"}
                </button>
              </div>
            )}

            {/* OR DIVIDER */}

            <div className="app-id-divider">
              <span>OR</span>
            </div>

            {/* MANUAL APP ID */}

            <div className="search-container">
              <input
                type="text"
                value={appId}
                onChange={(event) => {
                  setAppId(event.target.value);
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
                disabled={loading || !appId.trim()}
              >
                {loading ? "Analyzing..." : "Analyze"}
              </button>
            </div>
          </div>
        </section>

        {/* ERROR */}

        {error && !loading && (
          <section className="analyze-error" role="alert">
            <strong>Couldn't analyze that game</strong>
            <p>{error}</p>
          </section>
        )}

        {/* LOADING */}

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

        {/* ANALYZED GAME RESULTS */}

        {analyzed && analysis && !loading && (
          <>
            {/* CURRENT GAME */}

            <section className="game-status">
              <div className="dashboard-selected-game-info">
                <DashboardGameThumb
                  appId={analyzedAppId}
                  name={gameName}
                />

                <div>
                  <span className="status-label">
                    CURRENTLY ANALYZED
                  </span>

                  <h2>{gameName}</h2>

                  <p>
                    Steam App ID:{" "}
                    <strong>{analyzedAppId}</strong>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleReanalyze}
                disabled={loading}
              >
                Re-analyze
              </button>
            </section>

            {/* STATS */}

            <section className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">TOTAL REVIEWS</span>
                <strong className="stat-value">
                  {analysis.summary.totalReviews.toLocaleString()}
                </strong>
              </div>

              <div className="stat-card">
                <span className="stat-label">POSITIVE REVIEWS</span>
                <strong className="stat-value">
                  {analysis.summary.positivePercentage}%
                </strong>
                <span className="stat-detail">
                  {analysis.summary.positiveReviews.toLocaleString()} reviews
                </span>
              </div>

              <div className="stat-card">
                <span className="stat-label">NEGATIVE REVIEWS</span>
                <strong className="stat-value">
                  {analysis.summary.negativePercentage}%
                </strong>
                <span className="stat-detail">
                  {analysis.summary.negativeReviews.toLocaleString()} reviews
                </span>
              </div>
            </section>

            {/* ANALYSIS SUMMARY */}

            <section className="analysis-summary">
              <div>
                <span className="summary-label">ANALYSIS SUMMARY</span>
                <h2>What are players saying?</h2>
                <p>{analysis.analysisSummary}</p>
              </div>

              <div className="summary-stat">
                <strong>
                  {analysis.summary.positivePercentage}%
                </strong>
                <span>Recommended</span>
              </div>
            </section>

            {/* TOP ISSUES */}

            <section className="dashboard-card">
              <div className="card-header">
                <div>
                  <span className="card-label">REVIEW ANALYSIS</span>
                  <h2>Top Issues</h2>
                </div>
              </div>

              <div className="issue-list">
                {topIssues.length === 0 && (
                  <p className="dashboard-note">
                    No common topics found in the negative reviews.
                  </p>
                )}

                {topIssues.map((issue) => (
                  <div className="issue-item" key={issue.name}>
                    <div className="issue-info">
                      <span>{issue.name}</span>
                      <strong>{issue.count.toLocaleString()}</strong>
                    </div>

                    <div className="issue-bar">
                      <div
                        className="issue-bar-fill"
                        style={{
                          width: `${
                            topIssues[0]?.count
                              ? (issue.count / topIssues[0].count) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
            
            {/* PROS AND CONS */}

          <section className="pros-cons-grid">
            {/* PROS */}
            <div className="dashboard-card pros-cons-card pros-card">
              <div className="card-header">
                <div>
                  <span className="card-label">PLAYER SENTIMENT</span>
                  <h2>Pros</h2>
                </div>
              </div>

              <div className="pros-cons-list">
                {pros.length === 0 ? (
                  <p className="dashboard-note">
                    Not enough positive topic feedback yet.
                  </p>
                ) : (
                  pros.map((item) => (
                    <div className="pros-cons-item" key={item.topic}>
                      <div className="pros-cons-info">
                        <span>{item.topic}</span>
                        <strong>{item.mentions}</strong>
                      </div>

                    <div className="pros-cons-bar">
                        <div
                          className="pros-cons-bar-fill"
                          style={{
                            width: `${
                              item.totalMentions > 0
                                ? Math.min(
                                    (item.mentions / item.totalMentions) * 100,
                                    100
                                  )
                                : 0
                            }%`,
                          }}
                        />
                      </div>

                      <small>
                        Positive mentions out of {item.totalMentions} total
                      </small>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* CONS */}
            <div className="dashboard-card pros-cons-card cons-card">
              <div className="card-header">
                <div>
                  <span className="card-label">PLAYER SENTIMENT</span>
                  <h2>Cons</h2>
                </div>
              </div>

              <div className="pros-cons-list">
                {cons.length === 0 ? (
                  <p className="dashboard-note">
                    Not enough negative topic feedback yet.
                  </p>
                ) : (
                  cons.map((item) => (
                    <div className="pros-cons-item" key={item.topic}>
                      <div className="pros-cons-info">
                        <span>{item.topic}</span>
                        <strong>{item.mentions}</strong>
                      </div>

                      <div className="pros-cons-bar">
                      <div
                        className="pros-cons-bar-fill"
                        style={{
                          width: `${
                            item.totalMentions > 0
                              ? Math.min(
                                  (item.mentions / item.totalMentions) * 100,
                                  100
                                )
                              : 0
                          }%`,
                        }}
                      />
                    </div>

                    <small>
                      Negative mentions out of {item.totalMentions} total
                    </small>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

            {/* RECENT FEEDBACK */}

            <section className="dashboard-card">
              <div className="card-header">
                <div>
                  <span className="card-label">PLAYER FEEDBACK</span>
                  <h2>Recent Feedback</h2>
                </div>
              </div>

              <div className="feedback-list">
                {recentFeedback.map((feedback, index) => (
                  <div
                    className="feedback-item"
                    key={index}
                  >
                    <span className={`feedback-type ${feedback.type}`}>
                      {feedback.type === "positive"
                        ? "Positive"
                        : "Negative"}
                    </span>

                    <p>{feedback.text}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {/* EMPTY STATE */}

        {!analyzed && !loading && (
          <section className="dashboard-empty">
            <h2>Ready to analyze a game?</h2>
            <p>
              Search for a Steam game above or enter
              its App ID to begin analyzing player reviews.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

export default Dashboard;
