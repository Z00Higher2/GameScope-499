
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
import ResetPassword from "./components/ResetPassword";
import Profile from "./components/Profile";
import AdminOrganizations from "./components/AdminOrganizations";

import {
  analyzeGame,
  getAnalysis,
  getCurrentUser,
  getSteamAccount,
  logout,
  startSteamLink,
} from "./api";

import type {
  GameAnalysis,
  AccountRole,
} from "./api";

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
  username: string;
  userId: number;
  roles: AccountRole[];
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

      if (
        ["purple", "blue", "green"].includes(
          settings.accentColor
        )
      ) {
        return settings.accentColor as AccentColor;
      }
    }
  } catch {
    // Use the default accent color.
  }

  return "purple";
}

function getSavedActivityHistory(
  email: string
): RecentActivity[] {
  try {
    const key =
      `gamescope-analysis-history-${email.toLowerCase()}`;

    const saved = localStorage.getItem(key);

    if (!saved) return [];

    const history = JSON.parse(saved);

    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function App() {
  const [resetToken, setResetToken] = useState(
    () =>
      new URLSearchParams(window.location.search).get("token") ??
      ""
  );

  const steamWasLinked =
    new URLSearchParams(window.location.search).get("steam") ===
    "linked";

  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("gamescope-dark-mode") === "true"
  );

  useEffect(() => {
    localStorage.setItem(
      "gamescope-dark-mode",
      String(darkMode)
    );
  }, [darkMode]);

  const [accentColor, setAccentColor] =
    useState<AccentColor>(getSavedAccentColor);

  // ------------------------------------------
  // AUTHENTICATION / SERVER SESSION
  // ------------------------------------------

  const [account, setAccount] =
    useState<DemoAccount | null>(null);

  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then(({ user }) => {
        if (cancelled) return;

        const restoredAccount: DemoAccount = {
          email: user.email,
          username: user.username,
          userId: user.user_id,
          roles: user.roles,
        };

        localStorage.setItem(
          AUTH_KEY,
          JSON.stringify(restoredAccount)
        );

        setAccount(restoredAccount);
      })
      .catch(() => {
        if (cancelled) return;

        localStorage.removeItem(AUTH_KEY);
        setAccount(null);
      })
      .finally(() => {
        if (!cancelled) {
          setAuthLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ------------------------------------------
  // STEAM CALLBACK RETURN
  // ------------------------------------------

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("steam") !== "linked") return;
    if (authLoading || !account) return;

    sessionStorage.setItem(
      "gamescope-steam-link-return",
      "true"
    );

    setShowIntro(false);
    setCurrentPage("profile");

    window.history.replaceState({}, "", "/");
  }, [account, authLoading]);

  // ------------------------------------------
  // ACCOUNT ROLES
  // ------------------------------------------

  const isLoggedIn = account !== null;

  const isPlayer =
    account?.roles.includes("player") ?? false;

  const isDeveloper =
    account?.roles.includes("developer") ?? false;

  const isAdmin =
    account?.roles.includes("admin") ?? false;

  // Guests can browse either side; logged-in accounts
  // can only access features allowed by their roles.
  const canUsePlayer = !isLoggedIn || isPlayer;
  const canUseDeveloper = !isLoggedIn || isDeveloper;

  // ------------------------------------------
  // STEAM CALLBACK NAVIGATION
  // ------------------------------------------

  useEffect(() => {
    if (!steamWasLinked || authLoading) {
      return;
    }

    if (isLoggedIn && isPlayer) {
      setShowIntro(false);

      sessionStorage.setItem(
        "gamescope-show-intro",
        "false"
      );

      setCurrentPage("profile");
    } else {
      console.error(
        "Steam linking returned without an authenticated GameScope player session."
      );

      setCurrentPage("login");
    }
  }, [
    steamWasLinked,
    authLoading,
    isLoggedIn,
    isPlayer,
  ]);

  // ------------------------------------------
  // STEAM CONNECTION STATE
  // ------------------------------------------

  const [steamConnected, setSteamConnected] =
    useState(false);

  useEffect(() => {
    if (!account?.email || !isPlayer) {
      setSteamConnected(false);
      return;
    }

    let cancelled = false;

    const loadSteamConnection = async () => {
      try {
        const response = await getSteamAccount();

        if (!cancelled) {
          setSteamConnected(
            response.linked && response.steam_account !== null
          );
        }
      } catch (error) {
        console.error(
          "Unable to retrieve Steam connection:",
          error
        );

        if (!cancelled) {
          setSteamConnected(false);
        }
      }
    };

    void loadSteamConnection();

    return () => {
      cancelled = true;
    };
  }, [account?.email, isPlayer]);

  const handleSteamConnect = () => {
    if (!account?.email || !isPlayer) return;

    startSteamLink();
  };

  const handleSteamDisconnect = () => {
    setSteamConnected(false);
  };

  // ------------------------------------------
  // ACTIVITY HISTORY
  // ------------------------------------------

  const [activityHistory, setActivityHistory] =
    useState<RecentActivity[]>([]);

  useEffect(() => {
    if (!account?.email) {
      setActivityHistory([]);
      return;
    }

    setActivityHistory(
      getSavedActivityHistory(account.email)
    );
  }, [account?.email]);

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
      analyzedAt:
        result.analyzedAt ?? new Date().toISOString(),
      mode: analysisMode,
      positivePercentage:
        result.summary.positivePercentage,
      negativePercentage:
        result.summary.negativePercentage,
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
    () =>
      sessionStorage.getItem("gamescope-show-intro") !==
      "false"
  );

  // ------------------------------------------
  // CURRENT PAGE
  // ------------------------------------------

  const [currentPage, setCurrentPage] = useState<Page>(
    () => {
      if (
        window.location.pathname === "/reset-password"
      ) {
        return "reset-password";
      }

      const savedMode =
        localStorage.getItem("gamescope-mode");

      return savedMode === "player"
        ? "player"
        : "dashboard";
    }
  );

  const [loginFromIntro, setLoginFromIntro] =
    useState(false);

  // Role picked on the Sign In card, so Forgot Password keeps its color.
  const [recoveryMode, setRecoveryMode] =
    useState<Mode>("player");

  // Account-only pages send guests to Login instead of a blank page.
  useEffect(() => {
    if (
      !authLoading &&
      !isLoggedIn &&
      ["profile", "library", "my-games"].includes(currentPage)
    ) {
      setCurrentPage("login");
    }
  }, [authLoading, isLoggedIn, currentPage]);

  // Admin-only pages send unauthorized accounts away.
  useEffect(() => {
    if (
      !authLoading &&
      currentPage === "admin-organizations" &&
      !isAdmin
    ) {
      setCurrentPage(isLoggedIn ? "player" : "login");
    }
  }, [authLoading, currentPage, isAdmin, isLoggedIn]);

  // ------------------------------------------
  // DEVELOPER ANALYSIS STATE
  // ------------------------------------------

  const [developerAnalyzed, setDeveloperAnalyzed] =
    useState(false);

  const [developerAppId, setDeveloperAppId] =
    useState("");

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

  const [playerAnalyzed, setPlayerAnalyzed] =
    useState(false);

  const [playerAppId, setPlayerAppId] =
    useState("");

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

    const latest =
      loadPreferences().reviewTimeRange;

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
  }, [
    currentPage,
    timeRange,
    developerAppId,
    playerAppId,
  ]);

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

    if (isLoggedIn) {
      if (
        resolvedMode === "developer" &&
        !isDeveloper
      ) {
        return;
      }

      if (
        resolvedMode === "player" &&
        !isPlayer
      ) {
        return;
      }
    }

    if (mode === "developer") {
      clearDeveloperAnalysis();
    } else {
      clearPlayerAnalysis();
    }

    setMode(resolvedMode);

    setCurrentPage(
      resolvedMode === "player"
        ? "player"
        : "dashboard"
    );
  };

  // ------------------------------------------
  // INTRO NAVIGATION
  // ------------------------------------------

  const handleGetStarted = () => {
    setShowIntro(false);

    sessionStorage.setItem(
      "gamescope-show-intro",
      "false"
    );

    if (isLoggedIn) {
      setCurrentPage(
        mode === "developer" && isDeveloper
          ? "dashboard"
          : "player"
      );
    } else {
      setCurrentPage(
        mode === "developer" ? "dashboard" : "player"
      );
    }

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

  // ------------------------------------------
  // PLAYER ANALYSIS
  // ------------------------------------------

  const handlePlayerAnalysis = (
    appId: string,
    result: GameAnalysis
  ) => {
    if (!canUsePlayer) return;

    setPlayerAppId(appId);
    setPlayerAnalysis(result);
    setPlayerAnalyzed(true);

    recordAnalysis(result, "player");
  };

  // ------------------------------------------
  // LOGIN
  // ------------------------------------------

  const handleLogin = async (
    email: string,
    password: string,
    selectedMode: Mode
  ) => {
    if (!email.trim() || !password.trim()) {
      alert("Please enter your email and password.");
      return;
    }

    try {
      const { user } = await getCurrentUser();

      const authenticatedAccount: DemoAccount = {
        email: user.email,
        username: user.username,
        userId: user.user_id,
        roles: user.roles,
      };

      localStorage.setItem(
        AUTH_KEY,
        JSON.stringify(authenticatedAccount)
      );

      setAccount(authenticatedAccount);

      const permittedMode: Mode =
        selectedMode === "developer" &&
        user.roles.includes("developer")
          ? "developer"
          : "player";

      setMode(permittedMode);

      setShowIntro(false);

      sessionStorage.setItem(
        "gamescope-show-intro",
        "false"
      );

      setCurrentPage(
        permittedMode === "player"
          ? "player"
          : "dashboard"
      );

      setLoginFromIntro(false);
    } catch (error) {
      console.error(
        "Unable to retrieve authenticated user:",
        error
      );

      alert(
        "Your login could not be verified. Please try again."
      );
    }
  };

  // ------------------------------------------
  // SIGN UP
  // ------------------------------------------

  const handleSignUp = (
    email: string,
    password: string,
    selectedMode: Mode
  ) => {
    void email;
    void password;

    setMode(selectedMode);

    setCurrentPage("login");

    setShowIntro(false);

    sessionStorage.setItem(
      "gamescope-show-intro",
      "false"
    );
  };

  // ------------------------------------------
  // LOGOUT
  // ------------------------------------------

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error(
        "Unable to revoke the server session:",
        error
      );
    } finally {
      localStorage.removeItem(AUTH_KEY);

      setAccount(null);

      clearPlayerAnalysis();
      clearDeveloperAnalysis();

      setSteamConnected(false);

      setShowIntro(true);

      sessionStorage.setItem(
        "gamescope-show-intro",
        "true"
      );

      setCurrentPage("player");
    }
  };

  // ------------------------------------------
  // PLAYER-ONLY PAGE ACCESS
  // ------------------------------------------

  const handleCompareClick = () => {
    if (!canUsePlayer) {
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
    if (!canUseDeveloper) {
      alert(
        "You need a developer account to access this feature."
      );

      return;
    }

    try {
      setDeveloperAnalyzed(false);
      setDeveloperAppId("");
      setDeveloperAnalysis(null);

      const result = await analyzeGame(appId);

      setDeveloperAppId(result.game.appId);
      setDeveloperAnalysis(result);
      setDeveloperAnalyzed(true);

      recordAnalysis(result, "developer");

      setCurrentPage("dashboard");
    } catch (error) {
      console.error(
        "Unable to analyze selected game:",
        error
      );

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
    isAdmin,
  };

  const accentValues = ACCENT_VALUES[accentColor];

  const activeAnalyzed =
    mode === "player"
      ? playerAnalyzed
      : developerAnalyzed;

  const activeAppId =
    mode === "player"
      ? playerAppId
      : developerAppId;

  const activeAnalysis =
    mode === "player"
      ? playerAnalysis
      : developerAnalysis;

  // ------------------------------------------
  // RENDER
  // ------------------------------------------

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
      {showIntro &&
      currentPage !== "login" &&
      currentPage !== "signup" &&
      currentPage !== "forgot-password" &&
      currentPage !== "reset-password" &&
      currentPage !== "profile" &&
      currentPage !== "admin-organizations" ? (
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
          {currentPage === "player" &&
            canUsePlayer &&
            mode === "player" && (
              <PlayerHome
                {...sharedProps}
                onAnalyzeGame={handlePlayerAnalysis}
              />
            )}

          {/* PLAYER-ONLY: MY LIBRARY */}
          {currentPage === "library" &&
            isLoggedIn &&
            isPlayer &&
            mode === "player" &&
            steamConnected && (
              <MyLibrary {...sharedProps} />
            )}

          {/* PLAYER-ONLY: COMPARE GAMES */}
          {currentPage === "compare" &&
            canUsePlayer &&
            mode === "player" && (
              <CompareGames {...sharedProps} />
            )}

          {/* LOGIN */}
          {currentPage === "login" && (
            <Login
              darkMode={darkMode}
              mode={mode}
              onLogin={handleLogin}
              onSignUpClick={() =>
                setCurrentPage("signup")
              }
              onBack={() => {
                if (loginFromIntro) {
                  setCurrentPage(
                    mode === "player"
                      ? "player"
                      : "dashboard"
                  );

                  setShowIntro(true);

                  sessionStorage.setItem(
                    "gamescope-show-intro",
                    "true"
                  );
                } else {
                  setCurrentPage(
                    mode === "player"
                      ? "player"
                      : "dashboard"
                  );
                }

                setLoginFromIntro(false);
              }}
              onForgotPasswordClick={(selectedMode) => {
                setRecoveryMode(selectedMode);
                setCurrentPage("forgot-password");
              }}
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
              mode={recoveryMode}
              onBack={() => setCurrentPage("login")}
            />
          )}

          {/* RESET PASSWORD */}
          {currentPage === "reset-password" && (
            <ResetPassword
              darkMode={darkMode}
              token={resetToken}
              onBack={() => {
                setResetToken("");

                window.history.replaceState(
                  {},
                  "",
                  "/"
                );

                setCurrentPage("login");
              }}
            />
          )}

          {/* DEVELOPER: MY GAMES */}
          {currentPage === "my-games" &&
            isLoggedIn &&
            isDeveloper &&
            mode === "developer" && (
              <MyGames
                {...sharedProps}
                onOpenGame={openDeveloperGame}
              />
            )}

          {/* DEVELOPER DASHBOARD */}
          {currentPage === "dashboard" &&
            canUseDeveloper &&
            mode === "developer" && (
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
          {currentPage === "reviews" &&
            ((mode === "developer" && canUseDeveloper) ||
              (mode === "player" && canUsePlayer)) && (
              <Reviews
                {...sharedProps}
                analyzed={activeAnalyzed}
                analyzedAppId={activeAppId}
                analysis={activeAnalysis}
              />
            )}

          {/* ANALYTICS */}
          {currentPage === "analytics" &&
            canUseDeveloper &&
            mode === "developer" && (
              <Analytics
                {...sharedProps}
                analyzed={developerAnalyzed}
                analyzedAppId={developerAppId}
                analysis={developerAnalysis}
              />
            )}

          {/* ISSUES */}
          {currentPage === "issues" &&
            canUseDeveloper &&
            mode === "developer" && (
              <Issues
                {...sharedProps}
                analyzed={developerAnalyzed}
                analyzedAppId={developerAppId}
                analysis={developerAnalysis}
                onOpenGame={openDeveloperGame}
              />
            )}

          {/* ADMIN: ORGANIZATION MANAGEMENT */}
          {currentPage === "admin-organizations" &&
            isLoggedIn &&
            isAdmin && (
              <AdminOrganizations
                {...sharedProps}
                accentColor={accentColor}
                setAccentColor={setAccentColor}
              />
            )}

          {/* PROFILE */}
          {currentPage === "profile" &&
            isLoggedIn &&
            account && (
              <Profile
                {...sharedProps}
                activityHistory={activityHistory}
                roles={account.roles}
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
