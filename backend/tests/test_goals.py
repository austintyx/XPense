from decimal import Decimal


def test_get_goal_creates_default_on_first_read(client, user):
    response = client.get("/goal", params={"user_id": user.id})
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Savings goal"
    assert Decimal(str(body["target_amount"])) == Decimal("1000")
    assert Decimal(str(body["saved_amount"])) == Decimal("0")


def test_patch_goal_updates_all_fields(client, user):
    response = client.patch(
        "/goal",
        params={"user_id": user.id},
        json={"name": "Japan, next April", "target_amount": "3000", "saved_amount": "1850"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Japan, next April"
    assert Decimal(str(body["target_amount"])) == Decimal("3000")
    assert Decimal(str(body["saved_amount"])) == Decimal("1850")

    persisted = client.get("/goal", params={"user_id": user.id}).json()
    assert persisted["name"] == "Japan, next April"
    assert Decimal(str(persisted["saved_amount"])) == Decimal("1850")
