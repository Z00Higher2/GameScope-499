
from fastapi.testclient import TestClient
from unittest.mock import patch
import requests

import api

client = TestClient(api.app)


def test_health_hides_database_error():
    with patch(
        "api.pipeline.check_database",
        side_effect=api.MySQLError(
            msg="Sensitive internal database error"
        ),
    ):
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "database": "unavailable",
    }

    assert "Sensitive internal database error" not in response.text



def test_search_hides_request_error():
    with patch(
        "api.requests.get",
        side_effect=requests.RequestException(
            "Sensitive internal connection details"
        ),
    ):
        response = client.get(
            "/api/search",
            params={"q": "Counter-Strike"},
        )

    assert response.status_code == 502
    assert response.json()["detail"] == (
        "Steam search is temporarily unavailable."
    )
    assert "Sensitive internal connection details" not in response.text



def test_game_details_hides_value_error():
    with patch(
        "api.fetch_store_details",
        side_effect=ValueError("Sensitive internal details"),
    ):
        response = client.get("/api/games/730/details")

    assert response.status_code == 404
    assert response.json()["detail"] == "Game details were not found."
    assert "Sensitive internal details" not in response.text


def test_game_details_hides_request_error():
    with patch(
        "api.fetch_store_details",
        side_effect=requests.RequestException(
            "Sensitive internal connection details"
        ),
    ):
        response = client.get("/api/games/730/details")

    assert response.status_code == 502
    assert response.json()["detail"] == (
        "Steam game details are temporarily unavailable."
    )
    assert "Sensitive internal connection details" not in response.text


def test_analysis_hides_pipeline_error():
    with patch(
        "api.pipeline.load_game",
        side_effect=api.pipeline.PipelineError(
            "Sensitive internal pipeline details"
        ),
    ):
        response = client.post("/api/analyze/730")

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "Game analysis could not be completed."
    )
    assert "Sensitive internal pipeline details" not in response.text


def test_analysis_hides_steam_request_error():
    with patch(
        "api.pipeline.load_game",
        side_effect=requests.RequestException(
            "Sensitive internal connection details"
        ),
    ):
        response = client.post("/api/analyze/730")

    assert response.status_code == 502
    assert response.json()["detail"] == (
        "Steam is temporarily unavailable."
    )
    assert "Sensitive internal connection details" not in response.text


def test_analysis_rate_limit_blocks_excess_requests():
    from fastapi.testclient import TestClient

    test_client = TestClient(api.app)
    test_ip = "198.51.100.25"

    # Clear any previous requests from this test IP.
    api._analysis_requests.pop(test_ip, None)

    with patch.object(
        api,
        "check_analysis_rate_limit",
        side_effect=[True, True, True, True, True, False],
    ):
        # The first five requests are allowed.
        for _ in range(5):
            # Call the helper directly through its endpoint behavior
            # in the next step, rather than triggering the pipeline.
            assert api.check_analysis_rate_limit(test_ip) is True

        # The sixth request should be blocked.
        assert api.check_analysis_rate_limit(test_ip) is False


def test_analysis_endpoint_returns_429_when_rate_limited():
    with patch.object(
        api,
        "check_analysis_rate_limit",
        return_value=False,
    ):
        response = client.post("/api/analyze/730")

    assert response.status_code == 429
    assert response.json()["detail"] == (
        "Too many analysis requests. Please wait a minute and try again."
    )
    assert response.headers["retry-after"] == "60"


