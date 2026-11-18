
import { useCallback, useEffect, useRef, useState } from "react";
import Navbar from "./Navbar";
import "./Settings.css";
import type { AccentColor } from "../App";
import type { Page, Mode } from "../type";
import {
  DEFAULT_PREFERENCES,
  SETTINGS_KEY,
  loadPreferences,
} from "../preferences";
import type {
  Preferences,
  ReviewSort,
  Sentiment,
} from "../preferences";
import {
  getSteamAccount,
  startSteamLink,
  unlinkSteamAccount,
} from "../api";
import type { SteamAccount } from "../api";

const FAVORITES_KEY = "gamescope-favorite-games";

const GENRES = [
  "Action",
  "RPG",
  "Strategy",
  "Indie",
  "Simulation",
  "Adventure",
];

function loadFavorites(): string[] {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    const parsed = stored ? JSON.parse(stored) : [];

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type CategoryId =
  | "appearance"
  | "reviews"
  | "analysis"
  | "dashboard"
  | "data"
  | "exports"
  | "steam"
  | "players"
  | "privacy"
  | "about";

const CATEGORIES: {
  id: CategoryId;
  label: string;
  help: string;
  playerOnly?: boolean;
}[] = [
  { id: "appearance", label: "Appearance", help: "Personalize the interface." },
  { id: "reviews", label: "Reviews", help: "Set your default review browsing options." },
  { id: "analysis", label: "Analysis", help: "Configure review and issue-detection thresholds." },
  { id: "dashboard", label: "Dashboard", help: "Choose your preferred starting point and display options." },
  { id: "data", label: "Data", help: "Set preferences for collecting game reviews." },
  { id: "exports", label: "Export", help: "Choose what the Issues page's exported report includes." },
  { id: "steam", label: "Steam", help: "Connect your Steam account to GameScope.", playerOnly: true },
  { id: "players", label: "Player", help: "Save games and personalize future discovery features.", playerOnly: true },
  { id: "privacy", label: "Privacy", help: "Manage locally stored GameScope preferences." },
  { id: "about", label: "About", help: "Project and data source information." },
];

const SENTIMENT_OPTIONS: [string, string][] = [
  ["all", "All reviews"],
  ["positive", "Positive"],
  ["negative", "Negative"],
];

interface SettingsProps {
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  currentPage: Page;
  setCurrentPage: React.Dispatch<React.SetStateAction<Page>>;
  onLogoClick: () => void;
  accentColor: AccentColor;
  mode: Mode;
  setAccentColor: React.Dispatch<
    React.SetStateAction<AccentColor>
  >;
  setMode: React.Dispatch<React.SetStateAction<Mode>>;
  isLoggedIn?: boolean;
  accountEmail?: string;
  onLogout?: () => void;

  // Retained for compatibility with App.tsx.
  steamConnected: boolean;
  onSteamConnect: () => void;
  onSteamDisconnect: () => void;
  isAdmin?: boolean;
}

function Settings({
  darkMode,
  setDarkMode,
  currentPage,
  setCurrentPage,
  onLogoClick,
  accentColor,
  setAccentColor,
  mode,
  setMode,
  isLoggedIn = false,
  accountEmail = "",
  onLogout,
  isAdmin = false,
}: SettingsProps) {
  const [preferences, setPreferences] =
    useState<Preferences>(loadPreferences);

  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  const [favoriteInput, setFavoriteInput] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const [category, setCategory] = useState<CategoryId>("appearance");
  const [help, setHelp] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  // Real Steam account connection
  const [linkedSteamAccount, setLinkedSteamAccount] =
    useState<SteamAccount | null>(null);

  const [steamLoading, setSteamLoading] = useState(true);
  const [steamError, setSteamError] = useState("");
  const [steamDisconnecting, setSteamDisconnecting] = useState(false);
  const [steamMessage, setSteamMessage] = useState("");

  const isPlayer = mode === "player";
  const categories = CATEGORIES.filter(
    (item) => isPlayer || !item.playerOnly
  );
  const active =
    categories.find((item) => item.id === category) ?? categories[0];

  useEffect(() => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify(preferences)
    );
  }, [preferences]);

  useEffect(() => {
    localStorage.setItem(
      FAVORITES_KEY,
      JSON.stringify(favorites)
    );
  }, [favorites]);

  useEffect(() => {
    if (!savedMessage) return;

    const timer = window.setTimeout(() => setSavedMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [savedMessage]);

  // Load the linked Steam account from the backend.
  useEffect(() => {
    if (!isLoggedIn) {
      setLinkedSteamAccount(null);
      setSteamLoading(false);
      setSteamError("");
      return;
    }

    let cancelled = false;

    const loadSteamAccount = async () => {
      setSteamLoading(true);
      setSteamError("");

      try {
        const response = await getSteamAccount();

        if (!cancelled) {
          setLinkedSteamAccount(response.steam_account);
        }
      } catch (error) {
        if (!cancelled) {
          setSteamError(
            error instanceof Error
              ? error.message
              : "Unable to load your Steam account."
          );
        }
      } finally {
        if (!cancelled) {
          setSteamLoading(false);
        }
      }
    };

    void loadSteamAccount();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, accountEmail]);

  // Up/down chevrons beside the list show when there's more to scroll to
  const updateScrollHints = useCallback(() => {
    const list = listRef.current;
    if (!list) return;

    setCanScrollUp(list.scrollTop > 2);
    setCanScrollDown(
      list.scrollTop + list.clientHeight < list.scrollHeight - 2
    );
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
    updateScrollHints();
  }, [active.id, updateScrollHints]);

  useEffect(() => {
    updateScrollHints();
  }, [favorites.length, linkedSteamAccount, steamLoading, updateScrollHints]);

  useEffect(() => {
    window.addEventListener("resize", updateScrollHints);
    return () => window.removeEventListener("resize", updateScrollHints);
  }, [updateScrollHints]);

  // Disconnect the actual Steam account.
  const handleDisconnectSteam = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to disconnect your Steam account from GameScope?"
    );

    if (!confirmed) return;

    setSteamDisconnecting(true);
    setSteamError("");
    setSteamMessage("");

    try {
      const response = await unlinkSteamAccount();

      setLinkedSteamAccount(null);

      setSteamMessage(
        response.unlinked
          ? "Your Steam account has been disconnected successfully."
          : "No Steam account was linked to your account."
      );
    } catch (error) {
      setSteamError(
        error instanceof Error
          ? error.message
          : "Unable to disconnect your Steam account."
      );
    } finally {
      setSteamDisconnecting(false);
    }
  };

  const updatePreference = <K extends keyof Preferences>(
    key: K,
    value: Preferences[K]
  ) => {
    setPreferences((previous) => ({
      ...previous,
      [key]: value,
    }));
    setSavedMessage("Preferences saved locally.");
  };

  const addFavorite = () => {
    const game = favoriteInput.trim();

    if (!game) return;

    if (
      favorites.some(
        (favorite) => favorite.toLowerCase() === game.toLowerCase()
      )
    ) {
      setSavedMessage("That game is already in your saved list.");
      return;
    }

    setFavorites((previous) => [...previous, game]);
    setFavoriteInput("");
    setSavedMessage("Game added to your saved list.");
  };

  const removeFavorite = (game: string) => {
    setFavorites((previous) =>
      previous.filter((item) => item !== game)
    );
    setSavedMessage("Game removed from your saved list.");
  };

  const exportPreferences = () => {
    const exportData = {
      application: "GameScope",
      exportedAt: new Date().toISOString(),
      preferences,
      favoriteGames: favorites,
    };

    const blob = new Blob(
      [JSON.stringify(exportData, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "gamescope-settings.json";
    link.click();

    URL.revokeObjectURL(url);
    setSavedMessage("Settings export started.");
  };

  const clearRecentHistory = () => {
    // Only remove the dedicated recent-history key.
    // Do not clear all localStorage or the saved theme.
    localStorage.removeItem("gamescope-recent-games");
    setSavedMessage("Recent game history cleared, if present.");
  };

  const resetPreferences = () => {
    setPreferences({ ...DEFAULT_PREFERENCES });
    setAccentColor("purple");
    setSavedMessage("Preferences restored to defaults.");
  };

  const toggleGenre = (genre: string) => {
    setPreferences((previous) => ({
      ...previous,
      preferredGenres: previous.preferredGenres.includes(genre)
        ? previous.preferredGenres.filter((item) => item !== genre)
        : [...previous.preferredGenres, genre],
    }));
    setSavedMessage("Genre preferences updated.");
  };

  const showHelp = (event: React.SyntheticEvent) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-help]"
    );
    setHelp(row?.dataset.help ?? "");
  };

  // Up/down arrow keys move between rows, like a game menu
  const moveSelection = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    const controls = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        ".term-control:not(:disabled)"
      )
    );
    const current = controls.indexOf(document.activeElement as HTMLElement);
    if (current === -1) return;

    event.preventDefault();
    controls[current + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
  };

  const scrollList = (direction: -1 | 1) => {
    listRef.current?.scrollBy({ top: direction * 160, behavior: "smooth" });
  };

  const renderRows = () => {
    switch (active.id) {
      case "appearance":
        return (
          <>
            <ChoiceRow
              label="Interface theme"
              help="Choose a light or dark workspace."
              value={darkMode ? "dark" : "light"}
              options={[
                ["dark", "Dark"],
                ["light", "Light"],
              ]}
              onChange={(value) => setDarkMode(value === "dark")}
            />
            <ChoiceRow
              label="Accent color"
              help="Choose your interface highlight color."
              value={accentColor}
              options={[
                ["purple", "Purple"],
                ["blue", "Blue"],
                ["green", "Green"],
              ]}
              onChange={(value) => {
                const color = value as AccentColor;

                setAccentColor(color);
                updatePreference("accentColor", color);
              }}
            />
            <ToggleRow
              label="Animations"
              help="Enable interface transitions and motion effects."
              checked={preferences.animations}
              onChange={(value) => updatePreference("animations", value)}
            />
            <ToggleRow
              label="Compact layout"
              help="Reduce spacing between settings and controls."
              checked={preferences.compactLayout}
              onChange={(value) => updatePreference("compactLayout", value)}
            />
          </>
        );

      case "reviews":
        return (
          <>
            <ChoiceRow
              label="Default sentiment"
              help="Which review sentiment the Reviews page selects first."
              value={preferences.defaultSentiment}
              options={SENTIMENT_OPTIONS}
              onChange={(value) =>
                updatePreference("defaultSentiment", value as Sentiment)
              }
            />
            <ChoiceRow
              label="Default sorting"
              help="The order the Reviews page starts in."
              value={preferences.defaultSort}
              options={[
                ["helpful", "Most helpful"],
                ["quality", "Highest quality"],
                ["playtime", "Most playtime"],
                ["newest", "Newest first"],
                ["oldest", "Oldest first"],
              ]}
              onChange={(value) =>
                updatePreference("defaultSort", value as ReviewSort)
              }
            />
            <ToggleRow
              label="Hide low-quality reviews"
              help="Hide reviews rated low quality on the Reviews page."
              checked={preferences.hideLowQuality}
              onChange={(value) => updatePreference("hideLowQuality", value)}
            />
          </>
        );

      case "analysis":
        return (
          <>
            <SliderRow
              label="Minimum review length"
              help="Hide reviews shorter than this many words on the Reviews page."
              value={preferences.minimumReviewLength}
              min={1}
              max={500}
              barMax={100}
              unit="words"
              onChange={(value) =>
                updatePreference("minimumReviewLength", value)
              }
            />
            <SliderRow
              label="Minimum playtime"
              help="Hide reviews written with fewer hours played than this on the Reviews page."
              value={preferences.minimumPlaytime}
              min={0}
              max={10000}
              barMax={100}
              unit="hrs"
              onChange={(value) => updatePreference("minimumPlaytime", value)}
            />
            <SliderRow
              label="Issue mention threshold"
              help="Minimum reviews complaining about a topic before it appears on the Issues page."
              value={preferences.minimumIssueMentions}
              min={1}
              max={100000}
              barMax={50}
              unit="mentions"
              onChange={(value) =>
                updatePreference("minimumIssueMentions", value)
              }
            />
            <ChoiceRow
              label="Issue detection sentiment"
              help="Choose which sentiment should be considered by the analysis pipeline."
              value={preferences.issueSentiment}
              options={SENTIMENT_OPTIONS}
              onChange={(value) =>
                updatePreference("issueSentiment", value as Sentiment)
              }
            />
          </>
        );

      case "dashboard":
        return (
          <>
            <ChoiceRow
              label="Preferred landing page"
              help="Choose which analysis page you prefer to open first."
              value={preferences.defaultPage}
              options={[
                ["dashboard", "Dashboard"],
                ["analytics", "Analytics"],
                ["issues", "Issues"],
                ["reviews", "Reviews"],
              ]}
              onChange={(value) =>
                updatePreference(
                  "defaultPage",
                  value as Preferences["defaultPage"]
                )
              }
            />
            <ToggleRow
              label="Summary cards"
              help="Preference for showing top-level game statistics."
              checked={preferences.showSummaryCards}
              onChange={(value) => updatePreference("showSummaryCards", value)}
            />
            <ToggleRow
              label="Charts and visualizations"
              help="Preference for displaying analytics charts."
              checked={preferences.showCharts}
              onChange={(value) => updatePreference("showCharts", value)}
            />
          </>
        );

      case "data":
        return (
          <>
            <ChoiceRow
              label="Review collection size"
              help="How many reviews to collect from Steam when a game is analyzed or re-analyzed."
              value={String(preferences.reviewLimit)}
              options={[
                ["100", "100"],
                ["500", "500"],
                ["1000", "1,000"],
                ["5000", "5,000"],
              ]}
              meter
              onChange={(value) =>
                updatePreference("reviewLimit", Number(value))
              }
            />
            <InfoRow
              label="Review language"
              help="Topic detection only understands English, so the junk filter removes reviews in other languages."
              value="English"
            />
            <ChoiceRow
              label="Review time range"
              help="Only use reviews posted in this time range, on every page."
              value={preferences.reviewTimeRange}
              options={[
                ["all", "All time"],
                ["7", "Last 7 days"],
                ["30", "Last 30 days"],
                ["90", "Last 90 days"],
              ]}
              onChange={(value) => updatePreference("reviewTimeRange", value)}
            />
            <InfoRow
              label="Data source"
              help="GameScope currently targets Steam review data. Collection and refresh status depend on backend integration."
              value="Steam"
            />
          </>
        );

      case "exports":
        return (
          <>
            <ToggleRow
              label="Include reviews"
              help="Include review text and available review metadata in exports."
              checked={preferences.exportReviews}
              onChange={(value) => updatePreference("exportReviews", value)}
            />
            <ToggleRow
              label="Include issue summaries"
              help="Include detected issue names, counts, and statuses."
              checked={preferences.exportIssues}
              onChange={(value) => updatePreference("exportIssues", value)}
            />
            <ToggleRow
              label="Include statistics"
              help="Include sentiment totals and summary statistics."
              checked={preferences.exportStatistics}
              onChange={(value) => updatePreference("exportStatistics", value)}
            />
            <ActionRow
              label="Export settings"
              help="Download your saved GameScope preferences as JSON."
              action="Download"
              onClick={exportPreferences}
            />
          </>
        );

      case "steam":
        return (
          <>
            <InfoRow
              label="Connection"
              help="GameScope uses Steam OpenID to verify your Steam identity."
              value={
                steamLoading
                  ? "Checking..."
                  : steamError && !linkedSteamAccount
                    ? "Unable to verify"
                    : linkedSteamAccount
                      ? "Connected"
                      : "Not connected"
              }
            />

            {linkedSteamAccount ? (
              <>
                {linkedSteamAccount.steam_display_name && (
                  <InfoRow
                    label="Display name"
                    help="The name on your linked Steam profile."
                    value={linkedSteamAccount.steam_display_name}
                  />
                )}
                <InfoRow
                  label="Steam ID"
                  help="The ID of your linked Steam account."
                  value={linkedSteamAccount.steam_id}
                />
                {linkedSteamAccount.profile_url && (
                  <ActionRow
                    label="Steam profile"
                    help="Open your Steam profile in a new tab."
                    action="Open"
                    href={linkedSteamAccount.profile_url}
                  />
                )}
                <ActionRow
                  label="Disconnect Steam"
                  help="Unlink this Steam account from GameScope."
                  action={steamDisconnecting ? "Disconnecting..." : "Disconnect"}
                  onClick={handleDisconnectSteam}
                  disabled={steamDisconnecting}
                />
              </>
            ) : (
              <ActionRow
                label="Connect Steam"
                help={
                  isLoggedIn
                    ? "You will be redirected to Steam to authorize the connection."
                    : "Log in to connect a Steam account."
                }
                action="Connect"
                onClick={startSteamLink}
                disabled={!isLoggedIn || steamLoading}
              />
            )}
          </>
        );

      case "players":
        return (
          <>
            <Row
              label="Add a favorite game"
              help="Add a game name to your locally saved list."
            >
              <input
                className="term-control term-input"
                value={favoriteInput}
                onChange={(event) => setFavoriteInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addFavorite();
                }}
                placeholder="Game name..."
                aria-label="Game name"
              />
              <button
                type="button"
                className="term-action"
                onClick={addFavorite}
              >
                Add
              </button>
            </Row>

            {favorites.length > 0 ? (
              favorites.map((game) => (
                <ActionRow
                  key={game}
                  label={game}
                  help="Saved in this browser."
                  action="Remove"
                  actionLabel={`Remove ${game}`}
                  onClick={() => removeFavorite(game)}
                />
              ))
            ) : (
              <InfoRow
                label="Saved games"
                help="No saved games yet. Add a game above to get started."
                value="None yet"
              />
            )}

            <ToggleRow
              label="Hide games I already own"
              help="Preference for future game discovery and recommendations."
              checked={preferences.hideOwnedGames}
              onChange={(value) => updatePreference("hideOwnedGames", value)}
            />
            <ChoiceRow
              label="Recommendation priority"
              help="Choose what future game recommendations should emphasize."
              value={preferences.recommendationPriority}
              options={[
                ["quality", "Review quality"],
                ["sentiment", "Sentiment"],
                ["issues", "Common issues"],
              ]}
              onChange={(value) =>
                updatePreference(
                  "recommendationPriority",
                  value as Preferences["recommendationPriority"]
                )
              }
            />

            <p className="term-group">Preferred genres</p>

            {GENRES.map((genre) => (
              <ToggleRow
                key={genre}
                label={genre}
                help="Select genres for future discovery features."
                checked={preferences.preferredGenres.includes(genre)}
                onChange={() => toggleGenre(genre)}
              />
            ))}
          </>
        );

      case "privacy":
        return (
          <>
            <InfoRow
              label="Local preferences"
              help="Theme, review preferences, and saved games may be stored in this browser."
              value="Local"
            />
            <ActionRow
              label="Clear recent game history"
              help="Remove the recent-game history key if your app uses it. This does not remove your saved favorites."
              action="Clear"
              onClick={clearRecentHistory}
            />
            <ActionRow
              label="Export your preferences"
              help="Download a JSON copy of your settings and saved games."
              action="Download"
              onClick={exportPreferences}
            />
            <ToggleRow
              label="Notifications"
              help="Save your preference for future in-app notifications."
              checked={preferences.notifications}
              onChange={(value) => updatePreference("notifications", value)}
            />
          </>
        );

      case "about":
        return (
          <>
            <InfoRow
              label="Application"
              help="GameScope, the player feedback analyzer."
              value="Web app"
            />
            <InfoRow
              label="Review source"
              help="Reviews are collected from Steam."
              value="Steam"
            />
            <InfoRow
              label="Focus"
              help="What GameScope looks at in every review."
              value="Reviews · sentiment · issues"
            />
          </>
        );
    }
  };

  const notes: Partial<Record<CategoryId, React.ReactNode>> = {
    analysis:
      "Review length and playtime apply on the Reviews page, and the issue mention threshold applies on the Issues page. The issue detection sentiment is saved as a preference but not applied yet.",
    dashboard:
      "Your current navigation still opens the Dashboard after Get Started. The default-page preference must be connected to App.tsx before it changes navigation behavior.",
    exports:
      "These choose what goes into Export report on the Issues page. Export settings downloads your settings, not the game's reviews.",
    steam: (
      <>
        {steamError && <span role="alert">{steamError} </span>}
        {steamMessage && <span role="status">{steamMessage} </span>}
        GameScope never asks for your Steam password.
      </>
    ),
    players:
      "Favorite games and genres are saved in this browser. They are not synced across devices or user accounts.",
    privacy:
      "Notifications are a saved preference only. This frontend does not currently send notifications or manage account data.",
    about:
      "GameScope helps players understand community feedback before purchasing a game and helps developers identify player sentiment, recurring issues, and areas for improvement.",
  };

  return (
    // Green for players, purple for developers
    <div
      className={`settings-page ${isPlayer ? "term-player" : "term-dev"} ${
        !preferences.animations ? "settings-reduced-motion" : ""
      } ${preferences.compactLayout ? "settings-compact" : ""}`}
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
        accountEmail={accountEmail}
        onLogout={onLogout}
        isAdmin={isAdmin}
      />

      <main className="term-main">
        <header className="term-title">
          <span>GameScope</span>
          <h1>SETTINGS</h1>
          <span>{isPlayer ? "Player mode" : "Developer mode"}</span>
        </header>

        <section className="term-panel" aria-label={`${active.label} settings`}>
          <div className="term-list-wrap">
            <button
              type="button"
              className={`term-scroll term-scroll-up ${canScrollUp ? "show" : ""}`}
              onClick={() => scrollList(-1)}
              tabIndex={-1}
              aria-hidden="true"
            >
              <svg viewBox="0 0 16 10">
                <path d="M1 9 8 2l7 7" />
              </svg>
            </button>

            <div
              ref={listRef}
              className="term-list"
              onScroll={updateScrollHints}
              onMouseOver={showHelp}
              onFocus={showHelp}
              onMouseLeave={() => setHelp("")}
              onKeyDown={moveSelection}
            >
              {renderRows()}
            </div>

            <button
              type="button"
              className={`term-scroll term-scroll-down ${canScrollDown ? "show" : ""}`}
              onClick={() => scrollList(1)}
              tabIndex={-1}
              aria-hidden="true"
            >
              <svg viewBox="0 0 16 10">
                <path d="M1 1l7 7 7-7" />
              </svg>
            </button>
          </div>

          <p className="term-help">{help || active.help}</p>

          {notes[active.id] && (
            <p className="term-note">{notes[active.id]}</p>
          )}
        </section>

        <nav className="term-menu" aria-label="Settings categories">
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === active.id ? "active" : ""}
              aria-current={item.id === active.id ? "true" : undefined}
              onClick={() => {
                setCategory(item.id);
                setHelp("");
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <footer className="term-footer">
          <span className="term-status" role="status">
            {savedMessage || "Saved in this browser"}
          </span>

          <div className="term-footer-actions">
            <button type="button" onClick={resetPreferences}>
              Defaults
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(isPlayer ? "player" : "dashboard")}
            >
              Back
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}

