
import React, { useState } from "react";
import type { Mode } from "../type";
import { login } from "../api";
import "./Login.css";

interface LoginProps {
  darkMode: boolean;
  onLogin: (
    email: string,
    password: string,
    selectedMode: Mode
  ) => void | Promise<void>;
  onBack: () => void;
  mode: Mode;
  onSignUpClick: () => void;
  onForgotPasswordClick: () => void;
}

function Login({
  darkMode,
  onLogin,
  onBack,
  onSignUpClick,
  onForgotPasswordClick,
  mode,
}: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedMode, setSelectedMode] =
    useState<Mode>(mode);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (isSubmitting) return;

    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      setErrorMessage(
        "Please enter your email and password."
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await login({
        email: cleanEmail,
        password,
      });

      // Verify that the account has the selected role.
      if (!response.user.roles.includes(selectedMode)) {
        setErrorMessage(
          `This account does not have the ${selectedMode} role.`
        );
        return;
      }

      // Wait for App.tsx to retrieve and establish
      // the authenticated account and its permissions.
      await onLogin(
        cleanEmail,
        password,
        selectedMode
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to sign in. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main
      className={`login-page ${
        darkMode
          ? "login-dark-mode"
          : "login-light-mode"
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
          disabled={isSubmitting}
        >
          <span className="login-back-arrow">←</span>
          Back to{" "}
          {mode === "player"
            ? "Player Home"
            : "Dashboard"}
        </button>

        {/* Branding */}
        <div className="login-heading">
          <div className="login-brand-icon">G</div>

          <span className="login-eyebrow">
            GAMESCOPE ACCOUNT
          </span>

          <h1>
            Welcome Back<span>.</span>
          </h1>

          <p>
            Sign in to continue your gaming journey.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Account type */}
          <div className="login-field-group">
            <label className="login-section-label">
              CONTINUE AS
            </label>

            <div className="login-role-selector">
              <button
                type="button"
                className={`login-role-option ${
                  selectedMode === "player"
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  setSelectedMode("player")
                }
                aria-pressed={
                  selectedMode === "player"
                }
                disabled={isSubmitting}
              >
                <span className="login-role-icon">
                  🎮
                </span>

                <span className="login-role-text">
                  <strong>Player</strong>
                  <small>Discover games</small>
                </span>
              </button>

              <button
                type="button"
                className={`login-role-option ${
                  selectedMode === "developer"
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  setSelectedMode("developer")
                }
                aria-pressed={
                  selectedMode === "developer"
                }
                disabled={isSubmitting}
              >
                <span className="login-role-icon">
                  📊
                </span>

                <span className="login-role-text">
                  <strong>Developer</strong>
                  <small>Analyze feedback</small>
                </span>
              </button>
            </div>
          </div>

          {/* Email */}
          <div className="login-field-group">
            <label htmlFor="login-email">
              Email Address
            </label>

            <div className="login-input-wrapper">
              <span className="login-input-icon">
                ✉
              </span>

              <input
                id="login-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setErrorMessage("");
                }}
                autoComplete="email"
                required
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Password */}
          <div className="login-field-group">
            <label htmlFor="login-password">
              Password
            </label>

            <div className="login-input-wrapper">
              <span className="login-input-icon">
                🔒
              </span>

              <input
                id="login-password"
                type={
                  showPassword ? "text" : "password"
                }
                placeholder="Enter your password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setErrorMessage("");
                }}
                autoComplete="current-password"
                required
                disabled={isSubmitting}
              />

              <button
                type="button"
                className="login-password-toggle"
                onClick={() =>
                  setShowPassword(
                    (current) => !current
                  )
                }
                aria-label={
                  showPassword
                    ? "Hide password"
                    : "Show password"
                }
                disabled={isSubmitting}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {/* Remember me and Forgot Password */}
          <div className="login-options-row">
            <label className="login-remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) =>
                  setRememberMe(event.target.checked)
                }
                disabled={isSubmitting}
              />

              <span>Remember me</span>
            </label>

            <button
              type="button"
              className="login-password-toggle"
              onClick={onForgotPasswordClick}
              disabled={isSubmitting}
            >
              Forgot Password?
            </button>
          </div>

          {/* Login error */}
          {errorMessage && (
            <div
              className="login-error-message"
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="login-submit-button"
            disabled={isSubmitting}
          >
            <span>
              {isSubmitting
                ? "Signing In..."
                : "Sign In"}
            </span>

            <span className="login-submit-arrow">
              {isSubmitting ? "..." : "→"}
            </span>
          </button>

          {/* Footer */}
          <p className="login-footer-text">
            Your gaming insights start here.
          </p>

          <p className="login-footer-text">
            Don't have an account?{" "}
            <button
              type="button"
              onClick={onSignUpClick}
              disabled={isSubmitting}
            >
              Sign Up
            </button>
          </p>
        </form>
      </section>
    </main>
  );
}

export default Login;
