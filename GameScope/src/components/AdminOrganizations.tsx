
import { useEffect, useState } from "react";
import Navbar from "./Navbar";
import "./AdminOrganizations.css";
import type { AccentColor } from "../App";
import type { Page, Mode } from "../type";
import {
  getAdminOrganizations,
} from "../api";
import type {
  AdminOrganization,
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
    }: AdminOrganizationsProps) {
    const [organizations, setOrganizations] = useState<
    AdminOrganization[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadOrganizations = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await getAdminOrganizations();

        if (!cancelled) {
          setOrganizations(response.organizations);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load organizations."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadOrganizations();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className={`admin-organizations-page ${
        darkMode ? "admin-organizations-dark" : "admin-organizations-light"
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

        <section className="admin-organizations-section">
          <div className="admin-organizations-section-heading">
            <div>
              <h2>Registered Organizations</h2>
              <p>
                Review organization records and their verified
                memberships and game relationships.
              </p>
            </div>

            <span className="admin-organizations-count">
              {organizations.length} organizations
            </span>
          </div>

          {loading ? (
            <div className="admin-organizations-state">
              Loading organizations...
            </div>
          ) : error ? (
            <div className="admin-organizations-error" role="alert">
              {error}
            </div>
          ) : organizations.length === 0 ? (
            <div className="admin-organizations-state">
              No organizations have been registered yet.
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
                      Created by user #{organization.created_by_user_id}
                    </span>
                    <span>
                      {new Date(
                        organization.created_at
                      ).toLocaleDateString()}
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
