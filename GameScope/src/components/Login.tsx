
import React, { useState } from "react";
import type { Mode } from "../type";
import { login } from "../api";
import logo from "../img/gamescope-logo-light.png";
import PongLogo from "./PongLogo";
import "./SignIn.css";

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
  onForgotPasswordClick: (selectedMode: Mode) => void;
}

function Login({
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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");

  const isDeveloper = selectedMode === "developer";

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

      // Pending developers can sign in as players.
      // App.tsx determines the permissions granted to the account.
      if (
        selectedMode === "developer" &&
        !response.user.roles.includes("developer")
      ) {
        setNotice(
          "Your organization membership is still awaiting verification and admin approval. You can sign in as a player while you wait."
        );

        await onLogin(
          cleanEmail,
          password,
          "player"
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
    // Green for players, purple for developers, from the role picked below
    <main
      className={`signin-page ${
        isDeveloper ? "signin-dev" : "signin-player"
      }`}
    >
      <section className="signin-card" aria-labelledby="signin-title">
        <button
          type="button"
          className="signin-back"
          onClick={onBack}
          disabled={isSubmitting}
        >
          ← Back
        </button>

        <PongLogo src={logo} />

        <h1 id="signin-title">SIGN IN TO GAMESCOPE</h1>

        <p className="signin-subtitle">
          {isDeveloper
            ? "Sign in to track issue statuses and manage your games."
            : "Sign in to save games, link your Steam library, and keep track of what you've analyzed."}
        </p>

        <div
          className="signin-roles"
          role="group"
          aria-label="Sign in as"
        >
          <button
            type="button"
            className={!isDeveloper ? "active" : ""}
            onClick={() => setSelectedMode("player")}
            aria-pressed={!isDeveloper}
            disabled={isSubmitting}
          >
            PLAYER
          </button>

          <button
            type="button"
            className={isDeveloper ? "active" : ""}
            onClick={() => setSelectedMode("developer")}
            aria-pressed={isDeveloper}
            disabled={isSubmitting}
          >
            DEVELOPER
          </button>
        </div>

        <form className="signin-form" onSubmit={handleSubmit}>
          <div className="signin-field">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>

            <input
              type="email"
              placeholder="Email"
              aria-label="Email"
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

          <div className="signin-field">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>

            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              aria-label="Password"
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
              className="signin-show"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              disabled={isSubmitting}
            >
              {showPassword ? "HIDE" : "SHOW"}
            </button>
          </div>

          <button
            type="button"
            className="signin-forgot"
            onClick={() => onForgotPasswordClick(selectedMode)}
            disabled={isSubmitting}
          >
            Forgot password?
          </button>

          {errorMessage && (
            <p className="signin-error" role="alert">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            className="signin-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "SIGNING IN..." : "SIGN IN"}
          </button>
        </form>

        <div className="signin-divider">
          <span>or</span>
        </div>

        {/* Hooked up to Steam OpenID on the backend later */}
        <button
          type="button"
          className="signin-steam"
          onClick={() => setNotice("Sign in with Steam is coming soon.")}
          disabled={isSubmitting}
        >
          Sign in with Steam
        </button>

        {notice && (
          <p className="signin-notice" role="status">
            {notice}
          </p>
        )}

        <p className="signin-signup">
          Don&apos;t have an account?{" "}
          <button
            type="button"
            onClick={onSignUpClick}
            disabled={isSubmitting}
          >
            Create Account
          </button>
        </p>

        <p className="signin-fineprint">
          Steam sign-in only reads your public profile. No passwords are
          shared.
        </p>
      </section>
    </main>
  );
}

export default Login;
