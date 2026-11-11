
import { useEffect, useMemo, useState } from "react";
import Navbar from "./Navbar";
import IssueSearch from "./IssueSearch";
import PatchImpact from "./PatchImpact";
import { getIssues, updateIssueStatus } from "../api";
import type { GameAnalysis, IssueStatus, IssuesReport } from "../api";
import { exportIssuesReport } from "../exportReport";
import { loadPreferences } from "../preferences";
import "./Issues.css";
import type { Page, Mode } from "../type";

interface IssuesProps {
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  currentPage: Page;
  setCurrentPage: React.Dispatch<React.SetStateAction<Page>>;
  onLogoClick: () => void;
  analyzed: boolean;
  analyzedAppId: string;
  analysis: GameAnalysis | null;
  mode: Mode;
  setMode: React.Dispatch<React.SetStateAction<Mode>>;
  isLoggedIn?: boolean;
  accountEmail?: string;
  onLogout?: () => void;
  onOpenGame: (appId: string) => Promise<void>;
}

type Issue = IssuesReport["issues"][number];
type Tab = "game" | "patches" | "compare";

const priorities: Issue["priority"][] = [
  "Critical",
  "High",
  "Medium",
  "Low",
];

/**
 * Statuses are saved in MySQL through
 * PATCH /api/games/{appId}/issues/{topic}/status
 */
const statusesList: IssueStatus[] = [
  "Detected",
  "Investigating",
  "In Progress",
  "Resolved",
];

function getSavedIssueThreshold(): number {
  const threshold = loadPreferences().minimumIssueMentions;
  return Number.isInteger(threshold) && threshold >= 1 ? threshold : 3;
}

function getStatusClass(status: IssueStatus): string {
  return status.toLowerCase().replace(/\s+/g, "-");
}

function plural(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}

