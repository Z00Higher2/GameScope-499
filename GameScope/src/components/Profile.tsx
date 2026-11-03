
import React, { useEffect, useRef, useState } from "react";
import "./Profile.css";
import Navbar from "./Navbar";
import type { Page, Mode } from "../type";

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
}: ProfileProps) {
  const isPlayer = mode === "player";

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

  // Profile picture upload
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

  // Edit profile
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

  // Player genre preferences
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

  // Developer profile updates
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
      (existingGame) => existingGame.toLowerCase() === game.toLowerCase()
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
        accountEmail={accountEmail}
        onLogout={onLogout}
      />

      <main className="profile-content">
        <header className="profile-heading">
          <span className="profile-eyebrow">
            GAMESCOPE ACCOUNT
          </span>

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

            <span className="profile-mode">
              {isPlayer ? "Player Account" : "Developer Account"}
            </span>
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
              <label htmlFor="profile-display-name">
                Display Name
              </label>

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

          <p>
            Upload a picture to personalize your GameScope account.
          </p>

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
          /* Developer Profile */
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
              <label htmlFor="developer-role">
                Your Role
              </label>

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
              <label htmlFor="developer-website">
                Company Website
              </label>

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

            {/* Managed Games */}
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
      </main>
    </div>
  );
}

export default Profile;
