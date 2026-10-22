from unittest.mock import Mock

from sqlalchemy import Engine
from sqlalchemy.orm import Session

from app.core.database import create_database_engine, create_session_factory, initialize
from app.features.todos.models import Base


def test_engine_uses_the_postgresql_psycopg_driver():
    url = "postgresql+psycopg://taskly:taskly@localhost:5432/taskly"
    engine = create_database_engine(url)
    try:
        assert engine.url.drivername == "postgresql+psycopg"
        assert engine.dialect.name == "postgresql"
        assert engine.dialect.driver == "psycopg"
        assert engine.url.database == "taskly"
    finally:
        engine.dispose()


def test_session_factory_binds_sessions_to_the_engine_and_keeps_objects_after_commit():
    engine = Mock(spec=Engine)
    factory = create_session_factory(engine)
    assert factory.kw["bind"] is engine
    assert factory.kw["expire_on_commit"] is False
    assert issubclass(factory.class_, Session)


def test_initialize_creates_all_tables_on_the_engine(monkeypatch):
    create_all = Mock()
    monkeypatch.setattr(Base.metadata, "create_all", create_all)
    engine = Mock(spec=Engine)
    initialize(engine)
    create_all.assert_called_once_with(engine)
