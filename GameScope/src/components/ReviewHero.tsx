import { useEffect, useState } from "react";
import { getSteamStanding, getTrending, recordSearch } from "../api";
import { getSteamImageSources, getSteamPortraitSources } from "../steamImages";
import type { Mode } from "../type";
import "./ReviewHero.css";

/*
 * The big GAMESCOPE hero on Player Home and the developer Dashboard:
 * a game search with live results and the most-searched games.
 * Green for players, purple for developers.
 */

export interface SearchGame {
  name: string;
  appId: string;
  image?: string | null;
}

interface CardGame {
  appId: string;
  name: string;
  searches: number | null; // null until the counts load
}

// Fill the cards until three games have been searched
const FALLBACK_GAMES = [
  { appId: "730", name: "Counter-Strike 2" },
  { appId: "275850", name: "No Man's Sky" },
  { appId: "2050650", name: "Resident Evil 4" },
];

const TRENDING_SLOTS = 3;

// Most-searched first, topped up with the fallbacks (0 searches once
// the counts have loaded, no count if they couldn't load)
function rankCards(trending: CardGame[], loaded: boolean): CardGame[] {
  const fill = FALLBACK_GAMES.filter(
    (fallback) => !trending.some((game) => game.appId === fallback.appId)
  ).map((fallback) => ({ ...fallback, searches: loaded ? 0 : null }));

  return [...trending, ...fill].slice(0, TRENDING_SLOTS);
}

// ==================================================
// SEARCH RESULT
// Thumbnail, name and Steam's rating ("Very Positive", ...)
// ==================================================

function standingTone(score: number): string {
  if (score >= 6) return "positive";
  if (score === 5) return "mixed";
  if (score >= 1) return "negative";
  return "unknown";
}

function ResultThumb({ game }: { game: SearchGame }) {
  const sources = getSteamImageSources(game.appId, game.image);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [game.appId, game.image]);

  if (sourceIndex >= sources.length) {
    return (
      <span className="ph-result-thumb ph-result-thumb-fallback">
        {(game.name || "G").charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      className="ph-result-thumb"
      src={sources[sourceIndex]}
      alt=""
      loading="lazy"
      onError={() => setSourceIndex((index) => index + 1)}
    />
  );
}

function ResultRow({
  game,
  active,
  onHover,
  onPick,
}: {
  game: SearchGame;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const [standing, setStanding] = useState({
    text: "Checking Steam...",
    tone: "unknown",
  });

  useEffect(() => {
    const controller = new AbortController();

    getSteamStanding(game.appId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setStanding({
            text: result.summary ?? "No Steam reviews yet",
            tone: standingTone(result.score),
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStanding({ text: "Rating unavailable", tone: "unknown" });
        }
      });

    return () => controller.abort();
  }, [game.appId]);

  return (
    <button
      type="button"
      id={`ph-result-${game.appId}`}
      className={`ph-result ${active ? "active" : ""}`}
      role="option"
      aria-selected={active}
      onClick={onPick}
      onMouseEnter={onHover}
    >
      <span className="ph-result-main">
        <ResultThumb game={game} />
        <span className="ph-result-name">{game.name}</span>
      </span>

      <span className="ph-result-details">
        <span className="ph-result-appid">App ID: {game.appId}</span>
        <strong
          className={`ph-result-standing standing-${
            active ? "cta" : standing.tone
          }`}
        >
          {active ? "FIGURE OUT WHY →" : standing.text}
        </strong>
      </span>
    </button>
  );
}

// ==================================================
// TRENDING CARD
// Portrait Steam art that tilts toward the mouse
// ==================================================

function TrendingCard({
  game,
  rank,
  onPick,
}: {
  game: CardGame;
  rank: number;
  onPick: () => void;
}) {
  const sources = getSteamPortraitSources(game.appId);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setSourceIndex(0);
  }, [game.appId]);

  const featured = rank === 1;
  const searches = game.searches;
  const searchLabel =
    searches === null
      ? ""
      : `${searches.toLocaleString()} ${searches === 1 ? "SEARCH" : "SEARCHES"}`;

  const handleMove = (event: React.MouseEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setTilt({
      x: (event.clientX - box.left) / box.width - 0.5,
      y: (event.clientY - box.top) / box.height - 0.5,
    });
  };

  return (
    <div className={`ph-card-slot ${featured ? "ph-card-slot-featured" : ""}`}>
      <button
        type="button"
        className="ph-card"
        style={
          {
            "--tilt-x": `${tilt.x * 14}deg`,
            "--tilt-y": `${tilt.y * -14}deg`,
          } as React.CSSProperties
        }
        onMouseMove={handleMove}
        onMouseLeave={() => setTilt({ x: 0, y: 0 })}
        onClick={onPick}
        aria-label={`Trending #${rank}: ${game.name}${
          searchLabel ? `, ${searchLabel.toLowerCase()}` : ""
        }. Select this game.`}
      >
        {featured && <span className="ph-card-ribbon">MOST SEARCHED</span>}

        <span className="ph-card-frame">
          {sourceIndex < sources.length ? (
            <img
              src={sources[sourceIndex]}
              alt=""
              onError={() => setSourceIndex((index) => index + 1)}
            />
          ) : (
            <span className="ph-card-fallback">{game.name.charAt(0)}</span>
          )}
          <span className="ph-card-name">{game.name}</span>
        </span>
      </button>

      <span className="ph-card-stat" aria-hidden="true">
        {searchLabel}
      </span>
    </div>
  );
}

