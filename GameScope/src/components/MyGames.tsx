import { useEffect, useState } from "react";
import Navbar from "./Navbar";
import type { Page, Mode } from "../type";
import "./MyGames.css";
import {
  getGameDetails,
  searchGames,
  getOrganizationMembership,
  getOrganizationGames,
  addOrganizationGame,
  type OrganizationMembership,
  type OrganizationGame,
  type GameSearchResult,
} from "../api";

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
  isAdmin?: boolean;
}

interface ManagedGame {
  appId: string;
  name: string;
  image: string;
  addedAt: string;
  genre?: string;
  organizationId: number;
  organizationName: string;
  relationship: "developed" | "published" | "owned";
  status: "pending" | "verified" | "rejected";

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
  isAdmin = false,
}: MyGamesProps) {
  // =========================================================
  // STATE
  // =========================================================

  const [games, setGames] = useState<ManagedGame[]>([]);
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] =useState("");
  const [selectedRelationship, setSelectedRelationship] = useState<"developed" | "published" | "owned">("developed");
  const [loadingGames, setLoadingGames] = useState(true);
  const [loadGamesError, setLoadGamesError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddGame, setShowAddGame] = useState(false);
  const [appIdInput, setAppIdInput] = useState("");
  const [steamSearchResults, setSteamSearchResults] = useState<GameSearchResult[]>([]);  
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
// LOAD VERIFIED ORGANIZATION GAMES
// =========================================================

useEffect(() => {
  let cancelled = false;

  const loadOrganizationData = async () => {
    setLoadingGames(true);
    setLoadGamesError("");

    try {
      const [membershipResponse, gamesResponse] =
        await Promise.all([
          getOrganizationMembership(),
          getOrganizationGames(),
        ]);

      if (cancelled) return;

      const verifiedMemberships =
        membershipResponse.memberships.filter(
          (membership) =>
            membership.affiliation_status === "verified"
        );

      setMemberships(verifiedMemberships);
      setSelectedOrganizationId(
      verifiedMemberships.length > 0
        ? String(verifiedMemberships[0].organization_id)
        : ""
    );

      const organizationGames: ManagedGame[] =
        gamesResponse.games.map((game: OrganizationGame) => ({
          appId: String(game.app_id),
          name: game.game_name,
          image: `https://cdn.akamai.steamstatic.com/steam/apps/${game.app_id}/header.jpg`,
          addedAt: game.added_at || "",
          organizationId: game.organization_id,
          organizationName: game.organization_name,
          relationship: game.relationship,
          status: game.relationship_status,
        }));

      setGames(organizationGames);
    } catch (error) {
      if (cancelled) return;

      setLoadGamesError(
        error instanceof Error
          ? error.message
          : "Unable to load your organization's games."
      );
    } finally {
      if (!cancelled) {
        setLoadingGames(false);
      }
    }
  };

  loadOrganizationData();

  return () => {
    cancelled = true;
  };
}, []);


