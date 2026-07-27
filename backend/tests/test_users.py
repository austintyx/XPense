def test_get_user_returns_profile(client, user):
    response = client.get("/user", params={"user_id": user.id})
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == user.id
    assert body["email"] == user.email
    assert body["name"] is None


def test_get_user_404_for_unknown_user(client):
    response = client.get("/user", params={"user_id": 999999})
    assert response.status_code == 404


def test_patch_user_updates_name(client, db_session, user):
    response = client.patch("/user", params={"user_id": user.id}, json={"name": "Wei Ling Tan"})
    assert response.status_code == 200
    assert response.json()["name"] == "Wei Ling Tan"

    db_session.refresh(user)
    assert user.name == "Wei Ling Tan"
