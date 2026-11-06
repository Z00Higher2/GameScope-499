import { useState } from "react";
import Navbar from "./Navbar";
import type { Page, Mode } from "../type";
import "./MyGames.css";
import { getGameDetails } from "../api";

interface MyGamesProps {
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

  // Opens and analyzes the selected game in the Developer Dashboard.
  onOpenGame: (appId: string) => void;
}

interface ManagedGame {
  appId: string;
  name: string;
  image: string;
  addedAt: string;
  genre?: string;
}

// =========================================================
// CAPCOM DEMO PORTFOLIO
// Sample company games for demonstration purposes.
// =========================================================

const capcomDemoGames: Omit<ManagedGame, "addedAt">[] = [
  {
    appId: "2246340",
    name: "Monster Hunter Wilds",
    image:
      "https://cdn.akamai.steamstatic.com/steam/apps/2246340/header.jpg",
  },
  {
    appId: "2050650",
    name: "Resident Evil 4",
    image:
      "https://cdn.akamai.steamstatic.com/steam/apps/2050650/header.jpg",
  },
  {
    appId: "1364780",
    name: "Street Fighter 6",
    image:
      "https://cdn.akamai.steamstatic.com/steam/apps/1364780/header.jpg",
  },
  {
    appId: "601150",
    name: "Devil May Cry 5",
    image:
      "https://cdn.akamai.steamstatic.com/steam/apps/601150/header.jpg",
  },
  {
    appId: "2054970",
    name: "Dragon's Dogma 2",
    image:
      "https://cdn.akamai.steamstatic.com/steam/apps/2054970/header.jpg",
  },
];

function getStorageKey(email: string) {
  return `gamescope-developer-games-${email.toLowerCase()}`;
}

function loadGames(email: string): ManagedGame[] {
  try {
    const saved = localStorage.getItem(getStorageKey(email));

    if (!saved) return [];

    const games = JSON.parse(saved);

    return Array.isArray(games) ? games : [];
  } catch {
    return [];
  }
}

