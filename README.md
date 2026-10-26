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

### 2.5. Activate the Virtual Environment (macOS only)

From the `GameReview` directory, run:

```bash
source .venv/bin/activate
```

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
