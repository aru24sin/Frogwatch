import requests
import pytest

BASE_URL = "https://frogwatch-backend-1066546787031.us-central1.run.app"


def get_all_get_paths():
    """Fetch OpenAPI spec and return all GET paths."""
    resp = requests.get(f"{BASE_URL}/openapi.json")
    resp.raise_for_status()
    spec = resp.json()
    paths = []

    for path, methods in spec.get("paths", {}).items():
        if "get" in methods:
            paths.append(path)

    return paths


# Collect all GET endpoints once
ALL_GET_PATHS = get_all_get_paths()


@pytest.mark.parametrize("path", ALL_GET_PATHS)
def test_get_endpoint_does_not_500(path):
    """Smoke test: all GET endpoints should respond without 5xx."""
    url = f"{BASE_URL}{path}"
    resp = requests.get(url)

    # Allow 2xx, 3xx, 4xx (e.g., 401/403/404), but NOT 5xx
    assert resp.status_code < 500, f"{url} returned {resp.status_code}"

