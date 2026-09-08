import { useState } from 'react';

import { completeAction } from '../../api/client';
import type { OnboardingPayload } from '../../types/domain';
import { FormShell } from './FormShell';
import type { CompletionFormProps } from './types';
import { useCompletionSubmit } from './useCompletionSubmit';

/**
 * Completes `onboarding`: tick the checklist steps that were done.
 *
 * The API rejects steps that are not in the action's own checklist, so the ticks are
 * rendered from that checklist rather than typed in — the invalid submission is
 * unreachable instead of merely reported.
 *
 * `action.payload.checklist` is a `string[]` here with no narrowing of its own: the task
 * is typed `Task<'onboarding'>`, so the payload shape comes from the contract.
 */
export function OnboardingForm({ action, onCompleted }: CompletionFormProps<'onboarding'>) {
  const { submit, submitting, error } = useCompletionSubmit(onCompleted);
  const { checklist } = action.payload;
  const [completed, setCompleted] = useState<ReadonlySet<string>>(new Set());

  function toggle(step: string) {
    setCompleted((current) => {
      const next = new Set(current);
      if (!next.delete(step)) next.add(step);
      return next;
    });
  }

  function handleSubmit() {
    // Sent in checklist order so the stored result reads the way the checklist does.
    const payload: OnboardingPayload = {
      completed_steps: checklist.filter((step) => completed.has(step)),
    };
    void submit((idempotencyKey) => completeAction(action.id, payload, idempotencyKey));
  }

  return (
    <FormShell
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
      submitLabel="Registrar pasos"
      // The API requires at least one step; don't spend a round trip to be told so.
      disabled={completed.size === 0}
    >
      <fieldset className="field">
        <legend>Pasos completados</legend>
        {checklist.map((step) => (
          <label className="field field--inline" key={step}>
            <input type="checkbox" checked={completed.has(step)} onChange={() => toggle(step)} />
            {step}
          </label>
        ))}
      </fieldset>
    </FormShell>
  );
}
