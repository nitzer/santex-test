import io

import pytest
from fastapi import UploadFile
from pydantic import BaseModel, ValidationError

from api.handlers import (
    UnknownActionTypeError,
    action_type_descriptors,
    get_handler,
    registered_action_types,
)
from api.handlers.base import _REGISTRY, JsonCompletionHandler
from api.handlers.deployment_review import DeploymentReviewCreate, DeploymentReviewHandler
from api.handlers.documentation_upload import DocumentationUploadCreate, DocumentationUploadHandler
from api.handlers.expense_approval import ExpenseApprovalCreate, ExpenseApprovalHandler
from api.handlers.onboarding import OnboardingCreate, OnboardingHandler
from api.models import ActionType


def test_registry_has_exactly_one_handler_per_action_type():
    """Safety net: a new ActionType without its handler module fails here."""
    assert registered_action_types() == frozenset(ActionType)


def test_every_handler_declares_its_creation_contract():
    for action_type, handler_cls in _REGISTRY.items():
        assert isinstance(handler_cls.label, str) and handler_cls.label, action_type
        assert issubclass(handler_cls.creation_model, BaseModel), action_type
        if issubclass(handler_cls, JsonCompletionHandler):
            assert issubclass(handler_cls.payload_model, BaseModel), action_type


def test_register_rejects_a_handler_without_a_creation_model():
    from api.handlers.base import register

    with pytest.raises(TypeError, match="creation_model"):

        @register(ActionType.EXPENSE_APPROVAL)
        class Incomplete(JsonCompletionHandler):
            label = "x"
            payload_model = ExpenseApprovalCreate

            def complete(self, action, payload):
                return {}


def test_action_type_descriptors_cover_every_type():
    descriptors = action_type_descriptors()

    assert {d["type"] for d in descriptors} == set(ActionType)
    by_type = {d["type"]: d for d in descriptors}
    assert by_type[ActionType.DOCUMENTATION_UPLOAD]["completion"] == "file"
    assert by_type[ActionType.EXPENSE_APPROVAL]["completion"] == "json"
    assert by_type[ActionType.EXPENSE_APPROVAL]["label"] == "Approve expense"
    for descriptor in descriptors:
        assert descriptor["payload_schema"]["properties"]


@pytest.mark.parametrize(
    ("model", "payload"),
    [
        (
            ExpenseApprovalCreate,
            {"amount": 10.5, "currency": "USD", "receipt_url": "https://x/y.pdf"},
        ),
        (DeploymentReviewCreate, {"service": "api", "version": "1.0.0", "environment": "prod"}),
        (DocumentationUploadCreate, {"document_name": "runbook.md"}),
        (OnboardingCreate, {"employee_name": "Sofia", "checklist": ["mail"]}),
    ],
)
def test_creation_models_accept_a_valid_payload(model, payload):
    assert model.model_validate(payload).model_dump() == payload


@pytest.mark.parametrize(
    ("model", "payload"),
    [
        (ExpenseApprovalCreate, {"amount": -5, "currency": "USD", "receipt_url": "u"}),
        (ExpenseApprovalCreate, {"amount": 5, "currency": "usd", "receipt_url": "u"}),
        (ExpenseApprovalCreate, {"amount": 5, "currency": "DOLLARS", "receipt_url": "u"}),
        (ExpenseApprovalCreate, {"amount": 5, "currency": "USD"}),
        (DeploymentReviewCreate, {"service": "api", "version": "1.0.0"}),
        (DocumentationUploadCreate, {}),
        (OnboardingCreate, {"employee_name": "Sofia", "checklist": []}),
    ],
)
def test_creation_models_reject_an_invalid_payload(model, payload):
    with pytest.raises(ValidationError):
        model.model_validate(payload)


def test_get_handler_resolves_the_registered_type():
    for action_type in ActionType:
        assert get_handler(action_type).action_type is action_type


def test_get_handler_raises_a_domain_error_for_an_unregistered_type(monkeypatch):
    from api.handlers import base

    monkeypatch.delitem(base._REGISTRY, ActionType.ONBOARDING)

    with pytest.raises(UnknownActionTypeError):
        get_handler(ActionType.ONBOARDING)


def test_expense_approval_handler_returns_result(make_action):
    action = make_action(
        ActionType.EXPENSE_APPROVAL,
        {"amount": 100.0, "currency": "USD", "receipt_url": "https://x/y.pdf"},
    )

    result = ExpenseApprovalHandler().complete(action, {"approved": True, "comment": "ok"})

    assert result == {"approved": True, "comment": "ok"}


def test_expense_approval_handler_rejects_invalid_payload(make_action):
    action = make_action(ActionType.EXPENSE_APPROVAL)

    with pytest.raises(ValidationError):
        ExpenseApprovalHandler().complete(action, {"approved": True})


def test_deployment_review_handler_returns_result(make_action):
    action = make_action(
        ActionType.DEPLOYMENT_REVIEW,
        {"service": "checkout-api", "version": "2.14.0", "environment": "production"},
    )

    result = DeploymentReviewHandler().complete(action, {"approved": False, "notes": "rollback"})

    assert result == {"approved": False, "notes": "rollback"}


def test_onboarding_handler_returns_completed_steps(make_action):
    action = make_action(
        ActionType.ONBOARDING,
        {"employee_name": "Sofia", "checklist": ["mail", "laptop"]},
    )

    result = OnboardingHandler().complete(action, {"completed_steps": ["mail", "laptop"]})

    assert result == {"completed_steps": ["mail", "laptop"]}


def test_onboarding_handler_rejects_steps_outside_the_checklist(make_action):
    action = make_action(ActionType.ONBOARDING, {"employee_name": "Sofia", "checklist": ["mail"]})

    with pytest.raises(ValueError, match="not in checklist"):
        OnboardingHandler().complete(action, {"completed_steps": ["badge"]})


def test_documentation_upload_handler_stores_the_file(make_action, tmp_path):
    action = make_action(ActionType.DOCUMENTATION_UPLOAD, {"document_name": "runbook.md"})
    upload = UploadFile(
        filename="runbook.md",
        file=io.BytesIO(b"# runbook\n"),
        headers={"content-type": "text/markdown"},
    )

    result = DocumentationUploadHandler(upload_dir=tmp_path).complete(action, upload)

    assert (tmp_path / f"{action.id}_runbook.md").read_bytes() == b"# runbook\n"
    assert result["filename"] == "runbook.md"
    assert result["size"] == 10
    assert result["content_type"] == "text/markdown"
    assert result["path"].endswith(f"{action.id}_runbook.md")


def test_documentation_upload_handler_strips_directories_from_the_filename(make_action, tmp_path):
    action = make_action(ActionType.DOCUMENTATION_UPLOAD, {"document_name": "x"})
    upload = UploadFile(filename="../../etc/passwd", file=io.BytesIO(b"x"))

    result = DocumentationUploadHandler(upload_dir=tmp_path).complete(action, upload)

    assert result["filename"] == "passwd"
    assert (tmp_path / f"{action.id}_passwd").exists()


def test_documentation_upload_handler_reads_the_configured_uploads_dir(
    make_action, uploads_dir
):
    action = make_action(ActionType.DOCUMENTATION_UPLOAD, {"document_name": "x"})
    upload = UploadFile(filename="notes.txt", file=io.BytesIO(b"hi"))

    DocumentationUploadHandler().complete(action, upload)

    assert (uploads_dir / f"{action.id}_notes.txt").read_bytes() == b"hi"
