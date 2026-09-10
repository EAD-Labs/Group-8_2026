"""
Test fixtures.

Every test gets a fresh SQLite file and a fresh client. Sharing a database
between tests would let badge counts, point totals and the comparative report
leak across cases — and those are cumulative by design, so the leak would show
up as tests that pass alone and fail in sequence.

`llm_mode` stays at its default `mock` throughout: the acceptance criteria must
hold with zero API keys, which is also the only way they can run in CI.
"""
import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


@pytest.fixture(autouse=True)
def _protect_content_file():
    """
    `mark_pair_reviewed` and `mark_content_reviewed` write back to
    content/modules.json by design — that is how a TA's review persists and stays
    visible to whoever edits the file directly (PROJECT.md §5). In a test that
    means real pilot content gets mutated, so the file is snapshotted and restored
    around every test, and the loader cache is cleared so nothing carries over.
    """
    from app.content import loader

    original = loader._CONTENT_PATH.read_bytes()
    loader.load_content.cache_clear()
    yield
    loader._CONTENT_PATH.write_bytes(original)
    loader.load_content.cache_clear()


@pytest.fixture(autouse=True)
def _fast_streaming():
    """
    Drop the SSE inter-turn delay for tests. The 0.6s pacing is a presentation
    choice (see config.sse_turn_delay_seconds); paying it in the suite would add
    ~4s per streamed lesson and test nothing.
    """
    from app.config import settings

    original = settings.sse_turn_delay_seconds
    settings.sse_turn_delay_seconds = 0.0
    yield
    settings.sse_turn_delay_seconds = original


@pytest.fixture(autouse=True)
def _reset_sse_app_status():
    """
    `sse_starlette` keeps a module-global `AppStatus.should_exit_event` and binds
    it to whichever event loop first touches it. `TestClient` runs each request
    on a fresh loop, so the second SSE request in a process raises "bound to a
    different event loop" — which is a test-harness artefact, not a bug in the
    endpoint (uvicorn serves every request on one loop). Clearing it before each
    test lets it re-bind.
    """
    from sse_starlette.sse import AppStatus

    AppStatus.should_exit_event = None
    yield
    AppStatus.should_exit_event = None


@pytest.fixture
def db_path():
    fd, path = tempfile.mkstemp(suffix=".db", prefix="aikyro_test_")
    os.close(fd)
    yield path
    Path(path).unlink(missing_ok=True)


@pytest.fixture
def app_and_session(db_path):
    from app.database import Base, get_db
    from app.main import app

    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield app, TestingSession
    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture
def client(app_and_session):
    app, _ = app_and_session
    with TestClient(app) as c:
        yield c


@pytest.fixture
def session_factory(app_and_session):
    """Direct DB access, for asserting on rows the API doesn't expose."""
    _, factory = app_and_session
    return factory


class Learner:
    """A signed-up learner with their token applied to every request."""

    def __init__(self, client: TestClient, name: str, email: str, password: str = "pw-for-tests"):
        self.client = client
        signup = client.post(
            "/auth/signup", json={"name": name, "email": email, "password": password}
        )
        assert signup.status_code == 200, signup.text
        self.user = signup.json()
        token = client.post(
            "/auth/login", data={"username": email, "password": password}
        ).json()["access_token"]
        self.token = token
        self.headers = {"Authorization": f"Bearer {token}"}

    @property
    def id(self) -> str:
        return self.user["id"]

    @property
    def condition_map(self) -> dict:
        return self.user["pilot_condition_map"] or {}

    def concept_for(self, condition: str) -> str:
        """
        The concept this learner was assigned to a given arm.

        Tests must not hardcode a concept id: which concept lands in which arm is
        derived from the learner's own id by the counterbalanced assignment, so a
        hardcoded id would pass or fail depending on the random UUID.
        """
        for concept_id, arm in self.condition_map.items():
            if arm == condition:
                return concept_id
        raise AssertionError(f"no concept assigned to {condition}: {self.condition_map}")

    def get(self, url, **kw):
        return self.client.get(url, headers=self.headers, **kw)

    def post(self, url, **kw):
        return self.client.post(url, headers=self.headers, **kw)

    def stream(self, url, **kw):
        return self.client.stream("GET", url, headers=self.headers, **kw)


@pytest.fixture
def learner(client):
    return Learner(client, "Test Learner", "learner@example.com")


@pytest.fixture
def other_learner(client):
    """A second learner, for the ownership tests (D3)."""
    return Learner(client, "Other Learner", "other@example.com")


@pytest.fixture
def platform_session(learner):
    """A started classroom session on the learner's platform-arm concept."""
    concept_id = learner.concept_for("platform")
    res = learner.post("/classroom/start", json={"concept_id": concept_id})
    assert res.status_code == 200, res.text
    return res.json()
