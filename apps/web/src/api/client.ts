import type {
  ActionCreate,
  ActionStatus,
  ActionType,
  ActionTypeDescriptor,
  AnyTask,
  ApiErrorDetail,
  CompletionPayload,
  ValidationErrorDetail,
} from '../types/domain';
import { ApiError } from './errors';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

export interface ActionFilters {
  status?: ActionStatus;
  type?: ActionType;
}

/**
 * The action types the backend has registered, with the JSON Schema for each one's
 * creation payload.
 *
 * This is what keeps the creation form open/closed: the type selector and the per-type
 * fields are both built from this response, so a type added on the backend appears in
 * the UI with no frontend code written for it.
 */
export function listActionTypes(): Promise<ActionTypeDescriptor[]> {
  return request<ActionTypeDescriptor[]>('/action-types');
}

export function listActions(filters: ActionFilters = {}): Promise<AnyTask[]> {
  const query = new URLSearchParams();
  if (filters.status) query.set('status', filters.status);
  if (filters.type) query.set('type', filters.type);
  const suffix = query.size > 0 ? `?${query}` : '';
  return request<AnyTask[]>(`/actions${suffix}`);
}

export function getAction(id: string): Promise<AnyTask> {
  return request<AnyTask>(`/actions/${encodeURIComponent(id)}`);
}

/** Creates a task. Answers 201 with the stored action, its payload coerced by the API. */
export function createAction(body: ActionCreate, idempotencyKey: string): Promise<AnyTask> {
  return request<AnyTask>('/actions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IDEMPOTENCY_HEADER]: idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

/** Completes the three JSON-bodied types. The API rejects `documentation_upload` here. */
export function completeAction(
  id: string,
  payload: CompletionPayload,
  idempotencyKey: string,
): Promise<AnyTask> {
  return request<AnyTask>(`/actions/${encodeURIComponent(id)}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IDEMPOTENCY_HEADER]: idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
}

/** Completes `documentation_upload` by sending the real file as multipart. */
export function uploadDocument(
  id: string,
  file: File,
  idempotencyKey: string,
): Promise<AnyTask> {
  const body = new FormData();
  body.append('file', file);
  // No Content-Type here on purpose: fetch has to set the multipart boundary itself.
  return request<AnyTask>(`/actions/${encodeURIComponent(id)}/upload`, {
    method: 'POST',
    headers: { [IDEMPOTENCY_HEADER]: idempotencyKey },
    body,
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, init);
  if (!response.ok) throw new ApiError(response.status, await readDetail(response));
  return (await response.json()) as T;
}

async function readDetail(response: Response): Promise<ApiErrorDetail> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'detail' in body) {
      const { detail } = body as { detail: unknown };
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail)) return detail as ValidationErrorDetail[];
    }
  } catch {
    // A body that is not JSON tells us nothing; fall through to the status line.
  }
  return `${response.status} ${response.statusText}`.trim();
}
