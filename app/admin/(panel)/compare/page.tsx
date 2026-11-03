import { PageHeader, Flash, Card, Field, Badge, Stat } from '@/components/ui';
import { getSettings } from '@/lib/settings';
import { COMPETITORS, FACT_KEYS, FACT_LABEL, STALE_DAYS, competitors, readOverrides, staleItems, checkedRange, sourcesOf, longDate, vsPath } from '@/lib/compare/competitors';
import { saveCompetitor, markVerified, setHidden, resetCompetitor } from './actions';

export const metadata = { title: 'Competitor pages' };
export const dynamic = 'force-dynamic';

const A = ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href} target="_blank" rel="noopener" className="text-brand-600 hover:underline">{children}</a>;

export default async function CompetitorPages({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  const list = competitors(settings);
  const edited = readOverrides(settings);
  const stale = list.map((c) => ({ c, st: staleItems(c) })).filter((x) => x.st.any);
  const live = list.filter((c) => !c.hidden);

  return (
    <>
      <PageHeader title="Competitor pages" desc={<>The &ldquo;GlobalHostia vs &lt;host&gt;&rdquo; comparison pages. Every fact about another provider must come from that provider&apos;s own website, with the link and the date you checked it. Our own column is always read from the live catalog. GoDaddy is not covered.</>} />
      <Flash sp={sp} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Live pages" value={live.length} sub={`${list.length - live.length} hidden`} icon="globe" />
        <Stat label="Needs re-verifying" value={stale.length} sub={`facts older than ${STALE_DAYS} days`} icon="search" tone={stale.length ? 'red' : 'brand'} />
        <Stat label="Edited in admin" value={Object.keys(edited).length} sub="on top of the researched defaults" icon="pen" />
        <Stat label="Hub" value={<A href="/compare">/compare</A>} sub="lists the live pages" icon="file" />
      </div>

      {stale.length > 0 && (
        <Card title={`Review needed: facts older than ${STALE_DAYS} days (${stale.length})`} className="mb-6">
          <p className="mb-3 text-xs text-slate-500">Open each source, compare it with the page, update any fact that changed, then press <b>Mark re-verified</b>. A monthly email reminds the owner while anything here is out of date.</p>
          <table className="table text-sm"><tbody>{stale.map(({ c, st }) => (
            <tr key={c.slug}><td className="font-semibold">{c.name}</td>
              <td className="text-xs">{st.facts.map((k) => FACT_LABEL[k]).join(', ')}{st.stronger ? `${st.facts.length ? ', ' : ''}${st.stronger} strength(s)` : ''} · oldest {longDate(checkedRange(c).oldest)}</td>
              <td className="text-right"><form action={markVerified} className="inline"><input type="hidden" name="slug" value={c.slug} /><button className="btn btn-primary">Mark re-verified</button></form></td></tr>))}</tbody></table>
        </Card>
      )}

      <Card title="Pages" className="mb-6">
        <div className="overflow-x-auto"><table className="table text-sm"><thead><tr><th>Provider</th><th>Page</th><th>Facts as of</th><th>Status</th><th></th></tr></thead><tbody>{list.map((c) => {
          const st = staleItems(c), r = checkedRange(c);
          const missing = FACT_KEYS.filter((k) => !c.facts[k]);
          return (
            <tr key={c.slug}><td><b>{c.name}</b><div className="text-xs text-slate-400">{c.site.replace(/^https:\/\//, '')}</div></td>
              <td className="text-xs">{c.hidden ? <span className="text-slate-400">{vsPath(c.slug)}</span> : <A href={vsPath(c.slug)}>{vsPath(c.slug)}</A>}</td>
              <td className="text-xs">{r.oldest === r.newest ? longDate(r.newest) : `${longDate(r.oldest)} – ${longDate(r.newest)}`}{missing.length ? <div className="text-slate-400">Not stated: {missing.map((k) => FACT_LABEL[k]).join(', ')}</div> : null}</td>
              <td className="space-x-1">{c.hidden ? <Badge>Hidden</Badge> : <Badge tone="green">Live</Badge>}{st.any ? <Badge tone="red">Re-verify</Badge> : <Badge tone="blue">Current</Badge>}{edited[c.slug] ? <Badge tone="yellow">Edited</Badge> : null}</td>
              <td className="whitespace-nowrap text-right">
                <form action={setHidden} className="inline"><input type="hidden" name="slug" value={c.slug} /><input type="hidden" name="hide" value={c.hidden ? '0' : '1'} /><button className="btn btn-secondary">{c.hidden ? 'Show page' : 'Hide page'}</button></form>{' '}
                <form action={markVerified} className="inline"><input type="hidden" name="slug" value={c.slug} /><button className="btn btn-secondary">Mark re-verified</button></form>{' '}
                <a href={`#edit-${c.slug}`} className="btn btn-secondary">Edit</a></td></tr>);
        })}</tbody></table></div>
        <p className="mt-2 text-xs text-slate-400">Hidden pages answer 404 and leave the sitemap, /llms.txt and the /compare hub. Saving pings IndexNow for the page and the hub.</p>
      </Card>

      <div className="space-y-6">{list.map((c) => {
        const base = COMPETITORS.find((x) => x.slug === c.slug)!;
        return (
          <Card key={c.slug} title={<span id={`edit-${c.slug}`}>{c.name}</span>} actions={<span className="flex gap-2"><A href={c.site}>Provider site</A>{edited[c.slug] ? <form action={resetCompetitor}><input type="hidden" name="slug" value={c.slug} /><button className="text-xs text-red-600 hover:underline">Reset to researched facts</button></form> : null}</span>}>
            <form action={saveCompetitor} className="space-y-4">
              <input type="hidden" name="slug" value={c.slug} />
              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <Field label="Who it suits (verdict box)" hint="Neutral and based on the facts below."><textarea name="suits" defaultValue={c.suits} rows={2} className="input text-sm" /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="hidden" defaultChecked={c.hidden} /> Hide this page</label>
              </div>
              <div className="overflow-x-auto"><table className="table text-xs"><thead><tr><th>Fact</th><th>Value shown (empty = &ldquo;Not stated&rdquo;)</th><th>Source (provider&apos;s own page)</th><th>Checked</th></tr></thead><tbody>{FACT_KEYS.map((k) => {
                const f = c.facts[k], old = staleItems(c).facts.includes(k);
                return (
                  <tr key={k}><td className="whitespace-nowrap font-semibold">{FACT_LABEL[k]}{old ? <div><Badge tone="red">older than {STALE_DAYS} days</Badge></div> : null}{base.facts[k] && f && f.value !== base.facts[k]!.value ? <div><Badge tone="yellow">edited</Badge></div> : null}</td>
                    <td><textarea name={`v_${k}`} defaultValue={f?.value || ''} rows={2} className="input min-w-[260px] text-xs" /></td>
                    <td><input name={`s_${k}`} defaultValue={f?.source || ''} className="input min-w-[240px] text-xs" placeholder="https://" />{f ? <div className="mt-1"><A href={f.source}>Open source</A></div> : null}</td>
                    <td><input type="date" name={`d_${k}`} defaultValue={f?.checked || ''} className="input text-xs" /></td></tr>);
              })}</tbody></table></div>
              <Field label="Where this provider is stronger (required, at least one)" hint={<>One per line: <code>text | https://source | YYYY-MM-DD</code>. Lines like &ldquo;lower first-term price&rdquo; and &ldquo;more storage&rdquo; are added automatically on the page when our live prices and specs show them.</>}>
                <textarea name="stronger" defaultValue={c.stronger.map((x) => `${x.text} | ${x.source} | ${x.checked}`).join('\n')} rows={Math.max(3, c.stronger.length + 1)} className="input font-mono text-xs" />
              </Field>
              <div className="flex items-center justify-between gap-3"><span className="text-xs text-slate-400">Sources on the page: {sourcesOf(c).length}. Wording is checked for disparaging terms, ratings and GoDaddy.</span><button className="btn btn-primary">Save {c.name}</button></div>
            </form>
          </Card>);
      })}</div>
    </>
  );
}
