from fastapi.testclient import TestClient

from app.main import app
from app.models import User

client = TestClient(app)


def test_health_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_db_round_trip(db_session):
    user = User(email="round-trip@example.com")
    db_session.add(user)
    db_session.commit()

    fetched = db_session.query(User).filter_by(email="round-trip@example.com").one()
    assert fetched.id == user.id
    assert fetched.email == "round-trip@example.com"
