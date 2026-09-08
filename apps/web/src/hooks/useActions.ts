import { useCallback, useEffect, useState } from 'react';

import { listActions } from '../api/client';
import { describeError } from '../api/errors';
import type { AnyTask } from '../types/domain';

export interface UseActions {
  actions: readonly AnyTask[];
  loading: boolean;
  error: string | null;
  /** Puts a newly created task at the front of the list. */
  add: (created: AnyTask) => void;
  /** Swaps in the task a completion returned, leaving the rest of the list untouched. */
  replace: (updated: AnyTask) => void;
  /** Refetches from scratch. Used to recover from a failed initial load. */
  reload: () => void;
}

/**
 * Loads the task queue and keeps it in sync as tasks are created and completed.
 *
 * Every mutating endpoint answers with the stored task, so the list stays current by
 * folding those responses in — which is why the screen needs no manual refresh button.
 */
export function useActions(): UseActions {
  const [actions, setActions] = useState<readonly AnyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    // A reload that resolves after the component is gone must not set state.
    let active = true;

    listActions()
      .then((loaded) => {
        if (active) setActions(loaded);
      })
      .catch((caught: unknown) => {
        if (active) setError(describeError(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadToken]);

  const add = useCallback((created: AnyTask) => {
    setActions((current) => [created, ...current]);
  }, []);

  const replace = useCallback((updated: AnyTask) => {
    setActions((current) =>
      current.map((action) => (action.id === updated.id ? updated : action)),
    );
  }, []);

  // Entering the loading state belongs to the event that asked for the reload, not to
  // the effect: setting it inside the effect would cost a second render every time.
  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadToken((token) => token + 1);
  }, []);

  return { actions, loading, error, add, replace, reload };
}
