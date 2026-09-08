"""Handler plugins.

Importing this package imports every sibling module, whose `@register(...)`
decorators populate the registry. Adding an action type never means editing a list.
"""

from api.handlers.base import (
    CompletionHandler,
    FileCompletionHandler,
    JsonCompletionHandler,
    UnknownActionTypeError,
    action_type_descriptors,
    get_handler,
    json_handlers,
    register,
    registered_action_types,
    registered_handlers,
)


def _discover_handlers() -> None:
    import pkgutil
    from importlib import import_module

    for module in pkgutil.iter_modules(__path__):
        if module.name != "base":
            import_module(f"{__name__}.{module.name}")


_discover_handlers()

__all__ = [
    "CompletionHandler",
    "FileCompletionHandler",
    "JsonCompletionHandler",
    "UnknownActionTypeError",
    "action_type_descriptors",
    "get_handler",
    "json_handlers",
    "register",
    "registered_action_types",
    "registered_handlers",
]
