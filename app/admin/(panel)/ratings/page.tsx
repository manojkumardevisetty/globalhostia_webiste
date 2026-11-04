import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { can } from '@/lib/auth';
import { PageHeader, Card, Badge, Flash, Field, fmtDate } from '@/components/ui';
import { Icon } from '@/components/icons';
import { loadRatingsConfig, ratingsState, dashboard, latest, requestLog, previewRequest } from '@/lib/cx/ratings-engine';
import { SCORE_LABEL } from '@/lib/cx/ratings-email';
import { composeFull, transportReady } from '@/lib/reminders/send';
import { loadConfig as remindersConfig } from '@/lib/reminders/store';
import { setRatingsSwitch, saveRatingsSettings, sendRatingTest, runRatingsNow } from './actions';

export const metadata = { title: 'Ticket ratings' };
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
const REASON: Record<string, string> = {
  guest: 'not a client', spam: 'spam filter', department: 'excluded department', 'too-old': 'closed too long ago', 'before-switch-on': 'closed before switch-on', 'not-closed': 'not closed',
  expired: 'retry window passed', unsubscribed: 'unsubscribed', reopened: 'reopened', 'client-inactive': 'client inactive', 'owner-changed': 'owner changed', 'rated-without-request': 'rated in portal', 'no-date': 'no date',
};

/** Weekly average, 12 weeks: bars on a 1–5 scale, the number of ratings under each bar. */
function TrendChart({ data }: { data: { week: string; n: number; avg: number | null }[] }) {
  const W = 640, H = 170, pad = { l: 28, r: 8, t: 10, b: 34 }, bw = (W - pad.l - pad.r) / data.length;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - 0) / 5);
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-labelledby="rt-title">
        <title id="rt-title">Weekly average rating, last 12 weeks</title>
        {[1, 2, 3, 4, 5].map((v) => <g key={v}><line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth="1" /><text x={pad.l - 6} y={y(v) + 4} fontSize="10" textAnchor="end" fill="#64748b">{v}</text></g>)}
        {data.map((d, i) => {
          const x = pad.l + i * bw + bw * 0.18, w = bw * 0.64;
          return <g key={d.week}>
            {d.avg !== null && <rect x={x} y={y(d.avg)} width={w} height={y(0) - y(d.avg)} rx="3" fill={d.avg <= 2 ? '#b91c1c' : d.avg < 4 ? '#475569' : '#0f172a'}><title>{`Week of ${d.week}: ${d.avg} average from ${d.n} rating(s)`}</title></rect>}
            <text x={x + w / 2} y={H - 18} fontSize="9.5" textAnchor="middle" fill="#64748b">{d.week.slice(5)}</text>
            <text x={x + w / 2} y={H - 6} fontSize="9.5" textAnchor="middle" fill="#94a3b8">{d.n ? `n=${d.n}` : '–'}</text>
          </g>;
        })}
      </svg>
      <figcaption className="sr-only">{data.map((d) => `Week of ${d.week}: ${d.avg === null ? 'no ratings' : `${d.avg} from ${d.n}`}`).join('; ')}</figcaption>
    </figure>
  );
}

