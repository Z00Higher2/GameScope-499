import { useEffect, useState } from "react";

import Dashboard from "./components/Dashboard";
import Analytics from "./components/Analytics";
import Reviews from "./components/Reviews";
import Issues from "./components/Issues";
import Intro from "./components/Intro";
import Settings from "./components/Settings";
import PlayerHome from "./components/PlayerHome";
import type { GameAnalysis } from "./api";

import "./App.css";

import type { Page, Mode, AccentColor } from "./type";

export type { Page, Mode, AccentColor } from "./type";

const SETTINGS_KEY = "gamescope-settings";

const ACCENT_VALUES: Record<
  AccentColor,
  { accent: string; strong: string }
> = {
  purple: {
    accent: "#7065ee",
    strong: "#8b80ff",
  },
  blue: {
    accent: "#4388ff",
    strong: "#70a5ff",
  },
  green: {
    accent: "#20a878",
    strong: "#43c995",
  },
};

function getSavedAccentColor(): AccentColor {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);

    if (saved) {
      const settings = JSON.parse(saved);

      if (
        ["purple", "blue", "green"].includes(
          settings.accentColor
        )
      ) {
        return settings.accentColor as AccentColor;
      }
    }
  } catch {
    // Use purple if saved settings are invalid.
  }

  return "purple";
}

function App() {
  // Dark / light mode
  const [darkMode, setDarkMode] = useState(
    () =>
      localStorage.getItem("gamescope-dark-mode") === "true"
  );

  useEffect(() => {
    localStorage.setItem(
      "gamescope-dark-mode",
      String(darkMode)
    );
  }, [darkMode]);

  // Global accent color
  const [accentColor, setAccentColor] =
    useState<AccentColor>(getSavedAccentColor);

  // Player / developer mode
  const [mode, setMode] = useState<Mode>(() =>
    localStorage.getItem("gamescope-mode") === "player"
      ? "player"
      : "developer"
  );

  useEffect(() => {
    localStorage.setItem("gamescope-mode", mode);
  }, [mode]);

  // Intro screen
  const [showIntro, setShowIntro] = useState(
    () =>
      sessionStorage.getItem("gamescope-show-intro") !==
      "false"
  );

  // Current page
  const [currentPage, setCurrentPage] =
    useState<Page>(() =>
      localStorage.getItem("gamescope-mode") === "player"
        ? "player"
        : "dashboard"
    );

  // Shared analysis state
  const [analyzed, setAnalyzed] = useState(false);
  const [analyzedAppId, setAnalyzedAppId] = useState("");

  const [analysis, setAnalysis] =
    useState<GameAnalysis | null>(null);

  // Get started
  const handleGetStarted = () => {
    setShowIntro(false);

    sessionStorage.setItem(
      "gamescope-show-intro",
      "false"
    );

    const destination: Page =
      mode === "player" ? "player" : "dashboard";

    setCurrentPage(destination);

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  };

  // Logo click
  const handleLogoClick = () => {
    setShowIntro(true);

    sessionStorage.setItem(
      "gamescope-show-intro",
      "true"
    );

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "smooth",
    });
  };

  // Analyze game from Player Home
  const handleAnalyzeGame = (appId: string) => {
    setAnalyzedAppId(appId);
    setAnalyzed(true);
    setCurrentPage("dashboard");

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  };

  // Shared page props
  const sharedProps = {
    darkMode,
    setDarkMode,
    currentPage,
    setCurrentPage,
    onLogoClick: handleLogoClick,
    mode,
    setMode,
  };

  const accentValues = ACCENT_VALUES[accentColor];

  return (
    <div
      className={`app-container ${
        darkMode ? "dark-mode" : ""
      } ${
        mode === "player"
          ? "player-mode"
          : "developer-mode"
      }`}
      data-accent={accentColor}
      style={
        {
          "--accent-color": accentValues.accent,
          "--accent-strong": accentValues.strong,
        } as React.CSSProperties
      }
    >
      {showIntro ? (
        <Intro
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          mode={mode}
          setMode={setMode}
          onGetStarted={handleGetStarted}
        />
      ) : (
        <>
          {/* Player Home */}
          {currentPage === "player" && (
            <PlayerHome
              darkMode={darkMode}
              setDarkMode={setDarkMode}
              currentPage={currentPage}
              setCurrentPage={setCurrentPage}
              onLogoClick={handleLogoClick}
              mode={mode}
              onAnalyzeGame={handleAnalyzeGame}
            />
          )}

          {/* Developer Dashboard */}
          {currentPage === "dashboard" && (
            <Dashboard
              {...sharedProps}
              analyzed={analyzed}
              setAnalyzed={setAnalyzed}
              analyzedAppId={analyzedAppId}
              setAnalyzedAppId={setAnalyzedAppId}
              analysis={analysis}
              setAnalysis={setAnalysis}
            />
          )}

          {/* Reviews */}
          {currentPage === "reviews" && (
            <Reviews
              {...sharedProps}
              analyzed={analyzed}
              analyzedAppId={analyzedAppId}
              analysis={analysis}
            />
          )}

          {/* Analytics */}
          {currentPage === "analytics" && (
            <Analytics
              {...sharedProps}
              analyzed={analyzed}
              analyzedAppId={analyzedAppId}
              analysis={analysis}
            />
          )}

          {/* Issues */}
          {currentPage === "issues" && (
            <Issues
              {...sharedProps}
              analyzed={analyzed}
              analyzedAppId={analyzedAppId}
            />
          )}

          {/* Settings */}
          {currentPage === "settings" && (
            <Settings
              {...sharedProps}
              accentColor={accentColor}
              setAccentColor={setAccentColor}
            />
          )}
        </>
      )}
    </div>
  );
}

export default App;
