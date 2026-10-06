import { useState } from "react";

import Navbar from "./Navbar";

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
  onLogoClick,
}: DashboardProps) {
  // ==================================================
  // GAME SEARCH
  // ==================================================
  // Users can search for a Steam game by name.
  //
  // BACKEND:
  // Eventually this search should request matching
  // games from FastAPI + Steam and return their App IDs.
  // ==================================================

  const [gameSearch, setGameSearch] = useState("");

  // This is the game the user is CURRENTLY preparing
  // to analyze.
  //
  // IMPORTANT:
  // This is separate from analyzedGameName.
  // Selecting a new game should NOT change the
  // currently displayed analysis.
  const [selectedGame, setSelectedGame] = useState<{
    name: string;
    appId: string;
  } | null>(null);

  // ==================================================
  // ANALYZED GAME
  // ==================================================
  // This stores the game whose results are currently
  // being displayed.
  //
  // It only changes AFTER the user presses Analyze.
  // ==================================================

  const [analyzedGameName, setAnalyzedGameName] = useState(() => {
    if (analyzedAppId === "2694490") {
      return "Path of Exile 2";
    }

    return analyzedAppId
      ? `Steam Game ${analyzedAppId}`
      : "";
  });

  // App ID input.
  const [appId, setAppId] = useState(analyzedAppId);

  // ==================================================
  // LOADING
  // ==================================================

  const [loading, setLoading] = useState(false);

  // ==================================================
  // DEMO GAME SEARCH RESULTS
  // ==================================================
  // BACKEND:
  // Replace this with results returned by FastAPI.
  // ==================================================

  const gameSearchResults = [
    {
      name: "Path of Exile 2",
      appId: "2694490",
    },
    {
      name: "Monster Hunter Wilds",
      appId: "2246340",
    },
    {
      name: "Counter-Strike 2",
      appId: "730",
    },
  ];

  const filteredGames = gameSearch.trim()
    ? gameSearchResults.filter((game) =>
        game.name
          .toLowerCase()
          .includes(gameSearch.trim().toLowerCase())
      )
    : [];

  // ==================================================
  // GAME NAME
  // ==================================================
  // IMPORTANT:
  // Use analyzedGameName here instead of selectedGame.
  //
  // This prevents the dashboard from changing the
  // currently analyzed game before Analyze is clicked.
  // ==================================================

  const gameName =
    analyzedGameName ||
    (analyzedAppId === "2694490"
      ? "Path of Exile 2"
      : analyzedAppId
        ? `Steam Game ${analyzedAppId}`
        : "Enter a Steam App ID");

  // ==================================================
  // DEMO REVIEW DATA
  // ==================================================
  // BACKEND:
  // Replace this with the actual response from MySQL.
  // ==================================================

  const reviewData = {
    totalReviews: 1284,
    positiveReviews: 925,
    negativeReviews: 359,
    positivePercentage: 72,
    negativePercentage: 28,
  };

  // ==================================================
  // TOP ISSUES
  // ==================================================
  // BACKEND:
  // These will eventually be calculated from the
  // filtered Steam reviews.
  // ==================================================

  const topIssues = [
    {
      name: "Performance",
      count: 932,
    },
    {
      name: "Inventory",
      count: 821,
    },
    {
      name: "Bugs",
      count: 523,
    },
    {
      name: "Multiplayer",
      count: 482,
    },
  ];

  // ==================================================
  // RECENT FEEDBACK
  // ==================================================
  // BACKEND:
  // These should eventually come from MySQL.
  //
  // Steam IDs are intentionally NOT displayed because
  // the project treats reviews as anonymous.
  // ==================================================

  const recentFeedback = [
    {
      type: "positive",
      text: "The combat system and overall gameplay are excellent.",
    },
    {
      type: "negative",
      text: "Performance problems make the game difficult to enjoy.",
    },
    {
      type: "positive",
      text: "Great graphics and a lot of content to explore.",
    },
  ];

  // ==================================================
  // ANALYZE GAME
  // ==================================================

  const handleAnalyze = (
    gameToAnalyze?: {
      name: string;
      appId: string;
    }
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

    setLoading(true);

    // ==================================================
    // BACKEND:
    //
    // Eventually replace this simulated timeout with
    // your actual FastAPI request.
    //
    // Example:
    //
    // fetch(`/api/analyze/${trimmedAppId}`)
    //
    // The backend should:
    //
    // 1. Receive Steam App ID
    // 2. Collect Steam reviews
    // 3. Filter low-quality reviews
    // 4. Store/read reviews from MySQL
    // 5. Calculate analytics
    // 6. Return the results
    // ==================================================

    setTimeout(() => {
      setLoading(false);

      // Tell App.tsx that analysis is complete.
      setAnalyzed(true);

      // Save the App ID.
      setAnalyzedAppId(trimmedAppId);

      // ==================================================
      // SAVE THE ANALYZED GAME NAME
      // ==================================================
      // This is the important part.
      //
      // The displayed game name changes ONLY here,
      // after Analyze has actually been triggered.
      // ==================================================

      if (gameToAnalyze) {
        setAnalyzedGameName(gameToAnalyze.name);
      } else if (trimmedAppId === "2694490") {
        setAnalyzedGameName("Path of Exile 2");
      } else {
        setAnalyzedGameName(
          `Steam Game ${trimmedAppId}`
        );
      }

      // Clear the selected search game after analysis.
      setSelectedGame(null);

      window.scrollTo({
        top: 0,
        left: 0,
        behavior: "smooth",
      });
    }, 2000);
  };

  // ==================================================
  // RE-ANALYZE
  // ==================================================
  // Re-analyze the game that is CURRENTLY displayed.
  //
  // It should NOT use the search box or selected game.
  // ==================================================

  const handleReanalyze = () => {
    if (!analyzedAppId) {
      return;
    }

    handleAnalyze({
      name: analyzedGameName,
      appId: analyzedAppId,
    });
  };

  // ==================================================
  // SELECT GAME
  // ==================================================
  // Selecting a game prepares it for analysis.
  //
  // IMPORTANT:
  // We do NOT change analyzedGameName here.
  // ==================================================

  const handleSelectGame = (game: {
    name: string;
    appId: string;
  }) => {
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

            {filteredGames.length > 0 &&
              !selectedGame && (
                <div className="game-search-results">
                  {filteredGames.map((game) => (
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
            LOADING
        ================================================== */}

        {loading && (
          <section className="loading-card">
            <div className="loading-spinner"></div>

            <h3>Analyzing Reviews...</h3>

            <p>
              Collecting and processing player feedback.
            </p>
          </section>
        )}

        {/* ==================================================
            ANALYZED GAME RESULTS
        ================================================== */}

        {analyzed && !loading && (
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
                  {reviewData.totalReviews.toLocaleString()}
                </strong>
              </div>

              <div className="stat-card">
                <span className="stat-label">
                  POSITIVE REVIEWS
                </span>

                <strong className="stat-value">
                  {reviewData.positivePercentage}%
                </strong>

                <span className="stat-detail">
                  {reviewData.positiveReviews.toLocaleString()}{" "}
                  reviews
                </span>
              </div>

              <div className="stat-card">
                <span className="stat-label">
                  NEGATIVE REVIEWS
                </span>

                <strong className="stat-value">
                  {reviewData.negativePercentage}%
                </strong>

                <span className="stat-detail">
                  {reviewData.negativeReviews.toLocaleString()}{" "}
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
                  The analyzed reviews contain both
                  positive and negative player feedback.
                  The most frequently mentioned issues can
                  help identify areas that may require
                  further attention.
                </p>
              </div>

              <div className="summary-stat">
                <strong>
                  {reviewData.positivePercentage}%
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