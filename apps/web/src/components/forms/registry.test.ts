import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { ActionType } from '../../types/domain';
import { DeploymentReviewForm } from './DeploymentReviewForm';
import { DocumentUploadForm } from './DocumentUploadForm';
import { ExpenseApprovalForm } from './ExpenseApprovalForm';
import { OnboardingForm } from './OnboardingForm';
import { formRegistry, getCompletionForm } from './registry';

/**
 * The action types the *backend* publishes, read at run time from the contract it
 * exported.
 *
 * `Record<ActionType, ...>` already makes the registry exhaustive at compile time, but
 * only against `api.d.ts` — a file that is generated and could be stale. Reading
 * `openapi.json` here closes that gap: if the backend adds a type and nobody reruns
 * `pnpm gen:types`, this test fails instead of the app silently shipping without a form.
 */
// Vitest runs with this package as its root, so the sibling app is one level up.
const OPENAPI_PATH = resolve(process.cwd(), '../api/openapi.json');

/** The parts of the exported contract these tests read. */
interface Contract {
  components: {
    schemas: Record<string, unknown> & {
      ActionType: { enum?: string[] };
      ActionCreate: { properties: { payload: { oneOf: { $ref: string }[] } } };
    };
  };
}

function readContract(): Contract {
  return JSON.parse(readFileSync(OPENAPI_PATH, 'utf8')) as Contract;
}

function actionTypesFromContract(): string[] {
  const enumeration = readContract().components.schemas.ActionType.enum;
  if (enumeration === undefined || enumeration.length === 0) {
    throw new Error('openapi.json declares no ActionType enum');
  }
  return enumeration;
}

describe('formRegistry', () => {
  it('covers exactly the action types the API contract declares', () => {
    expect(Object.keys(formRegistry).sort()).toEqual(actionTypesFromContract().sort());
  });

  it('maps each type to the form that owns its endpoint and payload', () => {
    expect(formRegistry).toEqual({
      expense_approval: ExpenseApprovalForm,
      deployment_review: DeploymentReviewForm,
      documentation_upload: DocumentUploadForm,
      onboarding: OnboardingForm,
    });
  });

  it('resolves a form for every declared type', () => {
    for (const type of actionTypesFromContract()) {
      expect(getCompletionForm(type as ActionType)).toBeTypeOf('function');
    }
  });
});

describe('TaskPayloadByType', () => {
  /*
   * The map itself is checked by the compiler, not here: `TaskPayloadByType` is a type,
   * and `EveryActionTypeHasAPayload` in domain.ts fails to resolve if a member of
   * `ActionType` has no payload shape, so `tsc -b` is what enforces the coverage.
   *
   * What run time can still catch is the contract drifting out from under it — the
   * generated types are only as fresh as the last `pnpm gen:types`.
   */
  it('has a creation schema in the contract for every action type', () => {
    const contract = readContract();
    const declared = new Set(
      contract.components.schemas.ActionCreate.properties.payload.oneOf.map((variant) =>
        variant.$ref.replace('#/components/schemas/', ''),
      ),
    );

    expect(declared.size).toBe(actionTypesFromContract().length);
    for (const name of declared) {
      expect(contract.components.schemas).toHaveProperty(name);
    }
  });

  it('agrees with the schema_name each action-type descriptor advertises', () => {
    const contract = readContract();
    const fromPayloadUnion = contract.components.schemas.ActionCreate.properties.payload.oneOf
      .map((variant) => variant.$ref.replace('#/components/schemas/', ''))
      .sort();

    // Every ActionType maps to exactly one *Create schema, which is what the frontend's
    // TaskPayloadByType picks its value types from.
    expect(fromPayloadUnion).toHaveLength(actionTypesFromContract().length);
    expect(new Set(fromPayloadUnion).size).toBe(fromPayloadUnion.length);
  });
});
