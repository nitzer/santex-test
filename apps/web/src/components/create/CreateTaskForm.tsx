import { useEffect, useMemo, useState } from 'react';

import { createAction, listActionTypes } from '../../api/client';
import { describeError } from '../../api/errors';
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey';
import type { ActionCreate, ActionTypeDescriptor, AnyTask } from '../../types/domain';
import { NO_ERRORS, toCreateErrors, type CreateErrors } from './fieldErrors';
import { emptyPayload, type JsonSchema } from './jsonSchema';
import { SchemaFields } from './SchemaFields';

interface CreateTaskFormProps {
  onCreated: (task: AnyTask) => void;
  onCancel: () => void;
}

/**
 * Creates a task of any registered type.
 *
 * The type selector and the per-type fields both come from `GET /action-types`: the
 * frontend never enumerates the types, so the day the backend registers a fifth one it
 * shows up here, with its own fields, without a change to this file.
 */
export function CreateTaskForm({ onCreated, onCancel }: CreateTaskFormProps) {
  const [descriptors, setDescriptors] = useState<ActionTypeDescriptor[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedType, setSelectedType] = useState<string>('');
  const [base, setBase] = useState({ title: '', description: '', requester: '' });
  const [payload, setPayload] = useState<Record<string, unknown>>({});

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<CreateErrors>(NO_ERRORS);
  // One key per creation, so a retry after a failure is the same attempt to the API.
  // A success renews it: the next task would be a different operation.
  const { key: idempotencyKey, renew: renewIdempotencyKey } = useIdempotencyKey();

  useEffect(() => {
    let active = true;
    listActionTypes()
      .then((loaded) => {
        if (!active) return;
        setDescriptors(loaded);
        const first = loaded[0];
        if (first !== undefined) {
          setSelectedType(first.type);
          setPayload(emptyPayload(first.payload_schema as JsonSchema));
        }
      })
      .catch((caught: unknown) => {
        if (active) setLoadError(describeError(caught));
      });
    return () => {
      active = false;
    };
  }, []);

  const selected = useMemo(
    () => descriptors?.find((descriptor) => descriptor.type === selectedType) ?? null,
    [descriptors, selectedType],
  );

  function changeType(type: string) {
    const descriptor = descriptors?.find((candidate) => candidate.type === type);
    setSelectedType(type);
    // Only the payload resets: the base fields describe the task, not its type, so
    // whatever has been typed there survives switching between types.
    setPayload(descriptor ? emptyPayload(descriptor.payload_schema as JsonSchema) : {});
    setErrors((current) => ({ ...current, payload: {} }));
  }

  async function handleSubmit() {
    if (submitting || selected === null) return;
    setSubmitting(true);
    setErrors(NO_ERRORS);
    try {
      // The payload is assembled from a schema fetched at run time, so its shape cannot
      // be proven against the generated union here — that is inherent to a form the
      // backend describes. The API re-validates it against the declared type's model and
      // answers 422, which `toCreateErrors` puts back next to the offending field.
      const body = {
        type: selected.type,
        ...base,
        payload,
      } as unknown as ActionCreate;
      const created = await createAction(body, idempotencyKey);
      renewIdempotencyKey();
      onCreated(created);
    } catch (caught) {
      setErrors(toCreateErrors(caught));
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError !== null) {
    return (
      <p className="form__error" role="alert">
        No se pudieron cargar los tipos de tarea: {loadError}
      </p>
    );
  }
  if (descriptors === null) return <p className="app__status">Cargando tipos…</p>;

  return (
    <form
      className="form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="field">
        <label htmlFor="create-type">Tipo</label>
        <select
          id="create-type"
          value={selectedType}
          onChange={(event) => changeType(event.target.value)}
        >
          {descriptors.map((descriptor) => (
            <option key={descriptor.type} value={descriptor.type}>
              {descriptor.label}
            </option>
          ))}
        </select>
      </div>

      <BaseField
        name="title"
        label="Título"
        value={base.title}
        error={errors.base.title}
        onChange={(title) => setBase((current) => ({ ...current, title }))}
      />
      <BaseField
        name="description"
        label="Descripción"
        value={base.description}
        error={errors.base.description}
        multiline
        onChange={(description) => setBase((current) => ({ ...current, description }))}
      />
      <BaseField
        name="requester"
        label="Solicitante"
        value={base.requester}
        error={errors.base.requester}
        onChange={(requester) => setBase((current) => ({ ...current, requester }))}
      />

      {selected !== null && (
        <fieldset className="field">
          <legend>Datos de {selected.label}</legend>
          <SchemaFields
            // Remounting per type clears any draft state the previous type's fields held.
            key={selected.type}
            idPrefix="create-payload"
            schema={selected.payload_schema as JsonSchema}
            values={payload}
            errors={errors.payload}
            onChange={(name, value) =>
              setPayload((current) => ({ ...current, [name]: value }))
            }
          />
        </fieldset>
      )}

      {errors.general !== null && (
        <p className="form__error" role="alert">
          {errors.general}
        </p>
      )}

      <div className="form__actions">
        <button className="button" type="submit" disabled={submitting}>
          {submitting ? 'Creando…' : 'Crear tarea'}
        </button>
        <button className="button button--ghost" type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

interface BaseFieldProps {
  name: string;
  label: string;
  value: string;
  error: string | undefined;
  multiline?: boolean;
  onChange: (value: string) => void;
}

/** One of the fields every task has, whatever its type. */
function BaseField({ name, label, value, error, multiline = false, onChange }: BaseFieldProps) {
  const id = `create-${name}`;
  const shared = {
    id,
    value,
    required: true,
    'aria-invalid': error !== undefined,
    'aria-describedby': error !== undefined ? `${id}-error` : undefined,
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
  };

  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        <span aria-hidden="true"> *</span>
      </label>
      {multiline ? <textarea {...shared} rows={2} /> : <input {...shared} type="text" />}
      {error !== undefined && (
        <p className="field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
