import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { IDEMPOTENCY_HEADER } from '../../api/client';
import { makeTask } from '../../test/factories';
import { jsonResponse, lastJsonBody, lastRequest, mockFetch } from '../../test/fetchMock';
import { CreateTaskForm } from './CreateTaskForm';

/** What `GET /action-types` answers — the only place the form learns the types from. */
const DESCRIPTORS = [
  {
    type: 'expense_approval',
    label: 'Approve expense',
    completion: 'json',
    schema_name: 'ExpenseApprovalCreate',
    payload_schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', exclusiveMinimum: 0, title: 'Amount' },
        currency: { type: 'string', title: 'Currency' },
        receipt_url: { type: 'string', title: 'Receipt Url' },
      },
      required: ['amount', 'currency', 'receipt_url'],
    },
  },
  {
    type: 'onboarding',
    label: 'Onboarding',
    completion: 'json',
    schema_name: 'OnboardingCreate',
    payload_schema: {
      type: 'object',
      properties: {
        employee_name: { type: 'string', title: 'Employee Name' },
        checklist: { type: 'array', items: { type: 'string' }, minItems: 1, title: 'Checklist' },
      },
      required: ['employee_name', 'checklist'],
    },
  },
];

/** Answers /action-types, and lets each test decide what POST /actions replies. */
function mockApi(onCreate: () => Response) {
  return mockFetch((url, init) => {
    if (url.endsWith('/action-types')) return Promise.resolve(jsonResponse(DESCRIPTORS));
    if (init?.method === 'POST') return Promise.resolve(onCreate());
    throw new Error(`unexpected request: ${url}`);
  });
}

async function renderForm(onCreate: () => Response = () => jsonResponse(created, 201)) {
  const spy = mockApi(onCreate);
  const onCreated = vi.fn();
  const onCancel = vi.fn();
  render(<CreateTaskForm onCreated={onCreated} onCancel={onCancel} />);
  // The type selector only exists once /action-types has answered.
  await screen.findByRole('combobox', { name: 'Type' });
  return { spy, onCreated, onCancel, user: userEvent.setup() };
}

const created = makeTask('expense_approval', { title: 'Approve travel expense' });

describe('CreateTaskForm', () => {
  it('offers every type the API reports, by label', async () => {
    await renderForm();

    const options = within(screen.getByRole('combobox', { name: 'Type' }))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).toEqual(['Approve expense', 'Onboarding']);
  });

  it('always shows the base fields', async () => {
    await renderForm();

    expect(screen.getByLabelText(/^Title/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Description/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Requester/)).toBeInTheDocument();
  });

  it('swaps the extra fields when the type changes, keeping the base fields', async () => {
    const { user } = await renderForm();

    expect(screen.getByLabelText(/^Amount/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Title/), 'Still here');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Type' }), 'onboarding');

    expect(screen.queryByLabelText(/^Amount/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Employee Name/)).toBeInTheDocument();
    expect(screen.getByText('Onboarding details')).toBeInTheDocument();
    // The base fields describe the task, not its type, so they survive the switch.
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Still here');
  });

  it('posts the base fields and the schema payload with an Idempotency-Key', async () => {
    const { spy, onCreated, user } = await renderForm();

    await user.type(screen.getByLabelText(/^Title/), 'Approve travel expense');
    await user.type(screen.getByLabelText(/^Description/), 'Flight and hotel');
    await user.type(screen.getByLabelText(/^Requester/), 'lucia@ops.example');
    await user.type(screen.getByLabelText(/^Amount/), '1240.5');
    await user.type(screen.getByLabelText(/^Currency/), 'USD');
    await user.type(screen.getByLabelText(/^Receipt Url/), 'https://receipts.example/x.pdf');
    await user.click(screen.getByRole('button', { name: 'Create task' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));

    const request = lastRequest(spy);
    expect(request.url).toMatch(/\/actions$/);
    expect(request.method).toBe('POST');
    expect(request.headers.get(IDEMPOTENCY_HEADER)).toBeTruthy();
    expect(lastJsonBody(spy)).toEqual({
      type: 'expense_approval',
      title: 'Approve travel expense',
      description: 'Flight and hotel',
      requester: 'lucia@ops.example',
      payload: {
        amount: 1240.5,
        currency: 'USD',
        receipt_url: 'https://receipts.example/x.pdf',
      },
    });
  });

  it('sends the array payload the selected type declares', async () => {
    const { spy, user } = await renderForm();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Type' }), 'onboarding');
    await user.type(screen.getByLabelText(/^Title/), 'Sofia onboarding');
    await user.type(screen.getByLabelText(/^Description/), 'First day on Monday');
    await user.type(screen.getByLabelText(/^Requester/), 'people@ops.example');
    await user.type(screen.getByLabelText(/^Employee Name/), 'Sofia Cabrera');

    const draft = screen.getByRole('textbox', { name: /Checklist: new item/ });
    await user.type(draft, 'Create email account{Enter}');
    await user.type(draft, 'Assign laptop{Enter}');
    await user.click(screen.getByRole('button', { name: 'Create task' }));

    await waitFor(() => expect(lastRequest(spy).method).toBe('POST'));
    expect(lastJsonBody(spy)).toMatchObject({
      type: 'onboarding',
      payload: {
        employee_name: 'Sofia Cabrera',
        checklist: ['Create email account', 'Assign laptop'],
      },
    });
  });

  it('puts a 422 next to the field it belongs to', async () => {
    const { onCreated, user } = await renderForm(() =>
      jsonResponse(
        {
          detail: [
            { loc: ['body', 'title'], msg: 'Field required', type: 'missing' },
            {
              loc: ['body', 'payload', 'amount'],
              msg: 'Input should be greater than 0',
              type: 'gt',
            },
          ],
        },
        422,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Create task' }));

    const titleError = await screen.findByText('Field required');
    expect(titleError).toBeInTheDocument();
    expect(screen.getByText('Input should be greater than 0')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Title/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^Amount/)).toHaveAttribute('aria-invalid', 'true');
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('shows a 400 as a general message', async () => {
    const { user } = await renderForm(() =>
      jsonResponse({ detail: 'Idempotency-Key header is required' }, 400),
    );

    await user.click(screen.getByRole('button', { name: 'Create task' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Idempotency-Key header is required',
    );
  });

  it('reports it when the types cannot be loaded', async () => {
    mockFetch(() => Promise.resolve(jsonResponse({ detail: 'boom' }, 500)));
    render(<CreateTaskForm onCreated={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load task types/i);
  });

  it('hands cancelling back to its caller', async () => {
    const { onCancel, user } = await renderForm();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
