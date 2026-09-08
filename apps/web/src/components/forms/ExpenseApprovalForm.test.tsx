import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { IDEMPOTENCY_HEADER } from '../../api/client';
import { makeTask } from '../../test/factories';
import { lastJsonBody, lastRequest, mockFetchOnceJson } from '../../test/fetchMock';
import { ExpenseApprovalForm } from './ExpenseApprovalForm';

const action = makeTask('expense_approval', {
  payload: { amount: 1240.5, currency: 'USD', receipt_url: 'https://receipts.example/x.pdf' },
});

describe('ExpenseApprovalForm', () => {
  it('renders the approve toggle and the comment field', () => {
    render(<ExpenseApprovalForm action={action} onCompleted={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: /approve the expense/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /comment/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resolve expense/i })).toBeEnabled();
  });

  it('posts approved and comment to /complete with an Idempotency-Key', async () => {
    const completed = { ...action, status: 'completed' as const };
    const fetchSpy = mockFetchOnceJson(completed);
    const onCompleted = vi.fn();
    const user = userEvent.setup();

    render(<ExpenseApprovalForm action={action} onCompleted={onCompleted} />);
    await user.type(screen.getByRole('textbox', { name: /comment/i }), 'Within policy');
    await user.click(screen.getByRole('button', { name: /resolve expense/i }));

    const request = lastRequest(fetchSpy);
    expect(request.url).toContain(`/actions/${action.id}/complete`);
    expect(request.method).toBe('POST');
    expect(request.headers.get(IDEMPOTENCY_HEADER)).toBeTruthy();
    expect(lastJsonBody(fetchSpy)).toEqual({ approved: true, comment: 'Within policy' });
    expect(onCompleted).toHaveBeenCalledWith(completed);
  });

  it('sends approved: false when the expense is rejected', async () => {
    const fetchSpy = mockFetchOnceJson(action);
    const user = userEvent.setup();

    render(<ExpenseApprovalForm action={action} onCompleted={vi.fn()} />);
    await user.click(screen.getByRole('checkbox', { name: /approve the expense/i }));
    await user.type(screen.getByRole('textbox', { name: /comment/i }), 'Receipt missing');
    await user.click(screen.getByRole('button', { name: /resolve expense/i }));

    expect(lastJsonBody(fetchSpy)).toEqual({ approved: false, comment: 'Receipt missing' });
  });

  it('shows the detail the API refused with', async () => {
    mockFetchOnceJson({ detail: 'action is already completed' }, 409);
    const onCompleted = vi.fn();
    const user = userEvent.setup();

    render(<ExpenseApprovalForm action={action} onCompleted={onCompleted} />);
    await user.click(screen.getByRole('button', { name: /resolve expense/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('action is already completed');
    expect(onCompleted).not.toHaveBeenCalled();
  });
});
