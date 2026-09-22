import csv
import mysql.connector

# Ask which Steam game to import
app_id = input("Enter Steam App ID: ").strip()

# CSV filename
filename = f"steam_reviews{app_id}.csv"

# Connect to MySQL
db = mysql.connector.connect(
    host="localhost",
    port=3306,
    user="root",
    password="YOUR_PASSWORD",
    database="game_reviews"
)

cursor = db.cursor()

# Open CSV
with open(filename, "r", encoding="utf-8-sig") as file:
    reader = csv.DictReader(file)

    print("CSV columns:", reader.fieldnames)

    for row in reader:

        # Convert TRUE/FALSE to 1/0 for MySQL BOOLEAN
        recommended = 1 if row["recommended"].upper() == "TRUE" else 0

        sql = """
        INSERT INTO reviews (
            app_id,
            review_text,
            recommended,
            playtime_hours,
            playtime_at_review_hours,
            helpful_votes
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        """

        values = (
            row["app_id"],
            row["review_text"],
            recommended,
            row["playtime_hours"],
            row["playtime_at_review_hours"],
            row["helpful_votes"]
        )

        cursor.execute(sql, values)

# Save changes
db.commit()

cursor.close()
db.close()

print(f"Reviews for Steam App {app_id} successfully imported!")