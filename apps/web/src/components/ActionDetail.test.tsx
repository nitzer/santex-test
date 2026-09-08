import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { makeTask } from '../test/factories';
import { ActionDetail } from './ActionDetail';

describe('ActionDetail', () => {
  it('shows the action and the form its type resolves to, with no branching of its own', () => {
    const action = makeTask('documentation_upload', {
      title: 'Upload the incident runbook',
      description: 'The runbook needs updating.',
      requester: 'martin.rios@ops.example',
      payload: { document_name: 'runbook.md' },
    });

    render(<ActionDetail action={action} onCompleted={vi.fn()} />);

    expect(screen.getByRole('heading', { name: action.title })).toBeInTheDocument();
    expect(screen.getByText(action.description)).toBeInTheDocument();
    expect(screen.getByText(action.requester)).toBeInTheDocument();
    expect(screen.getByText('runbook.md')).toBeInTheDocument();
    // Resolved through the registry: only DocumentUploadForm offers this control.
    expect(screen.getByRole('button', { name: /upload document/i })).toBeInTheDocument();
  });

  it('shows the result instead of a form once the action is completed', () => {
    const action = makeTask('expense_approval', {
      status: 'completed',
      completed_at: '2026-01-16T09:00:00Z',
      payload: { amount: 1240.5, currency: 'USD', receipt_url: 'https://receipts.example/x.pdf' },
      result: { approved: true, comment: 'Within policy' },
    });

    render(<ActionDetail action={action} onCompleted={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /result/i })).toBeInTheDocument();
    expect(screen.getByText('Within policy')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resolve expense/i })).not.toBeInTheDocument();
  });
});
