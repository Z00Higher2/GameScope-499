
import os
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# Load .env from this script's directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

STEAM_ID = os.getenv("STEAM_ID", "").strip()

def get_owned_games(steam_id):

    url = f"https://steamcommunity.com/profiles/{steam_id}/games/"

    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en-US,en;q=0.9"
    }

    try:
        print("Connecting to Steam Community...")

        response = requests.get(
            url,
            headers=headers,
            timeout=30
        )

        print("HTTP Status:", response.status_code)
        print("Final URL:", response.url)

        response.raise_for_status()

        if "/login/" in response.url:
            print("Steam requires authentication to access this profile.")
            return []

        soup = BeautifulSoup(response.text, "html.parser")

        games = []

        # Inspect game entries in the returned webpage
        for game in soup.select(".gameListRow"):

            name_element = game.select_one(".gameListRowItemName")
            hours_element = game.select_one(".gameListRowItemHours")

            if not name_element:
                continue

            name = name_element.get_text(strip=True)

            hours = (
                hours_element.get_text(strip=True)
                if hours_element
                else "Unknown"
            )

            games.append({
                "name": name,
                "hours": hours
            })

        return games

    except requests.exceptions.RequestException as error:
        print("Request failed:", error)

    return []


def main():

    if not STEAM_ID.isdigit() or len(STEAM_ID) != 17:
        print("Invalid Steam ID in .env")
        return

    games = get_owned_games(STEAM_ID)

    if not games:
        print("\nNo games retrieved.")
        print("Steam may restrict access to this profile.")
        return

    print("\n========== STEAM LIBRARY ==========")

    for index, game in enumerate(games, start=1):
        print(f"{index}. {game['name']}")
        print(f"   Playtime: {game['hours']}")
        print("--------------------------------")

    print(f"\nTotal games retrieved: {len(games)}")


if __name__ == "__main__":
    main()
