import { useEffect, useMemo, useState } from "react";
import Navbar from "./Navbar";
import { getIssues } from "../api";
import type { IssuesReport } from "../api";
import "./Issues.css";
import type { Page, Mode } from "../type";

interface IssuesProps {
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  currentPage: Page;
  setCurrentPage: React.Dispatch<
    React.SetStateAction<Page>
  >;
  onLogoClick: () => void;
  analyzed: boolean;
  analyzedAppId: string;
  mode: Mode;
}

type Priority = "Critical" | "High" | "Medium" | "Low";
type IssueStatus =
  | "Detected"
  | "Investigating"
  | "In Progress"
  | "Resolved";
type Sentiment = "positive" | "negative";

interface Issue {
  name: string;
  mentions: number;
  negative: number;
  positive: number;
  helpfulVotes: number;
  description: string;
  priority: Priority;
  examples: {
    type: Sentiment;
    text: string;
  }[];
  trend: number[];
}

/**
 * WORKFLOW STATE
 *
 * Statuses are stored in React state only.
 *
 * Proposed persistence endpoint:
 * PATCH /api/games/{appId}/issues/{issueId}/status
 */

const priorities: Priority[] = [
  "Critical",
  "High",
  "Medium",
  "Low",
];

const statusesList: IssueStatus[] = [
  "Detected",
  "Investigating",
  "In Progress",
  "Resolved",
];

function getNegativeRate(issue: Issue): number {
  if (issue.mentions <= 0) return 0;
  return Math.round((issue.negative / issue.mentions) * 100);
}

function getPositiveRate(issue: Issue): number {
  if (issue.mentions <= 0) return 0;
  return Math.round((issue.positive / issue.mentions) * 100);
}

function getPriorityRank(priority: Priority): number {
  return priorities.indexOf(priority);
}

function getStatusClass(status: IssueStatus): string {
  return status.toLowerCase().replace(/\s+/g, "-");
}

function getRecommendation(name: string): string {
  switch (name) {
    case "Performance":
      return "Investigate frame-rate drops and compare player reports against recent game updates.";
    case "Inventory":
      return "Review inventory sorting, filtering, and item-management workflows.";
    case "Bugs":
      return "Group similar bug reports and investigate reproducible gameplay problems.";
    case "Multiplayer":
      return "Examine connection stability and matchmaking feedback across player reports.";
    default:
      return "Review representative player feedback and investigate the most frequently reported problems.";
  }
}

