import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { makeTask } from '../test/factories';
import { ActionsList } from './ActionsList';

const pendingExpense = makeTask('expense_approval', { title: 'Approve travel expense' });
const pendingUpload = makeTask('documentation_upload', { title: 'Upload the incident runbook' });
const doneOnboarding = makeTask('onboarding', {
  title: 'Sofia onboarding',
  status: 'completed',
  completed_at: '2026-01-16T09:00:00Z',
  result: { completed_steps: ['Assign laptop'] },
});

const actions = [pendingExpense, doneOnboarding, pendingUpload];

function groupItems(name: RegExp) {
  return within(screen.getByRole('region', { name })).getAllByRole('button');
}

describe('ActionsList', () => {
  it('splits the queue into pending and completed', () => {
    render(<ActionsList actions={actions} selectedId={null} onSelect={vi.fn()} />);

    expect(groupItems(/pending/i).map((item) => item.textContent)).toEqual([
      'Approve travel expenseExpense',
      'Upload the incident runbookDocument',
    ]);
    expect(groupItems(/completed/i).map((item) => item.textContent)).toEqual([
      'Sofia onboardingOnboarding',
    ]);
  });

  it('counts each group', () => {
    render(<ActionsList actions={actions} selectedId={null} onSelect={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /pending 2/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /completed 1/i })).toBeInTheDocument();
  });

  it('reports the clicked action to its caller', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ActionsList actions={actions} selectedId={null} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /upload the incident runbook/i }));

    expect(onSelect).toHaveBeenCalledWith(pendingUpload);
  });

  it('marks the selected action as current', () => {
    render(<ActionsList actions={actions} selectedId={doneOnboarding.id} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: /sofia onboarding/i })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: /approve travel/i })).toHaveAttribute(
      'aria-current',
      'false',
    );
  });

  it('says so when a group is empty', () => {
    render(<ActionsList actions={[pendingExpense]} selectedId={null} onSelect={vi.fn()} />);

    const completed = screen.getByRole('region', { name: /completed/i });
    expect(within(completed).getByText(/nothing here/i)).toBeInTheDocument();
  });
});
