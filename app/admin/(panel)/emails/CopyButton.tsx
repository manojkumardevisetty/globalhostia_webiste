'use client';
import { useState } from 'react';

/** Copies the text of the element with id `target` (works on mobile Safari/Chrome; falls back to select + execCommand). */
export default function CopyButton({ target, label = 'Copy SQL' }: { target: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'err'>('idle');
  async function copy() {
    const el = document.getElementById(target) as HTMLTextAreaElement | null;
    if (!el) return;
    try {
      await navigator.clipboard.writeText(el.value);
      setState('ok');
    } catch {
      try { el.focus(); el.select(); el.setSelectionRange(0, el.value.length); setState(document.execCommand('copy') ? 'ok' : 'err'); }
      catch { setState('err'); }
    }
    setTimeout(() => setState('idle'), 2500);
  }
  return (
    <button type="button" onClick={copy} className="btn btn-primary" aria-live="polite">
      {state === 'ok' ? 'Copied ✓' : state === 'err' ? 'Select & copy manually' : label}
    </button>
  );
}
