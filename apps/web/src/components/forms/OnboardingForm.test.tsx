import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { IDEMPOTENCY_HEADER } from '../../api/client';
import { makeTask } from '../../test/factories';
import { lastJsonBody, lastRequest, mockFetchOnceJson } from '../../test/fetchMock';
import { OnboardingForm } from './OnboardingForm';

const CHECKLIST = ['Create email account', 'Assign laptop', 'Grant repository access', 'Welcome session with the team'];

const action = makeTask('onboarding', {
  payload: { employee_name: 'Sofia Cabrera', checklist: CHECKLIST },
});

describe('OnboardingForm', () => {
  it('renders one checkbox per checklist step from the action payload', () => {
    render(<OnboardingForm action={action} onCompleted={vi.fn()} />);

    for (const step of CHECKLIST) {
      expect(screen.getByRole('checkbox', { name: step })).not.toBeChecked();
    }
    expect(screen.getAllByRole('checkbox')).toHaveLength(CHECKLIST.length);
  });

  it('cannot be submitted until at least one step is ticked', async () => {
    const user = userEvent.setup();
    render(<OnboardingForm action={action} onCompleted={vi.fn()} />);

    const submit = screen.getByRole('button', { name: /complete onboarding/i });
    expect(submit).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: CHECKLIST[0] as string }));
    expect(submit).toBeEnabled();
  });

  it('posts the ticked steps in checklist order with an Idempotency-Key', async () => {
    const completed = { ...action, status: 'completed' as const };
    const fetchSpy = mockFetchOnceJson(completed);
    const onCompleted = vi.fn();
    const user = userEvent.setup();

    render(<OnboardingForm action={action} onCompleted={onCompleted} />);
    // Ticked out of order on purpose: the payload must follow the checklist, not clicks.
    await user.click(screen.getByRole('checkbox', { name: CHECKLIST[2] as string }));
    await user.click(screen.getByRole('checkbox', { name: CHECKLIST[0] as string }));
    await user.click(screen.getByRole('button', { name: /complete onboarding/i }));

    const request = lastRequest(fetchSpy);
    expect(request.url).toContain(`/actions/${action.id}/complete`);
    expect(request.headers.get(IDEMPOTENCY_HEADER)).toBeTruthy();
    expect(lastJsonBody(fetchSpy)).toEqual({
      completed_steps: [CHECKLIST[0], CHECKLIST[2]],
    });
    expect(onCompleted).toHaveBeenCalledWith(completed);
  });

  // A payload without a checklist used to need a runtime guard and a test. It is now
  // unrepresentable: the form takes a `Task<'onboarding'>`, whose payload type comes
  // from the contract, so the compiler rejects that fixture instead of the test catching
  // it. The guarantee moved from a test to the type.
});