function Issues({
  darkMode,
  setDarkMode,
  currentPage,
  setCurrentPage,
  onLogoClick,
  analyzed,
  analyzedAppId,
  mode,
}: IssuesProps) {
  const [selectedIssueName, setSelectedIssueName] =
    useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [sortBy, setSortBy] = useState("mentions");

  // Changes currently disappear when the page is reloaded.
  const [statuses, setStatuses] =
    useState<Record<string, IssueStatus>>({});

  const [report, setReport] = useState<IssuesReport | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!analyzed || !analyzedAppId) {
      setReport(null);
      return;
    }

    const controller = new AbortController();

    setLoadError("");

    getIssues(analyzedAppId, controller.signal)
      .then((result) => {
        setReport(result);
        setStatuses({});
        setSelectedIssueName(result.issues[0]?.name ?? "");
      })
      .catch((loadFailure: Error) => {
        if (loadFailure.name !== "AbortError") {
          setReport(null);
          setLoadError(loadFailure.message);
        }
      });

    return () => {
      controller.abort();
    };
  }, [analyzed, analyzedAppId]);

  const live = report !== null;
  const issues: Issue[] = report ? report.issues : [];
  const periodLabels = report ? report.trendLabels : [];
  const maxMentions = Math.max(
    1,
    ...issues.map((issue) => issue.mentions)
  );

  /**
   * FILTER AND SORT
   *
   * Client-side filtering is appropriate for this small dataset.
   * Larger datasets may benefit from backend filtering and pagination.
   */
  const filteredIssues = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return issues
      .filter((issue) => {
        const matchesSearch =
          !query ||
          issue.name.toLowerCase().includes(query) ||
          issue.description.toLowerCase().includes(query) ||
          issue.examples.some((example) =>
            example.text.toLowerCase().includes(query)
          );

        const matchesPriority =
          priorityFilter === "All" ||
          issue.priority === priorityFilter;

        const matchesStatus =
          statusFilter === "All" ||
          (statuses[issue.name] ?? "Detected") === statusFilter;

        const matchesCategory =
          categoryFilter === "All" ||
          issue.name === categoryFilter;

        return (
          matchesSearch &&
          matchesPriority &&
          matchesStatus &&
          matchesCategory
        );
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "negative":
            return getNegativeRate(b) - getNegativeRate(a);
          case "priority":
            return (
              getPriorityRank(a.priority) -
              getPriorityRank(b.priority)
            );
          case "name":
            return a.name.localeCompare(b.name);
          case "mentions":
          default:
            return b.mentions - a.mentions;
        }
      });
  }, [
    issues,
    searchQuery,
    priorityFilter,
    statusFilter,
    categoryFilter,
    sortBy,
    statuses,
  ]);

  /**
   * SELECTION FIX
   *
   * If a filter hides the currently selected issue, display the first
   * matching issue instead. If nothing matches, show an empty state.
   * This prevents details from displaying an issue absent from the list.
   */
  const selectedIssue =
    filteredIssues.find(
      (issue) => issue.name === selectedIssueName
    ) ?? filteredIssues[0] ?? null;

  const totalMentions = issues.reduce(
    (total, issue) => total + issue.mentions,
    0
  );

  const totalNegative = issues.reduce(
    (total, issue) => total + issue.negative,
    0
  );

  const negativePercentage =
    totalMentions > 0
      ? Math.round((totalNegative / totalMentions) * 100)
      : 0;

  const highPriorityCount = issues.filter(
    (issue) =>
      issue.priority === "Critical" ||
      issue.priority === "High"
  ).length;

  const resolvedCount = issues.filter(
    (issue) => statuses[issue.name] === "Resolved"
  ).length;

  const changeStatus = (
    name: string,
    status: IssueStatus
  ) => {
    /**
     * BACKEND TODO:
     * Persist the status before treating it as saved.
     * Handle failed API requests and restore the previous value if needed.
     */
    setStatuses((previous) => ({
      ...previous,
      [name]: status,
    }));
  };

  const clearFilters = () => {
    setSearchQuery("");
    setPriorityFilter("All");
    setStatusFilter("All");
    setCategoryFilter("All");
    setSortBy("mentions");
  };

  if (!analyzed || !analyzedAppId) {
    return (
      <div
        className={`issues-page ${darkMode ? "issues-dark" : ""}`}
      >
        <Navbar
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          onLogoClick={onLogoClick}
          mode={mode}
        />

        <main className="issues-main">
          <section className="issues-card issues-detail-empty">
            <h2>No game analyzed yet</h2>
            <p>
              Go back to the Dashboard and analyze a Steam game to see
              its issues here.
            </p>
            <button
              type="button"
              className="issues-primary-button"
              onClick={() => setCurrentPage("dashboard")}
            >
              Go to Dashboard
            </button>
          </section>
        </main>
      </div>
    );
  }

  if (!live) {
    return (
      <div
        className={`issues-page ${darkMode ? "issues-dark" : ""}`}
      >
        <Navbar
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          onLogoClick={onLogoClick}
          mode={mode}
        />

        <main className="issues-main">
          <section className="issues-card issues-detail-empty">
            <h2>
              {loadError ? "Couldn't load issues" : "Loading issues..."}
            </h2>
            <p>
              {loadError ||
                "Finding recurring problems in the analyzed reviews."}
            </p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div
      className={`issues-page ${darkMode ? "issues-dark" : ""}`}
    >
      <Navbar
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        onLogoClick={onLogoClick}
        mode={mode}
      />

      <main className="issues-main">
        <section className="issues-header">
          <span className="issues-label">
            <span className="issues-live-dot" />
            GAMESCOPE / ISSUE INTELLIGENCE
          </span>

          <div className="issues-heading-row">
            <div>
              <h1>Issue Intelligence</h1>
              <p>
                Turn player feedback into actionable insights.
                Discover recurring problems, examine review evidence,
                and track the issues that matter most.
              </p>
            </div>

            <div className="issues-analysis-badge analysis-selected">
              <span className="issues-badge-dot" />
              ANALYSIS SELECTED
              <small>App ID: {analyzedAppId}</small>
            </div>
          </div>
        </section>

        {/* SUMMARY */}
        <section className="issues-stats" aria-label="Issue summary">
          <div className="issues-stat-card stat-purple">
            <span className="stat-icon" aria-hidden="true">◎</span>
            <span className="stat-label">ISSUE CATEGORIES</span>
            <strong>{issues.length}</strong>
            <small>Categories in this view</small>
          </div>

          <div className="issues-stat-card stat-blue">
            <span className="stat-icon" aria-hidden="true">▤</span>
            <span className="stat-label">ISSUE MENTIONS</span>
            <strong>{totalMentions.toLocaleString()}</strong>
            <small>Mentions across categories</small>
          </div>

          <div className="issues-stat-card stat-red">
            <span className="stat-icon" aria-hidden="true">↗</span>
            <span className="stat-label">NEGATIVE ASSOCIATION</span>
            <strong>{negativePercentage}%</strong>
            <small>Negative mentions / all mentions</small>
          </div>

          <div className="issues-stat-card stat-amber">
            <span className="stat-icon" aria-hidden="true">⚑</span>
            <span className="stat-label">HIGH PRIORITY</span>
            <strong>{highPriorityCount}</strong>
            <small>Critical or high-priority categories</small>
          </div>
        </section>

        {/* ISSUE BROWSER */}
        <section className="issues-card issues-browser">
          <div className="issues-card-header">
            <div>
              <span className="issues-card-label">
                REVIEW ANALYSIS
              </span>
              <h2>Detected Issues</h2>
              <p className="issues-section-subtitle">
                Search, prioritize, and inspect recurring feedback.
              </p>
            </div>

            <span className="issues-card-count">
              {filteredIssues.length} of {issues.length}
            </span>
          </div>

          <div className="issues-filters">
            <label className="issues-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                placeholder="Search issues or review text..."
                value={searchQuery}
                onChange={(event) =>
                  setSearchQuery(event.target.value)
                }
                aria-label="Search issues or review text"
              />
            </label>

            <label className="issues-filter-control">
              <span>Priority</span>
              <select
                value={priorityFilter}
                onChange={(event) =>
                  setPriorityFilter(event.target.value)
                }
                aria-label="Filter by priority"
              >
                <option value="All">All priorities</option>
                {priorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>

            <label className="issues-filter-control">
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
                aria-label="Filter by status"
              >
                <option value="All">All statuses</option>
                {statusesList.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="issues-filter-control">
              <span>Category</span>
              <select
                value={categoryFilter}
                onChange={(event) =>
                  setCategoryFilter(event.target.value)
                }
                aria-label="Filter by category"
              >
                <option value="All">All categories</option>
                {issues.map((issue) => (
                  <option key={issue.name} value={issue.name}>
                    {issue.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="issues-filter-control">
              <span>Sort by</span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                aria-label="Sort issues"
              >
                <option value="mentions">Most mentions</option>
                <option value="negative">Highest negative rate</option>
                <option value="priority">Highest priority</option>
                <option value="name">Name A–Z</option>
              </select>
            </label>

            <button
              type="button"
              className="issues-clear-button"
              onClick={clearFilters}
            >
              Reset filters
            </button>
          </div>

          <div className="issues-list" aria-live="polite">
            {filteredIssues.map((issue) => {
              const negativeRate = getNegativeRate(issue);
              const mentionRate = Math.min(
                100,
                Math.round(
                  (issue.mentions / maxMentions) * 100
                )
              );
              const status = statuses[issue.name] ?? "Detected";
              const isSelected = selectedIssue?.name === issue.name;

              return (
                <button
                  type="button"
                  className={`issue-row ${
                    isSelected ? "selected" : ""
                  }`}
                  key={issue.name}
                  onClick={() => setSelectedIssueName(issue.name)}
                  aria-pressed={isSelected}
                >
                  <div className="issue-row-top">
                    <div className="issue-row-title">
                      <strong>{issue.name}</strong>
                      <span>
                        {issue.mentions.toLocaleString()} mentions
                      </span>
                    </div>

                    <div className="issue-row-badges">
                      <span
                        className={`priority-badge priority-${issue.priority.toLowerCase()}`}
                      >
                        {issue.priority}
                      </span>

                      <span
                        className={`status-badge status-${getStatusClass(status)}`}
                      >
                        {status}
                      </span>
                    </div>
                  </div>

                  <div className="issue-row-bottom">
                    <div
                      className="issue-progress"
                      role="progressbar"
                      aria-label={`${issue.name} mentions relative to the most-mentioned category`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={mentionRate}
                    >
                      <div
                        className="issue-progress-fill"
                        style={{ width: `${mentionRate}%` }}
                      />
                    </div>

                    <div className="issue-row-metrics">
                      <span>{negativeRate}% negative</span>
                      <strong>{issue.mentions.toLocaleString()}</strong>
                    </div>
                  </div>
                </button>
              );
            })}

            {filteredIssues.length === 0 && (
              <div className="issues-empty-state">
                <span aria-hidden="true">⌕</span>
                <h3>No matching issues</h3>
                <p>
                  Try another search term or remove some filters.
                </p>
                <button
                  type="button"
                  className="issues-primary-button"
                  onClick={clearFilters}
                >
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        </section>

        {/* DETAILS: ONLY SHOW WHEN A MATCH EXISTS */}
        {selectedIssue ? (
          <>
            <section className="issue-detail-grid">
              <div className="issues-card issue-detail-card">
                <div className="issues-card-header">
                  <div>
                    <span className="issues-card-label">
                      ISSUE BREAKDOWN
                    </span>
                    <h2>{selectedIssue.name}</h2>
                  </div>

                  <span
                    className={`priority-badge priority-${selectedIssue.priority.toLowerCase()}`}
                  >
                    {selectedIssue.priority} priority
                  </span>
                </div>

                <p className="issue-description">
                  {selectedIssue.description}
                </p>

                <div className="issue-status-editor">
                  <label htmlFor="issue-status-select">
                    Issue status
                  </label>

                  <select
                    id="issue-status-select"
                    value={statuses[selectedIssue.name] ?? "Detected"}
                    onChange={(event) =>
                      changeStatus(
                        selectedIssue.name,
                        event.target.value as IssueStatus
                      )
                    }
                  >
                    {statusesList.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>

                  <span className="issues-status-note">
                    Changes are not saved after refresh
                  </span>
                </div>

                <div className="issue-detail-stats">
                  <div>
                    <span>MENTIONS</span>
                    <strong>
                      {selectedIssue.mentions.toLocaleString()}
                    </strong>
                  </div>

                  <div>
                    <span>NEGATIVE</span>
                    <strong>{getNegativeRate(selectedIssue)}%</strong>
                  </div>

                  <div>
                    <span>POSITIVE</span>
                    <strong>{getPositiveRate(selectedIssue)}%</strong>
                  </div>

                  <div>
                    <span>AVG. HELPFUL VOTES</span>
                    <strong>
                      {selectedIssue.helpfulVotes.toFixed(1)}
                    </strong>
                  </div>
                </div>

                <div className="issue-sentiment">
                  <div
                    className="sentiment-bar"
                    role="img"
                    aria-label={`${getNegativeRate(selectedIssue)} percent negative and ${getPositiveRate(selectedIssue)} percent positive`}
                  >
                    <div
                      className="sentiment-negative"
                      style={{
                        width: `${Math.min(
                          100,
                          (selectedIssue.negative /
                            Math.max(1, selectedIssue.mentions)) *
                            100
                        )}%`,
                      }}
                    />
                    <div
                      className="sentiment-positive"
                      style={{
                        width: `${Math.min(
                          100,
                          (selectedIssue.positive /
                            Math.max(1, selectedIssue.mentions)) *
                            100
                        )}%`,
                      }}
                    />
                  </div>

                  <div className="sentiment-legend">
                    <span>
                      <i className="legend-dot negative-dot" />
                      Negative feedback
                    </span>
                    <span>
                      <i className="legend-dot positive-dot" />
                      Positive feedback
                    </span>
                  </div>
                </div>

                <div className="issues-recommendation">
                  <span className="recommendation-icon" aria-hidden="true">
                    ✦
                  </span>
                  <div>
                    <strong>Suggested next step</strong>
                    <p>{getRecommendation(selectedIssue.name)}</p>
                    <small>
                      Suggested action, not a verified root cause.
                    </small>
                  </div>
                </div>
              </div>

              <div className="issues-card feedback-card">
                <div className="issues-card-header">
                  <div>
                    <span className="issues-card-label">
                      PLAYER FEEDBACK
                    </span>
                    <h2>Review Evidence</h2>
                    <p className="issues-section-subtitle">
                      Comments associated with this issue.
                    </p>
                  </div>

                  <span className="issues-card-count">
                    {selectedIssue.examples.length} examples
                  </span>
                </div>

                <div className="issue-examples">
                  {selectedIssue.examples.map((example, index) => (
                    <article className="issue-example" key={index}>
                      <div className="example-heading">
                        <span className={`example-type ${example.type}`}>
                          <span>
                            {example.type === "positive" ? "+" : "−"}
                          </span>
                          {example.type === "positive"
                            ? "Positive"
                            : "Negative"}
                        </span>

                        <span className="example-number">
                          EXAMPLE {String(index + 1).padStart(2, "0")}
                        </span>
                      </div>

                      <p>“{example.text}”</p>
                    </article>
                  ))}
                </div>

                <div className="issues-evidence-note">
                  <span aria-hidden="true">ⓘ</span>
                  <p>
                    Real reviews from this game that mention this topic,
                    highest quality first.
                  </p>
                </div>
              </div>
            </section>

            <section className="issues-card issues-trend-card">
              <div className="issues-card-header">
                <div>
                  <span className="issues-card-label">
                    TREND MONITOR
                  </span>
                  <h2>{selectedIssue.name} activity</h2>
                  <p className="issues-section-subtitle">
                    Mentions per period, scaled so the busiest period is 100.
                  </p>
                </div>

                <span className="issues-trend-tag">
                  LIVE TREND
                </span>
              </div>

              <div
                className="issues-trend-chart"
                role="img"
                aria-label={`Activity trend for ${selectedIssue.name}: ${selectedIssue.trend.join(", ")}`}
              >
                {selectedIssue.trend.map((value, index) => (
                  <div className="trend-column" key={index}>
                    <span className="trend-value">{value}</span>
                    <div className="trend-bar-track">
                      <div
                        className="trend-bar"
                        style={{
                          height: `${Math.max(3, Math.min(100, value))}%`,
                        }}
                      />
                    </div>
                    <span className="trend-label">
                      {periodLabels[index] ?? `P${index + 1}`}
                    </span>
                  </div>
                ))}
              </div>

              <div className="issues-trend-footer">
                <span>
                  <i className="legend-dot trend-dot" />
                  Relative activity index
                </span>
                <span>
                  Based on review dates
                </span>
              </div>
            </section>
          </>
        ) : (
          <section className="issues-card issues-detail-empty">
            <h2>No issue selected</h2>
            <p>
              Clear your filters to see issue details, review evidence,
              and activity trends.
            </p>
            <button
              type="button"
              className="issues-primary-button"
              onClick={clearFilters}
            >
              Show all issues
            </button>
          </section>
        )}

        {/* WORKFLOW SUMMARY */}
        <section className="issues-card issues-tracking-card">
          <div className="issues-card-header">
            <div>
              <span className="issues-card-label">
                WORKFLOW OVERVIEW
              </span>
              <h2>Issue tracking</h2>
              <p className="issues-section-subtitle">
                Select a status to filter the issue list.
              </p>
            </div>

            <span className="issues-card-count">
              {resolvedCount} resolved
            </span>
          </div>

          <div className="issues-workflow-grid">
            {statusesList.map((status) => {
              const count = issues.filter(
                (issue) =>
                  (statuses[issue.name] ?? "Detected") === status
              ).length;

              const isActive = statusFilter === status;

              return (
                <button
                  type="button"
                  className={`workflow-item workflow-${getStatusClass(status)} ${
                    isActive ? "workflow-active" : ""
                  }`}
                  key={status}
                  onClick={() => setStatusFilter(isActive ? "All" : status)}
                  aria-pressed={isActive}
                >
                  <span>{status}</span>
                  <strong>{count}</strong>
                  <small>
                    {isActive ? "Click to clear filter" : "Filter by status"}
                  </small>
                </button>
              );
            })}
          </div>
        </section>

        <p className="issues-disclaimer">
          Issues are detected by keyword matching on the analyzed reviews. Priorities come from how often each topic appears in negative reviews. Statuses are not saved yet.
        </p>
      </main>
    </div>
  );
}

export default Issues;