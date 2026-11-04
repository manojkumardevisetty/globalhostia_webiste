'use client';
import { useMemo, useState } from 'react';
import { TARGETS, METRICS, VARIANT_KEYS, type Experiment } from '@/lib/abtest/core';
import { saveExperiment } from './actions';

type V = { name: string; weight: number; set: Record<string, string> };
type State = { id: string; name: string; target: string; paths: string[]; metric: string; notes: string; startAt: string; endAt: string; variants: V[] };

const slugId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export default function ExperimentForm({ initial, existing }: { initial: Experiment | null; existing: boolean }) {
  const [st, setSt] = useState<State>(() => initial ? {
    id: initial.id, name: initial.name, target: initial.target, paths: initial.paths, metric: initial.metric, notes: initial.notes,
    startAt: initial.startAt ? new Date(Date.parse(initial.startAt) + 4 * 3600e3).toISOString().slice(0, 16) : '',
    endAt: initial.endAt ? new Date(Date.parse(initial.endAt) + 4 * 3600e3).toISOString().slice(0, 16) : '',
    variants: initial.variants.map((v) => ({ name: v.name, weight: v.weight, set: { ...v.set } })),
  } : { id: '', name: '', target: TARGETS[0].key, paths: [...TARGETS[0].paths], metric: 'cart', notes: '', startAt: '', endAt: '',
    variants: [{ name: 'Control', weight: 50, set: {} }, { name: 'Variant B', weight: 50, set: {} }] });
  const [idTouched, setIdTouched] = useState(existing);
  const target = TARGETS.find((t) => t.key === st.target) || TARGETS[0];
  const total = st.variants.reduce((n, v) => n + (Number(v.weight) || 0), 0);
  const patch = (p: Partial<State>) => setSt((x) => ({ ...x, ...p }));
  const patchV = (i: number, p: Partial<V>) => setSt((x) => ({ ...x, variants: x.variants.map((v, j) => (j === i ? { ...v, ...p } : v)) }));
  const setSlot = (i: number, k: string, val: string) => setSt((x) => ({ ...x, variants: x.variants.map((v, j) => {
    if (j !== i) return v; const set = { ...v.set }; if (val) set[k] = val; else delete set[k]; return { ...v, set };
  }) }));
  const data = useMemo(() => JSON.stringify({ ...st, existing }), [st, existing]);

  return (
    <form action={saveExperiment} className="card space-y-6 p-6">
      <input type="hidden" name="data" value={data} />
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block"><span className="field-label">Name</span>
          <input className="input" required maxLength={100} value={st.name} placeholder="Hosting hero headline" onChange={(e) => patch({ name: e.target.value, ...(idTouched ? {} : { id: slugId(e.target.value) }) })} /></label>
        <label className="block"><span className="field-label">Id</span>
          <input className="input font-mono" required pattern="[a-z0-9][a-z0-9-]{1,39}" value={st.id} readOnly={existing} onChange={(e) => { setIdTouched(true); patch({ id: slugId(e.target.value) }); }} />
          <span className="mt-1.5 block text-xs text-slate-400">Used in preview links and reports. Cannot change after saving.</span></label>
        <label className="block"><span className="field-label">Page</span>
          <select className="input" value={st.target} onChange={(e) => { const t = TARGETS.find((x) => x.key === e.target.value)!; patch({ target: t.key, paths: [...t.paths], variants: st.variants.map((v) => ({ ...v, set: {} })) }); }}>
            {TARGETS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select></label>
        <fieldset><legend className="field-label">Run on</legend>
          <div className="flex flex-wrap gap-4 pt-1">{target.paths.map((p) => (
            <label key={p} className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={st.paths.includes(p)}
              onChange={(e) => patch({ paths: e.target.checked ? [...st.paths, p] : st.paths.filter((x) => x !== p) })} /><code>{p}</code></label>
          ))}</div></fieldset>
        <label className="block"><span className="field-label">Primary metric</span>
          <select className="input" value={st.metric} onChange={(e) => patch({ metric: e.target.value })}>{METRICS.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}</select>
          <span className="mt-1.5 block text-xs text-slate-400">Decides the verdict. All metrics are always shown.</span></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="field-label">Start (Dubai, optional)</span><input type="datetime-local" className="input" value={st.startAt} onChange={(e) => patch({ startAt: e.target.value })} /></label>
          <label className="block"><span className="field-label">End (Dubai, optional)</span><input type="datetime-local" className="input" value={st.endAt} onChange={(e) => patch({ endAt: e.target.value })} /></label>
        </div>
      </div>
      <label className="block"><span className="field-label">Hypothesis / notes</span>
        <textarea className="input min-h-[64px]" maxLength={1000} value={st.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="What do you expect, and why?" /></label>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-slate-900">Variants <span className={`ml-2 text-xs font-normal ${total === 100 ? 'text-slate-500' : 'text-amber-700'}`}>traffic weights add up to {total}{total === 100 ? '' : ' (they are used as proportions)'}</span></h3>
          {st.variants.length < VARIANT_KEYS.length && <button type="button" className="btn btn-secondary h-9" onClick={() => patch({ variants: [...st.variants, { name: `Variant ${VARIANT_KEYS[st.variants.length].toUpperCase()}`, weight: 50, set: {} }] })}>Add variant</button>}
        </div>
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">Only write claims that are true for every plan on the page (for example free SSL, daily backups, free migration, 24/7 support). Prices are never typed here: they always come from WHMCS.</p>
        <div className="grid gap-4 lg:grid-cols-2">
          {st.variants.map((v, i) => (
            <fieldset key={i} className="rounded-xl border border-slate-200 p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{VARIANT_KEYS[i].toUpperCase()} {i === 0 ? '· control' : ''}</legend>
              <div className="grid grid-cols-[1fr_96px] gap-3">
                <label className="block"><span className="field-label">Name</span><input className="input" maxLength={60} value={v.name} onChange={(e) => patchV(i, { name: e.target.value })} /></label>
                <label className="block"><span className="field-label">Weight</span><input type="number" min={0} max={100} className="input" value={v.weight} onChange={(e) => patchV(i, { weight: Number(e.target.value) })} /></label>
              </div>
              {i === 0 ? <p className="mt-3 text-xs text-slate-500">The page as it is today. Search engines and visitors outside the test always see this.</p> : (
                <div className="mt-3 space-y-3">
                  {target.slots.map((sl) => sl.kind === 'layout' ? (
                    <label key={sl.key} className="block"><span className="field-label">{sl.label}</span>
                      <select className="input" value={v.set[sl.key] || ''} onChange={(e) => setSlot(i, sl.key, e.target.value)}>
                        <option value="">Same as control</option>{sl.options!.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                      </select></label>
                  ) : (
                    <label key={sl.key} className="block"><span className="field-label">{sl.label}</span>
                      {sl.kind === 'longtext'
                        ? <textarea className="input min-h-[60px]" maxLength={sl.max} value={v.set[sl.key] || ''} placeholder="Empty = same as control" onChange={(e) => setSlot(i, sl.key, e.target.value)} />
                        : <input className="input" maxLength={sl.max} value={v.set[sl.key] || ''} placeholder="Empty = same as control" onChange={(e) => setSlot(i, sl.key, e.target.value)} />}
                      {sl.hint && <span className="mt-1 block text-xs text-slate-400">{sl.hint}</span>}</label>
                  ))}
                  {i > 1 || st.variants.length > 2 ? <button type="button" className="text-xs font-medium text-red-600 hover:underline" onClick={() => patch({ variants: st.variants.filter((_, j) => j !== i) })}>Remove this variant</button> : null}
                </div>
              )}
            </fieldset>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
        <button className="btn btn-primary h-10">Save as draft</button>
        <a href="/admin/experiments" className="btn btn-ghost h-10">Cancel</a>
        <span className="text-xs text-slate-500">Saving never starts the test. Use the preview links, then press Start on the list.</span>
      </div>
    </form>
  );
}
