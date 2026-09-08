import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { IDEMPOTENCY_HEADER } from '../../api/client';
import { makeTask } from '../../test/factories';
import { lastJsonBody, lastRequest, mockFetchOnceJson } from '../../test/fetchMock';
import { DeploymentReviewForm } from './DeploymentReviewForm';

const action = makeTask('deployment_review', {
  payload: { service: 'checkout-api', version: '2.14.0', environment: 'production' },
});

describe('DeploymentReviewForm', () => {
  it('renders the approve toggle and the notes field', () => {
    render(<DeploymentReviewForm action={action} onCompleted={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: /approve the deployment/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /notes/i })).toBeInTheDocument();
  });

  it('posts approved and notes to /complete with an Idempotency-Key', async () => {
    const completed = { ...action, status: 'completed' as const };
    const fetchSpy = mockFetchOnceJson(completed);
    const onCompleted = vi.fn();
    const user = userEvent.setup();

    render(<DeploymentReviewForm action={action} onCompleted={onCompleted} />);
    await user.type(screen.getByRole('textbox', { name: /notes/i }), 'Rollback tested');
    await user.click(screen.getByRole('button', { name: /resolve review/i }));

    const request = lastRequest(fetchSpy);
    expect(request.url).toContain(`/actions/${action.id}/complete`);
    expect(request.method).toBe('POST');
    expect(request.headers.get(IDEMPOTENCY_HEADER)).toBeTruthy();
    expect(lastJsonBody(fetchSpy)).toEqual({ approved: true, notes: 'Rollback tested' });
    expect(onCompleted).toHaveBeenCalledWith(completed);
  });

  it('keeps one idempotency key across a retry of the same submission', async () => {
    // First attempt fails at the network; the second must reuse the key, or the API
    // would treat the retry as a second, distinct completion.
    let attempt = 0;
    const keys: (string | null)[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      keys.push(new Headers(init?.headers).get(IDEMPOTENCY_HEADER));
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new Error('network down'))
        : Promise.resolve(
            new Response(JSON.stringify(action), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
    });
    const user = userEvent.setup();

    render(<DeploymentReviewForm action={action} onCompleted={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /resolve review/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('network down');
    await user.click(screen.getByRole('button', { name: /resolve review/i }));

    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });
});
