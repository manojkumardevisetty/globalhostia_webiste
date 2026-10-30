'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';

type Item = { id: string; name: string; type: string; visible: boolean };

export default function SortableSections({ pageId, items, reorder, opAction }: {
  pageId: string; items: Item[];
  reorder: (pageId: string, ids: string[]) => Promise<{ ok: boolean }>;
  opAction: (fd: FormData) => Promise<void>;
}) {
  const [list, setList] = useState(items);
  const [drag, setDrag] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');

  const drop = (to: number) => {
    if (drag === null || drag === to) return;
    const next = [...list]; const [m] = next.splice(drag, 1); next.splice(to, 0, m);
    setList(next); setDrag(null);
    start(async () => {
      try { await reorder(pageId, next.map((x) => x.id)); setMsg('Order saved'); (document.getElementById('gh-preview') as HTMLIFrameElement | null)?.contentWindow?.location.reload(); }
      catch (e: any) { setMsg(e.message); }
    });
  };

  const typeTone: Record<string, string> = { html: 'bg-slate-100 text-slate-600', products: 'bg-emerald-50 text-emerald-700', faq: 'bg-amber-50 text-amber-700' };
  return (
    <div>
      <ul className="divide-y divide-slate-100">
        {list.map((s, i) => (
          <li key={s.id} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(i)}
            className={`flex items-center gap-2 px-2 py-2 text-sm ${drag === i ? 'opacity-40' : ''} ${s.visible ? '' : 'bg-slate-50 text-slate-400'}`}>
            <span className="cursor-grab select-none text-slate-300" title="Drag to reorder">⋮⋮</span>
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${typeTone[s.type] || 'bg-brand-50 text-brand-700'}`}>{s.type}</span>
            <Link href={`/admin/pages/${pageId}/sections/${s.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-brand-600">{s.name || '(untitled)'}</Link>
            {(['up', 'down', 'toggle', 'duplicate', 'delete'] as const).map((op) => (
              <form key={op} action={opAction} onSubmit={(e) => { if (op === 'delete' && !confirm('Delete this section? (It is kept in revision history.)')) e.preventDefault(); }}>
                <input type="hidden" name="id" value={s.id} /><input type="hidden" name="op" value={op} />
                <button className={`rounded px-1.5 py-1 text-xs hover:bg-slate-100 ${op === 'delete' ? 'text-red-500' : 'text-slate-500'}`} title={op}>
                  {op === 'up' ? '↑' : op === 'down' ? '↓' : op === 'toggle' ? (s.visible ? 'Hide' : 'Show') : op === 'duplicate' ? 'Copy' : '✕'}
                </button>
              </form>
            ))}
          </li>
        ))}
      </ul>
      <p className="mt-2 h-4 text-xs text-slate-400">{pending ? 'Saving order…' : msg}</p>
    </div>
  );
}
