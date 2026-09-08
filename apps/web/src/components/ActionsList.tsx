import type { AnyTask } from '../types/domain';
import { ACTION_TYPE_LABELS } from './labels';

interface ActionsListProps {
  actions: readonly AnyTask[];
  selectedId: string | null;
  onSelect: (action: AnyTask) => void;
}

/** The queue: everything still pending, then everything already resolved. */
export function ActionsList({ actions, selectedId, onSelect }: ActionsListProps) {
  const pending = actions.filter((action) => action.status === 'pending');
  const completed = actions.filter((action) => action.status === 'completed');

  return (
    <nav className="actions" aria-label="Tareas">
      <Group title="Pendientes" actions={pending} selectedId={selectedId} onSelect={onSelect} />
      <Group title="Completadas" actions={completed} selectedId={selectedId} onSelect={onSelect} />
    </nav>
  );
}

interface GroupProps extends ActionsListProps {
  title: string;
}

function Group({ title, actions, selectedId, onSelect }: GroupProps) {
  return (
    <section className="actions__group" aria-label={title}>
      <h2 className="actions__title">
        {title} <span className="actions__count">{actions.length}</span>
      </h2>
      {actions.length === 0 ? (
        <p className="actions__empty">Nada por acá.</p>
      ) : (
        <ul className="actions__list">
          {actions.map((action) => (
            <li key={action.id}>
              <button
                type="button"
                className="actions__item"
                aria-current={action.id === selectedId}
                onClick={() => onSelect(action)}
              >
                <span className="actions__item-title">{action.title}</span>
                <span className="badge">{ACTION_TYPE_LABELS[action.type]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
