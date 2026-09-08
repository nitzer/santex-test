from abc import ABC, abstractmethod
from collections.abc import Callable
from typing import Any, ClassVar, TypeVar

from fastapi import UploadFile
from pydantic import BaseModel

from api.models import Action, ActionType


class UnknownActionTypeError(LookupError):
    """No handler is registered for an action type."""

    def __init__(self, action_type: ActionType) -> None:
        super().__init__(f"no handler registered for action type {action_type.value}")
        self.action_type = action_type


class CompletionHandler(ABC):
    """Base of every completion strategy. Knows nothing about HTTP or the DB."""

    action_type: ClassVar[ActionType]
    label: ClassVar[str]
    creation_model: ClassVar[type[BaseModel]]
    """Shape of `Action.payload` when the action is created."""


class JsonCompletionHandler(CompletionHandler):
    """Completes an action from a JSON body validated against `payload_model`."""

    payload_model: ClassVar[type[BaseModel]]

    @abstractmethod
    def complete(self, action: Action, payload: dict[str, Any]) -> dict[str, Any]:
        """Return the `result` dict for the action. Raises ValueError if invalid."""


class FileCompletionHandler(CompletionHandler):
    """Completes an action from an uploaded file."""

    @abstractmethod
    def complete(self, action: Action, file: UploadFile) -> dict[str, Any]:
        """Return the `result` dict for the action. Raises ValueError if invalid."""


_REGISTRY: dict[ActionType, type[CompletionHandler]] = {}

H = TypeVar("H", bound=CompletionHandler)


def register(action_type: ActionType) -> Callable[[type[H]], type[H]]:
    """Class decorator that plugs a handler into the registry."""

    def decorator(handler_cls: type[H]) -> type[H]:
        _require_attrs(handler_cls, "label", "creation_model")
        if issubclass(handler_cls, JsonCompletionHandler):
            _require_attrs(handler_cls, "payload_model")
        already = _REGISTRY.get(action_type)
        if already is not None and already is not handler_cls:
            raise ValueError(
                f"{action_type.value} is already handled by {already.__name__}"
            )
        handler_cls.action_type = action_type
        _REGISTRY[action_type] = handler_cls
        return handler_cls

    return decorator


def _require_attrs(handler_cls: type[CompletionHandler], *names: str) -> None:
    missing = [name for name in names if getattr(handler_cls, name, None) is None]
    if missing:
        raise TypeError(f"{handler_cls.__name__} must declare {', '.join(missing)}")


def get_handler(action_type: ActionType) -> CompletionHandler:
    handler_cls = _REGISTRY.get(action_type)
    if handler_cls is None:
        raise UnknownActionTypeError(action_type)
    return handler_cls()


def registered_action_types() -> frozenset[ActionType]:
    return frozenset(_REGISTRY)


def registered_handlers() -> list[type[CompletionHandler]]:
    """Every registered handler class, in discovery order."""
    return list(_REGISTRY.values())


def json_handlers() -> list[type[JsonCompletionHandler]]:
    """Every registered handler that completes from a JSON body."""
    return [
        handler_cls
        for handler_cls in _REGISTRY.values()
        if issubclass(handler_cls, JsonCompletionHandler)
    ]


def action_type_descriptors() -> list[dict[str, Any]]:
    """What the UI needs to offer a type and build its creation form."""
    return [
        {
            "type": handler_cls.action_type,
            "label": handler_cls.label,
            "completion": "json" if issubclass(handler_cls, JsonCompletionHandler) else "file",
            "schema_name": handler_cls.creation_model.__name__,
            "payload_schema": handler_cls.creation_model.model_json_schema(),
        }
        for handler_cls in _REGISTRY.values()
    ]
