import json
import unittest
from unittest.mock import patch

import SteamGameReviewer_ as collector
import pipeline
from csv_to_mysql_ import parse_rows, sync_game_tags


class GameTagTests(unittest.TestCase):
    def test_extracts_and_normalizes_official_genres_and_categories(self):
        tags = collector.extract_official_tags(
            {
                "genres": [
                    {"description": " Action "},
                    {"description": "Action"},
                ],
                "categories": [{"description": "Single-player"}],
            }
        )

        self.assertEqual(
            tags,
            [
                {
                    "tag_name": "Action",
                    "tag_source": "genre",
                    "tag_rank": 1,
                },
                {
                    "tag_name": "Single-player",
                    "tag_source": "category",
                    "tag_rank": 1,
                },
            ],
        )

    def test_orders_community_tags_by_popularity_and_ignores_bad_counts(self):
        tags = collector.extract_community_tags(
            {
                "tags": {
                    "Action": 10,
                    "RPG": 20,
                    "Invalid": "many",
                }
            }
        )

        self.assertEqual(
            [(tag["tag_name"], tag["tag_rank"]) for tag in tags],
            [("RPG", 1), ("Action", 2)],
        )

    def test_community_lookup_failure_is_nonfatal(self):
        with patch.object(
            collector.requests,
            "get",
            side_effect=collector.requests.RequestException("unavailable"),
        ):
            tags, refreshed = collector.get_community_tags(440)

        self.assertEqual(tags, [])
        self.assertFalse(refreshed)

    def test_user_tags_are_normalized_and_deduplicated(self):
        tags = collector.parse_user_tags("  Cozy   ,COZY,Story-rich ")

        self.assertEqual(
            [(tag["tag_name"], tag["tag_source"]) for tag in tags],
            [("Cozy", "user"), ("Story-rich", "user")],
        )

    def test_csv_rows_round_trip_tags_and_refresh_sources(self):
        row = {
            "app_id": "440",
            "game_name": "Team Fortress 2",
            "game_release_date": "2007-10-10",
            "game_description": "A game",
            "game_developer": "Valve",
            "game_publisher": "Valve",
            "game_price": "0.00",
            "review_id": "review-1",
            "review_text": "A useful review.",
            "recommended": "true",
            "playtime_hours": "10",
            "playtime_at_review_hours": "8",
            "helpful_votes": "1",
            "language": "english",
            "game_tags": json.dumps(
                [
                    {
                        "tag_name": "Action",
                        "tag_source": "genre",
                        "tag_rank": 1,
                    },
                    {
                        "tag_name": "Cozy",
                        "tag_source": "user",
                        "tag_rank": None,
                    },
                ]
            ),
            "tag_sources_refreshed": json.dumps(["genre", "community"]),
        }

        _, reviews, tag_data = parse_rows([row], 440)

        self.assertEqual(len(reviews), 1)
        self.assertEqual(tag_data[0][0]["tag_name"], "Action")
        self.assertEqual(tag_data[0][1]["tag_source"], "user")
        self.assertEqual(tag_data[1], ["genre", "community"])

    def test_legacy_rows_without_tags_remain_supported(self):
        row = {
            "app_id": "440",
            "game_name": "Team Fortress 2",
            "game_release_date": "2007-10-10",
            "game_description": "A game",
            "game_developer": "Valve",
            "game_publisher": "Valve",
            "game_price": "0.00",
            "review_id": "review-1",
            "review_text": "A useful review.",
            "recommended": "true",
            "playtime_hours": "10",
            "playtime_at_review_hours": "8",
            "helpful_votes": "1",
            "language": "english",
        }

        _, _, tag_data = parse_rows([row], 440)

        self.assertEqual(tag_data, (None, []))

    def test_rejects_malformed_tag_source(self):
        row = {
            "app_id": "440",
            "game_name": "Team Fortress 2",
            "game_release_date": "2007-10-10",
            "game_description": "A game",
            "game_developer": "Valve",
            "game_publisher": "Valve",
            "game_price": "0.00",
            "review_id": "review-1",
            "review_text": "A useful review.",
            "recommended": "true",
            "playtime_hours": "10",
            "playtime_at_review_hours": "8",
            "helpful_votes": "1",
            "language": "english",
            "game_tags": json.dumps(
                [{"tag_name": "Action", "tag_source": "other"}]
            ),
        }

        with self.assertRaisesRegex(ValueError, "Invalid tag source"):
            parse_rows([row], 440)

    def test_pipeline_encodes_tags_as_json_for_the_importer(self):
        row = pipeline.as_csv_row(
            440,
            {
                "game_name": "Team Fortress 2",
                "game_tags": [
                    {
                        "tag_name": "Action",
                        "tag_source": "genre",
                        "tag_rank": 1,
                    }
                ],
                "tag_sources_refreshed": ["genre"],
            },
            {"review_id": "review-1"},
        )

        self.assertEqual(
            json.loads(row["game_tags"])[0]["tag_name"],
            "Action",
        )
        self.assertEqual(
            json.loads(row["tag_sources_refreshed"]),
            ["genre"],
        )

    def test_tag_sync_only_replaces_requested_sources(self):
        class Cursor:
            def __init__(self):
                self.statements = []

            def execute(self, statement, params):
                self.statements.append((statement, params))

            def fetchone(self):
                return (7,)

        cursor = Cursor()
        sync_game_tags(
            cursor,
            440,
            [
                {
                    "tag_name": "Cozy",
                    "tag_source": "user",
                    "tag_rank": None,
                }
            ],
            ["genre", "community"],
        )

        self.assertIn("tag.tag_source IN (%s, %s)", cursor.statements[0][0])
        self.assertEqual(cursor.statements[0][1], (440, "genre", "community"))
        self.assertEqual(cursor.statements[-1][1], (440, 7, None))


if __name__ == "__main__":
    unittest.main()
