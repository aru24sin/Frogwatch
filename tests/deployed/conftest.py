import pytest

# Override the root-level bypass_auth fixture so deployed tests
# don't try to import backend.app.routes.auth or Firebase.

@pytest.fixture(autouse=True)
def bypass_auth():
    # For deployed endpoint tests, we don't need any auth patching.
    # Just let the test run without touching backend internals.
    yield

