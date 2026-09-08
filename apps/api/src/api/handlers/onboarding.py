from typing import Any

from pydantic import BaseModel, Field

from api.handlers.base import JsonCompletionHandler, register
from api.models import Action, ActionType


class OnboardingCreate(BaseModel):
    employee_name: str = Field(title="Nombre del empleado")
    checklist: list[str] = Field(
        min_length=1, title="Checklist", description="Pasos a completar durante el onboarding."
    )


class OnboardingComplete(BaseModel):
    completed_steps: list[str] = Field(min_length=1)


@register(ActionType.ONBOARDING)
class OnboardingHandler(JsonCompletionHandler):
    label = "Onboarding de empleado"
    creation_model = OnboardingCreate
    payload_model = OnboardingComplete

    def complete(self, action: Action, payload: dict[str, Any]) -> dict[str, Any]:
        submitted = self.payload_model.model_validate(payload)
        checklist = set(action.payload.get("checklist", []))
        unknown = [step for step in submitted.completed_steps if step not in checklist]
        if unknown:
            raise ValueError(f"steps not in checklist: {', '.join(unknown)}")
        return submitted.model_dump()
