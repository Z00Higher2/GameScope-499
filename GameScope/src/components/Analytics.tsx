import { useEffect, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

import Navbar from "./Navbar";
import "./Dashboard.css";
import "./Analytics.css";

/* =========================================================
   Analytics Props
========================================================= */

interface AnalyticsProps {
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;

  currentPage: "dashboard" | "reviews" | "analytics";
  setCurrentPage: React.Dispatch<
    React.SetStateAction<"dashboard" | "reviews" | "analytics">
  >;

  /*
    APP STATE

    analyzed:
      false = show example analytics
      true  = show analytics for analyzed game

    analyzedAppId:
      App ID entered by the user on Dashboard
  */
  analyzed: boolean;
  analyzedAppId: string;
  onLogoClick: () => void;

}

/* =========================================================
   Custom Chart Tooltip
========================================================= */

function GameTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number | string;
    color?: string;
  }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="game-tooltip">
      <span className="tooltip-label">{label}</span>

      <div className="tooltip-values">
        {payload.map((entry, index) => (
          <div className="tooltip-row" key={`${entry.name}-${index}`}>
            <span
              className="tooltip-dot"
              style={{
                background: entry.color || "#8b5cf6",
              }}
            />

            <span className="tooltip-name">
              {entry.name}
            </span>

            <strong>
              {typeof entry.value === "number"
                ? entry.value.toLocaleString()
                : entry.value}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================================================
   Scroll Reveal
========================================================= */

function Reveal({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
      },
      {
        threshold: 0.15,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`scroll-reveal ${
        visible ? "scroll-reveal-visible" : ""
      }`}
      style={{
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* =========================================================
   Animated Number
========================================================= */

function AnimatedNumber({
  value,
  duration = 1200,
}: {
  value: number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [displayValue, setDisplayValue] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
        }
      },
      {
        threshold: 0.3,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [started]);

  useEffect(() => {
    if (!started) {
      return;
    }

    let animationFrame: number;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.floor(easeOut * value);

      setDisplayValue(currentValue);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        setDisplayValue(value);
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [started, value, duration]);

  return (
    <span ref={ref}>
      {displayValue.toLocaleString()}
    </span>
  );
}

/* =========================================================
   Donut Center Number
========================================================= */

/*
  The donut hole is ~132px wide, so long numbers must be shortened.

    1,284      -> "1,284"
    99,999     -> "99,999"
    100,000    -> "100K"
    1,250,000  -> "1.3M"
*/
function formatCenterTotal(value: number): string {
  if (value >= 100000) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }

  return value.toLocaleString();
}

/* =========================================================
   Analytics
========================================================= */

function Analytics({
  darkMode,
  setDarkMode,
  currentPage,
  setCurrentPage,
  analyzed,
  analyzedAppId,
  onLogoClick
}: AnalyticsProps) {
  /* =========================================================
     GAME INFORMATION
  ========================================================= */

  /*
    EXAMPLE:

    Before a game is analyzed, we display the example
    Path of Exile 2 dataset.

    AFTER ANALYSIS:

    analyzedAppId comes from App.tsx.

    BACKEND:

    Eventually the backend should also return:

      game_name
      app_id

    so the actual Steam game name can be displayed.
  */

  const exampleGameName = "Path of Exile 2";
  const exampleAppId = "2694490";

  const displayedAppId = analyzed
    ? analyzedAppId
    : exampleAppId;

  /*
    IMPORTANT:

    Until the backend is connected, we cannot know the
    actual Steam game name from the App ID.

    For now, display the App ID entered by the user.

    Later:

      gameName = backendData.game_name
  */

  const gameName = analyzed
    ? `Steam Game ${displayedAppId}`
    : exampleGameName;

  /* =========================================================
     SUMMARY STATISTICS
  ========================================================= */

  /*
    BACKEND:

    Replace these values with FastAPI response data.

    Example:

      analysisData.total_reviews
      analysisData.positive_reviews
      analysisData.negative_reviews
      analysisData.average_playtime
      analysisData.average_helpful_votes
  */

  const totalReviews = 1284;
  const positiveReviews = 925;
  const negativeReviews = 359;

  const positivePercentage = 72;
  const negativePercentage = 28;

  const averagePlaytime = 184;
  const averageHelpfulVotes = 17;

  /* =========================================================
     SENTIMENT TREND
  ========================================================= */

  /*
    DEMO DATA

    Your current SQL table does NOT contain timestamps.

    Therefore this chart cannot currently represent
    real changes over time.

    If review timestamps are added later, the backend
    can calculate real weekly/monthly sentiment.
  */

  const sentimentTrend = [
    { period: "Week 1", positive: 74, negative: 26 },
    { period: "Week 2", positive: 71, negative: 29 },
    { period: "Week 3", positive: 76, negative: 24 },
    { period: "Week 4", positive: 72, negative: 28 },
    { period: "Week 5", positive: 70, negative: 30 },
    { period: "Week 6", positive: 73, negative: 27 },
  ];

  /* =========================================================
     ISSUE FREQUENCY
  ========================================================= */

  /*
    BACKEND:

    Python/C++ analysis can identify issues from review
    text and return the frequency of each issue.
  */

  const issueFrequency = [
    {
      issue: "Inventory",
      reports: 1284,
    },
    {
      issue: "Performance",
      reports: 932,
    },
    {
      issue: "Multiplayer",
      reports: 641,
    },
    {
      issue: "Bugs",
      reports: 523,
    },
    {
      issue: "Progression",
      reports: 417,
    },
  ];

  /* =========================================================
     PLAYTIME DISTRIBUTION
  ========================================================= */

  const playtimeDistribution = [
    {
      range: "0-10 Hours",
      reviews: 186,
    },
    {
      range: "10-50 Hours",
      reviews: 324,
    },
    {
      range: "50-100 Hours",
      reviews: 298,
    },
    {
      range: "100-250 Hours",
      reviews: 281,
    },
    {
      range: "250+ Hours",
      reviews: 195,
    },
  ];

  /* =========================================================
     PLAYTIME VS RECOMMENDATION
  ========================================================= */

  /*
    NEW ANALYTIC

    Shows how recommendation changes depending on
    how much time players have spent playing.

    BACKEND:

    Calculate this from:

      playtime_hours
      recommended

    Example:

      GROUP BY playtime range
      COUNT recommended = TRUE
  */

  const playtimeRecommendation = [
    {
      range: "0-10",
      recommended: 61,
      notRecommended: 39,
    },
    {
      range: "10-50",
      recommended: 69,
      notRecommended: 31,
    },
    {
      range: "50-100",
      recommended: 74,
      notRecommended: 26,
    },
    {
      range: "100-250",
      recommended: 81,
      notRecommended: 19,
    },
    {
      range: "250+",
      recommended: 86,
      notRecommended: 14,
    },
  ];

  /* =========================================================
     RECOMMENDATION BREAKDOWN
  ========================================================= */

  const recommendationData = [
    {
      name: "Recommended",
      value: positiveReviews,
    },
    {
      name: "Not Recommended",
      value: negativeReviews,
    },
  ];

  /* =========================================================
     REVIEW QUALITY
  ========================================================= */

  /*
    BACKEND:

    Eventually calculate using:

      - Review length
      - Unique words
      - Helpful votes
      - Playtime
      - Detail
      - Relevance
      - Lingua language detection
      - Junk/spam filtering
  */

  const reviewQuality = 78;

  /* =========================================================
     REVIEW RELIABILITY
  ========================================================= */

  /*
    NEW ANALYTIC

    This is especially important for your project because
    your application is designed to identify more useful
    and reliable player feedback.

    BACKEND:

    Your Python/Lingua filtering system can eventually
    provide these values.
  */

  const reliabilityData = [
    {
      name: "Reliable",
      value: 78,
    },
    {
      name: "Questionable",
      value: 14,
    },
    {
      name: "Filtered",
      value: 8,
    },
  ];

  /* =========================================================
     POSITIVE TOPICS
  ========================================================= */

  /*
    NEW ANALYTIC

    BACKEND:

    Python/C++ NLP analysis should identify topics that
    occur frequently in recommended reviews.
  */

  const positiveTopics = [
    {
      topic: "Combat",
      mentions: 842,
    },
    {
      topic: "Graphics",
      mentions: 734,
    },
    {
      topic: "Story",
      mentions: 621,
    },
    {
      topic: "Sound",
      mentions: 438,
    },
    {
      topic: "Customization",
      mentions: 391,
    },
  ];

  /* =========================================================
     NEGATIVE TOPICS
  ========================================================= */

  const negativeTopics = [
    {
      topic: "Performance",
      mentions: 932,
    },
    {
      topic: "Inventory",
      mentions: 821,
    },
    {
      topic: "Bugs",
      mentions: 523,
    },
    {
      topic: "Multiplayer",
      mentions: 482,
    },
    {
      topic: "Progression",
      mentions: 417,
    },
  ];

  /* =========================================================
     MOST HELPFUL REVIEWS
  ========================================================= */

  /*
    NEW ANALYTIC

    BACKEND:

    Sort reviews by:

      helpful_votes DESC

    Then return the top reviews.

    IMPORTANT:

    Reviewer Steam IDs are NOT displayed because your
    project wants reviews to remain anonymous.
  */

  const mostHelpfulReviews = [
    {
      reviewNumber: 1,
      sentiment: "Negative",
      helpfulVotes: 1284,
      text: "Performance problems make the game difficult to enjoy.",
    },
    {
      reviewNumber: 2,
      sentiment: "Positive",
      helpfulVotes: 932,
      text: "The combat system and overall gameplay are excellent.",
    },
    {
      reviewNumber: 3,
      sentiment: "Positive",
      helpfulVotes: 641,
      text: "Great graphics and a lot of content to explore.",
    },
    {
      reviewNumber: 4,
      sentiment: "Negative",
      helpfulVotes: 523,
      text: "Multiplayer issues and bugs affect the experience.",
    },
  ];

  /* =========================================================
     ANALYSIS SUMMARY
  ========================================================= */

  /*
    BACKEND:

    Replace with an automatically generated summary from
    your Python/C++ analysis system.
  */

  const analysisSummary =
    "Most analyzed players recommend the game, but inventory and performance issues are frequently mentioned in negative feedback.";

  /* =========================================================
     CHART COLORS
  ========================================================= */

  const chartColors = {
    positive: "#22c55e",
    negative: "#ef4444",
    primary: "#8b5cf6",
    secondary: "#6366f1",
    warning: "#f59e0b",
    cyan: "#06b6d4",
  };

  const chartGrid = darkMode
    ? "rgba(255,255,255,0.07)"
    : "rgba(15,23,42,0.08)";

  const chartText = darkMode
    ? "#a1a1aa"
    : "#64748b";

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className={`analytics-page ${darkMode ? "dark-mode" : ""}`}>
      <Navbar
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        onLogoClick={onLogoClick}
      />

      <main className="analytics-main">

        {/* =================================================
            GAME HUD HEADER
        ================================================= */}

        <Reveal>
          <header className="analytics-hero">

            <div className="hero-content">

              <div className="hero-eyebrow">
                <span className="status-dot" />
                GAMESCOPE // PLAYER TELEMETRY
              </div>

              <h1>
                {analyzed
                  ? "Game Analytics"
                  : "Analytics Example"}
              </h1>

              <p>
                {analyzed
                  ? "Explore detailed statistics and patterns found in player feedback."
                  : "Preview the analytics available after analyzing a Steam game."}
              </p>

            </div>

            <div className="hero-status">
              <span className="hero-status-label">
                DATA STATUS
              </span>

              <strong>
                {analyzed ? "LIVE ANALYSIS" : "DEMO DATA"}
              </strong>

              <span className="hero-status-line" />
            </div>

          </header>
        </Reveal>

        {/* =================================================
            EXAMPLE NOTICE
        ================================================= */}

        {!analyzed && (
          <Reveal delay={100}>
            <section className="analysis-summary demo-summary">

              <div className="summary-icon">
                i
              </div>

              <div className="summary-content">
                <span className="summary-label">
                  DEMO ANALYTICS
                </span>

                <p>
                  This page is showing example analytics using{" "}
                  <strong>{exampleGameName}</strong>. Analyze a Steam
                  game from the Dashboard to replace these examples
                  with actual analysis results.
                </p>
              </div>

              <button
                className="reanalyze-button"
                onClick={() => setCurrentPage("dashboard")}
              >
                GO TO DASHBOARD
              </button>

            </section>
          </Reveal>
        )}

        {/* =================================================
            ANALYZED GAME STATUS
        ================================================= */}

        {analyzed && (
          <Reveal delay={100}>
            <section className="game-status">

              <div className="game-icon">
                🎮
              </div>

              <div className="game-status-info">
                <span className="status-label">
                  CURRENT SESSION
                </span>

                <h2>
                  {gameName}
                </h2>

                <p>
                  STEAM APP ID:{" "}
                  <strong>{displayedAppId}</strong>
                </p>
              </div>

              <div className="analysis-status">
                <span className="status-badge">
                  ● ANALYZED
                </span>

                <small className="analyzed-time">
                  SESSION ACTIVE
                </small>
              </div>

            </section>
          </Reveal>
        )}

        {/* =================================================
            SUMMARY STATISTICS
        ================================================= */}

        <Reveal delay={150}>
          <section className="stats-grid">

            <div className="stat-card stat-purple">

              <span className="stat-icon">
                ◈
              </span>

              <span className="stat-label">
                TOTAL REVIEWS
              </span>

              <strong>
                <AnimatedNumber
                  value={totalReviews}
                />
              </strong>

              <small>
                {analyzed
                  ? "Analyzed reviews"
                  : "Example analyzed reviews"}
              </small>

              <div className="stat-bar">
                <div
                  className="stat-bar-fill"
                  style={{ width: "86%" }}
                />
              </div>

            </div>

            <div className="stat-card stat-green">

              <span className="stat-icon">
                ✓
              </span>

              <span className="stat-label">
                AVG. PLAYTIME
              </span>

              <strong>
                <AnimatedNumber
                  value={averagePlaytime}
                />
                <small className="unit">
                  H
                </small>
              </strong>

              <small>
                Average player playtime
              </small>

              <div className="stat-bar">
                <div
                  className="stat-bar-fill"
                  style={{ width: "72%" }}
                />
              </div>

            </div>

            <div className="stat-card stat-cyan">

              <span className="stat-icon">
                ★
              </span>

              <span className="stat-label">
                HELPFUL VOTES
              </span>

              <strong>
                <AnimatedNumber
                  value={averageHelpfulVotes}
                />
              </strong>

              <small>
                Average per review
              </small>

              <div className="stat-bar">
                <div
                  className="stat-bar-fill"
                  style={{ width: "58%" }}
                />
              </div>

            </div>

          </section>
        </Reveal>

        {/* =================================================
            ANALYSIS SUMMARY
        ================================================= */}

        <Reveal delay={200}>
          <section className="analysis-summary">

            <div className="summary-icon">
              !
            </div>

            <div className="summary-content">
              <span className="summary-label">
                MISSION INTEL
              </span>

              <p>
                {analysisSummary}
              </p>
            </div>

            {analyzed && (
              <button
                className="reanalyze-button"
                onClick={() => setCurrentPage("dashboard")}
              >
                ← DASHBOARD
              </button>
            )}

          </section>
        </Reveal>

        {/* =================================================
            SENTIMENT OVERVIEW
        ================================================= */}

        <Reveal delay={100}>
          <div className="dashboard-card chart-card">

            <div className="card-header game-card-header">

              <div>
                <span className="chart-kicker">
                  PLAYER METRICS // 01
                </span>

                <h2>
                  Sentiment Overview
                </h2>

                <p>
                  Overall recommendation distribution.
                </p>
              </div>

              <span className="chart-badge positive-badge">
                {positivePercentage}% POSITIVE
              </span>

            </div>

            <div className="chart-container pie-chart-container">

              <ResponsiveContainer
                width="100%"
                height={340}
              >
                <PieChart>

                  <Pie
                    data={recommendationData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy={150}
                    outerRadius={112}
                    innerRadius={66}
                    paddingAngle={4}
                    label
                    animationDuration={1400}
                    stroke="none"
                  >
                    <Cell fill={chartColors.positive} />
                    <Cell fill={chartColors.negative} />
                  </Pie>

                  <Tooltip
                    content={<GameTooltip />}
                  />

                  <Legend
                    verticalAlign="bottom"
                    height={30}
                  />

                </PieChart>
              </ResponsiveContainer>

              <div className="pie-center-label">
                <span>TOTAL</span>
                <strong
                  title={totalReviews.toLocaleString()}
                  style={{
                    whiteSpace: "nowrap",
                    fontSize:
                      formatCenterTotal(totalReviews).length > 5
                        ? 19
                        : 23,
                  }}
                >
                  {formatCenterTotal(totalReviews)}
                </strong>
                <small>REVIEWS</small>
              </div>

            </div>

          </div>
        </Reveal>

        {/* =================================================
            SENTIMENT TREND
        ================================================= */}

        <Reveal delay={150}>
          <div className="dashboard-card chart-card">

            <div className="card-header game-card-header">

              <div>
                <span className="chart-kicker">
                  PLAYER TELEMETRY // 02
                </span>

                <h2>
                  Sentiment Trend
                </h2>

                <p>
                  Changes in positive and negative feedback
                  across the analyzed data.
                </p>
              </div>

              <span className="chart-badge telemetry-badge">
                LIVE TREND
              </span>

            </div>

            <div className="chart-container">

              <ResponsiveContainer
                width="100%"
                height={340}
              >
                <LineChart
                  data={sentimentTrend}
                  margin={{
                    top: 20,
                    right: 20,
                    left: 0,
                    bottom: 10,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="4 6"
                    stroke={chartGrid}
                    vertical={false}
                  />

                  <XAxis
                    dataKey="period"
                    stroke={chartText}
                    tick={{
                      fill: chartText,
                      fontSize: 12,
                    }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <YAxis
                    stroke={chartText}
                    tick={{
                      fill: chartText,
                      fontSize: 12,
                    }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 100]}
                    tickFormatter={(value) => `${value}%`}
                  />

                  <Tooltip
                    content={<GameTooltip />}
                  />

                  <Legend />

                  <Line
                    type="monotone"
                    dataKey="positive"
                    name="Positive %"
                    stroke={chartColors.positive}
                    strokeWidth={4}
                    dot={{
                      r: 5,
                      fill: chartColors.positive,
                      strokeWidth: 2,
                    }}
                    activeDot={{
                      r: 8,
                    }}
                    animationDuration={1400}
                  />

                  <Line
                    type="monotone"
                    dataKey="negative"
                    name="Negative %"
                    stroke={chartColors.negative}
                    strokeWidth={4}
                    dot={{
                      r: 5,
                      fill: chartColors.negative,
                      strokeWidth: 2,
                    }}
                    activeDot={{
                      r: 8,
                    }}
                    animationDuration={1400}
                    animationBegin={200}
                  />

                </LineChart>
              </ResponsiveContainer>

            </div>

          </div>
        </Reveal>

        {/* =================================================
            TOP ISSUES
        ================================================= */}

        <Reveal delay={200}>
          <div className="dashboard-card chart-card">

            <div className="card-header game-card-header">

              <div>
                <span className="chart-kicker">
                  COMBAT LOG // 03
                </span>

                <h2>
                  Top Issues
                </h2>

                <p>
                  Problems mentioned most frequently in
                  player feedback.
                </p>
              </div>

              <span className="chart-badge danger-badge">
                ISSUE DETECTION
              </span>

            </div>

            <div className="chart-container">

              <ResponsiveContainer
                width="100%"
                height={360}
              >
                <BarChart
                  data={issueFrequency}
                  margin={{
                    top: 20,
                    right: 20,
                    left: 0,
                    bottom: 10,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="4 6"
                    stroke={chartGrid}
                    vertical={false}
                  />

                  <XAxis
                    dataKey="issue"
                    stroke={chartText}
                    tick={{
                      fill: chartText,
                      fontSize: 12,
                    }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <YAxis
                    stroke={chartText}
                    tick={{
                      fill: chartText,
                      fontSize: 12,
                    }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <Tooltip
                    content={<GameTooltip />}
                  />

                  <Bar
                    dataKey="reports"
                    name="Reports"
                    fill={chartColors.primary}
                    radius={[8, 8, 2, 2]}
                    animationDuration={1400}
                  />

                </BarChart>
              </ResponsiveContainer>

            </div>

          </div>
        </Reveal>

        {/* =================================================
            TWO-COLUMN ANALYTICS
        ================================================= */}

        <section className="dashboard-content">

          {/* =================================================
              PLAYER PLAYTIME
          ================================================= */}

          <Reveal delay={100}>
            <div className="dashboard-card chart-card">

              <div className="card-header game-card-header">

                <div>
                  <span className="chart-kicker">
                    PLAYER PROFILE // 04
                  </span>

                  <h2>
                    Player Playtime
                  </h2>

                  <p>
                    Distribution of reviews by player
                    experience.
                  </p>
                </div>

              </div>

              <div className="chart-container">

                <ResponsiveContainer
                  width="100%"
                  height={320}
                >
                  <BarChart
                    data={playtimeDistribution}
                    margin={{
                      top: 20,
                      right: 15,
                      left: 0,
                      bottom: 10,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="4 6"
                      stroke={chartGrid}
                      vertical={false}
                    />

                    <XAxis
                      dataKey="range"
                      stroke={chartText}
                      tick={{
                        fill: chartText,
                        fontSize: 11,
                      }}
                      axisLine={false}
                      tickLine={false}
                    />

                    <YAxis
                      stroke={chartText}
                      tick={{
                        fill: chartText,
                        fontSize: 11,
                      }}
                      axisLine={false}
                      tickLine={false}
                    />

                    <Tooltip
                      content={<GameTooltip />}
                    />

                    <Bar
                      dataKey="reviews"
                      name="Reviews"
                      fill={chartColors.secondary}
                      radius={[8, 8, 2, 2]}
                      animationDuration={1400}
                    />

                  </BarChart>
                </ResponsiveContainer>

              </div>

            </div>
          </Reveal>

          {/* =================================================
              REVIEW RELIABILITY
          ================================================= */}

          <Reveal delay={200}>
            <div className="dashboard-card chart-card">

              <div className="card-header game-card-header">

                <div>
                  <span className="chart-kicker">
                    SIGNAL ANALYSIS // 05
                  </span>

                  <h2>
                    Review Reliability
                  </h2>

                  <p>
                    Classification of useful and filtered
                    player feedback.
                  </p>
                </div>

              </div>

              <div className="chart-container pie-chart-container">

                <ResponsiveContainer
                  width="100%"
                  height={320}
                >
                  <PieChart>

                    <Pie
                      data={reliabilityData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy={140}
                      outerRadius={100}
                      innerRadius={58}
                      paddingAngle={4}
                      label
                      animationDuration={1400}
                      stroke="none"
                    >
                      <Cell fill={chartColors.positive} />
                      <Cell fill={chartColors.warning} />
                      <Cell fill={chartColors.negative} />
                    </Pie>

                    <Tooltip
                      content={<GameTooltip />}
                    />

                    <Legend
                      verticalAlign="bottom"
                      height={30}
                    />

                  </PieChart>
                </ResponsiveContainer>

              </div>

            </div>
          </Reveal>

        </section>

        {/* =================================================
            PLAYTIME VS RECOMMENDATION
        ================================================= */}

        <Reveal delay={100}>
          <div className="dashboard-card chart-card">

            <div className="card-header game-card-header">

              <div>
                <span className="chart-kicker">
                  PLAYER PROGRESSION // 06
                </span>

                <h2>
                  Playtime vs. Recommendation
                </h2>

                <p>
                  Recommendation percentage across different
                  levels of player experience.
                </p>
              </div>

              <span className="chart-badge positive-badge">
                EXPERIENCE DATA
              </span>

            </div>

            <div className="chart-container">

              <ResponsiveContainer
                width="100%"
                height={360}
              >
                <BarChart
                  data={playtimeRecommendation}
                  margin={{
                    top: 20,
                    right: 20,
                    left: 0,
                    bottom: 10,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="4 6"
                    stroke={chartGrid}
                    vertical={false}
                  />

                  <XAxis
                    dataKey="range"
                    stroke={chartText}
                    tick={{
                      fill: chartText,
                      fontSize: 12,
                    }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <YAxis
                    domain={[0, 100]}
                    stroke={chartText}
                    tick={{
                      fill: chartText,
                      fontSize: 12,
                    }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => `${value}%`}
                  />

                  <Tooltip
                    content={<GameTooltip />}
                  />

                  <Legend />

                  <Bar
                    dataKey="recommended"
                    name="Recommended %"
                    fill={chartColors.positive}
                    radius={[8, 8, 2, 2]}
                    animationDuration={1400}
                  />

                  <Bar
                    dataKey="notRecommended"
                    name="Not Recommended %"
                    fill={chartColors.negative}
                    radius={[8, 8, 2, 2]}
                    animationDuration={1400}
                    animationBegin={150}
                  />

                </BarChart>

              </ResponsiveContainer>

            </div>

          </div>
        </Reveal>

        {/* =================================================
            POSITIVE VS NEGATIVE TOPICS
        ================================================= */}

        <section className="dashboard-content">

          {/* =================================================
              POSITIVE TOPICS
          ================================================= */}

          <Reveal delay={100}>
            <div className="dashboard-card chart-card">

              <div className="card-header game-card-header">

                <div>
                  <span className="chart-kicker">
                    REWARD LOG // 07
                  </span>

                  <h2>
                    Positive Topics
                  </h2>

                  <p>
                    Topics frequently mentioned in
                    recommended reviews.
                  </p>
                </div>

                <span className="chart-badge positive-badge">
                  POSITIVE
                </span>

              </div>

              <div className="chart-container">

                <ResponsiveContainer
                  width="100%"
                  height={340}
                >
                  <BarChart
                    data={positiveTopics}
                    layout="vertical"
                    margin={{
                      top: 20,
                      right: 20,
                      left: 40,
                      bottom: 10,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="4 6"
                      stroke={chartGrid}
                      horizontal={false}
                    />

                    <XAxis
                      type="number"
                      stroke={chartText}
                      tick={{
                        fill: chartText,
                        fontSize: 11,
                      }}
                      axisLine={false}
                      tickLine={false}
                    />

                    <YAxis
                      type="category"
                      dataKey="topic"
                      stroke={chartText}
                      tick={{
                        fill: chartText,
                        fontSize: 12,
                      }}
                      axisLine={false}
                      tickLine={false}
                    />

                    <Tooltip
                      content={<GameTooltip />}
                    />

                    <Bar
                      dataKey="mentions"
                      name="Mentions"
                      fill={chartColors.positive}
                      radius={[0, 8, 8, 0]}
                      animationDuration={1400}
                    />

                  </BarChart>
                </ResponsiveContainer>

              </div>

            </div>
          </Reveal>

          {/* =================================================
              NEGATIVE TOPICS
          ================================================= */}

          <Reveal delay={200}>
            <div className="dashboard-card chart-card">

              <div className="card-header game-card-header">

                <div>
                  <span className="chart-kicker">
                    DAMAGE LOG // 08
                  </span>

                  <h2>
                    Negative Topics
                  </h2>

                  <p>
                    Topics frequently mentioned in
                    non-recommended reviews.
                  </p>
                </div>

                <span className="chart-badge danger-badge">
                  NEGATIVE
                </span>

              </div>

              <div className="chart-container">

                <ResponsiveContainer
                  width="100%"
                  height={340}
                >
                  <BarChart
                    data={negativeTopics}
                    layout="vertical"
                    margin={{
                      top: 20,
                      right: 20,
                      left: 40,
                      bottom: 10,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="4 6"
                      stroke={chartGrid}
                      horizontal={false}
                    />

                    <XAxis
                      type="number"
                      stroke={chartText}
                      tick={{
                        fill: chartText,
                        fontSize: 11,
                      }}
                      axisLine={false}
                      tickLine={false}
                    />

                    <YAxis
                      type="category"
                      dataKey="topic"
                      stroke={chartText}
                      tick={{
                        fill: chartText,
                        fontSize: 12,
                      }}
                      axisLine={false}
                      tickLine={false}
                    />

                    <Tooltip
                      content={<GameTooltip />}
                    />

                    <Bar
                      dataKey="mentions"
                      name="Mentions"
                      fill={chartColors.negative}
                      radius={[0, 8, 8, 0]}
                      animationDuration={1400}
                    />

                  </BarChart>

                </ResponsiveContainer>

              </div>

            </div>
          </Reveal>

        </section>

        {/* =================================================
            SENTIMENT NUMBERS
        ================================================= */}

        <Reveal delay={100}>
          <div className="dashboard-card issues-card">

            <div className="card-header game-card-header">

              <div>
                <span className="chart-kicker">
                  SCOREBOARD // 09
                </span>

                <h2>
                  Sentiment Numbers
                </h2>

                <p>
                  Detailed positive and negative review counts.
                </p>
              </div>

            </div>

            <div className="issues-list">

              <div className="issue-item">

                <div className="issue-number positive-number">
                  ✓
                </div>

                <div className="issue-info">

                  <div className="issue-title-row">
                    <span>
                      Positive Reviews
                    </span>

                    <strong>
                      <AnimatedNumber
                        value={positiveReviews}
                      />
                    </strong>
                  </div>

                  <div className="issue-progress">
                    <div
                      className="issue-progress-fill positive-fill"
                      style={{
                        width: `${positivePercentage}%`,
                      }}
                    />
                  </div>

                  <span className="progress-label">
                    {positivePercentage}% OF ANALYZED REVIEWS
                  </span>

                </div>

              </div>

              <div className="issue-item">

                <div className="issue-number negative-number">
                  !
                </div>

                <div className="issue-info">

                  <div className="issue-title-row">
                    <span>
                      Negative Reviews
                    </span>

                    <strong>
                      <AnimatedNumber
                        value={negativeReviews}
                      />
                    </strong>
                  </div>

                  <div className="issue-progress">
                    <div
                      className="issue-progress-fill negative-fill"
                      style={{
                        width: `${negativePercentage}%`,
                      }}
                    />
                  </div>

                  <span className="progress-label">
                    {negativePercentage}% OF ANALYZED REVIEWS
                  </span>

                </div>

              </div>

            </div>

          </div>
        </Reveal>

        {/* =================================================
            REVIEW QUALITY
        ================================================= */}

        <Reveal delay={100}>
          <section className="dashboard-card quality-card">

            <div className="quality-content">

              <div className="quality-description">

                <span className="chart-kicker">
                  SIGNAL STRENGTH // 10
                </span>

                <h2>
                  Review Quality
                </h2>

                <p>
                  Overall quality based on usefulness,
                  detail, and consistency of player
                  feedback.
                </p>

              </div>

              <div className="quality-score">

                <div
                  className="quality-circle"
                  style={
                    {
                      "--quality-progress":
                        `${reviewQuality}%`,
                    } as React.CSSProperties
                  }
                >
                  <span>
                    <AnimatedNumber
                      value={reviewQuality}
                    />
                    <small>%</small>
                  </span>
                </div>

                <div className="quality-text">

                  <span className="quality-rank">
                    QUALITY RATING
                  </span>

                  <strong>
                    GOOD QUALITY
                  </strong>

                  <p>
                    Most reviews provide useful
                    feedback for analysis.
                  </p>

                </div>

              </div>

            </div>

          </section>
        </Reveal>

        {/* =================================================
            MOST HELPFUL REVIEWS
        ================================================= */}

        <Reveal delay={150}>
          <section className="dashboard-card feedback-card">

            <div className="card-header game-card-header">

              <div>
                <span className="chart-kicker">
                  PLAYER INTEL // 11
                </span>

                <h2>
                  Most Helpful Reviews
                </h2>

                <p>
                  Anonymous reviews receiving the most
                  helpful votes.
                </p>
              </div>

              <span className="chart-badge telemetry-badge">
                ANONYMOUS
              </span>

            </div>

            <div className="feedback-list">

              {mostHelpfulReviews.map((review) => (
                <div
                  className="feedback-item"
                  key={review.reviewNumber}
                >

                  <div className="review-rank">
                    #{review.reviewNumber}
                  </div>

                  <div className="review-body">

                    <span
                      className={`feedback-type ${
                        review.sentiment === "Positive"
                          ? "feedback-positive"
                          : "feedback-negative"
                      }`}
                    >
                      {review.sentiment}
                    </span>

                    <p>
                      {review.text}
                    </p>

                    <strong>
                      👍 {review.helpfulVotes.toLocaleString()} helpful votes
                    </strong>

                  </div>

                </div>
              ))}

            </div>

          </section>
        </Reveal>

        {/* =================================================
            KEY INSIGHTS
        ================================================= */}

        <Reveal delay={200}>
          <section className="dashboard-card feedback-card">

            <div className="card-header game-card-header">

              <div>
                <span className="chart-kicker">
                  MISSION REPORT // 12
                </span>

                <h2>
                  Key Insights
                </h2>

                <p>
                  Important patterns identified from
                  the analyzed player feedback.
                </p>
              </div>

            </div>

            <div className="feedback-list">

              <div className="feedback-item insight-item">

                <span className="feedback-type feedback-negative">
                  ISSUE
                </span>

                <p>
                  Inventory problems are frequently
                  mentioned in player feedback.
                </p>

              </div>

              <div className="feedback-item insight-item">

                <span className="feedback-type feedback-negative">
                  PERFORMANCE
                </span>

                <p>
                  Performance concerns appear among
                  the most common negative topics.
                </p>

              </div>

              <div className="feedback-item insight-item">

                <span className="feedback-type feedback-positive">
                  SENTIMENT
                </span>

                <p>
                  The example dataset contains more
                  recommended reviews than
                  non-recommended reviews.
                </p>

              </div>

              <div className="feedback-item insight-item">

                <span className="feedback-type feedback-positive">
                  PLAYTIME
                </span>

                <p>
                  A significant portion of the example
                  feedback comes from players with
                  substantial playtime.
                </p>

              </div>

            </div>

          </section>
        </Reveal>

      </main>
    </div>
  );
}

export default Analytics;