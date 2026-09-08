# Ops Tool — Pending Actions

An internal operations tool: a queue of pending actions (approve an expense, review a deployment, upload documentation, complete an onboarding) that users can create, inspect and complete.

In the UI they are called **tasks**; in the API and the code they are **actions**. Same thing.

Built with Claude Code as a pair programmer; the architecture, the scope decisions and the reviews are mine.

## How to run

**Docker (fastest):**

```bash
docker compose up --build
# web: http://localhost:5173   api docs: http://localhost:8000/docs
```

If a port is taken, copy `.env.example` to `.env` and change `API_PORT` / `WEB_PORT`. The database and the uploaded files live in the `api-data` volume.

**Local development.** Requires Node 22, pnpm 11 and [`uv`](https://docs.astral.sh/uv/) (`pip install uv`; it downloads Python 3.12 if the system lacks it).

```bash
pnpm install                 # JS deps (root + apps/web)
(cd apps/api && uv sync)     # Python deps into apps/api/.venv

pnpm dev:api                 # FastAPI on :8000, reload on
pnpm dev:web                 # Vite on :5173
pnpm gen:types               # regenerate apps/web/src/types/api.d.ts from apps/api/openapi.json
```

If the API runs elsewhere: `VITE_API_URL=http://localhost:8001 pnpm dev:web`, and `CORS_ORIGINS=http://localhost:5173` on the API. API settings are env vars (`DATABASE_URL`, `UPLOADS_DIR`, `CORS_ORIGINS`, `LOG_LEVEL`, `LOG_FORMAT`) — see `apps/api/src/api/config.py`.

**Tests:**

```bash
pnpm test:api     # pytest: tests/unit (no HTTP, no file DB) + tests/integration (TestClient)
pnpm test:web     # vitest: components, forms, HTTP client, registries
pnpm test:e2e     # playwright: boots api + web, walks the whole flow in Chromium
```

The e2e accept `E2E_API_PORT` / `E2E_WEB_PORT` so they never collide with servers you already have up. First run: `pnpm --filter web exec playwright install chromium`, and on Linux `sudo pnpm --filter web exec playwright install-deps chromium`.

## How it is built

The domain contract, the ER diagram and the decisions below live in [`specs/domain.md`](specs/domain.md); each app has its own README with the details.

**Backend** (`apps/api`, FastAPI + SQLModel on SQLite): `router → service → repository`, wired with `Depends()`. Each action type is a *handler* — a Strategy that owns its two Pydantic contracts (the payload accepted at creation and the body accepted at completion) and knows how to complete an action of its type. Handlers register themselves with `@register(ActionType.X)`; the package auto-discovers its modules, so there is no import list and no `if type == ...` anywhere. `GET /action-types` and the OpenAPI `oneOf`s are derived from that registry. Adding a type is an enum member plus one file; a test fails if a type is left without a handler.

**Frontend** (`apps/web`, React + Vite + TypeScript): types are generated from the API's OpenAPI, never retyped — `BaseTask` plus `Task<'expense_approval'>`… form a union discriminated by `type`. Completion has one small form per type, resolved through a registry (no `switch`). Creation is generated from the JSON Schema the API publishes per type, so a new type shows up in the "Add task" form with its fields, labels and hints without frontend code.

**API design.** Resources, not verbs: `GET /action-types`, `GET|POST /actions`, `GET /actions/{id}`, `POST /actions/{id}/complete` (JSON) and `POST /actions/{id}/upload` (multipart). Status codes carry meaning — 201 on create, 400 wrong endpoint for the type, 404, 409 already completed, 422 validation with FastAPI's per-field detail. The three mutating endpoints require an `Idempotency-Key`: replaying a key returns the stored response without repeating the effect, so a network retry or a double click cannot complete or create twice.

**Validation and errors.** Validation is Pydantic, per type, where the data is defined: amount > 0, ISO currency code, non-empty checklist, completed steps must belong to the checklist, uploaded filenames are sanitised. The HTTP mapping of domain errors lives in one place in the service. The frontend maps a 422 back onto the field that caused it, shows 400/409 as a message, and keeps the submit button disabled while a request is in flight.

**Observability.** Every request gets an `X-Request-ID` (yours if you send one), echoed in the response and stamped on every log line produced while handling it: an access log with method, path, status and duration, and domain events (`created`, `completed`) with the action id and type. `LOG_FORMAT=json` for machine ingestion; `GET /health` for liveness and the Docker healthcheck.

**Accessibility.** Every input has a label; errors are announced with `role="alert"` and linked with `aria-describedby`; regions and lists have names; the e2e tests find everything by role and label, which keeps the markup honest. I did not run an automated audit — see below.

**Libraries.** FastAPI, SQLModel and `uv` on the back; React, Vite, Vitest, Playwright and `openapi-typescript` on the front. No Redux, no router, no UI kit, no form library: one screen and four small forms did not justify them. The JSON-Schema renderer is hand-rolled and covers the subset the payloads use.

## Assumptions

- **Completing is terminal.** A pending action is a decision waiting to be made; once made, it is no longer pending. Approving and rejecting both end in `completed`, and the verdict lives in `result`. A "rejected" status would be the first thing to add if the workflow needed to distinguish them.
- **Single implicit actor, no auth.** Anyone who opens the tool can see and complete everything; `requester` is free text.
- **Seed data on first start.** With an empty database the API inserts one example action per type, so the app is usable the moment it comes up. The seed goes through the same validation as `POST /actions`.
- **Uploads go to local disk** (`UPLOADS_DIR`), not to object storage.
- **One operator at a time.** Idempotency protects against retries and double clicks, not against two concurrent requests racing on the same key — that would need a lock.

## Tradeoffs

- **One table with a JSON `payload`, not a table per type.** Adding a type does not touch the schema, and the polymorphism lives in code where Strategy handles it well. The cost: no per-column integrity, validation happens only in Pydantic, and querying by a payload field is awkward. For a queue that is read by id and by status, I took that deal.
- **Creation form generated from JSON Schema, not one form per type.** Zero frontend code per new type, and the backend stays the single source of truth for field names, titles and hints. The cost: a generic look, a renderer that understands a subset of JSON Schema, and a payload the compiler cannot type inside the form (the API re-validates it). Completion kept per-type forms because those *do* want bespoke widgets.
- **`/complete` and `/upload` as separate endpoints, not one polymorphic one.** Each keeps its natural content type and is documented precisely in OpenAPI; the client has to know which one to call, which the registry tells it. One endpoint accepting both JSON and multipart would have been smaller and vaguer.
- SQLite, no migrations tool, no pagination: right-sized for the current scope, all of them one-liners to revisit.

## If I had another day

1. **UX polish and an accessibility audit.** A visual pass (hierarchy, empty and loading states, feedback after completing) and axe/Lighthouse runs, so the accessibility claims above rest on evidence rather than on roles and labels.
2. **Metrics and tracing.** A `/metrics` endpoint (latency per endpoint, counts per status) and OpenTelemetry traces tied to the request id, on top of the structured logs.
3. **Auth, roles and an audit trail.** Who may complete what, and recording who completed each action — today `requester` is a string and completion has no actor.
