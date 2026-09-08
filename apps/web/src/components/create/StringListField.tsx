import { useState } from 'react';

interface StringListFieldProps {
  id: string;
  /** The parent field's label, used to name the per-item controls for screen readers. */
  label: string;
  items: readonly string[];
  onChange: (items: string[]) => void;
  describedBy: string | undefined;
  invalid: boolean;
}

/**
 * An editable list of strings, for schema properties like `checklist`.
 *
 * The draft item lives here rather than in the payload: a half-typed entry is not part
 * of the value being submitted until it is actually added.
 */
export function StringListField({
  id,
  label,
  items,
  onChange,
  describedBy,
  invalid,
}: StringListFieldProps) {
  const [draft, setDraft] = useState('');

  function add() {
    const trimmed = draft.trim();
    if (trimmed === '') return;
    onChange([...items, trimmed]);
    setDraft('');
  }

  return (
    <div className="list-field">
      {items.length > 0 && (
        <ul className="list-field__items">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>
              <span>{item}</span>
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={() => onChange(items.filter((_, at) => at !== index))}
              >
                Quitar <span className="sr-only">{item}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="list-field__add">
        <input
          id={id}
          type="text"
          value={draft}
          aria-label={`${label}: nuevo ítem`}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onChange={(event) => setDraft(event.target.value)}
          // Enter adds an item; without this it would submit the whole form instead.
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          className="button button--ghost button--small"
          onClick={add}
          disabled={draft.trim() === ''}
        >
          Agregar
        </button>
      </div>
    </div>
  );
}
