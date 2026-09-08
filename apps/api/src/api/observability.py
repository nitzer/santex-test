"""Request IDs and structured logging.

Every request gets an id (the client's `X-Request-ID` if it sent one, else a fresh one),
which is echoed back in the response and stamped on every log record emitted while the
request is being handled — access log and domain events alike — so one id ties together
everything that happened for one call.
"""

import json
import logging
import sys
import time
import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from api.config import LOG_FORMAT, LOG_LEVEL

REQUEST_ID_HEADER = "X-Request-ID"
_MAX_REQUEST_ID_LENGTH = 128

_request_id: ContextVar[str] = ContextVar("request_id", default="-")
access_logger = logging.getLogger("api.access")


def current_request_id() -> str:
    return _request_id.get()


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = _incoming_request_id(request) or uuid.uuid4().hex
        token = _request_id.set(request_id)
        started = time.perf_counter()
        try:
            try:
                response = await call_next(request)
            except Exception:
                access_logger.exception(
                    "%s %s -> 500", request.method, request.url.path,
                    extra=_access_extra(request, 500, started),
                )
                raise

            response.headers[REQUEST_ID_HEADER] = request_id
            access_logger.info(
                "%s %s -> %s", request.method, request.url.path, response.status_code,
                extra=_access_extra(request, response.status_code, started),
            )
            return response
        finally:
            _request_id.reset(token)


def _incoming_request_id(request: Request) -> str | None:
    candidate = request.headers.get(REQUEST_ID_HEADER, "").strip()
    # Length-capped so a client cannot flood the logs through this header.
    return candidate if 0 < len(candidate) <= _MAX_REQUEST_ID_LENGTH else None


def _access_extra(request: Request, status_code: int, started: float) -> dict[str, object]:
    return {
        "method": request.method,
        "path": request.url.path,
        "status_code": status_code,
        "duration_ms": round((time.perf_counter() - started) * 1000, 1),
    }


_STRUCTURED_FIELDS = ("method", "path", "status_code", "duration_ms", "action_id", "action_type")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, object] = {
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "request_id": getattr(record, "request_id", "-"),
            "message": record.getMessage(),
        }
        for field in _STRUCTURED_FIELDS:
            if hasattr(record, field):
                entry[field] = getattr(record, field)
        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False)


_TEXT_FORMAT = "%(asctime)s %(levelname)s %(name)s [%(request_id)s] %(message)s"


def _install_request_id_record_factory() -> None:
    previous = logging.getLogRecordFactory()
    if getattr(previous, "_stamps_request_id", False):
        return

    def factory(*args: object, **kwargs: object) -> logging.LogRecord:
        record = previous(*args, **kwargs)
        record.request_id = _request_id.get()
        return record

    factory._stamps_request_id = True  # type: ignore[attr-defined]
    logging.setLogRecordFactory(factory)


def configure_logging() -> None:
    _install_request_id_record_factory()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter() if LOG_FORMAT == "json" else logging.Formatter(_TEXT_FORMAT))

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(LOG_LEVEL)
    # Our access log carries the request id and the duration; uvicorn's would duplicate it.
    logging.getLogger("uvicorn.access").disabled = True
