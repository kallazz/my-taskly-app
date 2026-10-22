from unittest.mock import Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.dependencies import get_repository
from app.api.health import router


@pytest.fixture
def health_client(repository_mock):
    repository_mock.session = Mock(spec=Session)
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_repository] = lambda: repository_mock
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


def test_reports_ok_after_querying_the_database(health_client, repository_mock):
    response = health_client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    statement = repository_mock.session.execute.call_args.args[0]
    assert "FROM todos" in str(statement)
    assert "LIMIT" in str(statement)


def test_fails_when_the_database_is_unreachable(health_client, repository_mock):
    repository_mock.session.execute.side_effect = ConnectionError("Database unavailable")
    assert health_client.get("/api/health").status_code == 500
