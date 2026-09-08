from datetime import datetime
from functools import reduce
from operator import or_
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

# Importing the package runs handler discovery, so the registry is populated before the
# union below is built. Handlers never import this module, so there is no cycle.
from api.handlers import registered_handlers
from api.models import ActionStatus, ActionType

CreationPayload = reduce(
    or_, dict.fromkeys(handler.creation_model for handler in registered_handlers())
)
"""Union of every registered `creation_model`, so OpenAPI gets a named `oneOf`."""


class ActionRead(BaseModel):
    """Wire representation of an Action. Per-type bodies live with their handler."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    type: ActionType
    title: str
    description: str
    requester: str
    status: ActionStatus
    created_at: datetime
    completed_at: datetime | None
    payload: dict[str, Any]
    result: dict[str, Any] | None


class ActionCreate(BaseModel):
    """The union documents the accepted shapes; the service re-validates `payload`
    against the `creation_model` of the declared `type`, which is authoritative."""

    type: ActionType
    title: str
    description: str
    requester: str
    payload: CreationPayload


class ActionTypeDescriptor(BaseModel):
    """What the UI needs to offer a type and render its creation form."""

    type: ActionType
    label: str
    completion: Literal["json", "file"]
    schema_name: str
    payload_schema: dict[str, Any]
