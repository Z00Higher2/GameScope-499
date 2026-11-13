
"""
GameScope authentication helpers.

Handles:
- Account registration
- Password hashing and verification
- Session creation
- Session validation
- Active session listing
- Individual and global session revocation
- Password reset token creation
- Password reset token validation
- Secure password resets
- Steam account linking and unlinking
"""

import re
import logging
import secrets
import hashlib

from pwdlib import PasswordHash
from mysql.connector import IntegrityError, Error as MySQLError

import csv_to_mysql_ as importer


logger = logging.getLogger(__name__)

# Recommended password hashing algorithm: Argon2id.
password_hasher = PasswordHash.recommended()

# Sessions expire after seven days.
SESSION_DURATION_DAYS = 7

# Password reset links expire after 15 minutes.
PASSWORD_RESET_DURATION_MINUTES = 15


# ============================================================
# TOKEN HASHING
# ============================================================

def hash_session_token(token):
    """Hash a session token using SHA-256 before database storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_password_reset_token(token):
    """Hash a password reset token before database storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# ============================================================
# REGISTRATION
# ============================================================

def validate_registration(username, email, password, selected_mode):
    """Validate registration fields before accessing the database."""

    username = username.strip()
    email = email.strip().lower()

    if len(username) < 3 or len(username) > 30:
        raise ValueError("Username must be between 3 and 30 characters.")

    if not re.fullmatch(r"[A-Za-z0-9_]+", username):
        raise ValueError(
            "Username can only contain letters, numbers, and underscores."
        )

    if len(email) > 255 or not re.fullmatch(
        r"[^@\s]+@[^@\s]+\.[^@\s]+", email
    ):
        raise ValueError("Please enter a valid email address.")

    if len(password) < 8:
        raise ValueError("Password must contain at least 8 characters.")

    if selected_mode not in ("player", "developer"):
        raise ValueError("Invalid account type.")

    return username, email


def register_user(username, email, password, selected_mode):
    """
    Create a user and assign their roles in one transaction.

    Every account receives the player role.
    Developer accounts additionally receive the developer role.
    """

    username, email = validate_registration(
        username,
        email,
        password,
        selected_mode,
    )

    hashed_password = password_hasher.hash(password)

    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor()

        cursor.execute(
            """
            INSERT INTO users (username, email, password_hash)
            VALUES (%s, %s, %s)
            """,
            (username, email, hashed_password),
        )

        user_id = cursor.lastrowid

        roles = ["player"]

        if selected_mode == "developer":
            roles.append("developer")

        for role in roles:
            cursor.execute(
                """
                INSERT INTO user_roles (user_id, role)
                VALUES (%s, %s)
                """,
                (user_id, role),
            )

        connection.commit()

        return {
            "user_id": user_id,
            "username": username,
            "email": email,
            "roles": roles,
        }

    except IntegrityError as error:
        if connection:
            connection.rollback()

        logger.info(
            "Registration rejected by a database constraint: %s",
            type(error).__name__,
        )

        raise ValueError(
            "That username or email is already registered."
        ) from error

    except MySQLError:
        if connection:
            connection.rollback()

        logger.exception("Database error during registration.")
        raise

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()


# ============================================================
# LOGIN
# ============================================================