export default async function Ratings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireSession('commerce');
  const sp = await searchParams;
  const edit = can(s, 'settings');
  const tab = ['dashboard', 'comments', 'requests', 'settings', 'email'].includes(sp.tab) ? sp.tab : 'dashboard';
  const filter = sp.f === 'low' ? 'low' : sp.f === 'comments' ? 'comments' : 'all';
  const days = [30, 90, 365].includes(Number(sp.d)) ? Number(sp.d) : 90;
  const pl = sp.pl === 'ar' ? 'ar' : 'en';
  const [cfg, st, rcfg, dash] = await Promise.all([loadRatingsConfig(), ratingsState(), remindersConfig().catch(() => null), dashboard(days).catch(() => null)]);
  const rows = tab === 'comments' || tab === 'dashboard' ? await latest({ filter: tab === 'dashboard' ? 'comments' : filter, limit: tab === 'dashboard' ? 6 : 150 }) : [];
  const reqs = tab === 'requests' ? await requestLog(150) : [];
  const preview = tab === 'email' ? await previewRequest(pl).catch(() => null) : null;
  const ready = rcfg ? transportReady(rcfg) : false;
  const lr: any = st.lastResult || {};
  const sum = dash?.summary;
  const tabLink = (k: string, label: string) => <Link href={`/admin/ratings?tab=${k}`} className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{label}</Link>;
  const ratingRow = (r: (typeof rows)[number]) => (
    <li key={r.id} className="py-3">
      <div className="flex flex-wrap items-center gap-2 text-sm"><span className={`font-mono text-base ${Number(r.score) <= 2 ? 'text-red-700' : 'text-slate-900'}`} aria-label={`${r.score} out of 5`}>{stars(Number(r.score))}</span>
        <Link className="font-semibold text-brand-600" href={`/admin/support/${r.ticketId}`}>#{r.tid || r.ticketId}</Link><span className="truncate text-slate-600">{r.subject}</span>
        <span className="ml-auto text-xs text-slate-400">{r.staff ? `${r.staff} · ` : ''}client #{r.clientId} · {fmtDate(r.ratedAt)} · {r.source}</span></div>
      {r.comment && <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-2.5 text-sm text-slate-700">{r.comment}</p>}
    </li>);

  return (
    <>
      <PageHeader title="Ticket ratings" desc="After WHMCS closes a ticket, the client gets one “How did we do?” email with one-tap 1–5 scores (signed link, no login) and an optional comment. 1–2 stars email you at once with the ticket link. The thank-you page invites a public review on Google / Trustpilot only when you set those links, in the same words whatever the score and without any reward (no review gating). Tickets the spam filter closed or flagged are never asked."
        actions={<form action={runRatingsNow}><button className="btn btn-secondary" disabled={!cfg.enabled}><Icon name="refresh" /> Check closed tickets now</button></form>} />
      <Flash sp={sp} />

      <section className={`mb-6 flex flex-wrap items-center gap-4 rounded-2xl border p-5 ${cfg.enabled ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}>
        <span className={`grid h-11 w-11 place-items-center rounded-full ${cfg.enabled ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}><Icon name={cfg.enabled ? 'check' : 'mail'} className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-slate-900">{cfg.enabled ? 'Rating requests are ON' : 'Rating requests are OFF'}</p>
          <p className="text-sm text-slate-500">Email via <b>{rcfg?.transport === 'smtp' ? 'SMTP' : 'WHMCS SendEmail'}</b> {ready ? <Badge tone="green">ready</Badge> : <Badge tone="red">not configured</Badge>}{cfg.since ? ` · asking for tickets closed since ${fmtDate(cfg.since)}` : ''} · last check {st.lastRun ? fmtDate(st.lastRun) : 'never'}{lr.polled !== undefined ? ` (${lr.polled} closed seen, ${lr.sent ?? 0} sent)` : ''} · reviews: {cfg.googleUrl ? <Badge tone="green">Google</Badge> : <Badge tone="gray">Google not set</Badge>} {cfg.trustpilotUrl ? <Badge tone="green">Trustpilot</Badge> : <Badge tone="gray">Trustpilot not set</Badge>}</p>
        </div>
        {edit && <form action={setRatingsSwitch}><input type="hidden" name="on" value={cfg.enabled ? '0' : '1'} /><button className={`btn ${cfg.enabled ? 'btn-secondary' : 'btn-primary'}`}>{cfg.enabled ? 'Stop rating requests' : 'Switch rating requests on'}</button></form>}
      </section>

      <div className="mb-5 flex flex-wrap gap-2">{tabLink('dashboard', 'Dashboard')}{tabLink('comments', 'All ratings')}{tabLink('requests', 'Requests')}{tabLink('settings', 'Settings')}{tabLink('email', 'Email preview')}</div>

      {tab === 'dashboard' && (
        <>
          <div className="mb-3 flex gap-2 text-xs">{[30, 90, 365].map((d) => <Link key={d} href={`/admin/ratings?d=${d}`} className={`rounded-full px-2.5 py-1 ${days === d ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>Last {d} days</Link>)}</div>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="card p-4"><span className="text-[13px] font-semibold text-slate-600">Average</span><p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{sum?.avg ?? '—'}<span className="text-base font-medium text-slate-400"> / 5</span></p><p className="text-xs text-slate-500">{sum?.n || 0} rating(s)</p></div>
            <div className="card p-4"><span className="text-[13px] font-semibold text-slate-600">Response rate</span><p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{dash?.asked.asked ? `${Math.round((dash.asked.answered / dash.asked.asked) * 100)}%` : '—'}</p><p className="text-xs text-slate-500">{dash?.asked.answered || 0} of {dash?.asked.asked || 0} asked</p></div>
            <Link href="/admin/ratings?tab=comments&f=low" className="card p-4 hover:ring-2 hover:ring-slate-200"><span className="text-[13px] font-semibold text-slate-600">Low (1–2)</span><p className={`mt-1 text-2xl font-bold tracking-tight ${sum?.low ? 'text-red-700' : 'text-slate-900'}`}>{sum?.low ?? 0}</p><p className="text-xs text-slate-500">emailed to you at once</p></Link>
            <div className="card p-4"><span className="text-[13px] font-semibold text-slate-600">High (4–5)</span><p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{sum?.high ?? 0}</p><p className="text-xs text-slate-500">of {sum?.n || 0}</p></div>
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Card title="Trend (weekly average)">{dash && dash.trend.some((w) => w.n) ? <TrendChart data={dash.trend} /> : <p className="text-sm text-slate-500">No ratings in the last 12 weeks yet.</p>}
              {sum && sum.n > 0 && <div className="mt-4 space-y-1.5">{[5, 4, 3, 2, 1].map((sc) => { const n = sum.dist[sc - 1], pct = Math.round((n / sum.n) * 100); return (
                <div key={sc} className="flex items-center gap-2 text-xs"><span className="w-24 text-slate-600">{sc} · {SCORE_LABEL.en[sc - 1]}</span><span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${sc <= 2 ? 'bg-red-700' : 'bg-slate-800'}`} style={{ width: `${pct}%` }} /></span><span className="w-16 text-right tabular-nums text-slate-500">{n} ({pct}%)</span></div>); })}</div>}
            </Card>
            <Card title="Per support person" actions={<span className="text-xs text-slate-400">Last staff reply on the ticket</span>}>
              {!dash?.staff.length ? <p className="text-sm text-slate-500">No ratings yet.</p> : (
                <table className="w-full text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-1.5">Staff</th><th>Ratings</th><th>Average</th><th>Low</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{dash.staff.map((x) => <tr key={x.staff || '-'}><td className="py-2">{x.staff || <span className="text-slate-400">Unknown</span>}</td><td className="tabular-nums">{x.n}</td><td className="tabular-nums font-semibold">{x.avg}</td><td className={`tabular-nums ${x.low ? 'text-red-700' : ''}`}>{x.low}</td></tr>)}</tbody></table>)}
            </Card>
          </div>
          <Card title="Latest comments" className="mt-6" actions={<Link className="text-xs text-brand-600" href="/admin/ratings?tab=comments&f=comments">All comments</Link>}>
            {!rows.length ? <p className="text-sm text-slate-500">No comments yet.</p> : <ul className="divide-y divide-slate-100">{rows.map(ratingRow)}</ul>}
          </Card>
        </>
      )}

      {tab === 'comments' && (
        <Card title="Ratings" actions={<div className="flex gap-2 text-xs">{(['all', 'low', 'comments'] as const).map((f) => <Link key={f} href={`/admin/ratings?tab=comments&f=${f}`} className={`rounded-full px-2.5 py-1 ${filter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{f === 'all' ? 'All' : f === 'low' ? '1–2 stars' : 'With comment'}</Link>)}</div>}>
          {!rows.length ? <p className="text-sm text-slate-500">Nothing here yet.</p> : <ul className="divide-y divide-slate-100">{rows.map(ratingRow)}</ul>}
        </Card>
      )}

      {tab === 'requests' && (
        <Card title="Closed tickets seen (latest 150)">
          {!reqs.length ? <p className="text-sm text-slate-500">No closed tickets seen yet. Switch requests on; the WHMCS cron tick checks every 10 minutes.</p> : (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-2">Seen</th><th>Ticket</th><th>Client</th><th>Status</th><th>Sent</th><th className="pr-5">Rating</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{reqs.map((r) => (
                  <tr key={r.id}><td className="whitespace-nowrap px-5 py-2 text-slate-500">{fmtDate(r.createdAt)}</td>
                    <td><Link className="text-brand-600" href={`/admin/support/${r.ticketId}`}>#{r.tid || r.ticketId}</Link><span className="block max-w-[260px] truncate text-xs text-slate-400">{r.subject}</span></td>
                    <td>{r.clientId ? `#${r.clientId}` : '—'}</td>
                    <td><Badge tone={r.status === 'rated' || r.status === 'sent' ? 'green' : r.status === 'failed' ? 'red' : r.status === 'pending' ? 'yellow' : 'gray'}>{r.status}</Badge>{r.reason && <span className="block text-xs text-slate-500">{REASON[r.reason] || r.reason}</span>}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{r.sentAt ? fmtDate(r.sentAt) : '—'}</td>
                    <td className="pr-5 font-mono">{r.score ? stars(r.score) : '—'}</td></tr>))}</tbody>
              </table>
            </div>)}
        </Card>
      )}

      {tab === 'settings' && (
        <form action={saveRatingsSettings} className="grid gap-6 xl:grid-cols-2">
          <Card title="Public reviews">
            <div className="space-y-4">
              <Field label="Google Business Profile review link" hint="Google Business Profile → Ask for reviews → copy the link (https://g.page/r/…/review). Leave empty to show no Google button."><input name="google" defaultValue={cfg.googleUrl} placeholder="https://g.page/r/…/review" className="input" disabled={!edit} /></Field>
              <Field label="Trustpilot review link" hint="Your Trustpilot evaluate page (https://www.trustpilot.com/evaluate/globalhostia.com). Leave empty to show no Trustpilot button."><input name="trustpilot" defaultValue={cfg.trustpilotUrl} placeholder="https://www.trustpilot.com/evaluate/…" className="input" disabled={!edit} /></Field>
              <p className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">Policy: everyone who answers sees the same invitation, whatever score they gave, and nothing is offered in return. Google prohibits selectively asking happy customers (“review gating”) and incentives; Trustpilot requires inviting customers without bias. Do not change the wording to only ask 4–5 star customers.</p>
            </div>
          </Card>
          <Card title="Requests">
            <div className="space-y-4">
              <Field label="Never ask for these WHMCS department IDs" hint="Comma separated, e.g. abuse or sales departments."><input name="exclude" defaultValue={cfg.excludeDepts.join(', ')} className="input" disabled={!edit} /></Field>
              <Field label="Ask up to N days after closing" hint="Also how long a request may wait for quiet hours or the shared caps (Reminders)."><input name="max_age" defaultValue={cfg.maxAgeDays} className="input w-28" inputMode="numeric" disabled={!edit} /></Field>
              <p className="text-xs text-slate-500">Low ratings (1–{cfg.lowMax}) go to the owner’s WHMCS client account (Support → notify client ID) right away, outside quiet hours and caps, with a link to the ticket. A comment added afterwards is forwarded once.</p>
            </div>
          </Card>
          <div className="xl:col-span-2">{edit ? <button className="btn btn-primary">Save settings</button> : <p className="text-xs text-slate-400">Only owners and admins with Settings access can change these.</p>}</div>
        </form>
      )}

      {tab === 'email' && preview && (
        <Card title="Rating request preview" actions={<div className="flex items-center gap-2"><Link href={`/admin/ratings?tab=email&pl=${pl === 'en' ? 'ar' : 'en'}`} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{pl === 'en' ? 'العربية' : 'English'}</Link>
          <form action={sendRatingTest}><input type="hidden" name="lang" value={pl} /><button className="btn btn-secondary h-8 px-3 text-xs"><Icon name="mail" /> Send test to owner</button></form></div>}>
          <p className="mb-2 text-xs text-slate-500">Subject: <b className="text-slate-700">{preview.subject}</b>. Example ticket; real emails show the client’s ticket and the support person who answered last.</p>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
            <iframe title="Request preview (light)" srcDoc={composeFull(preview.html, { lang: pl })} sandbox="" className="h-[820px] w-full rounded-lg border border-slate-200" />
            <iframe title="Request preview (dark, phone width)" srcDoc={composeFull(preview.html, { forceDark: true, lang: pl })} sandbox="" className="h-[820px] w-[390px] max-w-full rounded-lg border border-slate-200" />
          </div>
        </Card>
      )}
    </>
  );
}
