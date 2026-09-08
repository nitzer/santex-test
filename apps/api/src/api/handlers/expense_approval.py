from typing import Any

from pydantic import BaseModel, Field

from api.handlers.base import JsonCompletionHandler, register
from api.models import Action, ActionType


class ExpenseApprovalCreate(BaseModel):
    amount: float = Field(gt=0, title="Amount", description="Expense total, greater than zero.")
    currency: str = Field(
        pattern=r"^[A-Z]{3}$", title="Currency", description="3-letter ISO code, e.g. USD."
    )
    receipt_url: str = Field(title="Receipt (URL)", json_schema_extra={"format": "uri"})


class ExpenseApprovalComplete(BaseModel):
    approved: bool
    comment: str


@register(ActionType.EXPENSE_APPROVAL)
class ExpenseApprovalHandler(JsonCompletionHandler):
    label = "Approve expense"
    creation_model = ExpenseApprovalCreate
    payload_model = ExpenseApprovalComplete

    def complete(self, action: Action, payload: dict[str, Any]) -> dict[str, Any]:
        decision = self.payload_model.model_validate(payload)
        return decision.model_dump()
