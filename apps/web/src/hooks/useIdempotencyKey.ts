import { useCallback, useState } from 'react';

export interface IdempotencyKey {
  /** The key to send with every attempt at the current operation. */
  key: string;
  /** Starts a new operation. Call it only after one has actually succeeded. */
  renew: () => void;
}

/**
 * One idempotency key per operation, kept across every retry of that operation.
 *
 * That is the point of the key: a double click, or a resend after the connection
 * dropped, must be recognised by the API as the *same* attempt and replay the stored
 * answer instead of applying the effect twice. Minting a key per click would defeat it —
 * the API would treat the second click as a new operation.
 *
 * For a form that closes when it succeeds, the initial key is the only one it ever needs.
 * A form that stays open to be used again calls `renew`, because the next submission is
 * a genuinely new operation and must not replay the previous one's answer.
 */
export function useIdempotencyKey(): IdempotencyKey {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const renew = useCallback(() => setKey(crypto.randomUUID()), []);
  return { key, renew };
}
