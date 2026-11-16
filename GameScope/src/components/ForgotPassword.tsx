
import React, { useState } from "react";
import type { Mode } from "../type";
import { forgotPassword } from "../api";
import logo from "../img/gamescope-logo-light.png";
import PongLogo from "./PongLogo";
import "./SignIn.css";

interface ForgotPasswordProps {
  darkMode: boolean;
  mode: Mode;
  onBack: () => void;
}

function ForgotPassword({ mode, onBack }: ForgotPasswordProps) {
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
      className={`signin-page ${
        mode === "developer" ? "signin-dev" : "signin-player"
      }`}
    >
      <section className="signin-card" aria-labelledby="recovery-title">
        <button
          type="button"
          className="signin-back"
          onClick={onBack}
          disabled={loading}
        >
          ← Back to Sign In
        </button>

        <PongLogo src={logo} />

        <h1 id="recovery-title">
          {submitted ? "CHECK YOUR INBOX" : "FORGOT PASSWORD"}
        </h1>

        <p className="signin-subtitle">
          {submitted
            ? "Your request has been submitted."
            : "It happens. Enter your email and we'll send you a link to reset your password."}
        </p>

        {!submitted ? (
          <form className="signin-form" onSubmit={handleSubmit}>
            <div className="signin-field">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>

              <input
                type="email"
                placeholder="Email"
                aria-label="Email"
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

            {error && (
              <p className="signin-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="signin-submit"
              disabled={loading}
            >
              {loading ? "SENDING..." : "SEND RESET LINK"}
            </button>
          </form>
        ) : (
          <div className="signin-form" role="status">
            <p className="signin-success">
              If an account exists for <strong>{email}</strong>, recovery
              instructions will be sent to that address.
            </p>

            <button
              type="button"
              className="signin-submit"
              onClick={onBack}
            >
              RETURN TO SIGN IN
            </button>

            <button
              type="button"
              className="signin-forgot signin-change-email"
              onClick={handleChangeEmail}
            >
              Use a different email address
            </button>
          </div>
        )}

        <p className="signin-fineprint">GameScope account recovery.</p>
      </section>
    </main>
  );
}

export default ForgotPassword;