def login_user(email, password):
    """
    Authenticate a user using their email and password.

    Returns user information and assigned roles
    when the credentials are valid.
    """

    email = email.strip().lower()

    if not email or not password:
        raise ValueError("Invalid email or password.")

    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT user_id, username, email, password_hash
            FROM users
            WHERE email = %s
            LIMIT 1
            """,
            (email,),
        )

        user = cursor.fetchone()

        if not user:
            raise ValueError("Invalid email or password.")

        try:
            password_valid = password_hasher.verify(
                password,
                user["password_hash"],
            )
        except Exception:
            password_valid = False

        if not password_valid:
            raise ValueError("Invalid email or password.")

        cursor.execute(
            """
            SELECT role
            FROM user_roles
            WHERE user_id = %s
            """,
            (user["user_id"],),
        )

        roles = [row["role"] for row in cursor.fetchall()]

        return {
            "user_id": user["user_id"],
            "username": user["username"],
            "email": user["email"],
            "roles": roles,
        }

    except MySQLError:
        logger.exception("Database error during login.")
        raise

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()


# ============================================================
# SESSION MANAGEMENT
# ============================================================

def create_session(user_id):
    """
    Create a secure session for an authenticated user.

    The raw token is returned once to the application.
    Only its SHA-256 hash is stored in the database.
    """

    token = secrets.token_urlsafe(32)
    token_hash = hash_session_token(token)

    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            INSERT INTO user_sessions (
                user_id,
                token_hash,
                expires_at
            )
            VALUES (
                %s,
                %s,
                DATE_ADD(UTC_TIMESTAMP(), INTERVAL %s DAY)
            )
            """,
            (user_id, token_hash, SESSION_DURATION_DAYS),
        )

        cursor.execute(
            """
            SELECT expires_at
            FROM user_sessions
            WHERE session_id = %s
            """,
            (cursor.lastrowid,),
        )

        session = cursor.fetchone()

        connection.commit()

        return {
            "token": token,
            "expires_at": session["expires_at"].isoformat(),
        }

    except MySQLError:
        if connection:
            connection.rollback()

        logger.exception("Database error during session creation.")
        raise

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()


def validate_session(token):
    """
    Validate a session token.

    Rejects missing, expired, and revoked sessions.
    Returns the authenticated user's information and roles.
    """

    if not token:
        return None

    token_hash = hash_session_token(token)

    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                s.session_id,
                s.user_id,
                u.username,
                u.email
            FROM user_sessions AS s
            INNER JOIN users AS u
                ON s.user_id = u.user_id
            WHERE s.token_hash = %s
                AND s.revoked_at IS NULL
                AND s.expires_at > UTC_TIMESTAMP()
            LIMIT 1
            """,
            (token_hash,),
        )

        session = cursor.fetchone()

        if not session:
            return None

        cursor.execute(
            """
            UPDATE user_sessions
            SET last_seen_at = UTC_TIMESTAMP()
            WHERE session_id = %s
            """,
            (session["session_id"],),
        )

        cursor.execute(
            """
            SELECT role
            FROM user_roles
            WHERE user_id = %s
            """,
            (session["user_id"],),
        )

        roles = [row["role"] for row in cursor.fetchall()]

        connection.commit()

        return {
            "user_id": session["user_id"],
            "username": session["username"],
            "email": session["email"],
            "roles": roles,
        }

    except MySQLError:
        if connection:
            connection.rollback()

        logger.exception("Database error during session validation.")
        raise

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()


def revoke_session(token):
    """Revoke a session so its token can no longer be used."""

    if not token:
        return False

    token_hash = hash_session_token(token)

    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor()

        cursor.execute(
            """
            UPDATE user_sessions
            SET revoked_at = UTC_TIMESTAMP()
            WHERE token_hash = %s
                AND revoked_at IS NULL
            """,
            (token_hash,),
        )

        revoked = cursor.rowcount > 0

        connection.commit()

        return revoked

    except MySQLError:
        if connection:
            connection.rollback()

        logger.exception("Database error during session revocation.")
        raise

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()


def get_active_sessions(user_id, current_token=None):
    """
    Retrieve all active sessions belonging to a user.

    Never returns raw session tokens or token hashes.

    Identifies which session belongs to the current browser
    when the current session token is provided.
    """

    if not user_id:
        return []

    current_token_hash = (
        hash_session_token(current_token)
        if current_token
        else None
    )

    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                session_id,
                token_hash,
                expires_at,
                last_seen_at
            FROM user_sessions
            WHERE user_id = %s
                AND revoked_at IS NULL
                AND expires_at > UTC_TIMESTAMP()
            ORDER BY last_seen_at DESC
            """,
            (user_id,),
        )

        sessions = cursor.fetchall()

        return [
            {
                "session_id": session["session_id"],
                "expires_at": session["expires_at"].isoformat()
                if session["expires_at"]
                else None,
                "last_seen_at": session["last_seen_at"].isoformat()
                if session["last_seen_at"]
                else None,
                "is_current": (
                    session["token_hash"] == current_token_hash
                    if current_token_hash
                    else False
                ),
            }
            for session in sessions
        ]

    except MySQLError:
        logger.exception("Database error while retrieving active sessions.")
        raise

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()


