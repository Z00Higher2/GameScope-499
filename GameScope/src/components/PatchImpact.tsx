import { useEffect, useRef, useState } from "react";
import { getPatchImpact } from "../api";
import type {
  PatchChange,
  PatchImpactEntry,
  PatchImpactReport,
  PatchTopicChange,
} from "../api";
import "./PatchImpact.css";

interface PatchImpactProps {
  appId: string;
  gameName: string;
  onOpenIssue: (topic: string) => void;
}

const WINDOW_OPTIONS = [7, 14, 30];

const VERDICT_LABELS: Record<PatchImpactEntry["verdict"], string> = {
  improved: "Improved",
  worsened: "Worsened",
  steady: "No clear change",
  unknown: "Not measured",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function signed(value: number, unit = " pts"): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}${unit}`;
}

function plural(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}

function notMeasuredReason(patch: PatchImpactEntry, report: PatchImpactReport) {
  if (patch.state === "outside_reviews") {
    return new Date(patch.postedAt) > new Date(report.reviewsTo ?? 0)
      ? "Posted after the newest stored review. Re-analyze the game on the Dashboard to collect reviews written since."
      : "Posted before the oldest stored review. Collect more reviews (Settings > Review collection size) to reach back this far.";
  }
  return `Needs at least ${plural(report.minReviews, "review")} on each side (has ${patch.before.reviews} before, ${patch.after.reviews} after). Try a longer window.`;
}

/*
 * A hint that links the patch result to the status set on the Issues page.
 */
function statusHint(topic: PatchTopicChange): string | null {
  if (topic.direction === "improved" && topic.issueStatus !== "Resolved") {
    return "Complaints dropped: consider marking it Resolved.";
  }
  if (topic.direction === "worsened" && topic.issueStatus === "Resolved") {
    return "Marked Resolved, but complaints went up after this update.";
  }
  return null;
}

function DirectionBadge({ direction }: { direction: PatchChange | "unknown" }) {
  return (
    <span className={`patch-verdict patch-${direction}`}>
      {VERDICT_LABELS[direction]}
    </span>
  );
}

function PatchImpact({ appId, gameName, onOpenIssue }: PatchImpactProps) {
  const [windowDays, setWindowDays] = useState(14);
  const [includeAnnouncements, setIncludeAnnouncements] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  // Only the load right after the button is pressed asks Steam again
  const refreshedCount = useRef(0);

  const [report, setReport] = useState<PatchImpactReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [showUnmeasured, setShowUnmeasured] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const refresh = refreshCount > refreshedCount.current;
    refreshedCount.current = refreshCount;

    setLoading(true);
    setError("");

    getPatchImpact(
      appId,
      { windowDays, includeAnnouncements, refresh },
      controller.signal
    )
      .then((result) => {
        setReport(result);
        setSelectedId((previous) => {
          if (result.patches.some((patch) => patch.id === previous)) {
            return previous;
          }
          const firstMeasured = result.patches.find(
            (patch) => patch.state === "measured"
          );
          return (firstMeasured ?? result.patches[0])?.id ?? "";
        });
      })
      .catch((failure: Error) => {
        if (failure.name !== "AbortError") {
          setReport(null);
          setError(failure.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [appId, windowDays, includeAnnouncements, refreshCount]);

  const selected =
    report?.patches.find((patch) => patch.id === selectedId) ?? null;

  // Updates outside the stored reviews can't be compared, so they are
  // tucked behind a button unless nothing could be measured
  const listed = (report?.patches ?? []).filter(
    (patch) =>
      showUnmeasured ||
      patch.state === "measured" ||
      report?.measured === 0 ||
      patch.id === selectedId
  );
  const hiddenCount = (report?.patches.length ?? 0) - listed.length;

  return (
    <section className="issues-card patch-impact">
      <div className="issues-card-header">
        <div>
          <span className="issues-card-label">PATCH IMPACT</span>
          <h2>Did each update help {gameName}?</h2>
          <p className="issues-section-subtitle">
            Reviews written in the {windowDays} days before each developer
            update compared with the {windowDays} days after.
          </p>
        </div>

        <button
          type="button"
          className="issues-primary-button"
          onClick={() => setRefreshCount((count) => count + 1)}
          disabled={loading}
        >
          {loading ? "Loading..." : "Check Steam for new updates"}
        </button>
      </div>

      <div className="issues-filters patch-filters">
        <label className="issues-filter-control">
          <span>Days on each side</span>
          <select
            value={windowDays}
            onChange={(event) => setWindowDays(Number(event.target.value))}
          >
            {WINDOW_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {days} days
              </option>
            ))}
          </select>
        </label>

        <label className="patch-toggle">
          <input
            type="checkbox"
            checked={includeAnnouncements}
            onChange={(event) =>
              setIncludeAnnouncements(event.target.checked)
            }
          />
          <span>Include every announcement, not only patch notes</span>
        </label>
      </div>

      {error && (
        <div className="issues-empty-state">
          <h3>Couldn't load patch impact</h3>
          <p>{error}</p>
        </div>
      )}

      {!error && !report && (
        <div className="issues-empty-state">
          <h3>Reading this game's Steam announcements...</h3>
        </div>
      )}

      {!error && report && report.patches.length === 0 && (
        <div className="issues-empty-state">
          <span aria-hidden="true">⌁</span>
          <h3>
            {report.totalUpdates === 0
              ? "No developer announcements found"
              : "No patch notes found"}
          </h3>
          <p>
            {report.totalUpdates === 0
              ? "Steam lists no announcements from the developer for this game."
              : `Steam lists ${plural(report.totalUpdates, "announcement")}, but none are marked as patch notes. Tick "Include every announcement" to measure them.`}
          </p>
        </div>
      )}

      {!error && report && report.patches.length > 0 && (
        <>
          <p className="patch-coverage">
            {plural(report.measured, "update")} of {report.patches.length}{" "}
            could be measured. Stored reviews run from{" "}
            {formatDate(report.reviewsFrom)} to {formatDate(report.reviewsTo)}.
          </p>

          <div className={`issues-layout ${selected ? "" : "single"}`}>
            {/* UPDATE LIST */}
            <div className="issues-list patch-list" aria-live="polite">
              {listed.map((patch) => {
                const isSelected = patch.id === selectedId;

                return (
                  <button
                    type="button"
                    key={patch.id}
                    className={`issue-row ${isSelected ? "selected" : ""} ${patch.state === "measured" ? "" : "patch-unmeasured"}`}
                    onClick={() => setSelectedId(patch.id)}
                    aria-pressed={isSelected}
                  >
                    <div className="issue-row-top">
                      <div className="issue-row-title">
                        <strong>{patch.title}</strong>
                        <span>
                          {formatDate(patch.postedAt)}
                          {patch.state === "measured" &&
                            patch.sentimentChange !== undefined &&
                            ` · ${signed(patch.sentimentChange)} recommend`}
                        </span>
                      </div>

                      <div className="issue-row-badges">
                        <DirectionBadge direction={patch.verdict} />
                      </div>
                    </div>
                  </button>
                );
              })}

              {(hiddenCount > 0 || showUnmeasured) && report.measured > 0 && (
                <button
                  type="button"
                  className="issues-compare-link patch-more"
                  onClick={() => setShowUnmeasured((shown) => !shown)}
                >
                  {showUnmeasured
                    ? "Hide updates that couldn't be measured"
                    : `Show ${plural(hiddenCount, "more update")} that couldn't be measured`}
                </button>
              )}
            </div>

            {/* SELECTED UPDATE */}
            {selected && (
              <div className="issue-focus patch-focus">
                <div className="issues-card-header">
                  <div>
                    <span className="issues-card-label">
                      {selected.isPatchNotes ? "PATCH NOTES" : "ANNOUNCEMENT"}{" "}
                      · {formatDate(selected.postedAt)}
                    </span>
                    <h2>{selected.title}</h2>
                  </div>
                  <DirectionBadge direction={selected.verdict} />
                </div>

                {selected.url && (
                  <a
                    className="issues-compare-link"
                    href={selected.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Read the announcement on Steam ↗
                  </a>
                )}

                {selected.state !== "measured" ? (
                  <p className="issue-description">
                    {notMeasuredReason(selected, report)}
                  </p>
                ) : (
                  <>
                    <p className="issue-description">{selected.summary}</p>

                    {/* SENTIMENT BEFORE / AFTER */}
                    <h3 className="issue-focus-heading">Recommend the game</h3>
                    <div className="patch-compare">
                      {(
                        [
                          ["Before", selected.before],
                          ["After", selected.after],
                        ] as const
                      ).map(([label, side]) => (
                        <div className="patch-side" key={label}>
                          <div className="patch-side-top">
                            <span>{label}</span>
                            <strong>{side.positivePct}%</strong>
                          </div>
                          <div className="search-bar-track patch-track">
                            <div
                              className="patch-fill"
                              style={{ width: `${side.positivePct}%` }}
                            />
                          </div>
                          <small>
                            {plural(side.reviews, "review")} ·{" "}
                            {formatDate(side.from)} – {formatDate(side.to)}
                          </small>
                        </div>
                      ))}
                    </div>

                    {/* TOPIC CHANGES */}
                    <h3 className="issue-focus-heading">
                      Complaints by topic (share of all reviews)
                    </h3>

                    {selected.topics && selected.topics.length > 0 ? (
                      <div className="patch-topics">
                        {selected.topics.map((topic) => {
                          const hint = statusHint(topic);

                          return (
                            <div className="patch-topic" key={topic.topic}>
                              <div className="patch-topic-main">
                                <button
                                  type="button"
                                  className="patch-topic-name"
                                  onClick={() => onOpenIssue(topic.topic)}
                                  title={`Open ${topic.topic} on the Issues tab`}
                                >
                                  {topic.topic}
                                </button>

                                <span className="patch-topic-rates">
                                  {topic.beforeRate}% → {topic.afterRate}%
                                </span>

                                <span
                                  className={`patch-topic-change patch-${topic.direction}`}
                                >
                                  {signed(topic.change)}
                                </span>

                                {topic.issueStatus && (
                                  <span
                                    className={`status-badge status-${topic.issueStatus.toLowerCase().replace(/\s+/g, "-")}`}
                                  >
                                    {topic.issueStatus}
                                  </span>
                                )}
                              </div>

                              {hint && (
                                <small className={`patch-hint patch-${topic.direction}`}>
                                  {hint}
                                </small>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="issue-description">
                        No topic had enough complaints on either side to
                        compare.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <p className="issues-disclaimer">
        Each window also stops at the neighbouring update, so every
        comparison covers one update only. A change is only called
        Improved or Worsened when a two-proportion z-test puts it beyond
        normal noise (about 95% confidence). Reviews change for many
        reasons, such as sales, events or news, so a result shows timing,
        not proof that the update caused it.
      </p>
    </section>
  );
}

export default PatchImpact;
