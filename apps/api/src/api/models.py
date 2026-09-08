from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import uuid4

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class ActionType(str, Enum):
    EXPENSE_APPROVAL = "expense_approval"
    DEPLOYMENT_REVIEW = "deployment_review"
    DOCUMENTATION_UPLOAD = "documentation_upload"
    ONBOARDING = "onboarding"


class ActionStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"


def _new_id() -> str:
    return str(uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Action(SQLModel, table=True):
    id: str = Field(default_factory=_new_id, primary_key=True)
    type: ActionType = Field(index=True)
    title: str
    description: str
    requester: str
    status: ActionStatus = Field(default=ActionStatus.PENDING, index=True)
    created_at: datetime = Field(default_factory=_now)
    completed_at: datetime | None = Field(default=None)
    payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    result: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))


class IdempotencyRecord(SQLModel, table=True):
    key: str = Field(primary_key=True)
    action_id: str = Field(index=True)
    endpoint: str
    response_status: int
    response_body: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=_now)
