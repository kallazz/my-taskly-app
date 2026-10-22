from unittest.mock import patch

import pytest

from app.core.config import resolve_database_url

POSTGRES_ENV = {
    "POSTGRES_USER": "taskly",
    "POSTGRES_PASSWORD": "p@ss/word",
    "POSTGRES_HOST": "db.internal",
    "DB_PORT": "6543",
    "POSTGRES_DB": "tasks",
}


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch):
    # Keep a developer's .env and shell variables out of the tests.
    for name in ["DATABASE_URL", *POSTGRES_ENV]:
        monkeypatch.delenv(name, raising=False)
    with patch("app.core.config.load_dotenv") as load_dotenv:
        yield load_dotenv


def test_explicit_url_takes_precedence_over_the_environment(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://env/db")
    assert resolve_database_url("sqlite://") == "sqlite://"


def test_uses_database_url_from_the_environment(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://env/db")
    assert resolve_database_url() == "postgresql+psycopg://env/db"


def test_builds_the_url_from_postgres_variables_and_escapes_the_password(monkeypatch):
    for name, value in POSTGRES_ENV.items():
        monkeypatch.setenv(name, value)
    assert resolve_database_url() == "postgresql+psycopg://taskly:p%40ss%2Fword@db.internal:6543/tasks"


def test_missing_postgres_variables_raise_key_error(monkeypatch):
    for name, value in POSTGRES_ENV.items():
        if name != "POSTGRES_HOST":
            monkeypatch.setenv(name, value)
    with pytest.raises(KeyError, match="POSTGRES_HOST"):
        resolve_database_url()


def test_loads_the_repository_env_file_without_overriding_the_environment(isolated_env):
    resolve_database_url("sqlite://")
    path = isolated_env.call_args.args[0]
    assert path.name == ".env"
    assert (path.parent / "backend" / "app").is_dir()
    assert isolated_env.call_args.kwargs == {"override": False}
