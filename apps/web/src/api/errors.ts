import type { ApiErrorDetail, ValidationErrorDetail } from '../types/domain';

/**
 * An HTTP error the API answered with, carrying the `detail` it sent.
 *
 * The API speaks two dialects of `detail`: a plain sentence for the rules it enforces
 * itself (missing `Idempotency-Key`, wrong endpoint for the type, already completed),
 * and FastAPI's list of per-field entries for 422. `ApiError.message` flattens both into
 * something a person can read, while `detail` stays available for anything structured.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: ApiErrorDetail;

  constructor(status: number, detail: ApiErrorDetail) {
    super(formatDetail(detail));
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

export function formatDetail(detail: ApiErrorDetail): string {
  if (typeof detail === 'string') return detail;
  return detail.map(formatValidationError).join('; ');
}

function formatValidationError(entry: ValidationErrorDetail): string {
  // `loc` starts with the body/query source; the field name is what a user can act on.
  const field = entry.loc.slice(1).join('.');
  return field ? `${field}: ${entry.msg}` : entry.msg;
}

/** Whatever went wrong — an API answer, a dropped connection — rendered for the user. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unexpected error';
}
