import requests
import time

BASE_URL = "https://frogwatch-backend-1066546787031.us-central1.run.app"

def test_healthz_responds_quickly():
    start = time.time()
    resp = requests.get(f"{BASE_URL}/healthz")
    elapsed = time.time() - start

    # We just care that it responds and isn't super slow
    assert resp.status_code < 600
    assert elapsed < 1.0
