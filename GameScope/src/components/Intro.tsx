
import { useEffect, useRef, useState } from "react";
import "./Intro.css";
import logo from "../img/gamescope-logo-light.png";

type Mode = "player" | "developer";

interface IntroProps {
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  mode: Mode;
  setMode: React.Dispatch<React.SetStateAction<Mode>>;
  onGetStarted: () => void;
}

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
      },
      {
        threshold: 0.15,
        rootMargin: "0px 0px -40px 0px",
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`scroll-reveal ${
        visible ? "scroll-reveal-visible" : ""
      } ${className}`}
      style={{
        transitionDelay: visible ? `${delay}ms` : "0ms",
      }}
    >
      {children}
    </div>
  );
}

function Intro({
  darkMode,
  setDarkMode,
  mode,
  setMode,
  onGetStarted,
}: IntroProps) {
  return (
    <div className={`intro-page ${darkMode ? "intro-dark" : ""}`}>
      {/* Background */}
      <div className="intro-grid"></div>
      <div className="intro-orb intro-orb-one"></div>
      <div className="intro-orb intro-orb-two"></div>
      <div className="intro-orb intro-orb-three"></div>

      {/* Navigation */}
      <nav className="intro-nav">
        <div className="intro-brand">
          <div className="intro-logo">
            <img src={logo} alt="GameScope logo" />
          </div>
          <span>GameScope</span>
        </div>

        <button
          type="button"
          className="intro-theme-button"
          onClick={() => setDarkMode((current) => !current)}
          aria-label="Toggle dark mode"
        >
          {darkMode ? (
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2" />
              <path d="M12 20v2" />
              <path d="m4.93 4.93 1.41 1.41" />
              <path d="m17.66 17.66 1.41 1.41" />
              <path d="M2 12h2" />
              <path d="M20 12h2" />
              <path d="m6.34 17.66-1.41 1.41" />
              <path d="m19.07 4.93-1.41-1.41" />
            </svg>
          ) : (
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      </nav>

      <main className="intro-main">
        {/* Hero */}
        <Reveal>
          <section className="intro-hero">
            <div className="intro-badge">
              <span className="badge-dot"></span>
              Steam Feedback Intelligence
            </div>

            <h1>
              Understand what your
              <span>players really think.</span>
            </h1>

            <p>
              GameScope transforms Steam reviews into meaningful
              insights, recurring issues, and actionable feedback
              for game developers and players.
            </p>

            {/* Player / Developer mode selector */}
            <div className="intro-mode-selector">
              <span className="intro-mode-label">
                CHOOSE YOUR EXPERIENCE
              </span>

              <div
                className="intro-mode-options"
                role="group"
                aria-label="Choose GameScope mode"
              >
                <button
                  type="button"
                  className={`intro-mode-option ${
                    mode === "player" ? "active" : ""
                  }`}
                  onClick={() => setMode("player")}
                  aria-pressed={mode === "player"}
                >
                  <span className="intro-mode-icon">
                    <svg
                      width="23"
                      height="23"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 9h12a4 4 0 0 1 3.8 5.3l-1 3a2 2 0 0 1-3.2 1l-3-2.3h-5.2l-3 2.3a2 2 0 0 1-3.2-1l-1-3A4 4 0 0 1 6 9Z" />
                      <path d="M8 12v4" />
                      <path d="M6 14h4" />
                      <path d="M16 13h.01" />
                      <path d="M18 15h.01" />
                    </svg>
                  </span>

                  <span className="intro-mode-copy">
                    <strong>Player</strong>
                    <small>
                      Discover games and explore reviews
                    </small>
                  </span>

                  <span className="intro-mode-check">
                    {mode === "player" ? "✓" : ""}
                  </span>
                </button>

                <button
                  type="button"
                  className={`intro-mode-option ${
                    mode === "developer" ? "active" : ""
                  }`}
                  onClick={() => setMode("developer")}
                  aria-pressed={mode === "developer"}
                >
                  <span className="intro-mode-icon">
                    <svg
                      width="23"
                      height="23"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 3v18h18" />
                      <path d="m8 14 4-4 4 3 5-7" />
                    </svg>
                  </span>

                  <span className="intro-mode-copy">
                    <strong>Developer</strong>
                    <small>
                      Analyze sentiment and player issues
                    </small>
                  </span>

                  <span className="intro-mode-check">
                    {mode === "developer" ? "✓" : ""}
                  </span>
                </button>
              </div>
            </div>

            <button
              type="button"
              className="get-started-button"
              onClick={onGetStarted}
            >
              <span>
                {mode === "player"
                  ? "Explore Games"
                  : "Get Started"}
              </span>

              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </button>
          </section>
        </Reveal>

        {/* Features */}
        <Reveal>
          <section className="intro-features">
            <div className="intro-feature">
              <div className="feature-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 19V5" />
                  <path d="M4 19h16" />
                  <path d="M8 16v-5" />
                  <path d="M12 16V7" />
                  <path d="M16 16v-8" />
                </svg>
              </div>

              <h3>Review Analysis</h3>

              <p>
                Analyze large volumes of Steam reviews and identify
                meaningful patterns in player feedback.
              </p>

              <span className="feature-arrow">→</span>
            </div>

            <div className="intro-feature">
              <div className="feature-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 3v18" />
                  <path d="M3 12h18" />
                  <path d="m5 5 14 14" />
                  <path d="M19 5 5 19" />
                </svg>
              </div>

              <h3>Issue Detection</h3>

              <p>
                Discover recurring problems that players mention most
                often across thousands of reviews.
              </p>

              <span className="feature-arrow">→</span>
            </div>

            <div className="intro-feature">
              <div className="feature-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 3 5 6v5c0 4.5 3 7.5 7 10 4-2.5 7-5.5 7-10V6l-7-3Z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>

              <h3>Feedback Quality</h3>

              <p>
                Separate useful player feedback from vague,
                repetitive, or low-value reviews.
              </p>

              <span className="feature-arrow">→</span>
            </div>
          </section>
        </Reveal>

        {/* Review Quality */}
        <Reveal>
          <section className="review-quality-section">
            <div className="review-quality-heading">
              <div className="intro-badge">
                <span className="badge-dot"></span>
                Review Intelligence
              </div>

              <h2>
                Not every review is
                <span> equally useful.</span>
              </h2>

              <p>
                GameScope looks beyond simple positive and negative
                sentiment to identify how useful each review actually is.
              </p>
            </div>

            <div className="review-showcase">
              <div className="review-card">
                <div className="review-card-top">
                  <div className="review-label">
                    <span className="review-status-dot"></span>
                    Low Reliability
                  </div>
                  <div className="review-score">
                    18<span>%</span>
                  </div>
                </div>

                <div className="reliability-bar">
                  <div
                    className="reliability-fill"
                    style={{ width: "18%" }}
                  ></div>
                </div>

                <blockquote>
                  "Great update, looking forward to the next one."
                </blockquote>

                <div className="review-reasons">
                  <div className="review-reason">
                    <span className="reason-check">✓</span>
                    Very little detail
                  </div>
                  <div className="review-reason">
                    <span className="reason-check">✓</span>
                    No specific issue
                  </div>
                </div>
              </div>

              <div className="review-card">
                <div className="review-card-top">
                  <div className="review-label">
                    <span className="review-status-dot"></span>
                    Moderate Reliability
                  </div>
                  <div className="review-score">
                    41<span>%</span>
                  </div>
                </div>

                <div className="reliability-bar">
                  <div
                    className="reliability-fill"
                    style={{ width: "41%" }}
                  ></div>
                </div>

                <blockquote>
                  "The new update is fun, but the inventory feels harder
                  to manage."
                </blockquote>

                <div className="review-reasons">
                  <div className="review-reason">
                    <span className="reason-check">✓</span>
                    Specific complaint
                  </div>
                  <div className="review-reason">
                    <span className="reason-check">✓</span>
                    Some useful context
                  </div>
                </div>
              </div>

              <div className="review-card">
                <div className="review-card-top">
                  <div className="review-label">
                    <span className="review-status-dot"></span>
                    High Reliability
                  </div>
                  <div className="review-score">
                    94<span>%</span>
                  </div>
                </div>

                <div className="reliability-bar">
                  <div
                    className="reliability-fill"
                    style={{ width: "94%" }}
                  ></div>
                </div>

                <blockquote>
                  "Performance drops during large multiplayer fights,
                  especially when several effects appear at once."
                </blockquote>

                <div className="review-reasons">
                  <div className="review-reason">
                    <span className="reason-check">✓</span>
                    Specific problem
                  </div>
                  <div className="review-reason">
                    <span className="reason-check">✓</span>
                    Reproducible context
                  </div>
                </div>
              </div>
            </div>

            <div className="quality-note">
              <div className="quality-note-icon">i</div>
              <p>
                <strong>Why this matters:</strong> a review can be
                positive or negative while still providing little useful
                information. GameScope evaluates the quality of the
                feedback itself.
              </p>
            </div>
          </section>
        </Reveal>

        {/* Dashboard Preview */}
        <Reveal>
          <section className="intro-preview">
            <div className="preview-window">
              <div className="preview-top">
                <div className="preview-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>

                <div className="preview-title">
                  GameScope Dashboard
                </div>

                <div className="preview-live">
                  <span></span>
                  Live Analysis
                </div>
              </div>

              <div className="preview-content">
                <div className="preview-header">
                  <div>
                    <span className="preview-small-label">
                      Game Analysis
                    </span>
                    <h3>Path of Exile 2</h3>
                  </div>

                  <div className="preview-score">
                    <span>Review Quality</span>
                    <strong>78%</strong>
                  </div>
                </div>

                <div className="preview-stats">
                  <div className="preview-stat">
                    <span>Total Reviews</span>
                    <strong>1,284</strong>
                  </div>
                  <div className="preview-stat">
                    <span>Positive</span>
                    <strong>72%</strong>
                  </div>
                  <div className="preview-stat">
                    <span>Negative</span>
                    <strong>28%</strong>
                  </div>
                </div>

                <div className="preview-bottom">
                  <div className="preview-chart">
                    <div className="chart-label">
                      Review Sentiment
                    </div>

                    <div className="chart-bars">
                      <span style={{ height: "45%" }}></span>
                      <span style={{ height: "65%" }}></span>
                      <span style={{ height: "55%" }}></span>
                      <span style={{ height: "80%" }}></span>
                      <span style={{ height: "70%" }}></span>
                      <span style={{ height: "92%" }}></span>
                      <span style={{ height: "76%" }}></span>
                    </div>
                  </div>

                  <div className="preview-issues">
                    <div className="chart-label">Top Issues</div>

                    <div className="issue-line">
                      <span>Inventory</span>
                      <div><i style={{ width: "100%" }}></i></div>
                    </div>

                    <div className="issue-line">
                      <span>Performance</span>
                      <div><i style={{ width: "73%" }}></i></div>
                    </div>

                    <div className="issue-line">
                      <span>Multiplayer</span>
                      <div><i style={{ width: "50%" }}></i></div>
                    </div>

                    <div className="issue-line">
                      <span>Bugs</span>
                      <div><i style={{ width: "41%" }}></i></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </Reveal>
      </main>

      {/* Footer */}
      <Reveal>
        <footer className="intro-footer">
          <div className="footer-brand">
            <div className="footer-logo">G</div>
            GameScope
          </div>

          <p>
            Turning player feedback into meaningful insight.
          </p>
        </footer>
      </Reveal>
    </div>
  );
}

export default Intro;
