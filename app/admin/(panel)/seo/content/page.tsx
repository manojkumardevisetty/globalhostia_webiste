import Link from 'next/link';
import { PageHeader, Flash, Badge, Card, Empty, Stat, fmtDate } from '@/components/ui';
import { Icon } from '@/components/icons';
import PendingButton from '@/components/PendingButton';
import { aiKeyPresent, aiSettings, spend } from '@/lib/ai/server';
import { getSession } from '@/lib/session';
import { can } from '@/lib/auth';
import {
  STATE_LABEL, STATE_TONE, TRACK_LABEL, addMonths, estimateArticleCost, estimateIdeasCost, monthKey, quotaUse, seasonalHints, toDubaiLocal, type IdeaState, type Track,
} from '@/lib/content/core';
import { summarize } from '@/lib/content/quality';
import { contentSettings, contentSpend, engineReady, listIdeas, type Idea } from '@/lib/content/store';
import { reconcile } from '@/lib/content/engine';
import { addIdeaAction, approveAction, generateIdeasAction, loadSeedAction, rejectAction, restoreAction, runNowAction, saveSettingsAction, draftAction } from './actions';

export const metadata = { title: 'Content engine' };
export const maxDuration = 300;

const TABS = [['calendar', 'Calendar'], ['ideas', 'Ideas'], ['pipeline', 'Drafts & review'], ['settings', 'Settings']] as const;
const TRACK_DOT: Record<string, string> = { uae: 'bg-rose-500', global: 'bg-sky-500' };
const day = (d: Date | string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' });
const monthName = (key: string) => new Date(`${key}-15T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const usd = (n: number) => `$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`;

export default async function ContentEngine({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab : 'calendar';
  if (!(await engineReady())) {
    return (<><PageHeader title="Content engine" /><Empty icon="alert"><p className="font-medium text-slate-700">The content engine tables are not created yet</p><p className="mt-2">They are added by the database setup that runs on every deploy (patch 031-content-engine). Redeploy, then reload this page.</p></Empty></>);
  }
  await reconcile().catch(() => 0);
  const [cs, ideas, ai, sp$, cspend, session] = await Promise.all([contentSettings(), listIdeas({ limit: 1000 }), aiSettings(), spend(), contentSpend(), getSession()]);
  const keyOk = aiKeyPresent();
  const perArticle = estimateArticleCost(ai.prices, { chat: ai.chatModel, fast: ai.fastModel });
  const perArticleAr = estimateArticleCost(ai.prices, { chat: ai.chatModel, fast: ai.fastModel }, true);
  const monthArticles = cs.perMonth.uae + cs.perMonth.global;
  const count = (st: string) => ideas.filter((i) => i.state === st).length;
  const waiting = ideas.filter((i) => i.state === 'draft_ready' || i.state === 'in_review');

  return (
    <>
      <PageHeader title="Content engine" desc={<>AI-drafted articles for the UAE / GCC and global audiences. You pick the topics, the engine writes drafts a week before their date, you review and approve. <b>Nothing is published without your approval</b>{cs.autoPublish ? ' (auto-publish is ON in Settings)' : ''}.</>}
        actions={<><Link href="/admin/blog" className="btn btn-secondary"><Icon name="pen" /> Blog posts</Link><a href="/blog" target="_blank" className="btn btn-ghost"><Icon name="external" /> View blog</a></>} />
      <Flash sp={sp} />

      {!keyOk && <div className="mb-5 flex items-start gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200"><Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" /><span>No AI key in this environment (ANTHROPIC_API_KEY). You can plan, approve and edit, but ideas and drafts are generated only where the key is set (production).</span></div>}
      {waiting.length > 0 && tab !== 'pipeline' && <Link href="?tab=pipeline" className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-200 hover:bg-sky-100"><span><b>{waiting.length} draft{waiting.length === 1 ? '' : 's'}</b> waiting for your review.</span><span className="font-medium">Review →</span></Link>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Backlog ideas" value={count('idea')} sub={`${count('rejected')} rejected`} icon="file" tone="slate" href="?tab=ideas" />
        <Stat label="Planned" value={count('approved') + count('drafting')} sub={`${count('scheduled')} scheduled to go live`} icon="activity" tone="sky" href="?tab=calendar" />
        <Stat label="To review" value={waiting.length} sub={`${count('published')} published so far`} icon="eye" tone="amber" href="?tab=pipeline" />
        <Stat label="AI spend this month" value={usd(cspend.month)} sub={<>cap {usd(cs.monthlyCapUsd)} · ≈{usd(perArticle)}/article{cspend.avg !== null ? ` (actual avg ${usd(cspend.avg)})` : ''}</>} icon="dollar" tone="green" />
      </div>

      <nav className="mb-5 flex flex-wrap gap-1.5" aria-label="Content engine sections">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`?tab=${k}`} aria-current={tab === k ? 'page' : undefined}
            className={`inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-medium ring-1 ring-inset transition ${tab === k ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-400'}`}>{label}</Link>
        ))}
      </nav>

      {tab === 'calendar' && <CalendarTab ideas={ideas} month={/^\d{4}-\d{2}$/.test(sp.m || '') ? sp.m : monthKey(Date.now())} perMonth={cs.perMonth} />}
      {tab === 'ideas' && <IdeasTab ideas={ideas} sp={sp} keyOk={keyOk} ideasCost={estimateIdeasCost(ai.prices, ai.fastModel)} />}
      {tab === 'pipeline' && <PipelineTab ideas={ideas} canRun={can(session, 'settings')} />}
      {tab === 'settings' && <SettingsTab cs={cs} canEdit={can(session, 'settings')} est={{ en: perArticle, ar: perArticleAr, month: Math.round(perArticle * monthArticles * 100) / 100 }} budget={{ month: ai.monthlyBudgetUsd, spent: sp$.month }} />}
    </>
  );
}

