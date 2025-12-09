import requests
import time

BASE_URL = "https://frogwatch-backend-1066546787031.us-central1.run.app"

def test_expert_review_endpoint_is_reachable():
    payload = {
        "recordingId": "fake-id",
        "decision": "approved",
        "comment": "automated test"
    }
    start = time.time()
    resp = requests.post(f"{BASE_URL}/expert/review", json=payload)
    elapsed = time.time() - start

    # Expecting 401/403/404 is fine; we only care that it responds quickly
    assert resp.status_code < 600
    assert elapsed < 1.5
