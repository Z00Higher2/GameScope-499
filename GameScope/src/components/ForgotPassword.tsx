
import React, { useState } from "react";
import { forgotPassword } from "../api";
import "./Login.css";

interface ForgotPasswordProps {
  darkMode: boolean;
  onBack: () => void;
}

function ForgotPassword({
  darkMode,
  onBack,
}: ForgotPasswordProps) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!email.trim() || loading) return;

    setLoading(true);
    setError("");

    try {
      await forgotPassword(email.trim());

      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to process your request. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChangeEmail = () => {
    setSubmitted(false);
    setError("");
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
            ACCOUNT RECOVERY
          </span>

          <h1>
            Forgot Password<span>.</span>
          </h1>

          <p>
            {submitted
              ? "Check your inbox for the next steps."
              : "Don't worry. It happens. Enter your email to recover access to your account."}
          </p>
        </div>

        {!submitted ? (
          <form onSubmit={handleSubmit}>
            <div className="login-field-group">
              <label htmlFor="recovery-email">
                Email Address
              </label>

              <div className="login-input-wrapper">
                <span className="login-input-icon">✉</span>

                <input
                  id="recovery-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError("");
                  }}
                  autoComplete="email"
                  required
                  disabled={loading}
                />
              </div>

              <span className="recovery-hint">
                We'll use this address for your account recovery.
              </span>
            </div>

            {error && (
              <div
                className="login-error"
                role="alert"
              >
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
                  ? "Sending Instructions..."
                  : "Send Recovery Instructions"}
              </span>

              <span className="login-submit-arrow">
                {loading ? "..." : "→"}
              </span>
            </button>
          </form>
        ) : (
          <div className="recovery-success" role="status">
            <div className="recovery-success-icon">✓</div>

            <h2>Request Submitted</h2>

            <p>
              If an account exists for{" "}
              <strong>{email}</strong>, recovery instructions
              will be sent to that address.
            </p>

            <button
              type="button"
              className="login-submit-button"
              onClick={onBack}
            >
              <span>Return to Sign In</span>
              <span className="login-submit-arrow">→</span>
            </button>

            <button
              type="button"
              className="recovery-change-email"
              onClick={handleChangeEmail}
            >
              Use a different email address
            </button>
          </div>
        )}

        <p className="login-footer-text">
          GameScope account recovery.
        </p>
      </section>
    </main>
  );
}

export default ForgotPassword;
