# web

Frontend de Pending Actions. React + TypeScript + Vite, una sola pantalla: la cola de
acciones a la izquierda, el detalle y el formulario de completado a la derecha.

## Contrato

Los tipos salen del backend, no se escriben a mano:

```sh
pnpm gen:types   # desde la raíz: apps/api/openapi.json -> src/types/api.d.ts
```

`src/types/domain.ts` deriva de ahí la herencia base → tipo: `BaseTask` (lo común a toda
tarea) y `Task<'expense_approval'>`… (base + el payload de ese tipo, tomado de los
`*Create` del OpenAPI), unidos en `AnyTask`, discriminada por `type`. Si el contrato
cambia, el compilador marca cada lugar que hay que tocar.

## Agregar un tipo de acción

**Alta ("Agregar tarea"): cero código.** El selector y los campos del formulario se generan
desde `GET /action-types` (`SchemaFields` renderiza el `payload_schema` de cada tipo), así
que un tipo nuevo en el backend aparece solo, con sus campos, labels y hints.

**Completado:** espeja el registry de handlers del backend:

1. Crear `src/components/forms/MiNuevoForm.tsx` implementando `CompletionFormProps`.
2. Agregar la entrada en `src/components/forms/registry.ts` y el payload del tipo en
   `TaskPayloadByType` (`src/types/domain.ts`).

Nada más se toca: ningún componente ramifica por `action.type`. Ambos mapas son
`Record<ActionType, …>`, así que una entrada faltante es un error de compilación, no una
pantalla en blanco.

## Scripts

| script | qué hace |
|---|---|
| `pnpm dev` | dev server en :5173 (el CORS del backend permite ese origen) |
| `pnpm build` | typecheck de los tres proyectos de TS + build de producción |
| `pnpm test` | unit tests (Vitest + Testing Library) |
| `pnpm test:e2e` | e2e (Playwright, Chromium) |
| `pnpm lint` | oxlint |

`VITE_API_URL` apunta a la API; por defecto `http://localhost:8000`.

## E2E

Los e2e levantan la API y Vite por su cuenta (`playwright.config.ts`). La API corre
aislada: base de datos y uploads propios bajo el temp dir, así que la corrida no toca
`apps/api/actions.db` ni la storage del repo — podés tener tu propio server levantado
mientras corren.

| variable | default | para qué |
|---|---|---|
| `E2E_API_PORT` | `8000` | puerto de la API que levanta Playwright |
| `E2E_WEB_PORT` | `5173` | puerto de Vite; la API arranca con `CORS_ORIGINS` apuntando ahí |

Si esos puertos están ocupados, elegí otros:

```sh
E2E_API_PORT=8002 E2E_WEB_PORT=5174 pnpm test:e2e
```

Chromium necesita librerías de sistema; si falta alguna:
`sudo pnpm --filter web exec playwright install-deps chromium`.
