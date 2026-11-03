
import React, { useState } from "react";
import type { Mode } from "../type";
import "./Login.css";

interface LoginProps {
  darkMode: boolean;
  onLogin: (email: string, password: string, selectedMode: Mode) => void;
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
  const [selectedMode, setSelectedMode] = useState<Mode>(mode);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    onLogin(email.trim(), password, selectedMode);
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
          Back to {mode === "player" ? "Player Home" : "Dashboard"}
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
                  selectedMode === "player" ? "selected" : ""
                }`}
                onClick={() => setSelectedMode("player")}
                aria-pressed={selectedMode === "player"}
              >
                <span className="login-role-icon">🎮</span>

                <span className="login-role-text">
                  <strong>Player</strong>
                  <small>Discover games</small>
                </span>
              </button>

              <button
                type="button"
                className={`login-role-option ${
                  selectedMode === "developer" ? "selected" : ""
                }`}
                onClick={() => setSelectedMode("developer")}
                aria-pressed={selectedMode === "developer"}
              >
                <span className="login-role-icon">📊</span>

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
              <span className="login-input-icon">✉</span>

              <input
                id="login-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="login-field-group">
            <label htmlFor="login-password">
              Password
            </label>

            <div className="login-input-wrapper">
              <span className="login-input-icon">🔒</span>

              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />

              <button
                type="button"
                className="login-password-toggle"
                onClick={() =>
                  setShowPassword((current) => !current)
                }
                aria-label={
                  showPassword ? "Hide password" : "Show password"
                }
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
              />
              <span>Remember me</span>
            </label>

            <button
              type="button"
              className="login-password-toggle"
              onClick={onForgotPasswordClick}
            >
              Forgot Password?
            </button>
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="login-submit-button"
          >
            <span>Sign In</span>
            <span className="login-submit-arrow">→</span>
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
