import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { emptyPayload, type JsonSchema } from './jsonSchema';
import { SchemaFields } from './SchemaFields';

/**
 * A schema exercising every control the renderer knows about, including kinds no current
 * action type uses — those are the ones a future type will arrive with.
 */
const SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    amount: { type: 'number', exclusiveMinimum: 0, title: 'Amount' },
    currency: { type: 'string', title: 'Currency', description: '3-letter ISO code' },
    receipt_url: { type: 'string', format: 'uri', title: 'Receipt Url' },
    environment: { type: 'string', enum: ['staging', 'production'], title: 'Environment' },
    checklist: { type: 'array', items: { type: 'string' }, minItems: 1, title: 'Checklist' },
    urgent: { type: 'boolean', title: 'Urgent' },
  },
  required: ['amount', 'currency'],
};

/** Holds the payload the way the real form does, so controlled inputs behave. */
function Harness({
  schema = SCHEMA,
  errors = {},
  onValues,
}: {
  schema?: JsonSchema;
  errors?: Record<string, string>;
  onValues?: (values: Record<string, unknown>) => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => emptyPayload(schema));
  return (
    <SchemaFields
      schema={schema}
      values={values}
      errors={errors}
      idPrefix="test"
      onChange={(name, value) =>
        setValues((current) => {
          const next = { ...current, [name]: value };
          onValues?.(next);
          return next;
        })
      }
    />
  );
}

describe('SchemaFields', () => {
  it('renders a control per property, picked from the schema', () => {
    render(<Harness />);

    expect(screen.getByLabelText(/^Amount/)).toHaveAttribute('type', 'number');
    expect(screen.getByLabelText(/^Currency/)).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText(/^Receipt Url/)).toHaveAttribute('type', 'url');
    expect(screen.getByLabelText(/^Urgent/)).toHaveAttribute('type', 'checkbox');
    expect(screen.getByRole('combobox', { name: /Environment/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Checklist: new item/ })).toBeInTheDocument();
  });

  it('offers every enum option', () => {
    render(<Harness />);
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['staging', 'production']);
  });

  it('marks required fields and carries the schema bounds onto the input', () => {
    render(<Harness />);

    expect(screen.getByLabelText(/^Amount/)).toBeRequired();
    expect(screen.getByLabelText(/^Amount/)).toHaveAttribute('min', '0');
    expect(screen.getByLabelText(/^Currency/)).toBeRequired();
    expect(screen.getByLabelText(/^Receipt Url/)).not.toBeRequired();
  });

  it('shows the schema description as a hint', () => {
    render(<Harness />);
    expect(screen.getByText('3-letter ISO code')).toBeInTheDocument();
  });

  it('emits a number for numeric fields, not a string', async () => {
    const seen: Record<string, unknown>[] = [];
    const user = userEvent.setup();
    render(<Harness onValues={(values) => seen.push(values)} />);

    await user.type(screen.getByLabelText(/^Amount/), '42.5');

    expect(seen.at(-1)?.amount).toBe(42.5);
    expect(typeof seen.at(-1)?.amount).toBe('number');
  });

  it('emits undefined when a number field is cleared, rather than zero', async () => {
    const seen: Record<string, unknown>[] = [];
    const user = userEvent.setup();
    render(<Harness onValues={(values) => seen.push(values)} />);

    const amount = screen.getByLabelText(/^Amount/);
    await user.type(amount, '7');
    await user.clear(amount);

    expect(seen.at(-1)).toHaveProperty('amount', undefined);
  });

  it('emits a string[] for array fields, adding and removing items', async () => {
    const seen: Record<string, unknown>[] = [];
    const user = userEvent.setup();
    render(<Harness onValues={(values) => seen.push(values)} />);

    const draft = screen.getByRole('textbox', { name: /Checklist: new item/ });
    await user.type(draft, 'Create account{Enter}');
    await user.type(draft, 'Assign laptop{Enter}');
    expect(seen.at(-1)?.checklist).toEqual(['Create account', 'Assign laptop']);

    await user.click(screen.getByRole('button', { name: 'Remove Create account' }));
    expect(seen.at(-1)?.checklist).toEqual(['Assign laptop']);
  });

  it('emits a boolean for checkbox fields', async () => {
    const seen: Record<string, unknown>[] = [];
    const user = userEvent.setup();
    render(<Harness onValues={(values) => seen.push(values)} />);

    await user.click(screen.getByLabelText(/^Urgent/));

    expect(seen.at(-1)?.urgent).toBe(true);
  });

  it('emits the chosen enum value', async () => {
    const seen: Record<string, unknown>[] = [];
    const user = userEvent.setup();
    render(<Harness onValues={(values) => seen.push(values)} />);

    await user.selectOptions(screen.getByRole('combobox', { name: /Environment/ }), 'production');

    expect(seen.at(-1)?.environment).toBe('production');
  });

  it('shows the API message next to the field it belongs to', () => {
    render(<Harness errors={{ amount: 'Input should be greater than 0' }} />);

    expect(screen.getByLabelText(/^Amount/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Input should be greater than 0');
  });

  it('says so when a type asks for no extra data', () => {
    render(<Harness schema={{ type: 'object', properties: {} }} />);
    expect(screen.getByText(/needs no extra data/i)).toBeInTheDocument();
  });

  it('falls back to a text input for a property it does not recognise', () => {
    render(<Harness schema={{ type: 'object', properties: { weird: { type: 'geo_point' } } }} />);
    expect(screen.getByLabelText(/^Weird/)).toHaveAttribute('type', 'text');
  });
});
