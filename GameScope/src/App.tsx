import { useEffect, useState } from "react";

import Dashboard from "./components/Dashboard";
import Analytics from "./components/Analytics";
import Reviews from "./components/Reviews";
import Issues from "./components/Issues";
import Intro from "./components/Intro";
import Settings from "./components/Settings";
import type { GameAnalysis } from "./api";

import "./App.css";

export type Page =
  | "dashboard"
  | "reviews"
  | "issues"
  | "analytics"
  | "settings";

export type Mode = "player" | "developer";

export type AccentColor = "purple" | "blue" | "green";

const SETTINGS_KEY = "gamescope-settings";

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
    // Fall back to purple if saved settings are invalid.
  }

  return "purple";
}

function App() {
  // DARK / LIGHT MODE

  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("gamescope-dark-mode") === "true"
  );

  useEffect(() => {
    localStorage.setItem(
      "gamescope-dark-mode",
      String(darkMode)
    );
  }, [darkMode]);

  // GLOBAL ACCENT COLOR

  const [accentColor, setAccentColor] =
    useState<AccentColor>(getSavedAccentColor);

  // PLAYER / DEVELOPER MODE

  const [mode, setMode] = useState<Mode>(() =>
    localStorage.getItem("gamescope-mode") === "player"
      ? "player"
      : "developer"
  );

  useEffect(() => {
    localStorage.setItem("gamescope-mode", mode);
  }, [mode]);

  // INTRO SCREEN

  const [showIntro, setShowIntro] = useState(
    () => sessionStorage.getItem("gamescope-show-intro") !== "false"
  );

  // CURRENT PAGE

  const [currentPage, setCurrentPage] =
    useState<Page>("dashboard");

  // SHARED ANALYSIS STATE

  const [analyzed, setAnalyzed] = useState(false);
  const [analyzedAppId, setAnalyzedAppId] = useState("");

  const [analysis, setAnalysis] =
    useState<GameAnalysis | null>(null);

  // GET STARTED

  const handleGetStarted = () => {
    setShowIntro(false);
    sessionStorage.setItem("gamescope-show-intro", "false");

    let preferredPage: Page =
      mode === "player" ? "reviews" : "dashboard";

    try {
      const savedSettings = localStorage.getItem(SETTINGS_KEY);

      if (savedSettings) {
        const settings = JSON.parse(savedSettings);

        const allowedPages: Page[] =
          mode === "player"
            ? ["reviews", "dashboard"]
            : ["dashboard", "analytics", "issues", "reviews"];

        if (allowedPages.includes(settings.defaultPage)) {
          preferredPage = settings.defaultPage;
        }
      }
    } catch {
      // Keep the mode's default page.
    }

    setCurrentPage(preferredPage);

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  };

  // LOGO CLICK

  const handleLogoClick = () => {
    setShowIntro(true);
    sessionStorage.setItem("gamescope-show-intro", "true");

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "smooth",
    });
  };

  // SHARED PAGE PROPS

  const sharedProps = {
    darkMode,
    setDarkMode,
    currentPage,
    setCurrentPage,
    onLogoClick: handleLogoClick,
    mode,
    setMode,
  };

  return (
    <div
      className={`app-container ${
        darkMode ? "dark-mode" : ""
      } ${
        mode === "player" ? "player-mode" : "developer-mode"
      }`}
      data-accent={accentColor}
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

          {currentPage === "reviews" && (
            <Reviews
              {...sharedProps}
              analyzed={analyzed}
              analyzedAppId={analyzedAppId}
              analysis={analysis}
            />
          )}

          {currentPage === "analytics" && (
            <Analytics
              {...sharedProps}
              analyzed={analyzed}
              analyzedAppId={analyzedAppId}
              analysis={analysis}
            />
          )}

          {currentPage === "issues" && (
            <Issues
              {...sharedProps}
              analyzed={analyzed}
              analyzedAppId={analyzedAppId}
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
