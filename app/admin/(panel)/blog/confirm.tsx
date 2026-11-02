'use client';
import type { ReactNode } from 'react';

/** Submit button that asks for confirmation first (e.g. delete). */
export default function ConfirmSubmit({ message, className, children, label }: { message: string; className?: string; children: ReactNode; label?: string }) {
  return (
    <button type="submit" className={className} aria-label={label}
      onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