const handleRefreshGames = async () => {
  setLoadingGames(true);
  setLoadGamesError("");

  try {
    const response = await getOrganizationGames();

    setGames(
      response.games.map((game) => ({
        appId: String(game.app_id),
        name: game.game_name,
        image: `https://cdn.akamai.steamstatic.com/steam/apps/${game.app_id}/header.jpg`,
        addedAt: game.added_at || "",
        organizationId: game.organization_id,
        organizationName: game.organization_name,
        relationship: game.relationship,
        status: game.relationship_status,
      }))
    );
  } catch (error) {
    setLoadGamesError(
      error instanceof Error
        ? error.message
        : "Unable to refresh your organization's games."
    );
  } finally {
    setLoadingGames(false);
  }
};

  
  // =========================================================
  // FILTER GAMES
  // =========================================================

  const filteredGames = games.filter((game) =>
    game.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedOrganization =
  memberships.find(
    (membership) =>
      String(membership.organization_id) === selectedOrganizationId
  ) ?? memberships[0] ?? null;

  // =========================================================
  // LOOK UP STEAM GAME
  // =========================================================

  const handleGameLookup = async () => {
  const query = appIdInput.trim();

  if (!query) {
    setAddGameError("Please enter a game title.");
    return;
  }

  setAddingGame(true);
  setAddGameError("");
  setGamePreview(null);
  setSteamSearchResults([]);

  try {
    const results = await searchGames(query);

    if (results.length === 0) {
      setAddGameError("No games found. Try another search.");
      return;
    }

    setSteamSearchResults(results);
  } catch (error) {
    setAddGameError(
      error instanceof Error
        ? error.message
        : "Unable to search Steam."
    );
  } finally {
    setAddingGame(false);
  }
};

  // =========================================================
  // ADD GAME
  // =========================================================

  const handleAddGame = async () => {
  if (!gamePreview) return;

  if (!selectedOrganizationId) {
    setAddGameError(
      "You need a verified organization before adding games."
    );
    return;
  }

  const alreadyExists = games.some(
    (game) =>
      game.appId === gamePreview.appId &&
      game.organizationId === Number(selectedOrganizationId)
  );

  if (alreadyExists) {
    setAddGameError(
      "This game is already registered with this organization."
    );
    return;
  }

  setAddingGame(true);
  setAddGameError("");

  try {
    const response = await addOrganizationGame({
      organization_id: Number(selectedOrganizationId),
      app_id: Number(gamePreview.appId),
      relationship: selectedRelationship,
    });

    setShowAddGame(false);
    setAppIdInput("");
    setGamePreview(null);

    setAddGameError("");

    alert(
      `${response.game_name} was submitted successfully and is awaiting administrator approval.`
    );

    // Refresh the organization's game list.
    const gamesResponse = await getOrganizationGames();

    setGames(
      gamesResponse.games.map((game) => ({
        appId: String(game.app_id),
        name: game.game_name,
        image: `https://cdn.akamai.steamstatic.com/steam/apps/${game.app_id}/header.jpg`,
        addedAt: game.added_at || "",
        organizationId: game.organization_id,
        organizationName: game.organization_name,
        relationship: game.relationship,
        status: game.relationship_status,
      }))
    );
  } catch (error) {
    setAddGameError(
      error instanceof Error
        ? error.message
        : "Unable to submit this game."
    );
  } finally {
    setAddingGame(false);
  }
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
    setSteamSearchResults([]);
  };

  const closeAddGameModal = () => {
    if (addingGame) return;

    setShowAddGame(false);
    setAppIdInput("");
    setAddGameError("");
    setGamePreview(null);
    setSteamSearchResults([]);
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
        isAdmin={isAdmin}
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
              <div className="my-games-company-logo">
                {selectedOrganization
                  ? selectedOrganization.organization_name.charAt(0).toUpperCase()
                  : "?"}
              </div>

              <div>
                <span>VERIFIED ORGANIZATION</span>
                <h2>
                  {selectedOrganization
                    ? selectedOrganization.organization_name
                    : "No Organization"}
                </h2>
                <p>
                  {selectedOrganization
                    ? selectedOrganization.membership_role === "admin"
                      ? "Organization Administrator"
                      : "Organization Member"
                    : "No verified organization membership"}
                </p>
              </div>
            </div>

            <div className="my-games-company-description">
              <p>
                {selectedOrganization
                  ? `Manage games associated with ${selectedOrganization.organization_name}.`
                  : "Your organization profile will appear here once your membership has been verified."}
              </p>

              <span className="my-games-demo-label">
                {selectedOrganization
                  ? "ORGANIZATION VERIFIED"
                  : "VERIFICATION REQUIRED"}
              </span>
            </div>
          </div>

        {/* ORGANIZATION STATISTICS */}

        <div className="my-games-stats">
            <div className="my-games-stat-card">
              <span>TOTAL GAMES</span>
              <strong>{games.length}</strong>
              <p>Games across your organizations</p>
            </div>

            <div className="my-games-stat-card">
              <span>VERIFIED GAMES</span>
              <strong>
                {games.filter((game) => game.status === "verified").length}
              </strong>
              <p>Approved by GameScope</p>
            </div>

            <div className="my-games-stat-card">
              <span>PENDING APPROVAL</span>
              <strong>
                {games.filter((game) => game.status === "pending").length}
              </strong>
              <p>Awaiting administrator review</p>
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
                className="my-games-add-button"
                onClick={handleRefreshGames}
                disabled={loadingGames}
              >
                {loadingGames ? "Refreshing..." : "↻ Refresh"}
              </button>

              <button
                type="button"
                className="my-games-add-button"
                onClick={openAddGameModal}
                disabled={memberships.length === 0}
              >
                + Add Game
              </button>
            </div>
          </div>

          {memberships.length === 0 && (
              <div className="my-games-empty">
                <div className="my-games-empty-icon">🏢</div>
                <h3>No Verified Organization</h3>
                <p>
                  Your organization membership must be verified by a GameScope
                  administrator before you can register games.
                </p>
              </div>
            )}

          {/* GAME CARDS */}

              {loadingGames ? (
                <div className="my-games-empty">
                    <div className="my-games-empty-icon">⏳</div>
                    <h3>Loading Your Portfolio</h3>
                    <p>Retrieving games from your organization...</p>
                  </div>
                ) : loadGamesError ? (
                  <div className="my-games-empty">
                    <div className="my-games-empty-icon">⚠️</div>
                    <h3>Unable to Load Games</h3>
                    <p>{loadGamesError}</p>
                  </div>
                ) : filteredGames.length > 0 ? ( 

              <div className="my-games-grid">
              {filteredGames.map((game) => (
                <div
                  className="my-games-card"
                  key={`${game.organizationId}-${game.appId}`}
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
                    <div className={`my-games-game-status status-${game.status}`}>
                      <span>
                        {game.status === "pending"
                          ? "Awaiting Approval"
                          : game.status === "verified"
                            ? "Verified"
                            : "Rejected"}
                      </span>
                    </div>

                    <p className="my-games-game-relationship">
                      {game.relationship.charAt(0).toUpperCase() + game.relationship.slice(1)}
                    </p>
                    <p className="my-games-game-organization">
                      {game.organizationName}
                    </p>

                    <div className="my-games-card-actions">
                      <button
                        type="button"
                        className="my-games-open-button"
                        onClick={() => handleOpenGame(game.appId)}
                        disabled={openingGameId !== null || game.status !== "verified"}
                      >
                        {openingGameId === game.appId
                          ? "Analyzing..."
                          : game.status === "pending"
                            ? "Awaiting Approval"
                            : game.status === "rejected"
                              ? "Game Rejected"
                              : "Open Game Dashboard →"}
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
              <label htmlFor="organization-select">
                    SELECT ORGANIZATION
                  </label>

                  <select
                    id="organization-select"
                    value={selectedOrganizationId}
                    onChange={(event) =>
                      setSelectedOrganizationId(event.target.value)
                    }
                    disabled={addingGame}
                  >
                    <option value="">Choose an organization</option>

                    {memberships.map((membership) => (
                      <option
                        key={membership.organization_id}
                        value={String(membership.organization_id)}
                      >
                        {membership.organization_name}
                      </option>
                    ))}
                  </select>

                  <label htmlFor="game-relationship">
                    ORGANIZATION'S RELATIONSHIP TO GAME
                  </label>

                  <select
                    id="game-relationship"
                    value={selectedRelationship}
                    onChange={(event) =>
                      setSelectedRelationship(
                        event.target.value as "developed" | "published" | "owned"
                      )
                    }
                    disabled={addingGame}
                  >
                    <option value="developed">Developed</option>
                    <option value="published">Published</option>
                    <option value="owned">Owned</option>
                  </select>
              <select
                id="organization-select"
                value={selectedOrganizationId}
                onChange={(event) =>
                  setSelectedOrganizationId(event.target.value)
                }
                disabled={addingGame}
              >
                <option value="">Choose an organization</option>

                {memberships.map((membership) => (
                  <option
                    key={membership.organization_id}
                    value={String(membership.organization_id)}
                  >
                    {membership.organization_name}
                  </option>
                ))}
              </select>

              <label htmlFor="steam-app-id">
                STEAM APPLICATION ID
              </label>

             <div className="my-games-app-id-input">
                <input
                  id="steam-app-id"
                  type="text"
                  placeholder="Search for a game..."
                  value={appIdInput}
                  onChange={(event) => {
                    setAppIdInput(event.target.value);
                    setSteamSearchResults([]);
                    setGamePreview(null);
                    setAddGameError("");
                  }}
                />

                <button
                  type="button"
                  onClick={handleGameLookup}
                  disabled={addingGame || !appIdInput.trim()}
                >
                  {addingGame ? "Searching..." : "Search Steam"}
                </button>
              </div>

              <p className="my-games-input-hint">
                Search Steam by game title, then select the correct game from the results.
              </p>

              {steamSearchResults.length > 0 && (
                <div className="my-games-search-results">
                  {steamSearchResults.map((game) => (
                    <button
                      type="button"
                      key={game.appId}
                      className="my-games-search-result"
                      onClick={async () => {
                        setAddingGame(true);
                        setAddGameError("");

                        try {
                          const details = await getGameDetails(game.appId);

                          setGamePreview({
                            appId: String(details.appId),
                            name: details.name,
                            image:
                              details.headerImage ||
                              `https://cdn.akamai.steamstatic.com/steam/apps/${details.appId}/header.jpg`,
                          });

                          setSteamSearchResults([]);
                        } catch (error) {
                          setAddGameError(
                            error instanceof Error
                              ? error.message
                              : "Unable to load game details."
                          );
                        } finally {
                          setAddingGame(false);
                        }
                      }}
                      disabled={addingGame}
                    >
                      {game.image && (
                        <img src={game.image} alt="" />
                      )}

                      <span>{game.name}</span>
                      <small>App ID: {game.appId}</small>
                    </button>
                  ))}
                </div>
              )}

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
                disabled={!gamePreview || addingGame || !selectedOrganizationId}
              >
                {addingGame ? "Submitting..." : "Submit for Approval"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default MyGames;