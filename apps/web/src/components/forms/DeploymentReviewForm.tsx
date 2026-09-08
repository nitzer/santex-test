import { useState } from 'react';

import { completeAction } from '../../api/client';
import type { DeploymentReviewPayload } from '../../types/domain';
import { FormShell } from './FormShell';
import type { CompletionFormProps } from './types';
import { useCompletionSubmit } from './useCompletionSubmit';

/** Completes `deployment_review`: a go/no-go on the release plus review notes. */
export function DeploymentReviewForm({ action, onCompleted }: CompletionFormProps<'deployment_review'>) {
  const { submit, submitting, error } = useCompletionSubmit(onCompleted);
  const [approved, setApproved] = useState(true);
  const [notes, setNotes] = useState('');

  function handleSubmit() {
    const payload: DeploymentReviewPayload = { approved, notes };
    void submit((idempotencyKey) => completeAction(action.id, payload, idempotencyKey));
  }

  return (
    <FormShell
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
      submitLabel="Resolver review"
    >
      <label className="field field--inline">
        <input
          type="checkbox"
          checked={approved}
          onChange={(event) => setApproved(event.target.checked)}
        />
        Aprobar el deploy
      </label>

      <label className="field">
        Notas
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          placeholder="Qué se revisó, riesgos, plan de rollback"
        />
      </label>
    </FormShell>
  );
}
