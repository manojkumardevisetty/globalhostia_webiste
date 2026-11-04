// SEO content engine: the daily-cadence autopilot tick (server only).
// Runs from the daily cron (/api/cron/sync, 05:00 Dubai), from /api/content/tick (kicked at most every ~10 minutes by the
// WHMCS cron webhook and by page traffic: lib/content/kick.ts) and from Admin → Content engine → "Run now".
// Each tick: record posts whose publish time passed (IndexNow + fresh blog data), fill today's and tomorrow's publish slots
// with new, unrelated topics, draft the soonest ones, publish only drafts that pass every quality gate (failed ones are
// held for the owner and the slot gets a new topic), stop and email the owner when the monthly cap is reached.
import 'server-only';
import { emailOwner } from '../support-notify';
import {
  addDays, categoryOf, dailySlots, dayKey, diversityCheck, inferCategory, matchSlots, monthKey, passesGate, pickCategory, qualityScore, readTags,
  type DaySlot, type Track,
} from './core';
import {
  SYSTEM, approve, budgetGate, generateDraft, generateIdeas, notifyDrafts, recordDuePublished, reconcile, runManual, schedule, selectAutoSchedule, topicRefs,
  type CronResult,
} from './engine';
import { contentSettings, dailyState, listIdeas, patchDaily, releaseTickLock, takeTickLock, updateIdea, type DailyEvent, type Idea } from './store';

const PLANNED = ['approved', 'drafting', 'draft_ready', 'in_review', 'scheduled', 'published'];
const MIN_LEAD_MS = 20 * 60_000; // a slot closer than this is not filled any more (no time to draft)
const MAX_ATTEMPTS = 3; // tries per slot (held draft, failed draft or no topic found) before it is given up
const DRAFT_LOOKAHEAD_MS = 36 * 3600_000;

const firstProblem = (checks: { id: string; label: string; status: string; detail: string }[], min: number) => {
  const f = checks.find((c) => c.status === 'fail');
  if (f) return `${f.label}${f.detail ? `: ${f.detail}` : ''}`;
  return `quality score ${qualityScore(checks)} is below ${min} (${checks.filter((c) => c.status === 'warn').map((c) => c.label).slice(0, 3).join('; ')})`;
};

