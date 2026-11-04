// Seller listings: database access and the real dependencies for the flow in lib/sell/core.ts (WHMCS client, SendEmail, owner email,
// audit log). Server-only. Every read used by the portal is scoped to the signed-in client id.
import 'server-only';
import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { db, schema } from '../db';
import { getSettings } from '../settings';
import { whmcs, whmcsConfigured } from '../whmcs';
import { emailOwner } from '../support-notify';
import { normalizeSell, sellRef, toOwnRow, OPEN_STATUSES, SELL_KEY, sellerMail, type SellConfig, type Listing, type Mail } from './core';
import { invoicePaid as flowInvoicePaid, pollPayments, dailyCheck, type SellDeps, type SellStore } from './core';

const T = schema.sellerListings;
export const missingTable = (e: any) => /seller_listings|does not exist/i.test(String(e?.message));

export async function sellConfig(): Promise<SellConfig> {
  const s = await getSettings().catch(() => ({} as Record<string, unknown>));
  return normalizeSell((s as any)[SELL_KEY]);
}
export async function siteUrl(): Promise<string> {
  const s = await getSettings().catch(() => ({} as Record<string, unknown>));
  return String((s as any).site_url || 'https://globalhostia.com').replace(/\/$/, '');
}

const row = (r: any): Listing => ({ ...r, tags: r.tags || [], flags: r.flags || [], reminders: r.reminders || [], pending: r.pending || null });

export const dbStore: SellStore = {
  async get(id) { const [r] = await db.select().from(T).where(eq(T.id, id)); return r ? row(r) : null; },
  async update(id, patch) { await db.update(T).set(patch as any).where(eq(T.id, id)); bust(); },
  async byInvoice(inv) { return (await db.select().from(T).where(or(eq(T.invoiceId, inv), eq(T.featuredInvoiceId, inv), eq(T.renewInvoiceId, inv)))).map(row); },
  async awaitingPayment(limit) {
    return (await db.select().from(T).where(or(and(eq(T.status, 'awaiting_payment'), sql`${T.invoiceId} is not null`), eq(T.featuredState, 'awaiting_payment'), eq(T.renewState, 'awaiting_payment')))
      .orderBy(asc(T.updatedAt)).limit(limit)).map(row);
  },
  async forCheck(limit) { return (await db.select().from(T).where(inArray(T.status, ['in_review', 'live', 'expired'])).orderBy(asc(T.lastCheckAt)).limit(limit)).map(row); },
};

export function bust() { try { revalidateTag('site'); } catch { /* outside a request */ } }

const html = (m: Mail) => m.html.replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
export async function mailClient(clientId: number, m: Mail) {
  await whmcs('SendEmail', { id: clientId, customtype: 'general', customsubject: m.subject.replace(/[{}]/g, ''), custommessage: html(m) });
}
export async function audit(action: string, l: Pick<Listing, 'id' | 'domain' | 'ref'>, detail: Record<string, unknown> = {}, who = 'system') {
  await db.insert(schema.auditLogs).values({ userEmail: who, action, entity: 'seller_listing', entityId: l.id, detail: { domain: l.domain, ref: l.ref, ...detail } as any }).catch(() => {});
}

export async function deps(who = 'system'): Promise<SellDeps> {
  const [cfg, site] = await Promise.all([sellConfig(), siteUrl()]);
  return {
    call: (a, p) => whmcs(a, p as any), store: dbStore, cfg, site, mailClient,
    mailOwner: async (subject, h) => { await emailOwner(subject, h); },
    audit: (a, l, d) => audit(a, l, d, who), log: (m) => console.warn('[sell]', m),
  };
}

/* ------------------------------------------------------------------ portal reads (always scoped to the client) */
export async function myListings(clientId: number): Promise<Listing[]> {
  return (await db.select().from(T).where(eq(T.clientId, clientId)).orderBy(desc(T.updatedAt)).limit(200)).map(row);
}
export async function myListing(clientId: number, id: string): Promise<Listing | null> {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) return null;
  const [r] = await db.select().from(T).where(and(eq(T.id, id), eq(T.clientId, clientId)));
  return r ? row(r) : null;
}
/** Another open listing for the domain (any client), or an owner listing in premium_domains → the domain cannot be listed. */
export async function domainTaken(domain: string): Promise<'seller' | 'owner' | null> {
  const [s] = await db.select({ id: T.id }).from(T).where(and(eq(T.domain, domain), inArray(T.status, OPEN_STATUSES))).limit(1);
  if (s) return 'seller';
  const [p] = await db.select({ id: schema.premiumDomains.id }).from(schema.premiumDomains).where(and(eq(schema.premiumDomains.domain, domain), sql`${schema.premiumDomains.status} <> 'sold'`)).limit(1).catch(() => []);
  return p ? 'owner' : null;
}
export async function insertListing(v: Omit<typeof T.$inferInsert, 'ref'>): Promise<Listing> {
  for (let i = 0; ; i++) {
    try {
      const [r] = await db.insert(T).values({ ...v, ref: sellRef(randomBytes(6).toString('hex')) }).returning();
      return row(r);
    } catch (e: any) { if (i < 2 && /unique|duplicate/i.test(String(e?.message)) && /ref/i.test(String(e?.message))) continue; throw e; }
  }
}

