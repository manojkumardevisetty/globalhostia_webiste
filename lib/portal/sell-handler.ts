// /account/sell* GET and POST (called from app/account/[[...slug]]/route.ts after the session, same-origin and CSRF checks).
// Every action loads the listing by id AND the signed-in client id, and re-reads the client's domains from WHMCS before
// anything that charges or publishes (create, pay, Featured, renew). Rate limited per client; every change is audited.
import 'server-only';
import type { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import * as api from './api';
import { auditClient } from './session';
import { limiter } from '../agents/http';
import { t } from './i18n';
import { whmcs } from '../whmcs';
import {
  eligibility, readSellForm, validateSell, editPatch, trademarkHits, sellerActions, linesFor, OPEN_STATUSES, canMove,
  type Listing, type SellForm, type SellErr, type FeeQuote,
} from '../sell/core';
import { createFeeInvoice, feeContext, pollPayments, SellError, type InvoiceItem } from '../sell/core';
import { deps, myListings, myListing, domainTaken, insertListing, sellConfig, missingTable, bust } from '../sell/store';
import { sellListView, sellNewView, sellDetailView, formOf, type PickDomain } from './views/sell';

type Page = (o: { title: string; sub?: string; active: 'sell'; body: string; crumbs?: { label: string; href?: string }[]; headAction?: string }) => Promise<string>;
export type SellCtx = {
  cid: number; email: string; ip: string; csrf: string; whmcsBase: string;
  F: Page; html: (body: string, status?: number) => NextResponse; go: (to: string) => NextResponse;
};

const writeLimit = limiter(30, 60 * 60_000);
const pollSeen = new Map<number, number>();
const quoteCache = new Map<number, { at: number; q: FeeQuote | null }>();

async function quoteFor(cid: number): Promise<FeeQuote | null> {
  const hit = quoteCache.get(cid);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.q;
  try {
    const d = await deps();
    const q = (await feeContext(d.call, d.cfg, cid)).quote;
    if (quoteCache.size > 2000) quoteCache.clear();
    quoteCache.set(cid, { at: Date.now(), q });
    return q;
  } catch { return null; }
}

/** Seller returning from the client area: check their open fee invoices now (at most once a minute). */
async function pollMine(cid: number, ls: Listing[]) {
  const open = ls.filter((l) => (l.status === 'awaiting_payment' && l.invoiceId) || l.featuredState === 'awaiting_payment' || l.renewState === 'awaiting_payment');
  if (!open.length || Date.now() - (pollSeen.get(cid) || 0) < 60_000) return false;
  pollSeen.set(cid, Date.now());
  try { return (await pollPayments(await deps(`client#${cid}`), { only: open })).changed > 0; } catch { return false; }
}

const SELL_TITLE = () => t('Sell domains');
const subText = () => t('List domains from your account in our premium marketplace.');

/* =========================================================== GET */
export async function sellGet(c: SellCtx, segs: string[], q: URLSearchParams): Promise<NextResponse> {
  const cfg = await sellConfig();
  const flash = q.get('ok') || q.get('err');
  const crumbs = (x?: string) => [{ label: SELL_TITLE(), href: '/account/sell' }, ...(x ? [{ label: x }] : [])];
  let ls: Listing[] = [];
  try { ls = await myListings(c.cid); } catch (e) { if (!missingTable(e)) throw e; }
  if (await pollMine(c.cid, ls)) ls = await myListings(c.cid).catch(() => ls);

  if (!segs[1]) {
    const body = sellListView({ csrf: c.csrf, listings: ls, quote: await quoteFor(c.cid), cfg, flash, enabled: cfg.enabled });
    return c.html(await c.F({ title: SELL_TITLE(), sub: subText(), active: 'sell', body }));
  }
  if (segs[1] === 'new') return newPage(c, ls, { f: { ...blankForm(), domain: q.get('domain') || '' }, preId: Number(q.get('id')) || undefined });

  const l = ls.find((x) => x.id === segs[1]);
  if (!l) return c.html(await c.F({ title: t('Not found'), active: 'sell', crumbs: crumbs(), body: `<div class="ac-card"><div class="ac-card__body"><p>${t('We could not find that listing. It may belong to a different account.')}</p><p><a class="hp-link" href="/account/sell">${t('Back to your listings')}</a></p></div></div>` }), 404);
  return c.html(await c.F({
    title: l.domain, active: 'sell', crumbs: crumbs(l.domain),
    body: sellDetailView({ csrf: c.csrf, l, quote: await quoteFor(c.cid), cfg, f: formOf(l), flash: l.status === 'in_review' && flash === 'sell_invoice' ? 'sell_paid' : flash, confirmWithdraw: q.get('withdraw') === '1' }),
  }));
}

const blankForm = (): SellForm => ({ domain: '', mode: 'price', price: '', currency: 'USD', minOffer: '', acceptOffers: true, description: '', category: '', tags: '', featured: false, terms: false });

async function newPage(c: SellCtx, mine: Listing[], o: { f: SellForm; errs?: Record<string, string | true>; preId?: number }, status = 200) {
  const cfg = await sellConfig();
  let domains: PickDomain[] = [], loadError = false;
  try {
    const list = await api.getClientsDomains(c.cid);
    const names = list.map((d: any) => String(d.domainname || '').toLowerCase()).filter(Boolean);
    const open = names.length ? await db.select({ domain: schema.sellerListings.domain, clientId: schema.sellerListings.clientId, id: schema.sellerListings.id })
      .from(schema.sellerListings).where(and(inArray(schema.sellerListings.domain, names), inArray(schema.sellerListings.status, OPEN_STATUSES))).catch(() => []) : [];
    const owner = names.length ? new Set((await db.select({ d: schema.premiumDomains.domain }).from(schema.premiumDomains).where(inArray(schema.premiumDomains.domain, names)).catch(() => [])).map((r) => r.d)) : new Set<string>();
    domains = list.map((d: any) => {
      const name = String(d.domainname || '').toLowerCase();
      const hit = open.find((x) => x.domain === name);
      const e = hit ? { ok: false as const, code: hit.clientId === c.cid ? 'listed' as const : 'taken' as const } : owner.has(name) ? { ok: false as const, code: 'taken' as const } : eligibility(name, list, c.cid, cfg);
      return { id: Number(d.id), name, status: String(d.status || ''), expires: String(d.expirydate || ''), elig: e, listingId: hit && hit.clientId === c.cid ? hit.id : undefined };
    }).sort((a: PickDomain, b: PickDomain) => Number(b.elig.ok) - Number(a.elig.ok) || a.name.localeCompare(b.name));
    if (o.preId && !o.f.domain) { const p = domains.find((d) => d.id === o.preId && d.elig.ok); if (p) o.f.domain = p.name; }
    if (!o.f.domain) { const ok = domains.filter((d) => d.elig.ok); if (ok.length === 1) o.f.domain = ok[0].name; }
  } catch { loadError = true; }
  const body = cfg.enabled
    ? sellNewView({ csrf: c.csrf, action: '/account/sell/new', f: o.f, errs: o.errs as any, quote: await quoteFor(c.cid), cfg, domains, whmcsBase: c.whmcsBase, loadError })
    : `<div class="ac-alert ac-alert--warn" role="status"><span>${t('Listing domains for sale is paused right now. Please check back soon.')}</span></div>`;
  return c.html(await c.F({ title: t('List a domain'), active: 'sell', crumbs: [{ label: SELL_TITLE(), href: '/account/sell' }, { label: t('List a domain') }], body }), status);
}

/* =========================================================== POST */
const codeOf = (e: unknown) => (e instanceof SellError ? (e.code === 'currency' ? 'sell_currency' : e.code === 'state' ? 'sell_state' : 'sell_failed') : 'sell_failed');

export async function sellPost(c: SellCtx, segs: string[], fd: FormData): Promise<NextResponse> {
  const s = (k: string, max = 2000) => { const x = fd.get(k); return typeof x === 'string' ? x.slice(0, max) : ''; };
  const op = s('op', 20);
  const cfg = await sellConfig();
  const audit = (action: string, detail: Record<string, unknown>) => auditClient(`client_sell_${action}`, c.email, c.ip, detail);
  if (writeLimit(`c${c.cid}`)) { await audit('limited', { op }); return c.go(`/account/sell${segs[1] && segs[1] !== 'new' ? `/${encodeURIComponent(segs[1])}` : ''}?err=rate`); }

  /* ---- new listing ---- */
  if (segs[1] === 'new' && op === 'create') {
    const f = readSellForm(s);
    let mine: Listing[] = [];
    try { mine = await myListings(c.cid); } catch (e) { if (!missingTable(e)) throw e; }
    if (!cfg.enabled) return c.go('/account/sell?err=sell_off');
    const val = validateSell(f);
    if (!val.ok) return newPage(c, mine, { f, errs: val.errs }, 422);
    const v = val.v;
    let list: any[];
    try { list = await api.getClientsDomains(c.cid); } catch { return newPage(c, mine, { f, errs: { form: t('We could not check your domains right now. Please try again in a moment.') } }, 503); }
    const e = eligibility(v.domain, list, c.cid, cfg);
    if (!e.ok) { await audit('ineligible', { domain: v.domain, code: e.code }); return newPage(c, mine, { f, errs: { domain: t('This domain cannot be listed right now. See the reason next to it.') } }, 409); }
    if (await domainTaken(v.domain)) return newPage(c, mine, { f, errs: { domain: t('This domain is already listed in the marketplace.') } }, 409);
    if (mine.filter((l) => (OPEN_STATUSES as string[]).includes(l.status)).length >= cfg.maxPerClient) return c.go('/account/sell?err=sell_limit');
    const hits = trademarkHits(v.domain, cfg.trademarkTerms);
    let l: Listing;
    try {
      l = await insertListing({
        domain: v.domain, clientId: c.cid, whmcsDomainId: e.domainId, status: 'draft', price: v.price === null ? null : v.price.toFixed(2), currency: v.currency,
        minOffer: v.minOffer === null ? null : v.minOffer.toFixed(2), acceptOffers: v.acceptOffers, description: v.description, category: v.category, tags: v.tags,
        featuredState: v.featured ? 'requested' : '', flags: hits.map((h) => `trademark:${h}`), termsAt: new Date(), termsIp: c.ip.slice(0, 64),
      });
    } catch (err: any) {
      if (/unique|duplicate/i.test(String(err?.message))) return newPage(c, mine, { f, errs: { domain: t('This domain is already listed in the marketplace.') } }, 409);
      if (missingTable(err)) return newPage(c, mine, { f, errs: { form: t('Listing domains for sale is paused right now. Please check back soon.') } }, 503);
      throw err;
    }
    await audit('create', { id: l.id, ref: l.ref, domain: l.domain, price: v.price, currency: v.currency, featured: v.featured, flags: hits });
    if (s('next', 10) === 'draft') return c.go('/account/sell?ok=sell_draft');
    return invoiceAndGo(c, [{ l, kinds: linesFor(l) }], `/account/sell/${l.id}`, 'sell_invoice', audit);
  }

  /* ---- pay several drafts on one invoice ---- */
  if (!segs[1] && op === 'pay_drafts') {
    const ids = [...new Set(fd.getAll('sel').map(String).filter((x) => /^[A-Za-z0-9_-]{6,40}$/.test(x)))].slice(0, 50);
    if (!ids.length) return c.go('/account/sell?err=sell_nosel');
    if (!cfg.enabled) return c.go('/account/sell?err=sell_off');
    const ls = (await Promise.all(ids.map((id) => myListing(c.cid, id)))).filter((x): x is Listing => !!x);
    if (ls.length !== ids.length || ls.some((l) => l.status !== 'draft')) { await audit('denied', { op, ids }); return c.go('/account/sell?err=sell_state'); }
    const bad = await ineligible(c, ls);
    if (bad) return c.go(`/account/sell/${bad}?err=sell_ineligible`);
    return invoiceAndGo(c, ls.map((l) => ({ l, kinds: linesFor(l) })), '/account/sell', 'sell_invoice', audit);
  }

  /* ---- one listing ---- */
  const id = segs[1] || '';
  const l = await myListing(c.cid, id).catch(() => null);
  if (!l || segs.length !== 2) { await audit('denied', { op, id }); return c.go('/account/sell'); }
  const back = `/account/sell/${l.id}`;
  const a = sellerActions(l);

  if (op === 'edit') {
    if (!a.edit) return c.go(`${back}?err=sell_state`);
    const f = { ...readSellForm(s), domain: l.domain };
    const val = validateSell(f, { edit: true });
    if (!val.ok) return c.html(await c.F({ title: l.domain, active: 'sell', crumbs: [{ label: SELL_TITLE(), href: '/account/sell' }, { label: l.domain }], body: sellDetailView({ csrf: c.csrf, l, quote: await quoteFor(c.cid), cfg, f, errs: val.errs }) }), 422);
    const { patch, review } = editPatch(l, val.v);
    await db.update(schema.sellerListings).set({ ...(patch as any), updatedAt: new Date() }).where(and(eq(schema.sellerListings.id, l.id), eq(schema.sellerListings.clientId, c.cid)));
    if (l.status === 'live') bust();
    await audit('edit', { id: l.id, domain: l.domain, price: val.v.price, currency: val.v.currency, review });
    return c.go(`${back}?ok=${review ? 'sell_review' : 'sell_saved'}`);
  }
  if (op === 'pay') {
    if (!a.pay || !cfg.enabled) return c.go(`${back}?err=sell_state`);
    const bad = await ineligible(c, [l]);
    if (bad) return c.go(`${back}?err=sell_ineligible`);
    return invoiceAndGo(c, [{ l, kinds: linesFor(l) }], back, 'sell_invoice', audit);
  }
  if (op === 'featured') {
    if (!a.featured) return c.go(`${back}?err=sell_state`);
    if (await ineligible(c, [l])) return c.go(`${back}?err=sell_ineligible`);
    return invoiceAndGo(c, [{ l, kinds: linesFor(l, { featuredOnly: true }) }], back, 'sell_featured', audit);
  }
  if (op === 'renew') {
    if (!a.renew) return c.go(`${back}?err=sell_state`);
    if (await ineligible(c, [l])) return c.go(`${back}?err=sell_ineligible`);
    return invoiceAndGo(c, [{ l, kinds: linesFor(l, { renew: true, featured: s('featured', 2) === '1' }) }], `${back}#renew`, 'sell_renew', audit);
  }
  if (op === 'withdraw') {
    if (!a.withdraw || !canMove(l.status, 'withdrawn')) return c.go(`${back}?err=sell_state`);
    if (s('confirm', 5) !== 'yes') return c.go(`${back}?withdraw=1`);
    await db.update(schema.sellerListings).set({ status: 'withdrawn', featured: false, updatedAt: new Date() }).where(and(eq(schema.sellerListings.id, l.id), eq(schema.sellerListings.clientId, c.cid)));
    // an unpaid fee invoice that only this listing uses is cancelled (best effort); paid fees are never refunded automatically
    for (const inv of [l.status === 'awaiting_payment' ? l.invoiceId : null, l.featuredState === 'awaiting_payment' ? l.featuredInvoiceId : null, l.renewState === 'awaiting_payment' ? l.renewInvoiceId : null]) {
      if (!inv) continue;
      try {
        const shared = await db.select({ id: schema.sellerListings.id }).from(schema.sellerListings).where(and(inArray(schema.sellerListings.status, OPEN_STATUSES), eq(schema.sellerListings.invoiceId, inv)));
        const i = await api.getInvoice(c.cid, inv);
        if (i && /unpaid/i.test(String(i.status)) && !shared.some((x) => x.id !== l.id)) await whmcs('UpdateInvoice', { invoiceid: inv, status: 'Cancelled' });
      } catch (e) { console.warn('[sell] cancel invoice', inv, e instanceof Error ? e.message : e); }
    }
    if (l.status === 'live') bust();
    await audit('withdraw', { id: l.id, domain: l.domain, was: l.status });
    return c.go('/account/sell?ok=sell_withdrawn');
  }
  return c.go(back);
}

/** First listing whose domain is no longer listable (fresh WHMCS read), or null. A WHMCS error counts as not listable. */
async function ineligible(c: SellCtx, ls: Listing[]): Promise<string | null> {
  const cfg = await sellConfig();
  let list: any[];
  try { list = await api.getClientsDomains(c.cid); } catch { return ls[0]?.id || 'x'; }
  for (const l of ls) if (!eligibility(l.domain, list, c.cid, cfg).ok) { await auditClient('client_sell_ineligible', c.email, c.ip, { id: l.id, domain: l.domain }); return l.id; }
  return null;
}

async function invoiceAndGo(c: SellCtx, items: InvoiceItem[], to: string, ok: string, audit: (a: string, d: Record<string, unknown>) => Promise<void>) {
  try {
    const r = await createFeeInvoice(await deps(c.email), c.cid, items);
    await audit('invoice', { invoiceId: r.invoiceId, orderId: r.orderId, method: r.quote.method, currency: r.quote.currency, total: r.total, domains: items.map((i) => i.l.domain) });
    const [p, h] = to.split('#');
    return c.go(`${p}${p.includes('?') ? '&' : '?'}ok=${ok}${h ? '#' + h : ''}`);
  } catch (e) {
    await audit('invoice_failed', { domains: items.map((i) => i.l.domain), error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
    const [p] = to.split('#');
    return c.go(`${p}?err=${codeOf(e)}`);
  }
}
