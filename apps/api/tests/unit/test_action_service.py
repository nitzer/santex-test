import io

import pytest
from fastapi import HTTPException, UploadFile
from pydantic import ValidationError
from sqlmodel import Session

from api.handlers.expense_approval import ExpenseApprovalCreate
from api.models import ActionStatus, ActionType
from api.repositories.action_repository import ActionRepository
from api.schemas import ActionCreate
from api.services.action_service import ActionService

CREATE_BODY = {
    "type": ActionType.EXPENSE_APPROVAL,
    "title": "Gasto nuevo",
    "description": "Taxi al aeropuerto",
    "requester": "ana@ops.example",
    "payload": {"amount": 42.5, "currency": "ARS", "receipt_url": "https://x/y.pdf"},
}

EXPENSE_PAYLOAD = {"amount": 10.0, "currency": "USD", "receipt_url": "https://x/y.pdf"}
VALID_BODY = {"approved": True, "comment": "ok"}


@pytest.fixture(name="service")
def service_fixture(session: Session) -> ActionService:
    return ActionService(ActionRepository(session))


def test_complete_with_json_moves_pending_to_completed(service, session, make_action):
    action = ActionRepository(session).save(
        make_action(ActionType.EXPENSE_APPROVAL, EXPENSE_PAYLOAD)
    )

    completed = service.complete_with_json(action.id, VALID_BODY)

    assert completed.status is ActionStatus.COMPLETED
    assert completed.completed_at is not None
    assert completed.result == VALID_BODY


def test_complete_on_an_already_completed_action_raises_409(service, session, make_action):
    action = ActionRepository(session).save(
        make_action(ActionType.EXPENSE_APPROVAL, EXPENSE_PAYLOAD)
    )
    service.complete_with_json(action.id, VALID_BODY)

    with pytest.raises(HTTPException) as exc:
        service.complete_with_json(action.id, VALID_BODY)

    assert exc.value.status_code == 409


def test_complete_with_json_on_a_file_action_raises_400(service, session, make_action):
    action = ActionRepository(session).save(
        make_action(ActionType.DOCUMENTATION_UPLOAD, {"document_name": "x.md"})
    )

    with pytest.raises(HTTPException) as exc:
        service.complete_with_json(action.id, VALID_BODY)

    assert exc.value.status_code == 400
    assert action.status is ActionStatus.PENDING


def test_complete_with_file_on_a_json_action_raises_400(service, session, make_action):
    action = ActionRepository(session).save(
        make_action(ActionType.ONBOARDING, {"employee_name": "S", "checklist": ["mail"]})
    )
    upload = UploadFile(filename="x.txt", file=io.BytesIO(b"x"))

    with pytest.raises(HTTPException) as exc:
        service.complete_with_file(action.id, upload)

    assert exc.value.status_code == 400
    assert action.status is ActionStatus.PENDING


def test_complete_with_file_stores_the_result(service, session, make_action, uploads_dir):
    action = ActionRepository(session).save(
        make_action(ActionType.DOCUMENTATION_UPLOAD, {"document_name": "runbook.md"})
    )
    upload = UploadFile(filename="runbook.md", file=io.BytesIO(b"# runbook\n"))

    completed = service.complete_with_file(action.id, upload)

    assert completed.status is ActionStatus.COMPLETED
    assert completed.result["size"] == 10
    assert (uploads_dir / f"{action.id}_runbook.md").exists()


def test_invalid_payload_raises_422_and_leaves_the_action_pending(service, session, make_action):
    action = ActionRepository(session).save(
        make_action(ActionType.EXPENSE_APPROVAL, EXPENSE_PAYLOAD)
    )

    with pytest.raises(HTTPException) as exc:
        service.complete_with_json(action.id, {"approved": True})

    assert exc.value.status_code == 422
    assert action.status is ActionStatus.PENDING


def test_unknown_action_raises_404(service):
    with pytest.raises(HTTPException) as exc:
        service.get_action("does-not-exist")

    assert exc.value.status_code == 404


def test_list_actions_filters(service, session, make_action):
    repo = ActionRepository(session)
    repo.save(make_action(ActionType.EXPENSE_APPROVAL, EXPENSE_PAYLOAD))
    repo.save(make_action(ActionType.ONBOARDING, {"employee_name": "S", "checklist": []}))

    assert len(service.list_actions()) == 2
    assert len(service.list_actions(type=ActionType.ONBOARDING)) == 1
    assert len(service.list_actions(status=ActionStatus.COMPLETED)) == 0


def test_create_action_persists_it_as_pending(service):
    created = service.create_action(ActionCreate.model_validate(CREATE_BODY))

    assert created.id
    assert created.status is ActionStatus.PENDING
    assert created.completed_at is None
    assert created.result is None
    assert created.title == "Gasto nuevo"
    assert created.payload == CREATE_BODY["payload"]
    assert service.get_action(created.id).id == created.id


def test_create_action_normalizes_the_payload_through_the_creation_model(service):
    body = CREATE_BODY | {"payload": {**CREATE_BODY["payload"], "amount": "42.5"}}

    created = service.create_action(ActionCreate.model_validate(body))

    assert created.payload["amount"] == 42.5


@pytest.mark.parametrize(
    "payload",
    [
        {"amount": -1, "currency": "ARS", "receipt_url": "https://x/y.pdf"},
        {"currency": "ARS"},
        {},
    ],
)
def test_a_payload_matching_no_creation_model_is_rejected_while_parsing(payload):
    """The request union rejects it before the service — FastAPI maps this to 422."""
    with pytest.raises(ValidationError):
        ActionCreate.model_validate(CREATE_BODY | {"payload": payload})


def test_create_action_rejects_a_payload_belonging_to_another_type_with_422(service):
    """The union may pick OnboardingCreate; the declared type stays authoritative."""
    body = {
        **CREATE_BODY,
        "type": ActionType.ONBOARDING,
        "payload": CREATE_BODY["payload"],
    }
    parsed = ActionCreate.model_validate(body)
    assert isinstance(parsed.payload, ExpenseApprovalCreate)

    with pytest.raises(HTTPException) as exc:
        service.create_action(parsed)

    assert exc.value.status_code == 422
    assert service.list_actions() == []


def test_create_action_accepts_a_payload_that_matches_its_declared_type(service):
    body = {
        **CREATE_BODY,
        "type": ActionType.ONBOARDING,
        "payload": {"employee_name": "Sofia", "checklist": ["mail"]},
    }

    created = service.create_action(ActionCreate.model_validate(body))

    assert created.type is ActionType.ONBOARDING
    assert created.payload == {"employee_name": "Sofia", "checklist": ["mail"]}


def test_create_action_with_an_unregistered_type_raises_400(service, monkeypatch):
    from api.handlers import base

    monkeypatch.delitem(base._REGISTRY, ActionType.EXPENSE_APPROVAL)

    with pytest.raises(HTTPException) as exc:
        service.create_action(ActionCreate.model_validate(CREATE_BODY))

    assert exc.value.status_code == 400


def test_a_created_action_can_then_be_completed(service):
    created = service.create_action(ActionCreate.model_validate(CREATE_BODY))

    completed = service.complete_with_json(created.id, {"approved": True, "comment": "ok"})

    assert completed.status is ActionStatus.COMPLETED
    assert completed.result == {"approved": True, "comment": "ok"}