def revoke_all_sessions(user_id):
    """
    Revoke every session belonging to a user.

    This includes the current session and sessions
    created on other browsers or devices.

    Returns the number of sessions revoked.
    """

    if not user_id:
        return 0

    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor()

        cursor.execute(
            """
            UPDATE user_sessions
            SET revoked_at = UTC_TIMESTAMP()
            WHERE user_id = %s
                AND revoked_at IS NULL
            """,
            (user_id,),
        )

        revoked_count = cursor.rowcount

        connection.commit()

        return revoked_count

    except MySQLError:
        if connection:
            connection.rollback()

        logger.exception("Database error while revoking all sessions.")
        raise

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()


# ============================================================
# PASSWORD RESET
# ============================================================

def create_password_reset_token(email):
    """
    Generate a secure, single-use password reset token.

    Only the SHA-256 hash is stored in MySQL.

    Returns:
        A dictionary containing the raw token and expiration time.
        None if the email address does not exist.
    """

    email = email.strip().lower()

    if not email:
        return None

    token = secrets.token_urlsafe(32)
    token_hash = hash_password_reset_token(token)

    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT user_id
            FROM users
            WHERE email = %s
            LIMIT 1
            """,
            (email,),
        )

        user = cursor.fetchone()

        if not user:
            return None

        user_id = user["user_id"]

        cursor.execute(
            """
            UPDATE password_reset_tokens
            SET used_at = UTC_TIMESTAMP()
            WHERE user_id = %s
                AND used_at IS NULL
            """,
            (user_id,),
        )

        cursor.execute(
            """
            INSERT INTO password_reset_tokens (
                user_id,
                token_hash,
                expires_at
            )
            VALUES (
                %s,
                %s,
                DATE_ADD(
                    UTC_TIMESTAMP(),
                    INTERVAL %s MINUTE
                )
            )
            """,
            (
                user_id,
                token_hash,
                PASSWORD_RESET_DURATION_MINUTES,
            ),
        )

        reset_id = cursor.lastrowid

        cursor.execute(
            """
            SELECT expires_at
            FROM password_reset_tokens
            WHERE reset_id = %s
            """,
            (reset_id,),
        )

        reset_record = cursor.fetchone()

        connection.commit()

        return {
            "token": token,
            "expires_at": reset_record["expires_at"].isoformat(),
        }

    except MySQLError:
        if connection:
            connection.rollback()

        logger.exception(
            "Database error during password reset token creation."
        )
        raise

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()


def validate_password_reset_token(token):
    """
    Check whether a password reset token is valid.

    A token is valid only if:
    - It exists.
    - It has not expired.
    - It has not already been used.
    """

    if not token:
        return False

    token_hash = hash_password_reset_token(token)

    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT reset_id
            FROM password_reset_tokens
            WHERE token_hash = %s
                AND used_at IS NULL
                AND expires_at > UTC_TIMESTAMP()
            LIMIT 1
            """,
            (token_hash,),
        )

        return cursor.fetchone() is not None

    except MySQLError:
        logger.exception(
            "Database error during password reset token validation."
        )
        raise

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()


