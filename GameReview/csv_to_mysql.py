import csv
import os
from getpass import getpass

import mysql.connector
from dotenv import load_dotenv


# ==========================================
# Ask for Steam App ID
# ==========================================

app_id = input("Enter Steam App ID: ").strip()

input_file = f"steam_reviews_filtered_{app_id}.csv"


# ==========================================
# Connect to MySQL
# ==========================================

load_dotenv()

password = os.environ.get("MYSQL_PASSWORD")

if not password:
    password = getpass("MySQL password: ")

db = mysql.connector.connect(
    host=os.environ.get("MYSQL_HOST", "localhost"),
    port=int(os.environ.get("MYSQL_PORT", 3306)),
    user=os.environ.get("MYSQL_USER", "root"),
    password=password,
    database=os.environ.get("MYSQL_DATABASE", "game_reviews")
)

cursor = db.cursor()


# ==========================================
# Read CSV
# ==========================================

try:
    with open(input_file, "r", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        rows = list(reader)

except FileNotFoundError:
    print(f"Error: Could not find {input_file}")
    cursor.close()
    db.close()
    exit()


if not rows:
    print("Error: CSV file is empty.")
    cursor.close()
    db.close()
    exit()


# ==========================================
# Find or add the game
# ==========================================

game_name = rows[0]["game_name"]
csv_app_id = int(rows[0]["app_id"])

cursor.execute(
    "SELECT game_id FROM games WHERE app_id = %s",
    (csv_app_id,)
)

game = cursor.fetchone()

if game:
    game_id = game[0]
else:
    cursor.execute(
        "INSERT INTO games (app_id, game_name) VALUES (%s, %s)",
        (csv_app_id, game_name)
    )
    game_id = cursor.lastrowid


print(f"Game: {game_name}")
print(f"Reviews found: {len(rows)}")


# ==========================================
# Insert reviews
# ==========================================

# Reviews already in the database get their votes, playtime and
# edits refreshed instead of being inserted twice.
sql = """
INSERT INTO reviews (
    game_id,
    review_id,
    review_text,
    recommended,
    playtime_hours,
    playtime_at_review_hours,
    helpful_votes,
    created_at,
    updated_at
)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
ON DUPLICATE KEY UPDATE
    review_text = VALUES(review_text),
    recommended = VALUES(recommended),
    playtime_hours = VALUES(playtime_hours),
    helpful_votes = VALUES(helpful_votes),
    updated_at = VALUES(updated_at)
"""


# ==========================================
# Process rows
# ==========================================

added = 0
updated = 0

for row in rows:

    recommended = (
        1 if row["recommended"].strip().upper() == "TRUE" else 0
    )

    values = (
        game_id,
        row["review_id"],
        row["review_text"],
        recommended,
        float(row["playtime_hours"])
        if row["playtime_hours"]
        else 0,
        float(row["playtime_at_review_hours"])
        if row["playtime_at_review_hours"]
        else 0,
        int(row["helpful_votes"])
        if row["helpful_votes"]
        else 0,
        row.get("created_at") or None,
        row.get("updated_at") or None
    )

    cursor.execute(sql, values)

    # MySQL reports 1 for a new row, 2 for an updated row
    # and 0 when nothing changed.
    if cursor.rowcount == 1:
        added += 1
    elif cursor.rowcount == 2:
        updated += 1


# ==========================================
# Save changes
# ==========================================

db.commit()


print()
print("==========================================")
print("IMPORT COMPLETE")
print("==========================================")
print(f"Game: {game_name}")
print(f"New reviews: {added}")
print(f"Updated reviews: {updated}")
print(f"Unchanged reviews: {len(rows) - added - updated}")
print("==========================================")


# ==========================================
# Close connection
# ==========================================

cursor.close()
db.close()
