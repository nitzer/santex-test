from typing import Any

from fastapi import APIRouter

from api.handlers import action_type_descriptors
from api.schemas import ActionTypeDescriptor

router = APIRouter(tags=["action-types"])


@router.get("/action-types", response_model=list[ActionTypeDescriptor])
def list_action_types() -> list[dict[str, Any]]:
    """Derived from the handler registry: a new handler shows up here for free."""
    return action_type_descriptors()
