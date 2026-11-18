
import React, { useCallback, useEffect, useRef, useState } from "react";
import "./Profile.css";
import Navbar from "./Navbar";
import type { Page, Mode } from "../type";
import {
  getActiveSessions,
  logoutAllDevices,
  getSteamAccount,
  unlinkSteamAccount,
  importSteamLibrary,
} from "../api";

import type {
  AccountMode,
  ActiveSession,
  SteamAccount,
  SteamLibraryImportGame,
  AccountRole,
} from "../api";

type SteamExtensionStatus = "checking" | "installed" | "not-installed";

type SteamImportStatus =
  | "idle"
  | "importing"
  | "success"
  | "error"
  | "extension-required";

interface ChromeExtensionRuntime {
  sendMessage: (
    extensionId: string,
    message: { type: string },
    callback: (response?: {
      success?: boolean;
      installed?: boolean;
      extension?: string;
      error?: string;
      steamId?: string;
      gameCount?: number;
      games?: SteamLibraryImportGame[];
    }) => void
  ) => void;
  lastError?: { message: string };
}

interface ProfileProps {
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  currentPage: Page;
  setCurrentPage: React.Dispatch<React.SetStateAction<Page>>;
  onLogoClick: () => void;
  mode: Mode;
  setMode: React.Dispatch<React.SetStateAction<Mode>>;
  isLoggedIn: boolean;
  accountEmail: string;
  onLogout: () => void;
  steamConnected: boolean;
  onSteamConnect: () => void;
  onSteamDisconnect: () => void;
  roles: AccountRole[];
  isAdmin: boolean;

  activityHistory: {
    appId: string;
    gameName: string;
    analyzedAt: string;
    mode: Mode;
    positivePercentage: number;
    negativePercentage: number;
    totalReviews: number;
  }[];
}

interface DeveloperProfileData {
  companyName: string;
  developerRole: string;
  companyWebsite: string;
  managedGames: string[];
}

const availableGenres = [
  "Action",
  "Adventure",
  "RPG",
  "FPS",
  "Strategy",
  "Simulation",
  "Horror",
  "Racing",
  "Sports",
  "Indie",
];

function readSavedData<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? { ...fallback, ...JSON.parse(saved) } : fallback;
  } catch {
    return fallback;
  }
}

function formatSessionDate(value: string | null): string {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleString();
}

function clearSteamLinkedQuery(): void {
  sessionStorage.removeItem("gamescope-steam-link-return");

  const updatedUrl = new URL(window.location.href);
  updatedUrl.searchParams.delete("steam");

  window.history.replaceState(
    {},
    document.title,
    updatedUrl.pathname + updatedUrl.search + updatedUrl.hash
  );
}

