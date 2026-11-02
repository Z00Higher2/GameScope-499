/*
 * Issues page > Export report: one CSV with the sections chosen in
 * Settings > Export & Reports (statistics, issues, reviews).
 */

import { getReviewCards } from "./api";
import type { GameAnalysis, IssueStatus, IssuesReport } from "./api";
import { loadPreferences } from "./preferences";

type Cell = string | number | null;

// Review text starting with these could run as a formula in Excel
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(value: Cell): string {
  let text = value === null ? "" : String(value);

  if (typeof value === "string" && FORMULA_START.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows: Cell[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function download(filename: string, csv: string) {
  // The byte order mark makes Excel read the file as UTF-8
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

function fileSafe(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function exportIssuesReport(
  appId: string,
  analysis: GameAnalysis | null,
  report: IssuesReport,
  statuses: Record<string, IssueStatus>
) {
  const preferences = loadPreferences();

  if (
    !preferences.exportStatistics &&
    !preferences.exportIssues &&
    !preferences.exportReviews
  ) {
    throw new Error(
      "Turn on at least one export option in Settings > Export & Reports."
    );
  }

  const gameName = analysis?.game.name || `Steam Game ${appId}`;
  const today = new Date().toISOString().slice(0, 10);

  const rows: Cell[][] = [
    ["GameScope report"],
    ["Game", gameName],
    ["Steam App ID", appId],
    ["Exported", today],
  ];

  if (preferences.exportStatistics && analysis) {
    const summary = analysis.summary;

    rows.push(
      [],
      ["STATISTICS"],
      ["Total reviews", summary.totalReviews],
      ["Positive %", summary.positivePercentage],
      ["Negative %", summary.negativePercentage],
      ["Average playtime (hours)", summary.averagePlaytime],
      ["Average helpful votes", summary.averageHelpfulVotes],
      ["Review quality score", summary.reviewQuality]
    );
  }

  if (preferences.exportIssues) {
    rows.push(
      [],
      ["ISSUES"],
      [
        "Topic",
        "Priority",
        "Status",
        "Complaints",
        "Mentions",
        "Praised or neutral",
        "Description",
      ],
      ...report.issues.map((issue) => [
        issue.name,
        issue.priority,
        statuses[issue.name] ?? issue.status,
        issue.negative,
        issue.mentions,
        issue.positive,
        issue.description,
      ])
    );
  }

  if (preferences.exportReviews) {
    const reviews = await getReviewCards(appId);

    rows.push(
      [],
      ["REVIEWS"],
      [
        "Review ID",
        "Posted",
        "Sentiment",
        "Quality",
        "Quality score",
        "Helpful votes",
        "Hours at review",
        "Topics",
        "Text (first 900 characters)",
      ],
      ...reviews.map((review) => [
        review.id,
        review.createdAt,
        review.sentiment,
        review.quality,
        review.qualityScore,
        review.helpfulVotes,
        review.playtimeAtReview,
        review.signals.join("; "),
        review.text,
      ])
    );
  }

  download(`gamescope-${fileSafe(gameName)}-report-${today}.csv`, toCsv(rows));
}
