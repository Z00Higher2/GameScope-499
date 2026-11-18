
import { useEffect, useMemo, useState } from "react";
import Navbar from "./Navbar";
import type { Page, Mode } from "../type";
import { getImportedSteamLibrary } from "../api";
import type { SteamLibraryGame } from "../api";
import "./MyLibrary.css";

interface MyLibraryProps {
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  currentPage: Page;
  setCurrentPage: React.Dispatch<React.SetStateAction<Page>>;
  onLogoClick: () => void;
  mode: Mode;
  setMode: React.Dispatch<React.SetStateAction<Mode>>;
  isLoggedIn: boolean;
  steamConnected: boolean;
  accountEmail: string;
  onLogout: () => void;
  isAdmin?: boolean;
}

/*
 * Parse date-only values as local dates to prevent timezone shifts.
 */

function parseLastPlayedDate(value: string | null): Date | null {
  if (!value) return null;

  const cleaned = value.trim();
  const lower = cleaned.toLowerCase();

  const today = new Date();

  if (lower === "today") {
    return new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
  }

  if (lower === "yesterday") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    return new Date(
      yesterday.getFullYear(),
      yesterday.getMonth(),
      yesterday.getDate()
    );
  }

  const daysAgo = lower.match(/^(\d+)\s+days?\s+ago$/);

  if (daysAgo) {
    const date = new Date(today);
    date.setDate(date.getDate() - Number(daysAgo[1]));

    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );
  }

  const dateOnlyMatch = cleaned.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (dateOnlyMatch) {
    const date = new Date(
      Number(dateOnlyMatch[1]),
      Number(dateOnlyMatch[2]) - 1,
      Number(dateOnlyMatch[3])
    );

    if (
      date.getFullYear() !== Number(dateOnlyMatch[1]) ||
      date.getMonth() !== Number(dateOnlyMatch[2]) - 1 ||
      date.getDate() !== Number(dateOnlyMatch[3])
    ) {
      return null;
    }

    return date;
  }

  const date = new Date(cleaned);

  return Number.isNaN(date.getTime()) ? null : date;
}

/*
 * Display a readable last-played date.
 */
