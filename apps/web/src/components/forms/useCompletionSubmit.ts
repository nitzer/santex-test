import { useCallback, useRef, useState } from 'react';

import { describeError } from '../../api/errors';
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey';
import type { AnyTask } from '../../types/domain';

/** How a form sends itself: it knows its endpoint, we hand it the key to send with. */
type Send = (idempotencyKey: string) => Promise<AnyTask>;

export interface CompletionSubmit {
  /** Runs `send` once at a time, reporting the API's `detail` when it refuses. */
  submit: (send: Send) => Promise<void>;
  submitting: boolean;
  error: string | null;
}

/**
 * The submission mechanics every completion form shares: one idempotency key for the
 * life of the form, one request in flight at a time, and the API's error text surfaced.
 *
 * Forms are left with just their fields and their endpoint call — the part that actually
 * differs per action type.
 */
export function useCompletionSubmit(onCompleted: (updated: AnyTask) => void): CompletionSubmit {
  const { key: idempotencyKey } = useIdempotencyKey();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref, not the state: two clicks in the same tick both read the pre-render state.
  const inFlight = useRef(false);

  const submit = useCallback(
    async (send: Send) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setSubmitting(true);
      setError(null);
      try {
        onCompleted(await send(idempotencyKey));
      } catch (caught) {
        setError(describeError(caught));
      } finally {
        inFlight.current = false;
        setSubmitting(false);
      }
    },
    [idempotencyKey, onCompleted],
  );

  return { submit, submitting, error };
}
