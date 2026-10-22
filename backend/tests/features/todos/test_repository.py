from datetime import date, datetime, timezone
from unittest.mock import Mock, patch

import pytest
from sqlalchemy import func, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from app.features.todos.models import TodoRecord
from app.features.todos.repository import TodoRepository
from app.features.todos.schemas import TodoCreate, TodoUpdate

NOW = datetime(2026, 10, 2, 9, 30, tzinfo=timezone.utc)


@pytest.fixture
def frozen_now():
    with patch("app.features.todos.repository.datetime") as clock:
        clock.now.return_value = NOW
        yield clock


def assign_id_on_refresh(record):
    record.id = 8


def test_list_maps_models_and_orders_tasks_newest_first(model_factory, todo_values, todo):
    session = Mock(spec=Session)
    session.scalars.return_value = [model_factory(todo_values)]
    assert TodoRepository(session).list() == [todo]
    statement = session.scalars.call_args.args[0]
    expected = select(TodoRecord).order_by(TodoRecord.created_at.desc(), TodoRecord.id.desc())
    assert statement.compare(expected)
    compiled = str(statement.compile(dialect=postgresql.dialect()))
    assert "ORDER BY todos.created_at DESC, todos.id DESC" in compiled


def test_stats_counts_total_and_completed_tasks():
    session = Mock(spec=Session)
    session.execute.return_value.one.return_value = (5, 2)
    stats = TodoRepository(session).stats()

    statement = session.execute.call_args.args[0]
    expected = select(func.count(TodoRecord.id), func.count(TodoRecord.id).filter(TodoRecord.completed))
    assert statement.compare(expected)
    assert stats.total == 5
    assert stats.completed == 2


def test_get_returns_none_for_missing_task():
    session = Mock(spec=Session)
    session.get.return_value = None
    assert TodoRepository(session).get(404) is None
    session.get.assert_called_once_with(TodoRecord, 404)


def test_get_maps_an_existing_task(model_factory, todo_values, todo):
    session = Mock(spec=Session)
    session.get.return_value = model_factory(todo_values)
    assert TodoRepository(session).get(7) == todo
    session.get.assert_called_once_with(TodoRecord, 7)


def test_create_persists_the_payload_with_timestamps(frozen_now):
    session = Mock(spec=Session)
    session.refresh.side_effect = assign_id_on_refresh
    payload = TodoCreate(title="Write tests", description="Cover the repository", priority="low",
                         due_date="2026-10-20", completed=False)
    created = TodoRepository(session).create(payload)

    record = session.add.call_args.args[0]
    assert isinstance(record, TodoRecord)
    assert (record.title, record.description, record.priority, record.due_date, record.completed) == (
        "Write tests", "Cover the repository", "low", date(2026, 10, 20), False,
    )
    assert record.created_at == record.updated_at == NOW
    session.commit.assert_called_once_with()
    session.refresh.assert_called_once_with(record)
    assert created.id == 8
    assert created.title == "Write tests"
    assert created.created_at == NOW


def test_update_returns_none_without_committing_for_a_missing_task():
    session = Mock(spec=Session)
    session.get.return_value = None
    assert TodoRepository(session).update(404, TodoUpdate(title="Renamed")) is None
    session.commit.assert_not_called()


def test_update_changes_only_the_fields_sent_and_bumps_updated_at(frozen_now, model_factory, todo_values):
    session = Mock(spec=Session)
    record = model_factory({**todo_values, "due_date": date(2026, 10, 15)})
    session.get.return_value = record
    updated = TodoRepository(session).update(7, TodoUpdate(completed=True, due_date=None))

    session.get.assert_called_once_with(TodoRecord, 7)
    assert record.completed is True
    assert record.due_date is None
    assert record.title == todo_values["title"]
    assert record.description == todo_values["description"]
    assert record.created_at == todo_values["created_at"]
    assert record.updated_at == NOW
    session.commit.assert_called_once_with()
    session.refresh.assert_called_once_with(record)
    assert updated.completed is True
    assert updated.due_date is None
    assert updated.updated_at == NOW


def test_delete_returns_false_without_committing_for_a_missing_task():
    session = Mock(spec=Session)
    session.get.return_value = None
    assert TodoRepository(session).delete(404) is False
    session.delete.assert_not_called()
    session.commit.assert_not_called()


def test_delete_removes_an_existing_task(model_factory, todo_values):
    session = Mock(spec=Session)
    record = model_factory(todo_values)
    session.get.return_value = record
    assert TodoRepository(session).delete(7) is True
    session.get.assert_called_once_with(TodoRecord, 7)
    session.delete.assert_called_once_with(record)
    session.commit.assert_called_once_with()
