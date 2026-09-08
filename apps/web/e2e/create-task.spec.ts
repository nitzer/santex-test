import { expect, test, type Page } from '@playwright/test';

import type { ActionType } from '../src/types/domain';

interface Creation {
  /** What to type into the title field, and what to look for in the list afterwards. */
  title: string;
  /** Fills the fields this type's schema produced, by their schema titles. */
  fillPayload: (page: Page) => Promise<void>;
  /** A value the created task's detail must show back. */
  shows: string;
}

/**
 * One creation per action type, keyed the way the backend keys its registry.
 *
 * `Record<ActionType, Creation>` makes the coverage exhaustive by construction: the
 * backend cannot register a fifth type without this file failing to compile until
 * someone decides what creating one looks like.
 */
const CREATIONS: Record<ActionType, Creation> = {
  expense_approval: {
    title: 'Gasto de conferencia',
    fillPayload: async (page) => {
      await page.getByLabel(/^Monto/).fill('980.25');
      await page.getByLabel(/^Moneda/).fill('EUR');
      await page.getByLabel(/^Comprobante/).fill('https://receipts.example/conf-2026.pdf');
    },
    shows: '980.25',
  },
  deployment_review: {
    title: 'Deploy de billing-api',
    fillPayload: async (page) => {
      await page.getByLabel(/^Servicio/).fill('billing-api');
      await page.getByLabel(/^Versión/).fill('1.4.2');
      await page.getByLabel(/^Entorno/).fill('staging');
    },
    shows: 'billing-api',
  },
  documentation_upload: {
    title: 'Subir la guía de estilo',
    fillPayload: async (page) => {
      await page.getByLabel(/^Nombre del documento/).fill('guia-de-estilo.md');
    },
    shows: 'guia-de-estilo.md',
  },
  onboarding: {
    title: 'Onboarding de Bruno Vega',
    fillPayload: async (page) => {
      await page.getByLabel(/^Nombre del empleado/).fill('Bruno Vega');
      const item = page.getByRole('textbox', { name: /Checklist: nuevo ítem/ });
      await item.fill('Crear cuenta de correo');
      await item.press('Enter');
      await item.fill('Asignar notebook');
      await item.press('Enter');
    },
    shows: 'Bruno Vega',
  },
};

const creations = Object.entries(CREATIONS) as [ActionType, Creation][];

function parts(page: Page) {
  return {
    pending: page.getByRole('region', { name: 'Pendientes' }),
    detail: page.getByRole('article'),
    addButton: page.getByRole('button', { name: 'Agregar tarea' }),
    typeSelect: page.getByRole('combobox', { name: 'Tipo' }),
  };
}

async function createTask(page: Page, type: ActionType, creation: Creation) {
  const { addButton, typeSelect } = parts(page);

  await addButton.click();
  await expect(typeSelect).toBeVisible();
  // Selected by value, not by label: the label is the backend's copy and may be reworded
  // without that meaning the type is gone.
  await typeSelect.selectOption(type);

  await page.getByLabel(/^Título/).fill(creation.title);
  await page.getByLabel(/^Descripción/).fill(`Creada desde la UI en el test e2e (${type}).`);
  await page.getByLabel(/^Solicitante/).fill('e2e@ops.example');
  await creation.fillPayload(page);

  await page.getByRole('button', { name: 'Crear tarea' }).click();
  // The panel closes only once the API has answered 201.
  await expect(typeSelect).toBeHidden();
}

test.describe.serial('crear tareas', () => {
  test('la pantalla ofrece agregar una tarea y no un refresco manual', async ({ page }) => {
    await page.goto('/');
    const { addButton } = parts(page);

    await expect(addButton).toBeVisible();
    await expect(page.getByRole('button', { name: /refrescar/i })).toHaveCount(0);
  });

  test('el formulario cambia sus campos según el tipo elegido', async ({ page }) => {
    await page.goto('/');
    const { addButton, typeSelect } = parts(page);

    await addButton.click();
    await typeSelect.selectOption('expense_approval');
    await expect(page.getByLabel(/^Monto/)).toBeVisible();
    await expect(page.getByLabel(/^Nombre del empleado/)).toHaveCount(0);

    // The base fields belong to the task, not to its type, so they survive the switch.
    await page.getByLabel(/^Título/).fill('Sigue acá');
    await typeSelect.selectOption('onboarding');

    await expect(page.getByLabel(/^Nombre del empleado/)).toBeVisible();
    await expect(page.getByLabel(/^Monto/)).toHaveCount(0);
    await expect(page.getByLabel(/^Título/)).toHaveValue('Sigue acá');
  });

  test('crea una tarea de cada tipo y la deja en pendientes', async ({ page }) => {
    await page.goto('/');
    const { pending, detail } = parts(page);
    // Counted as a delta, so this spec does not care what else is in the queue.
    const before = await pending.getByRole('button').count();

    for (const [type, creation] of creations) {
      await test.step(type, async () => {
        await createTask(page, type, creation);

        // The created task is selected, and its payload came back from the API.
        await expect(detail.getByRole('heading', { name: creation.title })).toBeVisible();
        await expect(detail.getByRole('region', { name: 'Datos' })).toContainText(creation.shows);
        await expect(pending.getByRole('button', { name: creation.title })).toBeVisible();
      });
    }

    await expect(pending.getByRole('button')).toHaveCount(before + creations.length);
  });

  test('una tarea recién creada se puede completar', async ({ page }) => {
    await page.goto('/');
    const { pending, detail } = parts(page);
    const created = CREATIONS.expense_approval;

    await pending.getByRole('button', { name: created.title }).click();
    await detail.getByRole('textbox', { name: 'Comentario' }).fill('Aprobado tras revisión');
    await detail.getByRole('button', { name: 'Resolver gasto' }).click();

    const result = detail.getByRole('region', { name: 'Resultado' });
    await expect(result.getByText('Aprobado tras revisión')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Completadas' }).getByRole('button', {
        name: created.title,
      }),
    ).toBeVisible();
  });
});
