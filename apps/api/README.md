# api — Pending Actions

FastAPI + SQLModel backend for the pending-actions demo. Contract: `specs/domain.md`.

```bash
uv sync                                  # install deps
uv run pytest                            # unit + integration
uv run fastapi dev src/api/main.py       # dev server on :8000 (docs at /docs)
uv run python -m api.main export-openapi openapi.json
```

The DB is created and seeded with one demo action per type on startup, only if the `action`
table is empty. The seed goes through `ActionService.create_action`, so a seed payload that
drifts from its handler's `creation_model` fails loudly instead of inserting a bad row.

Env vars: `DATABASE_URL` (default `sqlite:///apps/api/actions.db`), `UPLOADS_DIR`
(default `storage/uploads`), `CORS_ORIGINS` (comma-separated, default
`http://localhost:5173`), `LOG_LEVEL` (default `INFO`), `LOG_FORMAT` (`text` | `json`).

## Observability

`observability.py` gives every request an id — the client's `X-Request-ID` if present (capped
at 128 chars), else a generated one — returned in the response and stamped on every log record
emitted while handling it, via a `LogRecord` factory. The access log (`api.access`) carries
method, path, status and `duration_ms`; the service logs domain events (`api.actions`:
`created`, `completed`) with `action_id` and `action_type`. With `LOG_FORMAT=json` each line
is a JSON object with those fields, ready for ingestion. `GET /health` is the liveness probe
(used by the Docker healthcheck).

## Endpoints

| method | path | notes |
|---|---|---|
| GET | `/action-types` | `{type, label, completion, payload_schema}` per registered type — drives the front's type selector and creation form |
| GET | `/actions?status=&type=` | optional filters |
| GET | `/actions/{id}` | 404 if unknown |
| POST | `/actions` | **201**; `payload` validated against the type's `creation_model` (422), 400 if the type has no handler |
| POST | `/actions/{id}/complete` | JSON body, per-type validation |
| POST | `/actions/{id}/upload` | multipart `file`, `documentation_upload` only |

The three mutating endpoints require an `Idempotency-Key` header (400 if missing); replaying
a key returns the stored response verbatim without repeating the effect, and a 422 is never
cached.

## Layers

| layer | responsibility |
|---|---|
| `routers/` | parse input, resolve `Depends()`, call the service — no business logic |
| `dependencies.py` | wiring + the reusable `idempotency_guard(endpoint)` dependency |
| `services/` | orchestration: load the action, resolve the handler, persist, map errors to HTTP |
| `handlers/` | one plugin per `ActionType`; owns its DTOs and returns the `result` dict |
| `repositories/` | the only place that talks to the DB session |

Handlers know nothing about HTTP or the DB: they take the loaded `Action` plus the payload
(or the `UploadFile`) and return a plain dict. The service persists it.

## Adding an action type

1. Add the member to `ActionType` in `models.py`.
2. Create `handlers/<new_type>.py` with a handler class decorated with
   `@register(ActionType.NEW_TYPE)`, declaring:
   - `label` — the text the UI shows for the type;
   - `creation_model` — the `payload` shape accepted by `POST /actions`;
   - `payload_model` — the `/complete` body shape (JSON handlers only; file handlers
     implement `complete(action, file)` instead).

Nothing else changes. `handlers/__init__.py` imports every module in the package
(`pkgutil.iter_modules`), so the decorator runs on import and populates the registry —
there is no manual import list and no `if type == ...` anywhere. `GET /action-types` and the
`oneOf` of the `/complete` body are both derived from the registry, so a new handler
documents itself and the front can render its creation form with no new front-end code.
`register()` refuses a handler that omits `label`, `creation_model` or `payload_model`.

`tests/unit/test_handlers.py::test_registry_has_exactly_one_handler_per_action_type` is the
safety net: adding an enum member without its handler module fails the suite.

## Tests

- `tests/unit/` — no HTTP, no file DB: handlers called directly, repositories and the
  service against in-memory SQLite.
- `tests/integration/` — `TestClient` against the real app with a temp SQLite file per test
  and a temp `UPLOADS_DIR`.
