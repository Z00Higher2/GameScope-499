/*
 * GameScope API client.
 *
 * Talks to the FastAPI server in GameReview/api.py.
 * During development, Vite forwards /api requests to it
 * (see vite.config.ts).
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
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

export interface IssuesReport {
  trendLabels: string[];
  issues: {
    name: string;
    mentions: number;
    negative: number;
    positive: number;
    helpfulVotes: number;
    description: string;
    priority: "Critical" | "High" | "Medium" | "Low";
    examples: {
      type: "positive" | "negative";
      text: string;
    }[];
    trend: number[];
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
 * Run the review pipeline for a game (or load it from MySQL
 * if it was analyzed before) and return its analysis.
 *
 * refresh = true collects fresh reviews from Steam.
 */
export function analyzeGame(
  appId: string,
  refresh = false
) {
  return request<GameAnalysis>(
    `/api/analyze/${encodeURIComponent(appId)}` +
      (refresh ? "?refresh=true" : ""),
    { method: "POST" }
  );
}

export function getIssues(
  appId: string,
  signal?: AbortSignal
) {
  return request<IssuesReport>(
    `/api/games/${encodeURIComponent(appId)}/issues`,
    { signal }
  );
}

/*
 * Reviews ranked by quality score, for the Reviews page.
 * One analysis collects up to 500 reviews.
 */
export function getReviewCards(
  appId: string,
  signal?: AbortSignal
) {
  return request<ReviewCard[]>(
    `/api/games/${encodeURIComponent(appId)}/reviews?limit=500`,
    { signal }
  );
} 