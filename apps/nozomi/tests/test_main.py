from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_root() -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"Hello": "World"}


def test_rikka() -> None:
    response = client.get("/rikka", params={"q": "test"})
    assert response.status_code == 200
    assert isinstance(response.text, str)
