
-- ============================================================
-- DATABASE
-- ============================================================

CREATE DATABASE IF NOT EXISTS game_reviews
    CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

USE game_reviews;

-- ============================================================
-- USERS
-- Passwords must be stored as securely generated password hashes,
-- never as plaintext.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    user_id INT UNSIGNED AUTO_INCREMENT NOT NULL,
    username VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id),
    UNIQUE KEY uq_users_username (username),
    UNIQUE KEY uq_users_email (email)
) ENGINE = InnoDB;

-- ============================================================
-- PASSWORD RESET TOKENS
-- ============================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    reset_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_password_reset_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    INDEX idx_reset_user_id (user_id),
    INDEX idx_reset_expires_at (expires_at)
) ENGINE = InnoDB;

-- ============================================================
-- USER SESSIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS user_sessions (
    session_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP NULL DEFAULT NULL,
    revoked_at TIMESTAMP NULL DEFAULT NULL,

    CONSTRAINT fk_user_sessions_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    INDEX idx_sessions_user_id (user_id),
    INDEX idx_sessions_expires_at (expires_at)
) ENGINE = InnoDB;

-- ============================================================
-- USER ROLES
-- A user can have both player and developer roles.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_roles (
    user_id INT UNSIGNED NOT NULL,
    role ENUM('player', 'developer') NOT NULL,

    PRIMARY KEY (user_id, role),

    CONSTRAINT fk_user_roles_user_id
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE = InnoDB;

-- ============================================================
-- USER PRIORITIES
-- Importance scores: 1 (not important) to 5 (must-have).
-- ============================================================

CREATE TABLE IF NOT EXISTS user_priorities (
    user_id INT UNSIGNED NOT NULL,

    category ENUM(
        'performance_stability',
        'story_immersion',
        'multiplayer',
        'price_value'
    ) NOT NULL,

    importance TINYINT UNSIGNED NOT NULL,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, category),

    CONSTRAINT chk_user_priorities_importance
        CHECK (importance BETWEEN 1 AND 5),

    CONSTRAINT fk_user_priorities_user_id
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE = InnoDB;

-- ============================================================
-- DEVELOPER PROFILES
-- Developer status is stored in user_roles.
-- Organization affiliation is tracked separately.
-- ============================================================

CREATE TABLE IF NOT EXISTS developer_profiles (
    user_id INT UNSIGNED NOT NULL,

    organization_type ENUM(
        'indie',
        'company',
        'organization',
        'other'
    ) NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id),

    CONSTRAINT fk_developer_profiles_user_id
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE = InnoDB;

-- ============================================================
-- GAMES
-- ============================================================

CREATE TABLE IF NOT EXISTS games (
    game_id INT UNSIGNED AUTO_INCREMENT NOT NULL,
    app_id INT UNSIGNED NOT NULL,
    game_name VARCHAR(255) NOT NULL,
    game_release_date DATE,
    game_description TEXT,
    game_developer VARCHAR(255),
    game_publisher VARCHAR(255),
    game_price DECIMAL(10,2),
    game_early_access_release_date DATE NULL,

    PRIMARY KEY (game_id),
    UNIQUE KEY uq_games_app_id (app_id),
    INDEX idx_game_name (game_name)
) ENGINE = InnoDB;

-- ============================================================
-- STEAM ACCOUNTS
-- Never store Steam passwords.
-- ============================================================

CREATE TABLE IF NOT EXISTS steam_accounts (
    user_id INT UNSIGNED NOT NULL,
    steam_id VARCHAR(32) NOT NULL,
    steam_display_name VARCHAR(255) NULL,
    profile_url VARCHAR(512) NULL,
    linked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id),
    UNIQUE KEY uq_steam_accounts_steam_id (steam_id),

    CONSTRAINT fk_steam_accounts_user_id
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE = InnoDB;

-- ============================================================
-- PLAYER GAMES
-- ============================================================

CREATE TABLE IF NOT EXISTS player_games (
    user_id INT UNSIGNED NOT NULL,
    game_id INT UNSIGNED NOT NULL,
    source ENUM('steam', 'manual') NOT NULL,
    playtime_forever_minutes BIGINT UNSIGNED NULL,
    last_synced_at TIMESTAMP NULL,

    PRIMARY KEY (user_id, game_id),

    CONSTRAINT fk_player_games_user_id
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_player_games_game_id
        FOREIGN KEY (game_id)
        REFERENCES games(game_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    INDEX idx_player_games_game_id (game_id)
) ENGINE = InnoDB;

-- ============================================================
-- ORGANIZATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS organizations (
    organization_id INT UNSIGNED AUTO_INCREMENT NOT NULL,
    organization_name VARCHAR(255) NOT NULL,
    created_by_user_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (organization_id),
    INDEX idx_organizations_name (organization_name),

    CONSTRAINT fk_organizations_created_by
        FOREIGN KEY (created_by_user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE = InnoDB;

-- ============================================================
-- ORGANIZATION MEMBERSHIPS
-- ============================================================

CREATE TABLE IF NOT EXISTS organization_memberships (
    organization_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    organization_email VARCHAR(255) NULL,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (organization_id, user_id),

    CONSTRAINT fk_org_memberships_organization_id
        FOREIGN KEY (organization_id)
        REFERENCES organizations(organization_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_org_memberships_user_id
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE = InnoDB;

-- ============================================================
-- ORGANIZATION GAMES
-- ============================================================

CREATE TABLE IF NOT EXISTS organization_games (
    organization_id INT UNSIGNED NOT NULL,
    game_id INT UNSIGNED NOT NULL,
    relationship ENUM('developed', 'published', 'owned') NOT NULL,
    added_by_user_id INT UNSIGNED NULL,
    added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (organization_id, game_id, relationship),

    CONSTRAINT fk_org_games_organization_id
        FOREIGN KEY (organization_id)
        REFERENCES organizations(organization_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_org_games_game_id
        FOREIGN KEY (game_id)
        REFERENCES games(game_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_org_games_added_by
        FOREIGN KEY (added_by_user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    INDEX idx_org_games_game_id (game_id)
) ENGINE = InnoDB;

-- ============================================================
-- REVIEWS
-- ============================================================

CREATE TABLE IF NOT EXISTS reviews (
    game_id INT UNSIGNED NOT NULL,
    review_id VARCHAR(255) NOT NULL,
    review_text TEXT,
    recommended BOOLEAN NOT NULL,
    playtime_hours DECIMAL(10,2) NOT NULL,
    playtime_at_review_hours DECIMAL(10,2) NOT NULL,
    helpful_votes INT NOT NULL DEFAULT 0,
    language VARCHAR(50),
    written_during_early_access BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME,
    updated_at DATETIME,

    PRIMARY KEY (review_id),

    FOREIGN KEY (game_id)
        REFERENCES games(game_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    INDEX idx_revs_game_id (game_id),
    INDEX idx_play_hours (playtime_hours),
    INDEX idx_play_hours_at_review (playtime_at_review_hours),
    INDEX idx_helpful_votes (helpful_votes),
    INDEX idx_language (language),
    INDEX idx_recommended (recommended),
    INDEX idx_revs_game_created (game_id, created_at)
) ENGINE = InnoDB;

-- ============================================================
-- GAME UPDATES
-- Developer announcements from Steam, collected by steam_updates.py
-- ============================================================

CREATE TABLE IF NOT EXISTS game_updates (
    update_id VARCHAR(32) NOT NULL,
    game_id INT UNSIGNED NOT NULL,
    title VARCHAR(255) NOT NULL,
    url VARCHAR(512),
    posted_at DATETIME NOT NULL,
    is_patch_notes BOOLEAN NOT NULL DEFAULT FALSE,

    PRIMARY KEY (update_id),

    FOREIGN KEY (game_id)
        REFERENCES games(game_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    INDEX idx_updates_game_posted (game_id, posted_at)
) ENGINE = InnoDB;

-- ============================================================
-- IMPORTING REVIEWS
-- ============================================================

CREATE TABLE IF NOT EXISTS reviews_import (
    import_id INT UNSIGNED AUTO_INCREMENT NOT NULL,
    game_id INT UNSIGNED NOT NULL,
    source_filename VARCHAR(255) NOT NULL,
    import_started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    import_completed_at TIMESTAMP NULL DEFAULT NULL,
    reviews_in_file INT UNSIGNED NOT NULL DEFAULT 0,
    reviews_imported INT UNSIGNED NOT NULL DEFAULT 0,
    reviews_skipped INT UNSIGNED NOT NULL DEFAULT 0,

    status ENUM(
        'Started',
        'Completed',
        'Failed'
    ) NOT NULL DEFAULT 'Started',

    error_message TEXT NULL DEFAULT NULL,

    PRIMARY KEY (import_id),

    CONSTRAINT fk_imports_game_id
        FOREIGN KEY (game_id)
        REFERENCES games(game_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    INDEX idx_imports_game_id (game_id),
    INDEX idx_imports_date (import_started_at),
    INDEX idx_imports_status (status)
) ENGINE = InnoDB;

-- ============================================================
-- REVIEW FILTER RUNS
-- How many reviews the junk filter removed and why.
-- ============================================================

CREATE TABLE IF NOT EXISTS review_filter_runs (
    run_id INT UNSIGNED AUTO_INCREMENT NOT NULL,
    game_id INT UNSIGNED NOT NULL,
    reviews_collected INT UNSIGNED NOT NULL DEFAULT 0,
    reviews_kept INT UNSIGNED NOT NULL DEFAULT 0,
    removed_reasons TEXT,
    run_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (run_id),

    FOREIGN KEY (game_id)
        REFERENCES games(game_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    INDEX idx_filter_runs_game (game_id, run_at)
) ENGINE = InnoDB;

-- ============================================================
-- ISSUE STATUSES
-- The status a developer sets for each issue on the Issues page.
-- ============================================================

CREATE TABLE IF NOT EXISTS issue_statuses (
    game_id INT UNSIGNED NOT NULL,
    topic VARCHAR(50) NOT NULL,

    status ENUM(
        'Detected',
        'Investigating',
        'In Progress',
        'Resolved'
    ) NOT NULL DEFAULT 'Detected',

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (game_id, topic),

    FOREIGN KEY (game_id)
        REFERENCES games(game_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE = InnoDB;

-- ============================================================
-- GAME SEARCHES
-- How many times each game was searched on the site.
-- Used by trending cards.
-- ============================================================

CREATE TABLE IF NOT EXISTS game_searches (
    app_id INT UNSIGNED NOT NULL,
    game_name VARCHAR(255),
    searches INT UNSIGNED NOT NULL DEFAULT 0,
    last_searched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (app_id),
    INDEX idx_searches_count (searches)
) ENGINE = InnoDB;

-- ============================================================
-- MIGRATION FOR EXISTING DATABASES
-- Run applicable migrations separately when upgrading an existing DB.
-- Skip on a fresh installation.
-- ============================================================

-- Existing role migration, if required:
-- INSERT INTO user_roles (user_id, role)
-- SELECT user_id, account_type FROM users;

-- Existing developer_profiles.organization_name values should be reviewed
-- and migrated into organizations/organization_memberships before removing
-- that column. Do not treat unreviewed names as verified affiliations.

-- ALTER TABLE users
--     ADD UNIQUE KEY uq_users_username (username);

-- ALTER TABLE games
--     ADD COLUMN game_early_access_release_date DATE NULL AFTER game_price;

-- ALTER TABLE reviews
--     ADD COLUMN written_during_early_access BOOLEAN NOT NULL DEFAULT FALSE
--     AFTER language;

-- ============================================================
-- DATABASE INSPECTION
-- ============================================================

SHOW TABLES;

DESCRIBE games;
DESCRIBE reviews;
DESCRIBE game_updates;
DESCRIBE reviews_import;
DESCRIBE review_filter_runs;
DESCRIBE issue_statuses;
DESCRIBE game_searches;
DESCRIBE users;
DESCRIBE user_roles;
DESCRIBE user_sessions;
DESCRIBE password_reset_tokens;
DESCRIBE user_priorities;
DESCRIBE developer_profiles;
DESCRIBE steam_accounts;
DESCRIBE player_games;
DESCRIBE organizations;
DESCRIBE organization_memberships;
DESCRIBE organization_games;

-- ============================================================
-- DATA INSPECTION
-- ============================================================

SELECT * FROM games;
SELECT * FROM reviews;
SELECT * FROM game_updates;
SELECT * FROM reviews_import;
SELECT * FROM review_filter_runs;
SELECT * FROM issue_statuses;
SELECT * FROM game_searches;
SELECT * FROM users;
SELECT * FROM user_roles;
SELECT * FROM user_sessions;
SELECT * FROM password_reset_tokens;
SELECT * FROM user_priorities;
SELECT * FROM developer_profiles;
SELECT * FROM steam_accounts;
SELECT * FROM player_games;
SELECT * FROM organizations;
SELECT * FROM organization_memberships;
SELECT * FROM organization_games;
