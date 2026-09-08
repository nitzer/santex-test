import { useState } from 'react';

import { uploadDocument } from '../../api/client';
import { FormShell } from './FormShell';
import type { CompletionFormProps } from './types';
import { useCompletionSubmit } from './useCompletionSubmit';

/**
 * Completes `documentation_upload`: the only type that sends a real file, and so the
 * only one that talks to `/upload` instead of `/complete`.
 *
 * Each form owning its endpoint is what lets the two transports coexist without any
 * caller having to know which is which.
 */
export function DocumentUploadForm({ action, onCompleted }: CompletionFormProps<'documentation_upload'>) {
  const { submit, submitting, error } = useCompletionSubmit(onCompleted);
  const [file, setFile] = useState<File | null>(null);

  function handleSubmit() {
    if (file === null) return;
    void submit((idempotencyKey) => uploadDocument(action.id, file, idempotencyKey));
  }

  return (
    <FormShell
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
      submitLabel="Upload document"
      disabled={file === null}
    >
      <label className="field">
        File
        <input
          type="file"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>
      {file !== null && <p className="field__hint">{file.name}</p>}
    </FormShell>
  );
}
