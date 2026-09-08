/**
 * Domain types for the frontend.
 *
 * Everything here is *derived* from `api.d.ts`, which `pnpm gen:types` generates from
 * the backend's `openapi.json`. No DTO is retyped by hand: if the API contract moves,
 * these aliases move with it and the compiler points at every call site that must adapt.
 */
import type { components, operations } from './api';

export type ActionRead = components['schemas']['ActionRead'];
export type ActionType = components['schemas']['ActionType'];
export type ActionStatus = components['schemas']['ActionStatus'];
export type ActionCreate = components['schemas']['ActionCreate'];
export type ActionTypeDescriptor = components['schemas']['ActionTypeDescriptor'];

/* -------------------------------------------------------------------------------------
 * Tasks: the base entity, and the per-type shape that inherits from it
 * ---------------------------------------------------------------------------------- */

/**
 * Everything a task has regardless of its type.
 *
 * `payload` is the one field whose shape depends on `type`, so it is lifted out here and
 * put back, precisely typed, by `Task<T>`.
 */
export type BaseTask = Omit<ActionRead, 'payload'>;

/**
 * The payload shape each action type carries — the single static type-to-schema map in
 * the frontend, and the counterpart of `formRegistry`: one entry per action type.
 *
 * The values are the generated creation schemas, so the shapes are the backend's, not a
 * transcription of them.
 */
export interface TaskPayloadByType {
  expense_approval: components['schemas']['ExpenseApprovalCreate'];
  deployment_review: components['schemas']['DeploymentReviewCreate'];
  documentation_upload: components['schemas']['DocumentationUploadCreate'];
  onboarding: components['schemas']['OnboardingCreate'];
}

/**
 * Compile-time exhaustiveness: indexing by the whole `ActionType` union fails to resolve
 * if any member is missing above, so a type added to the API breaks the build here until
 * its payload shape is declared.
 */
export type EveryActionTypeHasAPayload = TaskPayloadByType[ActionType];

/** A task of one specific type: the base entity plus that type's payload. */
export type Task<T extends ActionType = ActionType> = BaseTask & {
  type: T;
  payload: TaskPayloadByType[T];
};

/**
 * Any task, as a union discriminated by `type`.
 *
 * Narrowing on `task.type` narrows `task.payload` with it, which is what lets each
 * completion form read its own payload fields without casting.
 */
export type AnyTask = { [T in ActionType]: Task<T> }[ActionType];

/* -------------------------------------------------------------------------------------
 * Completion payloads
 * ---------------------------------------------------------------------------------- */

/** The JSON body `POST /actions/{id}/complete` accepts: a union of the per-type shapes. */
export type CompletionPayload =
  operations['complete_action_actions__action_id__complete_post']['requestBody']['content']['application/json'];

/**
 * Narrow one member out of that union by a field only it declares.
 *
 * The backend documents the per-type completion bodies as an anonymous `oneOf`, so the
 * generated types have no name for each variant. Selecting by a discriminating key keeps
 * the per-type payloads generated rather than transcribed.
 */
type PayloadWith<Key extends string> = Extract<CompletionPayload, Record<Key, unknown>>;

export type ExpenseApprovalPayload = PayloadWith<'comment'>;
export type DeploymentReviewPayload = PayloadWith<'notes'>;
export type OnboardingPayload = PayloadWith<'completed_steps'>;

/* -------------------------------------------------------------------------------------
 * Errors
 * ---------------------------------------------------------------------------------- */

/** FastAPI's 422 body: one entry per field that failed validation. */
export type ValidationErrorDetail = components['schemas']['ValidationError'];

/** `detail` is a plain string for our handlers' 4xx, and a list for FastAPI's 422. */
export type ApiErrorDetail = string | ValidationErrorDetail[];
