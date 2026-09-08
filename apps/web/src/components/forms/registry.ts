import type { ActionType } from '../../types/domain';
import { DeploymentReviewForm } from './DeploymentReviewForm';
import { DocumentUploadForm } from './DocumentUploadForm';
import { ExpenseApprovalForm } from './ExpenseApprovalForm';
import { OnboardingForm } from './OnboardingForm';
import type { CompletionForm, CompletionFormFor } from './types';

/**
 * Which form completes which action type — the frontend's mirror of the backend's
 * handler registry.
 *
 * Every component resolves its form from here, so nothing in the app branches on
 * `action.type`. Adding a fifth type is a new form file plus one line below; no existing
 * component is edited. The mapped type is what makes that safe: `ActionType` is generated
 * from the API's OpenAPI schema, so the day the backend adds a type this file stops
 * compiling until its form exists — the gap is a build error, not a blank panel found in
 * production. Each entry is typed for *its own* type, so a form written against the wrong
 * payload shape is rejected here rather than failing at runtime.
 */
export const formRegistry: { [T in ActionType]: CompletionFormFor<T> } = {
  expense_approval: ExpenseApprovalForm,
  deployment_review: DeploymentReviewForm,
  documentation_upload: DocumentUploadForm,
  onboarding: OnboardingForm,
};

/**
 * Resolves the form for a type, widening it to the union-typed props the caller holds.
 *
 * The registry guarantees that the entry at key `T` accepts a `Task<T>`, and the only
 * caller passes the very task whose `type` produced this lookup — but TypeScript cannot
 * express that correlation between an index and the value indexed by it, so the widening
 * is asserted once, here, instead of leaking casts into every consumer.
 */
export function getCompletionForm(type: ActionType): CompletionForm {
  return formRegistry[type] as CompletionForm;
}
