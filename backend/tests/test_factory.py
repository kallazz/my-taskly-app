from unittest.mock import patch

from fastapi.testclient import TestClient

from app.factory import create_app


def test_creates_the_api_with_resolved_database_url_and_all_routes():
    with patch("app.factory.resolve_database_url", return_value="sqlite://") as resolve:
        app = create_app("postgresql+psycopg://explicit/db")
    resolve.assert_called_once_with("postgresql+psycopg://explicit/db")
    assert app.title == "Taskly API"
    assert app.state.database_url == "sqlite://"
    paths = {path: set(operations) for path, operations in app.openapi()["paths"].items()}
    assert paths == {
        "/api/health": {"get"},
        "/api/todos": {"get", "post"},
        "/api/todos/stats": {"get"},
        "/api/todos/{todo_id}": {"get", "patch", "delete"},
    }


def test_startup_runs_the_database_lifespan():
    with (
        patch("app.factory.resolve_database_url", return_value="sqlite://"),
        patch("app.core.lifespan.create_database_engine") as create_engine,
        patch("app.core.lifespan.initialize") as initialize,
        patch("app.core.lifespan.create_session_factory") as create_session_factory,
    ):
        app = create_app()
        with TestClient(app):
            create_engine.assert_called_once_with("sqlite://")
            initialize.assert_called_once_with(create_engine.return_value)
            assert app.state.session_factory is create_session_factory.return_value
        create_engine.return_value.dispose.assert_called_once_with()
