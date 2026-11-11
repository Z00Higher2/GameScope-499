-- =====================================================================
-- GameScope application database account setup
-- =====================================================================
-- Purpose:  Creates the dedicated MySQL account the GameScope app uses
--           to connect to the game_reviews database.
-- Run:      ONCE, using a MySQL administrator account (e.g. root).
--             mysql -u root -p < database_user_setup.sql
-- Before running:
--   1. The game_reviews database must already exist:
--        CREATE DATABASE game_reviews;
--   2. Replace the password placeholder below with a strong, unique password.
--   3. Do not commit a real password to version control. Store it in an
--      environment variable or a local config file that is git-ignored.
-- Next steps: run database_permissions.sql and database_security_checks.sql
--             to verify the account was set up correctly.
-- =====================================================================

-- Create the application account.
-- '@localhost' means it can only connect from the same machine as the
-- MySQL server, so it cannot be used from the network.
-- Note: this fails with "user already exists" if run a second time.
CREATE USER 'gamescope_app'@'localhost'
IDENTIFIED BY 'REPLACE_WITH_A_STRONG_PASSWORD';

-- Grant only the permissions the app needs, and only on game_reviews:
--   SELECT, INSERT, UPDATE, DELETE  -> read and change row data
--   CREATE, ALTER, INDEX            -> create and modify tables and indexes
--   REFERENCES                      -> define foreign key relationships
-- Deliberately NOT granted (least privilege): DROP, GRANT OPTION, and
-- access to any other database. This limits the damage if the app's
-- credentials are ever compromised.
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
ON game_reviews.*
TO 'gamescope_app'@'localhost';