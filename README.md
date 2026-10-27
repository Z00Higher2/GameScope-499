# CAPSTONE_PROJECT-499

GameScope collects a game's Steam reviews, filters out junk reviews, stores the rest in MySQL, and shows the analysis on a React website.

## How the pieces connect

```
Website (GameScope/, React + Vite)
   |  /api requests
   v
GameScope API (GameReview/api.py, FastAPI)
   |
   v
Steam -> SteamGameReviewer_.py -> filter_reviews.py -> csv_to_mysql_.py -> MySQL
                                                          analysis.py  <- MySQL
```

Pressing **Analyze** on the Dashboard runs the whole pipeline for that game (about 15 seconds the first time), and every page shows the real results. A game that was analyzed before loads straight from MySQL. **Re-analyze** collects fresh reviews from Steam.

## Running it locally

Three things need to be running: MySQL, the API, and the website.

### 1. MySQL

Any MySQL 8 server works. With Docker, the first time:

```
docker run -d --name gamescope-mysql -p 3306:3306 -e MYSQL_ROOT_PASSWORD=<your password> -v gamescope-mysql-data:/var/lib/mysql mysql:8.4
```

After that, start it with `docker start gamescope-mysql`.

Copy `GameReview/.env.example` to `GameReview/.env` and fill in `MYSQL_PASSWORD`. The API creates the `game_reviews` database and its tables on first use, from `GameReview/GameScope Project (game review databse).sql`.

### 2. The API

```
cd GameReview
pip install -r requirements.txt
python -m uvicorn api:app --reload --port 8000

```

### 2.5. Activate the Virtual Environment (macOS only)

From the `GameReview` directory, run:

```bash
source .venv/bin/activate

**How to Confirm Activation**

If activation is successful, you should see `(.venv)` at the beginning of your terminal prompt.

Example:

```bash
(.venv) itz00@Zuhayers-MacBook-Air GameReview %
```

You can also verify which Python executable is being used:

```bash
which python
```

The output should point to the Python executable inside your project's `.venv` directory, for example:

```text
/path/to/GameReview/.venv/bin/python
```

If `(.venv)` does not appear, or the command returns an error, the virtual environment may not have activated correctly.
```

Check it at http://localhost:8000/api/health (`"database": "connected"` means MySQL is reachable).

```

### 3. The website

```
cd GameScope
npm.cmd ci
npm.cmd run dev
```

Open http://localhost:5173. (`npm.cmd` is for PowerShell on Windows; use `npm` elsewhere.)

`npm ci` is needed after cloning because the `node_modules` folder in git is incomplete: the `bin/` rule in `GameScope/.gitignore` kept every package's `bin` folder out of git, including Vite's.

## Running the scripts on their own

The pipeline scripts still work from the command line, one step at a time, passing CSV files along:

1. `python SteamGameReviewer_.py` writes `steam_reviews_<appid>.csv`
2. `python filter_reviews.py` writes `steam_reviews_filtered_<appid>.csv`
3. `python csv_to_mysql_.py` imports the filtered CSV into MySQL



# GameScope Database Security Setup

This guide explains how to use the SQL files provided for the GameScope project. They help developers configure and verify the MySQL application account used by the GameScope backend.

## SQL Files

| File | Purpose |
|---|---|
| `database_user_setup.sql` | Creates the `gamescope_app` MySQL account and grants the required permissions on the `game_reviews` database. |
| `database_permissions.sql` | Displays the permissions assigned to `gamescope_app`. |
| `database_security_checks.sql` | Checks the current MySQL session, selected database, and application account status. |

## Prerequisites

Before running the scripts, make sure you have:

- MySQL Server installed and running.
- The GameScope database, `game_reviews`, already created.
- Access to MySQL Workbench or the MySQL command line.
- A MySQL administrator account for initial setup.

**Important:** These scripts are intended for local development. Each team member should configure their own database credentials rather than sharing passwords.

## 1. Set Up the Application Account

Open `database_user_setup.sql` in MySQL Workbench and review the commands.

The script creates a dedicated application account:

```sql
CREATE USER 'gamescope_app'@'localhost'
IDENTIFIED BY 'REPLACE_WITH_A_STRONG_PASSWORD';
```

Replace `REPLACE_WITH_A_STRONG_PASSWORD` with a strong, unique password before executing the script. Do not commit the real password to GitHub.

The script grants the account the following permissions on `game_reviews`:

- `SELECT` — read data
- `INSERT` — add records
- `UPDATE` — modify records
- `DELETE` — delete records
- `CREATE` — create tables
- `ALTER` — modify table structures
- `INDEX` — create and manage indexes
- `REFERENCES` — support foreign-key references

Run this script using a MySQL administrator account. Run it only once for a newly configured account. If `gamescope_app` already exists, do not rerun the `CREATE USER` command; inspect the existing account and apply any missing permissions separately.

The `game_reviews` database must exist before running this script.

## 2. Verify Account Permissions

Open `database_permissions.sql` and execute:

```sql
SHOW GRANTS FOR 'gamescope_app'@'localhost';
```

Confirm that the account has the expected permissions on `game_reviews.*` and does not have unnecessary global administrative privileges.

## 3. Run the Security Checks

Open `database_security_checks.sql` and execute its queries.

The checks help you confirm:

- Which MySQL account is being used.
- Which database is selected for the current session.
- Whether the `gamescope_app` account exists and is locked.

Some checks query MySQL's internal `mysql.user` table. If your account cannot read that table, execute the relevant query using an administrator connection instead.

## 4. Configure the Backend

The GameScope backend reads its database connection settings from the local `.env` file.

Example configuration:

```dotenv
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=gamescope_app
MYSQL_PASSWORD=YOUR_LOCAL_PASSWORD
```

Use your own password in your local `.env` file. Keep `.env` out of GitHub; never paste your password into source code, SQL documentation, or team chat.

If the project uses an additional `MYSQL_DATABASE` setting, set it to `game_reviews`.

## 5. Test the Backend

From the `GameReview` directory, activate your virtual environment:

```bash
source .venv/bin/activate
```

Start the API:

```bash
python -m uvicorn api:app --reload --port 8000
```

Check the health endpoint:

```text
http://127.0.0.1:8000/api/health
```

A successful local database connection should report a connected database.

To run the API security tests, open another terminal in `GameReview`, activate the virtual environment, and run:

```bash
python -m pytest -v api_security.py
```

## Security Notes

- Never commit real database passwords, API keys, or authentication hashes.
- Do not use the MySQL `root` account for the GameScope application.
- Do not grant global administrative privileges to `gamescope_app`.
- Keep each developer's `.env` file local and ignored by Git.
- The setup script is for local development; production hosting requires separate database credentials and appropriate network restrictions.
- Do not run SQL commands you do not understand against a shared or production database.

## Troubleshooting

**`CREATE USER` reports that the account already exists**

The account has already been created. Check its existing permissions instead of rerunning the setup script.

**Access denied for `gamescope_app`**

Verify the username, password, host, and database grants. Confirm that the account is configured for the same host used by your connection.

**The API reports that the database is unavailable**

Check that MySQL Server is running, `game_reviews` exists, the `.env` credentials are correct, and the application account has the required permissions.

**A security check returns an access-denied error**

Some verification queries require an administrator account. Run those checks through an authorized MySQL Workbench connection.

---

These scripts help each GameScope developer set up and verify a restricted local MySQL application account without using the root account for normal backend operations.

