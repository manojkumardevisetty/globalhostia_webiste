'use client';
import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

/** Submit button that shows a working state while its form's server action runs (long AI steps take up to a few minutes). */
export default function PendingButton({ children, pending, className = 'btn btn-primary', confirm, name, value, title, formAction }: {
  children: ReactNode; pending?: ReactNode; className?: string; confirm?: string; name?: string; value?: string; title?: string;
  formAction?: (fd: FormData) => void | Promise<void>;
}) {
  const s = useFormStatus();
  // several buttons can share a form (row actions): only the one that was pressed shows the spinner
  const mine = s.pending && (!name || s.data?.get(name) === value);
  return (
    <button type="submit" name={name} value={value} title={title} formAction={formAction} disabled={s.pending} aria-busy={s.pending || undefined} className={`${className} disabled:cursor-wait disabled:opacity-70`}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      {mine ? <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />{pending || 'Working…'}</> : children}
    </button>
  );
}
