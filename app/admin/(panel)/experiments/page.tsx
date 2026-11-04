import { requireSession } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { PageHeader, Card, Flash, Badge, Empty, fmtDate } from '@/components/ui';
import { TARGETS, METRICS, isLive, targetOf, type Experiment } from '@/lib/abtest/core';
import { analyse, ZERO, MIN_VISITORS, type Row } from '@/lib/abtest/stats';
import { normCopy } from '@/lib/abtest/apply';
import { listExperiments, results, exchangeRates, COPY_KEY } from '@/lib/abtest/store';
import { anyTracker, normTracking } from '@/lib/tracking';
import ExperimentForm from './ExperimentForm';
import { startExperiment, stopExperiment, deleteExperiment, resetExperiment, promoteWinner, clearCopy } from './actions';

export const metadata = { title: 'Experiments' };
export const dynamic = 'force-dynamic';

const pct = (x: number | null, d = 1) => (x === null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(d)}%`);
const signed = (x: number | null) => (x === null || !Number.isFinite(x) ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`);
const VERDICT: Record<Row['verdict'], [string, string]> = {
  control: ['gray', 'Control'], collecting: ['gray', 'Collecting data'], winning: ['green', 'Winning'], losing: ['red', 'Losing'], flat: ['yellow', 'No clear winner'],
};
function statusBadge(e: Experiment) {
  if (e.status === 'running') return isLive(e) ? <Badge tone="green">Running</Badge> : <Badge tone="blue">{e.startAt && Date.parse(e.startAt) > Date.now() ? 'Scheduled' : 'Ended (end date)'}</Badge>;
  return e.status === 'stopped' ? <Badge tone="gray">Stopped{e.winner ? ` · winner ${e.winner.toUpperCase()}` : ''}</Badge> : <Badge tone="yellow">Draft</Badge>;
}
const changes = (e: Experiment, set: Record<string, string>) => {
  const t = targetOf(e.target);
  return Object.entries(set).map(([k, v]) => { const sl = t?.slots.find((x) => x.key === k); return `${sl?.label || k}: ${sl?.kind === 'layout' ? sl.options?.find((o) => o.v === v)?.label || v : `"${v}"`}`; });
};

