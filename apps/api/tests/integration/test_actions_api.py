from fastapi.testclient import TestClient

from api.models import ActionType


def test_list_returns_one_pending_action_per_type(client: TestClient):
    actions = client.get("/actions").json()

    assert len(actions) == 4
    assert {a["type"] for a in actions} == {t.value for t in ActionType}
    assert all(a["status"] == "pending" for a in actions)


def test_list_filters_by_type(client: TestClient):
    actions = client.get("/actions", params={"type": "onboarding"}).json()

    assert [a["type"] for a in actions] == ["onboarding"]
    assert actions[0]["payload"]["employee_name"]


def test_list_filters_by_status(client: TestClient, action_id_of):
    action_id = action_id_of(ActionType.EXPENSE_APPROVAL)
    client.post(
        f"/actions/{action_id}/complete",
        json={"approved": True, "comment": "ok"},
        headers={"Idempotency-Key": "k"},
    )

    pending = client.get("/actions", params={"status": "pending"}).json()
    completed = client.get("/actions", params={"status": "completed"}).json()

    assert len(pending) == 3
    assert [a["id"] for a in completed] == [action_id]


def test_list_rejects_an_unknown_type(client: TestClient):
    assert client.get("/actions", params={"type": "nope"}).status_code == 422


def test_get_by_id_returns_the_detail(client: TestClient, action_id_of):
    action_id = action_id_of(ActionType.DEPLOYMENT_REVIEW)

    action = client.get(f"/actions/{action_id}").json()

    assert action["id"] == action_id
    assert action["payload"]["service"] == "checkout-api"
    assert action["result"] is None
    assert action["completed_at"] is None


def test_get_unknown_action_returns_404(client: TestClient):
    assert client.get("/actions/does-not-exist").status_code == 404


CREATE_BODY = {
    "type": "expense_approval",
    "title": "Gasto nuevo",
    "description": "Taxi al aeropuerto",
    "requester": "ana@ops.example",
    "payload": {"amount": 42.5, "currency": "ARS", "receipt_url": "https://x/y.pdf"},
}


def test_action_types_lists_every_registered_type(client: TestClient):
    response = client.get("/action-types")

    assert response.status_code == 200
    descriptors = response.json()
    assert len(descriptors) == 4
    assert {d["type"] for d in descriptors} == {t.value for t in ActionType}
    for descriptor in descriptors:
        assert descriptor["label"]
        assert descriptor["completion"] in {"json", "file"}
        assert descriptor["payload_schema"]["properties"]


def test_action_types_describes_the_upload_type_as_file(client: TestClient):
    by_type = {d["type"]: d for d in client.get("/action-types").json()}

    assert by_type["documentation_upload"]["completion"] == "file"
    assert set(by_type["documentation_upload"]["payload_schema"]["properties"]) == {
        "document_name"
    }
    assert set(by_type["onboarding"]["payload_schema"]["properties"]) == {
        "employee_name",
        "checklist",
    }


def test_action_types_does_not_collide_with_the_action_detail_route(client: TestClient):
    # /action-types must not be swallowed by /actions/{action_id}
    assert client.get("/action-types").status_code == 200
    assert client.get("/actions/action-types").status_code == 404


def test_create_action_returns_201_and_shows_up_in_the_list(client: TestClient):
    response = client.post("/actions", json=CREATE_BODY, headers={"Idempotency-Key": "new-1"})

    assert response.status_code == 201
    created = response.json()
    assert created["status"] == "pending"
    assert created["result"] is None
    assert created["completed_at"] is None
    assert created["payload"] == CREATE_BODY["payload"]

    listed = client.get("/actions").json()
    assert len(listed) == 5
    assert created["id"] in {a["id"] for a in listed}
    assert client.get(f"/actions/{created['id']}").json() == created


def test_create_action_rejects_an_invalid_payload_with_422(client: TestClient):
    body = CREATE_BODY | {"payload": {**CREATE_BODY["payload"], "amount": -1}}

    response = client.post("/actions", json=body, headers={"Idempotency-Key": "bad-1"})

    assert response.status_code == 422
    assert len(client.get("/actions").json()) == 4


def test_create_action_without_idempotency_key_returns_400(client: TestClient):
    response = client.post("/actions", json=CREATE_BODY)

    assert response.status_code == 400
    assert len(client.get("/actions").json()) == 4


def test_create_action_with_an_unknown_type_returns_422(client: TestClient):
    body = CREATE_BODY | {"type": "nope"}

    response = client.post("/actions", json=body, headers={"Idempotency-Key": "bad-2"})

    assert response.status_code == 422


def test_created_action_can_be_completed(client: TestClient):
    created = client.post(
        "/actions", json=CREATE_BODY, headers={"Idempotency-Key": "new-2"}
    ).json()

    response = client.post(
        f"/actions/{created['id']}/complete",
        json={"approved": True, "comment": "ok"},
        headers={"Idempotency-Key": "done-1"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "completed"


def test_create_with_a_payload_of_another_type_returns_422(client: TestClient):
    """type=onboarding with an expense_approval payload: the declared type wins."""
    body = CREATE_BODY | {"type": "onboarding"}

    response = client.post("/actions", json=body, headers={"Idempotency-Key": "mismatch-1"})

    assert response.status_code == 422
    assert len(client.get("/actions").json()) == 4


def test_action_types_exposes_the_openapi_component_name(client: TestClient):
    by_type = {d["type"]: d for d in client.get("/action-types").json()}

    assert by_type["expense_approval"]["schema_name"] == "ExpenseApprovalCreate"
    assert by_type["documentation_upload"]["schema_name"] == "DocumentationUploadCreate"
