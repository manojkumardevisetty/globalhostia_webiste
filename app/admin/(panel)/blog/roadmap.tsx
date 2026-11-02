'use client';
import { useActionState, useState } from 'react';
import { saveRoadmap } from './actions';
import { Icon } from '@/components/icons';

type Item = { title: string; description: string; eta: string; status: 'planned' | 'in_progress' | 'launched' };
const STATUS: [Item['status'], string][] = [['planned', 'Planned'], ['in_progress', 'In progress'], ['launched', 'Launched']];
const blank = (): Item => ({ title: '', description: '', eta: '', status: 'planned' });

/** Admin editor for settings.roadmap ("What's coming next" on the blog). */
export default function RoadmapEditor({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState<Item[]>(initial);
  const [state, action, pending] = useActionState(saveRoadmap, {});
  const upd = (i: number, k: keyof Item, v: string) => setItems((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const move = (i: number, d: number) => setItems((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <p className="text-xs leading-relaxed text-slate-500">Shown as a timeline on the blog and under every article. Only list real plans: leave it empty to hide the section.</p>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200" role="alert">{state.error}</p>}
      {state.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200" role="status">{state.ok}</p>}
      {items.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">No items. The section is hidden on the website.</p>}
      <ol className="space-y-3">
        {items.map((it, i) => (
          <li key={i} className="rounded-xl border border-slate-200 p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_150px]">
              <label className="block"><span className="field-label">Title</span>
                <input value={it.title} onChange={(e) => upd(i, 'title', e.target.value)} maxLength={80} placeholder="e.g. Managed Kubernetes" className="input" required /></label>
              <label className="block"><span className="field-label">When</span>
                <input value={it.eta} onChange={(e) => upd(i, 'eta', e.target.value)} maxLength={40} placeholder="e.g. Q1 2027" className="input" /></label>
              <label className="block"><span className="field-label">Status</span>
                <select value={it.status} onChange={(e) => upd(i, 'status', e.target.value)} className="input">{STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label className="block md:col-span-3"><span className="field-label">Short description</span>
                <input value={it.description} onChange={(e) => upd(i, 'description', e.target.value)} maxLength={240} placeholder="One sentence about what customers will get" className="input" /></label>
            </div>
            <div className="mt-2 flex justify-end gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="btn btn-ghost h-8 px-2 text-xs" aria-label={`Move item ${i + 1} up`}>↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="btn btn-ghost h-8 px-2 text-xs" aria-label={`Move item ${i + 1} down`}>↓</button>
              <button type="button" onClick={() => setItems((l) => l.filter((_, j) => j !== i))} className="btn btn-ghost h-8 px-2 text-xs text-red-600 hover:bg-red-50" aria-label={`Remove item ${i + 1}`}><Icon name="trash" /> Remove</button>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setItems((l) => [...l, blank()])} disabled={items.length >= 12} className="btn btn-secondary"><Icon name="plus" /> Add item</button>
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? 'Saving…' : 'Save roadmap'}</button>
      </div>
    </form>
  );
}
