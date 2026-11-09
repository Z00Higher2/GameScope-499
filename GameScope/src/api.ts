/*
 * GameScope API client.
 *
 * Talks to the FastAPI server in GameReview/api.py.
 * During development, Vite forwards /api requests to it
 * (see vite.config.ts).
 */

import { loadPreferences, timeRangeDays } from "./preferences";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

/*
 * Settings > Review time range, added to every request that reads reviews.
 */
function daysParam(): string {
  const days = timeRangeDays();
  return days ? `days=${days}` : "";
}

function withParams(path: string, ...params: string[]): string {
  const query = params.filter(Boolean).join("&");
  return query ? `${path}?${query}` : path;
}
export interface GameSearchResult {
  name: string;
  appId: string;
  image?: string | null; // small cover image from Steam search
}

export interface GameDetails {
  appId: string;
  name: string;
  developer: string | null;
  publisher: string | null;
  releaseDate: string | null; // ISO date, e.g. "2024-12-06"
  price: number | null; // current price in USD, 0 when free
  shortDescription: string | null;
  headerImage?: string | null; // Steam header image URL
  comingSoon: boolean; // not released on Steam yet
  earlyAccess: boolean;
}

export interface SteamStanding {
  appId: string;
  summary: string | null; // Steam's rating, e.g. "Very Positive"
  score: number; // 1-4 negative, 5 mixed, 6-9 positive, 0 too few reviews
  totalReviews: number;
  positivePercent: number | null;
}

export interface GameAnalysis {
  game: {
    appId: string;
    name: string;
    developer: string | null;
    publisher: string | null;
    releaseDate: string | null;
    price: number | null;
  };

  analyzedAt: string | null;

  summary: {
    totalReviews: number;
    positiveReviews: number;
    negativeReviews: number;
    positivePercentage: number;
    negativePercentage: number;
    averagePlaytime: number;
    averageHelpfulVotes: number;
    reviewQuality: number;
    highQualityPercentage: number;
    detailedPercentage: number;
    reliablePercentage: number;
  };

  // What the junk filter removed in the latest run
  filter: {
    collected: number;
    kept: number;
    removed: Record<string, number>;
  } | null;

  sentimentTrend: {
    period: string;
    positive: number;
    negative: number;
    reviews: number;
  }[];

  topIssues: { name: string; count: number }[];
  positiveTopics: { topic: string; mentions: number }[];
  negativeTopics: { topic: string; mentions: number }[];

    prosAndCons: {
    pros: {
      topic: string;
      mentions: number;
      totalMentions: number;
      sentiment: "positive";
    }[];
    cons: {
      topic: string;
      mentions: number;
      totalMentions: number;
      sentiment: "negative";
    }[];
  };

  playtimeDistribution: { range: string; reviews: number }[];

  playtimeRecommendation: {
    range: string;
    recommended: number;
    notRecommended: number;
    reviews: number;
  }[];

  reliability: { name: string; value: number }[];

  mostHelpfulReviews: {
    reviewNumber: number;
    sentiment: "Positive" | "Negative";
    helpfulVotes: number;
    text: string;
  }[];

  recentFeedback: {
    type: "positive" | "negative";
    text: string;
  }[];

  playerSignals: { name: string; count: number }[];

  analysisSummary: string;

  keyInsights: {
    label: string;
    tone: "positive" | "negative";
    text: string;
  }[];
}

export interface ReviewCard {
  id: number;
  createdAt: string | null;
  sentiment: "positive" | "negative";
  quality: "high" | "moderate" | "low";
  qualityScore: number;
  text: string;
  tags: string[];
  playtime: number;
  playtimeAtReview: number;
  helpfulVotes: number;
  signals: string[];
  developerSignal: string;
  priority: "HIGH PRIORITY" | "MEDIUM PRIORITY" | "LOW PRIORITY";
  detailed: boolean;
}

export type IssueStatus =
  | "Detected"
  | "Investigating"
  | "In Progress"
  | "Resolved";

export interface IssuesReport {
  trendLabels: string[];
  minComplaints: number;
  totalReviews: number;
  issues: {
    name: string;
    mentions: number;
    negative: number;
    positive: number;
    helpfulVotes: number;
    description: string;
    priority: "Critical" | "High" | "Medium" | "Low";
    status: IssueStatus;
    examples: {
      type: "positive" | "negative";
      text: string;
    }[];
    trend: number[];
  }[];
}

export interface TopicSearchResult {
  topic: string;
  minMentions: number;
  games: {
    appId: string;
    name: string;
    status: IssueStatus | null; // null when no one has set a status
    totalReviews: number;
    mentions: number;
    praised: number;
    complaints: number;
    praiseRate: number;
    complaintRate: number;
    // Complaint rate in the older half of the reviews vs the newer half
    trend: {
      since: string;
      earlierComplaintRate: number;
      recentComplaintRate: number;
      change: number;
    } | null;
  }[];
}

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  let response: Response;

  try {
  response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw error;
    }

    throw new Error(
      "Can't reach the GameScope API. Is it running on port 8000?"
    );
  }

  if (!response.ok) {
    let detail =
      `The GameScope API returned an error (${response.status}). ` +
      "Check that it's running on port 8000 and look at its terminal for details.";

    try {
      const body = await response.json();

      if (typeof body.detail === "string") {
        detail = body.detail;
      }
    } catch {
      // Not JSON, e.g. the dev server's proxy error when the API is down
    }

    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}

/*
 * Find Steam games by name.
 */
export function searchGames(
  query: string,
  signal?: AbortSignal
) {
  return request<GameSearchResult[]>(
    `/api/search?q=${encodeURIComponent(query)}`,
    { signal }
  );
}

