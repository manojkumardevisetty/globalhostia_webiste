// Server-side AI plumbing: settings, the Anthropic client (ANTHROPIC_API_KEY env only, never sent to browsers),
// usage/cost logging, budget caps, daily call caps and off-topic strikes. Missing tables (db-setup patch '030-ai' not run
// yet) never break a request: logging is skipped and counts read as zero.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { setSetting } from '../settings';
import { normalizeAi, type AiSettings } from './settings-core';
import { costUsd, budgetCheck, type TokenUsage } from './pricing';
import { redact } from './policy';
import type { AnthropicLike } from './agent';

export const AI_KEY = 'ai_settings';
/** Public mirror read by the marketing shell (only whether the chat widget loads, and the Turnstile site key). */
export const AI_PUBLIC_KEY = 'ai_chat_public';

let memo: { at: number; v: AiSettings } | null = null;
export async function aiSettings(fresh = false): Promise<AiSettings> {
  if (!fresh && memo && Date.now() - memo.at < 30_000) return memo.v;
  let raw: unknown = null;
  try { const [r] = await db.select().from(schema.settings).where(eq(schema.settings.key, AI_KEY)); raw = r?.value ?? null; } catch { /* defaults */ }
  const v = normalizeAi(raw);
  memo = { at: Date.now(), v };
  return v;
}
export async function saveAiSettings(v: AiSettings) {
  await setSetting(AI_KEY, v);
  await setSetting(AI_PUBLIC_KEY, { enabled: v.surfaces.chat, turnstile: v.chat.turnstileSiteKey || '' });
  memo = { at: Date.now(), v };
}

/* ------------------------------------------------------------------ client */
export const aiKeyPresent = () => !!process.env.ANTHROPIC_API_KEY?.trim();
let client: AnthropicLike | null = null;
let testClient: AnthropicLike | null = null;
/** Tests / local mocks: replace the client (AI_MOCK=1 uses lib/ai/mock.ts). */
export function setAiClient(c: AnthropicLike | null) { testClient = c; }
export async function aiClient(): Promise<AnthropicLike | null> {
  if (testClient) return testClient;
  if (process.env.AI_MOCK === '1' && process.env.NODE_ENV !== 'production') { const { mockClient } = await import('./mock'); return mockClient(); }
  if (!aiKeyPresent()) return null;
  // timeouts: 45s per call; the SDK retries 429/5xx/connection errors twice with backoff
  client ||= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 45_000, maxRetries: 2 }) as unknown as AnthropicLike;
  return client;
}

