import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { IDEMPOTENCY_HEADER } from '../../api/client';
import { makeTask } from '../../test/factories';
import { lastFormData, lastRequest, mockFetchOnceJson } from '../../test/fetchMock';
import { DocumentUploadForm } from './DocumentUploadForm';

const action = makeTask('documentation_upload', {
  payload: { document_name: 'runbook-oncall-plataforma.md' },
});

function makeFile() {
  return new File(['# Runbook\n'], 'runbook.md', { type: 'text/markdown' });
}

describe('DocumentUploadForm', () => {
  it('renders a file input and refuses to submit until a file is chosen', async () => {
    const user = userEvent.setup();
    render(<DocumentUploadForm action={action} onCompleted={vi.fn()} />);

    const input = screen.getByLabelText(/file/i);
    const submit = screen.getByRole('button', { name: /upload document/i });
    expect(input).toHaveAttribute('type', 'file');
    expect(submit).toBeDisabled();

    await user.upload(input, makeFile());
    expect(submit).toBeEnabled();
    expect(screen.getByText('runbook.md')).toBeInTheDocument();
  });

  it('posts the file as multipart to /upload with an Idempotency-Key', async () => {
    const completed = { ...action, status: 'completed' as const };
    const fetchSpy = mockFetchOnceJson(completed);
    const onCompleted = vi.fn();
    const user = userEvent.setup();

    render(<DocumentUploadForm action={action} onCompleted={onCompleted} />);
    await user.upload(screen.getByLabelText(/file/i), makeFile());
    await user.click(screen.getByRole('button', { name: /upload document/i }));

    const request = lastRequest(fetchSpy);
    expect(request.url).toContain(`/actions/${action.id}/upload`);
    expect(request.method).toBe('POST');
    expect(request.headers.get(IDEMPOTENCY_HEADER)).toBeTruthy();
    // fetch must set the multipart boundary itself, so we must not have set the type.
    expect(request.headers.get('Content-Type')).toBeNull();

    const sent = lastFormData(fetchSpy).get('file');
    expect(sent).toBeInstanceOf(File);
    expect((sent as File).name).toBe('runbook.md');
    expect(onCompleted).toHaveBeenCalledWith(completed);
  });

  it('shows the detail when the API rejects the upload', async () => {
    mockFetchOnceJson({ detail: 'action type onboarding is completed via /complete' }, 400);
    const user = userEvent.setup();

    render(<DocumentUploadForm action={action} onCompleted={vi.fn()} />);
    await user.upload(screen.getByLabelText(/file/i), makeFile());
    await user.click(screen.getByRole('button', { name: /upload document/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('is completed via /complete');
  });
});
