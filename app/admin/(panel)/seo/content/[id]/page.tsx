import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Flash, Badge, Card, LinkBtn, fmtDate } from '@/components/ui';
import { Icon } from '@/components/icons';
import PendingButton from '@/components/PendingButton';
import { aiSettings } from '@/lib/ai/server';
import { STATE_LABEL, STATE_TONE, TRACK_LABEL, estimateArticleCost, splitSections, toDubaiLocal, nextStates, type IdeaState, type Track } from '@/lib/content/core';
import { countWords, extractLinks, faqCount, internalPath, summarize, type Check } from '@/lib/content/quality';
import { contentSettings, getIdea, inventory } from '@/lib/content/store';
import { reconcile } from '@/lib/content/engine';
import {
  approveAction, arabicAction, arabicToggleAction, checksAction, deleteIdeaAction, draftAction, publishAction, rejectAction, restoreAction, reviewAction,
  scheduleAction, sectionAction, unscheduleAction, updateIdeaAction,
} from '../actions';

export const metadata = { title: 'Content engine: article' };
export const maxDuration = 300;

const FLOW: IdeaState[] = ['idea', 'approved', 'drafting', 'draft_ready', 'in_review', 'scheduled', 'published'];
const usd = (n: number) => `$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`;
const ICON: Record<string, [string, string]> = { pass: ['check', 'text-emerald-600 bg-emerald-50'], warn: ['alert', 'text-amber-600 bg-amber-50'], fail: ['alert', 'text-red-600 bg-red-50'] };

