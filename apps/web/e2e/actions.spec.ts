import { fileURLToPath } from 'node:url';

import { expect, test, type Locator, type Page } from '@playwright/test';

import type { ActionType } from '../src/types/domain';

const FIXTURE = fileURLToPath(new URL('./fixtures/platform-oncall-runbook.md', import.meta.url));

interface Scenario {
  /** The title the API seeds this type's example action with. */
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
    title: 'Approve client trip expense',
    complete: async (page) => {
      await page.getByRole('textbox', { name: 'Comment' }).fill('Within policy');
      await page.getByRole('button', { name: 'Resolve expense' }).click();
    },
    expectResult: async (result) => {
      await expect(result.getByText('Within policy')).toBeVisible();
      await expect(result.getByText('Yes')).toBeVisible();
    },
  },
  deployment_review: {
    title: 'Review checkout-api deployment to production',
    complete: async (page) => {
      await page.getByRole('checkbox', { name: 'Approve the deployment' }).uncheck();
      await page.getByRole('textbox', { name: 'Notes' }).fill('Missing rollback plan');
      await page.getByRole('button', { name: 'Resolve review' }).click();
    },
    expectResult: async (result) => {
      await expect(result.getByText('Missing rollback plan')).toBeVisible();
      await expect(result.getByText('No')).toBeVisible();
    },
  },
  documentation_upload: {
    title: 'Upload the incident runbook',
    complete: async (page) => {
      await page.getByLabel('File').setInputFiles(FIXTURE);
      await page.getByRole('button', { name: 'Upload document' }).click();
    },
    expectResult: async (result) => {
      // The API answers with what it actually wrote to disk.
      await expect(result.getByText('platform-oncall-runbook.md')).toBeVisible();
      await expect(result.getByText('text/markdown')).toBeVisible();
    },
  },
  onboarding: {
    title: 'Onboard Sofia Cabrera',
    complete: async (page) => {
      await page.getByRole('checkbox', { name: 'Create email account' }).check();
      await page.getByRole('checkbox', { name: 'Assign laptop' }).check();
      await page.getByRole('button', { name: 'Complete onboarding' }).click();
    },
    expectResult: async (result) => {
      await expect(result.getByText('Create email account')).toBeVisible();
      await expect(result.getByText('Assign laptop')).toBeVisible();
    },
  },
};

const scenarios = Object.entries(SCENARIOS) as [ActionType, Scenario][];

function groups(page: Page) {
  return {
    pending: page.getByRole('region', { name: 'Pending' }),
    completed: page.getByRole('region', { name: 'Completed' }),
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
test.describe.serial('action queue', () => {
  test('lists the four seeded actions as pending', async ({ page }) => {
    await page.goto('/');
    const { pending, completed } = groups(page);

    for (const [, scenario] of scenarios) {
      await expect(pending.getByRole('button', { name: scenario.title })).toBeVisible();
      await expect(completed.getByRole('button', { name: scenario.title })).toHaveCount(0);
    }
  });

  test('completes one action per type and moves it to completed', async ({ page }) => {
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
        await scenario.expectResult(detail.getByRole('region', { name: 'Result' }));
      });
    }

    for (const [, scenario] of scenarios) {
      await expect(completed.getByRole('button', { name: scenario.title })).toBeVisible();
      await expect(pending.getByRole('button', { name: scenario.title })).toHaveCount(0);
    }
  });
});

test('a double click does not submit the action twice', async ({ page }) => {
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
    title: 'Approve client trip expense',
    description: 'Flight and hotel for the on-site visit.',
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
          result: { approved: true, comment: 'Within policy' },
        },
      });
    }
    return route.fallback();
  });

  await page.goto('/');
  await page.getByRole('button', { name: pendingAction.title }).click();
  await page.getByRole('textbox', { name: 'Comment' }).fill('Within policy');

  const submit = page.getByRole('button', { name: 'Resolve expense' });
  await submit.click();

  // While the request is in flight the button says so and refuses further input.
  const sending = page.getByRole('button', { name: 'Sending…' });
  await expect(sending).toBeVisible();
  await expect(sending).toBeDisabled();

  // A forced second click, bypassing Playwright's actionability checks the way an
  // impatient double click would: it must still not reach the network.
  await sending.dispatchEvent('click');
  expect(posts).toBe(1);

  releaseResponse();

  const result = page.getByRole('article').getByRole('region', { name: 'Result' });
  await expect(result.getByText('Within policy')).toBeVisible();
  expect(posts).toBe(1);
});
