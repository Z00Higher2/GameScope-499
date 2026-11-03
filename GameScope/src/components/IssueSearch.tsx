import { useEffect, useMemo, useState } from "react";
import { getTopics, searchTopic } from "../api";
import type { TopicSearchResult } from "../api";
import "./IssueSearch.css";

/*
 * Issues page > Compare across games: how players talk about one topic
 * in every analyzed game.
 */

interface IssueSearchProps {
  topic: string;
  setTopic: (topic: string) => void;
  onOpenGame: (appId: string) => Promise<void>;
  onAnalyzeMore: () => void;
}

type GameStanding = TopicSearchResult["games"][number];
type SortKey = "praise" | "complaints" | "improving" | "mentions";

// Complaint-rate changes smaller than this count as steady
const STEADY_CHANGE = 5;

function describeTrend(game: GameStanding) {
  if (!game.trend) {
    return { label: "Not enough data", className: "trend-unknown" };
  }

  const change = game.trend.change;

  if (change <= -STEADY_CHANGE) {
    return { label: `Improving · ${-change} pts fewer complaints`, className: "trend-improving" };
  }

  if (change >= STEADY_CHANGE) {
    return { label: `Worsening · ${change} pts more complaints`, className: "trend-worsening" };
  }

  return { label: "Steady", className: "trend-steady" };
}

function sortGames(games: GameStanding[], sortBy: SortKey) {
  return [...games].sort((a, b) => {
    switch (sortBy) {
      case "complaints":
        return a.complaintRate - b.complaintRate;
      case "improving":
        return (
          (a.trend?.change ?? Infinity) - (b.trend?.change ?? Infinity)
        );
      case "mentions":
        return b.mentions - a.mentions;
      case "praise":
      default:
        return b.praiseRate - a.praiseRate;
    }
  });
}

function IssueSearch({
  topic,
  setTopic,
  onOpenGame,
  onAnalyzeMore,
}: IssueSearchProps) {
  const [topics, setTopics] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("praise");
  const [minMentions, setMinMentions] = useState(5);

  const [result, setResult] = useState<TopicSearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openingAppId, setOpeningAppId] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    getTopics(controller.signal)
      .then(setTopics)
      .catch(() => undefined);

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError("");

    searchTopic(topic, minMentions, controller.signal)
      .then(setResult)
      .catch((searchFailure: Error) => {
        if (searchFailure.name !== "AbortError") {
          setResult(null);
          setError(searchFailure.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [topic, minMentions]);

  const games = useMemo(
    () => sortGames(result?.games ?? [], sortBy),
    [result, sortBy]
  );

  const openGame = async (appId: string) => {
    setOpeningAppId(appId);
    setError("");

    try {
      await onOpenGame(appId);
    } catch (openFailure) {
      setError(
        openFailure instanceof Error
          ? openFailure.message
          : "The game couldn't be opened."
      );
      setOpeningAppId("");
    }
  };

  return (
    <section className="issues-card">
      <div className="issues-card-header">
        <div>
          <span className="issues-card-label">
            ACROSS ANALYZED GAMES
          </span>
          <h2>How do games do on {topic}?</h2>
          <p className="issues-section-subtitle">
            Every analyzed game that mentions {topic.toLowerCase()} in at
            least {minMentions} reviews.
          </p>
        </div>

        <span className="issues-card-count">
          {games.length} {games.length === 1 ? "game" : "games"}
        </span>
      </div>

      <div className="issues-filters search-filters">
        <label className="issues-filter-control">
          <span>Topic</span>
          <select
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
          >
            {(topics.length ? topics : [topic]).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="issues-filter-control">
          <span>Sort by</span>
          <select
            value={sortBy}
            onChange={(event) =>
              setSortBy(event.target.value as SortKey)
            }
          >
            <option value="praise">Most praised</option>
            <option value="complaints">Fewest complaints</option>
            <option value="improving">Most improved</option>
            <option value="mentions">Most mentions</option>
          </select>
        </label>

        <label className="issues-filter-control">
          <span>Minimum mentions</span>
          <input
            type="number"
            min={1}
            max={5000}
            value={minMentions}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isInteger(value) && value >= 1) {
                setMinMentions(value);
              }
            }}
          />
        </label>
      </div>

      <div className="issues-list" aria-live="polite">
        {loading && !result && (
          <div className="issues-empty-state">
            <h3>Searching analyzed games...</h3>
          </div>
        )}

        {error && (
          <div className="issues-empty-state">
            <h3>Something went wrong</h3>
            <p>{error}</p>
          </div>
        )}

        {!error &&
          games.map((game, index) => {
            const trend = describeTrend(game);

            return (
              <article className="search-row" key={game.appId}>
                <div className="search-row-top">
                  <div className="issue-row-title">
                    <strong>
                      {index + 1}. {game.name}
                    </strong>
                    <span>
                      {game.mentions.toLocaleString()} of{" "}
                      {game.totalReviews.toLocaleString()} reviews
                      mention {topic.toLowerCase()}
                    </span>
                  </div>

                  <div className="issue-row-badges">
                    <span className={`search-trend ${trend.className}`}>
                      {trend.label}
                    </span>

                    {game.status && (
                      <span
                        className={`status-badge status-${game.status
                          .toLowerCase()
                          .replace(/\s+/g, "-")}`}
                      >
                        {game.status}
                      </span>
                    )}
                  </div>
                </div>

                <div className="search-row-bars">
                  <div className="search-bar">
                    <span>Praised</span>
                    <div className="search-bar-track">
                      <div
                        className="search-bar-fill praise"
                        style={{ width: `${game.praiseRate}%` }}
                      />
                    </div>
                    <strong>{game.praiseRate}%</strong>
                  </div>

                  <div className="search-bar">
                    <span>Complaints</span>
                    <div className="search-bar-track">
                      <div
                        className="search-bar-fill complaint"
                        style={{ width: `${game.complaintRate}%` }}
                      />
                    </div>
                    <strong>{game.complaintRate}%</strong>
                  </div>
                </div>

                <div className="search-row-footer">
                  <span>
                    {game.trend
                      ? `Complaints ${game.trend.earlierComplaintRate}% → ${game.trend.recentComplaintRate}% since ${new Date(game.trend.since).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                      : "Too few mentions to compare older and newer reviews"}
                  </span>

                  <button
                    type="button"
                    className="issues-primary-button"
                    onClick={() => openGame(game.appId)}
                    disabled={openingAppId !== ""}
                  >
                    {openingAppId === game.appId
                      ? "Opening..."
                      : "Open this game"}
                  </button>
                </div>
              </article>
            );
          })}

        {!loading && !error && result && games.length === 0 && (
          <div className="issues-empty-state">
            <span aria-hidden="true">⌕</span>
            <h3>No games to compare yet</h3>
            <p>
              No analyzed game mentions {topic.toLowerCase()} in at least{" "}
              {minMentions} reviews. Analyze more games from the Dashboard
              or lower the minimum.
            </p>
            <button
              type="button"
              className="issues-primary-button"
              onClick={onAnalyzeMore}
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>

      <p className="search-footnote">
        Only games already analyzed in GameScope are compared. Praised
        means the topic's part of the review is positive; complaints use
        the same rule as This game. The trend compares complaints in the
        older half of each game's stored reviews with the newer half;
        changes under {STEADY_CHANGE} points count as steady.
      </p>
    </section>
  );
}

export default IssueSearch;
