
-- Verify the permissions assigned to the GameScope application account.
-- Run using a MySQL account permitted to inspect grants.

SHOW GRANTS FOR 'gamescope_app'@'localhost';
