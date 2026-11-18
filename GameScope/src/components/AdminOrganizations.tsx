
import { useEffect, useState } from "react";
import Navbar from "./Navbar";
import "./AdminOrganizations.css";

import type { AccentColor } from "../App";
import type { Page, Mode } from "../type";

import {
  getAdminOrganizations,
  getAdminOrganizationRequests,
  getAdminOrganizationGameSubmissions,
  reviewAdminOrganizationMembership,
  reviewAdminOrganizationGame,
} from "../api";

import type {
  AdminOrganization,
  AdminOrganizationRequest,
  AdminOrganizationGameSubmission,
} from "../api";

interface AdminOrganizationsProps {
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  currentPage: Page;
  setCurrentPage: React.Dispatch<React.SetStateAction<Page>>;
  onLogoClick: () => void;
  accentColor: AccentColor;
  mode: Mode;
  setAccentColor: React.Dispatch<React.SetStateAction<AccentColor>>;
  setMode: React.Dispatch<React.SetStateAction<Mode>>;
  isLoggedIn?: boolean;
  accountEmail?: string;
  onLogout?: () => void;
  steamConnected: boolean;
  onSteamConnect: () => void;
  onSteamDisconnect: () => void;
  isAdmin?: boolean;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

function formatOrganizationDate(date: string): string {
  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Date unavailable";
  }

  return dateFormatter.format(parsedDate);
}