/* ------------------------------------------------------------------ public marketplace rows */
/** Live seller listings as premium_domains-shaped rows (no client id, no seller details). [] when the table is missing. */
export async function liveSellerRows() {
  try {
    // live and inside the paid year (the daily check also moves ended ones to expired)
    const rows = await db.select().from(T).where(and(eq(T.status, 'live'), sql`(${T.listedUntil} is null or ${T.listedUntil} > now())`)).orderBy(desc(T.featured), asc(T.domain)).limit(2000);
    return rows.map((r) => toOwnRow(row(r)));
  } catch (e) { if (missingTable(e)) return []; throw e; }
}

/** The live seller listing for a domain (premium request → notify the seller). */
export async function liveListingFor(domain: string): Promise<Listing | null> {
  try { const [r] = await db.select().from(T).where(and(eq(T.domain, domain), eq(T.status, 'live'))).limit(1); return r ? row(r) : null; }
  catch { return null; }
}

/**
 * A buyer asked for a seller's domain (Buy now / Make an offer on /premium-domains): email the seller through WHMCS without
 * the buyer's identity. Never throws; returns the listing ref for the broker request record.
 */
export async function notifySellerOfRequest(domain: string, o: { intent: 'buy' | 'offer'; amount: string; brokerRef: string }): Promise<{ ref: string; clientId: number } | null> {
  const l = await liveListingFor(domain);
  if (!l) return null;
  try {
    const [cfg, site] = await Promise.all([sellConfig(), siteUrl()]);
    if (whmcsConfigured()) await mailClient(l.clientId, sellerMail('request', l, { site, intent: o.intent, amount: o.amount, commission: cfg.commissionPct || undefined }));
    await audit('seller_listing_request', l, { brokerRef: o.brokerRef, intent: o.intent });
  } catch (e: any) { await audit('seller_listing_request_failed', l, { brokerRef: o.brokerRef, error: String(e?.message || e).slice(0, 200) }); }
  return { ref: l.ref, clientId: l.clientId };
}

/* ------------------------------------------------------------------ jobs */
/** WebHook InvoicePaid. Never throws. */
export async function sellerInvoicePaid(invoiceId: number) {
  try { if (!whmcsConfigured()) return 0; return await flowInvoicePaid(await deps('whmcs-hook'), invoiceId); }
  catch (e: any) { if (!missingTable(e)) console.warn('[sell] invoice_paid', e?.message || e); return 0; }
}
const TICK_KEY = 'seller_tick';
/** WHMCS cron tick: payment poll at most every 15 minutes. Never throws. */
export async function sellerTick() {
  try {
    if (!whmcsConfigured()) return null;
    const [r] = await db.select().from(schema.settings).where(eq(schema.settings.key, TICK_KEY));
    if (r && Date.now() - Number(r.value) < 15 * 60_000) return null;
    await db.insert(schema.settings).values({ key: TICK_KEY, value: Date.now() as any }).onConflictDoUpdate({ target: schema.settings.key, set: { value: Date.now() as any } });
    return await pollPayments(await deps('whmcs-tick'));
  } catch (e: any) { if (!missingTable(e)) console.warn('[sell] tick', e?.message || e); return null; }
}
/** Daily cron: payment poll + domain re-check. Never throws. */
export async function sellerDaily() {
  try {
    if (!whmcsConfigured()) return { skipped: true };
    const d = await deps('cron');
    const payments = await pollPayments(d);
    const check = await dailyCheck(d);
    return { payments, check };
  } catch (e: any) { if (missingTable(e)) return { skipped: true }; return { ok: false, error: String(e?.message || e).slice(0, 200) }; }
}
