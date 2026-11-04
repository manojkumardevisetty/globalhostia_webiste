'use server';
// Admin → Premium domains → Seller submissions: review queue actions and the "Sell your domain" settings. Every write is
// audited. Never refunds: a rejection records the reason and emails the seller the refund policy; the owner refunds in WHMCS.
import { requireSession, audit } from '@/lib/session';
import { done, fail, str, bool } from '@/lib/admin';
import { setSetting } from '@/lib/settings';
import { whmcs } from '@/lib/whmcs';
import { normalizeSell, canMove, sellerMail, eligibility, featuredNow, SELL_KEY, SELL_CURRENCIES, SELL_CATEGORIES, txt, type Listing } from '@/lib/sell/core';
import { approvePatch, pollPayments } from '@/lib/sell/core';
import { dbStore, deps, mailClient, sellConfig, siteUrl, bust } from '@/lib/sell/store';

const BASE = '/admin/premium-domains/sellers';
const at = (id: string) => `${BASE}?id=${encodeURIComponent(id)}`;
const money = (v: string) => { const s = v.replace(/[,\s$]/g, ''); if (!s) return null; return /^\d{1,10}(\.\d{1,2})?$/.test(s) ? Number(s) : NaN; };

async function load(fd: FormData): Promise<Listing> {
  const id = str(fd, 'id');
  const l = /^[A-Za-z0-9_-]{6,40}$/.test(id) ? await dbStore.get(id) : null;
  if (!l) fail(BASE, 'Listing not found');
  return l;
}
const notify = async (l: Listing, m: ReturnType<typeof sellerMail>) => { try { await mailClient(l.clientId, m); return true; } catch { return false; } };

export async function approveListing(fd: FormData) {
  const s = await requireSession('content');
  const l = await load(fd);
  if (!canMove(l.status, 'live')) fail(at(l.id), `Cannot approve a listing that is ${l.status}`);
  if (l.status === 'in_review' && !l.paidAt && !bool(fd, 'override')) fail(at(l.id), 'The listing fee is not marked as paid. Check the invoice, or tick "approve without payment".');
  const patch = approvePatch(l, s.email);
  await dbStore.update(l.id, patch);
  const mailed = await notify(l, sellerMail('approved', l, { site: await siteUrl() }));
  await audit(s, 'approve', 'seller_listing', l.id, { domain: l.domain, ref: l.ref, listedUntil: patch.listedUntil, featured: patch.featured, mailed });
  done(at(l.id), `${l.domain} is live until ${(patch.listedUntil as Date).toISOString().slice(0, 10)}${mailed ? '; seller emailed' : '; seller email failed'}`);
}

