def test_cors_allows_configured_origin(client):
    response = client.get("/health", headers={"Origin": "http://localhost:8090"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:8090"


def test_cors_rejects_unlisted_origin(client):
    response = client.get("/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in response.headers


def test_cors_preflight_allows_post_to_sync(client):
    """/sync's JSON POST is a non-"simple" request and triggers a real preflight in a browser --
    confirm the OPTIONS handshake itself succeeds, not just the actual request."""
    response = client.options(
        "/sync",
        headers={
            "Origin": "http://localhost:8090",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:8090"
    assert "POST" in response.headers["access-control-allow-methods"]
