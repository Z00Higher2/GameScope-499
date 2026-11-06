
import { useState } from "react";
import Navbar from "./Navbar";
import type { Page, Mode } from "../type";
import "./MyLibrary.css";

interface MyLibraryProps {
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  currentPage: Page;
  setCurrentPage: React.Dispatch<React.SetStateAction<Page>>;
  onLogoClick: () => void;
  mode: Mode;

  // Authentication
  setMode: React.Dispatch<React.SetStateAction<Mode>>;
  isLoggedIn: boolean;
  steamConnected: boolean;
  accountEmail: string;
  onLogout: () => void;
}

interface LibraryGame {
  appId: string;
  name: string;
  playtime: number;
  lastPlayed: string;
  image: string;
}

// DEMO GAMES FOR TESTING FRONTEND
const demoGames: LibraryGame[] = [
  {
    appId: "570",
    name: "Dota 2",
    playtime: 245,
    lastPlayed: "Today",
    image: "https://cdn.akamai.steamstatic.com/steam/apps/570/header.jpg",
  },
  {
    appId: "1091500",
    name: "Cyberpunk 2077",
    playtime: 132,
    lastPlayed: "Yesterday",
    image: "https://cdn.akamai.steamstatic.com/steam/apps/1091500/header.jpg",
  },
  {
    appId: "1245620",
    name: "Elden Ring",
    playtime: 96,
    lastPlayed: "3 days ago",
    image: "https://cdn.akamai.steamstatic.com/steam/apps/1245620/header.jpg",
  },
  {
    appId: "730",
    name: "Counter-Strike 2",
    playtime: 318,
    lastPlayed: "Today",
    image: "https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg",
  },
];

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
}: MyLibraryProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const totalGames = demoGames.length;

  const totalPlaytime = demoGames.reduce(
    (total, game) => total + game.playtime,
    0
  );

  const filteredGames = demoGames.filter((game) =>
    game.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <main className={`my-library ${darkMode ? "my-library-dark" : ""}`}>
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

      <section className="library-content">
        {/* Hero section */}
        <div className="library-header">
          <div className="library-header-copy">
            <div className="library-title-label">
              <span className="library-eyebrow">PLAYER COLLECTION</span>
              <span className="library-demo-badge">DEMO LIBRARY</span>
            </div>

            <h1>
              Your Gaming <span>Universe.</span>
            </h1>

            <p>
              Your collection, your achievements, and every hour of your
              gaming journey.
            </p>

            <div className="library-connection-status">
              <span className="connection-indicator"></span>
              Steam Account Connected
            </div>
          </div>

          <div className="library-hero-decoration">
            <div className="library-hero-icon">🎮</div>
            <div className="library-hero-caption">
              <span>YOUR COLLECTION</span>
              <strong>GAME ON.</strong>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="library-stats">
          <div className="library-stat-card">
            <span className="stat-label">GAMES OWNED</span>
            <h2>{totalGames}</h2>
            <p>Your Steam collection</p>
          </div>

          <div className="library-stat-card">
            <span className="stat-label">TOTAL PLAYTIME</span>
            <h2>{totalPlaytime} hrs</h2>
            <p>Time spent gaming</p>
          </div>

          <div className="library-stat-card">
            <span className="stat-label">RECENTLY PLAYED</span>
            <h2>
              {
                demoGames.filter((game) =>
                  ["Today", "Yesterday"].includes(game.lastPlayed)
                ).length
              }
            </h2>
            <p>Games played recently</p>
          </div>
        </div>

        {/* Games section */}
        <div className="library-games-section">
          <div className="library-games-heading">
            <div>
              <h2>Your Games</h2>
              <p>Browse and analyze games in your collection.</p>
            </div>

            <div className="library-search">
              <span>⌕</span>
              <input
                type="text"
                placeholder="Search your games..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          </div>

          <div className="library-game-grid">
            {filteredGames.length > 0 ? (
              filteredGames.map((game) => (
                <div className="library-game-card" key={game.appId}>
                  <img
                    src={game.image}
                    alt={game.name}
                    className="library-game-image"
                  />

                  <div className="library-game-info">
                    <h3>{game.name}</h3>

                    <div className="library-game-meta">
                      <span>{game.playtime} hours played</span>
                      <span>Last played: {game.lastPlayed}</span>
                    </div>

                    <button
                      type="button"
                      className="library-analyze-button"
                      onClick={() => setCurrentPage("dashboard")}
                    >
                      Analyze Game
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="library-empty">
                <h3>No games found</h3>
                <p>Try searching with a different game title.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export default MyLibrary;
