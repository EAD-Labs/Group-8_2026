"""
Migration tests.

A migration that has drifted from the models is worse than no migration: the app
boots in dev (where `create_all` still runs) and fails on the first deploy that
actually uses Alembic. These two tests catch that in CI instead.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest


def _alembic(args, db_url):
    """Run Alembic in a subprocess against a throwaway database."""
    import os

    env = dict(os.environ, DATABASE_URL=db_url)
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        capture_output=True, text=True, env=env, cwd=Path(__file__).parent.parent,
    )


@pytest.fixture
def temp_db_url():
    with tempfile.TemporaryDirectory() as d:
        yield f"sqlite:///{Path(d) / 'migration_test.db'}"


def test_migrations_apply_to_an_empty_database(temp_db_url):
    result = _alembic(["upgrade", "head"], temp_db_url)
    assert result.returncode == 0, result.stderr


def test_migrations_match_the_models(temp_db_url):
    """
    `alembic check` reports any model change that has no migration. If this fails,
    run `alembic revision --autogenerate -m "<what changed>"` and commit the result.
    """
    assert _alembic(["upgrade", "head"], temp_db_url).returncode == 0
    result = _alembic(["check"], temp_db_url)
    assert result.returncode == 0, (
        f"models have drifted from migrations:\n{result.stdout}\n{result.stderr}"
    )


def test_migrations_downgrade_cleanly(temp_db_url):
    """A baseline that cannot be rolled back is not a usable escape hatch."""
    assert _alembic(["upgrade", "head"], temp_db_url).returncode == 0
    result = _alembic(["downgrade", "base"], temp_db_url)
    assert result.returncode == 0, result.stderr
