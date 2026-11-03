'use server';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { done, fail, str, bool, int } from '@/lib/admin';
import { INTENTS, StateError, TRACKS, makeSlug, normalizeContent, parseDubaiLocal, validSlug, type Track } from '@/lib/content/core';
import { contentSettings, getIdea, saveContentSettings, updateIdea } from '@/lib/content/store';
import {
  EngineError, approve, generateArabic, generateDraft, generateIdeas, loadSeed, publishNow, reject, restore, rewriteSection, runChecks, runContentCron,
  schedule, startReview, unschedule,
} from '@/lib/content/engine';

const BASE = '/admin/seo/content';
const msgOf = (e: unknown) => (e instanceof EngineError || e instanceof StateError ? e.message : String((e as any)?.message || 'Something went wrong. Try again.')).slice(0, 300);
/** Run an engine step; on failure go back with the message (redirects are thrown outside the try). */
async function step<T>(back: string, fn: () => Promise<T>): Promise<T> {
  let out: T;
  try { out = await fn(); } catch (e) { if ((e as any)?.digest?.startsWith?.('NEXT_REDIRECT')) throw e; fail(back, msgOf(e)); }
  return out!;
}
const backOf = (fd: FormData, d = BASE) => { const b = str(fd, 'back'); return b.startsWith('/admin/') ? b : d; };
const fmt = (d: Date) => d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dubai' });

/* ------------------------------------------------------------------ backlog */
export async function generateIdeasAction(fd: FormData) {
  const s = await requireSession('content');
  const track = (TRACKS as string[]).includes(str(fd, 'track')) ? (str(fd, 'track') as Track) : 'uae';
  const seeds = str(fd, 'seeds').split(/\r?\n|,/).map((x) => x.trim()).filter((x) => x.length >= 2).slice(0, 20);
  const back = `${BASE}?tab=ideas&track=${track}`;
  const r = await step(back, () => generateIdeas({ track, count: int(fd, 'count', 12), seeds, by: s }));
  done(back, `${r.added} new idea${r.added === 1 ? '' : 's'} added${r.dropped ? ` (${r.dropped} skipped: too close to an existing page or idea)` : ''}. Review and approve the ones you like.`);
}

export async function loadSeedAction() {
  const s = await requireSession('content');
  const n = await step(`${BASE}?tab=ideas`, () => loadSeed(s));
  done(`${BASE}?tab=ideas`, n ? `${n} starter ideas added to the backlog.` : 'The starter backlog is already loaded.');
}

export async function addIdeaAction(fd: FormData) {
  const s = await requireSession('content');
  const back = `${BASE}?tab=ideas`;
  const title = str(fd, 'title').slice(0, 160), kw = str(fd, 'primaryKeyword').toLowerCase().slice(0, 80);
  if (title.length < 8 || kw.length < 3) fail(back, 'Give the idea a working title and a primary keyword.');
  const track = (TRACKS as string[]).includes(str(fd, 'track')) ? str(fd, 'track') : 'global';
  const [r] = await db.insert(schema.contentIdeas).values({
    track, title, primaryKeyword: kw, secondaryKeywords: str(fd, 'secondaryKeywords').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 6),
    intent: (INTENTS as string[]).includes(str(fd, 'intent')) ? str(fd, 'intent') : 'informational', country: str(fd, 'country').slice(0, 12) || (track === 'uae' ? 'AE' : 'Global'),
    target: str(fd, 'target'), slug: makeSlug(kw), priority: Math.min(100, Math.max(1, int(fd, 'priority', 60))), source: 'owner', state: 'idea',
  }).returning({ id: schema.contentIdeas.id });
  await db.insert(schema.auditLogs).values({ userEmail: s.email, action: 'create', entity: 'content_idea', entityId: r.id }).catch(() => {});
  done(`${BASE}/${r.id}`, 'Idea added. Approve it into the calendar when you are ready.');
}