function Issues({
  darkMode,
  setDarkMode,
  currentPage,
  setCurrentPage,
  onLogoClick,
  analyzed,
  analyzedAppId,
  analysis,
  mode,
  setMode,
  isLoggedIn = false,
  accountEmail = "",
  onLogout,
  onOpenGame,
}: IssuesProps) {
  const hasGame = analyzed && analyzedAppId !== "";

  const [tab, setTab] = useState<Tab>(hasGame ? "game" : "compare");
  const [compareTopic, setCompareTopic] = useState("Bugs");

  const [selectedIssueName, setSelectedIssueName] = useState("");
  const [sortBy, setSortBy] = useState("priority");

  const [statuses, setStatuses] =
    useState<Record<string, IssueStatus>>({});
  const [statusError, setStatusError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const [report, setReport] = useState<IssuesReport | null>(null);
  const [loadError, setLoadError] = useState("");

  // ------------------------------------------
  // LOAD GAME ISSUES
  // ------------------------------------------

  useEffect(() => {
    if (!hasGame) {
      setReport(null);
      return;
    }

    const controller = new AbortController();

    setLoadError("");

    getIssues(analyzedAppId, getSavedIssueThreshold(), controller.signal)
      .then((result) => {
        setReport(result);
        setStatuses(
          Object.fromEntries(
            result.issues.map((issue) => [issue.name, issue.status])
          )
        );
        setStatusError("");
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
  }, [hasGame, analyzedAppId]);

  // ------------------------------------------
  // SORT ISSUES
  // ------------------------------------------

  const issues = useMemo(() => {
    const list = report ? [...report.issues] : [];

    return list.sort((a, b) => {
      switch (sortBy) {
        case "complaints":
          return b.negative - a.negative;

        case "name":
          return a.name.localeCompare(b.name);

        case "priority":
        default:
          return (
            priorities.indexOf(a.priority) -
              priorities.indexOf(b.priority) ||
            b.negative - a.negative
          );
      }
    });
  }, [report, sortBy]);

  const selectedIssue =
    issues.find((issue) => issue.name === selectedIssueName) ??
    issues[0] ??
    null;

  const gameName =
    analysis?.game.name || (hasGame ? `App ${analyzedAppId}` : "");

  const worstIssue = report
    ? [...report.issues].sort(
        (a, b) =>
          priorities.indexOf(a.priority) - priorities.indexOf(b.priority) ||
          b.negative - a.negative
      )[0]
    : undefined;

  // ------------------------------------------
  // ISSUE SUMMARY
  // ------------------------------------------

  let summary: string;

  if (!hasGame) {
    summary =
      "Analyze a game on the Dashboard to see its recurring complaints, or compare a topic across every analyzed game.";
  } else if (loadError) {
    summary = loadError;
  } else if (!report) {
    summary = `Finding recurring complaints in ${gameName}...`;
  } else if (!worstIssue) {
    summary = `${gameName}: no topic was complained about in at least ${plural(report.minComplaints, "review")}.`;
  } else {
    summary = `${gameName}: ${plural(report.issues.length, "recurring complaint")} in ${plural(report.totalReviews, "review")}. Worst: ${worstIssue.name} (${worstIssue.priority}).`;
  }

  // ------------------------------------------
  // UPDATE ISSUE STATUS
  // ------------------------------------------

  const changeStatus = (
    name: string,
    status: IssueStatus
  ) => {
    const previousStatus = statuses[name] ?? "Detected";

    setStatusError("");

    setStatuses((previous) => ({
      ...previous,
      [name]: status,
    }));

    updateIssueStatus(analyzedAppId, name, status).catch(
      (saveFailure: Error) => {
        setStatuses((previous) => ({
          ...previous,
          [name]: previousStatus,
        }));

        setStatusError(
          `Couldn't save the status. ${saveFailure.message}`
        );
      }
    );
  };

  // ------------------------------------------
  // EXPORT ISSUE REPORT
  // ------------------------------------------

  const exportReport = async () => {
    if (!report) return;

    setExporting(true);
    setExportError("");

    try {
      await exportIssuesReport(analyzedAppId, analysis, report, statuses);
    } catch (exportFailure) {
      setExportError(
        exportFailure instanceof Error
          ? exportFailure.message
          : "The report couldn't be exported."
      );
    } finally {
      setExporting(false);
    }
  };

  // ------------------------------------------
  // COMPARE ISSUES ACROSS GAMES
  // ------------------------------------------

  const compareIssue = (topic: string) => {
    setCompareTopic(topic);
    setTab("compare");
  };

  // ------------------------------------------
  // OPEN GAME FROM COMPARISON
  // ------------------------------------------

  // ------------------------------------------
  // OPEN AN ISSUE FROM PATCH IMPACT
  // ------------------------------------------

  const openIssue = (topic: string) => {
    if (issues.some((issue) => issue.name === topic)) {
      setSelectedIssueName(topic);
    }
    setTab("game");
  };

  const openGame = async (appId: string) => {
    await onOpenGame(appId);
    setTab("game");
  };

  // Trend labels supplied by the backend report.
  const periodLabels = report?.trendLabels ?? [];

  // ------------------------------------------
  // RENDER
  // ------------------------------------------

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
        setMode={setMode}
        isLoggedIn={isLoggedIn}
        accountEmail={accountEmail}
        onLogout={onLogout}
      />

      <main className="issues-main">
        <section className="issues-header">
          <span className="issues-label">
            <span className="issues-live-dot" />
            GAMESCOPE / ISSUES
          </span>

          <div className="issues-heading-row">
            <div>
              <h1>Issues</h1>
              <p>{summary}</p>
            </div>

            {tab === "game" && report && (
              <div className="issues-header-actions">
                <button
                  type="button"
                  className="issues-primary-button"
                  onClick={exportReport}
                  disabled={exporting}
                >
                  {exporting ? "Exporting..." : "Export report (CSV)"}
                </button>

                {exportError && (
                  <span className="issues-export-error" role="alert">
                    {exportError}
                  </span>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ISSUE TABS */}
        <div className="issues-tabs" role="tablist" aria-label="Issues view">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "game"}
            className={`issues-tab ${tab === "game" ? "active" : ""}`}
            onClick={() => setTab("game")}
          >
            {gameName || "This game"}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === "patches"}
            className={`issues-tab ${tab === "patches" ? "active" : ""}`}
            onClick={() => setTab("patches")}
          >
            Patch impact
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === "compare"}
            className={`issues-tab ${tab === "compare" ? "active" : ""}`}
            onClick={() => setTab("compare")}
          >
            Compare across games
          </button>
        </div>

        {/* COMPARE ACROSS GAMES */}
        {tab === "compare" && (
          <IssueSearch
            topic={compareTopic}
            setTopic={setCompareTopic}
            onOpenGame={openGame}
            onAnalyzeMore={() => setCurrentPage("dashboard")}
          />
        )}

        {/* PATCH IMPACT */}
        {tab === "patches" && hasGame && (
          <PatchImpact
            key={analyzedAppId}
            appId={analyzedAppId}
            gameName={gameName}
            onOpenIssue={openIssue}
          />
        )}

        {/* NO GAME SELECTED */}
        {(tab === "game" || tab === "patches") && !hasGame && (
          <section className="issues-card issues-detail-empty">
            <h2>No game analyzed yet</h2>
            <p>
              Analyze a Steam game on the Dashboard to see its recurring
              complaints and how its updates changed reviews here.
            </p>
            <button
              type="button"
              className="issues-primary-button"
              onClick={() => setCurrentPage("dashboard")}
            >
              Go to Dashboard
            </button>
          </section>
        )}

        {/* LOADING OR ERROR */}
        {tab === "game" && hasGame && !report && (
          <section className="issues-card issues-detail-empty">
            <h2>
              {loadError ? "Couldn't load issues" : "Loading issues..."}
            </h2>
            <p>
              {loadError ||
                "Finding recurring complaints in the analyzed reviews."}
            </p>
          </section>
        )}

        {/* GAME ISSUE DETAILS */}
        {tab === "game" && report && (
          <div
            className={`issues-layout ${selectedIssue ? "" : "single"}`}
          >
            {/* ISSUE LIST */}
            <section className="issues-card">
              <div className="issues-card-header">
                <div>
                  <span className="issues-card-label">
                    RECURRING COMPLAINTS
                  </span>
                  <h2>{plural(issues.length, "issue")}</h2>
                </div>

                {issues.length > 1 && (
                  <label className="issues-filter-control issues-sort">
                    <span>Sort by</span>
                    <select
                      value={sortBy}
                      onChange={(event) => setSortBy(event.target.value)}
                    >
                      <option value="priority">Priority</option>
                      <option value="complaints">Most complaints</option>
                      <option value="name">Name A–Z</option>
                    </select>
                  </label>
                )}
              </div>

              <div className="issues-list" aria-live="polite">
                {issues.map((issue) => {
                  const status = statuses[issue.name] ?? "Detected";
                  const isSelected = selectedIssue?.name === issue.name;

                  return (
                    <button
                      type="button"
                      className={`issue-row ${isSelected ? "selected" : ""}`}
                      key={issue.name}
                      onClick={() => setSelectedIssueName(issue.name)}
                      aria-pressed={isSelected}
                    >
                      <div className="issue-row-top">
                        <div className="issue-row-title">
                          <strong>{issue.name}</strong>
                          <span>
                            {plural(issue.negative, "complaint")}
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
                    </button>
                  );
                })}

                {issues.length === 0 && (
                  <div className="issues-empty-state">
                    <span aria-hidden="true">✓</span>
                    <h3>No recurring complaints</h3>
                    <p>
                      No topic was complained about in at least{" "}
                      {plural(report.minComplaints, "review")}. Lower the
                      issue mention threshold in Settings to see smaller
                      issues.
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* SELECTED ISSUE */}
            {selectedIssue && (
              <section className="issues-card issue-focus">
                <div className="issues-card-header">
                  <div>
                    <span className="issues-card-label">
                      SELECTED ISSUE
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

                {/* STATUS EDITOR */}
                <div className="issue-status-editor">
                  <label htmlFor="issue-status-select">Status</label>

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

                  <span className="issues-status-note" role="status">
                    {statusError || "Saved automatically"}
                  </span>
                </div>

                {/* PLAYER REVIEW EXAMPLES */}
                <h3 className="issue-focus-heading">What players said</h3>

                <div className="issue-examples">
                  {selectedIssue.examples.map((example, index) => (
                    <article className="issue-example" key={index}>
                      <div className="example-heading">
                        <span className={`example-type ${example.type}`}>
                          <span>
                            {example.type === "positive" ? "+" : "−"}
                          </span>
                          {example.type === "positive"
                            ? "Praise or neutral"
                            : "Complaint"}
                        </span>
                      </div>

                      <p>“{example.text}”</p>
                    </article>
                  ))}
                </div>

                {/* ISSUE TREND */}
                {selectedIssue.trend.length > 0 && (
                  <>
                    <h3 className="issue-focus-heading">
                      Complaints over time
                    </h3>

                    <div
                      className="issues-trend-chart compact"
                      role="img"
                      aria-label={`Complaints about ${selectedIssue.name} by review date, scaled so the busiest period is 100: ${selectedIssue.trend.join(", ")}`}
                    >
                      {selectedIssue.trend.map((value, index) => (
                        <div className="trend-column" key={index}>
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
                  </>
                )}

                {/* COMPARE THIS ISSUE */}
                <button
                  type="button"
                  className="issues-compare-link"
                  onClick={() => compareIssue(selectedIssue.name)}
                >
                  How do other games do on {selectedIssue.name}? →
                </button>
              </section>
            )}
          </div>
        )}

        {/* DISCLAIMER */}
        <p className="issues-disclaimer">
          Issues are found by keyword matching on the analyzed reviews. A
          topic counts as a complaint when the part of the review mentioning
          it is negative, or when it appears without praise in a Not
          Recommended review. Priority comes from the share of all reviews
          complaining about it.
        </p>
      </main>
    </div>
  );
}

export default Issues;
