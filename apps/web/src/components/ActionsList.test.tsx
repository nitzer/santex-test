import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { makeTask } from '../test/factories';
import { ActionsList } from './ActionsList';

const pendingExpense = makeTask('expense_approval', { title: 'Aprobar gasto de viaje' });
const pendingUpload = makeTask('documentation_upload', { title: 'Subir el runbook' });
const doneOnboarding = makeTask('onboarding', {
  title: 'Onboarding de Sofia',
  status: 'completed',
  completed_at: '2026-01-16T09:00:00Z',
  result: { completed_steps: ['Asignar notebook'] },
});

const actions = [pendingExpense, doneOnboarding, pendingUpload];

function groupItems(name: RegExp) {
  return within(screen.getByRole('region', { name })).getAllByRole('button');
}

describe('ActionsList', () => {
  it('splits the queue into pending and completed', () => {
    render(<ActionsList actions={actions} selectedId={null} onSelect={vi.fn()} />);

    expect(groupItems(/pendientes/i).map((item) => item.textContent)).toEqual([
      'Aprobar gasto de viajeGasto',
      'Subir el runbookDocumento',
    ]);
    expect(groupItems(/completadas/i).map((item) => item.textContent)).toEqual([
      'Onboarding de SofiaOnboarding',
    ]);
  });

  it('counts each group', () => {
    render(<ActionsList actions={actions} selectedId={null} onSelect={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /pendientes 2/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /completadas 1/i })).toBeInTheDocument();
  });

  it('reports the clicked action to its caller', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ActionsList actions={actions} selectedId={null} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /subir el runbook/i }));

    expect(onSelect).toHaveBeenCalledWith(pendingUpload);
  });

  it('marks the selected action as current', () => {
    render(<ActionsList actions={actions} selectedId={doneOnboarding.id} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: /onboarding de sofia/i })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: /aprobar gasto/i })).toHaveAttribute(
      'aria-current',
      'false',
    );
  });

  it('says so when a group is empty', () => {
    render(<ActionsList actions={[pendingExpense]} selectedId={null} onSelect={vi.fn()} />);

    const completed = screen.getByRole('region', { name: /completadas/i });
    expect(within(completed).getByText(/nada por acá/i)).toBeInTheDocument();
  });
});