def reset_user_password(token, new_password):
    """
    Reset a user's password using a valid reset token.

    The operation:
    - Validates the new password.
    - Locks the reset-token record.
    - Updates the password using Argon2id.
    - Marks the reset token as used.
    - Revokes all existing sessions.
    """

    if not token:
        raise ValueError("Invalid or expired password reset link.")

    if not isinstance(new_password, str) or len(new_password) < 8:
        raise ValueError("Password must contain at least 8 characters.")

    if len(new_password) > 128:
        raise ValueError("Password cannot exceed 128 characters.")

    token_hash = hash_password_reset_token(token)
    hashed_password = password_hasher.hash(new_password)

    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT reset_id, user_id
            FROM password_reset_tokens
            WHERE token_hash = %s
                AND used_at IS NULL
                AND expires_at > UTC_TIMESTAMP()
            LIMIT 1
            FOR UPDATE
            """,
            (token_hash,),
        )

        reset_record = cursor.fetchone()

        if not reset_record:
            connection.rollback()
            raise ValueError(
                "Invalid or expired password reset link."
            )

        user_id = reset_record["user_id"]
        reset_id = reset_record["reset_id"]

        cursor.execute(
            """
            UPDATE users
            SET password_hash = %s
            WHERE user_id = %s
            """,
            (hashed_password, user_id),
        )

        if cursor.rowcount != 1:
            connection.rollback()
            raise ValueError("Unable to reset the account password.")

        cursor.execute(
            """
            UPDATE password_reset_tokens
            SET used_at = UTC_TIMESTAMP()
            WHERE reset_id = %s
                AND used_at IS NULL
            """,
            (reset_id,),
        )

        cursor.execute(
            """
            UPDATE user_sessions
            SET revoked_at = UTC_TIMESTAMP()
            WHERE user_id = %s
                AND revoked_at IS NULL
            """,
            (user_id,),
        )

        connection.commit()

        return True

    except ValueError:
        if connection:
            connection.rollback()
        raise

    except MySQLError:
        if connection:
            connection.rollback()

        logger.exception("Database error during password reset.")
        raise

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()


# ============================================================
# STEAM ACCOUNT LINKING STATE
# ============================================================

STEAM_LINK_STATE_DURATION_MINUTES = 10


def create_steam_link_state(user_id, session_token):
    """
    Create a short-lived Steam linking state.

    Only hashes of the state and GameScope session token
    are stored in MySQL.
    """

    if not user_id or not session_token:
        raise ValueError("A valid user and session are required.")

    state = secrets.token_urlsafe(32)
    state_hash = hashlib.sha256(state.encode("utf-8")).hexdigest()
    session_token_hash = hash_session_token(session_token)

    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor()

        cursor.execute(
            """
            INSERT INTO steam_link_states (
                user_id,
                state_hash,
                session_token_hash,
                expires_at
            )
            VALUES (
                %s,
                %s,
                %s,
                DATE_ADD(
                    UTC_TIMESTAMP(),
                    INTERVAL %s MINUTE
                )
            )
            """,
            (
                user_id,
                state_hash,
                session_token_hash,
                STEAM_LINK_STATE_DURATION_MINUTES,
            ),
        )

        connection.commit()

        return state

    except MySQLError:
        if connection:
            connection.rollback()

        logger.exception("Database error creating Steam link state.")
        raise

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()


def consume_steam_link_state(state, user_id, session_token):
    """
    Validate and permanently consume a Steam linking state.

    The state must belong to the same user and GameScope
    session, must not be expired, and must not have been used.
    """

    if not state or not user_id or not session_token:
        return False

    state_hash = hashlib.sha256(state.encode("utf-8")).hexdigest()
    session_token_hash = hash_session_token(session_token)

    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT state_id
            FROM steam_link_states
            WHERE state_hash = %s
                AND user_id = %s
                AND session_token_hash = %s
                AND used_at IS NULL
                AND expires_at > UTC_TIMESTAMP()
            LIMIT 1
            FOR UPDATE
            """,
            (state_hash, user_id, session_token_hash),
        )

        record = cursor.fetchone()

        if not record:
            connection.rollback()
            return False

        cursor.execute(
            """
            UPDATE steam_link_states
            SET used_at = UTC_TIMESTAMP()
            WHERE state_id = %s
                AND used_at IS NULL
            """,
            (record["state_id"],),
        )

        consumed = cursor.rowcount == 1

        connection.commit()

        return consumed

    except MySQLError:
        if connection:
            connection.rollback()

        logger.exception("Database error consuming Steam link state.")
        raise

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()


