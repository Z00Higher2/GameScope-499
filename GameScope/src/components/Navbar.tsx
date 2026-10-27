
import "./Navbar.css";
import logo from "../img/gamescope-logo-light.png";
import type { Page, Mode } from "../type";
import { useState } from "react";
const [mobileExpanded, setMobileExpanded] = useState(false);

interface NavbarProps {
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  currentPage: Page;
  setCurrentPage: React.Dispatch<React.SetStateAction<Page>>;
  onLogoClick: () => void;
  mode: Mode;
}

function Navbar({
  darkMode,
  setDarkMode,
  currentPage,
  setCurrentPage,
  onLogoClick,
  mode,
}: NavbarProps) {
  const isPlayer = mode === "player";
  const isDeveloper = mode === "developer";

  return (
        <nav
      className={`navbar ${darkMode ? "dark-navbar" : ""} ${
        mobileExpanded ? "mobile-expanded" : ""
      }`}
      aria-label="Main navigation"
    >
      <button
        type="button"
        className="mobile-nav-toggle"
        onClick={() => setMobileExpanded((previous) => !previous)}
        aria-expanded={mobileExpanded}
        aria-label={mobileExpanded ? "Collapse navigation" : "Expand navigation"}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {mobileExpanded ? (
            <path d="m15 18-6-6 6-6" />
          ) : (
            <path d="m9 18 6-6-6-6" />
          )}
        </svg>
      </button>

      {/* MAIN NAVIGATION */}
      <div className="navbar-menu">
        {/* PLAYER HOME — PLAYER MODE ONLY */}
        {isPlayer && (
          <button
            type="button"
            className={`nav-item ${
              currentPage === "player" ? "active" : ""
            }`}
            onClick={() => setCurrentPage("player")}
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

        {/* DASHBOARD — DEVELOPER MODE ONLY */}
        {isDeveloper && (
          <button
            type="button"
            className={`nav-item ${
              currentPage === "dashboard" ? "active" : ""
            }`}
            onClick={() => setCurrentPage("dashboard")}
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

        {/* REVIEWS — BOTH MODES */}
        <button
          type="button"
          className={`nav-item ${
            currentPage === "reviews" ? "active" : ""
          }`}
          onClick={() => setCurrentPage("reviews")}
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

        {/* COMPARE GAMES — PLAYER MODE ONLY */}
        {isPlayer && (
          <button
            type="button"
            className={`nav-item ${
              currentPage === "compare" ? "active" : ""
            }`}
            onClick={() => setCurrentPage("compare")}
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

        {/* ISSUES — DEVELOPER MODE ONLY */}
        {isDeveloper && (
          <button
            type="button"
            className={`nav-item ${
              currentPage === "issues" ? "active" : ""
            }`}
            onClick={() => setCurrentPage("issues")}
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

        {/* ANALYTICS — DEVELOPER MODE ONLY */}
        {isDeveloper && (
          <button
            type="button"
            className={`nav-item ${
              currentPage === "analytics" ? "active" : ""
            }`}
            onClick={() => setCurrentPage("analytics")}
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

      {/* RIGHT SIDE */}
      <div className="navbar-bottom">
        {/* DARK / LIGHT MODE — BOTH MODES */}
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

        {/* SETTINGS — BOTH MODES */}
        <button
          type="button"
          className={`nav-item ${
            currentPage === "settings" ? "active" : ""
          }`}
          onClick={() => setCurrentPage("settings")}
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
      </div>
    </nav>
  );
}

export default Navbar;
