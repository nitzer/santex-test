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
    title: 'Conference expense',
    fillPayload: async (page) => {
      await page.getByLabel(/^Amount/).fill('980.25');
      await page.getByLabel(/^Currency/).fill('EUR');
      await page.getByLabel(/^Receipt/).fill('https://receipts.example/conf-2026.pdf');
    },
    shows: '980.25',
  },
  deployment_review: {
    title: 'billing-api deployment',
    fillPayload: async (page) => {
      await page.getByLabel(/^Service/).fill('billing-api');
      await page.getByLabel(/^Version/).fill('1.4.2');
      await page.getByLabel(/^Environment/).fill('staging');
    },
    shows: 'billing-api',
  },
  documentation_upload: {
    title: 'Upload style guide',
    fillPayload: async (page) => {
      await page.getByLabel(/^Document name/).fill('style-guide.md');
    },
    shows: 'style-guide.md',
  },
  onboarding: {
    title: 'Bruno Vega onboarding',
    fillPayload: async (page) => {
      await page.getByLabel(/^Employee name/).fill('Bruno Vega');
      const item = page.getByRole('textbox', { name: /Checklist: new item/ });
      await item.fill('Create email account');
      await item.press('Enter');
      await item.fill('Assign laptop');
      await item.press('Enter');
    },
    shows: 'Bruno Vega',
  },
};

const creations = Object.entries(CREATIONS) as [ActionType, Creation][];

function parts(page: Page) {
  return {
    pending: page.getByRole('region', { name: 'Pending' }),
    detail: page.getByRole('article'),
    addButton: page.getByRole('button', { name: 'Add task' }),
    typeSelect: page.getByRole('combobox', { name: 'Type' }),
  };
}

async function createTask(page: Page, type: ActionType, creation: Creation) {
  const { addButton, typeSelect } = parts(page);

  await addButton.click();
  await expect(typeSelect).toBeVisible();
  // Selected by value, not by label: the label is the backend's copy and may be reworded
  // without that meaning the type is gone.
  await typeSelect.selectOption(type);

  await page.getByLabel(/^Title/).fill(creation.title);
  await page.getByLabel(/^Description/).fill(`Created from the UI in the e2e test (${type}).`);
  await page.getByLabel(/^Requester/).fill('e2e@ops.example');
  await creation.fillPayload(page);

  await page.getByRole('button', { name: 'Create task' }).click();
  // The panel closes only once the API has answered 201.
  await expect(typeSelect).toBeHidden();
}

test.describe.serial('create tasks', () => {
  test('the screen offers adding a task and not a manual refresh', async ({ page }) => {
    await page.goto('/');
    const { addButton } = parts(page);

    await expect(addButton).toBeVisible();
    await expect(page.getByRole('button', { name: /refresh/i })).toHaveCount(0);
  });

  test('the form changes its fields according to the selected type', async ({ page }) => {
    await page.goto('/');
    const { addButton, typeSelect } = parts(page);

    await addButton.click();
    await typeSelect.selectOption('expense_approval');
    await expect(page.getByLabel(/^Amount/)).toBeVisible();
    await expect(page.getByLabel(/^Employee name/)).toHaveCount(0);

    // The base fields belong to the task, not to its type, so they survive the switch.
    await page.getByLabel(/^Title/).fill('Still here');
    await typeSelect.selectOption('onboarding');

    await expect(page.getByLabel(/^Employee name/)).toBeVisible();
    await expect(page.getByLabel(/^Amount/)).toHaveCount(0);
    await expect(page.getByLabel(/^Title/)).toHaveValue('Still here');
  });

  test('creates one task per type and leaves it in pending', async ({ page }) => {
    await page.goto('/');
    const { pending, detail } = parts(page);
    // Counted as a delta, so this spec does not care what else is in the queue.
    const before = await pending.getByRole('button').count();

    for (const [type, creation] of creations) {
      await test.step(type, async () => {
        await createTask(page, type, creation);

        // The created task is selected, and its payload came back from the API.
        await expect(detail.getByRole('heading', { name: creation.title })).toBeVisible();
        await expect(detail.getByRole('region', { name: 'Details' })).toContainText(creation.shows);
        await expect(pending.getByRole('button', { name: creation.title })).toBeVisible();
      });
    }

    await expect(pending.getByRole('button')).toHaveCount(before + creations.length);
  });

  test('a newly created task can be completed', async ({ page }) => {
    await page.goto('/');
    const { pending, detail } = parts(page);
    const created = CREATIONS.expense_approval;

    await pending.getByRole('button', { name: created.title }).click();
    await detail.getByRole('textbox', { name: 'Comment' }).fill('Approved after review');
    await detail.getByRole('button', { name: 'Resolve expense' }).click();

    const result = detail.getByRole('region', { name: 'Result' });
    await expect(result.getByText('Approved after review')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Completed' }).getByRole('button', {
        name: created.title,
      }),
    ).toBeVisible();
  });
});
