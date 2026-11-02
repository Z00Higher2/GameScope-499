/*
 * Settings saved by the Settings page, read by the pages they affect.
 */

export type Sentiment = "all" | "positive" | "negative";
export type ReviewSort =
  | "helpful"
  | "quality"
  | "playtime"
  | "newest"
  | "oldest";

export interface Preferences {
  animations: boolean;
  accentColor: string;
  compactLayout: boolean;

  defaultSentiment: Sentiment;
  defaultSort: ReviewSort;
  hideLowQuality: boolean;

  minimumReviewLength: number;
  minimumPlaytime: number;
  minimumIssueMentions: number;
  issueSentiment: Sentiment;

  defaultPage: "dashboard" | "analytics" | "issues" | "reviews";
  showSummaryCards: boolean;
  showCharts: boolean;

  reviewLimit: number;
  reviewLanguage: string;
  reviewTimeRange: string;

  exportReviews: boolean;
  exportIssues: boolean;
  exportStatistics: boolean;

  preferredGenres: string[];
  hideOwnedGames: boolean;
  recommendationPriority: "sentiment" | "quality" | "issues";

  notifications: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  animations: true,
  accentColor: "purple",
  compactLayout: false,

  defaultSentiment: "all",
  defaultSort: "helpful",
  hideLowQuality: false,

  minimumReviewLength: 5,
  minimumPlaytime: 0,
  minimumIssueMentions: 3,
  issueSentiment: "negative",

  defaultPage: "dashboard",
  showSummaryCards: true,
  showCharts: true,

  reviewLimit: 500,
  reviewLanguage: "english",
  reviewTimeRange: "all",

  exportReviews: true,
  exportIssues: true,
  exportStatistics: true,

  preferredGenres: [],
  hideOwnedGames: false,
  recommendationPriority: "quality",

  notifications: false,
};

export const SETTINGS_KEY = "gamescope-settings";

export function loadPreferences(): Preferences {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);

    if (!stored) return DEFAULT_PREFERENCES;

    return {
      ...DEFAULT_PREFERENCES,
      ...JSON.parse(stored),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/*
 * Settings > Review time range as a number of days, or null for all time.
 */
export function timeRangeDays(preferences = loadPreferences()): number | null {
  const days = Number(preferences.reviewTimeRange);
  return Number.isInteger(days) && days > 0 ? days : null;
}
