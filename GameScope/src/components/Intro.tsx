import { useEffect, useRef, useState } from "react";
import "./Intro.css";
import logo from "../img/gamescope-logo-light.png";
import type { Page, Mode } from "../type";


interface IntroProps {
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  mode: Mode;
  setMode: React.Dispatch<React.SetStateAction<Mode>>;
  onGetStarted: () => void;
  onLoginClick: () => void;

}

// Clicking CREDIT adds one; reaching this spins the reel for a jackpot
const JACKPOT_CREDITS = 10;
const JACKPOT_POINTS = 1000;

function Intro({
  darkMode,
  setDarkMode,
  mode,
  setMode,
  onGetStarted,
  onLoginClick,
}: IntroProps) {
  // Arcade controls: ← / → pick a player, Enter presses start
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") setMode("player");
      if (event.key === "ArrowRight") setMode("developer");

      const target = event.target as HTMLElement;
      if (
        event.key === "Enter" &&
        !target.closest("button, a, input, select, textarea")
      ) {
        onGetStarted();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [setMode, onGetStarted]);

  const [credits, setCredits] = useState(1);
  const [hiScore, setHiScore] = useState(500);
  const [reel, setReel] = useState<string | null>(null);
  const [jackpot, setJackpot] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((id) => {
        window.clearTimeout(id);
        window.clearInterval(id);
      });
    };
  }, []);

  const insertCredit = () => {
    if (reel !== null || jackpot) return;

    const next = credits + 1;
    if (next < JACKPOT_CREDITS) {
      setCredits(next);
      return;
    }

    setCredits(JACKPOT_CREDITS);

    const showJackpot = () => {
      setReel(null);
      setJackpot(true);
      setHiScore((score) => score + JACKPOT_POINTS);
      timers.current.push(
        window.setTimeout(() => {
          setJackpot(false);
          setCredits(1);
        }, 1400)
      );
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      showJackpot();
      return;
    }

    const spin = window.setInterval(() => {
      setReel(String(Math.floor(Math.random() * 100)).padStart(2, "0"));
    }, 70);

    timers.current.push(
      spin,
      window.setTimeout(() => {
        window.clearInterval(spin);
        showJackpot();
      }, 900)
    );
  };

  const isPlayer = mode === "player";

  return (
    <div className={`intro-page arcade-page ${darkMode ? "intro-dark" : ""}`}>
      <main className="intro-main">
        {/* Arcade start screen */}
        <section
          className={`arcade-cabinet ${isPlayer ? "arcade-p1" : "arcade-p2"} ${
            jackpot ? "arcade-jackpot" : ""
          }`}
          aria-label="GameScope start screen"
        >
          <div className="arcade-screen">
            <header className="arcade-top">
              <div className="arcade-brand">
                <img src={logo} alt="" />
                GAMESCOPE
              </div>

              <span className="arcade-hiscore">
                HI-SCORE {String(hiScore).padStart(6, "0")}
              </span>

              <div className="arcade-top-actions">
                <button
                  type="button"
                  className="arcade-login"
                  onClick={onLoginClick}
                  aria-label="Go to Login"
                >
                  LOGIN
                </button>

                <button
                  type="button"
                  className="arcade-theme"
                  onClick={() => setDarkMode((current) => !current)}
                  aria-label="Toggle dark mode"
                >
                  {darkMode ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
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
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                  )}
                </button>
              </div>
            </header>

            <div key={mode} className="arcade-hero">
              <span className="arcade-badge">
                STEAM FEEDBACK INTELLIGENCE
              </span>

              <h1>
                {isPlayer ? (
                  <>
                    <span>REAL GAME REVIEWS</span>
                    <span className="arcade-highlight">FROM REAL PEOPLE.</span>
                  </>
                ) : (
                  <>
                    <span>UNDERSTAND WHAT YOUR</span>
                    <span className="arcade-highlight">
                      PLAYERS REALLY THINK.
                    </span>
                  </>
                )}
              </h1>

              <p>
                {isPlayer
                  ? "We filter out the slop and spam for you, so you can figure out what's actually worth your time."
                  : "Steam reviews and feedback that you can actually use."}
              </p>
            </div>

            <p className="arcade-select-label">- SELECT PLAYER -</p>

            <div
              className="arcade-slots"
              role="group"
              aria-label="Choose GameScope mode"
            >
              <button
                type="button"
                className={`arcade-slot arcade-slot-p1 ${
                  isPlayer ? "active" : ""
                }`}
                onClick={() => setMode("player")}
                aria-pressed={isPlayer}
              >
                <span className="arcade-slot-head">
                  <span className="arcade-slot-number">PLAYER 1</span>
                  <span className="arcade-cursor" aria-hidden="true">
                    ◀
                  </span>
                </span>

                <span className="arcade-slot-role">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 9h12a4 4 0 0 1 3.8 5.3l-1 3a2 2 0 0 1-3.2 1l-3-2.3h-5.2l-3 2.3a2 2 0 0 1-3.2-1l-1-3A4 4 0 0 1 6 9Z" />
                    <path d="M8 12v4" />
                    <path d="M6 14h4" />
                    <path d="M16 13h.01" />
                    <path d="M18 15h.01" />
                  </svg>
                  PLAYER
                </span>

                <span className="arcade-slot-text">
                  Discover games and see what players really say.
                </span>
              </button>

              <button
                type="button"
                className={`arcade-slot arcade-slot-p2 ${
                  !isPlayer ? "active" : ""
                }`}
                onClick={() => setMode("developer")}
                aria-pressed={!isPlayer}
              >
                <span className="arcade-slot-head">
                  <span className="arcade-cursor" aria-hidden="true">
                    ▶
                  </span>
                  <span className="arcade-slot-number">PLAYER 2</span>
                </span>

                <span className="arcade-slot-role">
                  DEVELOPER
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 3v18h18" />
                    <path d="m8 14 4-4 4 3 5-7" />
                  </svg>
                </span>

                <span className="arcade-slot-text">
                  Find recurring issues and track your fixes.
                </span>
              </button>
            </div>

            <div className="arcade-start-row">
              <button
                type="button"
                className="arcade-start"
                onClick={onGetStarted}
              >
                PRESS START ▶
              </button>

              <p className="arcade-mode">
                {isPlayer ? "1P MODE · PLAYER" : "2P MODE · DEVELOPER"}
              </p>
            </div>

            <footer className="arcade-bottom">
              <span>© 2026 GAMESCOPE</span>
              <button
                type="button"
                className={`arcade-credit ${reel !== null ? "spinning" : ""} ${
                  jackpot ? "jackpot" : ""
                }`}
                onClick={insertCredit}
                aria-label={`Insert credit, ${credits} of ${JACKPOT_CREDITS}`}
              >
                <span aria-live="polite">
                  {jackpot
                    ? "JACKPOT!"
                    : `CREDIT ${reel ?? String(credits).padStart(2, "0")}`}
                </span>
              </button>
            </footer>
          </div>
        </section>
      </main>
    </div>
  );
}

export default Intro;