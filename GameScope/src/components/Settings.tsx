
import { useEffect, useState } from "react";
import Navbar from "./Navbar";
import "./Settings.css";
import type { AccentColor } from "../App";

type Page =
  | "dashboard"
  | "reviews"
  | "issues"
  | "analytics"
  | "settings";

type Sentiment = "all" | "positive" | "negative";
type ReviewSort =
  | "helpful"
  | "quality"
  | "playtime"
  | "newest"
  | "oldest";

interface Preferences {
  animations: boolean;
  accentColor: string;
  compactLayout: boolean;

  defaultSentiment: Sentiment;
  defaultSort: ReviewSort;
  hideLowQuality: boolean;

  minimumReviewLength: number;
  minimumPlaytime: number;
  minimumIssueMentions: number;
  issueSentiment: Sentiment;

  defaultPage: "dashboard" | "analytics" | "issues" | "reviews";
  showSummaryCards: boolean;
  showCharts: boolean;

  reviewLimit: number;
  reviewLanguage: string;
  reviewTimeRange: string;

  exportReviews: boolean;
  exportIssues: boolean;
  exportStatistics: boolean;

  preferredGenres: string[];
  hideOwnedGames: boolean;
  recommendationPriority: "sentiment" | "quality" | "issues";

  notifications: boolean;
}

const DEFAULT_PREFERENCES: Preferences = {
  animations: true,
  accentColor: "purple",
  compactLayout: false,

  defaultSentiment: "all",
  defaultSort: "helpful",
  hideLowQuality: false,

  minimumReviewLength: 5,
  minimumPlaytime: 0,
  minimumIssueMentions: 10,
  issueSentiment: "negative",

  defaultPage: "dashboard",
  showSummaryCards: true,
  showCharts: true,

  reviewLimit: 1000,
  reviewLanguage: "english",
  reviewTimeRange: "all",

  exportReviews: true,
  exportIssues: true,
  exportStatistics: true,

  preferredGenres: [],
  hideOwnedGames: false,
  recommendationPriority: "quality",

  notifications: false,
};

const SETTINGS_KEY = "gamescope-settings";
const FAVORITES_KEY = "gamescope-favorite-games";