/* Menu rows: the label on the left, the value on the right. The arrows
   beside a value only show on the selected row. */

function Row({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div className="term-row" data-help={help}>
      <span className="term-label">{label}</span>
      <div className="term-value">{children}</div>
    </div>
  );
}

const SEGMENTS = 16;

function Meter({ filled }: { filled: number }) {
  const count = Math.round(Math.min(1, Math.max(0, filled)) * SEGMENTS);

  return (
    <span className="term-meter" aria-hidden="true">
      {Array.from({ length: SEGMENTS }, (_, index) => (
        <span key={index} className={index < count ? "on" : ""} />
      ))}
    </span>
  );
}

function StepArrow({
  direction,
  onClick,
  disabled = false,
}: {
  direction: -1 | 1;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="term-arrow"
      onClick={onClick}
      disabled={disabled}
      tabIndex={-1}
      aria-hidden="true"
    >
      <svg viewBox="0 0 10 12">
        <path d={direction < 0 ? "M9 1 2 6l7 5Z" : "M1 1l7 5-7 5Z"} />
      </svg>
    </button>
  );
}

const onStepKeys =
  (step: (direction: -1 | 1) => void) =>
  (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    event.preventDefault();
    step(event.key === "ArrowLeft" ? -1 : 1);
  };

function ChoiceRow({
  label,
  help,
  value,
  options,
  onChange,
  meter = false,
}: {
  label: string;
  help: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
  meter?: boolean;
}) {
  const index = Math.max(
    0,
    options.findIndex(([optionValue]) => optionValue === value)
  );

  const step = (direction: -1 | 1) => {
    const next = (index + direction + options.length) % options.length;
    onChange(options[next][0]);
  };

  return (
    <Row label={label} help={help}>
      <StepArrow direction={-1} onClick={() => step(-1)} />
      <button
        type="button"
        className={`term-control ${meter ? "term-slider" : "term-choice"}`}
        onClick={() => step(1)}
        onKeyDown={onStepKeys(step)}
        aria-label={`${label}: ${options[index][1]}`}
      >
        {meter ? <Meter filled={(index + 1) / options.length} /> : options[index][1]}
      </button>
      <StepArrow direction={1} onClick={() => step(1)} />
      {meter && <span className="term-readout">{options[index][1]}</span>}
    </Row>
  );
}

