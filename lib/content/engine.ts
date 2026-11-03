// SEO content engine: AI steps (ideas, drafts, section rewrites, Arabic versions, review), the review/publish workflow
// and the daily cron step (server only). Articles are ordinary blog posts: DRAFT until the owner schedules or publishes.
// Nothing is ever published without an owner action, unless the owner switched on "auto-publish approved drafts".
import 'server-only';
import { TRACKS } from './core';
import { and, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { db, schema } from '../db';
import { aiClient, aiSettings, budgetOk, logUsage } from '../ai/server';
import { pingChanged } from '../indexnow';
import { emailOwner } from '../support-notify';
import type { Session } from '../auth';
import {
  assertMove, closestExisting, makeSlug, metaDescription, metaTitle, monthKey, nextFreeSlot, overlapLevel, reconcileState, replaceSection, seasonalHints,
  selectAutoSchedule, selectDuePublished, selectForDrafting, splitSections, validSlug, type IdeaState, type Track, TRACK_LABEL,
} from './core';
import { runQualityChecks, summarize, type Check } from './quality';
import { arabicWith, draftArticle, generateIdeasWith, reviewWith, rewriteSectionWith, type CallUsage } from './prompts';
import { addCost, blogCategoryFor, contentSettings, contentSpend, freeSlug, getIdea, inventory, listIdeas, resolveTarget, updateIdea, type Idea, type Inventory } from './store';

export const AUTHOR = 'GlobalHostia Team';
const SYSTEM: Session = { uid: 'system', email: 'content-engine@cron', name: 'Content engine', role: 'OWNER' };
export class EngineError extends Error {}

/* ------------------------------------------------------------------ AI plumbing */
async function clientOrThrow() {
  const c = await aiClient();
  if (!c) throw new EngineError('The AI key is not configured (ANTHROPIC_API_KEY). Ideas and drafts cannot be generated here.');
  return c;
}
/** Global AI caps (Admin → AI assistant) and the content engine's own monthly cap. */
export async function budgetGate(): Promise<string | null> {
  const s = await aiSettings();
  const b = await budgetOk(s);
  if (!b.ok) return b.reason === 'zero' ? 'The AI budget is set to 0 (Admin → AI assistant → Settings).' : `The ${b.reason} AI budget cap is reached (Admin → AI assistant → Settings).`;
  const cs = await contentSettings();
  if (!cs.enabled) return 'The content engine is switched off (Content engine → Settings).';
  if (cs.monthlyCapUsd <= 0) return 'The content engine budget is set to 0 (Content engine → Settings).';
  const sp = await contentSpend();
  if (sp.month >= cs.monthlyCapUsd) return `This month's content engine budget ($${cs.monthlyCapUsd}) is used up.`;
  return null;
}
async function log(ideaId: string | null, step: string, u: CallUsage, status = 'ok', detail = ''): Promise<number> {
  const s = await aiSettings();
  const cost = await logUsage({ surface: 'content', model: u.model, subject: ideaId ? `content:${ideaId}` : 'content:ideas', status, usage: { input: u.input, output: u.output, cacheRead: u.cacheRead, cacheWrite: u.cacheWrite }, ms: u.ms, detail: `${step}${detail ? ` ${detail}` : ''}` }, s);
  if (ideaId) await addCost(ideaId, cost);
  return cost;
}
async function audit(s: Session, action: string, id: string, detail?: unknown) {
  await db.insert(schema.auditLogs).values({ userEmail: s.email, action, entity: 'content_idea', entityId: id, detail: (detail ?? null) as any }).catch(() => {});
}
async function revision(s: Session, postId: string) {
  const [p] = await db.select().from(schema.posts).where(eq(schema.posts.id, postId));
  if (p) await db.insert(schema.revisions).values({ entity: 'post', entityId: p.id, data: p as any, userEmail: s.email }).catch(() => {});
}
const today = () => new Date().toISOString().slice(0, 10);
const bust = () => { try { revalidateTag('site'); } catch { /* outside a request (tests/scripts) */ } };

/** Move an idea to `to` only if it is still in one of `from` (a lock against double clicks and parallel cron runs). */
async function claim(id: string, from: IdeaState[], to: IdeaState, extra: Partial<typeof schema.contentIdeas.$inferInsert> = {}) {
  for (const f of from) if (f !== to) assertMove(f, to);
  const r = await db.update(schema.contentIdeas).set({ ...extra, state: to, updatedAt: new Date() })
    .where(and(eq(schema.contentIdeas.id, id), inArray(schema.contentIdeas.state, from))).returning({ id: schema.contentIdeas.id });
  return r.length > 0;
}

/* ------------------------------------------------------------------ ideas */
export async function generateIdeas(o: { track: Track; count?: number; seeds?: string[]; by: Session }) {
  const gate = await budgetGate();
  if (gate) throw new EngineError(gate);
  const [c, s, inv, cs, ideas] = await Promise.all([clientOrThrow(), aiSettings(), inventory(true), contentSettings(), listIdeas({ limit: 1000 })]);
  const seeds = [...(o.seeds || []), ...cs.seedKeywords].slice(0, 40);
  const existing = [...inv.existing, ...ideas.filter((i) => i.state !== 'rejected').map((i) => ({ path: `idea:${i.id}`, title: i.title, slug: i.slug }))];
  let out;
  try {
    out = await generateIdeasWith(c, s.fastModel, { track: o.track, count: Math.min(20, Math.max(3, o.count || 12)), targets: inv.targets, existing: existing.map((e) => ({ title: e.title, path: e.path.startsWith('idea:') ? '(planned idea)' : e.path })), seasonal: seasonalHints(o.track, monthKey(Date.now()), 4), seeds, today: today() });
  } catch (e: any) {
    await log(null, 'ideas', { model: s.fastModel, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ms: 0 }, 'error', String(e?.message || e).slice(0, 200));
    throw new EngineError('The idea generator did not answer. Try again in a minute.');
  }
  await log(null, 'ideas', out.usage, 'ok', `${o.track} ${out.ideas.length}`);
  const slugs = new Set(ideas.map((i) => i.slug));
  let added = 0, dropped = 0;
  for (const r of out.ideas) {
    const slug = (validSlug(r.slug) ? r.slug : makeSlug(r.primaryKeyword || r.title)).slice(0, 75);
    const hit = closestExisting({ title: r.title, primaryKeyword: r.primaryKeyword, slug }, existing);
    if ((hit && overlapLevel(hit.score) === 'drop') || slugs.has(slug)) { dropped++; continue; }
    slugs.add(slug);
    await db.insert(schema.contentIdeas).values({
      track: o.track, title: r.title, primaryKeyword: r.primaryKeyword, secondaryKeywords: r.secondaryKeywords, intent: r.intent, country: r.audienceCountry,
      target: r.target, slug, priority: r.priority, rationale: r.rationale, source: 'ai', state: 'idea',
      overlap: hit && overlapLevel(hit.score) === 'warn' ? `Related: ${hit.page.title} (${hit.page.path.startsWith('idea:') ? 'another idea' : hit.page.path})` : '',
    });
    existing.push({ path: 'idea:new', title: r.title, slug });
    added++;
  }
  await audit(o.by, 'generate_ideas', o.track, { added, dropped });
  return { added, dropped };
}

/** Insert the curated starter backlog (only ideas whose slug is not already in the table). */
export async function loadSeed(by: Session) {
  const { SEED_IDEAS } = await import('./seed-ideas.mjs');
  const have = new Set((await db.select({ slug: schema.contentIdeas.slug }).from(schema.contentIdeas)).map((r) => r.slug));
  let n = 0;
  for (const i of SEED_IDEAS) {
    if (have.has(i.slug)) continue;
    await db.insert(schema.contentIdeas).values({ track: i.track, title: i.title, primaryKeyword: i.primaryKeyword, secondaryKeywords: i.secondaryKeywords, intent: i.intent,
      country: i.country, target: i.target, slug: i.slug, priority: i.priority, rationale: i.rationale, source: 'seed', state: 'idea' });
    n++;
  }
  await audit(by, 'load_seed', 'seed', { added: n });
  return n;
}

/* ------------------------------------------------------------------ calendar */
/** Approve an idea into the calendar: on the given Dubai date/time, else the next free slot of its track. */
export async function approve(id: string, by: Session, at?: Date | null) {
  const idea = await getIdea(id);
  if (!idea) throw new EngineError('Idea not found');
  assertMove(idea.state, 'approved');
  let when = at || null;
  if (!when) {
    const cs = await contentSettings();
    const taken = (await listIdeas({ track: idea.track, states: ['approved', 'drafting', 'draft_ready', 'in_review', 'scheduled', 'published'] })).map((i) => i.plannedFor);
    when = nextFreeSlot({ track: idea.track as Track, perMonth: cs.perMonth[idea.track as Track] || 0, taken, now: Date.now(), hour: cs.publishHour });
    if (!when) throw new EngineError(`No free ${TRACK_LABEL[idea.track as Track]} slot in the next 6 months: raise the monthly quota or pick a date.`);
  }
  if (!(await claim(id, [idea.state as IdeaState], 'approved', { plannedFor: when, approvedBy: by.email, approvedAt: new Date(), wantArabic: idea.wantArabic, error: '' }))) throw new EngineError('This idea changed in the meantime. Reload and try again.');
  await audit(by, 'approve', id, { plannedFor: when.toISOString() });
  return when;
}
export async function reject(id: string, by: Session) {
  const idea = await getIdea(id);
  if (!idea) throw new EngineError('Idea not found');
  assertMove(idea.state, 'rejected');
  if (idea.postId) {
    const [p] = await db.select({ status: schema.posts.status }).from(schema.posts).where(eq(schema.posts.id, idea.postId));
    if (p?.status === 'PUBLISHED') throw new EngineError('This article is live. Unpublish it in the blog first.');
  }
  await claim(id, [idea.state as IdeaState], 'rejected');
  await audit(by, 'reject', id);
}
export async function restore(id: string, by: Session) {
  if (!(await claim(id, ['rejected', 'approved'], 'idea', { plannedFor: null }))) throw new EngineError('Only rejected or approved ideas can go back to the backlog.');
  await audit(by, 'restore', id);
}

/* ------------------------------------------------------------------ drafts */
function postRowFromDraft(idea: Idea, inv: Inventory, d: { h1: string; metaTitle: string; metaDescription: string; excerpt: string; takeaways: string[] }, body: string) {
  const target = resolveTarget(inv, idea.target);
  const ref = target?.ref || idea.target;
  const related = /^(cat|p):[a-z0-9-]+$/.test(ref) && (!ref.startsWith('cat:') || inv.liveCategories.has(ref.slice(4))) ? [ref] : [];
  return {
    title: d.h1.slice(0, 200), excerpt: d.excerpt.slice(0, 500), body, category: blogCategoryFor(ref, idea.track as Track),
    tags: [...new Set([idea.track === 'uae' ? 'UAE' : '', target?.label.replace(/\s*\(business service\)$/, '') || ''].filter((t) => t && t.length <= 40))],
    author: AUTHOR, seoTitle: metaTitle(d.metaTitle || d.h1), seoDescription: metaDescription(d.metaDescription || d.excerpt),
    focusKeyword: idea.primaryKeyword.slice(0, 80), secondaryKeywords: idea.secondaryKeywords.join(', ').slice(0, 300),
    takeaways: d.takeaways.join('\n'), relatedProducts: related, coverStyle: 'branded', track: idea.track,
  };
}

/** Generate (or regenerate) the English draft for an approved idea. */
export async function generateDraft(id: string, by: Session) {
  const gate = await budgetGate();
  if (gate) throw new EngineError(gate);
  const idea = await getIdea(id);
  if (!idea) throw new EngineError('Idea not found');
  if (!['approved', 'draft_ready', 'in_review'].includes(idea.state)) throw new EngineError('Approve the idea before generating a draft.');
  if (!(await claim(id, [idea.state as IdeaState], 'drafting', { error: '' }))) throw new EngineError('A draft for this idea is already being written.');
  const back = idea.postId ? (idea.state as IdeaState) : 'approved';
  try {
    const [c, s, inv, cs] = await Promise.all([clientOrThrow(), aiSettings(), inventory(true), contentSettings()]);
    const target = resolveTarget(inv, idea.target);
    const out = await draftArticle(c, s.chatModel, {
      idea: { title: idea.title, primaryKeyword: idea.primaryKeyword, secondaryKeywords: idea.secondaryKeywords, intent: idea.intent, track: idea.track as Track, country: idea.country, slug: idea.slug },
      target, links: inv.links, minWords: cs.minWords, maxWords: cs.maxWords, today: today(),
    }).catch(async (e) => { await log(id, 'draft', { model: s.chatModel, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ms: 0 }, 'error', String(e?.message || e).slice(0, 200)); throw e; });
    await log(id, 'draft', out.usage);
    const row = postRowFromDraft(idea, inv, out.draft, out.body);
    let postId = idea.postId;
    const [existingPost] = postId ? await db.select().from(schema.posts).where(eq(schema.posts.id, postId)) : [];
    if (existingPost && existingPost.status !== 'DRAFT') throw new EngineError('The article is already scheduled or live: unpublish it in the blog before regenerating.');
    if (existingPost) {
      await revision(by, existingPost.id);
      await db.update(schema.posts).set({ ...row, updatedAt: new Date() }).where(eq(schema.posts.id, existingPost.id));
    } else {
      const want = validSlug(out.draft.slug) ? out.draft.slug : idea.slug || makeSlug(idea.primaryKeyword || idea.title);
      const slug = await freeSlug(makeSlug(want.replace(/-/g, ' ')) || want);
      const [p] = await db.insert(schema.posts).values({ ...row, slug, status: 'DRAFT', lang: 'en' }).returning({ id: schema.posts.id });
      postId = p.id;
    }
    const [saved] = await db.select({ slug: schema.posts.slug }).from(schema.posts).where(eq(schema.posts.id, postId!));
    await updateIdea(id, { postId, slug: saved?.slug || idea.slug, notifiedAt: null });
    const checks = await runChecks(id, { ai: true });
    await claim(id, ['drafting'], 'draft_ready', { error: '' });
    await audit(by, 'draft', id, { postId, words: out.body.split(/\s+/).length, checks: summarize(checks) });
    if (idea.wantArabic) await generateArabic(id, by).catch(async (e) => updateIdea(id, { error: `Arabic version: ${e?.message || e}` }));
    return { postId: postId!, checks };
  } catch (e: any) {
    await db.update(schema.contentIdeas).set({ state: back, error: String(e?.message || e).slice(0, 300), updatedAt: new Date() }).where(and(eq(schema.contentIdeas.id, id), eq(schema.contentIdeas.state, 'drafting')));
    throw e instanceof EngineError ? e : new EngineError(String(e?.message || 'Draft generation failed. Try again.'));
  }
}

/** Rewrite one H2 section of the English (or Arabic) article with an owner instruction. */
export async function rewriteSection(id: string, heading: string, instruction: string, lang: 'en' | 'ar', by: Session) {
  const gate = await budgetGate();
  if (gate) throw new EngineError(gate);
  const idea = await getIdea(id);
  const postId = lang === 'ar' ? idea?.arPostId : idea?.postId;
  if (!idea || !postId) throw new EngineError('There is no draft to edit yet.');
  const [p] = await db.select().from(schema.posts).where(eq(schema.posts.id, postId));
  if (!p) throw new EngineError('The draft post was deleted.');
  if (p.status !== 'DRAFT') throw new EngineError('Unpublish or unschedule the article before rewriting a section.');
  const sec = splitSections(p.body).sections.find((x) => x.heading.toLowerCase() === heading.trim().toLowerCase());
  if (!sec) throw new EngineError('That section heading is not in the article any more.');
  const [c, s, inv] = await Promise.all([clientOrThrow(), aiSettings(), inventory()]);
  const out = await rewriteSectionWith(c, s.chatModel, { title: p.title, primaryKeyword: idea.primaryKeyword, heading: sec.heading, current: sec.body, instruction: instruction.slice(0, 600), links: inv.links, track: idea.track as Track, lang });
  await log(id, 'section', out.usage);
  const body = replaceSection(p.body, sec.heading, out.body);
  if (!body) throw new EngineError('Could not place the new section.');
  await revision(by, p.id);
  await db.update(schema.posts).set({ body, updatedAt: new Date() }).where(eq(schema.posts.id, p.id));
  await runChecks(id, { ai: false });
  await audit(by, 'rewrite_section', id, { heading: sec.heading, lang });
}

/** Arabic version: a separate DRAFT post (slug "<english-slug>-ar", lang "ar") linked for hreflang. */
export async function generateArabic(id: string, by: Session) {
  const gate = await budgetGate();
  if (gate) throw new EngineError(gate);
  const idea = await getIdea(id);
  if (!idea?.postId) throw new EngineError('Generate the English draft first.');
  const [en] = await db.select().from(schema.posts).where(eq(schema.posts.id, idea.postId));
  if (!en) throw new EngineError('The English draft was deleted.');
  const [c, s] = await Promise.all([clientOrThrow(), aiSettings()]);
  const out = await arabicWith(c, s.chatModel, { title: en.title, excerpt: en.excerpt, metaTitle: en.seoTitle, metaDescription: en.seoDescription, body: en.body, takeaways: en.takeaways.split('\n').filter(Boolean) })
    .catch(async (e) => { await log(id, 'arabic', { model: s.chatModel, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ms: 0 }, 'error', String(e?.message || e).slice(0, 200)); throw new EngineError(String(e?.message || e)); });
  await log(id, 'arabic', out.usage);
  const row = {
    title: out.ar.title, excerpt: out.ar.excerpt, body: out.ar.body, seoTitle: metaTitle(out.ar.metaTitle || out.ar.title), seoDescription: metaDescription(out.ar.metaDescription || out.ar.excerpt),
    takeaways: out.ar.takeaways.join('\n'), category: en.category, tags: en.tags, author: en.author || AUTHOR, focusKeyword: en.focusKeyword, secondaryKeywords: en.secondaryKeywords,
    relatedProducts: en.relatedProducts, coverStyle: en.coverStyle, track: en.track, lang: 'ar', translationOf: en.id,
  };
  let arId = idea.arPostId;
  const [cur] = arId ? await db.select().from(schema.posts).where(eq(schema.posts.id, arId)) : [];
  if (cur) {
    if (cur.status !== 'DRAFT') throw new EngineError('The Arabic article is scheduled or live: unpublish it before regenerating.');
    await revision(by, cur.id);
    await db.update(schema.posts).set({ ...row, updatedAt: new Date() }).where(eq(schema.posts.id, cur.id));
  } else {
    const [p] = await db.insert(schema.posts).values({ ...row, slug: await freeSlug(`${en.slug}-ar`), status: 'DRAFT' }).returning({ id: schema.posts.id });
    arId = p.id;
  }
  await updateIdea(id, { arPostId: arId, wantArabic: true });
  await runChecks(id, { ai: false });
  await audit(by, 'arabic', id, { arPostId: arId });
  return arId!;
}

/* ------------------------------------------------------------------ checks */
export async function runChecks(id: string, o: { ai: boolean }): Promise<Check[]> {
  const idea = await getIdea(id);
  if (!idea?.postId) return [];
  const [[en], cs, inv] = await Promise.all([db.select().from(schema.posts).where(eq(schema.posts.id, idea.postId)), contentSettings(), inventory()]);
  if (!en) return [];
  const others = await db.select({ slug: schema.posts.slug, title: schema.posts.title, body: schema.posts.body }).from(schema.posts)
    .where(and(ne(schema.posts.id, en.id), eq(schema.posts.lang, 'en'))).limit(300);
  const known = new Set(inv.knownPaths);
  const checks = runQualityChecks({
    body: en.body, h1: en.title, metaTitle: en.seoTitle || en.title, metaDescription: en.seoDescription || en.excerpt, slug: en.slug, primaryKeyword: idea.primaryKeyword,
    secondaryKeywords: idea.secondaryKeywords, track: idea.track, lang: 'en', minWords: cs.minWords, maxWords: cs.maxWords, knownPaths: known, existing: others,
    catalogPrices: inv.catalogPrices, site: inv.site,
  });
  if (o.ai && !(await budgetGate())) {
    const c = await aiClient();
    if (c) {
      try {
        const s = await aiSettings();
        const r = await reviewWith(c, s.fastModel, { title: en.title, body: en.body, track: idea.track });
        await log(id, 'review', r.usage);
        if (!r.issues.length) checks.push({ id: 'ai-review', label: 'AI review: no fabricated facts, legal overreach or claims found', status: 'pass', detail: '' });
        r.issues.forEach((x, i) => checks.push({ id: `ai-${i}`, label: `AI review: ${x.type}`, status: x.severity, detail: `${x.quote ? `“${x.quote}” — ` : ''}${x.note}` }));
      } catch { checks.push({ id: 'ai-review', label: 'AI review', status: 'warn', detail: 'The reviewer did not answer; read the article carefully.' }); }
    }
  } else if (o.ai) checks.push({ id: 'ai-review', label: 'AI review', status: 'warn', detail: 'Skipped (AI key or budget unavailable).' });
  if (!o.ai) for (const c of idea.checks || []) if (c.id.startsWith('ai-')) checks.push({ ...c, detail: c.detail ? `${c.detail} (from the last full check)` : '(from the last full check)' });
  if (idea.arPostId) {
    const [ar] = await db.select().from(schema.posts).where(eq(schema.posts.id, idea.arPostId));
    if (ar) {
      const arc = runQualityChecks({ body: ar.body, h1: ar.title, metaTitle: ar.seoTitle || ar.title, metaDescription: ar.seoDescription || ar.excerpt, slug: ar.slug, primaryKeyword: '',
        track: idea.track, lang: 'ar', minWords: Math.round(cs.minWords * 0.7), maxWords: Math.round(cs.maxWords * 1.4), knownPaths: known, catalogPrices: inv.catalogPrices, site: inv.site });
      for (const c of arc.filter((x) => ['meta-title', 'meta-desc', 'links-broken', 'dup-headings', 'competitors', 'prices', 'faq', 'words'].includes(x.id) || x.id.startsWith('claim-')))
        checks.push({ ...c, id: `ar-${c.id}`, label: `Arabic: ${c.label}` });
    }
  }
  await updateIdea(id, { checks, checkedAt: new Date() });
  return checks;
}

/* ------------------------------------------------------------------ review → schedule → publish */
export async function startReview(id: string, by: Session) {
  const idea = await getIdea(id);
  if (!idea?.postId) throw new EngineError('There is no draft yet.');
  if (idea.state === 'draft_ready') { await claim(id, ['draft_ready'], 'in_review'); await audit(by, 'review', id); }
  return idea.postId;
}

async function setPostsLive(idea: Idea, at: Date) {
  const ids = [idea.postId, idea.wantArabic ? idea.arPostId : null].filter(Boolean) as string[];
  for (const pid of ids) {
    const [p] = await db.select().from(schema.posts).where(eq(schema.posts.id, pid));
    if (!p) continue;
    if (!p.body.trim()) throw new EngineError('The article is empty.');
    await db.update(schema.posts).set({ status: 'PUBLISHED', publishAt: at, updatedAt: new Date() }).where(eq(schema.posts.id, pid));
    await db.delete(schema.redirects).where(eq(schema.redirects.from, `/blog/${p.slug}`));
  }
  bust();
  return (await db.select({ slug: schema.posts.slug }).from(schema.posts).where(inArray(schema.posts.id, ids))).map((r) => `/blog/${r.slug}`);
}

/** Owner approval: schedule for a Dubai date/time (or now → published). */
export async function schedule(id: string, at: Date, by: Session) {
  const idea = await getIdea(id);
  if (!idea?.postId) throw new EngineError('There is no draft to schedule.');
  const now = Date.now();
  const live = at.getTime() <= now + 60_000;
  const to: IdeaState = live ? 'published' : 'scheduled';
  if (idea.state !== to) assertMove(idea.state, to);
  const paths = await setPostsLive(idea, live ? new Date(now) : at);
  await claim(id, [idea.state as IdeaState], to, { plannedFor: live ? new Date(now) : at, approvedBy: by.email, approvedAt: new Date(), ...(live ? { publishedAt: new Date(now) } : {}) });
  await audit(by, live ? 'publish' : 'schedule', id, { at: at.toISOString(), paths });
  if (live) await pingChanged([...paths, '/blog'], 'content engine publish').catch(() => {});
  return { live, paths };
}
export const publishNow = (id: string, by: Session) => schedule(id, new Date(), by);

/** Back to review: the posts return to DRAFT (hidden). */
export async function unschedule(id: string, by: Session) {
  const idea = await getIdea(id);
  if (!idea?.postId) throw new EngineError('Nothing to unschedule.');
  assertMove(idea.state, 'in_review');
  const ids = [idea.postId, idea.arPostId].filter(Boolean) as string[];
  await db.update(schema.posts).set({ status: 'DRAFT', updatedAt: new Date() }).where(inArray(schema.posts.id, ids));
  await claim(id, [idea.state as IdeaState], 'in_review', { publishedAt: null });
  bust();
  await audit(by, 'unschedule', id);
}

/** Keep idea states in step with their posts (the owner can publish or unpublish from the blog editor too). */
export async function reconcile() {
  const ideas = await db.select().from(schema.contentIdeas).where(sql`${schema.contentIdeas.postId} is not null`);
  const ids = ideas.map((i) => i.postId!);
  const posts = ids.length ? await db.select({ id: schema.posts.id, status: schema.posts.status, publishAt: schema.posts.publishAt }).from(schema.posts).where(inArray(schema.posts.id, ids)) : [];
  const byId = new Map(posts.map((p) => [p.id, p]));
  let changed = 0;
  for (const i of ideas) {
    const p = byId.get(i.postId!);
    if (!p) { if (!['idea', 'approved', 'rejected', 'drafting'].includes(i.state)) { await updateIdea(i.id, { postId: null, state: 'approved', error: 'The draft post was deleted.' }); changed++; } continue; }
    const next = reconcileState(i.state as IdeaState, p);
    if (next !== i.state) {
      await updateIdea(i.id, { state: next, ...(next === 'published' ? { publishedAt: p.publishAt || new Date() } : {}), ...(next === 'scheduled' ? { plannedFor: p.publishAt } : {}) });
      changed++;
    }
  }
  // a draft run that died (timeout) stays "drafting": release it after 15 minutes
  await db.update(schema.contentIdeas).set({ state: 'approved', error: 'The last draft attempt did not finish. Try again.' })
    .where(and(eq(schema.contentIdeas.state, 'drafting'), lt(schema.contentIdeas.updatedAt, new Date(Date.now() - 15 * 60_000)), isNull(schema.contentIdeas.postId)));
  await db.update(schema.contentIdeas).set({ state: 'draft_ready' })
    .where(and(eq(schema.contentIdeas.state, 'drafting'), lt(schema.contentIdeas.updatedAt, new Date(Date.now() - 15 * 60_000)), sql`${schema.contentIdeas.postId} is not null`));
  return changed;
}

async function unapproveIfFar(id: string) {
  await db.update(schema.contentIdeas).set({ state: 'idea', plannedFor: null, approvedBy: '', approvedAt: null }).where(and(eq(schema.contentIdeas.id, id), eq(schema.contentIdeas.state, 'approved')));
}

/* ------------------------------------------------------------------ cron */
export type CronResult = { ok: boolean; skipped?: string; drafted: string[]; autoApproved: string[]; failed: { id: string; error: string }[]; published: string[]; autoScheduled: string[]; notified: number; budget?: string | null };

/** Daily step (piggybacks on /api/cron/sync): record posts that went live, draft approved items due soon,
 *  auto-schedule clean drafts only when the owner enabled it, then email the owner about drafts waiting for review. */
export async function runContentCron(o: { deadlineMs?: number } = {}): Promise<CronResult> {
  const t0 = Date.now();
  const deadline = t0 + (o.deadlineMs ?? 170_000);
  const res: CronResult = { ok: true, drafted: [], failed: [], published: [], autoScheduled: [], autoApproved: [], notified: 0 };
  const cs = await contentSettings();
  if (!cs.enabled) return { ...res, skipped: 'disabled' };
  await reconcile();
  const ideas = await listIdeas({ states: ['approved', 'draft_ready', 'scheduled'], limit: 1000 });

  for (const i of selectDuePublished(ideas, Date.now())) {
    await updateIdea(i.id, { state: 'published', publishedAt: i.plannedFor || new Date() });
    const paths = (await db.select({ slug: schema.posts.slug }).from(schema.posts).where(inArray(schema.posts.id, [i.postId, i.arPostId].filter(Boolean) as string[]))).map((r) => `/blog/${r.slug}`);
    await pingChanged([...paths, '/blog'], 'content engine scheduled post').catch(() => {});
    res.published.push(i.id);
  }

  // Autopilot: keep the calendar filled day to day. Approve the highest-priority open ideas into the next free slots
  // (seasonal topics carry higher priority), and top up a track's backlog with fresh AI ideas when it runs low.
  let pool = ideas;
  if (cs.autoPublish) {
    try {
      const horizon = Date.now() + (cs.draftLeadDays + 7) * 86_400_000;
      for (const tr of TRACKS) {
        if (!(cs.perMonth[tr] > 0)) continue;
        let open = await listIdeas({ track: tr, states: ['idea'], limit: 50 });
        if (open.length < 4 && Date.now() < deadline - 60_000 && !(await budgetGate())) {
          try { await generateIdeas({ track: tr, count: 8, seeds: cs.seedKeywords, by: SYSTEM }); open = await listIdeas({ track: tr, states: ['idea'], limit: 50 }); } catch { /* ideas next run */ }
        }
        const queued = (await listIdeas({ track: tr, states: ['approved', 'drafting', 'draft_ready', 'in_review', 'scheduled'], limit: 200 }))
          .filter((i) => i.plannedFor && new Date(i.plannedFor).getTime() <= horizon).length;
        const want = Math.max(0, Math.ceil((cs.perMonth[tr] * (cs.draftLeadDays + 7)) / 30) - queued);
        for (const i of open.slice(0, want)) {
          try { const at = await approve(i.id, SYSTEM); if (at.getTime() > horizon) { await unapproveIfFar(i.id); break; } res.autoApproved.push(i.id); } catch { break; }
        }
      }
    } catch { /* never block the rest of the run */ }
    pool = await listIdeas({ states: ['approved', 'draft_ready', 'scheduled'], limit: 1000 });
  }

  if (cs.autoDraft) {
    for (const i of selectForDrafting(pool, Date.now(), cs.draftLeadDays, cs.perRun)) {
      if (Date.now() > deadline) break;
      const gate = await budgetGate();
      if (gate) { res.budget = gate; break; }
      try { await generateDraft(i.id, SYSTEM); res.drafted.push(i.id); } catch (e: any) { res.failed.push({ id: i.id, error: String(e?.message || e).slice(0, 200) }); }
    }
  }

  if (cs.autoPublish) {
    const fresh = await listIdeas({ states: ['draft_ready'], limit: 200 });
    for (const i of selectAutoSchedule(fresh, true)) {
      const at = i.plannedFor && new Date(i.plannedFor).getTime() > Date.now() ? new Date(i.plannedFor) : new Date();
      try { await schedule(i.id, at, SYSTEM); res.autoScheduled.push(i.id); } catch (e: any) { res.failed.push({ id: i.id, error: String(e?.message || e).slice(0, 200) }); }
    }
  }

  if (cs.notify) res.notified = await notifyDrafts().catch(() => 0);
  return res;
}

/** "N drafts ready for review" email (once per draft). */
export async function notifyDrafts(): Promise<number> {
  const waiting = await db.select().from(schema.contentIdeas).where(and(eq(schema.contentIdeas.state, 'draft_ready'), isNull(schema.contentIdeas.notifiedAt)));
  if (!waiting.length) return 0;
  const site = (await inventory()).site;
  const n = waiting.length;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rows = waiting.slice(0, 10).map((i) => `<li style="margin:0 0 8px"><b>${esc(i.title)}</b><br><span style="color:#667085;font-size:13px">${esc(TRACK_LABEL[i.track as Track] || i.track)}${i.plannedFor ? ` · planned ${new Date(i.plannedFor).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' })}` : ''} · ${summarize(i.checks || []).fail ? `${summarize(i.checks || []).fail} check(s) to fix` : 'checks passed'}</span></li>`).join('');
  const html = `<div style="margin:0 auto;max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#101828">
<h2 style="font-size:20px;margin:0 0 8px">${n} draft${n === 1 ? '' : 's'} ready for review</h2>
<p style="color:#475467;font-size:14px;margin:0 0 16px">The content engine wrote ${n === 1 ? 'an article' : 'these articles'} from your approved calendar. Nothing is published until you approve ${n === 1 ? 'it' : 'them'}.</p>
<ul style="padding-left:18px;font-size:14px;line-height:1.45">${rows}</ul>
<a href="${esc(site)}/admin/seo/content?tab=pipeline" style="display:inline-block;margin-top:12px;padding:12px 18px;background:#101828;color:#fff;text-decoration:none;border-radius:10px;font-weight:600">Review drafts</a>
</div>`;
  const r = await emailOwner(`${n} draft${n === 1 ? '' : 's'} ready for review`, html);
  if (r.ok) await db.update(schema.contentIdeas).set({ notifiedAt: new Date() }).where(inArray(schema.contentIdeas.id, waiting.map((i) => i.id)));
  return r.ok ? n : 0;
}
