import type { FormEvent, ReactNode } from 'react';

interface FormShellProps {
  /** The form's own fields. */
  children: ReactNode;
  onSubmit: () => void;
  submitting: boolean;
  /** The API's `detail`, or null while nothing has been refused. */
  error: string | null;
  submitLabel: string;
  /** Set when the form's own fields are not yet valid to send. */
  disabled?: boolean;
}

/**
 * The frame around every completion form: submit wiring, the in-flight button state and
 * the error the API answered with.
 *
 * Keeping it here means a new action type writes fields and nothing else — and that the
 * button is disabled while a request is in flight in every form, by construction rather
 * than by each author remembering to.
 */
export function FormShell({
  children,
  onSubmit,
  submitting,
  error,
  submitLabel,
  disabled = false,
}: FormShellProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      {children}
      {error !== null && (
        <p className="form__error" role="alert">
          {error}
        </p>
      )}
      <button className="button" type="submit" disabled={submitting || disabled}>
        {submitting ? 'Sending…' : submitLabel}
      </button>
    </form>
  );
}