/* ------------------------------------------------------------------ calendar */
function CalendarTab({ ideas, month, perMonth }: { ideas: Idea[]; month: string; perMonth: Record<Track, number> }) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const inMonth = ideas.filter((i) => i.plannedFor && !['idea', 'rejected'].includes(i.state) && monthKey(new Date(i.plannedFor)) === month)
    .sort((a, b) => new Date(a.plannedFor!).getTime() - new Date(b.plannedFor!).getTime());
  const byDay = new Map<number, Idea[]>();
  for (const i of inMonth) { const d = Number(toDubaiLocal(i.plannedFor).slice(8, 10)); byDay.set(d, [...(byDay.get(d) || []), i]); }
  const use = quotaUse(ideas, month);
  const todayKey = toDubaiLocal(new Date()).slice(0, 10);
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, k) => k + 1)];
  while (cells.length % 7) cells.push(null);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card title={<span className="flex items-center gap-2">{monthName(month)}</span>} actions={<div className="flex gap-1">
        <Link className="btn btn-ghost h-8 px-2.5 text-xs" href={`?tab=calendar&m=${addMonths(month, -1)}`} aria-label="Previous month">←</Link>
        <Link className="btn btn-ghost h-8 px-2.5 text-xs" href="?tab=calendar">Today</Link>
        <Link className="btn btn-ghost h-8 px-2.5 text-xs" href={`?tab=calendar&m=${addMonths(month, 1)}`} aria-label="Next month">→</Link></div>}>
        <div className="hidden md:block">
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-slate-200 text-xs ring-1 ring-slate-200">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="bg-slate-50 px-2 py-1.5 font-semibold text-slate-500">{d}</div>)}
            {cells.map((d, k) => {
              const key = d ? `${month}-${String(d).padStart(2, '0')}` : '';
              return (
                <div key={k} className={`min-h-[104px] bg-white p-1.5 ${!d ? 'bg-slate-50/60' : ''}`}>
                  {d && <div className={`mb-1 text-[11px] font-semibold tabular-nums ${key === todayKey ? 'inline-grid h-5 w-5 place-items-center rounded-full bg-slate-900 text-white' : 'text-slate-400'}`}>{d}</div>}
                  {(d ? byDay.get(d) || [] : []).map((i) => (
                    <Link key={i.id} href={`/admin/seo/content/${i.id}`} className="mb-1 block rounded-md bg-slate-50 px-1.5 py-1 leading-tight ring-1 ring-inset ring-slate-200 hover:bg-white hover:ring-slate-400">
                      <span className="flex items-center gap-1"><i className={`h-1.5 w-1.5 shrink-0 rounded-full ${TRACK_DOT[i.track]}`} aria-hidden /><span className="truncate text-[10.5px] font-medium text-slate-500">{STATE_LABEL[i.state as IdeaState]}</span></span>
                      <span className="line-clamp-2 text-[11.5px] font-medium text-slate-800">{i.title}</span>
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        <ol className="space-y-2 md:hidden">
          {inMonth.length ? inMonth.map((i) => (
            <li key={i.id}><Link href={`/admin/seo/content/${i.id}`} className="flex items-start gap-3 rounded-xl p-3 ring-1 ring-slate-200 hover:ring-slate-400">
              <span className="w-12 shrink-0 text-center"><b className="block text-lg leading-none text-slate-900">{toDubaiLocal(i.plannedFor).slice(8, 10)}</b><span className="text-[11px] uppercase text-slate-400">{new Date(i.plannedFor!).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Asia/Dubai' })}</span></span>
              <span className="min-w-0"><span className="mb-1 flex items-center gap-2"><Badge tone={STATE_TONE[i.state]}>{STATE_LABEL[i.state as IdeaState]}</Badge><span className="text-[11px] text-slate-400">{TRACK_LABEL[i.track as Track]}</span></span><span className="block text-sm font-medium text-slate-800">{i.title}</span></span>
            </Link></li>)) : <li className="rounded-xl p-4 text-center text-sm text-slate-500 ring-1 ring-dashed ring-slate-300">Nothing planned this month yet.</li>}
        </ol>
        <p className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><i className={`h-2 w-2 rounded-full ${TRACK_DOT.uae}`} />UAE / GCC</span><span className="inline-flex items-center gap-1.5"><i className={`h-2 w-2 rounded-full ${TRACK_DOT.global}`} />Global</span><span>Times are Dubai time.</span></p>
      </Card>
      <div className="space-y-6">
        <Card title="Monthly quota">
          {(['uae', 'global'] as Track[]).map((t) => {
            const q = perMonth[t], u = use[t];
            return (
              <div key={t} className="mb-4 last:mb-0">
                <div className="mb-1.5 flex items-baseline justify-between text-sm"><span className="font-medium text-slate-800">{TRACK_LABEL[t]}</span><span className="tabular-nums text-slate-500">{u} / {q}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${u >= q ? 'bg-emerald-500' : TRACK_DOT[t]}`} style={{ width: `${q ? Math.min(100, (u / q) * 100) : 0}%` }} /></div>
                {u < q && <Link href={`?tab=ideas&track=${t}`} className="mt-1.5 inline-block text-xs font-medium text-brand-600 hover:underline">Pick {q - u} more from the backlog →</Link>}
              </div>
            );
          })}
        </Card>
        <Card title="Seasonal hooks">
          {(['uae', 'global'] as Track[]).map((t) => (
            <div key={t} className="mb-3 last:mb-0">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{TRACK_LABEL[t]}</p>
              <ul className="space-y-1 text-[13px] text-slate-600">{seasonalHints(t, month, 2).flatMap((h) => h.hints.map((x) => <li key={h.month + x}><b className="font-medium text-slate-800">{monthName(h.month).split(' ')[0]}:</b> {x}</li>))}</ul>
            </div>
          ))}
          <p className="mt-3 text-[11.5px] text-slate-400">Lunar holidays (Ramadan, Eid) move each year: confirm the announced dates.</p>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ ideas */
function IdeasTab({ ideas, sp, keyOk, ideasCost }: { ideas: Idea[]; sp: Record<string, string>; keyOk: boolean; ideasCost: number }) {
  const track = sp.track === 'uae' || sp.track === 'global' ? sp.track : '';
  const state = ['idea', 'approved', 'rejected', 'all'].includes(sp.state) ? sp.state : 'idea';
  const rows = ideas.filter((i) => (!track || i.track === track) && (state === 'all' || i.state === state));
  const qs = (o: Record<string, string>) => `?${new URLSearchParams({ tab: 'ideas', ...(track ? { track } : {}), ...(state !== 'idea' ? { state } : {}), ...o }).toString()}`;
  const back = `/admin/seo/content${qs({})}`;
  const pill = (on: boolean) => `inline-flex h-8 items-center rounded-full px-3 text-[12.5px] font-medium ring-1 ring-inset ${on ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-400'}`;
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {[['', 'Both tracks'], ['uae', 'UAE / GCC'], ['global', 'Global']].map(([k, l]) => <Link key={k} href={`?${new URLSearchParams({ tab: 'ideas', ...(k ? { track: k } : {}), ...(state !== 'idea' ? { state } : {}) })}`} className={pill(track === k)}>{l}</Link>)}
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
          {[['idea', 'Backlog'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']].map(([k, l]) => <Link key={k} href={`?${new URLSearchParams({ tab: 'ideas', ...(track ? { track } : {}), ...(k !== 'idea' ? { state: k } : {}) })}`} className={pill(state === k)}>{l}</Link>)}
        </div>
        {!rows.length ? (
          <Empty icon="file">{ideas.length ? 'No ideas match these filters.' : <><p className="mb-3 font-medium text-slate-700">The backlog is empty</p><form action={loadSeedAction}><PendingButton>Load the 24 starter ideas</PendingButton></form></>}</Empty>
        ) : (
          <form action={approveAction} className="card overflow-hidden">
            <input type="hidden" name="back" value={back} />
            {state === 'idea' && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 text-xs text-slate-500">
              <span>Tick ideas and approve them into the next free calendar slots of their track.</span>
              <PendingButton className="btn btn-primary h-8 px-3 text-xs" pending="Approving…" name="bulk" value="1">Approve selected</PendingButton>
            </div>}
            <ul className="divide-y divide-slate-100">
              {rows.map((i) => (
                <li key={i.id} className="flex gap-3 px-4 py-3.5">
                  {state === 'idea' && <input type="checkbox" name="ids" value={i.id} className="mt-1 h-4 w-4 shrink-0" aria-label={`Select ${i.title}`} />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/seo/content/${i.id}`} className="font-medium text-slate-900 hover:text-brand-600">{i.title}</Link>
                      {i.state !== 'idea' && <Badge tone={STATE_TONE[i.state]}>{STATE_LABEL[i.state as IdeaState]}</Badge>}
                      {i.source === 'seed' && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-violet-700">seed</span>}
                      {i.source === 'owner' && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-600">yours</span>}
                    </div>
                    <p className="mt-1 text-[12.5px] text-slate-500"><span className="font-mono text-slate-700">{i.primaryKeyword}</span>{i.secondaryKeywords.length ? ` · ${i.secondaryKeywords.slice(0, 4).join(', ')}` : ''}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-500">
                      <span className="inline-flex items-center gap-1"><i className={`h-1.5 w-1.5 rounded-full ${TRACK_DOT[i.track]}`} />{TRACK_LABEL[i.track as Track]} · {i.country || '—'}</span>
                      <span className="capitalize">{i.intent} intent (estimated)</span>
                      <span>→ {i.target || 'auto'}</span>
                      <span className="inline-flex items-center gap-1.5">Priority <span className="inline-block h-1.5 w-14 overflow-hidden rounded-full bg-slate-100"><span className="block h-full bg-slate-700" style={{ width: `${i.priority}%` }} /></span><b className="tabular-nums text-slate-700">{i.priority}</b></span>
                      {i.plannedFor && i.state !== 'idea' && <span>Planned {day(i.plannedFor)}</span>}
                    </p>
                    {i.overlap && <p className="mt-1.5 text-[11.5px] text-amber-700">⚠ {i.overlap}: link to it rather than repeat it.</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-start">
                    {i.state === 'idea' && <PendingButton formAction={approveAction} name="one" value={i.id} className="btn btn-secondary h-8 px-2.5 text-xs" pending="…">Approve</PendingButton>}
                    {['idea', 'approved'].includes(i.state) && <PendingButton formAction={rejectAction} name="one" value={i.id} className="btn btn-ghost h-8 px-2.5 text-xs text-slate-500" pending="…">Reject</PendingButton>}
                    {i.state === 'rejected' && <PendingButton formAction={restoreAction} name="one" value={i.id} className="btn btn-ghost h-8 px-2.5 text-xs" pending="…">Restore</PendingButton>}
                  </div>
                </li>
              ))}
            </ul>
          </form>
        )}
        <p className="text-xs text-slate-400">No keyword tool is connected: intent and priority are editorial estimates, never search volumes.</p>
      </div>
      <div className="space-y-6">
        <Card title="Generate ideas">
          <form action={generateIdeasAction} className="space-y-3">
            <label className="block"><span className="field-label">Track</span><select name="track" defaultValue={track || 'uae'} className="input"><option value="uae">UAE / GCC</option><option value="global">Global</option></select></label>
            <label className="block"><span className="field-label">How many</span><input name="count" type="number" min={3} max={20} defaultValue={12} className="input" /></label>
            <label className="block"><span className="field-label">Seed keywords <span className="font-normal text-slate-400">(optional, one per line)</span></span><textarea name="seeds" rows={3} className="input" placeholder={'arabic website\nwhatsapp shop'} /></label>
            <PendingButton className="btn btn-primary w-full" pending="Generating ideas…">Generate with AI</PendingButton>
            <p className="text-[11.5px] leading-relaxed text-slate-400">Uses the fast model with your catalog, existing pages (to avoid duplicates) and the seasonal calendar. About {usd(ideasCost)} per batch.{keyOk ? '' : ' Needs the AI key (production).'}</p>
          </form>
        </Card>
        <Card title="Add your own idea">
          <form action={addIdeaAction} className="space-y-3">
            <label className="block"><span className="field-label">Working title</span><input name="title" required minLength={8} className="input" /></label>
            <label className="block"><span className="field-label">Primary keyword</span><input name="primaryKeyword" required className="input" /></label>
            <label className="block"><span className="field-label">Secondary keywords <span className="font-normal text-slate-400">(comma separated)</span></span><input name="secondaryKeywords" className="input" /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="field-label">Track</span><select name="track" defaultValue={track || 'uae'} className="input"><option value="uae">UAE / GCC</option><option value="global">Global</option></select></label>
              <label className="block"><span className="field-label">Intent</span><select name="intent" className="input"><option>informational</option><option>commercial</option><option>transactional</option></select></label>
            </div>
            <PendingButton className="btn btn-secondary w-full">Add to backlog</PendingButton>
          </form>
        </Card>
        <form action={loadSeedAction}><PendingButton className="btn btn-ghost w-full text-xs">Reload missing starter ideas</PendingButton></form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pipeline */
function PipelineTab({ ideas, canRun }: { ideas: Idea[]; canRun: boolean }) {
  const cols: { key: string; title: string; hint: string; states: string[] }[] = [
    { key: 'approved', title: 'Waiting for a draft', hint: 'Drafted automatically a week before their date, or now.', states: ['approved', 'drafting'] },
    { key: 'review', title: 'Ready for review', hint: 'Read, edit, then schedule.', states: ['draft_ready', 'in_review'] },
    { key: 'scheduled', title: 'Scheduled', hint: 'Go live on their date by themselves.', states: ['scheduled'] },
    { key: 'published', title: 'Published', hint: 'Live on the blog.', states: ['published'] },
  ];
  return (
    <div className="space-y-5">
      {canRun && <form action={runNowAction} className="card flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm text-slate-600">
        <span>The daily automation runs at 05:00 Dubai time (drafts for the next 7 days, scheduled posts, owner email). Run it now if you approved something urgent.</span>
        <PendingButton className="btn btn-secondary h-9 text-xs" pending="Running… (up to 2 minutes)">Run automation now</PendingButton>
      </form>}
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {cols.map((c) => {
          const list = ideas.filter((i) => c.states.includes(i.state)).sort((a, b) => (c.key === 'published' ? -1 : 1) * (new Date(a.plannedFor || 0).getTime() - new Date(b.plannedFor || 0).getTime())).slice(0, c.key === 'published' ? 12 : 100);
          return (
            <section key={c.key} className="card flex flex-col">
              <header className="border-b border-slate-100 px-4 py-3"><h2 className="flex items-center justify-between text-[14px] font-semibold text-slate-900">{c.title}<span className="rounded-full bg-slate-100 px-2 text-[11.5px] tabular-nums text-slate-500">{list.length}</span></h2><p className="mt-0.5 text-xs text-slate-400">{c.hint}</p></header>
              <ul className="flex-1 space-y-2 p-3">
                {list.length ? list.map((i) => {
                  const sum = summarize(i.checks || []);
                  return (
                    <li key={i.id} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5"><Badge tone={STATE_TONE[i.state]}>{STATE_LABEL[i.state as IdeaState]}</Badge><span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><i className={`h-1.5 w-1.5 rounded-full ${TRACK_DOT[i.track]}`} />{TRACK_LABEL[i.track as Track]}</span>{i.wantArabic && <span className="text-[11px] text-slate-400">+ العربية</span>}</div>
                      <Link href={`/admin/seo/content/${i.id}`} className="block text-[13.5px] font-medium leading-snug text-slate-900 hover:text-brand-600">{i.title}</Link>
                      <p className="mt-1 text-[11.5px] text-slate-500">{i.plannedFor ? `${c.key === 'published' ? 'Published' : 'Planned'} ${fmtDate(i.plannedFor)}` : 'No date'}{Number(i.costUsd) > 0 ? ` · ${usd(Number(i.costUsd))}` : ''}</p>
                      {(i.checks || []).length > 0 && c.key !== 'published' && <p className="mt-1 text-[11.5px]"><span className="text-emerald-600">{sum.pass} pass</span> · <span className="text-amber-600">{sum.warn} warn</span> · <span className={sum.fail ? 'font-semibold text-red-600' : 'text-slate-400'}>{sum.fail} fail</span></p>}
                      {i.error && <p className="mt-1 text-[11.5px] text-red-600">{i.error}</p>}
                      {i.state === 'approved' && <form action={draftAction} className="mt-2"><input type="hidden" name="id" value={i.id} /><input type="hidden" name="back" value="/admin/seo/content?tab=pipeline" /><PendingButton className="btn btn-secondary h-8 w-full text-xs" pending="Writing the draft… (1–2 min)">Generate draft now</PendingButton></form>}
                    </li>
                  );
                }) : <li className="rounded-xl p-4 text-center text-xs text-slate-400 ring-1 ring-dashed ring-slate-200">Empty</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ settings */
function SettingsTab({ cs, canEdit, est, budget }: { cs: Awaited<ReturnType<typeof contentSettings>>; canEdit: boolean; est: { en: number; ar: number; month: number }; budget: { month: number; spent: number } }) {
  const chk = (name: string, on: boolean, label: string, hint: string) => (
    <label className="flex items-start gap-3 rounded-xl p-3 ring-1 ring-slate-200"><input type="checkbox" name={name} defaultChecked={on} className="mt-0.5 h-4 w-4" disabled={!canEdit} /><span><span className="block text-sm font-medium text-slate-800">{label}</span><span className="block text-xs leading-relaxed text-slate-500">{hint}</span></span></label>
  );
  const num = (name: string, v: number, label: string, o: { min?: number; max?: number; step?: number; hint?: string } = {}) => (
    <label className="block"><span className="field-label">{label}</span><input type="number" name={name} defaultValue={v} min={o.min} max={o.max} step={o.step} className="input" disabled={!canEdit} />{o.hint && <span className="mt-1 block text-xs text-slate-400">{o.hint}</span>}</label>
  );
  return (
    <form action={saveSettingsAction} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <Card title="Monthly plan">
          <div className="grid gap-4 sm:grid-cols-3">
            {num('perUae', cs.perMonth.uae, 'UAE / GCC articles per month', { min: 0, max: 31 })}
            {num('perGlobal', cs.perMonth.global, 'Global articles per month', { min: 0, max: 31 })}
            {num('publishHour', cs.publishHour, 'Publish hour (Dubai)', { min: 0, max: 23, hint: 'Calendar slots use this time.' })}
          </div>
        </Card>
        <Card title="Automation">
          <div className="space-y-3">
            {chk('enabled', cs.enabled, 'Content engine on', 'Off stops all AI calls from the engine (planning and editing still work).')}
            {chk('autoDraft', cs.autoDraft, 'Write drafts automatically', 'The daily job drafts approved calendar items that are due soon.')}
            {chk('autoPublish', cs.autoPublish, 'Auto-publish approved drafts on schedule', 'Off by default. When on, a fresh draft with no failed checks is scheduled on its calendar date without your review. Leave off to approve every article yourself.')}
            {chk('notify', cs.notify, 'Email me when drafts are ready', 'Sent through WHMCS to the same account as the support alerts.')}
            {chk('arabicDefault', cs.arabicDefault, 'Suggest an Arabic version for UAE articles', 'You still switch it on per article.')}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {num('draftLeadDays', cs.draftLeadDays, 'Draft this many days ahead', { min: 1, max: 30 })}
            {num('perRun', cs.perRun, 'Drafts per daily run', { min: 1, max: 5, hint: 'Each draft takes about a minute.' })}
          </div>
        </Card>
        <Card title="Article rules">
          <div className="grid gap-4 sm:grid-cols-2">
            {num('minWords', cs.minWords, 'Minimum words', { min: 300, max: 5000 })}
            {num('maxWords', cs.maxWords, 'Maximum words', { min: 400, max: 8000 })}
          </div>
          <label className="mt-4 block"><span className="field-label">Seed keywords <span className="font-normal text-slate-400">(used for every idea batch, one per line)</span></span><textarea name="seedKeywords" rows={4} defaultValue={cs.seedKeywords.join('\n')} className="input" disabled={!canEdit} /></label>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">Every prompt forbids invented statistics, studies, quotes, testimonials and customer names, competitor names, superlatives and prices in the text; UAE legal and tax points stay general and point to the authority or an accountant. Prices appear only in the live plan block next to each article.</p>
        </Card>
      </div>
      <div className="space-y-6">
        <Card title="Cost">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Per English article (est.)</dt><dd className="font-semibold tabular-nums">{usd(est.en)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">With Arabic version (est.)</dt><dd className="font-semibold tabular-nums">{usd(est.ar)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Monthly plan (est.)</dt><dd className="font-semibold tabular-nums">{usd(est.month)}</dd></div>
            <div className="flex justify-between border-t border-slate-100 pt-2"><dt className="text-slate-500">All AI this month</dt><dd className="tabular-nums">{usd(budget.spent)} of {usd(budget.month)}</dd></div>
          </dl>
          <div className="mt-4">{num('monthlyCapUsd', cs.monthlyCapUsd, 'Content engine monthly cap (USD)', { min: 0, max: 1000, step: 0.5, hint: 'On top of the global caps in AI assistant → Settings.' })}</div>
          <p className="mt-3 text-[11.5px] text-slate-400">Estimates use typical token counts; the real cost of each article is logged and shown on it.</p>
        </Card>
        {canEdit ? <PendingButton className="btn btn-primary w-full">Save settings</PendingButton> : <p className="text-xs text-slate-500">Only owners and admins can change these settings.</p>}
      </div>
    </form>
  );
}
