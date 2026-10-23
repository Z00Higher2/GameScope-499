
import { useEffect, useState } from "react";

import Dashboard from "./components/Dashboard";
import Analytics from "./components/Analytics";
import Reviews from "./components/Reviews";
import Issues from "./components/Issues";
import Intro from "./components/Intro";
import Settings from "./components/Settings";
import PlayerHome from "./components/PlayerHome";
import CompareGames from "./components/CompareGames";
import type { GameAnalysis } from "./api";

import "./App.css";

import type { Page, Mode, AccentColor } from "./type";

export type { Page, Mode, AccentColor } from "./type";

const SETTINGS_KEY = "gamescope-settings";

const ACCENT_VALUES: Record<
  AccentColor,
  { accent: string; strong: string }
> = {
  purple: { accent: "#7065ee", strong: "#8b80ff" },
  blue: { accent: "#4388ff", strong: "#70a5ff" },
  green: { accent: "#20a878", strong: "#43c995" },
};

function getSavedAccentColor(): AccentColor {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);

    if (saved) {
      const settings = JSON.parse(saved);

      if (["purple", "blue", "green"].includes(settings.accentColor)) {
        return settings.accentColor as AccentColor;
      }
    }
  } catch {
    // Use the default accent color.
  }

  return "purple";
}

function App() {
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("gamescope-dark-mode") === "true"
  );

  useEffect(() => {
    localStorage.setItem("gamescope-dark-mode", String(darkMode));
  }, [darkMode]);

  const [accentColor, setAccentColor] =
    useState<AccentColor>(getSavedAccentColor);

  const [mode, setMode] = useState<Mode>(() =>
    localStorage.getItem("gamescope-mode") === "player"
      ? "player"
      : "developer"
  );

  useEffect(() => {
    localStorage.setItem("gamescope-mode", mode);
  }, [mode]);

  const [showIntro, setShowIntro] = useState(
    () => sessionStorage.getItem("gamescope-show-intro") !== "false"
  );

  const [currentPage, setCurrentPage] = useState<Page>(() =>
    localStorage.getItem("gamescope-mode") === "player"
      ? "player"
      : "dashboard"
  );

  // Developer analysis state
  const [developerAnalyzed, setDeveloperAnalyzed] = useState(false);
  const [developerAppId, setDeveloperAppId] = useState("");
  const [developerAnalysis, setDeveloperAnalysis] =
    useState<GameAnalysis | null>(null);

  const clearDeveloperAnalysis = () => {
    setDeveloperAnalyzed(false);
    setDeveloperAppId("");
    setDeveloperAnalysis(null);
  };

  // Player analysis state
  const [playerAnalyzed, setPlayerAnalyzed] = useState(false);
  const [playerAppId, setPlayerAppId] = useState("");
  const [playerAnalysis, setPlayerAnalysis] =
    useState<GameAnalysis | null>(null);

  const clearPlayerAnalysis = () => {
    setPlayerAnalyzed(false);
    setPlayerAppId("");
    setPlayerAnalysis(null);
  };

  // Keep this compatible with React.Dispatch<SetStateAction<Mode>>.
  const handleModeChange: React.Dispatch<
    React.SetStateAction<Mode>
  > = (nextMode) => {
    const resolvedMode =
      typeof nextMode === "function"
        ? nextMode(mode)
        : nextMode;

    if (resolvedMode === mode) return;

    if (mode === "developer") {
      clearDeveloperAnalysis();
    } else {
      clearPlayerAnalysis();
    }

    setMode(resolvedMode);
    setCurrentPage(
      resolvedMode === "player" ? "player" : "dashboard"
    );
    setShowIntro(false);

    sessionStorage.setItem("gamescope-show-intro", "false");

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  };

  const handleGetStarted = () => {
    setShowIntro(false);
    sessionStorage.setItem("gamescope-show-intro", "false");

    setCurrentPage(mode === "player" ? "player" : "dashboard");

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  };

  const handleLogoClick = () => {
    // Reset both analyses when returning to the Intro screen.
    clearDeveloperAnalysis();
    clearPlayerAnalysis();

    setShowIntro(true);
    sessionStorage.setItem("gamescope-show-intro", "true");

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "smooth",
    });
  };

  const handlePlayerAnalysis = (
    appId: string,
    result: GameAnalysis
  ) => {
    setPlayerAppId(appId);
    setPlayerAnalysis(result);
    setPlayerAnalyzed(true);
  };

  const sharedProps = {
    darkMode,
    setDarkMode,
    currentPage,
    setCurrentPage,
    onLogoClick: handleLogoClick,
    mode,
    setMode: handleModeChange,
  };

  const accentValues = ACCENT_VALUES[accentColor];

  const activeAnalyzed =
    mode === "player" ? playerAnalyzed : developerAnalyzed;

  const activeAppId =
    mode === "player" ? playerAppId : developerAppId;

  const activeAnalysis =
    mode === "player" ? playerAnalysis : developerAnalysis;

  return (
    <div
      className={`app-container ${
        darkMode ? "dark-mode" : ""
      } ${mode === "player" ? "player-mode" : "developer-mode"}`}
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
          setMode={handleModeChange}
          onGetStarted={handleGetStarted}
        />
      ) : (
        <>
          {currentPage === "player" && mode === "player" && (
            <PlayerHome
              darkMode={darkMode}
              setDarkMode={setDarkMode}
              currentPage={currentPage}
              setCurrentPage={setCurrentPage}
              onLogoClick={handleLogoClick}
              mode={mode}
              onAnalyzeGame={handlePlayerAnalysis}
            />
          )}

          {currentPage === "compare" && mode === "player" && (
            <CompareGames {...sharedProps} />
          )}

          {currentPage === "dashboard" && mode === "developer" && (
            <Dashboard
              {...sharedProps}
              analyzed={developerAnalyzed}
              setAnalyzed={setDeveloperAnalyzed}
              analyzedAppId={developerAppId}
              setAnalyzedAppId={setDeveloperAppId}
              analysis={developerAnalysis}
              setAnalysis={setDeveloperAnalysis}
            />
          )}

          {currentPage === "reviews" && (
            <Reviews
              {...sharedProps}
              analyzed={activeAnalyzed}
              analyzedAppId={activeAppId}
              analysis={activeAnalysis}
            />
          )}

          {currentPage === "analytics" && (
            <Analytics
              {...sharedProps}
              analyzed={activeAnalyzed}
              analyzedAppId={activeAppId}
              analysis={activeAnalysis}
            />
          )}

          {currentPage === "issues" && (
            <Issues
              {...sharedProps}
              analyzed={activeAnalyzed}
              analyzedAppId={activeAppId}
            />
          )}

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