export async function approveAction(fd: FormData) {
  const s = await requireSession('content');
  const back = backOf(fd);
  const at = str(fd, 'at') ? parseDubaiLocal(str(fd, 'at')) : null;
  if (str(fd, 'at') && !at) fail(back, 'The date is not valid.');
  const ids = fd.getAll('ids').map(String).filter(Boolean);
  const list = str(fd, 'one') ? [str(fd, 'one')] : ids.length ? ids : [str(fd, 'id')];
  if (!list[0]) fail(back, 'Select at least one idea.');
  if (fd.has('arabic')) for (const id of list) await updateIdea(id, { wantArabic: bool(fd, 'arabic') });
  const slots: string[] = [];
  for (const id of list) slots.push(fmt(await step(back, () => approve(id, s, list.length === 1 ? at : null))));
  done(back, list.length === 1 ? `Approved for ${slots[0]} (Dubai time). The draft is written automatically about a week before.` : `${list.length} ideas approved into the calendar.`);
}

export async function rejectAction(fd: FormData) {
  const s = await requireSession('content');
  const back = backOf(fd);
  await step(back, () => reject(str(fd, 'one') || str(fd, 'id'), s));
  done(back, 'Rejected. You can restore it from the Rejected filter.');
}
export async function restoreAction(fd: FormData) {
  const s = await requireSession('content');
  const back = backOf(fd);
  await step(back, () => restore(str(fd, 'one') || str(fd, 'id'), s));
  done(back, 'Moved back to the backlog.');
}

export async function updateIdeaAction(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id');
  const back = `${BASE}/${id}`;
  const idea = await getIdea(id);
  if (!idea) fail(BASE, 'Idea not found');
  const slug = str(fd, 'slug').toLowerCase();
  if (slug && !validSlug(slug)) fail(back, 'The slug may only contain lowercase letters, numbers and single hyphens.');
  const at = str(fd, 'plannedFor') ? parseDubaiLocal(str(fd, 'plannedFor')) : idea!.plannedFor;
  await updateIdea(id, {
    title: str(fd, 'title').slice(0, 160) || idea!.title, primaryKeyword: str(fd, 'primaryKeyword').toLowerCase().slice(0, 80) || idea!.primaryKeyword,
    secondaryKeywords: str(fd, 'secondaryKeywords').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 6),
    intent: (INTENTS as string[]).includes(str(fd, 'intent')) ? str(fd, 'intent') : idea!.intent, track: (TRACKS as string[]).includes(str(fd, 'track')) ? str(fd, 'track') : idea!.track,
    country: str(fd, 'country').slice(0, 12), target: str(fd, 'target'), slug: slug || idea!.slug, priority: Math.min(100, Math.max(1, int(fd, 'priority', idea!.priority))),
    wantArabic: bool(fd, 'wantArabic'), plannedFor: ['idea', 'rejected'].includes(idea!.state) ? idea!.plannedFor : at,
  });
  await db.insert(schema.auditLogs).values({ userEmail: s.email, action: 'update', entity: 'content_idea', entityId: id }).catch(() => {});
  done(back, 'Idea saved.');
}

/* ------------------------------------------------------------------ drafts and review */
export async function draftAction(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id');
  const back = backOf(fd, `${BASE}/${id}`);
  const r = await step(back, () => generateDraft(id, s));
  const f = r.checks.filter((c) => c.status === 'fail').length;
  done(back, `Draft ready. ${f ? `${f} check${f === 1 ? '' : 's'} need attention before publishing.` : 'All blocking checks passed: read it, then schedule it.'}`);
}
export async function checksAction(fd: FormData) {
  await requireSession('content');
  const id = str(fd, 'id');
  await step(`${BASE}/${id}`, () => runChecks(id, { ai: bool(fd, 'ai') }));
  done(`${BASE}/${id}`, 'Checks updated.');
}
export async function sectionAction(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id');
  const lang = str(fd, 'lang') === 'ar' ? 'ar' : 'en';
  await step(`${BASE}/${id}`, () => rewriteSection(id, str(fd, 'heading'), str(fd, 'instruction'), lang, s));
  done(`${BASE}/${id}`, `Section “${str(fd, 'heading')}” rewritten. The previous text is kept in the post's earlier versions.`);
}
export async function arabicAction(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id');
  await step(`${BASE}/${id}`, () => generateArabic(id, s));
  done(`${BASE}/${id}`, 'Arabic draft ready. It is published together with the English article.');
}
export async function arabicToggleAction(fd: FormData) {
  await requireSession('content');
  const id = str(fd, 'id');
  await updateIdea(id, { wantArabic: bool(fd, 'on') });
  done(`${BASE}/${id}`, bool(fd, 'on') ? 'The Arabic version will be published with the English one.' : 'Only the English article will be published.');
}
export async function reviewAction(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id');
  const postId = await step(`${BASE}/${id}`, () => startReview(id, s));
  const which = str(fd, 'post');
  if (which === 'ar') { const i = await getIdea(id); if (i?.arPostId) redirect(`/admin/blog/${i.arPostId}`); }
  redirect(`/admin/blog/${postId}`);
}
export async function scheduleAction(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id');
  const back = `${BASE}/${id}`;
  const at = parseDubaiLocal(str(fd, 'at'));
  if (!at) fail(back, 'Pick a date and time.');
  const r = await step(back, () => schedule(id, at!, s));
  done(back, r.live ? 'Published. The article is live and search engines were notified.' : `Scheduled for ${fmt(at!)} (Dubai time). It goes live by itself.`);
}
export async function publishAction(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id');
  await step(`${BASE}/${id}`, () => publishNow(id, s));
  done(`${BASE}/${id}`, 'Published. The article is live, in the sitemap, and search engines were notified.');
}
export async function unscheduleAction(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id');
  await step(`${BASE}/${id}`, () => unschedule(id, s));
  done(`${BASE}/${id}`, 'Back in review. The article is hidden from the website.');
}

