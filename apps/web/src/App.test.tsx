import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import App from './App';
import { makeTask } from './test/factories';
import { jsonResponse, mockFetch } from './test/fetchMock';

const seeded = makeTask('expense_approval', { title: 'Aprobar gasto de viaje' });
const createdTask = makeTask('onboarding', { title: 'Onboarding de Sofia' });

const DESCRIPTORS = [
  {
    type: 'onboarding',
    label: 'Onboarding',
    completion: 'json',
    schema_name: 'OnboardingCreate',
    payload_schema: {
      type: 'object',
      properties: { employee_name: { type: 'string', title: 'Employee Name' } },
      required: ['employee_name'],
    },
  },
];

function mockApi() {
  return mockFetch((url, init) => {
    if (url.endsWith('/action-types')) return Promise.resolve(jsonResponse(DESCRIPTORS));
    if (init?.method === 'POST') return Promise.resolve(jsonResponse(createdTask, 201));
    return Promise.resolve(jsonResponse([seeded]));
  });
}

describe('App', () => {
  it('offers adding a task instead of a manual refresh', async () => {
    mockApi();
    render(<App />);

    await screen.findByRole('button', { name: 'Agregar tarea' });
    // The list stays current by folding in what the mutating endpoints answer, so there
    // is nothing for a refresh button to do.
    expect(screen.queryByRole('button', { name: /refrescar/i })).not.toBeInTheDocument();
  });

  it('opens the creation form and adds the created task to the pending list', async () => {
    mockApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Agregar tarea' }));
    await screen.findByRole('combobox', { name: 'Tipo' });

    await user.type(screen.getByLabelText(/^Título/), 'Onboarding de Sofia');
    await user.type(screen.getByLabelText(/^Descripción/), 'Primer día el lunes');
    await user.type(screen.getByLabelText(/^Solicitante/), 'people@ops.example');
    await user.type(screen.getByLabelText(/^Employee Name/), 'Sofia Cabrera');
    await user.click(screen.getByRole('button', { name: 'Crear tarea' }));

    // The panel closes, the new task is in the list, and it is what is on screen.
    await waitFor(() =>
      expect(screen.queryByRole('combobox', { name: 'Tipo' })).not.toBeInTheDocument(),
    );
    const pending = screen.getByRole('region', { name: 'Pendientes' });
    expect(within(pending).getByRole('button', { name: /onboarding de sofia/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Onboarding de Sofia' })).toBeInTheDocument();
  });

  it('lets a failed load be retried', async () => {
    let attempt = 0;
    mockFetch(() => {
      attempt += 1;
      return Promise.resolve(
        attempt === 1 ? jsonResponse({ detail: 'boom' }, 500) : jsonResponse([seeded]),
      );
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('button', { name: /aprobar gasto de viaje/i })).toBeVisible();
  });
});
