
-- Check the current MySQL session and selected database.
SELECT USER(), CURRENT_USER(), DATABASE();

-- Confirm the application account exists and is not locked.
SELECT User, Host, account_locked
FROM mysql.user
WHERE User = 'gamescope_app';