function formatLastPlayed(value: string | null): string {
  if (!value) return "Never played";

  const date = parseLastPlayedDate(value);

  if (!date) return "Unknown";

  const now = new Date();

  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const playedDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  const difference = Math.round(
    (today.getTime() - playedDate.getTime()) /
      (1000 * 60 * 60 * 24)
  );

  if (difference < 0) return "Unknown";
  if (difference === 0) return "Today";
  if (difference === 1) return "Yesterday";
  if (difference < 7) return `${difference} days ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() !== now.getFullYear()
        ? "numeric"
        : undefined,
  });
}

/*
 * Determine whether a game was played within the last 14 calendar days.
 */
function wasRecentlyPlayed(value: string | null): boolean {
  const date = parseLastPlayedDate(value);

  if (!date) return false;

  const now = new Date();

  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const playedDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  const difference = Math.round(
    (today.getTime() - playedDate.getTime()) /
      (1000 * 60 * 60 * 24)
  );

  return difference >= 0 && difference <= 14;
}

function MyLibrary({
  darkMode,
  setDarkMode,
  currentPage,
  setCurrentPage,
  onLogoClick,
  mode,
  setMode,
  isLoggedIn,
  steamConnected,
  accountEmail,
  onLogout,
  isAdmin = false,
}: MyLibraryProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [games, setGames] = useState<SteamLibraryGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  /*
   * Load games imported by the GameScope Chrome extension.
   */
  useEffect(() => {
    const controller = new AbortController();

    async function loadLibrary() {
      if (!isLoggedIn || !steamConnected || mode !== "player") {
        setGames([]);
        setLoading(false);
        setRefreshing(false);
        setError("");
        return;
      }

      setLoading(true);
      setError("");

      try {
        const response = await getImportedSteamLibrary(
          controller.signal
        );

        setGames(response.games ?? []);
      } catch (err) {
        if (
          err instanceof DOMException &&
          err.name === "AbortError"
        ) {
          return;
        }

        setGames([]);

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load your imported Steam library."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadLibrary();

    return () => {
      controller.abort();
    };
  }, [
    isLoggedIn,
    steamConnected,
    accountEmail,
    mode,
  ]);

  /*
   * Reload the games already imported into GameScope.
   */
  async function handleRefresh() {
    if (
      !isLoggedIn ||
      !steamConnected ||
      mode !== "player" ||
      refreshing
    ) {
      return;
    }

    const controller = new AbortController();

    setRefreshing(true);
    setError("");

    try {
      const response = await getImportedSteamLibrary(
        controller.signal
      );

      setGames(response.games ?? []);
    } catch (err) {
      if (
        err instanceof DOMException &&
        err.name === "AbortError"
      ) {
        return;
      }

      setError(
        err instanceof Error
          ? err.message
          : "Unable to refresh your imported Steam library."
      );
    } finally {
      setRefreshing(false);
    }
  }

  /*
   * Filter the library by game title.
   */
  const filteredGames = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    if (!normalizedSearch) {
      return games;
    }

    return games.filter((game) =>
      game.name.toLowerCase().includes(normalizedSearch)
    );
  }, [games, searchTerm]);

  /*
   * Library statistics.
   */
  const totalGames = games.length;

  const totalPlaytime = games.reduce(
    (total, game) => total + (game.playtime ?? 0),
    0
  );

  const recentlyPlayed = games.filter((game) =>
    wasRecentlyPlayed(game.lastPlayed)
  ).length;

  const formattedPlaytime = totalPlaytime.toLocaleString(
    undefined,
    {
      maximumFractionDigits: 1,
    }
  );

  /*
   * Shared navigation props.
   */
  const navbar = (
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
      isAdmin={isAdmin}
    />
  );

  /*
   * Developer mode cannot access the Player library.
   */
  if (mode !== "player") {
    return (
      <main
        className={`my-library ${
          darkMode ? "my-library-dark" : ""
        }`}
      >
        {navbar}

        <section className="library-content">
          <div className="library-empty">
            <h3>My Library is a Player feature</h3>
            <p>
              Switch to Player Mode to view your Steam collection.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      className={`my-library ${
        darkMode ? "my-library-dark" : ""
      }`}
    >
      {navbar}

      <section className="library-content">
        {/* Hero section */}
        <div className="library-header">
          <div className="library-header-copy">
            <div className="library-title-label">
              <span className="library-eyebrow">
                PLAYER COLLECTION
              </span>

              <span className="library-demo-badge">
                STEAM LIBRARY
              </span>
            </div>

            <h1>
              Your Gaming <span>Universe.</span>
            </h1>

            <p>
              Your collection, your achievements, and every hour
              of your gaming journey.
            </p>

            <div className="library-connection-status">
              <span
                className="connection-indicator"
                style={{
                  background: steamConnected
                    ? "#20a878"
                    : "#999",
                }}
              />

              {steamConnected
                ? "Steam Account Connected"
                : "Steam Account Not Connected"}
            </div>
          </div>

          <div className="library-hero-decoration">
            <div className="library-hero-icon">
              🎮
            </div>

            <div className="library-hero-caption">
              <span>YOUR COLLECTION</span>
              <strong>GAME ON.</strong>
            </div>
          </div>
        </div>

        {/* Steam account not connected */}
        {!steamConnected && (
          <div className="library-empty">
            <h3>Connect your Steam account</h3>

            <p>
              Link your Steam account from your Profile to see
              your owned games and playtime here.
            </p>

            <button
              type="button"
              className="library-analyze-button"
              onClick={() => setCurrentPage("profile")}
            >
              Go to Profile
            </button>
          </div>
        )}

        {/* Connected Steam account */}
        {steamConnected && (
          <>
            {/* Statistics */}
            <div className="library-stats">
              <div className="library-stat-card">
                <span className="stat-label">
                  GAMES OWNED
                </span>

                <h2>
                  {loading
                    ? "—"
                    : totalGames.toLocaleString()}
                </h2>

                <p>Your Steam collection</p>
              </div>

              <div className="library-stat-card">
                <span className="stat-label">
                  TOTAL PLAYTIME
                </span>

                <h2>
                  {loading
                    ? "—"
                    : `${formattedPlaytime} hrs`}
                </h2>

                <p>Time spent gaming</p>
              </div>

              <div className="library-stat-card">
                <span className="stat-label">
                  RECENTLY PLAYED
                </span>

                <h2>
                  {loading ? "—" : recentlyPlayed}
                </h2>

                <p>Played within the last 14 days</p>
              </div>
            </div>

            {/* Games section */}
            <div className="library-games-section">
              <div className="library-games-heading">
                <div>
                  <h2>Your Games</h2>

                  <p>
                    Browse and analyze games in your collection.
                  </p>
                </div>

                <div className="library-search">
                  <span>⌕</span>

                  <input
                    type="text"
                    placeholder="Search your games..."
                    value={searchTerm}
                    onChange={(event) =>
                      setSearchTerm(event.target.value)
                    }
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Refresh row */}
              <div className="library-refresh-row">
                <span>
                  {loading
                    ? "Loading your imported games..."
                    : `${filteredGames.length} of ${totalGames} games`}
                </span>

                <button
                  type="button"
                  className="library-analyze-button"
                  onClick={handleRefresh}
                  disabled={loading || refreshing}
                >
                  {refreshing
                    ? "Refreshing..."
                    : "Refresh Library"}
                </button>
              </div>

              {/* Error state */}
              {error && (
                <div className="library-empty">
                  <h3>Unable to load your library</h3>

                  <p>{error}</p>

                  <button
                    type="button"
                    className="library-analyze-button"
                    onClick={handleRefresh}
                    disabled={refreshing}
                  >
                    {refreshing
                      ? "Trying again..."
                      : "Try Again"}
                  </button>
                </div>
              )}

              {/* Loading state */}
              {!error && loading && (
                <div className="library-empty">
                  <h3>Loading your games</h3>

                  <p>
                    Please wait while GameScope retrieves your
                    imported Steam collection.
                  </p>
                </div>
              )}

              {/* Empty library */}
              {!error &&
                !loading &&
                games.length === 0 && (
                  <div className="library-empty">
                    <h3>Your Steam library hasn't been imported yet</h3>

                    <p>
                      Connect your Steam account and import your
                      games using the GameScope Steam Library
                      extension.
                    </p>

                    <button
                      type="button"
                      className="library-analyze-button"
                      onClick={() => setCurrentPage("profile")}
                    >
                      Go to Profile
                    </button>
                  </div>
                )}

              {/* Game cards */}
              {!error &&
                !loading &&
                games.length > 0 && (
                  <div className="library-game-grid">
                    {filteredGames.length > 0 ? (
                      filteredGames.map((game) => (
                        <div
                          className="library-game-card"
                          key={game.appId}
                        >
                          <img
                            src={
                              game.image ||
                              `https://cdn.akamai.steamstatic.com/steam/apps/${game.appId}/header.jpg`
                            }
                            alt={game.name}
                            className="library-game-image"
                            loading="lazy"
                            onError={(event) => {
                              event.currentTarget.style.visibility =
                                "hidden";
                            }}
                          />

                          <div className="library-game-info">
                            <h3>{game.name}</h3>

                            <div className="library-game-meta">
                              <span>
                                {(game.playtime ?? 0).toLocaleString(
                                  undefined,
                                  {
                                    maximumFractionDigits: 1,
                                  }
                                )}{" "}
                                hours played
                              </span>

                              <span>
                                Last played:{" "}
                                {formatLastPlayed(game.lastPlayed)}
                              </span>
                            </div>

                            <button
                              type="button"
                              className="library-analyze-button"
                              onClick={() =>
                                setCurrentPage("dashboard")
                              }
                            >
                              Analyze Game
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="library-empty">
                        <h3>No games found</h3>

                        <p>
                          Try searching with a different game title.
                        </p>
                      </div>
                    )}
                  </div>
                )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default MyLibrary;