# ============================================================
# STEAM ACCOUNT STORAGE
# ============================================================

def link_steam_account(user_id, steam_id):
    """
    Link a verified Steam account to a GameScope user.

    The database's unique constraints prevent one Steam
    account from being linked to multiple GameScope accounts.
    """

    if not user_id or not steam_id:
        raise ValueError("A valid user and Steam account are required.")

    if not re.fullmatch(r"[0-9]{17}", str(steam_id)):
        raise ValueError("Invalid Steam account ID.")

    profile_url = f"https://steamcommunity.com/profiles/{steam_id}"

    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor()

        cursor.execute(
            """
            INSERT INTO steam_accounts (
                user_id,
                steam_id,
                profile_url
            )
            VALUES (%s, %s, %s)
            """,
            (user_id, str(steam_id), profile_url),
        )

        connection.commit()

        return {
            "steam_id": str(steam_id),
            "profile_url": profile_url,
        }

    except IntegrityError as error:
        if connection:
            connection.rollback()

        raise ValueError(
            "This GameScope account or Steam account is already linked."
        ) from error

    except MySQLError:
        if connection:
            connection.rollback()

        logger.exception("Database error linking Steam account.")
        raise

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()


def get_steam_account(user_id):
    """
    Retrieve the Steam account linked to a GameScope user.

    Returns None if the user has not linked a Steam account.
    """

    if not user_id:
        return None

    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                steam_id,
                steam_display_name,
                profile_url,
                linked_at
            FROM steam_accounts
            WHERE user_id = %s
            LIMIT 1
            """,
            (user_id,),
        )

        steam_account = cursor.fetchone()

        if not steam_account:
            return None

        return {
            "steam_id": steam_account["steam_id"],
            "steam_display_name": steam_account["steam_display_name"],
            "profile_url": steam_account["profile_url"],
            "linked_at": (
                steam_account["linked_at"].isoformat()
                if steam_account["linked_at"]
                else None
            ),
        }

    except MySQLError:
        logger.exception("Database error retrieving Steam account.")
        raise

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()


def unlink_steam_account(user_id):
    """
    Unlink the Steam account belonging to a GameScope user.

    This does not delete the Steam account itself.

    Pending Steam-link states are invalidated in the same
    transaction so an outstanding authentication attempt
    cannot unexpectedly relink the account afterward.

    Returns True if an account was unlinked, otherwise False.
    """

    if not user_id:
        raise ValueError("A valid GameScope user is required.")

    connection = None
    cursor = None

    try:
        connection = importer.connect_database(use_database=True)
        cursor = connection.cursor()

        # Invalidate outstanding Steam linking requests.
        cursor.execute(
            """
            UPDATE steam_link_states
            SET used_at = UTC_TIMESTAMP()
            WHERE user_id = %s
                AND used_at IS NULL
            """,
            (user_id,),
        )

        # Delete only the link belonging to this GameScope user.
        cursor.execute(
            """
            DELETE FROM steam_accounts
            WHERE user_id = %s
            """,
            (user_id,),
        )

        unlinked = cursor.rowcount == 1

        connection.commit()

        if unlinked:
            logger.info(
                "Steam account unlinked for GameScope user_id=%s.",
                user_id,
            )

        return unlinked

    except MySQLError:
        if connection:
            connection.rollback()

        logger.exception("Database error unlinking Steam account.")
        raise

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()