/*
 * Store details for a game (developer, release date, price)
 * straight from Steam. Works before the game has been analyzed.
 */
export function getGameDetails(
  appId: string,
  signal?: AbortSignal
) {
  return request<GameDetails>(
    `/api/games/${encodeURIComponent(appId)}/details`,
    { signal }
  );
}

/*
 * Count a search for a game. Returns its new total.
 */
export function recordSearch(appId: string) {
  return request<{ appId: string; searches: number }>(
    `/api/games/${encodeURIComponent(appId)}/searches`,
    { method: "POST" }
  );
}

export interface TrendingGame {
  appId: string;
  name: string;
  searches: number;
}

/*
 * The most-searched games on the site, most first.
 */
export function getTrending(limit: number, signal?: AbortSignal) {
  return request<TrendingGame[]>(`/api/trending?limit=${limit}`, { signal });
}

/*
 * Steam's overall review rating for a game ("Very Positive", ...).
 * Works before the game has been analyzed.
 */
export function getSteamStanding(
  appId: string,
  signal?: AbortSignal
) {
  return request<SteamStanding>(
    `/api/games/${encodeURIComponent(appId)}/standing`,
    { signal }
  );
}

/*
 * Run the review pipeline for a game (or load it from MySQL
 * if it was analyzed before) and return its analysis.
 *
 * refresh = true collects fresh reviews from Steam.
 * Settings > Review collection size sets how many are collected.
 */
export function analyzeGame(
  appId: string,
  refresh = false
) {
  return request<GameAnalysis>(
    withParams(
      `/api/analyze/${encodeURIComponent(appId)}`,
      refresh ? "refresh=true" : "",
      `max_reviews=${loadPreferences().reviewLimit}`,
      daysParam()
    ),
    { method: "POST" }
  );
}

/*
 * The analysis of a game that is already stored, without collecting.
 */
export function getAnalysis(appId: string) {
  return request<GameAnalysis>(
    withParams(
      `/api/games/${encodeURIComponent(appId)}/analysis`,
      daysParam()
    )
  );
}

export function getIssues(
  appId: string,
  minMentions: number,
  signal?: AbortSignal
) {
  return request<IssuesReport>(
    withParams(
      `/api/games/${encodeURIComponent(appId)}/issues`,
      `min_mentions=${minMentions}`,
      daysParam()
    ),
    { signal }
  );
}

/*
 * The topics GameScope detects (Bugs, Story, ...), for Issue Search.
 */
export function getTopics(signal?: AbortSignal) {
  return request<string[]>("/api/topics", { signal });
}

/*
 * How players talk about one topic in every analyzed game.
 */
export function searchTopic(
  topic: string,
  minMentions: number,
  signal?: AbortSignal
) {
  return request<TopicSearchResult>(
    withParams(
      `/api/topics/${encodeURIComponent(topic)}/games`,
      `min_mentions=${minMentions}`,
      daysParam()
    ),
    { signal }
  );
}

export function updateIssueStatus(
  appId: string,
  topic: string,
  status: IssueStatus
) {
  return request<{ topic: string; status: IssueStatus }>(
    `/api/games/${encodeURIComponent(appId)}/issues/${encodeURIComponent(topic)}/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }
  );
}

/*
 * Reviews ranked by quality score, for the Reviews page.
 * The API returns at most 2,000.
 */
export function getReviewCards(
  appId: string,
  signal?: AbortSignal
) {
  return request<ReviewCard[]>(
    withParams(
      `/api/games/${encodeURIComponent(appId)}/reviews`,
      "limit=2000",
      daysParam()
    ),
    { signal }
  );
} 
export interface PatchWindow {
  reviews: number;
  positive: number;
  positivePct: number;
  from: string | null;
  to: string | null;
}

export type PatchChange = "improved" | "worsened" | "steady";

export interface PatchTopicChange {
  topic: string;
  beforeComplaints: number;
  afterComplaints: number;
  beforeRate: number; // % of all reviews in the window
  afterRate: number;
  change: number; // percentage points, after minus before
  direction: PatchChange; // "steady" unless the change is statistically real
  issueStatus: IssueStatus | null; // status set on the Issues page
}

export interface PatchImpactEntry {
  id: string;
  title: string;
  url: string | null;
  postedAt: string;
  isPatchNotes: boolean;
  // measured: enough reviews on both sides
  // too_few_reviews: some reviews, but fewer than minReviews on a side
  // outside_reviews: posted before or after the stored reviews
  state: "measured" | "too_few_reviews" | "outside_reviews";
  verdict: PatchChange | "unknown";
  before: PatchWindow;
  after: PatchWindow;
  sentimentChange?: number;
  topics?: PatchTopicChange[];
  summary?: string;
}

export interface PatchImpactReport {
  windowDays: number;
  minReviews: number;
  includeAnnouncements: boolean;
  reviewsFrom: string | null;
  reviewsTo: string | null;
  totalReviews: number;
  totalUpdates: number;
  patchNotes: number;
  measured: number;
  patches: PatchImpactEntry[];
}

/*
 * Patch Impact: reviews just before each developer update vs just after.
 * refresh = true collects the latest announcements from Steam first.
 */
export function getPatchImpact(
  appId: string,
  options: {
    windowDays: number;
    includeAnnouncements: boolean;
    refresh?: boolean;
  },
  signal?: AbortSignal
) {
  return request<PatchImpactReport>(
    withParams(
      `/api/games/${encodeURIComponent(appId)}/patches`,
      `window_days=${options.windowDays}`,
      options.includeAnnouncements ? "include_announcements=true" : "",
      options.refresh ? "refresh=true" : "",
      daysParam()
    ),
    { signal }
  );
}
