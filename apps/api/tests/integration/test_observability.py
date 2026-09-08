import logging

from fastapi.testclient import TestClient

REQUEST_ID = "X-Request-ID"


def test_every_response_carries_a_generated_request_id(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert len(response.headers[REQUEST_ID]) == 32


def test_a_client_request_id_is_echoed_and_logged(client: TestClient, caplog) -> None:
    with caplog.at_level(logging.INFO):
        response = client.get("/actions", headers={REQUEST_ID: "req-123"})

    assert response.headers[REQUEST_ID] == "req-123"
    access = [record for record in caplog.records if record.name == "api.access"]
    assert access, "the access log did not fire"
    last = access[-1]
    assert last.request_id == "req-123"
    assert last.method == "GET"
    assert last.path == "/actions"
    assert last.status_code == 200
    assert last.duration_ms >= 0


def test_an_oversized_request_id_is_replaced(client: TestClient) -> None:
    response = client.get("/health", headers={REQUEST_ID: "x" * 500})

    assert response.headers[REQUEST_ID] != "x" * 500
    assert len(response.headers[REQUEST_ID]) == 32


def test_domain_events_are_logged_under_the_request_id(client: TestClient, caplog) -> None:
    body = {
        "type": "deployment_review",
        "title": "Deploy",
        "description": "d",
        "requester": "r",
        "payload": {"service": "billing", "version": "1.0.0", "environment": "staging"},
    }
    with caplog.at_level(logging.INFO):
        response = client.post(
            "/actions", json=body, headers={"Idempotency-Key": "obs-1", REQUEST_ID: "req-create"}
        )

    assert response.status_code == 201
    events = [record for record in caplog.records if record.name == "api.actions"]
    assert len(events) == 1
    assert events[0].request_id == "req-create"
    assert events[0].action_id == response.json()["id"]
    assert events[0].action_type == "deployment_review"
