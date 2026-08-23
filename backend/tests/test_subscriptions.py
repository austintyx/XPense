from datetime import datetime, timezone
from decimal import Decimal

from app.models import Subscription, User


def test_list_subscriptions_empty_for_fresh_user(client, user):
    response = client.get("/subscriptions", params={"user_id": user.id})
    assert response.status_code == 200
    assert response.json() == []


def test_create_subscription(client, user):
    response = client.post(
        "/subscriptions",
        params={"user_id": user.id},
        json={
            "name": "Netflix",
            "amount": "14.98",
            "frequency": "monthly",
            "next_due": "2026-08-01T00:00:00Z",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Netflix"
    assert Decimal(str(body["amount"])) == Decimal("14.98")
    assert body["frequency"] == "monthly"

    listing = client.get("/subscriptions", params={"user_id": user.id})
    assert len(listing.json()) == 1
    assert listing.json()[0]["name"] == "Netflix"


def test_list_subscriptions_ordered_by_next_due(client, user):
    client.post(
        "/subscriptions",
        params={"user_id": user.id},
        json={"name": "Yearly Plan", "amount": "120.00", "frequency": "yearly", "next_due": "2027-01-01T00:00:00Z"},
    )
    client.post(
        "/subscriptions",
        params={"user_id": user.id},
        json={"name": "Spotify", "amount": "9.90", "frequency": "monthly", "next_due": "2026-08-01T00:00:00Z"},
    )

    listing = client.get("/subscriptions", params={"user_id": user.id})
    names = [row["name"] for row in listing.json()]
    assert names == ["Spotify", "Yearly Plan"]


def test_update_subscription(client, db_session, user):
    row = Subscription(
        user_id=user.id,
        name="Gym",
        amount=Decimal("60.00"),
        frequency="monthly",
        next_due=datetime(2026, 8, 1, tzinfo=timezone.utc),
    )
    db_session.add(row)
    db_session.commit()

    response = client.patch(
        f"/subscriptions/{row.id}",
        params={"user_id": user.id},
        json={
            "name": "Gym Plus",
            "amount": "75.00",
            "frequency": "yearly",
            "next_due": "2027-01-01T00:00:00Z",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Gym Plus"
    assert Decimal(str(body["amount"])) == Decimal("75.00")
    assert body["frequency"] == "yearly"

    listing = client.get("/subscriptions", params={"user_id": user.id})
    assert len(listing.json()) == 1
    assert listing.json()[0]["name"] == "Gym Plus"


def test_update_subscription_404s_when_missing(client, user):
    response = client.patch(
        "/subscriptions/999999",
        params={"user_id": user.id},
        json={"name": "Ghost", "amount": "1.00", "frequency": "monthly", "next_due": "2026-08-01T00:00:00Z"},
    )
    assert response.status_code == 404


def test_update_subscription_is_scoped_to_owning_user(client, db_session, user):
    other_user = User(email="someone-else-subs-update@example.com")
    db_session.add(other_user)
    db_session.commit()
    other_row = Subscription(
        user_id=other_user.id,
        name="Other's Netflix",
        amount=Decimal("14.98"),
        frequency="monthly",
        next_due=datetime(2026, 8, 1, tzinfo=timezone.utc),
    )
    db_session.add(other_row)
    db_session.commit()

    response = client.patch(
        f"/subscriptions/{other_row.id}",
        params={"user_id": user.id},
        json={"name": "Hijacked", "amount": "1.00", "frequency": "monthly", "next_due": "2026-08-01T00:00:00Z"},
    )
    assert response.status_code == 404


def test_delete_subscription(client, db_session, user):
    row = Subscription(
        user_id=user.id,
        name="Gym",
        amount=Decimal("60.00"),
        frequency="monthly",
        next_due=datetime(2026, 8, 1, tzinfo=timezone.utc),
    )
    db_session.add(row)
    db_session.commit()

    response = client.delete(f"/subscriptions/{row.id}", params={"user_id": user.id})
    assert response.status_code == 204

    listing = client.get("/subscriptions", params={"user_id": user.id})
    assert listing.json() == []


def test_delete_subscription_404s_when_missing(client, user):
    response = client.delete("/subscriptions/999999", params={"user_id": user.id})
    assert response.status_code == 404


def test_subscriptions_are_scoped_to_owning_user(client, db_session, user):
    other_user = User(email="someone-else-subs@example.com")
    db_session.add(other_user)
    db_session.commit()
    other_row = Subscription(
        user_id=other_user.id,
        name="Other's Netflix",
        amount=Decimal("14.98"),
        frequency="monthly",
        next_due=datetime(2026, 8, 1, tzinfo=timezone.utc),
    )
    db_session.add(other_row)
    db_session.commit()

    listing = client.get("/subscriptions", params={"user_id": user.id})
    assert listing.json() == []

    delete_response = client.delete(f"/subscriptions/{other_row.id}", params={"user_id": user.id})
    assert delete_response.status_code == 404
