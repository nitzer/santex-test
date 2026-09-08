import type { ActionType } from '../types/domain';

/**
 * Human-readable name per action type.
 *
 * Typed as a total `Record<ActionType, ...>` for the same reason the form registry is:
 * a new action type must name itself here before the app compiles, so no type ever
 * reaches the screen as a raw `snake_case` identifier.
 */
export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  expense_approval: 'Expense',
  deployment_review: 'Deployment',
  documentation_upload: 'Document',
  onboarding: 'Onboarding',
};
