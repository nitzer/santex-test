import type { ActionType, BaseTask, Task, TaskPayloadByType } from '../types/domain';

let sequence = 0;

/**
 * A valid default payload per action type, so a test that does not care about the
 * payload does not have to invent one.
 *
 * The mapped type keeps this honest: a new action type has to supply a default here, and
 * each default is checked against that type's generated schema.
 */
const DEFAULT_PAYLOADS: { [T in ActionType]: TaskPayloadByType[T] } = {
  expense_approval: {
    amount: 1240.5,
    currency: 'USD',
    receipt_url: 'https://receipts.example/invoices/inv-8842.pdf',
  },
  deployment_review: { service: 'checkout-api', version: '2.14.0', environment: 'production' },
  documentation_upload: { document_name: 'runbook-oncall-plataforma.md' },
  onboarding: {
    employee_name: 'Sofia Cabrera',
    checklist: ['Crear cuenta de correo', 'Asignar notebook', 'Alta en el repositorio'],
  },
};

type TaskOverrides<T extends ActionType> = Partial<BaseTask> & {
  payload?: TaskPayloadByType[T];
};

/**
 * A `Task<T>` with sane defaults, so each test states only the fields it is about.
 *
 * Typed against the generated contract, so a change to the wire shape breaks the
 * fixtures too instead of letting tests keep passing against a stale shape.
 */
export function makeTask<T extends ActionType>(
  type: T,
  overrides: TaskOverrides<T> = {},
): Task<T> {
  sequence += 1;
  const { payload, ...base } = overrides;
  return {
    id: `action-${sequence}`,
    title: `Tarea ${sequence}`,
    description: 'Una tarea de prueba.',
    requester: 'tester@ops.example',
    status: 'pending',
    created_at: '2026-01-15T10:00:00Z',
    completed_at: null,
    result: null,
    ...base,
    type,
    payload: payload ?? DEFAULT_PAYLOADS[type],
  };
}
