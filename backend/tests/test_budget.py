from decimal import ROUND_HALF_UP, Decimal


def _cents(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def test_get_budget_creates_default_on_first_read(client, db_session, user):
    response = client.get("/budget", params={"user_id": user.id})
    assert response.status_code == 200
    body = response.json()
    assert Decimal(str(body["monthly_target"])) == Decimal("2000")
    assert Decimal(str(body["weekly_target"])) == _cents(Decimal("2000") / Decimal(7))
    assert Decimal(str(body["daily_target"])) == _cents(Decimal("2000") / Decimal(30))


def test_get_budget_is_idempotent(client, user):
    first = client.get("/budget", params={"user_id": user.id}).json()
    second = client.get("/budget", params={"user_id": user.id}).json()
    assert first == second


def test_patch_budget_updates_monthly_target_and_derived_fields(client, user):
    response = client.patch("/budget", params={"user_id": user.id}, json={"monthly_target": "3000"})
    assert response.status_code == 200
    body = response.json()
    assert Decimal(str(body["monthly_target"])) == Decimal("3000")
    assert Decimal(str(body["weekly_target"])) == _cents(Decimal("3000") / Decimal(7))
    assert Decimal(str(body["daily_target"])) == _cents(Decimal("3000") / Decimal(30))

    persisted = client.get("/budget", params={"user_id": user.id}).json()
    assert Decimal(str(persisted["monthly_target"])) == Decimal("3000")
