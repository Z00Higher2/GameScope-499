import csv
import re
import time
from datetime import datetime, timezone

import requests


NEWS_URL = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/"

# Used when a post isn't tagged as patch notes by Steam.
PATCH_TITLE = re.compile(
    r"\b(patch|hotfix|v?\d+\.\d+(\.\d+)*)\b",
    re.IGNORECASE
)


def format_timestamp(timestamp):

    return datetime.fromtimestamp(
        timestamp,
        timezone.utc
    ).strftime("%Y-%m-%d %H:%M:%S")


def is_patch_notes(item):

    if "patchnotes" in item.get("tags", []):
        return True

    return bool(PATCH_TITLE.search(item.get("title", "")))


def get_updates(app_id, max_posts=200):
    """
    Collect the developer's own announcements for a game, newest first.
    """

    updates = []
    seen = set()
    end_date = None

    while len(updates) < max_posts:

        params = {
            "appid": app_id,
            "count": 100,
            "maxlength": 1,
            "feeds": "steam_community_announcements"
        }

        if end_date:
            params["enddate"] = end_date

        try:

            response = requests.get(
                NEWS_URL,
                params=params,
                timeout=15
            )

            response.raise_for_status()

            items = response.json().get("appnews", {}).get("newsitems", [])

        except requests.RequestException as error:

            print(f"Request error: {error}")
            break

        except ValueError:

            print("Steam returned invalid JSON.")
            break

        new_items = [item for item in items if item["gid"] not in seen]

        if not new_items:
            break

        for item in new_items:

            seen.add(item["gid"])

            updates.append({
                "update_id": item["gid"],
                "app_id": app_id,
                "posted_at": format_timestamp(item["date"]),
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "is_patch_notes": is_patch_notes(item)
            })

            if len(updates) >= max_posts:
                break

        end_date = min(item["date"] for item in new_items)

        time.sleep(1)

    return updates


def save_updates(updates, app_id):

    filename = f"steam_updates_{app_id}.csv"

    if not updates:

        print("No announcements found.")
        return

    with open(
        filename,
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as file:

        writer = csv.DictWriter(
            file,
            fieldnames=updates[0].keys()
        )

        writer.writeheader()

        writer.writerows(updates)

    patches = sum(1 for update in updates if update["is_patch_notes"])

    print()
    print("------------------------------------------")
    print(f"Announcements collected: {len(updates)}")
    print(f"Marked as patch notes: {patches}")
    print(f"File created: {filename}")
    print("------------------------------------------")


if __name__ == "__main__":

    app_id_input = input("Enter Steam App ID: ").strip()

    if not app_id_input.isdigit():

        print("Invalid App ID.")
        exit()

    save_updates(
        get_updates(int(app_id_input)),
        int(app_id_input)
    )