function loadPreferences(): Preferences {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);

    if (!stored) return DEFAULT_PREFERENCES;

    return {
      ...DEFAULT_PREFERENCES,
      ...JSON.parse(stored),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function loadFavorites(): string[] {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    const parsed = stored ? JSON.parse(stored) : [];

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface SettingsProps {
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  currentPage: Page;
  setCurrentPage: React.Dispatch<React.SetStateAction<Page>>;
  onLogoClick: () => void;
  accentColor: AccentColor;
  setAccentColor: React.Dispatch<
    React.SetStateAction<AccentColor>
  >;
}

function Settings({
  darkMode,
  setDarkMode,
  currentPage,
  setCurrentPage,
  onLogoClick,
  accentColor,
  setAccentColor,
}: SettingsProps) {
  const [preferences, setPreferences] =
    useState<Preferences>(loadPreferences);

  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  const [favoriteInput, setFavoriteInput] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

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

  return (
    <div
      className={`settings-page ${
        darkMode ? "settings-dark" : "settings-light"
      } ${
        !preferences.animations ? "settings-reduced-motion" : ""
      } settings-accent-${preferences.accentColor} ${
        preferences.compactLayout ? "settings-compact" : ""
      }`}
    >
      <Navbar
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        onLogoClick={onLogoClick}
      />

      <main className="settings-main">
        <header className="settings-header">
          <div className="settings-eyebrow">
            <span className="settings-eyebrow-dot" />
            WORKSPACE CONFIGURATION
          </div>

          <h1>
            Settings<span>.</span>
          </h1>

          <p>
            Configure your workspace, review analysis, and
            GameScope experience.
          </p>
        </header>

        {savedMessage && (
          <div className="settings-save-message" role="status">
            <span>✓</span> {savedMessage}
          </div>
        )}

        {/* 1. APPEARANCE */}

        <section className="settings-section" id="appearance">
          <div className="settings-section-heading">
            <div className="settings-section-icon">◐</div>
            <div>
              <h2>Appearance</h2>
              <p>Personalize the interface.</p>
            </div>
          </div>

          <div className="settings-card">
            <div className="settings-row">
              <div className="settings-row-copy">
                <h3>Interface theme</h3>
                <p>Choose a light or dark workspace.</p>
              </div>

              <div className="settings-inline-actions">
                <button
                  type="button"
                  className={`settings-choice ${
                    darkMode ? "selected" : ""
                  }`}
                  onClick={() => setDarkMode(true)}
                  aria-pressed={darkMode}
                >
                  Dark
                </button>
                <button
                  type="button"
                  className={`settings-choice ${
                    !darkMode ? "selected" : ""
                  }`}
                  onClick={() => setDarkMode(false)}
                  aria-pressed={!darkMode}
                >
                  Light
                </button>
              </div>
            </div>

            <div className="settings-divider" />

            <div className="settings-row">
              <div className="settings-row-copy">
                <h3>Accent color</h3>
                <p>Choose your interface highlight color.</p>
              </div>

              <select
                className="settings-select"
                value={accentColor}
                onChange={(event) => {
                    const color = event.target.value as AccentColor;

                    setAccentColor(color);
                    updatePreference("accentColor", color);
                }}
                aria-label="Accent color"
                >
                <option value="purple">Purple</option>
                <option value="blue">Blue</option>
                <option value="green">Green</option>
            </select>
            </div>

            <div className="settings-divider" />

            <SettingToggle
              title="Animations"
              description="Enable interface transitions and motion effects."
              checked={preferences.animations}
              onChange={(value) =>
                updatePreference("animations", value)
              }
            />

            <div className="settings-divider" />

            <SettingToggle
              title="Compact layout"
              description="Reduce spacing between settings and controls."
              checked={preferences.compactLayout}
              onChange={(value) =>
                updatePreference("compactLayout", value)
              }
            />
          </div>
        </section>

        {/* 2. REVIEW PREFERENCES */}

        <section className="settings-section" id="reviews">
          <div className="settings-section-heading">
            <div className="settings-section-icon">≡</div>
            <div>
              <h2>Review Preferences</h2>
              <p>Set your default review browsing options.</p>
            </div>
          </div>

          <div className="settings-card">
            <SettingSelect
              title="Default sentiment"
              description="Which review sentiment should be selected first?"
              value={preferences.defaultSentiment}
              options={[
                ["all", "All reviews"],
                ["positive", "Positive reviews"],
                ["negative", "Negative reviews"],
              ]}
              onChange={(value) =>
                updatePreference(
                  "defaultSentiment",
                  value as Sentiment
                )
              }
            />

            <div className="settings-divider" />

            <SettingSelect
              title="Default sorting"
              description="Choose the initial order of reviews."
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

            <div className="settings-divider" />

            <SettingToggle
              title="Hide low-quality reviews"
              description="Save a preference to filter low-quality reviews when supported."
              checked={preferences.hideLowQuality}
              onChange={(value) =>
                updatePreference("hideLowQuality", value)
              }
            />
          </div>
        </section>

        {/* 3. ANALYSIS CONFIGURATION */}

        <section className="settings-section" id="analysis">
          <div className="settings-section-heading">
            <div className="settings-section-icon">⌁</div>
            <div>
              <h2>Analysis Configuration</h2>
              <p>Configure proposed review and issue-detection thresholds.</p>
            </div>
          </div>

          <div className="settings-card">
            <SettingNumber
              title="Minimum review length"
              description="Minimum word count for reviews considered in quality analysis."
              value={preferences.minimumReviewLength}
              min={1}
              max={500}
              onChange={(value) =>
                updatePreference("minimumReviewLength", value)
              }
            />

            <div className="settings-divider" />

            <SettingNumber
              title="Minimum playtime"
              description="Preferred minimum player hours for experienced-feedback filters."
              value={preferences.minimumPlaytime}
              min={0}
              max={10000}
              onChange={(value) =>
                updatePreference("minimumPlaytime", value)
              }
              suffix="hours"
            />

            <div className="settings-divider" />

            <SettingNumber
              title="Issue mention threshold"
              description="Minimum mentions before an issue is eligible to appear."
              value={preferences.minimumIssueMentions}
              min={1}
              max={100000}
              onChange={(value) =>
                updatePreference("minimumIssueMentions", value)
              }
              suffix="mentions"
            />

            <div className="settings-divider" />

            <SettingSelect
              title="Sentiment used for issue detection"
              description="Choose which sentiment should be considered by the analysis pipeline."
              value={preferences.issueSentiment}
              options={[
                ["all", "All reviews"],
                ["positive", "Positive reviews"],
                ["negative", "Negative reviews"],
              ]}
              onChange={(value) =>
                updatePreference("issueSentiment", value as Sentiment)
              }
            />
          </div>

          <p className="settings-note">
            These thresholds are saved locally as preferences. They
            will not change real analysis results until the backend
            reads and applies them.
          </p>
        </section>

        {/* 4. DASHBOARD PREFERENCES */}

        <section className="settings-section" id="dashboard">
          <div className="settings-section-heading">
            <div className="settings-section-icon">▦</div>
            <div>
              <h2>Dashboard Preferences</h2>
              <p>Choose your preferred starting point and display options.</p>
            </div>
          </div>

          <div className="settings-card">
            <SettingSelect
              title="Preferred landing page after entering"
              description="Choose which analysis page you prefer to open first."
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

            <div className="settings-divider" />

            <SettingToggle
              title="Summary cards"
              description="Preference for showing top-level game statistics."
              checked={preferences.showSummaryCards}
              onChange={(value) =>
                updatePreference("showSummaryCards", value)
              }
            />

            <div className="settings-divider" />

            <SettingToggle
              title="Charts and visualizations"
              description="Preference for displaying analytics charts."
              checked={preferences.showCharts}
              onChange={(value) =>
                updatePreference("showCharts", value)
              }
            />
          </div>

          <p className="settings-note">
            Your current navigation still opens the Dashboard after
            Get Started. The default-page preference must be connected
            to App.tsx before it changes navigation behavior.
          </p>
        </section>

        {/* 5. DATA & REFRESH */}

        <section className="settings-section" id="data">
          <div className="settings-section-heading">
            <div className="settings-section-icon">▤</div>
            <div>
              <h2>Data & Refresh</h2>
              <p>Set preferences for collecting game reviews.</p>
            </div>
          </div>

          <div className="settings-card">
            <SettingSelect
              title="Preferred review collection size"
              description="Target number of reviews for a future collection request."
              value={String(preferences.reviewLimit)}
              options={[
                ["100", "100 reviews"],
                ["500", "500 reviews"],
                ["1000", "1,000 reviews"],
                ["5000", "5,000 reviews"],
              ]}
              onChange={(value) =>
                updatePreference("reviewLimit", Number(value))
              }
            />

            <div className="settings-divider" />

            <SettingSelect
              title="Review language"
              description="Preferred language for future review collection."
              value={preferences.reviewLanguage}
              options={[
                ["english", "English"],
                ["all", "All available languages"],
                ["spanish", "Spanish"],
                ["french", "French"],
                ["german", "German"],
                ["portuguese", "Portuguese"],
              ]}
              onChange={(value) =>
                updatePreference("reviewLanguage", value)
              }
            />

            <div className="settings-divider" />

            <SettingSelect
              title="Review time range"
              description="Preferred time range for future analysis."
              value={preferences.reviewTimeRange}
              options={[
                ["all", "All available time"],
                ["7", "Last 7 days"],
                ["30", "Last 30 days"],
                ["90", "Last 90 days"],
              ]}
              onChange={(value) =>
                updatePreference("reviewTimeRange", value)
              }
            />

            <div className="settings-divider" />

            <div className="settings-row">
              <div className="settings-row-copy">
                <h3>Data source</h3>
                <p>
                  GameScope currently targets Steam review data.
                  Collection and refresh status depend on backend integration.
                </p>
              </div>
              <span className="settings-status">Steam</span>
            </div>
          </div>
        </section>

        {/* 6. EXPORT & REPORTS */}

        <section className="settings-section" id="exports">
          <div className="settings-section-heading">
            <div className="settings-section-icon">⇩</div>
            <div>
              <h2>Export & Reports</h2>
              <p>Choose what future analysis reports should include.</p>
            </div>
          </div>

          <div className="settings-card">
            <SettingToggle
              title="Include reviews"
              description="Include review text and available review metadata in exports."
              checked={preferences.exportReviews}
              onChange={(value) =>
                updatePreference("exportReviews", value)
              }
            />

            <div className="settings-divider" />

            <SettingToggle
              title="Include issue summaries"
              description="Include detected issue names, counts, and statuses."
              checked={preferences.exportIssues}
              onChange={(value) =>
                updatePreference("exportIssues", value)
              }
            />

            <div className="settings-divider" />

            <SettingToggle
              title="Include statistics"
              description="Include sentiment totals and summary statistics."
              checked={preferences.exportStatistics}
              onChange={(value) =>
                updatePreference("exportStatistics", value)
              }
            />

            <div className="settings-export-action">
              <div>
                <h3>Export settings</h3>
                <p>Download your saved GameScope preferences as JSON.</p>
              </div>
              <button
                type="button"
                className="settings-primary-button"
                onClick={exportPreferences}
              >
                Export Preferences
              </button>
            </div>
          </div>

          <p className="settings-note">
            Review and issue report exports require the actual review
            and issue data to be connected. This button exports your
            settings, not the game's reviews.
          </p>
        </section>

        {/* 7. PLAYER PREFERENCES */}

        <section className="settings-section" id="players">
          <div className="settings-section-heading">
            <div className="settings-section-icon">◇</div>
            <div>
              <h2>Player Preferences</h2>
              <p>Save games and personalize future discovery features.</p>
            </div>
          </div>

          <div className="settings-card">
            <div className="settings-row">
              <div className="settings-row-copy">
                <h3>Favorite games</h3>
                <p>Add a game name to your locally saved list.</p>
              </div>
            </div>

            <div className="settings-favorite-form">
              <input
                className="settings-input"
                value={favoriteInput}
                onChange={(event) =>
                  setFavoriteInput(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") addFavorite();
                }}
                placeholder="Enter a game name..."
                aria-label="Game name"
              />
              <button
                type="button"
                className="settings-primary-button"
                onClick={addFavorite}
              >
                Add Game
              </button>
            </div>

            {favorites.length > 0 ? (
              <div className="settings-favorite-list">
                {favorites.map((game) => (
                  <div className="settings-favorite-item" key={game}>
                    <span>🎮</span>
                    <strong>{game}</strong>
                    <button
                      type="button"
                      onClick={() => removeFavorite(game)}
                      aria-label={`Remove ${game}`}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="settings-empty">
                No saved games yet. Add a game above to get started.
              </p>
            )}

            <div className="settings-divider" />

            <SettingToggle
              title="Hide games I already own"
              description="Preference for future game discovery and recommendations."
              checked={preferences.hideOwnedGames}
              onChange={(value) =>
                updatePreference("hideOwnedGames", value)
              }
            />

            <div className="settings-divider" />

            <SettingSelect
              title="Recommendation priority"
              description="Choose what future game recommendations should emphasize."
              value={preferences.recommendationPriority}
              options={[
                ["quality", "Review quality"],
                ["sentiment", "Player sentiment"],
                ["issues", "Common player issues"],
              ]}
              onChange={(value) =>
                updatePreference(
                  "recommendationPriority",
                  value as Preferences["recommendationPriority"]
                )
              }
            />

            <div className="settings-divider" />

            <div className="settings-row settings-genres-row">
              <div className="settings-row-copy">
                <h3>Preferred genres</h3>
                <p>Select genres for future discovery features.</p>
              </div>

              <div className="settings-genre-options">
                {[
                  "Action",
                  "RPG",
                  "Strategy",
                  "Indie",
                  "Simulation",
                  "Adventure",
                ].map((genre) => (
                  <button
                    key={genre}
                    type="button"
                    className={`settings-genre ${
                      preferences.preferredGenres.includes(genre)
                        ? "selected"
                        : ""
                    }`}
                    aria-pressed={preferences.preferredGenres.includes(
                      genre
                    )}
                    onClick={() => toggleGenre(genre)}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="settings-note">
            Favorite games and genres are saved in this browser.
            They are not synced across devices or user accounts.
          </p>
        </section>

        {/* 8. PRIVACY & DATA */}

        <section className="settings-section" id="privacy">
          <div className="settings-section-heading">
            <div className="settings-section-icon">◇</div>
            <div>
              <h2>Privacy & Data</h2>
              <p>Manage locally stored GameScope preferences.</p>
            </div>
          </div>

          <div className="settings-card">
            <div className="settings-row">
              <div className="settings-row-copy">
                <h3>Local preferences</h3>
                <p>
                  Theme, review preferences, and saved games may be
                  stored in this browser.
                </p>
              </div>
              <span className="settings-status">Local</span>
            </div>

            <div className="settings-divider" />

            <div className="settings-row">
              <div className="settings-row-copy">
                <h3>Clear recent game history</h3>
                <p>
                  Remove the recent-game history key if your app uses it.
                  This does not remove your saved favorites.
                </p>
              </div>
              <button
                type="button"
                className="settings-secondary-button"
                onClick={clearRecentHistory}
              >
                Clear History
              </button>
            </div>

            <div className="settings-divider" />

            <div className="settings-row">
              <div className="settings-row-copy">
                <h3>Export your preferences</h3>
                <p>
                  Download a JSON copy of your settings and saved games.
                </p>
              </div>
              <button
                type="button"
                className="settings-secondary-button"
                onClick={exportPreferences}
              >
                Export Data
              </button>
            </div>

            <div className="settings-divider" />

            <SettingToggle
              title="Notifications"
              description="Save your preference for future in-app notifications."
              checked={preferences.notifications}
              onChange={(value) =>
                updatePreference("notifications", value)
              }
            />
          </div>

          <p className="settings-note">
            Notifications are a saved preference only. This frontend
            does not currently send notifications or manage account data.
          </p>
        </section>

        {/* 9. ABOUT */}

        <section className="settings-section" id="about">
          <div className="settings-section-heading">
            <div className="settings-section-icon">ⓘ</div>
            <div>
              <h2>About GameScope</h2>
              <p>Project and data source information.</p>
            </div>
          </div>

          <div className="settings-card settings-about-card">
            <div className="settings-about-brand">
              <div className="settings-about-logo">G</div>
              <div>
                <h3>GameScope</h3>
                <p>Player Feedback Analyzer</p>
              </div>
              <span className="settings-status">Web App</span>
            </div>

            <div className="settings-divider" />

            <p className="settings-about-description">
              GameScope helps players understand community feedback
              before purchasing a game and helps developers identify
              player sentiment, recurring issues, and areas for
              improvement.
            </p>

            <div className="settings-info-grid">
              <div>
                <span>REVIEW SOURCE</span>
                <strong>Steam</strong>
              </div>
              <div>
                <span>APPLICATION</span>
                <strong>Web application</strong>
              </div>
              <div>
                <span>FOCUS</span>
                <strong>Reviews, sentiment, and issues</strong>
              </div>
            </div>
          </div>
        </section>

        {/* RESET */}

        <footer className="settings-footer">
          <div>
            <h3>Restore default preferences</h3>
            <p>
              Reset saved configuration options. Your theme and
              favorite-game list will remain unchanged.
            </p>
          </div>

          <button
            type="button"
            className="settings-reset-button"
            onClick={resetPreferences}
          >
            Restore Defaults
          </button>
        </footer>

        <div className="settings-bottom-note">
          GAMESCOPE <span>·</span> PLAYER FEEDBACK ANALYZER
        </div>
      </main>
    </div>
  );
}

/* Reusable setting controls */

function SettingToggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>

      <button
        type="button"
        className={`settings-switch ${checked ? "switch-on" : ""}`}
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

function SettingSelect({
  title,
  description,
  value,
  options,
  onChange,
}: {
  title: string;
  description: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>

      <select
        className="settings-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([optionValue, label]) => (
          <option key={optionValue} value={optionValue}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SettingNumber({
  title,
  description,
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  title: string;
  description: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>

      <label className="settings-number-control">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (!Number.isFinite(parsed)) return;

            onChange(Math.min(max, Math.max(min, parsed)));
          }}
          aria-label={title}
        />
        {suffix && <span>{suffix}</span>}
      </label>
    </div>
  );
}

export default Settings;
