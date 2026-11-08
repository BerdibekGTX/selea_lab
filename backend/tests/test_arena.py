import pytest
import sys
from types import SimpleNamespace
from fastapi.testclient import TestClient
from app import main


@pytest.fixture
def clients(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DB", tmp_path / "arena.db")
    main.init_db()
    main.limits.clear()
    main.locks.clear()
    main.session_credentials.clear()
    first, second = TestClient(main.app), TestClient(main.app)
    first.get("/api/session")
    second.get("/api/session")
    return first, second


def prompt(client, **updates):
    body = {"mode": "battle", "prompt": "Explain gravity", "models": [
        {"provider": "demo", "id": "demo-a"}, {"provider": "demo", "id": "demo-b"}]}
    body.update(updates)
    return client.post("/api/chat", json=body)


def test_blind_reveal_and_idempotent_vote(clients):
    client, _ = clients
    chat = prompt(client).json()
    assert chat["models"][0]["id"] == "Model A"
    revealed = client.post(f"/api/chats/{chat['id']}/vote", json={"choice": "a"}).json()
    assert revealed["models"][0]["provider"] == "demo"
    again = client.post(f"/api/chats/{chat['id']}/vote", json={"choice": "b"}).json()
    assert again["vote"] == "a"
    assert sum(row["votes"] for row in client.get("/api/leaderboard").json()) == 2
    assert prompt(client, chat_id=chat["id"]).status_code == 409


def test_catalog_uses_available_metadata_without_invented_values(clients, monkeypatch):
    monkeypatch.setitem(sys.modules, "litellm", SimpleNamespace(model_cost={
        "gpt-4.1": {"mode": "chat", "max_input_tokens": 1000, "input_cost_per_token": 0.000002},
        "xai/grok-4.3": {"mode": "chat", "max_output_tokens": 100},
        "claude-sonnet-4-5": {"mode": "image_generation"},
    }))
    response = clients[0].get("/api/models")
    assert response.status_code == 200
    rows = response.json()["models"]
    assert {row["id"] for row in rows} == {"demo-a", "demo-b", "gpt-4.1", "grok-4.3"}
    gpt = next(row for row in rows if row["id"] == "gpt-4.1")
    assert gpt["context"] == 1000
    assert gpt["input_cost"] == 0.000002
    assert gpt["output"] is None
    assert gpt["output_cost"] is None
    assert all("keys" not in row and "rating" not in row for row in rows)


def test_ownership_and_guest_migration(clients):
    client, stranger = clients
    chat = prompt(client).json()
    assert stranger.get(f"/api/chats/{chat['id']}").status_code == 404
    credentials = {"name": "Tester", "email": "tester@example.test", "password": "test-password-123"}
    assert client.post("/api/auth/register", json=credentials).status_code == 200
    assert client.get(f"/api/chats/{chat['id']}").status_code == 200
    client.post("/api/logout")
    assert client.get(f"/api/chats/{chat['id']}").status_code == 404
    assert client.post("/api/auth/login", json={**credentials, "password": "wrong-password"}).status_code == 401
    assert client.post("/api/auth/login", json=credentials).status_code == 200
    assert client.get(f"/api/chats/{chat['id']}").status_code == 200
    with main.db() as connection:
        assert "test-password-123" not in connection.execute("SELECT password FROM users").fetchone()[0]


def test_provider_failure_preserves_chat_and_blocks_vote(clients, monkeypatch):
    client, _ = clients
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    result = prompt(client, models=[{"provider": "openai", "id": "example"}, {"provider": "demo", "id": "demo-b"}])
    assert result.status_code == 200
    chat = result.json()
    assert any(response["error"] for response in chat["turns"][0]["responses"])
    assert client.post(f"/api/chats/{chat['id']}/vote", json={"choice": "a"}).status_code == 400


def test_history_and_keys_are_separate(clients):
    client, _ = clients
    chat = prompt(client, mode="direct", keys={"openai": "SENTINEL-KEY"}).json()
    followup = prompt(client, chat_id=chat["id"], prompt="Give an example").json()
    assert len(followup["turns"]) == 2
    assert client.get(f"/api/chats/{chat['id']}").json()["turns"] == followup["turns"]
    assert b"SENTINEL-KEY" not in main.DB.read_bytes()


def test_session_credentials_are_private_ephemeral_and_used(clients, monkeypatch):
    client, stranger = clients
    secret = "SESSION-TEST-SECRET"
    saved = client.post("/api/credentials", json={"provider": "openai", "key": secret})
    assert saved.status_code == 200
    assert saved.json() == {"configured": ["openai"]}
    assert stranger.get("/api/credentials").json() == {"configured": []}
    calls = []
    async def answer(model, messages, key, agent, budget):
        calls.append(key)
        return {"text": "Test response", "error": False}
    monkeypatch.setattr(main, "answer", answer)
    result = prompt(client, mode="direct", models=[{"provider": "openai", "id": "test-model"}])
    assert result.status_code == 200
    assert calls == [secret]
    assert secret not in result.text
    assert secret.encode() not in main.DB.read_bytes()
    client.post("/api/credentials", json={"provider": "openai", "key": ""})
    assert client.get("/api/credentials").json() == {"configured": []}
    client.post("/api/credentials", json={"provider": "openai", "key": secret})
    client.post("/api/logout")
    assert client.get("/api/credentials").json() == {"configured": []}
    assert not main.session_credentials


def test_credentials_expire_and_invalid_provider_is_rejected(clients):
    client, _ = clients
    assert client.post("/api/credentials", json={"provider": "untrusted", "key": "test"}).status_code == 422
    client.post("/api/credentials", json={"provider": "xai", "key": "test"})
    for value in main.session_credentials.values():
        value["expires"] = 0
    assert client.get("/api/credentials").json() == {"configured": []}


def test_agent_artifact_and_validation(clients):
    client, _ = clients
    data = prompt(client, mode="agent").json()
    assert "<!doctype html>" in data["turns"][0]["responses"][0]["html"]
    assert prompt(client, models=[{"provider": "demo", "id": "same"}]*2).status_code == 400
    assert prompt(client, prompt="x"*12001).status_code == 422


def test_paid_requests_cannot_exceed_estimated_budget(clients, monkeypatch):
    client, _ = clients
    calls = []
    async def completion(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="A real response"))])
    monkeypatch.setitem(sys.modules, "litellm", SimpleNamespace(
        acompletion=completion, token_counter=lambda **kwargs: 100,
        cost_per_token=lambda **kwargs: (.8, .2)))
    body = {"mode": "direct", "models": [{"provider":"openai", "id":"test-model"}], "keys":{"openai":"SENTINEL-KEY"}}
    chat = prompt(client, **body).json()
    assert not chat["turns"][0]["responses"][0]["error"]
    second = prompt(client, chat_id=chat["id"], **body).json()
    assert second["turns"][-1]["responses"][0]["error"]
    assert len(calls) == 1
    assert b"SENTINEL-KEY" not in main.DB.read_bytes()


def test_overview_filters_categories_and_preserves_blind_models(clients):
    client, stranger = clients
    battle = prompt(client).json()
    prompt(client, mode="agent")
    overview = client.get("/api/leaderboard/overview").json()
    assert overview["total_sessions"] == 2
    assert overview["rankings"] == []
    blind = next(row for row in overview["recent"] if row["id"] == battle["id"])
    assert blind["models"][0] == {"provider": "hidden", "id": "Model A"}
    assert stranger.get("/api/leaderboard/overview").json()["total_sessions"] == 0
    client.post(f"/api/chats/{battle['id']}/vote", json={"choice": "tie"})
    text = client.get("/api/leaderboard/overview?category=text").json()
    assert text["category_sessions"] == 1
    assert text["total_votes"] == 1
    assert len(text["rankings"]) == 2
    assert all(row["ties"] == 1 for row in text["rankings"])
    webdev = client.get("/api/leaderboard/overview?category=webdev").json()
    assert webdev["category_sessions"] == 1
    assert webdev["rankings"] == []
    image = client.get("/api/leaderboard/overview?category=text-to-image").json()
    assert not image["supported"]
    assert image["category_sessions"] == 0
    assert client.get("/api/leaderboard/overview?category=unknown").status_code == 400
