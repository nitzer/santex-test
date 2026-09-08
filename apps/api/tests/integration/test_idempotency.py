import io

from fastapi.testclient import TestClient

from api.models import ActionType

VALID_EXPENSE_BODY = {"approved": True, "comment": "aprobado"}


def test_same_key_replays_the_stored_response(client: TestClient, action_id_of):
    action_id = action_id_of(ActionType.EXPENSE_APPROVAL)
    headers = {"Idempotency-Key": "key-1"}

    first = client.post(f"/actions/{action_id}/complete", json=VALID_EXPENSE_BODY, headers=headers)
    second = client.post(f"/actions/{action_id}/complete", json=VALID_EXPENSE_BODY, headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json()
    assert first.json()["status"] == "completed"
    assert first.json()["result"] == VALID_EXPENSE_BODY
    assert first.json()["completed_at"] == second.json()["completed_at"]


def test_new_key_on_a_completed_action_returns_409(client: TestClient, action_id_of):
    action_id = action_id_of(ActionType.EXPENSE_APPROVAL)
    client.post(
        f"/actions/{action_id}/complete",
        json=VALID_EXPENSE_BODY,
        headers={"Idempotency-Key": "key-1"},
    )

    response = client.post(
        f"/actions/{action_id}/complete",
        json=VALID_EXPENSE_BODY,
        headers={"Idempotency-Key": "key-2"},
    )

    assert response.status_code == 409


def test_missing_idempotency_key_returns_400(client: TestClient, action_id_of):
    action_id = action_id_of(ActionType.EXPENSE_APPROVAL)

    response = client.post(f"/actions/{action_id}/complete", json=VALID_EXPENSE_BODY)

    assert response.status_code == 400
    assert client.get(f"/actions/{action_id}").json()["status"] == "pending"


def test_missing_idempotency_key_on_upload_returns_400(client: TestClient, action_id_of):
    action_id = action_id_of(ActionType.DOCUMENTATION_UPLOAD)

    response = client.post(
        f"/actions/{action_id}/upload",
        files={"file": ("x.txt", io.BytesIO(b"x"), "text/plain")},
    )

    assert response.status_code == 400


def test_complete_on_a_documentation_upload_action_returns_400(client: TestClient, action_id_of):
    action_id = action_id_of(ActionType.DOCUMENTATION_UPLOAD)

    response = client.post(
        f"/actions/{action_id}/complete",
        json=VALID_EXPENSE_BODY,
        headers={"Idempotency-Key": "key-wrong-endpoint"},
    )

    assert response.status_code == 400
    assert client.get(f"/actions/{action_id}").json()["status"] == "pending"


def test_upload_on_a_json_action_returns_400(client: TestClient, action_id_of):
    action_id = action_id_of(ActionType.ONBOARDING)

    response = client.post(
        f"/actions/{action_id}/upload",
        files={"file": ("x.txt", io.BytesIO(b"x"), "text/plain")},
        headers={"Idempotency-Key": "key-wrong-endpoint-2"},
    )

    assert response.status_code == 400


def test_invalid_body_returns_422_and_is_not_cached(client: TestClient, action_id_of):
    action_id = action_id_of(ActionType.EXPENSE_APPROVAL)
    headers = {"Idempotency-Key": "key-retry"}

    invalid = client.post(
        f"/actions/{action_id}/complete", json={"approved": True}, headers=headers
    )
    retry = client.post(f"/actions/{action_id}/complete", json=VALID_EXPENSE_BODY, headers=headers)

    assert invalid.status_code == 422
    assert retry.status_code == 200
    assert retry.json()["result"] == VALID_EXPENSE_BODY


def test_onboarding_completes_with_steps_from_its_checklist(client: TestClient, action_id_of):
    action_id = action_id_of(ActionType.ONBOARDING)
    checklist = client.get(f"/actions/{action_id}").json()["payload"]["checklist"]

    response = client.post(
        f"/actions/{action_id}/complete",
        json={"completed_steps": checklist[:2]},
        headers={"Idempotency-Key": "onb-1"},
    )

    assert response.status_code == 200
    assert response.json()["result"] == {"completed_steps": checklist[:2]}


def test_onboarding_rejects_steps_outside_its_checklist(client: TestClient, action_id_of):
    action_id = action_id_of(ActionType.ONBOARDING)

    response = client.post(
        f"/actions/{action_id}/complete",
        json={"completed_steps": ["inexistente"]},
        headers={"Idempotency-Key": "onb-2"},
    )

    assert response.status_code == 422


CREATE_BODY = {
    "type": "deployment_review",
    "title": "Deploy nuevo",
    "description": "Release 3.0.0",
    "requester": "ci-bot@ops.example",
    "payload": {"service": "billing-api", "version": "3.0.0", "environment": "staging"},
}


def test_create_replays_the_same_action_instead_of_creating_a_second_one(client: TestClient):
    headers = {"Idempotency-Key": "create-key"}

    first = client.post("/actions", json=CREATE_BODY, headers=headers)
    second = client.post("/actions", json=CREATE_BODY, headers=headers)

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json() == second.json()
    assert first.json()["id"] == second.json()["id"]
    assert len(client.get("/actions").json()) == 5


def test_create_with_a_different_key_creates_a_second_action(client: TestClient):
    first = client.post("/actions", json=CREATE_BODY, headers={"Idempotency-Key": "c-1"})
    second = client.post("/actions", json=CREATE_BODY, headers={"Idempotency-Key": "c-2"})

    assert first.json()["id"] != second.json()["id"]
    assert len(client.get("/actions").json()) == 6


def test_a_422_on_create_is_not_cached(client: TestClient):
    headers = {"Idempotency-Key": "create-retry"}
    invalid = CREATE_BODY | {"payload": {"service": "billing-api"}}

    failed = client.post("/actions", json=invalid, headers=headers)
    retry = client.post("/actions", json=CREATE_BODY, headers=headers)

    assert failed.status_code == 422
    assert retry.status_code == 201
    assert len(client.get("/actions").json()) == 5
