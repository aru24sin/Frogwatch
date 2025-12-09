import requests
import time

BASE_URL = "https://frogwatch-backend-1066546787031.us-central1.run.app"

def test_login_endpoint_is_reachable():
    payload = {
        "email": "test@example.com",
        "password": "wrongpassword"
    }
    start = time.time()
    resp = requests.post(f"{BASE_URL}/auth/login", json=payload)
    elapsed = time.time() - start

    # It may return 401/422 and that's OK; we just verify it works and isn't hanging
    assert resp.status_code in (200, 400, 401, 422)
    assert elapsed < 1.5
