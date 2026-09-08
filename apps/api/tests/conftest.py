from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from api.db import get_session
from api.main import app
from api.models import Action, ActionType
from api.seed import seed


@pytest.fixture(name="session")
def session_fixture() -> Generator[Session, None, None]:
    """In-memory DB for unit tests: no files, no HTTP."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="uploads_dir")
def uploads_dir_fixture(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Redirect UPLOADS_DIR so uploads never land in the repo."""
    path = tmp_path / "uploads"
    path.mkdir()
    monkeypatch.setenv("UPLOADS_DIR", str(path))
    return path


@pytest.fixture(name="seeded_session")
def seeded_session_fixture(tmp_path: Path) -> Generator[Session, None, None]:
    """File-backed DB, one pending action per type, for integration tests."""
    engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}",
        connect_args={"check_same_thread": False},
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        seed(session)
        yield session


@pytest.fixture(name="client")
def client_fixture(seeded_session: Session, uploads_dir: Path) -> Generator[TestClient, None, None]:
    # No lifespan: the fixtures own the schema and the seed, so the real db is never touched.
    app.dependency_overrides[get_session] = lambda: seeded_session
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture(name="action_id_of")
def action_id_of_fixture(client: TestClient):
    def resolve(action_type: ActionType) -> str:
        response = client.get("/actions", params={"type": action_type.value})
        assert response.status_code == 200
        return response.json()[0]["id"]

    return resolve


@pytest.fixture(name="make_action")
def make_action_fixture():
    """Factory of unsaved Actions for unit tests."""

    def build(action_type: ActionType, payload: dict | None = None, **overrides) -> Action:
        return Action(
            type=action_type,
            title="t",
            description="d",
            requester="r",
            payload=payload or {},
            **overrides,
        )

    return build