export async function runDaily(o: { deadlineMs?: number; trigger?: string; force?: boolean } = {}): Promise<CronResult> {
  const t0 = Date.now();
  const deadline = t0 + (o.deadlineMs ?? 100_000); // no new draft starts after this (a draft takes 1–2 minutes)
  const trigger = o.trigger || 'tick';
  const res: CronResult = { ok: true, drafted: [], failed: [], published: [], autoScheduled: [], autoApproved: [], notified: 0, held: [] };
  const cs = await contentSettings();
  if (!cs.enabled) return { ...res, skipped: 'disabled' };
  if (!o.force) {
    const st = await dailyState();
    if (st.lastRun && Date.now() - Date.parse(st.lastRun.at) < 8 * 60_000) return { ...res, skipped: 'recent' };
  }
  if (!(await takeTickLock(6 * 60_000, !!o.force).catch(() => false))) return { ...res, skipped: 'locked' };
  const events: DailyEvent[] = [];
  try {
    await recordDuePublished(res); // before reconcile, so every post that went live gets its IndexNow ping
    await reconcile();
    for (const id of res.published) events.push({ at: new Date().toISOString(), kind: 'published', ideaId: id });
    if (!cs.autoPublish) {
      await runManual(res, deadline);
      if (cs.notify) res.notified = await notifyDrafts().catch(() => 0);
      return res;
    }

    let gate = await budgetGate();
    if (gate) await capReached(gate, res, events);

    /* -------- 1. fill today's and tomorrow's open slots with new, unrelated topics */
    const now = Date.now();
    let planned = await listIdeas({ states: PLANNED, limit: 2000 });
    const st = await dailyState();
    const attempts = (slot: DaySlot) => [...events, ...st.events].filter((e) => (e.kind === 'held' || e.kind === 'failed' || e.kind === 'skipped') && e.slotAt === slot.at.toISOString()).length;
    if (!gate) {
      const refs = await topicRefs();
      const backlog = (await listIdeas({ states: ['idea'], limit: 300 })).filter((i) => i.track === 'uae' || i.track === 'global');
      for (const key of [dayKey(now), addDays(dayKey(now), 1)]) {
        const slots = dailySlots(key, cs);
        for (const { slot, idea } of matchSlots(slots, planned)) {
          if (idea || slot.at.getTime() < now + MIN_LEAD_MS || attempts(slot) >= MAX_ATTEMPTS) continue;
          if (Date.now() > deadline || (gate = await budgetGate())) break;
          const sameDay = planned.filter((i) => i.plannedFor && dayKey(i.plannedFor) === key).map((i) => readTags(i.rationale).category).filter(Boolean);
          const recent = refs.filter((r) => r.category).map((r) => ({ category: r.category!, at: r.at || 0 }));
          const picked = await fillSlot(slot, { enabled: cs.categories, recent, sameDay, refs, backlog, cooldownDays: cs.clusterCooldownDays, seeds: cs.seedKeywords });
          if (!picked) { events.push({ at: new Date().toISOString(), kind: 'skipped', slotAt: slot.at.toISOString(), reason: 'No new topic passed the no-repeat rules this time; retrying on the next run.' }); continue; }
          try {
            await approve(picked.id, SYSTEM, slot.at);
            res.autoApproved.push(picked.id);
            const t = readTags(picked.rationale);
            refs.unshift({ title: picked.title, primaryKeyword: picked.primaryKeyword, slug: picked.slug, category: t.category, cluster: t.cluster, at: slot.at, where: 'planned' });
            planned = [...planned, { ...picked, state: 'approved', plannedFor: slot.at }];
          } catch (e: any) { res.failed.push({ id: picked.id, error: String(e?.message || e).slice(0, 200) }); }
        }
      }
      if (gate) await capReached(gate, res, events);
    }

    /* -------- 2. draft the soonest planned topics (each draft runs every quality check and the AI review) */
    if (cs.autoDraft && !gate) {
      const due = (await listIdeas({ states: ['approved'], limit: 500 }))
        .filter((i) => !i.postId && i.plannedFor && new Date(i.plannedFor).getTime() <= Date.now() + DRAFT_LOOKAHEAD_MS)
        .sort((a, b) => new Date(a.plannedFor!).getTime() - new Date(b.plannedFor!).getTime());
      for (const i of due) {
        if (Date.now() > deadline) break;
        if ((gate = await budgetGate())) { await capReached(gate, res, events); break; }
        try {
          const out = await generateDraft(i.id, SYSTEM);
          res.drafted.push(i.id);
          if (!passesGate(out.checks, cs.minQualityScore) && i.approvedBy === SYSTEM.email) await hold(i, firstProblem(out.checks, cs.minQualityScore), res, events);
        } catch (e: any) {
          const reason = String(e?.message || e).slice(0, 200);
          res.failed.push({ id: i.id, error: reason });
          events.push({ at: new Date().toISOString(), kind: 'failed', slotAt: i.plannedFor ? new Date(i.plannedFor).toISOString() : undefined, ideaId: i.id, title: i.title, reason });
          // a slot that is about to pass gets a new topic on the next run instead of waiting for this one
          if (i.plannedFor && new Date(i.plannedFor).getTime() < Date.now() + 2 * 3600_000) await updateIdea(i.id, { state: 'idea', plannedFor: null, approvedBy: '', approvedAt: null });
        }
      }
    }

    /* -------- 3. publish drafts that pass every gate on their slot (late drafts go live now) */
    for (const i of await listIdeas({ states: ['draft_ready'], limit: 300 })) {
      if (i.plannedFor && i.postId && i.approvedBy === SYSTEM.email && !passesGate(i.checks || [], cs.minQualityScore)) await hold(i, firstProblem(i.checks || [], cs.minQualityScore), res, events);
    }
    for (const i of selectAutoSchedule(await listIdeas({ states: ['draft_ready'], limit: 300 }), true, cs.minQualityScore)) {
      const at = new Date(i.plannedFor!).getTime() > Date.now() ? new Date(i.plannedFor!) : new Date();
      try {
        const r = await schedule(i.id, at, SYSTEM);
        res.autoScheduled.push(i.id);
        events.push({ at: new Date().toISOString(), kind: r.live ? 'published' : 'scheduled', slotAt: new Date(i.plannedFor!).toISOString(), ideaId: i.id, title: i.title });
      } catch (e: any) { res.failed.push({ id: i.id, error: String(e?.message || e).slice(0, 200) }); }
    }

    if (cs.notify) res.notified = await notifyDrafts().catch(() => 0);
    return res;
  } catch (e: any) {
    res.ok = false;
    res.failed.push({ id: '', error: String(e?.message || e).slice(0, 200) });
    return res;
  } finally {
    const summary = [`${res.autoApproved.length} topics picked`, `${res.drafted.length} drafted`, `${res.autoScheduled.length} scheduled`, `${res.published.length} went live`,
      ...(res.held?.length ? [`${res.held.length} held`] : []), ...(res.failed.length ? [`${res.failed.length} failed`] : []), ...(res.budget ? ['budget cap reached'] : [])].join(', ');
    await patchDaily({ events, lastRun: { at: new Date().toISOString(), trigger, summary, ms: Date.now() - t0 } }).catch(() => {});
    await releaseTickLock();
  }
}

