
-- GameScope application database account setup
-- Run once using a MySQL administrator account.
-- Replace the placeholder with a strong, unique password.
-- Do not commit a real password.

CREATE USER 'gamescope_app'@'localhost'
IDENTIFIED BY 'REPLACE_WITH_A_STRONG_PASSWORD';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
ON game_reviews.*
TO 'gamescope_app'@'localhost';
