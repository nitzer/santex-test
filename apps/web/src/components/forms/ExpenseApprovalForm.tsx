import { useState } from 'react';

import { completeAction } from '../../api/client';
import type { ExpenseApprovalPayload } from '../../types/domain';
import { FormShell } from './FormShell';
import type { CompletionFormProps } from './types';
import { useCompletionSubmit } from './useCompletionSubmit';

/** Completes `expense_approval`: an approve/reject decision plus a comment. */
export function ExpenseApprovalForm({ action, onCompleted }: CompletionFormProps<'expense_approval'>) {
  const { submit, submitting, error } = useCompletionSubmit(onCompleted);
  const [approved, setApproved] = useState(true);
  const [comment, setComment] = useState('');

  function handleSubmit() {
    const payload: ExpenseApprovalPayload = { approved, comment };
    void submit((idempotencyKey) => completeAction(action.id, payload, idempotencyKey));
  }

  return (
    <FormShell
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
      submitLabel="Resolve expense"
    >
      <label className="field field--inline">
        <input
          type="checkbox"
          checked={approved}
          onChange={(event) => setApproved(event.target.checked)}
        />
        Approve the expense
      </label>

      <label className="field">
        Comment
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={3}
          placeholder="Why it is approved or rejected"
        />
      </label>
    </FormShell>
  );
}