/** Failed a gate: keep the draft for the owner (unscheduled, off the calendar) and free the slot for a new topic. */
async function hold(i: Idea, reason: string, res: CronResult, events: DailyEvent[]) {
  if (!i.plannedFor) return;
  await updateIdea(i.id, { plannedFor: null, error: `Not auto-published: ${reason}`.slice(0, 300) });
  res.held?.push(i.id);
  events.push({ at: new Date().toISOString(), kind: 'held', slotAt: new Date(i.plannedFor).toISOString(), ideaId: i.id, title: i.title, reason: reason.slice(0, 240) });
}

async function capReached(gate: string, res: CronResult, events: DailyEvent[]) {
  res.budget = gate;
  const month = monthKey(Date.now());
  const st = await dailyState();
  if (st.capNotified === month) return;
  events.push({ at: new Date().toISOString(), kind: 'cap', reason: gate });
  const sent = await emailOwner('Content engine paused: budget reached', `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;color:#101828">
<h2 style="font-size:19px;margin:0 0 8px">The content engine stopped writing new articles</h2><p style="font-size:14px;color:#475467">${gate.replace(/</g, '&lt;')}</p>
<p style="font-size:14px;color:#475467">Articles already scheduled still go live. Raise the cap in Admin → SEO → Content engine → Settings (or the AI budget in AI assistant → Settings) to continue this month; otherwise it resumes on the 1st.</p></div>`).catch(() => ({ ok: false }));
  if (sent.ok) await patchDaily({ capNotified: month });
}

/** Pick a topic for a slot: a backlog idea of the chosen category that passes the no-repeat rules, else fresh AI ideas. */
async function fillSlot(slot: DaySlot, c: {
  enabled: string[]; recent: { category: string; at: Date | string | number }[]; sameDay: string[]; refs: Awaited<ReturnType<typeof topicRefs>>; backlog: Idea[]; cooldownDays: number; seeds: string[];
}): Promise<Idea | null> {
  const tried: string[] = [];
  for (let round = 0; round < 2; round++) {
    const cat = pickCategory({ track: slot.track, enabled: c.enabled, recent: c.recent, avoid: [...c.sameDay, ...tried], seed: `${slot.key}#${slot.index}` });
    if (!cat) return null;
    tried.push(cat);
    const passes = (i: Idea) => {
      const t = readTags(i.rationale);
      return diversityCheck({ title: i.title, primaryKeyword: i.primaryKeyword, slug: i.slug, cluster: t.cluster }, c.refs.filter((r) => r.id !== i.id), { now: slot.at, cooldownDays: c.cooldownDays }).ok;
    };
    const fromBacklog = c.backlog.filter((i) => i.track === slot.track && (readTags(i.rationale).category || inferCategory(`${i.title} ${i.primaryKeyword} ${i.target}`)) === cat && passes(i))
      .sort((a, b) => b.priority - a.priority)[0];
    if (fromBacklog) { c.backlog.splice(c.backlog.indexOf(fromBacklog), 1); return fromBacklog; }
    try {
      const r = await generateIdeas({ track: slot.track as Track, count: 5, seeds: [], by: SYSTEM, category: categoryOf(cat) });
      if (r.ids.length) {
        const fresh = (await listIdeas({ states: ['idea'], limit: 300 })).filter((i) => r.ids.includes(i.id)).sort((a, b) => b.priority - a.priority);
        if (fresh[0]) { c.backlog.push(...fresh.slice(1)); return fresh[0]; }
      }
    } catch { /* next category */ }
  }
  return null;
}

