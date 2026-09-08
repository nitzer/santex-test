from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException
from fastapi.responses import JSONResponse
from sqlmodel import Session

from api.db import get_session
from api.repositories.action_repository import ActionRepository
from api.repositories.idempotency_repository import IdempotencyRepository
from api.services.action_service import ActionService
from api.services.idempotency_service import IdempotencyService

SessionDep = Annotated[Session, Depends(get_session)]


def get_action_service(session: SessionDep) -> ActionService:
    return ActionService(ActionRepository(session))


def get_idempotency_service(session: SessionDep) -> IdempotencyService:
    return IdempotencyService(IdempotencyRepository(session))


ActionServiceDep = Annotated[ActionService, Depends(get_action_service)]


@dataclass
class IdempotencyGuard:
    """Replay guard for one mutating request: read the cache, then store the result."""

    key: str
    endpoint: str
    service: IdempotencyService

    def cached_response(self) -> JSONResponse | None:
        cached = self.service.get_cached(self.key)
        if cached is None:
            return None
        status_code, body = cached
        return JSONResponse(status_code=status_code, content=body)

    def store(self, action_id: str, body: dict[str, Any], status_code: int = 200) -> None:
        self.service.store(self.key, action_id, self.endpoint, status_code, body)


def idempotency_guard(endpoint: str) -> Callable[..., IdempotencyGuard]:
    def dependency(
        service: Annotated[IdempotencyService, Depends(get_idempotency_service)],
        idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
    ) -> IdempotencyGuard:
        if not idempotency_key:
            raise HTTPException(status_code=400, detail="Idempotency-Key header is required")
        return IdempotencyGuard(key=idempotency_key, endpoint=endpoint, service=service)

    return dependency
