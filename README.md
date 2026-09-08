# Ops Tool — Pending Actions

Herramienta interna de operaciones: lista de tareas pendientes (aprobar un gasto, revisar un deployment, subir documentación, completar un onboarding) que se pueden crear, ver y completar.

Es un proyecto de aprendizaje: el foco está en la arquitectura y los patrones, no en el producto. Contrato de dominio y decisiones en [`specs/domain.md`](specs/domain.md).

## Stack

| | |
|---|---|
| `apps/api` | Python 3.12 · FastAPI · SQLModel (SQLite) · `uv` |
| `apps/web` | React 19 · Vite · TypeScript · Vitest · Playwright |
| raíz | pnpm workspaces · `openapi-typescript` (tipos del front generados desde el OpenAPI del back) · Docker Compose |

## Levantar con Docker (lo más rápido)

```bash
docker compose up --build
# web: http://localhost:5173   api: http://localhost:8000/docs
```

Si un puerto está ocupado, copiá `.env.example` a `.env` y cambiá `API_PORT` / `WEB_PORT`. La DB y los archivos subidos persisten en el volumen `api-data`.

## Desarrollo local

Requisitos: Node 22, pnpm 11 y [`uv`](https://docs.astral.sh/uv/) (`pip install uv`). No hace falta tener Python 3.12 instalado: `uv sync` lo descarga si el sistema no lo tiene.

```bash
pnpm install                 # deps JS (raíz + apps/web)
(cd apps/api && uv sync)     # deps Python en apps/api/.venv

pnpm dev:api                 # FastAPI en :8000 con reload
pnpm dev:web                 # Vite en :5173
pnpm gen:types               # regenera apps/web/src/types/api.d.ts desde apps/api/openapi.json
```

Si la API corre en otro puerto: `VITE_API_URL=http://localhost:8001 pnpm dev:web` y `CORS_ORIGINS=http://localhost:5173` en la API. Variables de la API: `DATABASE_URL`, `UPLOADS_DIR`, `CORS_ORIGINS` (ver `apps/api/src/api/config.py`).

## Tests

```bash
pnpm test:api     # pytest: tests/unit (sin HTTP ni DB de archivo) + tests/integration (TestClient)
pnpm test:web     # vitest: componentes, formularios, cliente HTTP, registry
pnpm test:e2e     # playwright: levanta api + web y recorre el flujo completo en Chromium
```

Los e2e aceptan `E2E_API_PORT` y `E2E_WEB_PORT` para no chocar con servers ya levantados. La primera vez, Playwright necesita Chromium y sus librerías de sistema: `pnpm --filter web exec playwright install chromium` y, en Linux, `sudo pnpm --filter web exec playwright install-deps chromium`.

## Arquitectura

**Backend** — capas `router → service → repository`, cableadas con `Depends()`:

- **Strategy**: cada tipo de tarea es un handler en `apps/api/src/api/handlers/` que sabe validar y completar tareas de su tipo. Dueño de sus dos contratos Pydantic: `creation_model` (forma del `payload` al crear) y `payload_model` (body de `/complete`).
- **Registry + auto-discovery**: `@register(ActionType.X)` inscribe cada handler; `handlers/__init__.py` importa todos los módulos del paquete, así no existe ninguna lista manual ni `if type == ...`. `GET /action-types` y los `oneOf` del OpenAPI se derivan del registry.
- **ISP**: `JsonCompletionHandler` y `FileCompletionHandler` son interfaces separadas; los endpoints rechazan (400) el tipo equivocado.
- **Repository**: `ActionRepository` e `IdempotencyRepository` son el único lugar que toca la sesión de DB.
- **Idempotencia**: los tres endpoints mutantes exigen `Idempotency-Key`. Misma key → misma respuesta sin repetir el efecto; key nueva sobre una tarea ya completada → 409. Implementado una sola vez como dependency reutilizable (`idempotency_guard`).
- **Observabilidad**: cada request recibe un `X-Request-ID` (se respeta el del cliente si lo manda) que vuelve en la respuesta y se estampa en todos los logs de esa request — access log propio con método, path, status y duración, y eventos de dominio (`created`, `completed`) con `action_id`/`action_type`. `LOG_FORMAT=json` para ingestión por máquina, `LOG_LEVEL` para el nivel. `GET /health` para liveness.

**Frontend** — espejo del mismo diseño:

- Tipos con herencia base → tipo: `BaseTask` + `Task<'expense_approval'>`… generados desde el OpenAPI.
- `formRegistry`: un componente de completado por tipo, resuelto por registro (sin `switch`).
- Formulario de alta **generado desde el JSON Schema** que expone `GET /action-types`: un tipo nuevo en el backend aparece en el selector con sus campos sin tocar el front.

### Agregar un tipo de tarea

1. Sumar el miembro a `ActionType` en `apps/api/src/api/models.py`.
2. Crear `apps/api/src/api/handlers/<nuevo>.py`: sus modelos `*Create` (y `*Complete` si se completa con JSON) y la clase handler con `@register(ActionType.NUEVO)`, `label`, `creation_model`.
3. `pnpm gen:types`, y en el front: un componente de completado + su entrada en `formRegistry` y en `TaskPayloadByType`.

Los tests de registry (back y front) fallan si un tipo queda sin handler o sin formulario — esa es la red de seguridad del diseño extensible.
