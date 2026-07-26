from app.models import Category, Subcategory, User


def test_list_categories_empty_when_none_custom(client, user):
    response = client.get("/categories", params={"user_id": user.id})
    assert response.status_code == 200
    assert response.json() == {"categories": [], "subcategories": []}


def test_create_category_persists_and_lists(client, user):
    response = client.post("/categories", params={"user_id": user.id}, json={"name": "Pets"})
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Pets"

    listing = client.get("/categories", params={"user_id": user.id})
    assert listing.json()["categories"] == [{"id": body["id"], "name": "Pets"}]


def test_create_category_rejects_blank_name(client, user):
    response = client.post("/categories", params={"user_id": user.id}, json={"name": "   "})
    assert response.status_code == 400


def test_create_category_rejects_builtin_collision(client, user):
    response = client.post("/categories", params={"user_id": user.id}, json={"name": "food"})
    assert response.status_code == 400


def test_create_category_rejects_duplicate_custom_name(client, user):
    client.post("/categories", params={"user_id": user.id}, json={"name": "Pets"})
    response = client.post("/categories", params={"user_id": user.id}, json={"name": "pets"})
    assert response.status_code == 400


def test_delete_category_removes_it(client, db_session, user):
    category = Category(user_id=user.id, name="Pets")
    db_session.add(category)
    db_session.commit()

    response = client.delete(f"/categories/{category.id}", params={"user_id": user.id})
    assert response.status_code == 204

    listing = client.get("/categories", params={"user_id": user.id})
    assert listing.json()["categories"] == []


def test_delete_category_is_scoped_to_owning_user(client, db_session, user):
    other_user = User(email="someone-else@example.com")
    db_session.add(other_user)
    db_session.commit()
    other_category = Category(user_id=other_user.id, name="Pets")
    db_session.add(other_category)
    db_session.commit()

    response = client.delete(f"/categories/{other_category.id}", params={"user_id": user.id})
    assert response.status_code == 404


def test_create_subcategory_persists_and_lists(client, user):
    response = client.post("/categories/Food/subcategories", params={"user_id": user.id}, json={"name": "Coffee"})
    assert response.status_code == 201
    body = response.json()
    assert body["category"] == "Food"
    assert body["name"] == "Coffee"

    listing = client.get("/categories", params={"user_id": user.id})
    assert listing.json()["subcategories"] == [{"id": body["id"], "category": "Food", "name": "Coffee"}]


def test_create_subcategory_rejects_blank_name(client, user):
    response = client.post("/categories/Food/subcategories", params={"user_id": user.id}, json={"name": ""})
    assert response.status_code == 400


def test_create_subcategory_rejects_duplicate_for_same_category(client, user):
    client.post("/categories/Food/subcategories", params={"user_id": user.id}, json={"name": "Coffee"})
    response = client.post("/categories/Food/subcategories", params={"user_id": user.id}, json={"name": "coffee"})
    assert response.status_code == 400


def test_create_subcategory_allows_same_name_under_different_category(client, user):
    client.post("/categories/Food/subcategories", params={"user_id": user.id}, json={"name": "Other"})
    response = client.post("/categories/Transport/subcategories", params={"user_id": user.id}, json={"name": "Other"})
    assert response.status_code == 201


def test_delete_subcategory_removes_it(client, db_session, user):
    subcategory = Subcategory(user_id=user.id, category="Food", name="Coffee")
    db_session.add(subcategory)
    db_session.commit()

    response = client.delete(f"/subcategories/{subcategory.id}", params={"user_id": user.id})
    assert response.status_code == 204

    listing = client.get("/categories", params={"user_id": user.id})
    assert listing.json()["subcategories"] == []


def test_delete_subcategory_is_scoped_to_owning_user(client, db_session, user):
    other_user = User(email="someone-else@example.com")
    db_session.add(other_user)
    db_session.commit()
    other_subcategory = Subcategory(user_id=other_user.id, category="Food", name="Coffee")
    db_session.add(other_subcategory)
    db_session.commit()

    response = client.delete(f"/subcategories/{other_subcategory.id}", params={"user_id": user.id})
    assert response.status_code == 404