/* ------------------------------------------------------------------ settings and automation */
export async function saveSettingsAction(fd: FormData) {
  const s = await requireSession('settings');
  const cur = await contentSettings();
  const v = normalizeContent({
    ...cur, enabled: bool(fd, 'enabled'), perMonth: { uae: str(fd, 'perUae'), global: str(fd, 'perGlobal') }, autoDraft: bool(fd, 'autoDraft'), draftLeadDays: str(fd, 'draftLeadDays'),
    autoPublish: bool(fd, 'autoPublish'), perRun: str(fd, 'perRun'), minWords: str(fd, 'minWords'), maxWords: str(fd, 'maxWords'), publishHour: str(fd, 'publishHour'),
    notify: bool(fd, 'notify'), arabicDefault: bool(fd, 'arabicDefault'), monthlyCapUsd: str(fd, 'monthlyCapUsd'), seedKeywords: str(fd, 'seedKeywords'),
  });
  await saveContentSettings(v);
  await db.insert(schema.auditLogs).values({ userEmail: s.email, action: 'update', entity: 'content_settings', detail: v as any }).catch(() => {});
  done(`${BASE}?tab=settings`, v.autoPublish ? 'Saved. Auto-publish is ON: clean drafts are scheduled on their calendar date without your review.' : 'Saved.');
}

export async function runNowAction() {
  await requireSession('settings');
  const r = await step(`${BASE}?tab=pipeline`, () => runContentCron({ deadlineMs: 120_000 }));
  if (r.skipped) fail(`${BASE}?tab=pipeline`, 'The content engine is switched off in Settings.');
  const parts = [`${r.drafted.length} drafted`, `${r.published.length} went live`, ...(r.autoScheduled.length ? [`${r.autoScheduled.length} auto-scheduled`] : []), ...(r.notified ? [`owner emailed about ${r.notified}`] : [])];
  const tail = r.failed.length ? ` ${r.failed.length} failed: ${r.failed[0].error}` : r.budget ? ` Stopped: ${r.budget}` : '';
  done(`${BASE}?tab=pipeline`, `Automation ran: ${parts.join(', ')}.${tail}`);
}

export async function deleteIdeaAction(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id');
  const idea = await getIdea(id);
  if (!idea) fail(BASE, 'Idea not found');
  if (idea!.postId) fail(`${BASE}/${id}`, 'This idea has a draft article: reject it instead (the draft stays in the blog as a draft).');
  await db.delete(schema.contentIdeas).where(eq(schema.contentIdeas.id, id));
  await db.insert(schema.auditLogs).values({ userEmail: s.email, action: 'delete', entity: 'content_idea', entityId: id, detail: { title: idea!.title } as any }).catch(() => {});
  done(`${BASE}?tab=ideas`, `Deleted “${idea!.title}”.`);
}