function ToggleRow({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const flip = () => onChange(!checked);

  return (
    <Row label={label} help={help}>
      <StepArrow direction={-1} onClick={flip} />
      <button
        type="button"
        className="term-control term-choice"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={flip}
        onKeyDown={onStepKeys(flip)}
      >
        {checked ? "On" : "Off"}
      </button>
      <StepArrow direction={1} onClick={flip} />
    </Row>
  );
}

function SliderRow({
  label,
  help,
  value,
  min,
  max,
  barMax,
  unit,
  onChange,
}: {
  label: string;
  help: string;
  value: number;
  min: number;
  max: number;
  barMax: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  const set = (next: number) =>
    onChange(Math.min(max, Math.max(min, Math.round(next))));

  return (
    <Row label={label} help={help}>
      <StepArrow
        direction={-1}
        onClick={() => set(value - 1)}
        disabled={value <= min}
      />
      <div
        className="term-control term-slider"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value} ${unit}`}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

          event.preventDefault();
          const size = event.shiftKey ? 10 : 1;
          set(value + (event.key === "ArrowLeft" ? -size : size));
        }}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          set(min + ((event.clientX - box.left) / box.width) * (barMax - min));
        }}
      >
        <Meter filled={(value - min) / (barMax - min)} />
      </div>
      <StepArrow
        direction={1}
        onClick={() => set(value + 1)}
        disabled={value >= max}
      />
      <span className="term-readout">
        {value.toLocaleString()} {unit}
      </span>
    </Row>
  );
}

function InfoRow({
  label,
  help,
  value,
}: {
  label: string;
  help: string;
  value: string;
}) {
  return (
    <Row label={label} help={help}>
      <span className="term-static">{value}</span>
    </Row>
  );
}

function ActionRow({
  label,
  help,
  action,
  actionLabel,
  onClick,
  href,
  disabled = false,
}: {
  label: string;
  help: string;
  action: string;
  actionLabel?: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}) {
  return (
    <Row label={label} help={help}>
      {href ? (
        <a
          className="term-control term-action"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {action}
        </a>
      ) : (
        <button
          type="button"
          className="term-control term-action"
          onClick={onClick}
          disabled={disabled}
          aria-label={actionLabel}
        >
          {action}
        </button>
      )}
    </Row>
  );
}

export default Settings;