// ==================================================
// HERO
// ==================================================

interface ReviewHeroProps {
  mode: Mode;
  announcement: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  // Results to list; pass none once a game is picked
  results: SearchGame[];
  searching: boolean;
  onSelect: (game: SearchGame) => void;
  onSubmit: () => void;
  status: string;
  statusIsError?: boolean;
  buttonLabel: string;
  buttonDisabled?: boolean;
  links: { label: string; onClick: () => void }[];
}

function ReviewHero({
  mode,
  announcement,
  searchValue,
  onSearchChange,
  results,
  searching,
  onSelect,
  onSubmit,
  status,
  statusIsError = false,
  buttonLabel,
  buttonDisabled = false,
  links,
}: ReviewHeroProps) {
  const [activeResult, setActiveResult] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const [cards, setCards] = useState<CardGame[]>(() => rankCards([], false));

  useEffect(() => {
    setActiveResult(-1);
    setDismissed(false);
  }, [results]);

  // The most-searched game takes the middle card; reloads after each search
  const loadTrending = (signal?: AbortSignal) =>
    getTrending(TRENDING_SLOTS, signal)
      .then((trending) => setCards(rankCards(trending, true)))
      .catch(() => undefined);

  useEffect(() => {
    const controller = new AbortController();
    void loadTrending(controller.signal);
    return () => controller.abort();
  }, []);

  // Picking a search result counts as one search (clicking a card doesn't)
  const pick = (game: SearchGame) => {
    recordSearch(game.appId)
      .then(() => loadTrending())
      .catch(() => undefined);

    onSelect(game);
  };

  // Shown left to right as #2, #1, #3 so the top game sits in the middle
  const displayOrder = [cards[1], cards[0], cards[2]]
    .map((game, index) => ({ game, rank: [2, 1, 3][index] }))
    .filter((card): card is { game: CardGame; rank: number } => Boolean(card.game));

  const open = results.length > 0 && !dismissed;

  // ↑ / ↓ move the highlight, Enter picks it, Esc closes the list
  const handleKeys = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveResult((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveResult((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && activeResult >= 0) {
      event.preventDefault();
      pick(results[activeResult]);
    } else if (event.key === "Escape") {
      setDismissed(true);
    }
  };

  return (
    <section className={`ph-hero ${mode === "developer" ? "ph-hero-dev" : ""}`}>
      {/* Roughens the edges of the big title */}
      <svg className="ph-filters" aria-hidden="true">
        <filter id="ph-rough">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves="2"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="4"
            result="rough"
          />
          <feTurbulence type="fractalNoise" baseFrequency="1.4" result="specks" />
          <feColorMatrix
            in="specks"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -24 0 0 0 18.5"
            result="speckMask"
          />
          <feComposite in="rough" in2="speckMask" operator="in" />
        </filter>
      </svg>

      <div className="ph-hero-inner">
        <div className="ph-hero-copy">
          <p className="ph-announce">
            <span className="ph-announce-tag">NEW</span>
            {announcement}
          </p>

          <h1 className="ph-title">GAMESCOPE</h1>
          <p className="ph-subtitle">REVIEW TRACKER</p>

          <form
            className="ph-search"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <div className="ph-search-field">
              <svg className="ph-search-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>

              <input
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
                onKeyDown={handleKeys}
                placeholder="SEARCH A GAME..."
                aria-label="Search a Steam game or enter its App ID"
                aria-autocomplete="list"
                aria-controls="ph-search-results"
                aria-activedescendant={
                  open && activeResult >= 0
                    ? `ph-result-${results[activeResult]?.appId}`
                    : undefined
                }
                autoComplete="off"
              />

              {searching && (
                <span className="ph-spinner" role="status" aria-label="Searching Steam" />
              )}
            </div>

            <button
              type="submit"
              className="ph-search-button"
              disabled={buttonDisabled}
            >
              {buttonLabel}
            </button>

            {open && (
              <div
                id="ph-search-results"
                className="ph-results"
                role="listbox"
                aria-label="Matching Steam games"
                onMouseLeave={() => setActiveResult(-1)}
              >
                {results.map((game, index) => (
                  <ResultRow
                    key={game.appId}
                    game={game}
                    active={index === activeResult}
                    onHover={() => setActiveResult(index)}
                    onPick={() => pick(game)}
                  />
                ))}
              </div>
            )}
          </form>

          <p className="ph-status" aria-live="polite">
            {statusIsError ? (
              <span className="ph-status-error" role="alert">
                {status}
              </span>
            ) : (
              status
            )}
          </p>

          <div className="ph-links">
            {links.map((link) => (
              <button type="button" key={link.label} onClick={link.onClick}>
                {link.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ph-trending" aria-label="Most searched games">
          {displayOrder.map(({ game, rank }) => (
            <TrendingCard
              key={game.appId}
              game={game}
              rank={rank}
              onPick={() => onSelect({ appId: game.appId, name: game.name })}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default ReviewHero;