export async function rejectListing(fd: FormData) {
  const s = await requireSession('content');
  const l = await load(fd);
  const reason = txt(str(fd, 'reason'), 600);
  if (reason.length < 5) fail(at(l.id), 'Write a short reason for the seller (at least 5 characters).');
  if (!canMove(l.status, 'rejected')) fail(at(l.id), `Cannot reject a listing that is ${l.status}`);
  await dbStore.update(l.id, { status: 'rejected', rejectReason: reason, featured: false, updatedAt: new Date() });
  const cfg = await sellConfig();
  const mailed = await notify(l, sellerMail('rejected', l, { site: await siteUrl(), reason, refund: cfg.refundPolicy }));
  await audit(s, 'reject', 'seller_listing', l.id, { domain: l.domain, ref: l.ref, reason, mailed, invoiceId: l.invoiceId, paid: !!l.paidAt });
  done(at(l.id), `${l.domain} rejected${mailed ? ', seller emailed' : ''}. Refund manually in WHMCS if your policy applies${l.invoiceId ? ` (invoice #${l.invoiceId})` : ''}.`);
}

export async function quickSeller(fd: FormData) {
  const s = await requireSession('content');
  const l = await load(fd);
  const op = str(fd, 'op');
  const now = Date.now();
  if (op === 'feature') {
    const on = !featuredNow(l, now);
    await dbStore.update(l.id, { featured: on, featuredUntil: on ? l.listedUntil ?? null : l.featuredUntil, updatedAt: new Date() });
    await audit(s, 'update', 'seller_listing', l.id, { domain: l.domain, op, featured: on });
    done(at(l.id), `${l.domain} ${on ? 'featured' : 'no longer featured'}`);
  }
  if (op === 'approve_changes' || op === 'discard_changes') {
    if (!l.pending) fail(at(l.id), 'No changes are waiting');
    const p = op === 'approve_changes' ? { description: l.pending.description ?? l.description, category: l.pending.category ?? l.category, tags: l.pending.tags ?? l.tags } : {};
    await dbStore.update(l.id, { ...p, pending: null, updatedAt: new Date() });
    await audit(s, 'update', 'seller_listing', l.id, { domain: l.domain, op });
    done(at(l.id), op === 'approve_changes' ? 'Changes published' : 'Changes discarded');
  }
  if (op === 'sold') {
    if (!canMove(l.status, 'sold')) fail(at(l.id), `Cannot mark a ${l.status} listing as sold`);
    await dbStore.update(l.id, { status: 'sold', featured: false, updatedAt: new Date() });
    await notify(l, sellerMail('sold', l, { site: await siteUrl() }));
    await audit(s, 'sold', 'seller_listing', l.id, { domain: l.domain });
    done(at(l.id), `${l.domain} marked sold`);
  }
  if (op === 'restore' || op === 'recheck') {
    const cfg = await sellConfig();
    let list: any[];
    try { const r = await whmcs('GetClientsDomains', { clientid: l.clientId, limitnum: 250 }); list = (Array.isArray(r.domains?.domain) ? r.domains.domain : r.domains?.domain ? [r.domains.domain] : []); }
    catch (e: any) { fail(at(l.id), `WHMCS: ${String(e?.message || e).slice(0, 160)}`); }
    const e = eligibility(l.domain, list, l.clientId, cfg);
    const pay = await pollPayments(await deps(s.email), { only: [l] }).catch(() => null);
    if (op === 'recheck') {
      await dbStore.update(l.id, { lastCheckAt: new Date() });
      done(at(l.id), `WHMCS: ${e.ok ? `active, expires in ${e.days ?? '?'} days` : e.code === 'expiring' ? `active but expires in ${e.days} days` : e.code === 'not_active' ? `status ${e.status}` : 'not in the seller account'}${pay?.changed ? '; payment status updated' : ''}`);
    }
    if (!e.ok && e.code !== 'expiring') fail(at(l.id), 'The domain is still not active in the seller account; it cannot be restored.');
    if (!canMove(l.status, 'live')) fail(at(l.id), `Cannot restore a ${l.status} listing`);
    const over = l.listedUntil && new Date(l.listedUntil).getTime() <= now;
    await dbStore.update(l.id, { status: over ? 'expired' : 'live', hiddenReason: '', updatedAt: new Date() });
    await audit(s, 'restore', 'seller_listing', l.id, { domain: l.domain, to: over ? 'expired' : 'live' });
    done(at(l.id), over ? `${l.domain} restored as expired (the listing year is over; the seller can renew)` : `${l.domain} is live again`);
  }
  fail(at(l.id), 'Unknown action');
}

export async function editSeller(fd: FormData) {
  const s = await requireSession('content');
  const l = await load(fd);
  const price = money(str(fd, 'price')), minOffer = money(str(fd, 'min_offer'));
  if (Number.isNaN(price) || Number.isNaN(minOffer)) fail(at(l.id), 'Price and minimum offer must be numbers');
  const currency = (SELL_CURRENCIES as readonly string[]).includes(str(fd, 'currency')) ? str(fd, 'currency') : l.currency;
  const category = (SELL_CATEGORIES as readonly string[]).includes(str(fd, 'category')) ? str(fd, 'category') : '';
  const until = str(fd, 'listed_until');
  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) fail(at(l.id), 'Listed until must be a date (YYYY-MM-DD)');
  const patch: Record<string, unknown> = {
    price: price === null ? null : price.toFixed(2), currency, minOffer: minOffer === null ? null : minOffer.toFixed(2), acceptOffers: bool(fd, 'accept_offers') || price === null,
    description: txt(str(fd, 'description'), 1200), category, tags: [...new Set(str(fd, 'tags').split(',').map((x) => txt(x, 24)).filter(Boolean))].slice(0, 5),
    adminNote: txt(str(fd, 'admin_note'), 2000), updatedAt: new Date(),
  };
  if (until) { patch.listedUntil = new Date(until + 'T23:59:59Z'); if (featuredNow(l)) patch.featuredUntil = patch.listedUntil; }
  await dbStore.update(l.id, patch);
  await audit(s, 'update', 'seller_listing', l.id, { domain: l.domain, price, currency, listedUntil: until || undefined });
  done(at(l.id), `${l.domain} saved`);
}

export async function saveSellConfig(fd: FormData) {
  const s = await requireSession('settings');
  const cfg = normalizeSell({
    enabled: bool(fd, 'enabled'), listingFeeUsd: str(fd, 'listing_fee'), featuredFeeUsd: str(fd, 'featured_fee'), listingPid: str(fd, 'listing_pid'), featuredPid: str(fd, 'featured_pid'),
    commissionPct: str(fd, 'commission_pct'), commissionMinUsd: str(fd, 'commission_min'), minExpiryDays: str(fd, 'min_expiry'), invoiceTaxed: bool(fd, 'taxed'),
    refundPolicy: str(fd, 'refund_policy'), trademarkTerms: str(fd, 'trademarks'), maxPerClient: str(fd, 'max_per_client'),
  });
  if ((cfg.listingPid && !cfg.featuredPid) || (!cfg.listingPid && cfg.featuredPid)) fail(`${BASE}#settings`, 'Set both WHMCS product IDs, or leave both empty to use the converted-fee invoice.');
  await setSetting(SELL_KEY, cfg);
  bust();
  await audit(s, 'update', 'settings', SELL_KEY, { listing: cfg.listingFeeUsd, featured: cfg.featuredFeeUsd, pids: [cfg.listingPid, cfg.featuredPid], commission: cfg.commissionPct, enabled: cfg.enabled });
  done(`${BASE}#settings`, 'Seller listing settings saved');
}

/** One-off: run the daily seller job now (payments, domain checks, listing year, reminders). */
export async function runSellerCheck() {
  const s = await requireSession('content');
  const { sellerDaily } = await import('@/lib/sell/store');
  const r: any = await sellerDaily();
  await audit(s, 'run', 'seller_listing', null, r);
  if (r?.ok === false) fail(BASE, `Check failed: ${r.error}`);
  done(BASE, r?.skipped ? 'Skipped (WHMCS not configured)' : `Checked: ${r.check.checked} listings, ${r.check.hidden} hidden, ${r.check.ended} ended, ${r.check.reminded} renewal reminders, ${r.payments.changed} payment updates`);
}
