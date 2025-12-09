import requests
import time

BASE_URL = "https://frogwatch-backend-1066546787031.us-central1.run.app"

def test_recordings_endpoint_responds():
    start = time.time()
    resp = requests.get(f"{BASE_URL}/recordings")  # adjust path if needed
    elapsed = time.time() - start

    assert resp.status_code < 600
    assert elapsed < 1.0