function MyGames({
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
  onOpenGame,
}: MyGamesProps) {
  // =========================================================
  // STATE
  // =========================================================

  const [games, setGames] = useState<ManagedGame[]>(
    () => loadGames(accountEmail)
  );

  const [loadingCapcomDemo, setLoadingCapcomDemo] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddGame, setShowAddGame] = useState(false);
  const [appIdInput, setAppIdInput] = useState("");
  const [addGameError, setAddGameError] = useState("");
  const [addingGame, setAddingGame] = useState(false);
  const [openingGameId, setOpeningGameId] = useState<string | null>(
    null
  );

  const [gamePreview, setGamePreview] = useState<{
    appId: string;
    name: string;
    image: string;
  } | null>(null);

  // =========================================================
  // SAVE GAMES
  // =========================================================

  const saveGames = (updatedGames: ManagedGame[]) => {
    setGames(updatedGames);

    localStorage.setItem(
      getStorageKey(accountEmail),
      JSON.stringify(updatedGames)
    );
  };

  // =========================================================
  // LOAD CAPCOM DEMO
  // =========================================================

  const handleLoadCapcomDemo = () => {
    setLoadingCapcomDemo(true);

    const existingIds = new Set(
      games.map((game) => game.appId)
    );

    const newGames: ManagedGame[] = capcomDemoGames
      .filter((game) => !existingIds.has(game.appId))
      .map((game) => ({
        ...game,
        addedAt: new Date().toISOString(),
      }));

    saveGames([...games, ...newGames]);

    setSearchTerm("");
    setLoadingCapcomDemo(false);
  };

  // =========================================================
  // FILTER GAMES
  // =========================================================

  const filteredGames = games.filter((game) =>
    game.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // =========================================================
  // LOOK UP STEAM GAME
  // =========================================================

  const handleGameLookup = async () => {
    const appId = appIdInput.trim();

    if (!/^\d+$/.test(appId)) {
      setAddGameError("Please enter a valid numeric Steam App ID.");
      return;
    }

    setAddingGame(true);
    setAddGameError("");
    setGamePreview(null);

    try {
      const details = await getGameDetails(appId);

      setGamePreview({
        appId: String(details.appId),
        name: details.name,
        image:
          details.headerImage ||
          `https://cdn.akamai.steamstatic.com/steam/apps/${details.appId}/header.jpg`,
      });
    } catch (error) {
      setAddGameError(
        error instanceof Error
          ? error.message
          : "Unable to find this game on Steam."
      );
    } finally {
      setAddingGame(false);
    }
  };

  // =========================================================
  // ADD GAME
  // =========================================================

  const handleAddGame = () => {
    if (!gamePreview) return;

    const alreadyExists = games.some(
      (game) => game.appId === gamePreview.appId
    );

    if (alreadyExists) {
      setAddGameError("This game is already in your organization.");
      return;
    }

    const newGame: ManagedGame = {
      ...gamePreview,
      addedAt: new Date().toISOString(),
    };

    saveGames([...games, newGame]);

    setShowAddGame(false);
    setAppIdInput("");
    setGamePreview(null);
    setAddGameError("");
  };

  // =========================================================
  // REMOVE GAME
  // =========================================================

  const handleRemoveGame = (appId: string) => {
    const updatedGames = games.filter(
      (game) => game.appId !== appId
    );

    saveGames(updatedGames);
  };

  // =========================================================
  // OPEN GAME DASHBOARD
  // =========================================================

  const handleOpenGame = async (appId: string) => {
    if (openingGameId) return;

    setOpeningGameId(appId);

    try {
      await onOpenGame(appId);
    } finally {
      setOpeningGameId(null);
    }
  };

  // =========================================================
  // OPEN ADD GAME MODAL
  // =========================================================

  const openAddGameModal = () => {
    setShowAddGame(true);
    setAppIdInput("");
    setAddGameError("");
    setGamePreview(null);
  };

  const closeAddGameModal = () => {
    if (addingGame) return;

    setShowAddGame(false);
    setAppIdInput("");
    setAddGameError("");
    setGamePreview(null);
  };

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <main
      className={`my-games-page ${darkMode ? "my-games-dark" : ""}`}
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

      <section className="my-games-content">
        {/* HERO SECTION */}

        <div className="my-games-header">
          <div className="my-games-header-copy">
            <span className="my-games-eyebrow">
              DEVELOPER WORKSPACE
            </span>

            <h1>
              Manage Your <span>Games.</span>
            </h1>

            <p>
              Your organization's game portfolio, all in one place.
              Manage your titles and explore their player feedback.
            </p>

            <div className="my-games-account">
              <span className="my-games-status-dot" />
              Organization workspace
            </div>
          </div>

          <div className="my-games-hero-decoration">
            <div className="my-games-hero-icon">🎮</div>
            <span>YOUR STUDIO</span>
            <strong>GAME ON.</strong>
          </div>
        </div>

        {/* COMPANY PROFILE */}

        <div className="my-games-company-profile">
          <div className="my-games-company-brand">
            <div className="my-games-company-logo">C</div>

            <div>
              <span>DEMO COMPANY PROFILE</span>
              <h2>CAPCOM</h2>
              <p>Game Developer &amp; Publisher</p>
            </div>
          </div>

          <div className="my-games-company-description">
            <p>
              Capcom is a video game developer and publisher known
              for iconic franchises including Resident Evil,
              Monster Hunter, Street Fighter, and Devil May Cry.
            </p>

            <span className="my-games-demo-label">
              SAMPLE COMPANY DATA
            </span>
          </div>
        </div>

        {/* CAPCOM PORTFOLIO PERFORMANCE */}

        <div className="my-games-company-metrics">
          <div className="my-games-metric-card">
            <span>PLAYER SATISFACTION</span>
            <strong>82%</strong>
            <p>Sample positive sentiment</p>
          </div>

          <div className="my-games-metric-card">
            <span>NEGATIVE FEEDBACK</span>
            <strong>18%</strong>
            <p>Sample negative sentiment</p>
          </div>

          <div className="my-games-metric-card">
            <span>REVIEWS ANALYZED</span>
            <strong>5.2K</strong>
            <p>Illustrative review volume</p>
          </div>

          <div className="my-games-metric-card">
            <span>PORTFOLIO TITLES</span>
            <strong>{games.length}</strong>
            <p>Games in this workspace</p>
          </div>
        </div>

        {/* ORGANIZATION STATISTICS */}

        <div className="my-games-stats">
          <div className="my-games-stat-card">
            <span>MANAGED GAMES</span>
            <strong>{games.length}</strong>
            <p>Games in your organization</p>
          </div>

          <div className="my-games-stat-card">
            <span>ORGANIZATION</span>
            <strong>1</strong>
            <p>Active workspace</p>
          </div>

          <div className="my-games-stat-card">
            <span>GAME PORTFOLIO</span>
            <strong>{games.length > 0 ? "Active" : "Empty"}</strong>
            <p>Portfolio status</p>
          </div>
        </div>

        {/* GAME PORTFOLIO */}

        <div className="my-games-section">
          <div className="my-games-section-heading">
            <div>
              <h2>Your Game Portfolio</h2>
              <p>
                Manage the games associated with your organization.
              </p>
            </div>

            <div className="my-games-actions">
              <div className="my-games-search">
                <span>⌕</span>

                <input
                  type="text"
                  placeholder="Search your games..."
                  value={searchTerm}
                  onChange={(event) =>
                    setSearchTerm(event.target.value)
                  }
                />
              </div>

              <button
                type="button"
                className="my-games-demo-button"
                onClick={handleLoadCapcomDemo}
                disabled={loadingCapcomDemo}
              >
                {loadingCapcomDemo
                  ? "Loading Demo..."
                  : "🎮 Load CAPCOM Demo"}
              </button>

              <button
                type="button"
                className="my-games-add-button"
                onClick={openAddGameModal}
              >
                + Add Game
              </button>
            </div>
          </div>

          {/* GAME CARDS */}

          {filteredGames.length > 0 ? (
            <div className="my-games-grid">
              {filteredGames.map((game) => (
                <div
                  className="my-games-card"
                  key={game.appId}
                >
                  <div className="my-games-card-image">
                    <img
                      src={game.image}
                      alt={game.name}
                      loading="lazy"
                    />
                  </div>

                  <div className="my-games-card-info">
                    <h3>{game.name}</h3>

                    <p>Steam App ID: {game.appId}</p>

                    <div className="my-games-card-actions">
                      <button
                        type="button"
                        className="my-games-open-button"
                        onClick={() => handleOpenGame(game.appId)}
                        disabled={openingGameId !== null}
                      >
                        {openingGameId === game.appId
                          ? "Analyzing..."
                          : "Open Game Dashboard →"}
                      </button>

                      <button
                        type="button"
                        className="my-games-remove-button"
                        onClick={() => handleRemoveGame(game.appId)}
                        disabled={openingGameId !== null}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="my-games-empty">
              <div className="my-games-empty-icon">🎮</div>

              <h3>
                {searchTerm
                  ? "No games found"
                  : "Your portfolio is empty"}
              </h3>

              <p>
                {searchTerm
                  ? "Try searching with another game title."
                  : "Add your organization's first game to start managing its player feedback."}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ADD GAME MODAL */}

      {showAddGame && (
        <div
          className="my-games-modal-overlay"
          onClick={closeAddGameModal}
        >
          <div
            className="my-games-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="my-games-modal-header">
              <div>
                <span>GAME MANAGEMENT</span>
                <h2>Add a Game</h2>
                <p>
                  Connect a Steam game to your organization.
                </p>
              </div>

              <button
                type="button"
                className="my-games-modal-close"
                onClick={closeAddGameModal}
                aria-label="Close popup"
              >
                ×
              </button>
            </div>

            <div className="my-games-modal-body">
              <label htmlFor="steam-app-id">
                STEAM APPLICATION ID
              </label>

              <div className="my-games-app-id-input">
                <input
                  id="steam-app-id"
                  type="text"
                  inputMode="numeric"
                  placeholder="Example: 570"
                  value={appIdInput}
                  onChange={(event) => {
                    setAppIdInput(event.target.value);
                    setGamePreview(null);
                    setAddGameError("");
                  }}
                />

                <button
                  type="button"
                  onClick={handleGameLookup}
                  disabled={
                    addingGame || !appIdInput.trim()
                  }
                >
                  {addingGame ? "Searching..." : "Find Game"}
                </button>
              </div>

              <p className="my-games-input-hint">
                Enter the game's Steam App ID to retrieve its details.
              </p>

              {addGameError && (
                <div className="my-games-error">
                  {addGameError}
                </div>
              )}

              {gamePreview && (
                <div className="my-games-preview">
                  <img
                    src={gamePreview.image}
                    alt={gamePreview.name}
                  />

                  <div>
                    <span>GAME FOUND</span>
                    <h3>{gamePreview.name}</h3>
                    <p>
                      Steam App ID: {gamePreview.appId}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="my-games-modal-footer">
              <button
                type="button"
                className="my-games-cancel-button"
                onClick={closeAddGameModal}
                disabled={addingGame}
              >
                Cancel
              </button>

              <button
                type="button"
                className="my-games-confirm-button"
                onClick={handleAddGame}
                disabled={!gamePreview || addingGame}
              >
                Add to My Games
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default MyGames;