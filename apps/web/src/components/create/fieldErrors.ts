import { ApiError } from '../../api/errors';
import type { ValidationErrorDetail } from '../../types/domain';

export interface CreateErrors {
  /** Messages keyed by base field name (`title`, `description`, `requester`). */
  base: Record<string, string>;
  /** Messages keyed by payload property name. */
  payload: Record<string, string>;
  /** Anything that could not be attributed to a field — 400, 409, network. */
  general: string | null;
}

export const NO_ERRORS: CreateErrors = { base: {}, payload: {}, general: null };

const BASE_FIELDS = new Set(['type', 'title', 'description', 'requester']);

/**
 * Turns whatever the API refused with into messages that can sit next to the fields.
 *
 * A 422 arrives two different ways: FastAPI validating the request body gives paths like
 * `['body', 'payload', 'amount']`, while the service re-validating against the declared
 * type's model gives just `['amount']`. Reading the last named segment handles both, and
 * `BASE_FIELDS` decides which half of the form the message belongs to. Array items add a
 * numeric segment (`['checklist', 0]`), which is why the last *string* is what counts.
 */
export function toCreateErrors(caught: unknown): CreateErrors {
  if (!(caught instanceof ApiError)) {
    return { ...NO_ERRORS, general: caught instanceof Error ? caught.message : 'Error inesperado' };
  }
  if (typeof caught.detail === 'string') {
    return { ...NO_ERRORS, general: caught.detail };
  }

  const errors: CreateErrors = { base: {}, payload: {}, general: null };
  const unattributed: string[] = [];

  for (const entry of caught.detail) {
    const field = lastNamedSegment(entry);
    if (field === null) {
      unattributed.push(entry.msg);
    } else if (BASE_FIELDS.has(field)) {
      errors.base[field] = entry.msg;
    } else {
      errors.payload[field] = entry.msg;
    }
  }

  if (unattributed.length > 0) errors.general = unattributed.join('; ');
  return errors;
}

function lastNamedSegment(entry: ValidationErrorDetail): string | null {
  for (let index = entry.loc.length - 1; index >= 0; index -= 1) {
    const segment = entry.loc[index];
    // 'body' is the request source, not a field the user can see.
    if (typeof segment === 'string' && segment !== 'body' && segment !== 'payload') return segment;
  }
  return null;
}

export function hasFieldErrors(errors: CreateErrors): boolean {
  return Object.keys(errors.base).length > 0 || Object.keys(errors.payload).length > 0;
}
