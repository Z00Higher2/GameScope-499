import { useEffect, useState } from "react";

import Dashboard from "./components/Dashboard";
import Analytics from "./components/Analytics";
import Reviews from "./components/Reviews";
import Intro from "./components/Intro";

import "./App.css";

type Page = "dashboard" | "reviews" | "analytics";

function App() {
  // ==================================================
  // DARK / LIGHT MODE
  // ==================================================
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("gamescope-dark-mode") === "true";
  });

  // Save dark mode when it changes
  useEffect(() => {
    localStorage.setItem(
      "gamescope-dark-mode",
      String(darkMode)
    );
  }, [darkMode]);

  // ==================================================
  // INTRO SCREEN
  // ==================================================
  const [showIntro, setShowIntro] = useState(() => {
    return localStorage.getItem("gamescope-show-intro") !== "false";
  });

  // ==================================================
  // CURRENT PAGE
  // ==================================================
  const [currentPage, setCurrentPage] =
    useState<Page>("dashboard");

  // ==================================================
  // SHARED ANALYSIS STATE
  // ==================================================

  const [analyzed, setAnalyzed] = useState(false);

  const [analyzedAppId, setAnalyzedAppId] = useState("");

  // ==================================================
  // GET STARTED
  // ==================================================

  const handleGetStarted = () => {
    setShowIntro(false);

    localStorage.setItem(
      "gamescope-show-intro",
      "false"
    );

    setCurrentPage("dashboard");

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  };

  // ==================================================
  // LOGO CLICK
  // ==================================================

  const handleLogoClick = () => {
    setShowIntro(true);

    localStorage.setItem(
      "gamescope-show-intro",
      "true"
    );

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "smooth",
    });
  };

  // ==================================================
  // APP
  // ==================================================

  return (
    <div
      className={`app-container ${
        darkMode ? "dark-mode" : ""
      }`}
    >
      {showIntro ? (
        <Intro
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          onGetStarted={handleGetStarted}
        />
      ) : (
        <>
          {/* ==================================================
              DASHBOARD
          ================================================== */}

          {currentPage === "dashboard" && (
            <Dashboard
              darkMode={darkMode}
              setDarkMode={setDarkMode}
              currentPage={currentPage}
              setCurrentPage={setCurrentPage}
              onLogoClick={handleLogoClick}
              analyzed={analyzed}
              setAnalyzed={setAnalyzed}
              analyzedAppId={analyzedAppId}
              setAnalyzedAppId={setAnalyzedAppId}
            />
          )}

          {/* ==================================================
              REVIEWS
          ================================================== */}

          {currentPage === "reviews" && (
            <Reviews
              darkMode={darkMode}
              setDarkMode={setDarkMode}
              currentPage={currentPage}
              setCurrentPage={setCurrentPage}
              onLogoClick={handleLogoClick}
              analyzed={analyzed}
              analyzedAppId={analyzedAppId}
            />
          )}

          {/* ==================================================
              ANALYTICS
          ================================================== */}

          {currentPage === "analytics" && (
            <Analytics
              darkMode={darkMode}
              setDarkMode={setDarkMode}
              currentPage={currentPage}
              setCurrentPage={setCurrentPage}
              onLogoClick={handleLogoClick}
              analyzed={analyzed}
              analyzedAppId={analyzedAppId}
            />
          )}
        </>
      )}
    </div>
  );
}

export default App;