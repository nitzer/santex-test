import { useState } from 'react';

import { ActionDetail } from './components/ActionDetail';
import { ActionsList } from './components/ActionsList';
import { CreateTaskForm } from './components/create/CreateTaskForm';
import { useActions } from './hooks/useActions';

export default function App() {
  const { actions, loading, error, add, replace, reload } = useActions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Read the selection out of the list rather than storing a copy, so a completed task
  // re-renders here the moment `replace` updates it.
  const selected = actions.find((action) => action.id === selectedId) ?? null;

  return (
    <div className="app">
      <header className="app__header">
        <h1>Tareas pendientes</h1>
        <button className="button" type="button" onClick={() => setCreating(true)}>
          Agregar tarea
        </button>
      </header>

      {error !== null && (
        <p className="app__error" role="alert">
          {error}{' '}
          <button className="button button--ghost button--small" type="button" onClick={reload}>
            Reintentar
          </button>
        </p>
      )}

      {loading ? (
        <p className="app__status">Cargando tareas…</p>
      ) : (
        <main className="app__body">
          <ActionsList
            actions={actions}
            selectedId={selectedId}
            onSelect={(action) => setSelectedId(action.id)}
          />
          <div className="app__detail">
            {creating ? (
              <section className="detail" aria-label="Agregar tarea">
                <h2>Agregar tarea</h2>
                <CreateTaskForm
                  onCreated={(task) => {
                    // The 201 carries the stored task, so the list is up to date without
                    // a refetch — and the new task is what the user wants to look at.
                    add(task);
                    setSelectedId(task.id);
                    setCreating(false);
                  }}
                  onCancel={() => setCreating(false)}
                />
              </section>
            ) : selected === null ? (
              <p className="app__status">Elegí una tarea de la lista.</p>
            ) : (
              <ActionDetail
                // Remounting per task gives each completion form a fresh idempotency key
                // and empty fields, instead of inheriting the previous task's.
                key={selected.id}
                action={selected}
                onCompleted={replace}
              />
            )}
          </div>
        </main>
      )}
    </div>
  );
}
