# web

Frontend for Pending Actions. React + TypeScript + Vite, one screen: the task queue on the left, the detail and the completion form on the right. In the UI an action is called a *task*.

## Contract

Types come from the backend, never typed by hand:

```sh
pnpm gen:types   # from the repo root: apps/api/openapi.json -> src/types/api.d.ts
```

`src/types/domain.ts` derives the base → type inheritance from it: `BaseTask` (what every task has) and `Task<'expense_approval'>`… (base + that type's payload, taken from the `*Create` schemas), joined in `AnyTask`, discriminated by `type`. If the contract moves, the compiler points at every place that must adapt.

## Adding an action type

**Creation ("Add task"): no code.** The type selector and the fields are generated from `GET /action-types` (`SchemaFields` renders each type's `payload_schema`), so a new backend type shows up on its own, with its fields, labels and hints.

**Completion:** mirrors the backend's handler registry:

1. Create `src/components/forms/MyNewForm.tsx` implementing `CompletionFormProps`.
2. Add its entry to `src/components/forms/registry.ts` and its payload to `TaskPayloadByType` (`src/types/domain.ts`).

Nothing else changes: no component branches on `action.type`. Both maps are `Record<ActionType, …>`, so a missing entry is a compile error, not a blank screen.

## Scripts

| script | what it does |
|---|---|
| `pnpm dev` | dev server on :5173 (the backend's default CORS origin) |
| `pnpm build` | typecheck of the three TS projects + production build |
| `pnpm test` | unit tests (Vitest + Testing Library) |
| `pnpm test:e2e` | end-to-end (Playwright, Chromium) |
| `pnpm lint` | oxlint |

`VITE_API_URL` points at the API; default `http://localhost:8000`.

## E2E

The e2e boot the API and Vite themselves (`playwright.config.ts`). The API runs isolated — its own database and uploads under the temp dir — so a run never touches `apps/api/actions.db` or the repo's storage, and you can keep your own servers up while they run.

| variable | default | purpose |
|---|---|---|
| `E2E_API_PORT` | `8000` | port of the API Playwright starts |
| `E2E_WEB_PORT` | `5173` | Vite's port; the API starts with `CORS_ORIGINS` pointing there |

If those ports are busy, pick others:

```sh
E2E_API_PORT=8002 E2E_WEB_PORT=5174 pnpm test:e2e
```

Chromium needs system libraries; if any is missing:
`sudo pnpm --filter web exec playwright install-deps chromium`.
