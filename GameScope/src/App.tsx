import { useEffect, useState } from "react";

import Dashboard from "./components/Dashboard";
import Analytics from "./components/Analytics";
import Reviews from "./components/Reviews";
import Issues from "./components/Issues";
import Intro from "./components/Intro";
import Settings from "./components/Settings";
import MyLibrary from "./components/MyLibrary";
import MyGames from "./components/MyGames";
import PlayerHome from "./components/PlayerHome";
import Login from "./components/Login";
import CompareGames from "./components/CompareGames";
import SignUp from "./components/SignUp";
import ForgotPassword from "./components/ForgotPassword";
import Profile from "./components/Profile";

import { analyzeGame, getAnalysis } from "./api";
import type { GameAnalysis } from "./api";
import { loadPreferences } from "./preferences";

import "./App.css";

import type { Page, Mode, AccentColor } from "./type";

export type { Page, Mode, AccentColor } from "./type";

const SETTINGS_KEY = "gamescope-settings";
const AUTH_KEY = "gamescope-demo-account";

const ACCENT_VALUES: Record<
  AccentColor,
  { accent: string; strong: string }
> = {
  purple: { accent: "#7065ee", strong: "#8b80ff" },
  blue: { accent: "#4388ff", strong: "#70a5ff" },
  green: { accent: "#20a878", strong: "#43c995" },
};

interface DemoAccount {
  email: string;
}

interface RecentActivity {
  appId: string;
  gameName: string;
  analyzedAt: string;
  mode: Mode;
  positivePercentage: number;
  negativePercentage: number;
  totalReviews: number;
}

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

function getSavedAccount(): DemoAccount | null {
  try {
    const saved = localStorage.getItem(AUTH_KEY);

    if (!saved) return null;

    const account = JSON.parse(saved);

    if (typeof account.email === "string") {
      // Older demo accounts may still contain a mode field.
      // Ignore it because mode is now selected independently.
      return { email: account.email };
    }
  } catch {
    // Ignore invalid saved session data.
  }

  return null;
}

