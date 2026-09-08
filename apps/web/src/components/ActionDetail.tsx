import type { AnyTask } from '../types/domain';
import { getCompletionForm } from './forms/registry';
import { JsonFacts } from './JsonFacts';
import { ACTION_TYPE_LABELS } from './labels';

interface ActionDetailProps {
  action: AnyTask;
  onCompleted: (updated: AnyTask) => void;
}

/**
 * The selected action, and the way to resolve it.
 *
 * Which form appears comes from the registry keyed by `action.type` — this component
 * never asks *which* type it is holding, so it needs no change when a type is added.
 */
export function ActionDetail({ action, onCompleted }: ActionDetailProps) {
  // Looked up, not created: the registry hands back a module-level component, so its
  // identity is stable for a given type and no state is reset by rendering it here.
  const CompletionForm = getCompletionForm(action.type);
  const isPending = action.status === 'pending';

  return (
    <article className="detail">
      <header className="detail__header">
        <span className="badge">{ACTION_TYPE_LABELS[action.type]}</span>
        <h2>{action.title}</h2>
        <p className="detail__description">{action.description}</p>
        <p className="detail__meta">
          Requested by <strong>{action.requester}</strong> · {formatDate(action.created_at)}
        </p>
      </header>

      <section className="detail__section" aria-label="Details">
        <h3>Details</h3>
        <JsonFacts facts={action.payload} />
      </section>

      {isPending ? (
        <section className="detail__section" aria-label="Completar">
          <h3>Completar</h3>
          {/* oxlint-disable-next-line react/static-components */}
          <CompletionForm action={action} onCompleted={onCompleted} />
        </section>
      ) : (
        <section className="detail__section" aria-label="Result">
          <h3>Result</h3>
          <JsonFacts facts={action.result ?? {}} />
          {action.completed_at !== null && (
            <p className="detail__meta">Completed on {formatDate(action.completed_at)}</p>
          )}
        </section>
      )}
    </article>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}
