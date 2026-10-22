import asyncio
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.core.lifespan import lifespan


@pytest.fixture
def database():
    with (
        patch("app.core.lifespan.create_database_engine") as create_engine,
        patch("app.core.lifespan.initialize") as initialize,
        patch("app.core.lifespan.create_session_factory") as create_session_factory,
    ):
        yield SimpleNamespace(
            create_engine=create_engine, initialize=initialize,
            create_session_factory=create_session_factory, engine=create_engine.return_value,
        )


@pytest.fixture
def app():
    return SimpleNamespace(state=SimpleNamespace(database_url="postgresql+psycopg://db/tasks"))


def run_lifespan(app, during=lambda: None):
    async def run():
        async with lifespan(app):
            during()

    asyncio.run(run())


def test_initializes_the_database_and_disposes_the_engine_on_shutdown(database, app):
    run_lifespan(app, during=database.engine.dispose.assert_not_called)
    database.create_engine.assert_called_once_with("postgresql+psycopg://db/tasks")
    database.initialize.assert_called_once_with(database.engine)
    database.create_session_factory.assert_called_once_with(database.engine)
    assert app.state.session_factory is database.create_session_factory.return_value
    database.engine.dispose.assert_called_once_with()


def test_disposes_the_engine_when_initialization_fails(database, app):
    database.initialize.side_effect = RuntimeError("Database unavailable")
    with pytest.raises(RuntimeError, match="Database unavailable"):
        run_lifespan(app)
    database.engine.dispose.assert_called_once_with()
    database.create_session_factory.assert_not_called()
