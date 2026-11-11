-- =====================================================================
-- Verify GameScope application account permissions
-- =====================================================================
-- Purpose:  Lists every privilege assigned to the gamescope_app account
--           so you can confirm it matches what database_user_setup.sql
--           granted.
-- Run:      After database_user_setup.sql, using a MySQL account
--           permitted to inspect grants (e.g. root).
--             mysql -u root -p < database_permissions.sql
-- Expected output:
--   - GRANT USAGE ON *.*  (the default entry every account has)
--   - GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX,
--     REFERENCES ON `game_reviews`.*
-- Red flags: DROP, GRANT OPTION, ALL PRIVILEGES, or any database other
--            than game_reviews. If you see these, revoke them.
-- =====================================================================

-- Show all grants for the application account.
SHOW GRANTS FOR 'gamescope_app'@'localhost';