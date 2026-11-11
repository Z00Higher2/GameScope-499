
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

// =========================================================
// AUTHENTICATION TYPES
// =========================================================

export type AccountMode = "player" | "developer";

export interface SignUpRequest {
  username: string;
  email: string;
  password: string;
  mode: AccountMode;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthUser {
  user_id: number;
  username: string;
  email: string;
  roles: AccountMode[];
}

export interface SignUpResponse {
  message: string;
  user: AuthUser;
}

export interface LoginResponse {
  message: string;
  user: AuthUser;
  expires_at: string;
}

export interface CurrentUserResponse {
  user: AuthUser;
}

export interface LogoutResponse {
  message: string;
}

export interface ActiveSession {
  session_id: number;
  expires_at: string;
  last_seen_at: string | null;
  is_current: boolean;
}

export interface ActiveSessionsResponse {
  sessions: ActiveSession[];
}

export interface LogoutAllResponse {
  message: string;
  revoked_sessions: number;
}

export interface ForgotPasswordResponse {
  message: string;
}

export interface ResetPasswordRequest {
  token: string;
  new_password: string;
}

export interface ResetPasswordResponse {
  message: string;
}

// =========================================================
// GAME TYPES
// =========================================================

export interface GameSearchResult {
  name: string;
  appId: string;
  image?: string | null;
}

export interface GameDetails {
  appId: string;
  name: string;
  developer: string | null;
  publisher: string | null;
  releaseDate: string | null;
  price: number | null;
  shortDescription: string | null;
  headerImage?: string | null;
  comingSoon: boolean;
  earlyAccess: boolean;
}

export interface SteamStanding {
  appId: string;
  summary: string | null;
  score: number;
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
    status: IssueStatus | null;
    totalReviews: number;
    mentions: number;
    praised: number;
    complaints: number;
    praiseRate: number;
    complaintRate: number;
    trend: {
      since: string;
      earlierComplaintRate: number;
      recentComplaintRate: number;
      change: number;
    } | null;
  }[];
}

// =========================================================
// PATCH IMPACT TYPES
// =========================================================

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
  beforeRate: number;
  afterRate: number;
  change: number;
  direction: PatchChange;
  issueStatus: IssueStatus | null;
}

export interface PatchImpactEntry {
  id: string;
  title: string;
  url: string | null;
  postedAt: string;
  isPatchNotes: boolean;
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

// =========================================================
// SHARED API REQUEST
// =========================================================

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      // Required for the browser to send/receive the HttpOnly session cookie.
      credentials: "include",
    });
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
      // Not JSON, e.g. the dev server's proxy error when the API is down.
    }

    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}

// =========================================================
// AUTHENTICATION API
// =========================================================

/*
 * Register a new GameScope account.
 *
 * Every account receives the player role.
 * Developer accounts additionally receive the developer role.
 */
export function signUp(data: SignUpRequest) {
  return request<SignUpResponse>("/api/auth/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
}

/*
 * Authenticate an existing GameScope account.
 */
export function login(data: LoginRequest) {
  return request<LoginResponse>("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
}

/*
 * Restore the authenticated user when the app loads or refreshes.
 * The browser automatically sends the HttpOnly session cookie.
 */
export function getCurrentUser() {
  return request<CurrentUserResponse>("/api/auth/me");
}

/*
 * Revoke the current server-side session and clear the session cookie.
 */
export function logout() {
  return request<LogoutResponse>("/api/auth/logout", {
    method: "POST",
  });
}

/*
 * Retrieve all active sessions for the authenticated account.
 */
export function getActiveSessions() {
  return request<ActiveSessionsResponse>("/api/auth/sessions");
}

/*
 * Revoke every active session belonging to the account.
 */
export function logoutAllDevices() {
  return request<LogoutAllResponse>("/api/auth/logout-all", {
    method: "POST",
  });
}

/*
 * Request a password-reset email.
 *
 * The backend returns a generic message whether or not
 * the supplied email belongs to an account.
 */
export function forgotPassword(email: string) {
  return request<ForgotPasswordResponse>(
    "/api/auth/forgot-password",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    }
  );
}

/*
 * Reset the account password using the emailed reset token.
 */
export function resetPassword(data: ResetPasswordRequest) {
  return request<ResetPasswordResponse>(
    "/api/auth/reset-password",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
  );
}

// =========================================================
// STEAM GAME API
// =========================================================

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

// =========================================================
// GAME ANALYSIS API
// =========================================================

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
export function getTrending(
  limit: number,
  signal?: AbortSignal
) {
  return request<TrendingGame[]>(
    `/api/trending?limit=${limit}`,
    { signal }
  );
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

// =========================================================
// ISSUES API
// =========================================================

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

/*
 * Update the status of an issue.
 */
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

// =========================================================
// REVIEWS API
// =========================================================

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

// =========================================================
// PATCH IMPACT API
// =========================================================

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
