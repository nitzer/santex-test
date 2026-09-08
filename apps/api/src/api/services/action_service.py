import json
import logging
from collections.abc import Callable, Generator
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, UploadFile
from pydantic import BaseModel, ValidationError

from api.handlers import (
    FileCompletionHandler,
    JsonCompletionHandler,
    UnknownActionTypeError,
    get_handler,
)
from api.models import Action, ActionStatus, ActionType
from api.repositories.action_repository import ActionRepository
from api.schemas import ActionCreate

logger = logging.getLogger("api.actions")


def _event(message: str, action: Action) -> None:
    logger.info(
        "%s: action %s (type=%s)", message, action.id, action.type.value,
        extra={"action_id": action.id, "action_type": action.type.value},
    )


@contextmanager
def _validation_errors_as_422() -> Generator[None, None, None]:
    """Handlers raise plain pydantic/domain errors; the HTTP mapping lives here."""
    try:
        yield
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=json.loads(exc.json())) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _normalized(model: type[BaseModel], payload: dict[str, Any]) -> dict[str, Any]:
    """Validate a payload against a handler's model and store the coerced version."""
    with _validation_errors_as_422():
        return model.model_validate(payload).model_dump(mode="json")


class ActionService:
    def __init__(self, actions: ActionRepository) -> None:
        self.actions = actions

    def list_actions(
        self,
        status: ActionStatus | None = None,
        type: ActionType | None = None,
    ) -> list[Action]:
        return self.actions.get_all(status=status, type=type)

    def get_action(self, action_id: str) -> Action:
        action = self.actions.get_by_id(action_id)
        if action is None:
            raise HTTPException(status_code=404, detail="action not found")
        return action

    def create_action(self, data: ActionCreate) -> Action:
        try:
            handler = get_handler(data.type)
        except UnknownActionTypeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        # The request union may have picked a different model than the declared type
        # (two creation payloads can look alike), so go back to the raw dict and let the
        # declared type's model be the authority.
        raw = data.payload.model_dump() if isinstance(data.payload, BaseModel) else data.payload

        created = self.actions.save(
            Action(
                type=data.type,
                title=data.title,
                description=data.description,
                requester=data.requester,
                payload=_normalized(handler.creation_model, raw),
            )
        )
        _event("created", created)
        return created

    def complete_with_json(self, action_id: str, payload: dict[str, Any]) -> Action:
        action = self._get_pending(action_id)
        handler = get_handler(action.type)
        if not isinstance(handler, JsonCompletionHandler):
            raise HTTPException(
                status_code=400,
                detail=f"action type {action.type.value} is completed via /upload",
            )
        return self._finish(action, lambda: handler.complete(action, payload))

    def complete_with_file(self, action_id: str, file: UploadFile) -> Action:
        action = self._get_pending(action_id)
        handler = get_handler(action.type)
        if not isinstance(handler, FileCompletionHandler):
            raise HTTPException(
                status_code=400,
                detail=f"action type {action.type.value} is completed via /complete",
            )
        return self._finish(action, lambda: handler.complete(action, file))

    def _get_pending(self, action_id: str) -> Action:
        action = self.get_action(action_id)
        if action.status is not ActionStatus.PENDING:
            raise HTTPException(status_code=409, detail="action is already completed")
        return action

    def _finish(self, action: Action, run: Callable[[], dict[str, Any]]) -> Action:
        with _validation_errors_as_422():
            result = run()

        action.result = result
        action.status = ActionStatus.COMPLETED
        action.completed_at = datetime.now(timezone.utc)
        completed = self.actions.save(action)
        _event("completed", completed)
        return completed
