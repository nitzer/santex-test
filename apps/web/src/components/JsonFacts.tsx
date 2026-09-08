interface JsonFactsProps {
  /** An action's `payload` or `result` — untyped JSON whose shape varies per type. */
  facts: Record<string, unknown>;
}

/**
 * Renders an action's `payload` / `result` as a definition list.
 *
 * These are deliberately untyped in the contract — each action type stores its own
 * shape — so rendering them structurally, rather than per type, means a new action type
 * displays correctly on the day it is added, with no view code written for it.
 */
export function JsonFacts({ facts }: JsonFactsProps) {
  const entries = Object.entries(facts);
  if (entries.length === 0) return <p className="facts__empty">Sin datos.</p>;

  return (
    <dl className="facts">
      {entries.map(([key, value]) => (
        <div className="facts__row" key={key}>
          <dt>{humanize(key)}</dt>
          <dd>{renderValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function renderValue(value: unknown) {
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) {
    return (
      <ul className="facts__values">
        {value.map((item, index) => (
          <li key={index}>{formatScalar(item)}</li>
        ))}
      </ul>
    );
  }
  return formatScalar(value);
}

function formatScalar(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return JSON.stringify(value);
}

function humanize(key: string): string {
  const spaced = key.replaceAll('_', ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