function getSavedActivityHistory(email: string): RecentActivity[] {
  try {
    const key = `gamescope-analysis-history-${email.toLowerCase()}`;
    const saved = localStorage.getItem(key);

    if (!saved) return [];

    const history = JSON.parse(saved);

    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function getSavedSteamConnection(email: string): boolean {
  try {
    const key = `gamescope-steam-${email.toLowerCase()}`;
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
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

  // ------------------------------------------
  // DEMO LOGIN SESSION
  // ------------------------------------------

  const [account, setAccount] = useState<DemoAccount | null>(
    getSavedAccount
  );

  // ------------------------------------------
  // STEAM CONNECTION STATE
  // ------------------------------------------

  const [steamConnected, setSteamConnected] = useState(() => {
    const savedAccount = getSavedAccount();

    return savedAccount
      ? getSavedSteamConnection(savedAccount.email)
      : false;
  });

  useEffect(() => {
    if (!account?.email) {
      setSteamConnected(false);
      return;
    }

    setSteamConnected(
      getSavedSteamConnection(account.email)
    );
  }, [account?.email]);

  const handleSteamConnect = () => {
    if (!account?.email) return;

    localStorage.setItem(
      `gamescope-steam-${account.email.toLowerCase()}`,
      "true"
    );

    setSteamConnected(true);
  };

  const handleSteamDisconnect = () => {
    if (!account?.email) return;

    localStorage.removeItem(
      `gamescope-steam-${account.email.toLowerCase()}`
    );

    setSteamConnected(false);
  };

  // ------------------------------------------
  // ACTIVITY HISTORY
  // ------------------------------------------

  const [activityHistory, setActivityHistory] = useState<
    RecentActivity[]
  >(() => {
    const savedAccount = getSavedAccount();

    return savedAccount
      ? getSavedActivityHistory(savedAccount.email)
      : [];
  });

  const recordAnalysis = (
    result: GameAnalysis,
    analysisMode: Mode
  ) => {
    if (!account?.email) return;

    const storageKey =
      `gamescope-analysis-history-${account.email.toLowerCase()}`;

    const newActivity: RecentActivity = {
      appId: result.game.appId,
      gameName: result.game.name,
      analyzedAt: result.analyzedAt ?? new Date().toISOString(),
      mode: analysisMode,
      positivePercentage: result.summary.positivePercentage,
      negativePercentage: result.summary.negativePercentage,
      totalReviews: result.summary.totalReviews,
    };

    setActivityHistory((previousHistory) => {
      const updatedHistory = [
        newActivity,
        ...previousHistory,
      ].slice(0, 50);

      localStorage.setItem(
        storageKey,
        JSON.stringify(updatedHistory)
      );

      return updatedHistory;
    });
  };

  const isLoggedIn = account !== null;

  // ------------------------------------------
  // MODE
  // ------------------------------------------

  const [mode, setMode] = useState<Mode>(
    () =>
      localStorage.getItem("gamescope-mode") === "player"
        ? "player"
        : "developer"
  );

  useEffect(() => {
    localStorage.setItem("gamescope-mode", mode);
  }, [mode]);

  // ------------------------------------------
  // INTRO
  // ------------------------------------------

  const [showIntro, setShowIntro] = useState(
    () => sessionStorage.getItem("gamescope-show-intro") !== "false"
  );

  // ------------------------------------------
  // CURRENT PAGE
  // ------------------------------------------

  const [currentPage, setCurrentPage] = useState<Page>(() => {
    const savedAccount = getSavedAccount();
    const savedMode = localStorage.getItem("gamescope-mode");

    if (savedAccount) {
      return savedMode === "player" ? "player" : "dashboard";
    }

    return savedMode === "player" ? "player" : "dashboard";
  });

  const [loginFromIntro, setLoginFromIntro] = useState(false);

  // ------------------------------------------
  // DEVELOPER ANALYSIS STATE
  // ------------------------------------------

  const [developerAnalyzed, setDeveloperAnalyzed] = useState(false);
  const [developerAppId, setDeveloperAppId] = useState("");
  const [developerAnalysis, setDeveloperAnalysis] =
    useState<GameAnalysis | null>(null);

  const clearDeveloperAnalysis = () => {
    setDeveloperAnalyzed(false);
    setDeveloperAppId("");
    setDeveloperAnalysis(null);
  };

  // ------------------------------------------
  // PLAYER ANALYSIS STATE
  // ------------------------------------------

  const [playerAnalyzed, setPlayerAnalyzed] = useState(false);
  const [playerAppId, setPlayerAppId] = useState("");
  const [playerAnalysis, setPlayerAnalysis] =
    useState<GameAnalysis | null>(null);

  const clearPlayerAnalysis = () => {
    setPlayerAnalyzed(false);
    setPlayerAppId("");
    setPlayerAnalysis(null);
  };

  // ------------------------------------------
  // SETTINGS: REVIEW TIME RANGE
  // ------------------------------------------

  const [timeRange, setTimeRange] = useState(
    () => loadPreferences().reviewTimeRange
  );

  useEffect(() => {
    if (currentPage === "settings") return;

    const latest = loadPreferences().reviewTimeRange;

    if (latest === timeRange) return;

    setTimeRange(latest);

    if (developerAppId) {
      getAnalysis(developerAppId)
        .then(setDeveloperAnalysis)
        .catch(() => undefined);
    }

    if (playerAppId) {
      getAnalysis(playerAppId)
        .then(setPlayerAnalysis)
        .catch(() => undefined);
    }
  }, [currentPage, timeRange, developerAppId, playerAppId]);

  // ------------------------------------------
  // MODE SELECTION
  // ------------------------------------------

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
  };

  // ------------------------------------------
  // INTRO NAVIGATION
  // ------------------------------------------

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

  // ------------------------------------------
  // PLAYER ANALYSIS
  // ------------------------------------------

  const handlePlayerAnalysis = (
    appId: string,
    result: GameAnalysis
  ) => {
    setPlayerAppId(appId);
    setPlayerAnalysis(result);
    setPlayerAnalyzed(true);
    recordAnalysis(result, "player");
  };

  // ------------------------------------------
  // LOGIN
  // ------------------------------------------

  const handleLogin = (
    email: string,
    password: string,
    selectedMode: Mode
  ) => {
    if (!email.trim() || !password.trim()) {
      alert("Please enter your email and password.");
      return;
    }

    const newAccount: DemoAccount = {
      email: email.trim(),
    };

    localStorage.setItem(AUTH_KEY, JSON.stringify(newAccount));

    setAccount(newAccount);
    setMode(selectedMode);

    setShowIntro(false);
    sessionStorage.setItem("gamescope-show-intro", "false");

    setCurrentPage(
      selectedMode === "player" ? "player" : "dashboard"
    );

    setLoginFromIntro(false);
  };

  // ------------------------------------------
  // SIGN UP
  // ------------------------------------------

  const handleSignUp = (
    email: string,
    password: string,
    selectedMode: Mode
  ) => {
    if (!email.trim() || !password.trim()) {
      alert("Please enter your email and password.");
      return;
    }

    const newAccount: DemoAccount = {
      email: email.trim(),
    };

    localStorage.setItem(AUTH_KEY, JSON.stringify(newAccount));

    setAccount(newAccount);
    setMode(selectedMode);

    setShowIntro(false);
    sessionStorage.setItem("gamescope-show-intro", "false");

    setCurrentPage(
      selectedMode === "player" ? "player" : "dashboard"
    );
  };

  // ------------------------------------------
  // LOGOUT
  // ------------------------------------------

  const handleLogout = () => {
    localStorage.removeItem(AUTH_KEY);

    setAccount(null);

    clearPlayerAnalysis();
    clearDeveloperAnalysis();

    setShowIntro(true);
    sessionStorage.setItem("gamescope-show-intro", "true");

    setCurrentPage("player");
  };

  // ------------------------------------------
  // PLAYER-ONLY PAGE ACCESS
  // ------------------------------------------

  const handleCompareClick = () => {
    if (!isLoggedIn) {
      setLoginFromIntro(false);
      setCurrentPage("login");
      return;
    }

    setCurrentPage("compare");
  };

  // ------------------------------------------
  // ISSUES / MY GAMES: OPEN GAME ANALYSIS
  // ------------------------------------------

  const openDeveloperGame = async (appId: string) => {
    try {
      // Clear the previous result while the selected game loads.
      setDeveloperAnalyzed(false);
      setDeveloperAppId("");
      setDeveloperAnalysis(null);

      const result = await analyzeGame(appId);

      setDeveloperAppId(result.game.appId);
      setDeveloperAnalysis(result);
      setDeveloperAnalyzed(true);

      recordAnalysis(result, "developer");

      // Navigate only after the analysis succeeds.
      setCurrentPage("dashboard");
    } catch (error) {
      console.error("Unable to analyze selected game:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Unable to analyze this game. Please try again."
      );
    }
  };

  // ------------------------------------------
  // SHARED PROPS
  // ------------------------------------------

  const sharedProps = {
    darkMode,
    setDarkMode,
    currentPage,
    setCurrentPage,
    onLogoClick: handleLogoClick,
    mode,
    setMode: handleModeChange,
    isLoggedIn,
    accountEmail: account?.email ?? "",
    onLogout: handleLogout,
    steamConnected,
    onSteamConnect: handleSteamConnect,
    onSteamDisconnect: handleSteamDisconnect,
  };

  const accentValues = ACCENT_VALUES[accentColor];

  const activeAnalyzed =
    mode === "player" ? playerAnalyzed : developerAnalyzed;

  const activeAppId =
    mode === "player" ? playerAppId : developerAppId;

  const activeAnalysis =
    mode === "player" ? playerAnalysis : developerAnalysis;

  // ------------------------------------------
  // RENDER
  // ------------------------------------------

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
      {showIntro &&
      currentPage !== "login" &&
      currentPage !== "signup" &&
      currentPage !== "forgot-password" ? (
        <Intro
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          mode={mode}
          setMode={handleModeChange}
          onGetStarted={handleGetStarted}
          onLoginClick={() => {
            setLoginFromIntro(true);
            setCurrentPage("login");
          }}
        />
      ) : (
        <>
          {/* PLAYER HOMEPAGE */}
          {currentPage === "player" && mode === "player" && (
            <PlayerHome
              {...sharedProps}
              onAnalyzeGame={handlePlayerAnalysis}
            />
          )}

          {/* PLAYER-ONLY: MY LIBRARY */}
          {currentPage === "library" &&
            mode === "player" &&
            isLoggedIn &&
            steamConnected && (
              <MyLibrary {...sharedProps} />
            )}

          {/* PLAYER-ONLY: COMPARE GAMES */}
          {currentPage === "compare" &&
            mode === "player" &&
            isLoggedIn && (
              <CompareGames {...sharedProps} />
            )}

          {/* LOGIN */}
          {currentPage === "login" && (
            <Login
              darkMode={darkMode}
              mode={mode}
              onLogin={handleLogin}
              onSignUpClick={() => setCurrentPage("signup")}
              onBack={() => {
                if (loginFromIntro) {
                  setCurrentPage(
                    mode === "player" ? "player" : "dashboard"
                  );

                  setShowIntro(true);
                  sessionStorage.setItem(
                    "gamescope-show-intro",
                    "true"
                  );
                } else {
                  setCurrentPage(
                    mode === "player" ? "player" : "dashboard"
                  );
                }

                setLoginFromIntro(false);
              }}
              onForgotPasswordClick={() =>
                setCurrentPage("forgot-password")
              }
            />
          )}

          {/* SIGN UP */}
          {currentPage === "signup" && (
            <SignUp
              darkMode={darkMode}
              mode={mode}
              onSignUp={handleSignUp}
              onBack={() => setCurrentPage("login")}
            />
          )}

          {/* FORGOT PASSWORD */}
          {currentPage === "forgot-password" && (
            <ForgotPassword
              darkMode={darkMode}
              onBack={() => setCurrentPage("login")}
            />
          )}

          {/* DEVELOPER: MY GAMES */}
          {currentPage === "my-games" &&
            mode === "developer" &&
            isLoggedIn && (
              <MyGames
                {...sharedProps}
                onOpenGame={openDeveloperGame}
              />
            )}

          {/* DEVELOPER DASHBOARD */}
          {currentPage === "dashboard" && mode === "developer" && (
            <Dashboard
              {...sharedProps}
              analyzed={developerAnalyzed}
              setAnalyzed={setDeveloperAnalyzed}
              analyzedAppId={developerAppId}
              setAnalyzedAppId={setDeveloperAppId}
              analysis={developerAnalysis}
              setAnalysis={setDeveloperAnalysis}
              onAnalysisComplete={(result) =>
                recordAnalysis(result, "developer")
              }
            />
          )}

          {/* REVIEW ANALYSIS */}
          {currentPage === "reviews" && (
            <Reviews
              {...sharedProps}
              analyzed={activeAnalyzed}
              analyzedAppId={activeAppId}
              analysis={activeAnalysis}
            />
          )}

          {/* ANALYTICS */}
          {currentPage === "analytics" && (
            <Analytics
              {...sharedProps}
              analyzed={activeAnalyzed}
              analyzedAppId={activeAppId}
              analysis={activeAnalysis}
            />
          )}

          {/* ISSUES */}
          {currentPage === "issues" && (
            <Issues
              {...sharedProps}
              analyzed={activeAnalyzed}
              analyzedAppId={activeAppId}
              analysis={activeAnalysis}
              onOpenGame={openDeveloperGame}
            />
          )}

          {/* PROFILE */}
          {currentPage === "profile" && isLoggedIn && (
            <Profile
              {...sharedProps}
              activityHistory={activityHistory}
            />
          )}

          {/* SETTINGS */}
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