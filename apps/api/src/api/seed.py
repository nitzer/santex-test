from typing import Any

from sqlmodel import Session

from api.models import ActionType
from api.repositories.action_repository import ActionRepository
from api.schemas import ActionCreate
from api.services.action_service import ActionService

SEED_ACTIONS: list[dict[str, Any]] = [
    {
        "type": ActionType.EXPENSE_APPROVAL,
        "title": "Aprobar gasto de viaje a cliente",
        "description": "Vuelo y hotel para la visita on-site a Acme Corp.",
        "requester": "lucia.mendez@ops.example",
        "payload": {
            "amount": 1240.50,
            "currency": "USD",
            "receipt_url": "https://receipts.example/invoices/inv-8842.pdf",
        },
    },
    {
        "type": ActionType.DEPLOYMENT_REVIEW,
        "title": "Revisar deploy de checkout-api a produccion",
        "description": "Release con el nuevo flujo de reintentos de pago.",
        "requester": "ci-bot@ops.example",
        "payload": {
            "service": "checkout-api",
            "version": "2.14.0",
            "environment": "production",
        },
    },
    {
        "type": ActionType.DOCUMENTATION_UPLOAD,
        "title": "Subir el runbook de incidentes",
        "description": "Falta el runbook actualizado del on-call de plataforma.",
        "requester": "martin.rios@ops.example",
        "payload": {"document_name": "runbook-oncall-plataforma.md"},
    },
    {
        "type": ActionType.ONBOARDING,
        "title": "Onboarding de Sofia Cabrera",
        "description": "Primer dia el lunes; completar el checklist de accesos.",
        "requester": "people@ops.example",
        "payload": {
            "employee_name": "Sofia Cabrera",
            "checklist": [
                "Crear cuenta de correo",
                "Asignar notebook",
                "Alta en el repositorio",
                "Sesion de bienvenida con el equipo",
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