function Profile({
  darkMode,
  setDarkMode,
  currentPage,
  setCurrentPage,
  onLogoClick,
  mode,
  setMode,
  isLoggedIn,
  accountEmail,
  onLogout,
  steamConnected,
  onSteamConnect,
  onSteamDisconnect,
  roles,
  isAdmin = false,
  activityHistory,
}: ProfileProps) {
  const isPlayer = mode === "player";

  // GameScope Chrome extension configuration.
  const [gamescopeExtensionId, setGamescopeExtensionId] = useState("");
  const [extensionConfigLoading, setExtensionConfigLoading] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const emailKey = accountEmail.toLowerCase();

  const storageKey = `gamescope-profile-picture-${emailKey}`;
  const nameStorageKey = `gamescope-display-name-${emailKey}`;
  const genresStorageKey = `gamescope-favorite-genres-${emailKey}`;
  const developerStorageKey = `gamescope-developer-profile-${emailKey}`;

  const [profilePicture, setProfilePicture] = useState<string | null>(
    () => localStorage.getItem(storageKey)
  );

  const [uploadError, setUploadError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);

  // Display name
  const [displayName, setDisplayName] = useState(
    () =>
      localStorage.getItem(nameStorageKey) ||
      accountEmail.split("@")[0] ||
      "User"
  );

  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(displayName);

  // Player preferences
  const [favoriteGenres, setFavoriteGenres] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(genresStorageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Developer profile
  const defaultDeveloperProfile: DeveloperProfileData = {
    companyName: "",
    developerRole: "",
    companyWebsite: "",
    managedGames: [],
  };

  const [developerProfile, setDeveloperProfile] =
    useState<DeveloperProfileData>(() =>
      readSavedData(developerStorageKey, defaultDeveloperProfile)
    );

  const [newGame, setNewGame] = useState("");

  // Account security
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [sessionsMessage, setSessionsMessage] = useState("");
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  // Real Steam account connection
  const [linkedSteamAccount, setLinkedSteamAccount] =
    useState<SteamAccount | null>(null);

  const [steamLoading, setSteamLoading] = useState(true);
  const [steamError, setSteamError] = useState("");
  const [steamDisconnecting, setSteamDisconnecting] = useState(false);
  const [steamMessage, setSteamMessage] = useState("");

  // GameScope Chrome extension detection.
  const [steamExtensionStatus, setSteamExtensionStatus] =
    useState<SteamExtensionStatus>("checking");

  // Steam library import status.
  const [steamImportStatus, setSteamImportStatus] =
    useState<SteamImportStatus>("idle");

  const [steamImportMessage, setSteamImportMessage] = useState("");

  const steamImportStarted = useRef(false);

  // Incremented when the user manually retries an import.
  const [steamImportRetry, setSteamImportRetry] = useState(0);

  // Load the Chrome extension ID from the backend.
  useEffect(() => {
    let cancelled = false;

    const loadExtensionConfig = async () => {
      setExtensionConfigLoading(true);

      try {
        const response = await fetch("/api/config", {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(
            "Unable to load the GameScope extension configuration."
          );
        }

        const config: { steamExtensionId?: string } =
          await response.json();

        if (
          typeof config.steamExtensionId !== "string" ||
          !config.steamExtensionId.trim()
        ) {
          throw new Error("The Steam extension ID is missing from the backend configuration.");
        }

        if (!cancelled) {
          setGamescopeExtensionId(config.steamExtensionId.trim());
        }
      } catch (error) {
        console.error(
          "GameScope extension configuration error:",
          error
        );

        if (!cancelled) {
          setGamescopeExtensionId("");
          setSteamExtensionStatus("not-installed");
          setSteamImportStatus("extension-required");
          setSteamImportMessage(
            "Unable to load the GameScope Steam Connector configuration. Please try again later."
          );
        }
      } finally {
        if (!cancelled) {
          setExtensionConfigLoading(false);
        }
      }
    };

    void loadExtensionConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  // Check whether the GameScope Chrome extension is installed.
  const checkSteamExtension = useCallback(() => {
    if (extensionConfigLoading) {
      return;
    }

    if (!gamescopeExtensionId) {
      setSteamExtensionStatus("not-installed");
      return;
    }

    setSteamExtensionStatus("checking");

    const runtime = (window as Window & {
      chrome?: { runtime?: ChromeExtensionRuntime };
    }).chrome?.runtime;

    if (!runtime) {
      setSteamExtensionStatus("not-installed");
      return;
    }

    try {
      runtime.sendMessage(
        gamescopeExtensionId,
        { type: "GAMESCOPE_PING" },
        (response) => {
          if (
            runtime.lastError ||
            !response?.success ||
            !response.installed
          ) {
            setSteamExtensionStatus("not-installed");
            return;
          }

          setSteamExtensionStatus("installed");
        }
      );
    } catch {
      setSteamExtensionStatus("not-installed");
    }
  }, [gamescopeExtensionId, extensionConfigLoading]);

  // Check the extension after its configuration has loaded.
  useEffect(() => {
    if (!extensionConfigLoading) {
      checkSteamExtension();
    }
  }, [checkSteamExtension, extensionConfigLoading]);

  const loadSessions = async () => {
    setSessionsLoading(true);
    setSessionsError("");
    setSessionsMessage("");

    try {
      const response = await getActiveSessions();
      setSessions(response.sessions);
    } catch (error) {
      setSessionsError(
        error instanceof Error
          ? error.message
          : "Unable to load active sessions."
      );
    } finally {
      setSessionsLoading(false);
    }
  };

  // Load active GameScope sessions.
  useEffect(() => {
    if (!isLoggedIn) {
      setSessions([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setSessionsLoading(true);
      setSessionsError("");

      try {
        const response = await getActiveSessions();

        if (!cancelled) {
          setSessions(response.sessions);
        }
      } catch (error) {
        if (!cancelled) {
          setSessionsError(
            error instanceof Error
              ? error.message
              : "Unable to load active sessions."
          );
        }
      } finally {
        if (!cancelled) {
          setSessionsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, accountEmail]);

  // Load the Steam account linked to the current GameScope account.
  useEffect(() => {
    if (!isLoggedIn) {
      setLinkedSteamAccount(null);
      setSteamLoading(false);
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

  // Automatically import the Steam library after Steam linking.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const steamWasJustLinked =
      params.get("steam") === "linked" ||
      sessionStorage.getItem("gamescope-steam-link-return") === "true";

    if (
      !steamWasJustLinked ||
      !isLoggedIn ||
      steamLoading ||
      !linkedSteamAccount
    ) {
      return;
    }

    // Wait until the backend extension configuration is available.
    if (
      extensionConfigLoading ||
      steamExtensionStatus === "checking"
    ) {
      return;
    }

    if (!gamescopeExtensionId) {
      setSteamImportStatus("extension-required");
      setSteamImportMessage(
        "Unable to load the GameScope Steam Connector configuration. Please try again later."
      );
      return;
    }

    // If the extension is missing, leave the URL marker in place.
    // The user can install the extension and press Check Again.
    if (steamExtensionStatus === "not-installed") {
      setSteamImportStatus("extension-required");
      setSteamImportMessage(
        "Your Steam account is connected! Install the GameScope Steam Connector, then check again to import your games."
      );
      return;
    }

    const steamId = linkedSteamAccount.steam_id;
    const importKey = `gamescope-steam-imported-${steamId}`;

    // Do not import again if this Steam account was already imported
    // during this browser session.
    if (sessionStorage.getItem(importKey) === "true") {
      setSteamImportStatus("success");
      setSteamImportMessage(
        "Your Steam library has already been imported during this session."
      );
      clearSteamLinkedQuery();
      return;
    }

    if (steamImportStarted.current) {
      return;
    }

    const runtime = (window as Window & {
      chrome?: { runtime?: ChromeExtensionRuntime };
    }).chrome?.runtime;

    if (!runtime) {
      setSteamImportStatus("extension-required");
      setSteamImportMessage(
        "The GameScope Steam Connector could not be accessed. Check that the extension is installed and enabled."
      );
      return;
    }

    steamImportStarted.current = true;

    setSteamImportStatus("importing");
    setSteamImportMessage(
      "Connecting to Steam and retrieving your games..."
    );

    runtime.sendMessage(
      gamescopeExtensionId,
      { type: "GAMESCOPE_IMPORT_STEAM_LIBRARY" },
      (response) => {
        if (runtime.lastError) {
          steamImportStarted.current = false;
          setSteamImportStatus("error");
          setSteamImportMessage(
            "Unable to communicate with the Steam Connector. Make sure the extension is enabled and try again."
          );
          return;
        }

        if (
          !response?.success ||
          !response.steamId ||
          !Array.isArray(response.games)
        ) {
          steamImportStarted.current = false;
          setSteamImportStatus("error");
          setSteamImportMessage(
            response?.error ||
              "Unable to retrieve your Steam games. Make sure you are logged into Steam."
          );
          return;
        }

        // Confirm the extension returned the same Steam account
        // that is linked to the current GameScope account.
        if (response.steamId !== steamId) {
          steamImportStarted.current = false;
          setSteamImportStatus("error");
          setSteamImportMessage(
            "The Steam account detected by the extension does not match your linked Steam account."
          );
          return;
        }

        const games = response.games;

        setSteamImportMessage(
          `Retrieved ${games.length} games. Saving your library to GameScope...`
        );

        importSteamLibrary(response.steamId, games)
          .then((result) => {
            sessionStorage.setItem(importKey, "true");

            setSteamImportStatus("success");
            setSteamImportMessage(
              `Successfully imported ${result.importedCount} games into your GameScope library!`
            );

            clearSteamLinkedQuery();
          })
          .catch((error) => {
            steamImportStarted.current = false;
            setSteamImportStatus("error");
            setSteamImportMessage(
              error instanceof Error
                ? error.message
                : "Unable to save your Steam library."
            );
          });
      }
    );
  }, [
    isLoggedIn,
    steamLoading,
    linkedSteamAccount,
    steamExtensionStatus,
    steamImportRetry,
    gamescopeExtensionId,
    extensionConfigLoading,
  ]);

  // Retry a failed Steam library import.
  const handleRetrySteamImport = () => {
    steamImportStarted.current = false;
    setSteamImportStatus("idle");
    setSteamImportMessage("");
    setSteamImportRetry((previous) => previous + 1);
  };

  // Disconnect the linked Steam account.
  const handleDisconnectSteam = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to disconnect your Steam account from GameScope?"
    );

    if (!confirmed) return;

    setSteamDisconnecting(true);
    setSteamError("");
    setSteamMessage("");
    setSteamImportStatus("idle");
    setSteamImportMessage("");
    steamImportStarted.current = false;

    try {
      const response = await unlinkSteamAccount();

      setLinkedSteamAccount(null);

      // Update App.tsx so the Navbar and My Library update immediately.
      onSteamDisconnect();

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

  const handleLogoutAllDevices = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to log out of all devices? " +
        "This will end every active GameScope session, including this one."
    );

    if (!confirmed) return;

    setLoggingOutAll(true);
    setSessionsError("");
    setSessionsMessage("");

    try {
      const response = await logoutAllDevices();

      setSessions([]);
      setSessionsMessage(
        `${response.message} (${response.revoked_sessions} sessions ended.)`
      );

      // The backend has already revoked the current session.
      onLogout();
    } catch (error) {
      setSessionsError(
        error instanceof Error
          ? error.message
          : "Unable to log out of all devices."
      );
    } finally {
      setLoggingOutAll(false);
    }
  };

  // Keep account-specific information updated.
  useEffect(() => {
    setProfilePicture(localStorage.getItem(storageKey));
    setUploadError("");

    const savedName =
      localStorage.getItem(nameStorageKey) ||
      accountEmail.split("@")[0] ||
      "User";

    setDisplayName(savedName);
    setEditedName(savedName);
    setIsEditing(false);

    try {
      const savedGenres = localStorage.getItem(genresStorageKey);
      setFavoriteGenres(savedGenres ? JSON.parse(savedGenres) : []);
    } catch {
      setFavoriteGenres([]);
    }

    setDeveloperProfile(
      readSavedData(developerStorageKey, defaultDeveloperProfile)
    );

    setProfileError("");
    setProfileSaved(false);
  }, [accountEmail]);

  // Profile picture upload.
  const handlePictureUpload = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    setUploadError("");

    if (!file.type.startsWith("image/")) {
      setUploadError("Please select a valid image.");
      event.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadError("Image must be smaller than 10 MB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        const canvas = document.createElement("canvas");
        const maxSize = 512;

        const scale = Math.min(
          maxSize / image.width,
          maxSize / image.height,
          1
        );

        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const context = canvas.getContext("2d");

        if (!context) {
          setUploadError("Unable to process this image.");
          return;
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const compressedImage = canvas.toDataURL("image/jpeg", 0.82);

        try {
          localStorage.setItem(storageKey, compressedImage);
          setProfilePicture(compressedImage);
        } catch {
          setUploadError(
            "Unable to save the image. Try a smaller picture."
          );
        }
      };

      image.onerror = () => {
        setUploadError("Unable to load this image.");
      };

      image.src = reader.result as string;
    };

    reader.onerror = () => {
      setUploadError("Unable to read this image.");
    };

    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleRemovePicture = () => {
    localStorage.removeItem(storageKey);
    setProfilePicture(null);
    setUploadError("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Edit profile.
  const handleSaveProfile = () => {
    const trimmedName = editedName.trim();

    if (!trimmedName) {
      setProfileError("Display name cannot be empty.");
      return;
    }

    localStorage.setItem(nameStorageKey, trimmedName);
    setDisplayName(trimmedName);
    setIsEditing(false);
    setProfileError("");
  };

  const handleCancelEdit = () => {
    setEditedName(displayName);
    setIsEditing(false);
    setProfileError("");
  };

  // Player genre preferences.
  const handleGenreChange = (genre: string) => {
    const updatedGenres = favoriteGenres.includes(genre)
      ? favoriteGenres.filter((item) => item !== genre)
      : [...favoriteGenres, genre];

    setFavoriteGenres(updatedGenres);

    localStorage.setItem(
      genresStorageKey,
      JSON.stringify(updatedGenres)
    );
  };

  // Developer profile updates.
  const updateDeveloperField = (
    field: keyof Omit<DeveloperProfileData, "managedGames">,
    value: string
  ) => {
    setDeveloperProfile((previous) => ({
      ...previous,
      [field]: value,
    }));

    setProfileSaved(false);
  };

  const handleSaveDeveloperProfile = () => {
    try {
      localStorage.setItem(
        developerStorageKey,
        JSON.stringify(developerProfile)
      );

      setProfileSaved(true);
      setProfileError("");
    } catch {
      setProfileError("Unable to save your developer profile.");
    }
  };

  const handleAddGame = () => {
    const game = newGame.trim();

    if (!game) return;

    const alreadyExists = developerProfile.managedGames.some(
      (existingGame) =>
        existingGame.toLowerCase() === game.toLowerCase()
    );

    if (alreadyExists) {
      setProfileError("This game is already on your list.");
      return;
    }

    setDeveloperProfile((previous) => ({
      ...previous,
      managedGames: [...previous.managedGames, game],
    }));

    setNewGame("");
    setProfileError("");
    setProfileSaved(false);
  };

  const handleRemoveGame = (gameToRemove: string) => {
    setDeveloperProfile((previous) => ({
      ...previous,
      managedGames: previous.managedGames.filter(
        (game) => game !== gameToRemove
      ),
    }));

    setProfileSaved(false);
  };

  return (
    <div className="profile-page">
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

      <main className="profile-content">
        <header className="profile-heading">
          <span className="profile-eyebrow">GAMESCOPE ACCOUNT</span>
          <h1>My Profile</h1>
          <p>
            Manage your account and view your
            {isPlayer ? " gaming profile." : " developer profile."}
          </p>
        </header>

        {/* Profile information */}
        <section className="profile-card">
          <div className="profile-avatar">
            {profilePicture ? (
              <img
                src={profilePicture}
                alt="Profile"
                className="profile-avatar-image"
              />
            ) : (
              accountEmail.charAt(0).toUpperCase() || "U"
            )}
          </div>

          <div className="profile-user-info">
            <h2>{displayName}</h2>
            <p>{accountEmail}</p>

            <div className="profile-mode">
              {roles.map((role) => (
                <span key={role}>
                  {role === "player"
                    ? "Player Account"
                    : "Developer Account"}
                </span>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="profile-edit-button"
            onClick={() => {
              setEditedName(displayName);
              setIsEditing(true);
              setProfileError("");
            }}
          >
            Edit Profile
          </button>
        </section>

        {/* Edit Profile Panel */}
        {isEditing && (
          <section className="profile-section profile-edit-panel">
            <h2>Edit Profile</h2>

            <div className="profile-form-group">
              <label htmlFor="profile-display-name">Display Name</label>
              <input
                id="profile-display-name"
                type="text"
                value={editedName}
                maxLength={30}
                onChange={(event) => setEditedName(event.target.value)}
                placeholder="Enter your display name"
              />

              {profileError && (
                <span className="profile-upload-error">
                  {profileError}
                </span>
              )}
            </div>

            <div className="profile-form-group">
              <label htmlFor="profile-email">Email Address</label>
              <input
                id="profile-email"
                type="email"
                value={accountEmail}
                disabled
              />
              <span>Email editing is not available yet.</span>
            </div>

            <div className="profile-edit-actions">
              <button
                type="button"
                className="profile-save-button"
                onClick={handleSaveProfile}
              >
                Save Changes
              </button>

              <button
                type="button"
                className="profile-cancel-button"
                onClick={handleCancelEdit}
              >
                Cancel
              </button>
            </div>
          </section>
        )}

        {/* Profile picture controls */}
        <section className="profile-section">
          <h2>Profile Picture</h2>
          <p>Upload a picture to personalize your GameScope account.</p>

          <div className="profile-picture-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePictureUpload}
              hidden
            />

            <button
              type="button"
              className="profile-upload-button"
              onClick={() => fileInputRef.current?.click()}
            >
              {profilePicture ? "Change Picture" : "Upload Picture"}
            </button>

            {profilePicture && (
              <button
                type="button"
                className="profile-remove-button"
                onClick={handleRemovePicture}
              >
                Remove Picture
              </button>
            )}
          </div>

          <span className="profile-upload-hint">
            JPG, PNG, or other image formats. Maximum 10 MB.
          </span>

          {uploadError && (
            <p className="profile-upload-error" role="alert">
              {uploadError}
            </p>
          )}
        </section>

        {/* Account Security */}
        <section className="profile-section profile-security-section">
          <div className="profile-security-heading">
            <div>
              <h2>Account Security</h2>
              <p>
                Review where your GameScope account is currently signed in.
              </p>
            </div>

            <button
              type="button"
              className="profile-refresh-button"
              onClick={loadSessions}
              disabled={sessionsLoading || loggingOutAll}
            >
              {sessionsLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="profile-security-summary">
            <div className="profile-security-icon">
              <span aria-hidden="true">⌁</span>
            </div>

            <div>
              <strong>
                {sessions.length} active{" "}
                {sessions.length === 1 ? "session" : "sessions"}
              </strong>
              <span>
                Sessions associated with your GameScope account
              </span>
            </div>
          </div>

          {sessionsError && (
            <p className="profile-upload-error" role="alert">
              {sessionsError}
            </p>
          )}

          {sessionsMessage && (
            <p className="profile-security-success" role="status">
              {sessionsMessage}
            </p>
          )}

          {sessionsLoading ? (
            <div className="profile-security-empty">
              Loading active sessions...
            </div>
          ) : sessions.length > 0 ? (
            <div className="profile-session-list">
              {sessions.map((session) => (
                <article
                  className="profile-session-item"
                  key={session.session_id}
                >
                  <div className="profile-session-device">
                    <div className="profile-session-device-icon">
                      <span aria-hidden="true">▣</span>
                    </div>

                    <div className="profile-session-details">
                      <div className="profile-session-title">
                        <h3>GameScope Browser Session</h3>

                        {session.is_current && (
                          <span className="profile-current-session">
                            This device
                          </span>
                        )}
                      </div>

                      <p>
                        Last active:{" "}
                        {formatSessionDate(session.last_seen_at)}
                      </p>

                      <p>
                        Expires:{" "}
                        {formatSessionDate(session.expires_at)}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            !sessionsError && (
              <div className="profile-security-empty">
                No active sessions were found.
              </div>
            )
          )}

          <div className="profile-security-actions">
            <div>
              <strong>Log out of all devices</strong>
              <p>
                End every active session, including the current browser.
                You will need to sign in again.
              </p>
            </div>

            <button
              type="button"
              className="profile-logout-all-button"
              onClick={handleLogoutAllDevices}
              disabled={
                loggingOutAll ||
                sessionsLoading ||
                sessions.length === 0
              }
            >
              {loggingOutAll ? "Logging out..." : "Log Out All Devices"}
            </button>
          </div>
        </section>

        {/* Player Profile */}
        {isPlayer ? (
          <section className="profile-section">
            <h2>Gaming Profile</h2>

            <p>
              Select the genres you enjoy playing. GameScope can use
              these preferences to help personalize your game discovery
              experience.
            </p>

            <div className="profile-genres">
              {availableGenres.map((genre) => (
                <label
                  key={genre}
                  className={`profile-genre ${
                    favoriteGenres.includes(genre) ? "selected" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={favoriteGenres.includes(genre)}
                    onChange={() => handleGenreChange(genre)}
                  />
                  {genre}
                </label>
              ))}
            </div>

            <span className="profile-upload-hint">
              {favoriteGenres.length} favorite genres selected
            </span>
          </section>
        ) : (
          <section className="profile-section">
            <h2>Developer Profile</h2>

            <p>
              Add information about your development company and
              the games you manage.
            </p>

            <div className="profile-form-group">
              <label htmlFor="developer-company">
                Company / Studio Name
              </label>
              <input
                id="developer-company"
                type="text"
                value={developerProfile.companyName}
                maxLength={60}
                onChange={(event) =>
                  updateDeveloperField("companyName", event.target.value)
                }
                placeholder="Enter your company or studio name"
              />
            </div>

            <div className="profile-form-group">
              <label htmlFor="developer-role">Your Role</label>
              <input
                id="developer-role"
                type="text"
                value={developerProfile.developerRole}
                maxLength={60}
                onChange={(event) =>
                  updateDeveloperField("developerRole", event.target.value)
                }
                placeholder="e.g. Game Developer, Studio Manager"
              />
            </div>

            <div className="profile-form-group">
              <label htmlFor="developer-website">Company Website</label>
              <input
                id="developer-website"
                type="url"
                value={developerProfile.companyWebsite}
                onChange={(event) =>
                  updateDeveloperField("companyWebsite", event.target.value)
                }
                placeholder="https://example.com"
              />
            </div>

            <div className="profile-managed-games">
              <h3>Managed Games</h3>
              <p>
                Keep a list of games associated with your studio.
              </p>

              <div className="profile-add-game">
                <input
                  type="text"
                  value={newGame}
                  maxLength={80}
                  onChange={(event) => setNewGame(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddGame();
                    }
                  }}
                  placeholder="Enter a game title"
                  aria-label="New game title"
                />

                <button
                  type="button"
                  className="profile-upload-button"
                  onClick={handleAddGame}
                >
                  Add Game
                </button>
              </div>

              {developerProfile.managedGames.length > 0 ? (
                <div className="profile-game-list">
                  {developerProfile.managedGames.map((game) => (
                    <div className="profile-game-item" key={game}>
                      <span>{game}</span>

                      <button
                        type="button"
                        className="profile-remove-button"
                        onClick={() => handleRemoveGame(game)}
                        aria-label={`Remove ${game}`}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="profile-empty-games">
                  No managed games added yet.
                </p>
              )}
            </div>

            {profileError && (
              <p className="profile-upload-error" role="alert">
                {profileError}
              </p>
            )}

            <div className="profile-edit-actions">
              <button
                type="button"
                className="profile-save-button"
                onClick={handleSaveDeveloperProfile}
              >
                Save Developer Profile
              </button>

              {profileSaved && (
                <span className="profile-upload-hint">
                  Developer profile saved!
                </span>
              )}
            </div>
          </section>
        )}

        {/* Real Steam Account */}
        <section className="profile-section steam-account-section">
          <h2>Steam Account</h2>

          <p>
            Link your Steam account to connect your gaming identity
            with your GameScope profile.
          </p>

          <div className="steam-account-card">
            <div className="steam-account-info">
              <div className="steam-account-logo">
                <img
                  src="https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg"
                  alt="Steam logo"
                />
              </div>

              <div>
                <h3>Steam</h3>

                <span
                  className={`steam-connection-status ${
                    linkedSteamAccount ? "connected" : "disconnected"
                  }`}
                >
                  {steamLoading
                    ? "Checking connection..."
                    : linkedSteamAccount
                      ? "Connected"
                      : "Not Connected"}
                </span>
              </div>
            </div>

            {steamLoading ? (
              <span className="profile-upload-hint">
                Checking your linked Steam account...
              </span>
            ) : linkedSteamAccount ? (
              <div className="steam-linked-content">
                <div className="steam-linked-details">
                  <p>
                    <strong>Steam ID:</strong>{" "}
                    {linkedSteamAccount.steam_id}
                  </p>

                  {linkedSteamAccount.steam_display_name && (
                    <p>
                      <strong>Display Name:</strong>{" "}
                      {linkedSteamAccount.steam_display_name}
                    </p>
                  )}

                  {linkedSteamAccount.profile_url && (
                    <a
                      href={linkedSteamAccount.profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View Steam Profile
                    </a>
                  )}
                </div>

                <div
                  className="steam-linked-actions"
                  style={{
                    display: "flex",
                    justifyContent: "flex-start",
                    alignItems: "flex-start",
                    width: "100%",
                    marginTop: "12px",
                  }}
                >
                  <button
                    type="button"
                    className="profile-remove-button"
                    onClick={handleDisconnectSteam}
                    disabled={steamDisconnecting}
                  >
                    {steamDisconnecting
                      ? "Disconnecting..."
                      : "Disconnect Steam"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="profile-upload-button"
                onClick={onSteamConnect}
                disabled={!isLoggedIn || !isPlayer}
              >
                Connect Steam
              </button>
            )}
          </div>

          {steamError && (
            <p className="profile-upload-error" role="alert">
              {steamError}
            </p>
          )}

          {steamMessage && (
            <p className="profile-security-success" role="status">
              {steamMessage}
            </p>
          )}

          <span className="profile-upload-hint">
            GameScope uses Steam OpenID to verify your Steam identity.
            You will be redirected to Steam to authorize the connection.
            GameScope never asks for your Steam password.
          </span>

          {/* Steam library import status */}
          {steamImportMessage && (
            <p
              className={
                steamImportStatus === "error"
                  ? "profile-upload-error"
                  : "profile-security-success"
              }
              role="status"
            >
              {steamImportStatus === "importing" && "⏳ "}
              {steamImportStatus === "success" && "✓ "}
              {steamImportMessage}
            </p>
          )}

          {steamImportStatus === "error" && (
            <button
              type="button"
              className="profile-refresh-button"
              onClick={handleRetrySteamImport}
            >
              Retry Steam Library Import
            </button>
          )}

          <div className="steam-extension-status">
            <div>
              <strong>GameScope Steam Connector</strong>
              <p className="profile-upload-hint">
                {extensionConfigLoading ||
                steamExtensionStatus === "checking"
                  ? "Checking whether the browser extension is installed..."
                  : steamExtensionStatus === "installed"
                    ? "Extension detected. Your Steam library can be imported through this connector."
                    : !gamescopeExtensionId
                      ? "Unable to load the extension configuration from GameScope."
                      : "Extension not detected. Install the GameScope Steam Connector in Chrome to use browser-based Steam library importing."}
              </p>
            </div>

            <div className="steam-linked-actions">
              <span
                className={`steam-connection-status ${
                  steamExtensionStatus === "installed"
                    ? "connected"
                    : "disconnected"
                }`}
                role="status"
              >
                {extensionConfigLoading ||
                steamExtensionStatus === "checking"
                  ? "Checking"
                  : steamExtensionStatus === "installed"
                    ? "Extension detected"
                    : "Not detected"}
              </span>

              <button
                type="button"
                className="profile-refresh-button"
                onClick={checkSteamExtension}
                disabled={
                  extensionConfigLoading ||
                  steamExtensionStatus === "checking"
                }
              >
                {extensionConfigLoading ||
                steamExtensionStatus === "checking"
                  ? "Checking..."
                  : "Check Again"}
              </button>
            </div>
          </div>
        </section>

        {/* Recent Analysis Activity */}
        <section className="profile-section profile-activity">
          <div className="profile-activity-heading">
            <div>
              <h2>Recent Activity</h2>
              <p>
                Your recently analyzed games and their review statistics.
              </p>
            </div>

            <span className="profile-activity-count">
              {activityHistory.length} / 50
            </span>
          </div>

          {activityHistory.length > 0 ? (
            <div className="profile-activity-list">
              {activityHistory.map((activity, index) => (
                <article
                  className="profile-activity-item"
                  key={`${activity.appId}-${activity.analyzedAt}-${index}`}
                >
                  <img
                    className="profile-activity-image"
                    src={`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${activity.appId}/header.jpg`}
                    alt={`${activity.gameName} cover`}
                    onError={(event) => {
                      event.currentTarget.style.visibility = "hidden";
                    }}
                  />

                  <div className="profile-activity-info">
                    <h3>{activity.gameName}</h3>

                    <span className="profile-activity-date">
                      {new Date(activity.analyzedAt).toLocaleString()}
                    </span>

                    <span className="profile-activity-mode">
                      {activity.mode === "player"
                        ? "Player Analysis"
                        : "Developer Analysis"}
                    </span>

                    <div className="profile-activity-stats">
                      <span className="activity-positive">
                        {activity.positivePercentage}% Positive
                      </span>

                      <span className="activity-negative">
                        {activity.negativePercentage}% Negative
                      </span>

                      <span>
                        {activity.totalReviews.toLocaleString()} Reviews
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="profile-activity-empty">
              <h3>No activity yet</h3>
              <p>
                Analyze a game in Player or Developer mode.
                Your analysis history will appear here.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default Profile;
