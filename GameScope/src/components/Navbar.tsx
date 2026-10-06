import "./Navbar.css";
import logo from "../img/gamescope-logo-light.png";

interface NavbarProps {
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;

  currentPage: "dashboard" | "reviews" | "analytics";

  setCurrentPage: React.Dispatch<
    React.SetStateAction<
      "dashboard" | "reviews" | "analytics"
    >
  >;

  onLogoClick: () => void;
}

function Navbar({
  darkMode,
  setDarkMode,
  currentPage,
  setCurrentPage,
  onLogoClick,
}: NavbarProps) {
  return (
    <nav
      className={`navbar ${
        darkMode ? "dark-navbar" : ""
      }`}
    >
      {/* ==================================================
          LOGO
      ================================================== */}

      <button
        type="button"
        className="navbar-logo"
        onClick={onLogoClick}
        aria-label="Go to GameScope home"
      >
        <div className="logo-icon">
          <img
            src={logo}
            alt="GameScope logo"
          />
        </div>

        <div className="logo-text">
          <h2>GameScope</h2>
          <span>Feedback Analyzer</span>
        </div>
      </button>

      {/* ==================================================
          MAIN NAVIGATION
      ================================================== */}

      <div className="navbar-menu">

        {/* DASHBOARD */}

        <button
          type="button"
          className={`nav-item ${
            currentPage === "dashboard"
              ? "active"
              : ""
          }`}
          onClick={() =>
            setCurrentPage("dashboard")
          }
        >
          <span className="nav-icon">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M3 11.5L12 4l9 7.5" />
              <path d="M5.5 10.5V20h13v-9.5" />
              <path d="M9.5 20v-5.5h5V20" />
            </svg>
          </span>

          <span className="nav-text">
            Dashboard
          </span>
        </button>

        {/* REVIEWS */}

        <button
          type="button"
          className={`nav-item ${
            currentPage === "reviews"
              ? "active"
              : ""
          }`}
          onClick={() =>
            setCurrentPage("reviews")
          }
        >
          <span className="nav-icon">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M5 4h14v16H5z" />
              <path d="M8 8h8" />
              <path d="M8 12h8" />
              <path d="M8 16h5" />
            </svg>
          </span>

          <span className="nav-text">
            Reviews
          </span>
        </button>

        {/* ISSUES PLACEHOLDER */}

        <button
          type="button"
          className="nav-item"
          onClick={() => {
            // Issues page can be added later.
          }}
        >
          <span className="nav-icon">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12 3l9 18H3L12 3z" />
              <path d="M12 9v5" />
              <circle
                cx="12"
                cy="17"
                r=".7"
              />
            </svg>
          </span>

          <span className="nav-text">
            Issues
          </span>
        </button>

        {/* ANALYTICS */}

        <button
          type="button"
          className={`nav-item ${
            currentPage === "analytics"
              ? "active"
              : ""
          }`}
          onClick={() =>
            setCurrentPage("analytics")
          }
        >
          <span className="nav-icon">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M4 19V5" />
              <path d="M4 19h17" />
              <path d="M7 15l4-4 3 2 5-6" />
            </svg>
          </span>

          <span className="nav-text">
            Analytics
          </span>
        </button>
      </div>

      {/* ==================================================
          RIGHT SIDE
      ================================================== */}

      <div className="navbar-bottom">

        {/* DARK / LIGHT MODE */}

        <button
          type="button"
          className="theme-toggle"
          onClick={() =>
            setDarkMode(
              (current) => !current
            )
          }
          aria-label="Toggle dark mode"
        >
          <span className="nav-icon">
            {darkMode ? (
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="4"
                />

                <path d="M12 2v2" />
                <path d="M12 20v2" />

                <path d="M4.93 4.93l1.42 1.42" />
                <path d="M17.65 17.65l1.42 1.42" />

                <path d="M2 12h2" />
                <path d="M20 12h2" />

                <path d="M4.93 19.07l1.42-1.42" />
                <path d="M17.65 6.35l1.42-1.42" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M21 14.5A8.5 8.5 0 019.5 3 8.5 8.5 0 1021 14.5z" />
              </svg>
            )}
          </span>

          <span className="nav-text">
            {darkMode
              ? "Light Mode"
              : "Dark Mode"}
          </span>
        </button>

        {/* SETTINGS PLACEHOLDER */}

        <button
          type="button"
          className="nav-item"
          onClick={() => {
            // Settings page can be added later.
          }}
        >
          <span className="nav-icon">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r="3"
              />

              <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1-1.7 1.7-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V20h-2.4v-.2a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.3l-.1.1L8 17l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H6V11.6h.9a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9L8 8.6l1.7-1.7.1.1a1.7 1.7 0 001.9.3 1.7 1.7 0 001-1.5V5.6h2.4v.2a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1 1.7 1.7-.1.1a1.7 1.7 0 00-.3 1.9 1.7 1.7 0 001.5 1h.2V14h-.2a1.7 1.7 0 00-1.5 1z" />
            </svg>
          </span>

          <span className="nav-text">
            Settings
          </span>
        </button>
      </div>
    </nav>
  );
}

export default Navbar;