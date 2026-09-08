from typing import Any

from pydantic import BaseModel, Field

from api.handlers.base import JsonCompletionHandler, register
from api.models import Action, ActionType


class DeploymentReviewCreate(BaseModel):
    service: str = Field(title="Servicio")
    version: str = Field(title="Versión")
    environment: str = Field(title="Entorno", description="Ej. staging, production.")


class DeploymentReviewComplete(BaseModel):
    approved: bool
    notes: str


@register(ActionType.DEPLOYMENT_REVIEW)
class DeploymentReviewHandler(JsonCompletionHandler):
    label = "Revisar deploy"
    creation_model = DeploymentReviewCreate
    payload_model = DeploymentReviewComplete

    def complete(self, action: Action, payload: dict[str, Any]) -> dict[str, Any]:
        review = self.payload_model.model_validate(payload)
        return review.model_dump()