export default async function IdeaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; const sp = await searchParams;
  await reconcile().catch(() => 0);
  const idea = await getIdea(id);
  if (!idea) notFound();
  const [[en], [ar], cs, ai, inv, usage] = await Promise.all([
    idea.postId ? db.select().from(schema.posts).where(eq(schema.posts.id, idea.postId)) : Promise.resolve([] as any[]),
    idea.arPostId ? db.select().from(schema.posts).where(eq(schema.posts.id, idea.arPostId)) : Promise.resolve([] as any[]),
    contentSettings(), aiSettings(), inventory().catch(() => null),
    db.execute(sql`select split_part(detail, ' ', 1) as step, count(*)::int as n, coalesce(sum(cost_usd), 0)::float as usd from ai_usage where subject = ${'content:' + id} group by 1 order by 1`).catch(() => []) as Promise<any[]>,
  ]);
  const st = idea.state as IdeaState;
  const checks = (idea.checks || []) as Check[];
  const sum = summarize(checks);
  const sorted = [...checks].sort((a, b) => ['fail', 'warn', 'pass'].indexOf(a.status) - ['fail', 'warn', 'pass'].indexOf(b.status));
  const est = estimateArticleCost(ai.prices, { chat: ai.chatModel, fast: ai.fastModel }, idea.wantArabic);
  const h2 = en ? splitSections(en.body).sections.map((s) => s.heading) : [];
  const h2ar = ar ? splitSections(ar.body).sections.map((s) => s.heading) : [];
  const words = en ? countWords(en.body) : 0;
  const links = en ? extractLinks(en.body).filter((l) => internalPath(l.href) !== null).length : 0;
  const defaultAt = idea.plannedFor && new Date(idea.plannedFor).getTime() > Date.now() ? toDubaiLocal(idea.plannedFor) : toDubaiLocal(new Date(Date.now() + 3600_000)).slice(0, 14) + '00';
  const draftDue = idea.plannedFor ? new Date(new Date(idea.plannedFor).getTime() - cs.draftLeadDays * 86_400_000) : null;
  const self = `/admin/seo/content/${id}`;
  const target = inv?.targets.find((t) => t.ref === idea.target || t.path === idea.target);
  const live = st === 'published' && en?.status === 'PUBLISHED';

  return (
    <>
      <PageHeader title={idea.title}
        desc={<span className="flex flex-wrap items-center gap-2"><Badge tone={STATE_TONE[st]}>{STATE_LABEL[st]}</Badge><span>{TRACK_LABEL[idea.track as Track]}{idea.country && idea.country !== TRACK_LABEL[idea.track as Track] ? ` · ${idea.country}` : ''} · {idea.intent} intent (estimated)</span>{idea.plannedFor && <span>· {st === 'published' ? 'Published' : 'Planned'} {fmtDate(idea.plannedFor)} (Dubai)</span>}{idea.source === 'seed' && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase text-violet-700">seed</span>}</span>}
        actions={<><LinkBtn href="/admin/seo/content?tab=pipeline">← Content engine</LinkBtn>{en && <a className="btn btn-secondary" target="_blank" href={live ? `/blog/${en.slug}` : `/blog/${en.slug}?preview`}><Icon name={live ? 'external' : 'eye'} /> {live ? 'View live' : 'Preview'}</a>}</>} />
      <Flash sp={sp} />

      <ol className="mb-6 flex flex-wrap gap-y-2 text-[12px]" aria-label="Workflow">
        {FLOW.map((s, k) => {
          const at = st === 'rejected' ? -1 : FLOW.indexOf(st);
          const tone = k < at ? 'text-emerald-700' : k === at ? 'font-semibold text-slate-900' : 'text-slate-400';
          return <li key={s} className={`flex items-center ${tone}`} aria-current={k === at ? 'step' : undefined}><span className={`mr-1.5 grid h-5 w-5 place-items-center rounded-full text-[10px] ${k < at ? 'bg-emerald-100' : k === at ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>{k < at ? '✓' : k + 1}</span>{STATE_LABEL[s]}{k < FLOW.length - 1 && <span className="mx-2 text-slate-300" aria-hidden>—</span>}</li>;
        })}
        {st === 'rejected' && <li className="ml-3"><Badge tone="red">Rejected</Badge></li>}
      </ol>

      {idea.error && <div className="mb-5 flex items-start gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200" role="alert"><Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" /><span>{idea.error}</span></div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {/* ---------------------------------------------------------- next step */}
          <Card title="Next step">
            {st === 'idea' && (
              <form action={approveAction} className="space-y-3">
                <input type="hidden" name="id" value={id} /><input type="hidden" name="back" value={self} />
                <p className="text-sm text-slate-600">Approve this topic into the calendar. Leave the date empty for the next free {TRACK_LABEL[idea.track as Track]} slot.</p>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="block"><span className="field-label">Publish date (Dubai)</span><input type="datetime-local" name="at" className="input" /></label>
                  <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" name="arabic" defaultChecked={idea.wantArabic || (cs.arabicDefault && idea.track === 'uae')} className="h-4 w-4" /> Also publish an Arabic version</label>
                  <input type="hidden" name="arabic" value="" />
                </div>
                <div className="flex flex-wrap gap-2"><PendingButton pending="Approving…">Approve into calendar</PendingButton><PendingButton formAction={rejectAction} className="btn btn-ghost" pending="…">Reject</PendingButton></div>
              </form>
            )}
            {st === 'approved' && (
              <form action={draftAction} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <p className="text-sm text-slate-600">{cs.autoDraft && draftDue ? <>The draft is written automatically around <b>{fmtDate(draftDue)}</b> by the daily job.</> : 'Automatic drafting is off: generate it when you are ready.'} You can also write it now (about a minute, ≈{usd(est)}).</p>
                <div className="flex flex-wrap gap-2"><PendingButton pending="Writing the draft… (1–2 minutes)">Generate draft now</PendingButton><PendingButton formAction={rejectAction} className="btn btn-ghost" pending="…">Reject</PendingButton><PendingButton formAction={restoreAction} className="btn btn-ghost" pending="…">Back to backlog</PendingButton></div>
              </form>
            )}
            {st === 'drafting' && <p className="text-sm text-slate-600">The draft is being written. Reload in a minute.</p>}
            {(st === 'draft_ready' || st === 'in_review') && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <form action={reviewAction}><input type="hidden" name="id" value={id} /><PendingButton className="btn btn-primary" pending="Opening…"><Icon name="pen" /> Read and edit the article</PendingButton></form>
                  {en && <a className="btn btn-secondary" target="_blank" href={`/blog/${en.slug}?preview`}><Icon name="eye" /> Preview as visitors see it</a>}
                </div>
                <form action={scheduleAction} className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <input type="hidden" name="id" value={id} />
                  <p className="mb-3 text-sm font-medium text-slate-800">Approve and publish{idea.wantArabic ? ' (English + Arabic)' : ''}</p>
                  {sum.fail > 0 && <p className="mb-3 text-xs text-red-700">{sum.fail} check{sum.fail === 1 ? '' : 's'} failed. Fix them in the editor (or confirm you checked them) before publishing.</p>}
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="block"><span className="field-label">Go live (Dubai time)</span><input type="datetime-local" name="at" defaultValue={defaultAt} className="input" required /></label>
                    <PendingButton pending="Scheduling…" confirm={sum.fail ? `${sum.fail} quality check(s) failed. Schedule anyway?` : undefined}>Schedule</PendingButton>
                    <PendingButton formAction={publishAction} className="btn btn-secondary" pending="Publishing…" confirm={`Publish “${idea.title}” now${sum.fail ? ` with ${sum.fail} failed check(s)` : ''}?`}>Publish now</PendingButton>
                  </div>
                </form>
                <form action={draftAction} className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <input type="hidden" name="id" value={id} />
                  <PendingButton className="btn btn-ghost h-8 px-2.5 text-xs" pending="Rewriting the whole draft…" confirm="Replace the whole draft with a new one? Your edits are kept in the post's earlier versions.">Regenerate the whole draft</PendingButton>
                  <PendingButton formAction={rejectAction} className="btn btn-ghost h-8 px-2.5 text-xs text-red-600" pending="…" confirm="Reject this article? The draft stays hidden in the blog.">Reject</PendingButton>
                </form>
              </div>
            )}
            {st === 'scheduled' && (
              <form action={publishAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={id} />
                <p className="mr-2 text-sm text-slate-600">Goes live on <b>{fmtDate(idea.plannedFor)}</b> (Dubai) by itself, then the daily job notifies search engines.</p>
                <PendingButton className="btn btn-secondary" pending="Publishing…" confirm="Publish now instead of on the scheduled date?">Publish now</PendingButton>
                <PendingButton formAction={unscheduleAction} className="btn btn-ghost" pending="…">Unschedule</PendingButton>
              </form>
            )}
            {st === 'published' && en && <p className="text-sm text-slate-600">Live at <a className="font-medium text-brand-600 underline" href={`/blog/${en.slug}`} target="_blank">/blog/{en.slug}</a>{ar?.status === 'PUBLISHED' && <> and <a className="font-medium text-brand-600 underline" href={`/blog/${ar.slug}`} target="_blank">/blog/{ar.slug}</a></>}. Edit it any time in the <Link className="underline" href={`/admin/blog/${en.id}`}>blog editor</Link>.</p>}
            {st === 'rejected' && <form action={restoreAction}><input type="hidden" name="id" value={id} /><p className="mb-3 text-sm text-slate-600">Rejected. Restore it to the backlog to plan it again.</p><PendingButton className="btn btn-secondary">Restore to backlog</PendingButton></form>}
          </Card>

          {/* ---------------------------------------------------------- draft */}
          {en && (
            <Card title="Draft" actions={<Link href={`/admin/blog/${en.id}`} className="btn btn-ghost h-8 px-2.5 text-xs"><Icon name="pen" /> Editor</Link>}>
              <div className="rounded-xl p-4 ring-1 ring-slate-200">
                <p className="truncate text-xs text-emerald-700">globalhostia.com › blog › {en.slug}</p>
                <p className="mt-1 text-[17px] font-medium leading-snug text-[#1a0dab]">{en.seoTitle || en.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{en.seoDescription || en.excerpt}</p>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                {[['Words', words.toLocaleString('en')], ['Sections', h2.length], ['Internal links', links], ['FAQ', faqCount(en.body)]].map(([k, v]) => <div key={String(k)} className="rounded-xl bg-slate-50 px-3 py-2"><dt className="text-xs text-slate-500">{k}</dt><dd className="text-lg font-semibold tabular-nums text-slate-900">{v}</dd></div>)}
              </dl>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">H1</p><p className="text-sm font-medium text-slate-900">{en.title}</p>
                  <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Outline</p><ol className="list-decimal space-y-0.5 pl-5 text-sm text-slate-700">{h2.map((h) => <li key={h}>{h}</li>)}</ol></div>
                <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Key takeaways</p><ul className="space-y-1 text-sm text-slate-700">{en.takeaways.split('\n').filter(Boolean).map((t: string) => <li key={t} className="flex gap-2"><Icon name="check" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />{t}</li>)}</ul>
                  <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Plan block</p><p className="text-sm text-slate-700">{en.relatedProducts.length ? `${target?.label || en.relatedProducts.join(', ')} (live prices)` : 'Picked automatically from the topic'}</p></div>
              </div>
              {en.status === 'DRAFT' && h2.length > 0 && (
                <form action={sectionAction} className="mt-5 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <input type="hidden" name="id" value={id} /><input type="hidden" name="lang" value="en" />
                  <p className="mb-2 text-sm font-medium text-slate-800">Rewrite one section</p>
                  <div className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-end">
                    <label className="block"><span className="field-label">Section</span><select name="heading" className="input">{h2.map((h) => <option key={h}>{h}</option>)}</select></label>
                    <label className="block"><span className="field-label">Instruction</span><input name="instruction" className="input" placeholder="e.g. add a step-by-step checklist, shorter, more UAE-specific" maxLength={600} /></label>
                    <PendingButton className="btn btn-secondary" pending="Rewriting…">Rewrite</PendingButton>
                  </div>
                </form>
              )}
            </Card>
          )}

          {/* ---------------------------------------------------------- Arabic */}
          {(en || st === 'approved') && (
            <Card title="Arabic version (العربية)">
              <form action={arabicToggleAction} className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <input type="hidden" name="id" value={id} /><input type="hidden" name="on" value={idea.wantArabic ? '' : 'on'} />
                <p className="text-sm text-slate-600">{idea.wantArabic ? 'On: a localised Arabic article is published with the English one, linked with hreflang, right to left.' : 'Off: only the English article is published.'}</p>
                <PendingButton className="btn btn-ghost h-8 px-2.5 text-xs" pending="…">{idea.wantArabic ? 'Turn off' : 'Turn on'}</PendingButton>
              </form>
              {idea.wantArabic && en && (
                <div className="flex flex-wrap items-center gap-2">
                  <form action={arabicAction}><input type="hidden" name="id" value={id} /><PendingButton className="btn btn-secondary" pending="Writing the Arabic version… (2–3 minutes)" confirm={ar ? 'Replace the Arabic draft with a new translation of the current English text?' : undefined}>{ar ? 'Regenerate from the English text' : 'Generate the Arabic draft'}</PendingButton></form>
                  {ar && <><form action={reviewAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="post" value="ar" /><PendingButton className="btn btn-ghost" pending="…"><Icon name="pen" /> Edit Arabic</PendingButton></form><a className="btn btn-ghost" target="_blank" href={`/blog/${ar.slug}${ar.status === 'PUBLISHED' ? '' : '?preview'}`}><Icon name="eye" /> Preview</a></>}
                </div>
              )}
              {ar && <p dir="rtl" lang="ar" className="mt-3 rounded-xl bg-slate-50 p-3 text-right text-sm font-medium text-slate-800">{ar.title}</p>}
              {ar && ar.status === 'DRAFT' && h2ar.length > 0 && (
                <form action={sectionAction} className="mt-3 grid gap-2 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-end">
                  <input type="hidden" name="id" value={id} /><input type="hidden" name="lang" value="ar" />
                  <label className="block"><span className="field-label">Arabic section</span><select name="heading" dir="rtl" className="input">{h2ar.map((h) => <option key={h}>{h}</option>)}</select></label>
                  <label className="block"><span className="field-label">Instruction</span><input name="instruction" className="input" maxLength={600} placeholder="e.g. simpler wording" /></label>
                  <PendingButton className="btn btn-secondary" pending="Rewriting…">Rewrite</PendingButton>
                </form>
              )}
            </Card>
          )}

          {/* ---------------------------------------------------------- idea details */}
          <Card title="Topic details">
            <form action={updateIdeaAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="id" value={id} />
              <label className="block md:col-span-2"><span className="field-label">Working title</span><input name="title" defaultValue={idea.title} className="input" /></label>
              <label className="block"><span className="field-label">Primary keyword</span><input name="primaryKeyword" defaultValue={idea.primaryKeyword} className="input" /></label>
              <label className="block"><span className="field-label">Secondary keywords</span><input name="secondaryKeywords" defaultValue={idea.secondaryKeywords.join(', ')} className="input" /></label>
              <label className="block"><span className="field-label">Track</span><select name="track" defaultValue={idea.track} className="input"><option value="uae">UAE / GCC</option><option value="global">Global</option></select></label>
              <label className="block"><span className="field-label">Search intent (estimated)</span><select name="intent" defaultValue={idea.intent} className="input"><option>informational</option><option>commercial</option><option>transactional</option></select></label>
              <label className="block"><span className="field-label">Audience country</span><input name="country" defaultValue={idea.country} className="input" placeholder="AE, SA, GCC, Global" /></label>
              <label className="block"><span className="field-label">Priority (1–100)</span><input type="number" name="priority" min={1} max={100} defaultValue={idea.priority} className="input" /></label>
              <label className="block"><span className="field-label">Product / category to link</span>
                <select name="target" defaultValue={idea.target} className="input">
                  <option value="">Automatic (from the topic)</option>
                  {idea.target && !target && <option value={idea.target}>{idea.target} (not live on the site)</option>}
                  {(inv?.targets || []).map((t) => <option key={t.ref} value={t.ref}>{t.label} — {t.path}</option>)}
                </select></label>
              <label className="block"><span className="field-label">Suggested slug</span><input name="slug" defaultValue={idea.slug} className="input font-mono" /></label>
              {!['idea', 'rejected'].includes(st) && <label className="block"><span className="field-label">Calendar date (Dubai)</span><input type="datetime-local" name="plannedFor" defaultValue={toDubaiLocal(idea.plannedFor)} className="input" /></label>}
              <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="wantArabic" defaultChecked={idea.wantArabic} className="h-4 w-4" /> Arabic version</label>
              {idea.rationale && <p className="text-xs text-slate-500 md:col-span-2"><b>Why this topic:</b> {idea.rationale}</p>}
              {idea.overlap && <p className="text-xs text-amber-700 md:col-span-2">⚠ {idea.overlap}</p>}
              {idea.target && !target && <p className="text-xs text-amber-700 md:col-span-2">The target “{idea.target}” has no live page right now: the article will pick plans automatically.</p>}
              <div className="flex flex-wrap gap-2 md:col-span-2"><PendingButton className="btn btn-secondary">Save details</PendingButton>
                {!idea.postId && <PendingButton formAction={deleteIdeaAction} className="btn btn-ghost text-red-600" confirm="Delete this idea permanently?" pending="…">Delete idea</PendingButton>}</div>
            </form>
          </Card>
        </div>

        {/* ---------------------------------------------------------- sidebar */}
        <div className="space-y-6">
          <Card title="Quality checks" actions={en ? <span className="text-xs tabular-nums"><span className="text-emerald-600">{sum.pass}</span> · <span className="text-amber-600">{sum.warn}</span> · <span className={sum.fail ? 'font-semibold text-red-600' : 'text-slate-400'}>{sum.fail}</span></span> : undefined}>
            {!en ? <p className="text-sm text-slate-500">Checks run when the draft is generated, and again after every edit you ask for here.</p> : (
              <>
                {!checks.length && <p className="mb-3 text-sm text-slate-500">Not checked yet.</p>}
                <ul className="space-y-2">{sorted.map((c) => (
                  <li key={c.id} className="flex gap-2.5 text-[13px]">
                    <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${ICON[c.status][1]}`} title={c.status}><Icon name={ICON[c.status][0]} className="h-3 w-3" /><span className="sr-only">{c.status}</span></span>
                    <span className="min-w-0"><span className="block font-medium text-slate-800">{c.label}</span>{c.detail && <span className="block break-words text-xs text-slate-500">{c.detail}</span>}</span>
                  </li>))}</ul>
                <form action={checksAction} className="mt-4 flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={id} />
                  <PendingButton className="btn btn-secondary h-8 px-2.5 text-xs" pending="Checking…" name="ai" value="">Re-run checks</PendingButton>
                  <PendingButton className="btn btn-ghost h-8 px-2.5 text-xs" pending="Reviewing…" name="ai" value="on">With AI review</PendingButton>
                </form>
                {idea.checkedAt && <p className="mt-2 text-[11px] text-slate-400">Last checked {fmtDate(idea.checkedAt)}. Edits saved in the blog editor are picked up when you re-run.</p>}
              </>
            )}
          </Card>
          <Card title="Cost">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Spent on this article</dt><dd className="font-semibold tabular-nums">{usd(Number(idea.costUsd))}</dd></div>
              {usage.map((u: any) => <div key={u.step} className="flex justify-between text-xs text-slate-500"><dt className="capitalize">{u.step} ×{u.n}</dt><dd className="tabular-nums">{usd(Number(u.usd))}</dd></div>)}
              <div className="flex justify-between border-t border-slate-100 pt-1.5"><dt className="text-slate-500">Typical full article{idea.wantArabic ? ' + Arabic' : ''}</dt><dd className="tabular-nums">≈{usd(est)}</dd></div>
            </dl>
          </Card>
          <Card title="Allowed next states">
            <p className="text-xs text-slate-500">{nextStates(st).map((s) => STATE_LABEL[s]).join(' · ') || '—'}</p>
            {idea.approvedBy && <p className="mt-2 text-xs text-slate-400">Approved by {idea.approvedBy}{idea.approvedAt ? ` on ${fmtDate(idea.approvedAt)}` : ''}</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