export default async function Experiments({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireSession('content');
  const sp = await searchParams;
  let list: Experiment[] = [], dbErr = '';
  try { list = await listExperiments(); } catch (e: any) { dbErr = e?.message || 'database error'; }
  const settings = await getSettings();
  const editing = sp.edit ? list.find((e) => e.id === sp.edit) : null;
  if (sp.new === '1' || editing) {
    return (
      <>
        <PageHeader title={editing ? `Edit: ${editing.name}` : 'New experiment'} desc="Pick a page, write the variant texts or pick a layout. Saved as a draft; nothing changes on the website until you press Start." />
        <Flash sp={sp} />
        <ExperimentForm initial={editing || null} existing={!!editing} />
      </>
    );
  }
  const consent = anyTracker(normTracking(settings.tracking));
  const base = String(settings.currency || 'USD');
  const fx = list.some((e) => e.status !== 'draft') ? await exchangeRates() : null;
  const res = await Promise.all(list.map((e) => (e.status === 'draft' ? null : results(e.id, fx, fx?.base || base).catch((err) => { console.error('[abtest] results', e.id, err?.message || err); return null; }))));
  const copy = normCopy(settings[COPY_KEY]);
  const site = String(settings.site_url || 'https://globalhostia.com').replace(/\/$/, '');

  return (
    <>
      <PageHeader title="Experiments" desc={<>A/B test headlines and plan layouts on the hosting and domain pages and see which one sells more. Visitors are split by a random first-party cookie; search engines, bots{consent ? ', visitors who have not accepted the cookie banner' : ''} and Do-Not-Track browsers always see the current page and are never counted. Orders and revenue come from the WHMCS checkout webhook. Only daily totals are stored.</>}
        actions={<a href="/admin/experiments?new=1" className="btn btn-primary h-10">New experiment</a>} />
      <Flash sp={sp} />
      {dbErr && <Card className="mb-6"><p className="text-sm text-red-700">Could not load experiments ({dbErr}). The database tables are created on the next deploy (db-setup patch 039-ab-tests).</p></Card>}
      {!list.length && !dbErr && <Empty icon="activity">No experiments yet. Create one to compare two headlines or plan layouts.</Empty>}

      <div className="space-y-6">
        {list.map((e, i) => {
          const r = res[i];
          const rows = analyse(e.variants.map((v) => ({ key: v.key, ...(r?.byVariant[v.key] || ZERO) })), e.metric);
          const totalVisitors = rows.reduce((n, x) => n + x.visitors, 0);
          const metric = METRICS.find((m) => m.v === e.metric)?.label || e.metric;
          const days = e.startedAt ? Math.max(1, Math.ceil(((e.stoppedAt ? Date.parse(e.stoppedAt) : Date.now()) - Date.parse(e.startedAt)) / 864e5)) : 0;
          const otherCur = r ? [...new Set(Object.values(r.byVariant).flatMap((v) => Object.keys(v.revenueByCur)))] : [];
          return (
            <section key={e.id} className="card" aria-labelledby={`exp-${e.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h2 id={`exp-${e.id}`} className="text-[15px] font-semibold text-slate-900">{e.name}</h2>{statusBadge(e)}</div>
                  <p className="mt-1 text-xs text-slate-500"><code>{e.id}</code> · {targetOf(e.target)?.label} · {e.paths.join(', ')} · metric: {metric}
                    {e.startedAt ? <> · started {fmtDate(e.startedAt)}{days ? ` (${days} day${days === 1 ? '' : 's'})` : ''}</> : null}{e.stoppedAt ? <> · stopped {fmtDate(e.stoppedAt)}</> : null}
                    {e.endAt ? <> · ends {fmtDate(e.endAt)}</> : null}</p>
                  {e.notes && <p className="mt-1.5 max-w-3xl text-[13px] text-slate-600">{e.notes}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {e.status !== 'running' && <a className="btn btn-secondary h-9" href={`/admin/experiments?edit=${encodeURIComponent(e.id)}`}>Edit</a>}
                  {e.status === 'running'
                    ? <form action={stopExperiment}><input type="hidden" name="id" value={e.id} /><button className="btn btn-secondary h-9">Stop</button></form>
                    : <form action={startExperiment}><input type="hidden" name="id" value={e.id} /><button className="btn btn-primary h-9">{e.status === 'stopped' ? 'Resume' : 'Start'}</button></form>}
                  {e.status === 'stopped' && <form action={resetExperiment}><input type="hidden" name="id" value={e.id} /><button className="btn btn-ghost h-9">Clear results</button></form>}
                  {e.status !== 'running' && <form action={deleteExperiment}><input type="hidden" name="id" value={e.id} /><button className="btn btn-ghost h-9 text-red-600">Delete</button></form>}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-[13px]">
                  <caption className="sr-only">Results of {e.name}</caption>
                  <thead className="bg-slate-50 text-[11.5px] uppercase tracking-wide text-slate-500">
                    <tr><th scope="col" className="px-5 py-2.5">Variant</th><th scope="col" className="px-3 text-right">Visitors</th><th scope="col" className="px-3 text-right">CTA clicks</th><th scope="col" className="px-3 text-right">Add to cart</th><th scope="col" className="px-3 text-right">Orders</th><th scope="col" className="px-3 text-right">Conv. rate</th><th scope="col" className="px-3 text-right">Revenue / visitor</th><th scope="col" className="px-3 text-right">Uplift</th><th scope="col" className="px-3 text-right">Chance to beat control</th><th scope="col" className="px-3">Verdict</th><th scope="col" className="px-5"><span className="sr-only">Actions</span></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row, j) => {
                      const v = e.variants[j];
                      const [tone, label] = VERDICT[row.verdict];
                      return (
                        <tr key={v.key} className={e.winner === v.key ? 'bg-emerald-50/50' : ''}>
                          <th scope="row" className="px-5 py-3 align-top font-normal">
                            <div className="font-semibold text-slate-900">{v.key.toUpperCase()} · {v.name} <span className="font-normal text-slate-400">({v.weight}%)</span></div>
                            <div className="mt-0.5 max-w-[340px] text-xs text-slate-500">{j === 0 ? 'Current page' : changes(e, v.set).join(' · ')}</div>
                            <a className="mt-1 inline-block text-xs text-brand-600 hover:underline" target="_blank" rel="noopener" href={`${site}${e.paths[0]}${j ? `?ab=${e.id}.${v.key}` : ''}`}>Preview{j ? '' : ' current page'}</a>
                          </th>
                          <td className="px-3 text-right align-top tabular-nums pt-3">{row.visitors.toLocaleString('en-US')}</td>
                          <td className="px-3 text-right align-top tabular-nums pt-3">{row.cta.toLocaleString('en-US')}</td>
                          <td className="px-3 text-right align-top tabular-nums pt-3">{row.carts.toLocaleString('en-US')}</td>
                          <td className="px-3 text-right align-top tabular-nums pt-3">{row.orders.toLocaleString('en-US')}</td>
                          <td className="px-3 text-right align-top tabular-nums pt-3 font-semibold">{pct(row.visitors ? row.rate : null, 2)}</td>
                          <td className="px-3 text-right align-top tabular-nums pt-3">{row.visitors ? `${row.rpv.toFixed(2)} ${fx?.base || base}` : '—'}{row.rpvUplift !== null ? <div className="text-xs text-slate-500">{signed(row.rpvUplift)}</div> : null}</td>
                          <td className={`px-3 text-right align-top tabular-nums pt-3 ${row.uplift === null ? '' : row.uplift >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{signed(row.uplift)}</td>
                          <td className="px-3 text-right align-top tabular-nums pt-3">{row.prob === null ? '—' : pct(row.prob, 0)}</td>
                          <td className="px-3 pt-3 align-top"><Badge tone={tone}>{label}</Badge>{j > 0 && <p className="mt-1 max-w-[260px] text-xs leading-snug text-slate-500">{row.note}</p>}</td>
                          <td className="px-5 pt-2.5 align-top text-right">
                            {e.status !== 'draft' && (
                              <form action={promoteWinner}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="variant" value={v.key} />
                                <button className={`btn h-8 whitespace-nowrap text-xs ${row.verdict === 'winning' ? 'btn-primary' : 'btn-ghost'}`} title={j ? 'Write this variant into the page for everyone and stop the test' : 'Keep the current page and stop the test'}>{j ? 'Promote winner' : 'Keep control'}</button>
                              </form>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {e.status !== 'draft' && (
                <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                  {totalVisitors < MIN_VISITORS * e.variants.length ? `Minimum sample: at least ${MIN_VISITORS} visitors per variant before reading anything into the numbers. ` : ''}
                  Conversion rate = unique visitors who did the primary metric ÷ unique visitors. &quot;Chance to beat control&quot; is a Bayesian estimate; the verdict needs p &lt; 0.05 (two-proportion z-test). Revenue per visitor is shown for information (WHMCS order totals{fx ? `, converted to ${fx.base} with WHMCS exchange rates` : otherCur.length > 1 ? `; only ${base} is summed because WHMCS rates were unavailable` : ''}) and is not tested for significance.
                </p>
              )}
            </section>
          );
        })}
      </div>

      <Card title="Promoted copy" className="mt-8">
        {!Object.keys(copy).length ? <p className="text-sm text-slate-500">No promoted texts. When a variant wins, &quot;Promote winner&quot; writes its texts or layout here and every visitor sees them.</p> : (
          <ul className="divide-y divide-slate-100">
            {Object.entries(copy).flatMap(([path, slots]) => Object.entries(slots).map(([k, v]) => {
              const target = TARGETS.find((x) => x.paths.includes(path)); const sl = target?.slots.find((x) => x.key === k);
              return (
                <li key={`${path}:${k}`} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                  <span><code>{path}</code> · {sl?.label}: <span className="text-slate-700">{sl?.kind === 'layout' ? sl.options?.find((o) => o.v === v)?.label : `"${v}"`}</span></span>
                  <form action={clearCopy}><input type="hidden" name="path" value={path} /><input type="hidden" name="slot" value={k} /><button className="btn btn-ghost h-8 text-xs">Remove</button></form>
                </li>
              );
            }))}
          </ul>
        )}
      </Card>
      <Card title="How it works" className="mt-6">
        <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-slate-600">
          <li>Create an experiment, write the variant text or pick a layout, and check each variant with its Preview link (previews are never counted).</li>
          <li>Press Start. Only one test can run on a page at a time. Visitors keep their variant for 90 days.</li>
          <li>Wait for at least {MIN_VISITORS} visitors and 10 conversions per variant, and ideally a full week (weekday and weekend traffic differ).</li>
          <li>When a variant is marked Winning, press Promote winner: its text becomes the page&apos;s copy and the test stops. Keep control if nothing wins.</li>
        </ol>
        <p className="mt-3 text-xs text-slate-500">Orders are counted when the WHMCS reminders hook is installed (cart snapshot + AfterShoppingCartCheckout webhook). Google always gets the current page: the page address and canonical link never change.</p>
      </Card>
    </>
  );
}
