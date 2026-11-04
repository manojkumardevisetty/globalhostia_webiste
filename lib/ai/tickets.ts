// Support ticket automation. Runs after the support notifier (lib/support-notify.ts checkTickets: WHMCS client-area ping,
// daily cron, admin Support page visits). For each new ticket / customer reply (ticket id + last reply stamp, claimed once
// in ai_ticket_runs):
//   1. Haiku classifies it (category, simple, sentiment, urgency, language, confidence);
//   2. Sonnet drafts a reply with read-only tools over this customer's services, domains, DNS and site health;
//   3. lib/ai/policy.ts decideTicket: auto-send (AddTicketReply, status Answered, signed "GlobalHostia Assistant") only for
//      simple how-to questions above the confidence threshold; otherwise the draft is saved as an internal note
//      (AddTicketNote) and waits in Admin > Support with a one-click "Send draft".
// Tickets are never closed. Every decision is stored with its reasons. Non-client tickets wait for the spam filter
// (lib/ai/spam.ts spamHold): flagged / closed spam is never drafted or answered.
import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { whmcs, whmcsConfigured } from '../whmcs';
import { awaitingTickets, fullTicket, plainText, supportSettings, type TicketSummary } from '../support-notify';
import { aiClient, aiSettings, budgetOk, logUsage } from './server';
import { runAgent, type AiTool } from './agent';
import { ticketSystem } from './prompts';
import { AUTO_SIGNATURE, CLASSIFY_SCHEMA, decideTicket, parseClassification, type Classification } from './policy';
import { customerTools, type CustomerCtx } from './tools/customer-core';
import { portalDeps } from './tools/customer';
import { publicTools } from './tools/public';
import type { AiSettings } from './settings-core';

const READ_CUSTOMER = customerTools.filter((t) => t.kind === 'read');
const READ_PUBLIC = publicTools.filter((t) => ['get_policies', 'get_product', 'recommend_plan', 'browse_category', 'search_site'].includes(t.name));
const whmcsTime = (s: string) => { const t = Date.parse(String(s || '').replace(' ', 'T') + 'Z'); return Number.isFinite(t) ? t : 0; };

async function claim(t: TicketSummary, activity: string): Promise<string | null> {
  const got = await db.insert(schema.aiTicketRuns).values({ ticketId: t.id, tid: t.tid, activity }).onConflictDoNothing().returning({ id: schema.aiTicketRuns.id });
  if (got.length) return got[0].id;
  // a run that crashed mid-way (pending for 10+ minutes) may be retried
  const re = await db.update(schema.aiTicketRuns).set({ updatedAt: new Date() })
    .where(and(eq(schema.aiTicketRuns.ticketId, t.id), eq(schema.aiTicketRuns.activity, activity), eq(schema.aiTicketRuns.state, 'pending'), sql`${schema.aiTicketRuns.updatedAt} < now() - interval '10 minutes'`))
    .returning({ id: schema.aiTicketRuns.id });
  return re[0]?.id || null;
}
const save = (id: string, v: Partial<typeof schema.aiTicketRuns.$inferInsert>) => db.update(schema.aiTicketRuns).set({ ...v, updatedAt: new Date() }).where(eq(schema.aiTicketRuns.id, id)).catch(() => {});

