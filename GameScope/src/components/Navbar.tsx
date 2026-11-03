
import React from "react";
import "./Navbar.css";
import logo from "../img/gamescope-logo-light.png";
import type { Page, Mode } from "../type";

interface NavbarProps {
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  currentPage: Page;
  setCurrentPage: React.Dispatch<React.SetStateAction<Page>>;
  onLogoClick: () => void;
  mode: Mode;
  setMode: React.Dispatch<React.SetStateAction<Mode>>;

  // Authentication
  isLoggedIn?: boolean;
  accountEmail?: string;
  onLogout?: () => void;
}

function Navbar({
  darkMode,
  setDarkMode,
  currentPage,
  setCurrentPage,
  onLogoClick,
  mode,
  setMode,
  isLoggedIn = false,
  accountEmail = "",
  onLogout,
}: NavbarProps) {
  const [mobileExpanded, setMobileExpanded] = React.useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] =
    React.useState(false);

  const accountDropdownRef = React.useRef<HTMLDivElement>(null);

  const isPlayer = mode === "player";
  const isDeveloper = mode === "developer";

  // Close account dropdown when clicking outside or pressing Escape.
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        accountDropdownRef.current &&
        !accountDropdownRef.current.contains(event.target as Node)
      ) {
        setAccountDropdownOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  // Navigation
  const navigateTo = (page: Page) => {
    // Compare is available only to logged-in Players.
    if (page === "compare" && (!isLoggedIn || !isPlayer)) {
      setCurrentPage("login");
      setMobileExpanded(false);
      setAccountDropdownOpen(false);
      return;
    }

    setCurrentPage(page);
    setMobileExpanded(false);
    setAccountDropdownOpen(false);
  };

  const toggleMobileNavbar = () => {
    setMobileExpanded((previous) => !previous);
  };

  // Switch between Player and Developer modes.
  const handleModeSwitch = (newMode: Mode) => {
    if (newMode === mode) return;

    setMode(newMode);
    setAccountDropdownOpen(false);
    setMobileExpanded(false);
  };

  const handleLogout = () => {
    const confirmed = window.confirm(
      "Are you sure you want to log out?"
    );

    if (confirmed) {
      setAccountDropdownOpen(false);
      setMobileExpanded(false);
      onLogout?.();
    }
  };

  return (
    <>
      {/* Floating mobile menu button */}
      <button
        type="button"
        className={`mobile-menu-trigger ${
          mobileExpanded ? "is-open" : ""
        } ${darkMode ? "dark-trigger" : ""}`}
        onClick={toggleMobileNavbar}
        aria-expanded={mobileExpanded}
        aria-controls="gamescope-navbar"
        aria-label={
          mobileExpanded
            ? "Close navigation menu"
            : "Open navigation menu"
        }
      >
        {mobileExpanded ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h16" />
            <path d="M4 12h16" />
            <path d="M4 18h16" />
          </svg>
        )}
      </button>

      {/* Mobile menu backdrop */}
      {mobileExpanded && (
        <button
          type="button"
          className="mobile-nav-backdrop"
          onClick={() => setMobileExpanded(false)}
          aria-label="Close navigation menu"
          tabIndex={-1}
        />
      )}

      <nav
        id="gamescope-navbar"
        className={`navbar ${darkMode ? "dark-navbar" : ""} ${
          mobileExpanded ? "mobile-expanded" : "mobile-collapsed"
        }`}
        aria-label="Main navigation"
      >
        {/* Desktop logo */}
        <button
          type="button"
          className="navbar-logo"
          onClick={onLogoClick}
          aria-label="Go to GameScope home"
        >
          <div className="logo-icon">
            <img src={logo} alt="GameScope logo" />
          </div>

          <div className="logo-text">
            <h2>GameScope</h2>
            <span>Feedback Analyzer</span>
          </div>
        </button>

        {/* Main navigation */}
        <div className="navbar-menu">
          {/* Player Home */}
          {isPlayer && (
            <button
              type="button"
              className={`nav-item ${
                currentPage === "player" ? "active" : ""
              }`}
              onClick={() => navigateTo("player")}
              aria-label="Go to Player Home"
            >
              <span className="nav-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 11.5L12 4l9 7.5" />
                  <path d="M5.5 10.5V20h13v-9.5" />
                  <path d="M9.5 20v-5.5h5V20" />
                </svg>
              </span>
              <span className="nav-text">Player Home</span>
            </button>
          )}

          {/* Developer Dashboard */}
          {isDeveloper && (
            <button
              type="button"
              className={`nav-item ${
                currentPage === "dashboard" ? "active" : ""
              }`}
              onClick={() => navigateTo("dashboard")}
              aria-label="Go to Dashboard"
            >
              <span className="nav-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 11.5L12 4l9 7.5" />
                  <path d="M5.5 10.5V20h13v-9.5" />
                  <path d="M9.5 20v-5.5h5V20" />
                </svg>
              </span>
              <span className="nav-text">Dashboard</span>
            </button>
          )}

          {/* Reviews */}
          <button
            type="button"
            className={`nav-item ${
              currentPage === "reviews" ? "active" : ""
            }`}
            onClick={() => navigateTo("reviews")}
            aria-label="Go to Reviews"
          >
            <span className="nav-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 4.5h16v12H9l-5 4v-16Z" />
                <path d="M8 9h8" />
                <path d="M8 12.5h5" />
              </svg>
            </span>
            <span className="nav-text">Reviews</span>
          </button>

          {/* Compare Games - Logged-in Players only */}
          {isPlayer && isLoggedIn && (
            <button
              type="button"
              className={`nav-item ${
                currentPage === "compare" ? "active" : ""
              }`}
              onClick={() => navigateTo("compare")}
              aria-label="Compare Games"
              title="Compare Games"
            >
              <span className="nav-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="4" width="7" height="16" rx="1.5" />
                  <rect x="14" y="4" width="7" height="16" rx="1.5" />
                  <path d="M5.5 8h2" />
                  <path d="M16.5 8h2" />
                  <path d="M5.5 12h2" />
                  <path d="M16.5 12h2" />
                </svg>
              </span>
              <span className="nav-text">Compare</span>
            </button>
          )}

          {/* Issues - Developer only */}
          {isDeveloper && (
            <button
              type="button"
              className={`nav-item ${
                currentPage === "issues" ? "active" : ""
              }`}
              onClick={() => navigateTo("issues")}
              aria-label="Go to Issues"
            >
              <span className="nav-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3 22 20H2L12 3Z" />
                  <path d="M12 9v5" />
                  <path d="M12 17h.01" />
                </svg>
              </span>
              <span className="nav-text">Issues</span>
            </button>
          )}

          {/* Analytics - Developer only */}
          {isDeveloper && (
            <button
              type="button"
              className={`nav-item ${
                currentPage === "analytics" ? "active" : ""
              }`}
              onClick={() => navigateTo("analytics")}
              aria-label="Go to Analytics"
            >
              <span className="nav-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 19V5" />
                  <path d="M4 19h17" />
                  <path d="M7 15l4-4 3 2 5-6" />
                </svg>
              </span>
              <span className="nav-text">Analytics</span>
            </button>
          )}
        </div>

        {/* Theme, Settings and Account */}
        <div className="navbar-bottom">
          {/* Theme toggle */}
          <button
            type="button"
            className={`nav-item theme-toggle ${
              darkMode ? "active" : ""
            }`}
            onClick={() => setDarkMode((previous) => !previous)}
            aria-label={
              darkMode ? "Switch to light mode" : "Switch to dark mode"
            }
            title={darkMode ? "Light mode" : "Dark mode"}
          >
            <span className="nav-icon">
              {darkMode ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2" />
                  <path d="M12 20v2" />
                  <path d="m4.93 4.93 1.42 1.42" />
                  <path d="m17.65 17.65 1.42 1.42" />
                  <path d="M2 12h2" />
                  <path d="M20 12h2" />
                  <path d="m4.93 19.07 1.42-1.42" />
                  <path d="m17.65 6.35 1.42-1.42" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />
                </svg>
              )}
            </span>

            <span className="nav-text">
              {darkMode ? "Light Mode" : "Dark Mode"}
            </span>
          </button>

          {/* Settings */}
          <button
            type="button"
            className={`nav-item ${
              currentPage === "settings" ? "active" : ""
            }`}
            onClick={() => navigateTo("settings")}
            aria-label="Go to Settings"
          >
            <span className="nav-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
                <path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z" />
              </svg>
            </span>
            <span className="nav-text">Settings</span>
          </button>

          {/* Account section */}
          {!isLoggedIn ? (
            <button
              type="button"
              className={`nav-item ${
                currentPage === "login" ? "active" : ""
              }`}
              onClick={() => navigateTo("login")}
              aria-label="Go to Login"
            >
              <span className="nav-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21a8 8 0 0 1 16 0" />
                </svg>
              </span>
              <span className="nav-text">Login</span>
            </button>
          ) : (
            <div
              className="account-dropdown-wrapper"
              ref={accountDropdownRef}
            >
              {/* Account button */}
              <button
                type="button"
                className="nav-item account-display"
                onClick={() =>
                  setAccountDropdownOpen((previous) => !previous)
                }
                aria-expanded={accountDropdownOpen}
                aria-haspopup="true"
                aria-label="Open account menu"
              >
                <span className="nav-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21a8 8 0 0 1 16 0" />
                  </svg>
                </span>

                <span className="account-info">
                  <span className="nav-text account-email">
                    {accountEmail || "Logged in"}
                  </span>

                  <span className="account-mode">
                    {isPlayer ? "Player Mode" : "Developer Mode"}
                  </span>
                </span>
              </button>

              {/* Account dropdown panel */}
              {accountDropdownOpen && (
                <div className="account-dropdown" role="menu">
                  <div className="account-dropdown-header">
                    <strong>{accountEmail || "Logged in"}</strong>
                    <span>Account</span>
                  </div>

                  <div className="account-dropdown-details">
                    <span>Current mode</span>
                    <strong>
                      {isPlayer ? "Player Mode" : "Developer Mode"}
                    </strong>
                  </div>

                  <div className="account-dropdown-details">
                    <span>Account status</span>
                    <strong className="account-status">
                      <span className="status-dot" />
                      Logged in
                    </strong>
                  </div>

                  {/* View Profile */}
                  <button
                    type="button"
                    className="account-dropdown-profile"
                    role="menuitem"
                    onClick={() => navigateTo("profile")}
                  >
                    <span>View Profile</span>
                    <span>→</span>
                  </button>

                  {/* Mode switching */}
                  <div className="account-mode-switcher">
                    <span className="account-mode-switcher-label">
                      Switch mode
                    </span>

                    <button
                      type="button"
                      className={`account-mode-option ${
                        isPlayer ? "selected" : ""
                      }`}
                      role="menuitem"
                      disabled={isPlayer}
                      onClick={() => handleModeSwitch("player")}
                    >
                      <span>Player Mode</span>
                      {isPlayer && <span aria-label="Current mode">✓</span>}
                    </button>

                    <button
                      type="button"
                      className={`account-mode-option ${
                        isDeveloper ? "selected" : ""
                      }`}
                      role="menuitem"
                      disabled={isDeveloper}
                      onClick={() => handleModeSwitch("developer")}
                    >
                      <span>Developer Mode</span>
                      {isDeveloper && <span aria-label="Current mode">✓</span>}
                    </button>
                  </div>

                  <button
                    type="button"
                    className="account-dropdown-logout"
                    role="menuitem"
                    onClick={handleLogout}
                  >
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>
    </>
  );
}

export default Navbar;
