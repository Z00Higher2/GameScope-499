
import { useEffect, useRef, useState } from "react";

import Navbar from "./Navbar";
import ReviewHero from "./ReviewHero";
import { analyzeGame, recordSearch, searchGames } from "../api";
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

  // Authentication
  setMode: React.Dispatch<React.SetStateAction<Mode>>;
  isLoggedIn?: boolean;
  accountEmail?: string;
  onLogout?: () => void;

  onAnalysisComplete?: (result: GameAnalysis) => void;
}

// ==================================================
// STEAM GAME THUMBNAIL
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

  const imageUrls = [
    image,
    `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
  ].filter(
    (url, index, urls): url is string =>
      Boolean(url) && urls.indexOf(url) === index
  );

  useEffect(() => {
    setImageIndex(0);
  }, [appId, image]);

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

  // Authentication
  setMode,
  isLoggedIn = false,
  accountEmail = "",
  onLogout,
  onAnalysisComplete,
  
}: DashboardProps) {
  // ==================================================
  // GAME SEARCH
  // ==================================================

  // One box for both a game name and a Steam App ID
  const [gameSearch, setGameSearch] = useState("");
  const [selectedGame, setSelectedGame] =
    useState<GameSearchResult | null>(null);

  const typedAppId = /^\d+$/.test(gameSearch.trim())
    ? gameSearch.trim()
    : "";

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
  const [searching, setSearching] = useState(false);
  const resultsRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const query = gameSearch.trim();

    if (!query || selectedGame || typedAppId) {
      setGameSearchResults([]);
      setSearchError("");
      setSearching(false);
      return;
    }

    const controller = new AbortController();

    const timer = window.setTimeout(() => {
      setSearching(true);
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
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setSearching(false);
          }
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [gameSearch, selectedGame, typedAppId]);

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
      gameToAnalyze?.appId || selectedGame?.appId || typedAppId;

    if (!trimmedAppId) {
      setError(
        gameSearch.trim()
          ? "Pick a game from the list, or enter its Steam App ID (for example 620 for Portal 2)."
          : "Search for a game or enter its Steam App ID."
      );
      return;
    }

    setError("");
    setLoading(true);

    // Picks from the hero count themselves; a typed App ID counts here
    if (!gameToAnalyze && !selectedGame) {
      recordSearch(trimmedAppId).catch(() => undefined);
    }

    try {
      const result = await analyzeGame(trimmedAppId, refresh);

      setAnalysis(result);
      setAnalyzed(true);
      setAnalyzedAppId(result.game.appId);
      onAnalysisComplete?.(result);

      setSelectedGame(null);
      setGameSearch("");

      resultsRef.current?.scrollIntoView({ behavior: "smooth" });
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

    void handleAnalyze(
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
    setGameSearch(game.name);
    setError("");
  };

  const showDeveloperResults =
    mode === "developer" &&
    currentPage === "dashboard" &&
    analyzed &&
    analysis !== null &&
    !loading;

  const showDeveloperEmptyState =
    mode === "developer" &&
    currentPage === "dashboard" &&
    !analyzed &&
    !loading;

  return (
    <div className="dashboard-page">
      
      <Navbar
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        onLogoClick={onLogoClick}
        mode={mode}
        setMode={setMode}
        isLoggedIn={isLoggedIn}
        accountEmail={accountEmail}
        onLogout={onLogout}
      />


      <ReviewHero
        mode={mode}
        announcement="New frontend layout! Enjoy and find little secrets scattered across pages."
        searchValue={gameSearch}
        onSearchChange={(value) => {
          setGameSearch(value);
          setSelectedGame(null);
          setError("");
        }}
        results={selectedGame ? [] : gameSearchResults}
        searching={searching}
        onSelect={handleSelectGame}
        onSubmit={() => void handleAnalyze()}
        status={
          error ||
          searchError ||
          (loading
            ? "Analyzing reviews... a game analyzed for the first time takes about 15 seconds."
            : searching
              ? "Searching Steam..."
              : selectedGame
                ? `${selectedGame.name} selected. Press ANALYZE GAME.`
                : typedAppId
                  ? `Press ANALYZE GAME to use Steam App ID ${typedAppId}.`
                  : "Type a game's name and pick it from the list, or enter its App ID.")
        }
        statusIsError={error !== "" || searchError !== ""}
        buttonLabel={loading ? "ANALYZING..." : "ANALYZE GAME"}
        buttonDisabled={loading || !gameSearch.trim()}
        links={[
          { label: "VIEW ISSUES", onClick: () => setCurrentPage("issues") },
          { label: "REVIEW SETTINGS", onClick: () => setCurrentPage("settings") },
        ]}
      />

      <main ref={resultsRef} className="dashboard-main">
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

        {showDeveloperResults && analysis && (
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
                    Steam App ID: <strong>{analyzedAppId}</strong>
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
                <strong>{analysis.summary.positivePercentage}%</strong>
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
                  <div className="feedback-item" key={index}>
                    <span className={`feedback-type ${feedback.type}`}>
                      {feedback.type === "positive" ? "Positive" : "Negative"}
                    </span>
                    <p>{feedback.text}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {/* EMPTY STATE */}

        {showDeveloperEmptyState && (
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
