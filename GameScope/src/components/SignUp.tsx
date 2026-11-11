
import React, { useState } from "react";
import type { Mode } from "../type";
import { signUp } from "../api";
import "./Login.css";

interface SignUpProps {
  darkMode: boolean;
  onSignUp: (
    email: string,
    password: string,
    selectedMode: Mode
  ) => void;
  onBack: () => void;
  mode: Mode;
}

function SignUp({
  darkMode,
  onSignUp,
  onBack,
  mode,
}: SignUpProps) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedMode, setSelectedMode] = useState<Mode>(mode);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate password strength.
  const getPasswordStrength = () => {
    if (!password) return 0;

    let score = 0;

    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    return score;
  };

  const passwordStrength = getPasswordStrength();

  const strengthLabels = ["", "Weak", "Fair", "Good", "Strong"];

  // Submit registration to the Python backend.
  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (isSubmitting) return;

    const cleanUsername = username.trim();
    const cleanEmail = email.trim();

    if (cleanUsername.length < 3 || cleanUsername.length > 30) {
      setError("Username must be between 3 and 30 characters.");
      return;
    }

    if (!/^[A-Za-z0-9_]+$/.test(cleanUsername)) {
      setError(
        "Username can only contain letters, numbers, and underscores."
      );
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!acceptedTerms) {
      setError("Please accept the terms and conditions.");
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      // Create the account in MySQL through FastAPI.
      await signUp({
        username: cleanUsername,
        email: cleanEmail,
        password,
        mode: selectedMode,
      });

      // Continue into the existing GameScope app flow.
      onSignUp(cleanEmail, password, selectedMode);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create your account. Please try again."
      );
    } finally {
      setIsSubmitting(false);
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
          disabled={isSubmitting}
        >
          <span className="login-back-arrow">←</span>
          Back to Sign In
        </button>

        {/* Branding */}
        <div className="login-heading">
          <div className="login-brand-icon">G</div>

          <span className="login-eyebrow">
            GAMESCOPE ACCOUNT
          </span>

          <h1>
            Create Account<span>.</span>
          </h1>

          <p>
            Join GameScope and discover your next gaming experience.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Account type */}
          <div className="login-field-group">
            <label className="login-section-label">
              CREATE ACCOUNT AS
            </label>

            <div className="login-role-selector">
              <button
                type="button"
                className={`login-role-option ${
                  selectedMode === "player" ? "selected" : ""
                }`}
                onClick={() => setSelectedMode("player")}
                aria-pressed={selectedMode === "player"}
                disabled={isSubmitting}
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
                disabled={isSubmitting}
              >
                <span className="login-role-icon">📊</span>

                <span className="login-role-text">
                  <strong>Developer</strong>
                  <small>Analyze feedback</small>
                </span>
              </button>
            </div>
          </div>

          {/* Username */}
          <div className="login-field-group">
            <label htmlFor="signup-username">
              Username
            </label>

            <div className="login-input-wrapper">
              <span className="login-input-icon">👤</span>

              <input
                id="signup-username"
                type="text"
                placeholder="Choose a username"
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setError("");
                }}
                autoComplete="username"
                minLength={3}
                maxLength={30}
                pattern="[A-Za-z0-9_]+"
                title="Use only letters, numbers, and underscores."
                required
                disabled={isSubmitting}
              />
            </div>

            <small className="login-footer-text">
              3–30 characters. Letters, numbers, and underscores only.
            </small>
          </div>

          {/* Email */}
          <div className="login-field-group">
            <label htmlFor="signup-email">
              Email Address
            </label>

            <div className="login-input-wrapper">
              <span className="login-input-icon">✉</span>

              <input
                id="signup-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                autoComplete="email"
                required
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Password */}
          <div className="login-field-group">
            <label htmlFor="signup-password">
              Password
            </label>

            <div className="login-input-wrapper">
              <span className="login-input-icon">🔒</span>

              <input
                id="signup-password"
                type={showPassword ? "text" : "password"}
                placeholder="At least 8 characters"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
                autoComplete="new-password"
                minLength={8}
                required
                disabled={isSubmitting}
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
                disabled={isSubmitting}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {/* Password strength */}
            {password && (
              <div className="password-strength">
                <div className="password-strength-bars">
                  {[1, 2, 3, 4].map((level) => (
                    <span
                      key={level}
                      className={
                        level <= passwordStrength
                          ? `strength-level-${passwordStrength}`
                          : ""
                      }
                    />
                  ))}
                </div>

                <span className="password-strength-label">
                  Password strength:{" "}
                  <strong>
                    {strengthLabels[passwordStrength]}
                  </strong>
                </span>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div className="login-field-group">
            <label htmlFor="signup-confirm-password">
              Confirm Password
            </label>

            <div className="login-input-wrapper">
              <span className="login-input-icon">🔒</span>

              <input
                id="signup-confirm-password"
                type={
                  showConfirmPassword ? "text" : "password"
                }
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setError("");
                }}
                autoComplete="new-password"
                required
                disabled={isSubmitting}
              />

              <button
                type="button"
                className="login-password-toggle"
                onClick={() =>
                  setShowConfirmPassword((current) => !current)
                }
                aria-label={
                  showConfirmPassword
                    ? "Hide password"
                    : "Show password"
                }
                disabled={isSubmitting}
              >
                {showConfirmPassword ? "Hide" : "Show"}
              </button>
            </div>

            {/* Password matching feedback */}
            {confirmPassword && (
              <span
                className={`password-match ${
                  password === confirmPassword
                    ? "matched"
                    : "not-matched"
                }`}
              >
                {password === confirmPassword
                  ? "✓ Passwords match"
                  : "✕ Passwords do not match"}
              </span>
            )}
          </div>

          {/* Terms and conditions */}
          <label className="login-terms">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(event) => {
                setAcceptedTerms(event.target.checked);
                setError("");
              }}
              disabled={isSubmitting}
            />

            <span>
              I agree to the GameScope terms and conditions.
            </span>
          </label>

          {/* Validation and API errors */}
          {error && (
            <p
              className="login-error-message"
              role="alert"
            >
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="login-submit-button"
            disabled={isSubmitting}
          >
            <span>
              {isSubmitting ? "Creating Account..." : "Create Account"}
            </span>

            <span className="login-submit-arrow">
              {isSubmitting ? "..." : "→"}
            </span>
          </button>

          <p className="login-footer-text">
            Your gaming journey starts here.
          </p>
        </form>
      </section>
    </main>
  );
}

export default SignUp;