function AdminOrganizations({
  darkMode,
  setDarkMode,
  currentPage,
  setCurrentPage,
  onLogoClick,
  mode,
  setMode,
  accentColor,
  isLoggedIn = false,
  accountEmail = "",
  isAdmin = false,
}: AdminOrganizationsProps) {
  const [organizations, setOrganizations] = useState<
    AdminOrganization[]
  >([]);

  const [requests, setRequests] = useState<
    AdminOrganizationRequest[]
  >([]);

  const [gameSubmissions, setGameSubmissions] = useState<
    AdminOrganizationGameSubmission[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [gameRequestError, setGameRequestError] = useState("");

  const [processingRequest, setProcessingRequest] =
    useState<string | null>(null);

  const loadAdminData = async () => {
    setLoading(true);
    setError("");
    setRequestError("");
    setGameRequestError("");

    try {
      const [
        organizationResponse,
        requestResponse,
        gameSubmissionResponse,
      ] = await Promise.all([
        getAdminOrganizations(),
        getAdminOrganizationRequests(),
        getAdminOrganizationGameSubmissions(),
      ]);

      setOrganizations(organizationResponse.organizations);
      setRequests(requestResponse.requests);
      setGameSubmissions(gameSubmissionResponse.submissions);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load admin information."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAdminData();
  }, []);

  // =========================================================
  // MEMBERSHIP APPROVALS
  // =========================================================

  const handleMembershipReview = async (
    request: AdminOrganizationRequest,
    decision: "verified" | "rejected"
  ) => {
    const requestKey =
      `membership-${request.organization_id}-${request.user_id}`;

    if (processingRequest) return;

    setProcessingRequest(requestKey);
    setRequestError("");

    try {
      await reviewAdminOrganizationMembership(
        request.organization_id,
        request.user_id,
        decision
      );

      setRequests((previous) =>
        previous.filter(
          (item) =>
            item.organization_id !== request.organization_id ||
            item.user_id !== request.user_id
        )
      );

      const response = await getAdminOrganizations();
      setOrganizations(response.organizations);
    } catch (err) {
      setRequestError(
        err instanceof Error
          ? err.message
          : "Unable to review this membership request."
      );
    } finally {
      setProcessingRequest(null);
    }
  };

  // =========================================================
  // GAME SUBMISSION APPROVALS
  // =========================================================

  const handleGameReview = async (
    submission: AdminOrganizationGameSubmission,
    decision: "verified" | "rejected"
  ) => {
    const requestKey =
      `game-${submission.organization_id}-${submission.game_id}`;

    if (processingRequest) return;

    setProcessingRequest(requestKey);
    setGameRequestError("");

    try {
      await reviewAdminOrganizationGame(
        submission.organization_id,
        submission.game_id,
        submission.relationship,
        decision
      );

      setGameSubmissions((previous) =>
        previous.filter(
          (item) =>
            item.organization_id !== submission.organization_id ||
            item.game_id !== submission.game_id
        )
      );

      const response = await getAdminOrganizations();
      setOrganizations(response.organizations);
    } catch (err) {
      setGameRequestError(
        err instanceof Error
          ? err.message
          : "Unable to review this game submission."
      );
    } finally {
      setProcessingRequest(null);
    }
  };

  const organizationCount = organizations.length;

  return (
    <div
      className={`admin-organizations-page ${
        darkMode
          ? "admin-organizations-dark"
          : "admin-organizations-light"
      } admin-organizations-accent-${accentColor}`}
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
        isAdmin={isAdmin}
      />

      <main className="admin-organizations-main">
        <header className="admin-organizations-header">
          <div className="admin-organizations-eyebrow">
            <span />
            ADMINISTRATION
          </div>

          <h1>
            Organization Management<span>.</span>
          </h1>

          <p>
            Manage registered organizations, memberships, and
            verified game relationships across GameScope.
          </p>
        </header>

        {/* =====================================================
            PENDING MEMBERSHIP REQUESTS
        ====================================================== */}

        <section
          className="admin-organizations-section"
          aria-labelledby="admin-requests-title"
        >
          <div className="admin-organizations-section-heading">
            <div>
              <h2 id="admin-requests-title">
                Pending Membership Requests
              </h2>

              <p>
                Review developers requesting access to an organization.
              </p>
            </div>

            <span className="admin-organizations-count">
              {requests.length} pending
            </span>
          </div>

          {requestError && (
            <div className="admin-organizations-error" role="alert">
              {requestError}
            </div>
          )}

          {loading ? (
            <div className="admin-organizations-state">
              Loading membership requests...
            </div>
          ) : error ? (
            <div className="admin-organizations-error" role="alert">
              <strong>Unable to load admin information</strong>
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void loadAdminData()}
              >
                Try again
              </button>
            </div>
          ) : requests.length === 0 ? (
            <div className="admin-organizations-state">
              <strong>No pending membership requests</strong>
              <p>
                New developer organization requests will appear here.
              </p>
            </div>
          ) : (
            <div className="admin-membership-requests">
              {requests.map((request) => {
                const requestKey =
                  `membership-${request.organization_id}-${request.user_id}`;

                const isProcessing =
                  processingRequest === requestKey;

                return (
                  <article
                    className="admin-membership-request"
                    key={requestKey}
                  >
                    <div className="admin-membership-request-info">
                      <h3>{request.username}</h3>

                      <p>
                        Account email: {request.account_email}
                      </p>

                      <p>
                        Organization:{" "}
                        <strong>{request.organization_name}</strong>
                      </p>

                      <p>
                        Organization email:{" "}
                        {request.organization_email}
                      </p>

                      <span>
                        Requested:{" "}
                        {formatOrganizationDate(
                          request.requested_at
                        )}
                      </span>
                    </div>

                    <div className="admin-membership-request-actions">
                      <button
                        type="button"
                        className="admin-membership-approve"
                        disabled={processingRequest !== null}
                        onClick={() =>
                          void handleMembershipReview(
                            request,
                            "verified"
                          )
                        }
                      >
                        {isProcessing
                          ? "Processing..."
                          : "Approve"}
                      </button>

                      <button
                        type="button"
                        className="admin-membership-reject"
                        disabled={processingRequest !== null}
                        onClick={() =>
                          void handleMembershipReview(
                            request,
                            "rejected"
                          )
                        }
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* =====================================================
            PENDING GAME APPROVALS
        ====================================================== */}

        <section
          className="admin-organizations-section"
          aria-labelledby="admin-game-requests-title"
        >
          <div className="admin-organizations-section-heading">
            <div>
              <h2 id="admin-game-requests-title">
                Pending Game Approvals
              </h2>

              <p>
                Review games submitted by verified organization members.
              </p>
            </div>

            <span className="admin-organizations-count">
              {gameSubmissions.length} pending
            </span>
          </div>

          {gameRequestError && (
            <div className="admin-organizations-error" role="alert">
              {gameRequestError}
            </div>
          )}

          {loading ? (
            <div className="admin-organizations-state">
              Loading game submissions...
            </div>
          ) : error ? (
            <div className="admin-organizations-error" role="alert">
              {error}
            </div>
          ) : gameSubmissions.length === 0 ? (
            <div className="admin-organizations-state">
              <strong>No pending game approvals</strong>
              <p>
                New organization game submissions will appear here.
              </p>
            </div>
          ) : (
            <div className="admin-membership-requests">
              {gameSubmissions.map((submission) => {
                const requestKey =
                  `game-${submission.organization_id}-${submission.game_id}`;

                const isProcessing =
                  processingRequest === requestKey;

                return (
                  <article
                    className="admin-membership-request"
                    key={requestKey}
                  >
                    <div className="admin-membership-request-info">
                      <h3>{submission.game_name}</h3>

                      <p>
                        Organization:{" "}
                        <strong>
                          {submission.organization_name}
                        </strong>
                      </p>

                      <p>
                        Steam App ID: {submission.app_id}
                      </p>

                      <p>
                        Relationship:{" "}
                        <strong>
                          {submission.relationship.charAt(0).toUpperCase() +
                            submission.relationship.slice(1)}
                        </strong>
                      </p>

                      <p>
                        Submitted by:{" "}
                        {submission.submitted_by ?? "Unknown user"}
                      </p>

                      <span>
                        Submitted:{" "}
                        {formatOrganizationDate(
                          submission.added_at
                        )}
                      </span>
                    </div>

                    <div className="admin-membership-request-actions">
                      <button
                        type="button"
                        className="admin-membership-approve"
                        disabled={processingRequest !== null}
                        onClick={() =>
                          void handleGameReview(
                            submission,
                            "verified"
                          )
                        }
                      >
                        {isProcessing
                          ? "Processing..."
                          : "Approve"}
                      </button>

                      <button
                        type="button"
                        className="admin-membership-reject"
                        disabled={processingRequest !== null}
                        onClick={() =>
                          void handleGameReview(
                            submission,
                            "rejected"
                          )
                        }
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* =====================================================
            REGISTERED ORGANIZATIONS
        ====================================================== */}

        <section
          className="admin-organizations-section"
          aria-labelledby="admin-organizations-title"
        >
          <div className="admin-organizations-section-heading">
            <div>
              <h2 id="admin-organizations-title">
                Registered Organizations
              </h2>

              <p>
                Review organization records, verified memberships,
                and associated game relationships.
              </p>
            </div>

            <span
              className="admin-organizations-count"
              aria-live="polite"
            >
              {organizationCount}{" "}
              {organizationCount === 1
                ? "organization"
                : "organizations"}
            </span>
          </div>

          {loading ? (
            <div className="admin-organizations-state">
              <span className="admin-organizations-loader" />
              <span>Loading organizations...</span>
            </div>
          ) : error ? (
            <div className="admin-organizations-error" role="alert">
              {error}
            </div>
          ) : organizationCount === 0 ? (
            <div className="admin-organizations-state">
              <div className="admin-organizations-empty-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 21h18" />
                  <path d="M5 21V7l7-4 7 4v14" />
                  <path d="M9 9h.01" />
                  <path d="M15 9h.01" />
                  <path d="M9 13h.01" />
                  <path d="M15 13h.01" />
                  <path d="M10 21v-4h4v4" />
                </svg>
              </div>

              <strong>No organizations yet</strong>

              <p>
                Registered organizations will appear here once
                they have been created.
              </p>
            </div>
          ) : (
            <div className="admin-organizations-grid">
              {organizations.map((organization) => (
                <article
                  className="admin-organization-card"
                  key={organization.organization_id}
                >
                  <div className="admin-organization-card-top">
                    <div className="admin-organization-icon">
                      {organization.organization_name
                        .charAt(0)
                        .toUpperCase()}
                    </div>

                    <span className="admin-organization-id">
                      ORG #{organization.organization_id}
                    </span>
                  </div>

                  <h3>{organization.organization_name}</h3>

                  <div className="admin-organization-stats">
                    <div>
                      <strong>
                        {organization.verified_members}
                      </strong>
                      <span>Verified members</span>
                    </div>

                    <div>
                      <strong>
                        {organization.verified_game_relationships}
                      </strong>
                      <span>Verified game relationships</span>
                    </div>
                  </div>

                  <div className="admin-organization-card-footer">
                    <span>
                      Created by user #
                      {organization.created_by_user_id}
                    </span>

                    <span>
                      {formatOrganizationDate(
                        organization.created_at
                      )}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default AdminOrganizations;