/* ------------------------------------------------------------------ identities */
export const hashKey = (s: string) => createHash('sha256').update(`${s}|${process.env.AUTH_SECRET || 'gh'}`).digest('hex').slice(0, 24);
export const reqIp = (req: Request) => (req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim().slice(0, 64);
export const ipSubject = (req: Request) => `ip:${hashKey(reqIp(req))}`;

/* ------------------------------------------------------------------ usage log */
const noTable = (e: any) => String(e?.code || e?.cause?.code || '') === '42P01' || /relation "ai_/.test(String(e?.message || e?.cause?.message || ''));

export interface UsageRow { surface: string; model?: string; subject: string; status: string; usage?: TokenUsage; ms?: number; tools?: string[]; detail?: string }
const memLog: { at: number; subject: string; status: string; surface: string; cost: number; calls: number }[] = [];

export async function logUsage(r: UsageRow, s?: AiSettings): Promise<number> {
  const u = r.usage || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const cost = r.model && (u.input || u.output) ? costUsd(r.model, u, (s || (await aiSettings())).prices) : 0;
  memLog.push({ at: Date.now(), subject: r.subject, status: r.status, surface: r.surface, cost, calls: u.input || u.output ? 1 : 0 });
  if (memLog.length > 5000) memLog.splice(0, 1000);
  spendMemo = null;
  await db.insert(schema.aiUsage).values({
    surface: r.surface, model: r.model || '', subject: r.subject.slice(0, 120), status: r.status,
    inputTokens: u.input, outputTokens: u.output, cacheRead: u.cacheRead, cacheWrite: u.cacheWrite, costUsd: cost.toFixed(6),
    ms: Math.round(r.ms || 0), tools: (r.tools || []).slice(0, 30), detail: redact(r.detail || '').slice(0, 500),
  }).catch((e) => { if (!noTable(e)) console.warn('[ai] usage log failed:', e?.message || e); });
  return cost;
}

/* ------------------------------------------------------------------ budget */
let spendMemo: { at: number; month: number; today: number } | null = null;
export async function spend(): Promise<{ month: number; today: number }> {
  if (spendMemo && Date.now() - spendMemo.at < 30_000) return spendMemo;
  let month = 0, today = 0;
  try {
    const [r] = await db.execute(sql`select
      coalesce(sum(cost_usd) filter (where created_at >= date_trunc('month', now())), 0)::float as month,
      coalesce(sum(cost_usd) filter (where created_at >= date_trunc('day', now())), 0)::float as today
      from ai_usage where created_at >= date_trunc('month', now())`) as any[];
    month = Number(r?.month || 0); today = Number(r?.today || 0);
  } catch {
    const now = new Date(), m0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1), d0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    for (const x of memLog) { if (x.at >= m0) month += x.cost; if (x.at >= d0) today += x.cost; }
  }
  spendMemo = { at: Date.now(), month, today };
  return spendMemo;
}
export async function budgetOk(s: AiSettings) { const sp = await spend(); return budgetCheck(sp.month, sp.today, s); }

/* ------------------------------------------------------------------ per-subject counts */
/** Paid model calls by this subject in the last 24h (rows that used tokens). */
export async function dailyCalls(subject: string): Promise<number> {
  try {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.aiUsage)
      .where(and(eq(schema.aiUsage.subject, subject), gt(schema.aiUsage.createdAt, new Date(Date.now() - 86_400_000)), sql`(input_tokens + output_tokens) > 0`));
    return Number(r?.n || 0);
  } catch { return memLog.filter((x) => x.subject === subject && x.calls && Date.now() - x.at < 86_400_000).length; }
}
/** Times of off-topic messages by this subject in the last 24h (for lib/ai/gate.ts strikeState). */
export async function strikes(subject: string): Promise<number[]> {
  const mem = memLog.filter((x) => x.subject === subject && x.status === 'offtopic' && Date.now() - x.at < 86_400_000).map((x) => x.at);
  try {
    const rows = await db.select({ t: schema.aiUsage.createdAt }).from(schema.aiUsage)
      .where(and(eq(schema.aiUsage.subject, subject), eq(schema.aiUsage.status, 'offtopic'), gt(schema.aiUsage.createdAt, new Date(Date.now() - 86_400_000)))).limit(200);
    const db_ = rows.map((r) => new Date(r.t).getTime());
    return db_.length >= mem.length ? db_ : mem;
  } catch { return mem; }
}

/** Fixed-window in-memory burst limiter (per instance). Returns seconds to wait, or 0. */
const bursts = new Map<string, { n: number; t: number }>();
export function burst(key: string, max: number, windowMs = 60_000) {
  const now = Date.now();
  if (bursts.size > 5000) for (const [k, v] of bursts) if (now - v.t > windowMs) bursts.delete(k);
  const h = bursts.get(key);
  if (!h || now - h.t > windowMs) { bursts.set(key, { n: 1, t: now }); return 0; }
  h.n++;
  return h.n > max ? Math.ceil((windowMs - (now - h.t)) / 1000) : 0;
}

export async function usageTablesExist(): Promise<boolean> {
  try { await db.execute(sql`select 1 from ai_usage limit 1`); await db.execute(sql`select 1 from ai_ticket_runs limit 1`); return true; } catch { return false; }
}