export async function classify(s: AiSettings, subject: string, text: string): Promise<Classification> {
  const c = await aiClient();
  if (!c) return parseClassification(null);
  const t0 = Date.now();
  const params: any = {
    model: s.fastModel, max_tokens: 300, thinking: { type: 'disabled' },
    system: [{ type: 'text', text: 'Classify a web-hosting support ticket for GlobalHostia. how-to = the customer asks how to do something; technical = something is broken; billing = invoices, payments, prices, refunds; abuse = spam/phishing/malware/copyright reports; cancellation = wants to cancel or downgrade; sales = pre-sales or upgrade questions; outage = several services down / server down; other = anything else. simple=true only when a short written answer fully solves it with no staff access or account change. Be conservative with confidence.', cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: text.slice(0, 6000) }],
    output_config: { format: { type: 'json_schema', schema: CLASSIFY_SCHEMA } },
  };
  try {
    let m: any;
    try { m = await c.messages.create(params, { timeout: 20_000 }); }
    catch (e: any) { if (Number(e?.status) !== 400) throw e; const { output_config: _o, ...rest } = params; rest.system = [{ type: 'text', text: params.system[0].text + ' Reply with JSON only: ' + JSON.stringify(CLASSIFY_SCHEMA.properties) }]; m = await c.messages.create(rest, { timeout: 20_000 }); }
    await logUsage({ surface: 'tickets', model: s.fastModel, subject, status: 'ok', usage: { input: m.usage?.input_tokens || 0, output: m.usage?.output_tokens || 0, cacheRead: m.usage?.cache_read_input_tokens || 0, cacheWrite: m.usage?.cache_creation_input_tokens || 0 }, ms: Date.now() - t0, detail: 'classify' }, s);
    return parseClassification((m.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join(''));
  } catch (e: any) {
    await logUsage({ surface: 'tickets', model: s.fastModel, subject, status: 'error', ms: Date.now() - t0, detail: `classify ${e?.message || e}` }, s);
    return parseClassification(null);
  }
}

async function draft(s: AiSettings, subject: string, full: any, cls: Classification): Promise<string> {
  const c = await aiClient();
  if (!c) return '';
  const cid = Number(full.userid) || 0;
  const thread = (full.replies.length ? full.replies : [{ message: full.message, name: full.name, admin: '' }]).slice(-6)
    .map((r: any) => `${r.admin ? `Staff (${r.admin})` : 'Customer'}: ${plainText(String(r.message || '')).slice(0, 2500)}`).join('\n\n');
  const ctx: CustomerCtx & Record<string, unknown> = { surface: 'tickets', scopes: cid ? ['customer', 'public'] : ['public'], readOnly: true, clientId: cid || undefined, via: 'portal', deps: portalDeps(), ip: 'tickets', convKey: subject, maxNameChecks: 0 };
  const t0 = Date.now();
  try {
    const r = await runAgent({
      client: c, model: s.chatModel, system: await ticketSystem(s), tools: [...(cid ? READ_CUSTOMER : []), ...READ_PUBLIC] as AiTool<any>[], ctx, maxTokens: 1200, effort: 'medium', thinking: true, maxIterations: 4, timeoutMs: 60_000,
      messages: [{ role: 'user', content: `Ticket #${full.tid} "${full.subject}" (department ${full.deptname || '-'}, priority ${full.priority || '-'}). Classified as ${cls.category}, language ${cls.language}.\nCustomer: ${full.name || ''}${cid ? ` (client #${cid})` : ' (guest, no account tools)'}\n\n${thread}\n\nWrite the reply to the customer's latest message.` }],
    });
    await logUsage({ surface: 'tickets', model: s.chatModel, subject, status: 'ok', usage: r.usage, ms: Date.now() - t0, tools: r.tools, detail: 'draft' }, s);
    return r.text.trim();
  } catch (e: any) {
    await logUsage({ surface: 'tickets', model: s.chatModel, subject, status: 'error', ms: Date.now() - t0, detail: `draft ${e?.message || e}` }, s);
    return '';
  }
}

export async function triageOne(s: AiSettings, t: TicketSummary, activity: string, adminUser: string) {
  const runId = await claim(t, activity).catch(() => null);
  if (!runId) return 'claimed';
  const subject = `ticket#${t.id}`;
  try {
    const full = await fullTicket(t.id);
    const replies = full.replies as any[];
    const lastMsg = replies[replies.length - 1];
    if (lastMsg && lastMsg.admin) { await save(runId, { state: 'skipped', reasons: ['last reply is from staff'] }); return 'skipped'; }
    const customerText = `Subject: ${full.subject}\n\n${plainText(String((lastMsg || full).message || ''))}`;
    const cls = await classify(s, subject, customerText);
    const text = await draft(s, subject, full, cls);
    const prior = await db.select({ n: sql<number>`count(*)::int` }).from(schema.aiTicketRuns).where(and(eq(schema.aiTicketRuns.ticketId, t.id), inArray(schema.aiTicketRuns.state, ['auto_sent'])));
    const d = decideTicket({
      cls, text: customerText, draft: text, isVip: s.tickets.vipClientIds.includes(Number(full.userid)), priorAutoReplies: Number(prior[0]?.n || 0),
      autoSendOn: s.tickets.autoSend, threshold: s.tickets.threshold, hasAdminUser: !!adminUser,
    });
    const base = { category: cls.category, sentiment: cls.sentiment, urgency: cls.urgency, language: cls.language, confidence: cls.confidence.toFixed(3), summary: cls.summary, reasons: d.reasons, draft: text };
    if (!text) { await save(runId, { ...base, state: 'error', error: 'no draft (model unavailable)' }); return 'error'; }
    if (d.action === 'auto_send') {
      await whmcs('AddTicketReply', { ticketid: t.id, message: text + AUTO_SIGNATURE(cls.language), adminusername: adminUser, status: 'Answered', markdown: false });
      await save(runId, { ...base, state: 'auto_sent', sentBy: 'assistant' });
      return 'auto_sent';
    }
    await whmcs('AddTicketNote', { ticketid: t.id, message: `AI draft (not sent) · ${cls.category} · confidence ${cls.confidence.toFixed(2)} · ${cls.sentiment} · ${cls.urgency}\nWhy not sent: ${d.reasons.join('; ')}\nSend or edit it in GlobalHostia Admin > Support.\n\n${text}`, markdown: false }).catch((e: any) => console.warn('[ai-tickets] note failed', e?.message || e));
    await save(runId, { ...base, state: 'drafted' });
    return 'drafted';
  } catch (e: any) {
    await save(runId, { state: 'error', error: String(e?.message || e).slice(0, 300) });
    return 'error';
  }
}

/** Called by checkTickets() after the notifier run. Bounded: settings.tickets.perRun tickets per call. */
export async function triageAwaiting(reason = 'notifier'): Promise<{ ran: number; results: string[] } | { skipped: string }> {
  const s = await aiSettings(true);
  if (!s.surfaces.tickets) return { skipped: 'off' };
  if (!whmcsConfigured() || !(await aiClient())) return { skipped: 'not-configured' };
  if (!(await budgetOk(s)).ok) return { skipped: 'budget' };
  const cfg = await supportSettings();
  const since = Date.now() - s.tickets.maxAgeHours * 3600_000;
  const list = (await awaitingTickets()).filter((t) => whmcsTime(t.lastreply || t.date) >= since || !whmcsTime(t.lastreply || t.date))
    .sort((a, b) => (a.lastreply || a.date).localeCompare(b.lastreply || b.date));
  const results: string[] = [];
  const until = Date.now() + (reason === 'cron' ? 200_000 : 25_000); // stay inside the caller's function time limit
  const { spamHold } = await import('./spam');
  for (const t of list) {
    if (results.filter((r) => r !== 'claimed' && r !== 'spam-hold').length >= s.tickets.perRun || Date.now() > until) break;
    const activity = t.lastreply || t.date || t.status;
    // ticket spam filter (lib/ai/spam.ts): never draft or auto-reply on spam, or on a non-client ticket not screened yet
    if (await spamHold(t, activity)) { results.push('spam-hold'); continue; }
    results.push(await triageOne(s, t, activity, cfg.adminUsername));
  }
  if (results.some((r) => r !== 'claimed')) console.log(`[ai-tickets] ${reason}: ${results.join(', ')}`);
  return { ran: results.filter((r) => r !== 'claimed' && r !== 'spam-hold').length, results };
}

/** Admin "Send draft": posts the (possibly edited) draft as the admin, status Answered. */
export async function sendDraft(runId: string, message: string, adminEmail: string) {
  const [run] = await db.select().from(schema.aiTicketRuns).where(eq(schema.aiTicketRuns.id, runId));
  if (!run) throw new Error('Draft not found');
  const cfg = await supportSettings();
  if (!cfg.adminUsername) throw new Error('Set the WHMCS admin username in Support settings first.');
  await whmcs('AddTicketReply', { ticketid: run.ticketId, message, adminusername: cfg.adminUsername, status: 'Answered', markdown: false });
  await save(run.id, { state: 'sent', sentBy: adminEmail });
  return run.ticketId;
}

export async function runsFor(ticketId: number) {
  return db.select().from(schema.aiTicketRuns).where(eq(schema.aiTicketRuns.ticketId, ticketId)).orderBy(sql`${schema.aiTicketRuns.createdAt} desc`).limit(5).catch(() => []);
}
