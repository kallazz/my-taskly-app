---
name: write-backend-tests
description: Conventions for writing pytest unit tests for the FastAPI backend in backend/app. Use when creating or updating files under backend/tests.
---

# Write backend tests

## Layout

- Tests mirror `backend/app`: `app/features/todos/router.py` → `tests/features/todos/test_router.py`, and `app/factory.py` → `tests/test_factory.py`.
- Every test directory needs an `__init__.py` (tests are imported as the `tests` package).
- Import application code as `from app.… import …`.
- Plain `def test_…()` functions with descriptive names, no test classes. Use `@pytest.mark.parametrize` for input variations.

## Shared fixtures (`backend/tests/conftest.py`)

| Fixture | Use |
|---|---|
| `repository_mock` | `create_autospec(TodoRepository, instance=True)` from `tests/mocks.py`, interface-checked |
| `client` | `TestClient` for an app that mounts **only** the todos router, with `get_repository` overridden by `repository_mock` |
| `todo_values`, `todo` | Raw values and a `Todo` schema instance |
| `model_factory` | Builds a `TodoRecord` from values |

Reuse these fixtures. Add a new fixture to `conftest.py` only when several modules need it.

## Unit-test boundaries

These are unit tests: no database, network or real `.env`.

- **Router:** use `client` and `repository_mock`. Set `repository_mock.<method>.return_value`, assert on the status code and JSON, and assert the exact repository call (`assert_called_once_with(...)`). Invalid input (422) must not call the repository (`assert_not_called()`). Cover 404 branches.
- **Repository:** pass `Mock(spec=Session)`. Assert on the calls made on the session (`add`, `commit`, `refresh`, `delete`, `get`). Compare SQL statements with `statement.compare(expected)`.
- **Other routers, such as health:** build a `FastAPI()` app that mounts the router and override `get_repository`.
- **App factory and lifespan:** patch collaborators where they are looked up (for example `patch("app.core.lifespan.create_database_engine")`), and assert wiring and cleanup such as `engine.dispose()`, including on failure.
- **Config:** use `monkeypatch.setenv`/`delenv`. Patch `app.core.config.load_dotenv` so a developer's `.env` can't leak into the test.
- **Time:** patch `datetime` in the module under test, or assert relative properties (for example `updated_at >= created_at`). Never compare with wall-clock time.

## Quality bar

- Each test checks one behaviour, with an assertion on the observable result, not only "no exception".
- Test both branches of every condition you touch (found / not found, valid / invalid, success / exception with rollback).
- Prefer exact values over `ANY`. Use `pytest.raises(..., match=...)` for errors.
- Keep the style compact: no comments that restate the code, and no unused fixtures or imports.
