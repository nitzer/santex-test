import { fieldKind, fieldLabel, numberBounds, type JsonSchema } from './jsonSchema';
import { StringListField } from './StringListField';

interface SchemaFieldsProps {
  /** The JSON Schema of one action type's creation payload. */
  schema: JsonSchema;
  values: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  /** Per-field messages from the API's 422, keyed by property name. */
  errors: Record<string, string>;
  /** Prefix for input ids, so two schema forms on a page cannot collide. */
  idPrefix: string;
}

/**
 * Renders the fields of a creation payload straight from its JSON Schema.
 *
 * This is the component that makes the frontend open/closed: a new action type on the
 * backend arrives with its own schema on `GET /action-types` and gets a working form
 * here without a line of frontend code. Nothing in this file names an action type.
 */
export function SchemaFields({ schema, values, onChange, errors, idPrefix }: SchemaFieldsProps) {
  const properties = Object.entries(schema.properties ?? {});
  const required = new Set(schema.required ?? []);

  if (properties.length === 0) return <p className="field__hint">This type needs no extra data.</p>;

  return (
    <>
      {properties.map(([name, property]) => (
        <SchemaField
          key={name}
          id={`${idPrefix}-${name}`}
          name={name}
          schema={property}
          required={required.has(name)}
          value={values[name]}
          error={errors[name]}
          onChange={(value) => onChange(name, value)}
        />
      ))}
    </>
  );
}

interface SchemaFieldProps {
  id: string;
  name: string;
  schema: JsonSchema;
  required: boolean;
  value: unknown;
  error: string | undefined;
  onChange: (value: unknown) => void;
}

function SchemaField({ id, name, schema, required, value, error, onChange }: SchemaFieldProps) {
  const label = fieldLabel(name, schema);
  const kind = fieldKind(schema);
  const describedBy = [
    schema.description !== undefined ? `${id}-hint` : null,
    error !== undefined ? `${id}-error` : null,
  ]
    .filter((token) => token !== null)
    .join(' ');
  const shared = {
    id,
    required,
    'aria-invalid': error !== undefined,
    'aria-describedby': describedBy === '' ? undefined : describedBy,
  };

  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>

      {kind === 'enum' && (
        <select {...shared} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          {schema.enum?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}

      {kind === 'stringList' && (
        <StringListField
          id={id}
          label={label}
          items={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          describedBy={shared['aria-describedby']}
          invalid={error !== undefined}
        />
      )}

      {kind === 'number' && (
        <input
          {...shared}
          type="number"
          step="any"
          {...numberBounds(schema)}
          value={typeof value === 'number' ? String(value) : ''}
          // An empty box is "no value", not zero — let the API say the field is required.
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      )}

      {kind === 'boolean' && (
        <input
          {...shared}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      )}

      {(kind === 'text' || kind === 'url') && (
        <input
          {...shared}
          type={kind === 'url' ? 'url' : 'text'}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {schema.description !== undefined && (
        <p className="field__hint" id={`${id}-hint`}>
          {schema.description}
        </p>
      )}
      {error !== undefined && (
        <p className="field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
