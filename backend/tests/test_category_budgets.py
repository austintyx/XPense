from decimal import Decimal

from app.models import CategoryBudget, User


def test_list_category_budgets_empty_for_fresh_user(client, user):
    response = client.get("/category-budgets", params={"user_id": user.id})
    assert response.status_code == 200
    assert response.json() == []


def test_put_category_budget_creates_then_updates(client, user):
    created = client.put(
        "/category-budgets/Food", params={"user_id": user.id}, json={"monthly_limit": "300"}
    )
    assert created.status_code == 200
    body = created.json()
    assert body["category"] == "Food"
    assert Decimal(str(body["monthly_limit"])) == Decimal("300")

    updated = client.put(
        "/category-budgets/Food", params={"user_id": user.id}, json={"monthly_limit": "350"}
    )
    assert updated.status_code == 200
    assert Decimal(str(updated.json()["monthly_limit"])) == Decimal("350")

    listing = client.get("/category-budgets", params={"user_id": user.id})
    assert len(listing.json()) == 1
    assert Decimal(str(listing.json()[0]["monthly_limit"])) == Decimal("350")


def test_put_category_budget_covers_builtin_categories_with_no_category_row(client, user):
    # "Food" has no row in the `categories` table (that table only holds custom categories) --
    # confirms the free-text-keyed design actually covers built-ins, not just custom ones.
    response = client.put(
        "/category-budgets/Transport", params={"user_id": user.id}, json={"monthly_limit": "150"}
    )
    assert response.status_code == 200
    assert response.json()["category"] == "Transport"


def test_delete_category_budget_clears_it(client, db_session, user):
    row = CategoryBudget(user_id=user.id, category="Food", monthly_limit=Decimal("300"))
    db_session.add(row)
    db_session.commit()

    response = client.delete("/category-budgets/Food", params={"user_id": user.id})
    assert response.status_code == 204

    listing = client.get("/category-budgets", params={"user_id": user.id})
    assert listing.json() == []


def test_delete_category_budget_404s_when_no_limit_set(client, user):
    response = client.delete("/category-budgets/Food", params={"user_id": user.id})
    assert response.status_code == 404


def test_category_budgets_are_scoped_to_owning_user(client, db_session, user):
    other_user = User(email="someone-else@example.com")
    db_session.add(other_user)
    db_session.commit()
    other_row = CategoryBudget(user_id=other_user.id, category="Food", monthly_limit=Decimal("300"))
    db_session.add(other_row)
    db_session.commit()

    listing = client.get("/category-budgets", params={"user_id": user.id})
    assert listing.json() == []

    delete_response = client.delete("/category-budgets/Food", params={"user_id": user.id})
    assert delete_response.status_code == 404
