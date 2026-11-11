-- =====================================================================
-- GameScope database security checks
-- =====================================================================
-- Purpose:  Quick sanity checks on the current MySQL session and on the
--           gamescope_app account.
-- Run:      After database_user_setup.sql.
--             mysql -u root -p < database_security_checks.sql
-- Note:     The first query works from any account. The second reads the
--           mysql.user table, so it needs an administrator account.
-- =====================================================================

-- Check 1: Who am I connected as, and which database is selected?
--   USER()         -> the username and host you tried to connect with
--   CURRENT_USER() -> the account MySQL actually authenticated you as
--   DATABASE()     -> the selected database (NULL if none is selected)
-- Most useful when logged in as gamescope_app:
--   mysql -u gamescope_app -p game_reviews
-- Expected: CURRENT_USER() = gamescope_app@localhost, DATABASE() = game_reviews
SELECT USER(), CURRENT_USER(), DATABASE();

-- Check 2: Does the application account exist, and is it unlocked?
-- Expected: one row for gamescope_app / localhost with account_locked = 'N'.
-- No rows means the account was not created; 'Y' means it is locked and
-- the app will not be able to log in.
SELECT User, Host, account_locked
FROM mysql.user
WHERE User = 'gamescope_app';