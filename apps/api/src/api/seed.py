from typing import Any

from sqlmodel import Session

from api.models import ActionType
from api.repositories.action_repository import ActionRepository
from api.schemas import ActionCreate
from api.services.action_service import ActionService

SEED_ACTIONS: list[dict[str, Any]] = [
    {
        "type": ActionType.EXPENSE_APPROVAL,
        "title": "Approve client trip expense",
        "description": "Flight and hotel for the on-site visit to Acme Corp.",
        "requester": "lucia.mendez@ops.example",
        "payload": {
            "amount": 1240.50,
            "currency": "USD",
            "receipt_url": "https://receipts.example/invoices/inv-8842.pdf",
        },
    },
    {
        "type": ActionType.DEPLOYMENT_REVIEW,
        "title": "Review checkout-api deployment to production",
        "description": "Release with the new payment retry flow.",
        "requester": "ci-bot@ops.example",
        "payload": {
            "service": "checkout-api",
            "version": "2.14.0",
            "environment": "production",
        },
    },
    {
        "type": ActionType.DOCUMENTATION_UPLOAD,
        "title": "Upload the incident runbook",
        "description": "The updated platform on-call runbook is missing.",
        "requester": "martin.rios@ops.example",
        "payload": {"document_name": "platform-oncall-runbook.md"},
    },
    {
        "type": ActionType.ONBOARDING,
        "title": "Onboard Sofia Cabrera",
        "description": "Starts Monday; complete the access checklist.",
        "requester": "people@ops.example",
        "payload": {
            "employee_name": "Sofia Cabrera",
            "checklist": [
                "Create email account",
                "Assign laptop",
                "Grant repository access",
                "Welcome session with the team",
            ],
        },
    },
]


def seed(session: Session) -> int:
    """Insert the demo actions once, through the same path as POST /actions.

    Going through the service means a seed payload that drifts from its handler's
    `creation_model` fails loudly instead of landing malformed rows in the DB.
    """
    repository = ActionRepository(session)
    if repository.get_all():
        return 0

    service = ActionService(repository)
    for data in SEED_ACTIONS:
        service.create_action(ActionCreate.model_validate(data))
    return len(SEED_ACTIONS)
