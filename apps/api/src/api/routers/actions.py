from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, File, UploadFile
from fastapi.responses import JSONResponse

from api.dependencies import ActionServiceDep, IdempotencyGuard, idempotency_guard
from api.handlers import json_handlers
from api.models import Action, ActionStatus, ActionType
from api.schemas import ActionCreate, ActionRead

router = APIRouter(prefix="/actions", tags=["actions"])

# The body is parsed as a plain dict so each handler owns its own validation (and its own
# 422). This only teaches the OpenAPI schema which shapes are accepted, read from the
# registry so a new handler documents itself.
COMPLETE_BODY_DOC = {
    "requestBody": {
        "required": True,
        "content": {
            "application/json": {
                "schema": {
                    "oneOf": [h.payload_model.model_json_schema() for h in json_handlers()]
                }
            }
        },
    }
}


def _body(action: Action) -> dict[str, Any]:
    return ActionRead.model_validate(action).model_dump(mode="json")


@router.get("", response_model=list[ActionRead])
def list_actions(
    service: ActionServiceDep,
    status: ActionStatus | None = None,
    type: ActionType | None = None,
) -> list[Action]:
    return service.list_actions(status=status, type=type)


@router.get("/{action_id}", response_model=ActionRead)
def get_action(action_id: str, service: ActionServiceDep) -> Action:
    return service.get_action(action_id)


@router.post("", response_model=ActionRead, status_code=201)
def create_action(
    service: ActionServiceDep,
    guard: Annotated[IdempotencyGuard, Depends(idempotency_guard("create"))],
    data: ActionCreate,
) -> Any:
    replay = guard.cached_response()
    if replay is not None:
        return replay

    body = _body(service.create_action(data))
    guard.store(body["id"], body, status_code=201)
    return JSONResponse(status_code=201, content=body)


@router.post("/{action_id}/complete", response_model=ActionRead, openapi_extra=COMPLETE_BODY_DOC)
def complete_action(
    action_id: str,
    service: ActionServiceDep,
    guard: Annotated[IdempotencyGuard, Depends(idempotency_guard("complete"))],
    payload: Annotated[dict[str, Any], Body()],
) -> Any:
    replay = guard.cached_response()
    if replay is not None:
        return replay

    body = _body(service.complete_with_json(action_id, payload))
    guard.store(action_id, body)
    return JSONResponse(status_code=200, content=body)


@router.post("/{action_id}/upload", response_model=ActionRead)
def upload_action_document(
    action_id: str,
    service: ActionServiceDep,
    guard: Annotated[IdempotencyGuard, Depends(idempotency_guard("upload"))],
    file: Annotated[UploadFile, File()],
) -> Any:
    replay = guard.cached_response()
    if replay is not None:
        return replay

    body = _body(service.complete_with_file(action_id, file))
    guard.store(action_id, body)
    return JSONResponse(status_code=200, content=body)
