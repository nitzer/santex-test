import type { ComponentType } from 'react';

import type { ActionType, AnyTask, Task } from '../../types/domain';

/**
 * The contract every completion form honours, parameterised by the type it completes.
 *
 * A form receives its own task — `Task<'onboarding'>` reads `payload.checklist` as a
 * `string[]`, with no cast and no defensive narrowing — and hands back the updated task
 * the API returned. It never learns how the list is stored or rendered, so the screen
 * around it can change without touching any form.
 */
export interface CompletionFormProps<T extends ActionType = ActionType> {
  action: Task<T>;
  onCompleted: (updated: AnyTask) => void;
}

/** A completion form for one specific action type. */
export type CompletionFormFor<T extends ActionType> = ComponentType<CompletionFormProps<T>>;

/** A completion form as the rest of the app sees it, once its type has been resolved. */
export type CompletionForm = ComponentType<CompletionFormProps>;
