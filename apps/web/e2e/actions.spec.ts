import { fileURLToPath } from 'node:url';

import { expect, test, type Locator, type Page } from '@playwright/test';

import type { ActionType } from '../src/types/domain';

const FIXTURE = fileURLToPath(new URL('./fixtures/runbook-oncall-plataforma.md', import.meta.url));

interface Scenario {
  /** The title the API seeds this type's demo action with. */
  title: string;
  /** Fills and submits the form this type resolves to. */
  complete: (page: Page) => Promise<void>;
  /** What the stored `result` must show once the API has processed it. */
  expectResult: (result: Locator) => Promise<void>;
}

/**
 * One scenario per action type, keyed the same way the app keys its form registry.
 *
 * `Record<ActionType, Scenario>` makes the coverage exhaustive by construction: a fifth
 * action type cannot be added to the API without this file failing to compile until an
 * end-to-end scenario exists for it.
 */
const SCENARIOS: Record<ActionType, Scenario> = {
  expense_approval: {
    title: 'Aprobar gasto de viaje a cliente',
    complete: async (page) => {
      await page.getByRole('textbox', { name: 'Comentario' }).fill('Dentro de política');
      await page.getByRole('button', { name: 'Resolver gasto' }).click();
    },
    expectResult: async (result) => {
      await expect(result.getByText('Dentro de política')).toBeVisible();
      await expect(result.getByText('Sí')).toBeVisible();
    },
  },
  deployment_review: {
    title: 'Revisar deploy de checkout-api a produccion',
    complete: async (page) => {
      await page.getByRole('checkbox', { name: 'Aprobar el deploy' }).uncheck();
      await page.getByRole('textbox', { name: 'Notas' }).fill('Falta plan de rollback');
      await page.getByRole('button', { name: 'Resolver review' }).click();
    },
    expectResult: async (result) => {
      await expect(result.getByText('Falta plan de rollback')).toBeVisible();
      await expect(result.getByText('No')).toBeVisible();
    },
  },
  documentation_upload: {
    title: 'Subir el runbook de incidentes',
    complete: async (page) => {
      await page.getByLabel('Documento').setInputFiles(FIXTURE);
      await page.getByRole('button', { name: 'Subir documento' }).click();
    },
    expectResult: async (result) => {
      // The API answers with what it actually wrote to disk.
      await expect(result.getByText('runbook-oncall-plataforma.md')).toBeVisible();
      await expect(result.getByText('text/markdown')).toBeVisible();
    },
  },
  onboarding: {
    title: 'Onboarding de Sofia Cabrera',
    complete: async (page) => {
      await page.getByRole('checkbox', { name: 'Crear cuenta de correo' }).check();
      await page.getByRole('checkbox', { name: 'Asignar notebook' }).check();
      await page.getByRole('button', { name: 'Registrar pasos' }).click();
    },
    expectResult: async (result) => {
      await expect(result.getByText('Crear cuenta de correo')).toBeVisible();
      await expect(result.getByText('Asignar notebook')).toBeVisible();
    },
  },
};

const scenarios = Object.entries(SCENARIOS) as [ActionType, Scenario][];

function groups(page: Page) {
  return {
    pending: page.getByRole('region', { name: 'Pendientes' }),
    completed: page.getByRole('region', { name: 'Completadas' }),
    detail: page.getByRole('article'),
  };
}

/*
 * These two share one API process and one database, so they run in order.
 *
 * They assert about the four seeded tasks by name rather than by counting the whole
 * queue: another spec file creating tasks against the same server must not be able to
 * break them, whichever order the files happen to run in.
 */
test.describe.serial('cola de acciones', () => {
  test('lista las cuatro acciones del seed como pendientes', async ({ page }) => {
    await page.goto('/');
    const { pending, completed } = groups(page);

    for (const [, scenario] of scenarios) {
      await expect(pending.getByRole('button', { name: scenario.title })).toBeVisible();
      await expect(completed.getByRole('button', { name: scenario.title })).toHaveCount(0);
    }
  });

  test('completa una acción de cada tipo y la mueve a completadas', async ({ page }) => {
    await page.goto('/');
    const { pending, completed, detail } = groups(page);

    for (const [type, scenario] of scenarios) {
      await test.step(type, async () => {
        await pending.getByRole('button', { name: scenario.title }).click();
        await expect(detail.getByRole('heading', { name: scenario.title })).toBeVisible();

        await scenario.complete(page);

        // The API's answer is what the screen now shows: status, section and result.
        await expect(completed.getByRole('button', { name: scenario.title })).toBeVisible();
        await expect(pending.getByRole('button', { name: scenario.title })).toHaveCount(0);
        await scenario.expectResult(detail.getByRole('region', { name: 'Resultado' }));
      });
    }

    for (const [, scenario] of scenarios) {
      await expect(completed.getByRole('button', { name: scenario.title })).toBeVisible();
      await expect(pending.getByRole('button', { name: scenario.title })).toHaveCount(0);
    }
  });
});

test('un doble click no envía la acción dos veces', async ({ page }) => {
  /*
   * Against a stubbed API rather than the real one, for two reasons: the response can be
   * held open for as long as the assertions need, and the number of requests that left
   * the browser can be counted exactly — which is the actual claim being made here.
   *
   * The stub must speak CORS itself, since the app is served from a different origin
   * than the API and Playwright fulfils these requests without the real server's headers.
   */
  const cors = (origin: string | undefined) => ({
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
  });
  const pendingAction = {
    id: 'stub-1',
    type: 'expense_approval',
    title: 'Aprobar gasto de viaje a cliente',
    description: 'Vuelo y hotel para la visita on-site.',
    requester: 'lucia.mendez@ops.example',
    status: 'pending',
    created_at: '2026-01-15T10:00:00Z',
    completed_at: null,
    payload: { amount: 1240.5, currency: 'USD' },
    result: null,
  };

  let posts = 0;
  let releaseResponse = () => {};
  const held = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });

  await page.route('**/actions**', async (route) => {
    const headers = cors(route.request().headers()['origin']);
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers });
    }
    const { pathname } = new URL(route.request().url());
    if (pathname === '/actions') {
      return route.fulfill({ headers, json: [pendingAction] });
    }
    if (pathname === `/actions/${pendingAction.id}/complete`) {
      posts += 1;
      await held;
      return route.fulfill({
        headers,
        json: {
          ...pendingAction,
          status: 'completed',
          completed_at: '2026-01-15T11:00:00Z',
          result: { approved: true, comment: 'Dentro de política' },
        },
      });
    }
    return route.fallback();
  });

  await page.goto('/');
  await page.getByRole('button', { name: pendingAction.title }).click();
  await page.getByRole('textbox', { name: 'Comentario' }).fill('Dentro de política');

  const submit = page.getByRole('button', { name: 'Resolver gasto' });
  await submit.click();

  // While the request is in flight the button says so and refuses further input.
  const sending = page.getByRole('button', { name: 'Enviando…' });
  await expect(sending).toBeVisible();
  await expect(sending).toBeDisabled();

  // A forced second click, bypassing Playwright's actionability checks the way an
  // impatient double click would: it must still not reach the network.
  await sending.dispatchEvent('click');
  expect(posts).toBe(1);

  releaseResponse();

  const result = page.getByRole('article').getByRole('region', { name: 'Resultado' });
  await expect(result.getByText('Dentro de política')).toBeVisible();
  expect(posts).toBe(1);
});
