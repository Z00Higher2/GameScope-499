
import React, { useState } from "react";
import { resetPassword } from "../api";
import "./Login.css";

interface ResetPasswordProps {
  darkMode: boolean;
  token: string;
  onBack: () => void;
}

function ResetPassword({
  darkMode,
  token,
  onBack,
}: ResetPasswordProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (loading) return;

    setError("");

    if (!token) {
      setError(
        "Your password-reset link is invalid or missing its token."
      );
      return;
    }

    if (password.length < 8 || password.length > 128) {
      setError("Your password must be between 8 and 128 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await resetPassword({
        token,
        new_password: password,
      });

      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to reset your password. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className={`login-page ${
        darkMode ? "login-dark-mode" : "login-light-mode"
      }`}
    >
      {/* Animated background */}
      <div className="login-background">
        <div className="login-glow login-glow-one" />
        <div className="login-glow login-glow-two" />
        <div className="login-grid" />
      </div>

      <section className="login-card">
        {/* Back navigation */}
        <button
          type="button"
          className="login-back-button"
          onClick={onBack}
        >
          <span className="login-back-arrow">←</span>
          Back to Sign In
        </button>

        {/* Branding */}
        <div className="login-heading">
          <div className="login-brand-icon">G</div>

          <span className="login-eyebrow">
            ACCOUNT SECURITY
          </span>

          <h1>
            Reset Password<span>.</span>
          </h1>

          <p>
            {submitted
              ? "Your account password has been updated."
              : "Create a new password for your GameScope account."}
          </p>
        </div>

        {!submitted ? (
          <form onSubmit={handleSubmit}>
            <div className="login-field-group">
              <label htmlFor="new-password">
                New Password
              </label>

              <div className="login-input-wrapper">
                <span className="login-input-icon">🔒</span>

                <input
                  id="new-password"
                  type="password"
                  placeholder="Enter your new password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  disabled={loading}
                />
              </div>

              <span className="recovery-hint">
                Use between 8 and 128 characters.
              </span>
            </div>

            <div className="login-field-group">
              <label htmlFor="confirm-password">
                Confirm New Password
              </label>

              <div className="login-input-wrapper">
                <span className="login-input-icon">🔒</span>

                <input
                  id="confirm-password"
                  type="password"
                  placeholder="Confirm your new password"
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    setError("");
                  }}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {error && (
              <div className="login-error" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="login-submit-button"
              disabled={loading}
            >
              <span>
                {loading
                  ? "Updating Password..."
                  : "Update Password"}
              </span>

              <span className="login-submit-arrow">
                {loading ? "..." : "→"}
              </span>
            </button>
          </form>
        ) : (
          <div className="recovery-success" role="status">
            <div className="recovery-success-icon">✓</div>

            <h2>Password Updated!</h2>

            <p>
              Your password has been changed successfully.
              You can now sign in using your new password.
            </p>

            <button
              type="button"
              className="login-submit-button"
              onClick={onBack}
            >
              <span>Return to Sign In</span>
              <span className="login-submit-arrow">→</span>
            </button>
          </div>
        )}

        <p className="login-footer-text">
          GameScope account security.
        </p>
      </section>
    </main>
  );
}

export default ResetPassword;
