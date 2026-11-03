// Reminders engine: one bounded, idempotent run of every switched-on flow.
//   cart     captured carts (lib/reminders/store.ts) → reminder 1 / 2 / optional 3 (promo code set by the owner), email only
//   renewal  GlobalHostia digest of services and domains due in N days (30/14/7/1 by default), link to /account/renewals
//   overdue  unpaid invoices N days after the due date (1/3/7), link to the invoice
//   domain   domains with auto-renew OFF expiring in N days, and domains in the grace period
// Rules on every send: master switch on, flow on, the customer's own email / opted-in WhatsApp number only, not
// unsubscribed, outside quiet hours in the customer's country, within the frequency caps, the cart not ordered / the
// invoice not paid (fresh WHMCS data each run), and a claimed reminders_log row (unique index) so nothing goes twice.
// Called by /api/cron/reminders (Vercel daily), the WHMCS hook's cron tick (/api/reminders/webhook) and the admin page.
import 'server-only';
import { eq, inArray, and } from 'drizzle-orm';
import { db, schema } from '../db';
import { whmcs, whmcsConfigured, getTldPricing } from '../whmcs';
import { getClientsDetails, unpaidRenewalInvoices } from '../portal/api';
import { buildRenewals } from '../portal/renewal-plan';
import { getSettings } from '../settings';
import { whmcsBase } from '../theme/data';
import { supportSettings } from '../support-notify';
import {
  KINDS, channelsFor, dueCartStage, dueStage, overdueStage, daysUntil, sendableNow, withinCaps, spacedEnough, toE164, signUnsub, signRestore, scopeOf,
  productLink, domainLink, itemKey, type ReminderConfig, type Kind, type Lang, type WaKind, type CartStage,
} from './core';
import { cartEmail, renewalEmail, overdueEmail, domainEmail, money, niceDate, relDays, cycleLabel, years, domainKind, type Currency, type CartLine, type RenewLine, type DomainLine } from './email';
import * as store from './store';
import { sendEmail, sendWhatsapp, whatsappReady, transportReady, canEmailGuests } from './send';

const arr = <T = any>(v: any): T[] => (Array.isArray(v) ? v : v ? [v] : []);
const DAY = 86400_000;
const randomId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* ------------------------------------------------------------------ shared lookups (one per run) */
type Ctx = {
  cfg: ReminderConfig; now: number; site: string; base: string; secret: string;
  currencies: Map<number, Currency>; defaultCur: number; tld: Map<number, Record<string, any>>; products: Map<number, any> | null;
  details: Map<number, any>; sent: number; budget: number; deadline: number; dry: boolean; log: string[];
};

async function makeCtx(cfg: ReminderConfig, o: { deadlineMs?: number; dry?: boolean }): Promise<Ctx> {
  const s = await getSettings().catch(() => ({} as any));
  const site = String(s.site_url && /^https:\/\//.test(s.site_url) ? s.site_url : 'https://globalhostia.com').replace(/\/$/, '');
  const currencies = new Map<number, Currency>();
  let defaultCur = 1;
  try {
    const r = await whmcs('GetCurrencies');
    for (const c of arr(r.currencies?.currency)) { currencies.set(Number(c.id), { code: String(c.code), prefix: String(c.prefix || ''), suffix: String(c.suffix || '') }); if (Number(c.default) === 1) defaultCur = Number(c.id); }
  } catch { /* amounts then show without symbols */ }
  return { cfg, now: Date.now(), site, base: whmcsBase(s), secret: store.linkSecret(), currencies, defaultCur, tld: new Map(), products: null, details: new Map(), sent: 0, budget: cfg.caps.perRun, deadline: Date.now() + (o.deadlineMs ?? 240_000), dry: !!o.dry, log: [] };
}
const curOf = (ctx: Ctx, id: unknown): Currency => ctx.currencies.get(Number(id) || ctx.defaultCur) || ctx.currencies.get(ctx.defaultCur) || { code: 'USD', prefix: '$', suffix: ' USD' };

async function details(ctx: Ctx, cid: number) {
  if (!ctx.details.has(cid)) ctx.details.set(cid, await getClientsDetails(cid).catch(() => null));
  return ctx.details.get(cid);
}
const langOf = (c: any): Lang => (/^(arabic|ar)/i.test(String(c?.language || '')) ? 'ar' : 'en');
const firstName = (c: any) => String(c?.firstname || '').trim() || String(c?.fullname || '').split(' ')[0] || '';
const phoneOf = (c: any) => toE164(c?.phonenumberformatted || c?.phonenumber, { country: c?.countrycode || c?.country, cc: c?.phonecc });

const WHY: Record<'cart' | 'account', Record<Lang, string>> = {
  cart: { en: 'You get this because you started an order at GlobalHostia.', ar: 'تصلك هذه الرسالة لأنك بدأت طلبًا لدى GlobalHostia.' },
  account: { en: 'You get this because these services are on your GlobalHostia account.', ar: 'تصلك هذه الرسالة لأن هذه الخدمات مسجلة في حسابك لدى GlobalHostia.' },
};
function footerFor(ctx: Ctx, kind: Kind, email: string, cid: number, lang: Lang) {
  const t = signUnsub({ e: email, c: cid, s: scopeOf(kind) }, ctx.secret);
  return {
    footer: { unsubUrl: `${ctx.site}/account/unsubscribe?t=${t}`, prefsUrl: `${ctx.site}/account/settings#reminders`, why: WHY[kind === 'cart' ? 'cart' : 'account'][lang] },
    unsubPost: `${ctx.site}/account/unsubscribe?t=${t}&one-click=1`,
  };
}

/** Who may get this kind of reminder right now? Returns why not, or null when allowed. */
async function gate(ctx: Ctx, o: { kind: Kind; clientId: number | null; email: string; country: unknown; prefs: store.Prefs | null }) {
  if (!o.email) return 'no-email';
  const sup = await store.suppressedScopes(o.email);
  if (store.blocks(sup, scopeOf(o.kind) === 'cart' ? 'cart' : 'renewal')) return 'unsubscribed';
  if (o.prefs && (o.kind === 'cart' ? !o.prefs.cartEmail : !o.prefs.renewalEmail)) return 'opted-out';
  if (!sendableNow(ctx.now, o.country, ctx.cfg.quiet)) return 'quiet-hours';
  const sent = await store.recentSends(o.clientId, o.email);
  if (!withinCaps(sent, ctx.now, ctx.cfg.caps) || !spacedEnough(sent, ctx.now)) return 'cap';
  if (ctx.sent >= ctx.budget) return 'run-budget';
  return null;
}

/* ------------------------------------------------------------------ cart prices (synced WHMCS prices; live WHMCS as fallback) */
async function productInfo(ctx: Ctx, pids: number[]) {
  const out = new Map<number, { name: string; prices: Map<string, number> }>();
  if (!pids.length) return out;
  const rows = await db.select({ id: schema.products.id, pid: schema.products.whmcsPid, name: schema.products.name, whmcsName: schema.products.whmcsName }).from(schema.products).where(inArray(schema.products.whmcsPid, pids)).catch(() => []);
  const prices = rows.length ? await db.select().from(schema.productPrices).where(inArray(schema.productPrices.productId, rows.map((r) => r.id))).catch(() => []) : [];
  for (const r of rows) {
    const m = new Map<string, number>();
    for (const p of prices.filter((x) => x.productId === r.id)) m.set(`${p.currency}:${p.cycle}`, Number(p.price));
    out.set(Number(r.pid), { name: r.name || r.whmcsName, prices: m });
  }
  const missing = pids.filter((p) => !out.has(p));
  if (missing.length) {
    if (!ctx.products) { ctx.products = new Map(); try { for (const p of arr((await whmcs('GetProducts')).products?.product)) ctx.products.set(Number(p.pid), p); } catch { /* names only from DB */ } }
    for (const pid of missing) {
      const p = ctx.products.get(pid); if (!p) continue;
      const m = new Map<string, number>();
      for (const [code, cyc] of Object.entries<any>(p.pricing || {})) for (const [k, v] of Object.entries<any>(cyc)) { const n = Number(v); if (/^[a-z]+$/.test(k) && !/setupfee|prefix|suffix/.test(k) && n >= 0) m.set(`${code}:${k}`, n); }
      out.set(pid, { name: String(p.name || ''), prices: m });
    }
  }
  return out;
}
async function tldPrices(ctx: Ctx, curId: number) {
  if (!ctx.tld.has(curId)) ctx.tld.set(curId, await getTldPricing(curId || undefined).then((r) => r.pricing).catch(() => ({})));
  return ctx.tld.get(curId)!;
}

/** The cart email's lines, from the snapshot + real WHMCS prices. Unknown prices stay empty (never estimated). */
export async function cartLines(ctx: Ctx, cart: { items: any; currencyId: number }, lang: Lang, promo?: string) {
  const items = cart.items as store.CartItems & { lang?: string };
  const cur = curOf(ctx, cart.currencyId);
  const info = await productInfo(ctx, items.p.map((p) => p.pid));
  const tld = items.d.length ? await tldPrices(ctx, cart.currencyId || ctx.defaultCur) : {};
  const lines: CartLine[] = [];
  let total = 0, complete = true;
  for (const p of items.p) {
    const i = info.get(p.pid);
    const amount = i?.prices.get(`${cur.code}:${p.cycle}`);
    const priced = amount !== undefined && amount >= 0;
    if (!priced || p.options) complete = false; else total += amount!;
    lines.push({ title: i?.name || `#${p.pid}`, detail: [p.domain, cycleLabel(p.cycle, lang)].filter(Boolean).join(' · '), price: priced ? money(amount!, cur) : null, link: productLink(ctx.base, p, { promo, currency: cart.currencyId || undefined }) });
  }
  for (const d of items.d) {
    const t = String(d.domain).slice(String(d.domain).indexOf('.') + 1);
    const amount = Number((tld as any)[t]?.[d.type]?.[String(d.years)]);
    const priced = Number.isFinite(amount) && amount > 0;
    if (!priced) complete = false; else total += amount;
    lines.push({ title: d.domain, detail: `${domainKind(d.type, lang)} · ${years(d.years, lang)}`, price: priced ? money(amount, cur) : null, link: domainLink(ctx.base, d, { promo }) });
  }
  return { lines, total: complete && lines.length ? money(total, cur) : null };
}

/* ------------------------------------------------------------------ cart flow */
async function orderedSince(clientId: number, since: Date) {
  // WHMCS order dates are in the WHMCS server's local time: allow 14h of slack (a false "ordered" only means no reminder)
  const r = await whmcs('GetOrders', { userid: clientId, limitnum: 10 });
  const after = since.getTime() - 14 * 3600_000;
  return arr(r.orders?.order).some((o) => Number(o.userid ?? clientId) === clientId && Date.parse(String(o.date || '').replace(' ', 'T') + 'Z') >= after);
}

async function runCarts(ctx: Ctx) {
  const c = ctx.cfg.cart;
  await store.expireCarts(c.expireDays);
  const due = await store.openCartsDue(c.first * 60_000, 200);
  const res = { checked: due.length, sent: 0, skipped: {} as Record<string, number>, failed: 0 };
  const skip = (why: string) => { res.skipped[why] = (res.skipped[why] || 0) + 1; };
  const done = await store.sentStages('cart', due.map((x) => itemKey('cart', x.id)));
  for (const cart of due) {
    if (Date.now() > ctx.deadline) { skip('deadline'); break; }
    const items = cart.items as store.CartItems & { lang?: string };
    const stage = dueCartStage({ lastActivity: cart.activityAt.getTime(), now: ctx.now, sent: (done.get(itemKey('cart', cart.id)) || []).map((x) => x.stage), cfg: ctx.cfg, items: items.p.length + items.d.length });
    if (!stage) continue;
    // recipient: a client's own account email; a guest only with the ticked box, guest capture on and SMTP
    let cid = cart.clientId || 0, client: any = null, email = '', lang: Lang = items.lang === 'ar' ? 'ar' : 'en';
    if (cid) { client = await details(ctx, cid); if (!client) { skip('client-lookup'); continue; } email = String(client.email || ''); lang = client.language ? langOf(client) : lang; }
    else {
      if (!c.guests || !canEmailGuests(ctx.cfg) || cart.consent !== 'checkbox') { skip('guest-not-allowed'); continue; }
      email = cart.email;
      try { // the guest may have become a client (ordered with this email): treat as that client
        const r = await whmcs('GetClients', { search: email, limitnum: 5 });
        const hit = arr(r.clients?.client).find((x) => String(x.email || '').toLowerCase() === email.toLowerCase());
        if (hit) { cid = Number(hit.id); client = await details(ctx, cid); }
      } catch { skip('client-lookup'); continue; }
    }
    if (cid && c.consent === 'explicit' && cart.consent !== 'checkbox') { skip('no-explicit-consent'); continue; }
    try { if (cid && await orderedSince(cid, cart.createdAt)) { await store.closeCart(cart.id, 'ordered'); skip('ordered'); continue; } }
    catch { skip('order-check-failed'); continue; } // unsure whether they ordered: do not remind
    const prefs = cid ? await store.prefsFor(cid) : null;
    const why = await gate(ctx, { kind: 'cart', clientId: cid || null, email, country: client?.countrycode || client?.country, prefs });
    if (why) { skip(why); continue; }
    if (ctx.dry) { res.sent++; continue; }
    const promo = stage === 'c3' ? c.promoCode : undefined;
    const { lines, total } = await cartLines(ctx, cart, lang, promo);
    const restore = signRestore({ id: cart.id, st: stage, exp: Math.floor(ctx.now / 1000) + 60 * 86400 }, ctx.secret);
    const f = footerFor(ctx, 'cart', email, cid, lang);
    const mail = cartEmail({ lang, name: firstName(client), copy: ctx.cfg.copy.cart[lang], lines, total, cta: `${ctx.site}/api/reminders/restore?t=${restore}`, promo, stage, footer: f.footer });
    const messageId = randomId();
    const id = await store.claim({ kind: 'cart', clientId: cid || null, email, item: itemKey('cart', cart.id), stage, channel: 'email', cycle: '', messageId, detail: { lines: lines.length, total, promo: promo || null } });
    if (!id) continue;
    const r = await sendEmail(ctx.cfg, { clientId: cid || null, to: email, subject: mail.subject, html: mail.html, text: mail.text, unsubUrl: f.footer.unsubUrl, unsubPost: f.unsubPost, lang });
    await store.finish([id], r.ok, r.error);
    if (r.ok) { res.sent++; ctx.sent++; } else res.failed++;
  }
  return res;
}

/* ------------------------------------------------------------------ account flows (renewal / overdue / domain) */
async function all(action: string, key: string, sub: string, extra: Record<string, string | number> = {}, max = 5000) {
  const out: any[] = [];
  for (let start = 0; start < max; start += 250) {
    const r = await whmcs(action, { limitstart: start, limitnum: 250, ...extra });
    const page = arr(r[key]?.[sub]);
    out.push(...page);
    const total = Number(r.totalresults || 0);
    if (page.length < 250 || out.length >= total) break;
  }
  return out;
}
const isOff = (d: any) => d.donotrenew === true || d.donotrenew === 1 || d.donotrenew === '1' || d.donotrenew === 'true';

type Plan = { renewal: RenewLine[]; renewalItems: { item: string; stage: string; cycle: string }[]; overdue: { inv: any; stage: string } | null; domain: DomainLine[]; domainItems: { item: string; stage: string; cycle: string }[]; amount: number; priced: boolean; cur: Currency };

async function runAccounts(ctx: Ctx) {
  const cfg = ctx.cfg;
  const res = { clients: 0, sent: 0, whatsapp: 0, skipped: {} as Record<string, number>, failed: 0, converted: 0 };
  const skip = (why: string, n = 1) => { res.skipped[why] = (res.skipped[why] || 0) + n; };
  const [products, domains, unpaid] = await Promise.all([
    cfg.renewal.enabled ? all('GetClientsProducts', 'products', 'product') : Promise.resolve([]),
    cfg.renewal.enabled || cfg.domain.enabled ? all('GetClientsDomains', 'domains', 'domain') : Promise.resolve([]),
    all('GetInvoices', 'invoices', 'invoice', { status: 'Unpaid' }),
  ]);
  res.converted = await conversions(ctx, products, domains, unpaid);
  const byClient = new Map<number, { p: any[]; d: any[]; i: any[] }>();
  const slot = (id: number) => { let s = byClient.get(id); if (!s) byClient.set(id, (s = { p: [], d: [], i: [] })); return s; };
  for (const p of products) if (Number(p.clientid) > 0) slot(Number(p.clientid)).p.push(p);
  for (const d of domains) if (Number(d.userid) > 0) slot(Number(d.userid)).d.push(d);
  for (const i of unpaid) if (Number(i.userid) > 0) slot(Number(i.userid)).i.push(i);

  // which stages are already done for this cycle
  const svcItems = products.map((p) => itemKey('svc', p.id)), domItems = domains.map((d) => itemKey('dom', d.id)), invItems = unpaid.map((i) => itemKey('inv', i.id));
  const [doneR, doneD, doneO] = await Promise.all([store.sentStages('renewal', [...svcItems, ...domItems]), store.sentStages('domain', domItems), store.sentStages('overdue', invItems)]);
  const stagesOf = (m: Map<string, { stage: string; cycle: string }[]>, item: string, cycle: string) => (m.get(item) || []).filter((x) => x.cycle === cycle).map((x) => x.stage);
  const tz = cfg.quiet.tz;

  const ids = [...byClient.keys()].sort((a, b) => a - b);
  const prefs = await store.prefsMany(ids);
  for (const cid of ids) {
    if (Date.now() > ctx.deadline) { skip('deadline'); break; }
    if (ctx.sent >= ctx.budget) { skip('run-budget'); break; }
    const s = byClient.get(cid)!;
    // ---- plan (pure, from WHMCS data)
    const overdue = cfg.overdue.enabled ? s.i.map((inv) => {
      const past = daysUntil(inv.duedate, ctx.now, tz);
      const cycle = String(inv.duedate).slice(0, 10);
      return { inv, stage: past === null ? null : overdueStage(-past, cfg.overdue.days, stagesOf(doneO, itemKey('inv', inv.id), cycle)) };
    }).filter((x) => x.stage).sort((a, b) => String(a.inv.duedate).localeCompare(String(b.inv.duedate)))[0] : undefined;
    const renewalCands: { row: any; stage: string; cycle: string; item: string; days: number }[] = [];
    if (cfg.renewal.enabled) {
      for (const r of buildRenewals(s.p, s.d, { now: ctx.now })) {
        if (r.kind === 'domain' && cfg.domain.enabled && r.autoRenew === false) continue; // at-risk domains get the domain warning instead
        const days = daysUntil(r.date, ctx.now, tz);
        const item = itemKey(r.kind === 'service' ? 'svc' : 'dom', r.id);
        const stage = dueStage(days, cfg.renewal.days, stagesOf(doneR, item, r.date), 'd');
        if (stage && days !== null) renewalCands.push({ row: r, stage, cycle: r.date, item, days });
      }
    }
    const domainCands: { d: any; stage: string; cycle: string; item: string; days: number; grace: boolean }[] = [];
    if (cfg.domain.enabled) {
      for (const d of s.d) {
        const st = String(d.status || '');
        const date = /^\d{4}-\d{2}-\d{2}/.test(String(d.expirydate || '')) && !/^0000/.test(String(d.expirydate)) ? String(d.expirydate).slice(0, 10) : String(d.nextduedate || '').slice(0, 10);
        const days = daysUntil(date, ctx.now, tz);
        if (days === null) continue;
        const item = itemKey('dom', d.id), done = stagesOf(doneD, item, date);
        if (/^active$/i.test(st) && isOff(d) && days >= 0) {
          const stage = dueStage(days, cfg.domain.days, done, 'x');
          if (stage) domainCands.push({ d, stage, cycle: date, item, days, grace: false });
        } else if (cfg.domain.grace && (/^(grace|redemption)$/i.test(st) || (/^active$/i.test(st) && days < 0)) && days >= -40 && !done.includes('grace')) {
          domainCands.push({ d, stage: 'grace', cycle: date, item, days, grace: true });
        }
      }
    }
    if (!overdue && !renewalCands.length && !domainCands.length) continue;
    res.clients++;
    const client = await details(ctx, cid);
    if (!client || !client.email) { skip('client-lookup'); continue; }
    if (/^(closed|inactive)$/i.test(String(client.status || ''))) { skip('client-inactive'); continue; }
    const email = String(client.email), lang = langOf(client), name = firstName(client), cur = curOf(ctx, client.currency), country = client.countrycode || client.country;
    const pf = prefs.get(cid) || { ...store.DEFAULT_PREFS };
    const phone = pf.whatsapp ? phoneOf(client) : null;

    // one message per kind per run, most urgent first; each passes the gate (caps count every message)
    if (overdue) await deliver(ctx, res, { kind: 'overdue', cid, email, lang, country, pf, phone, items: [{ item: itemKey('inv', overdue.inv.id), stage: overdue.stage!, cycle: String(overdue.inv.duedate).slice(0, 10) }], build: async () => {
      const inv = overdue.inv; const days = -(daysUntil(inv.duedate, ctx.now, tz) || 0);
      const full = await whmcs('GetInvoice', { invoiceid: inv.id }).catch(() => null);
      if (full && !/unpaid/i.test(String(full.status || ''))) return null; // paid meanwhile: stop
      const ic = curOf(ctx, client.currency);
      const amount = Number(full?.balance ?? inv.balance ?? inv.total);
      const totalTxt = Number.isFinite(amount) ? money(amount, ic) : `${inv.total} ${inv.currencycode || ''}`.trim();
      const f = footerFor(ctx, 'overdue', email, cid, lang);
      const m = overdueEmail({ lang, name, copy: cfg.copy.overdue[lang], footer: f.footer, items: arr(full?.items?.item).map((x) => String(x.description || '').split('\n')[0]).filter(Boolean),
        invoice: { num: String(inv.invoicenum || inv.id), date: niceDate(String(inv.date), lang), due: niceDate(String(inv.duedate), lang), days, total: totalTxt, url: `${ctx.site}/account/invoices/${inv.id}` } });
      return { mail: m, f, wa: [name || '-', String(inv.invoicenum || inv.id), totalTxt, niceDate(String(inv.duedate), lang), `${ctx.site}/account/invoices/${inv.id}`], detail: { invoice: Number(inv.id), total: totalTxt } };
    } });
    if (domainCands.length) await deliver(ctx, res, { kind: 'domain', cid, email, lang, country, pf, phone, items: domainCands.map((x) => ({ item: x.item, stage: x.stage, cycle: x.cycle })), build: async () => {
      const tld = await tldPrices(ctx, Number(client.currency) || ctx.defaultCur);
      const lines: DomainLine[] = domainCands.sort((a, b) => a.days - b.days).map((x) => {
        const own = Number(x.d.recurringamount), t = String(x.d.domainname).toLowerCase().split('.').slice(1).join('.');
        const amt = own > 0 ? own : Number((tld as any)[t]?.renew?.[String(Number(x.d.regperiod) || 1)]);
        return { domain: String(x.d.domainname).toLowerCase(), date: niceDate(x.cycle, lang), rel: relDays(x.days, lang, 'expires'), price: amt > 0 ? money(amt, cur) : null, grace: x.grace, url: `${ctx.site}/account/domains/${x.d.id}` };
      });
      const f = footerFor(ctx, 'domain', email, cid, lang);
      const m = domainEmail({ lang, name, copy: cfg.copy.domain[lang], lines, cta: `${ctx.site}/account/renewals`, footer: f.footer });
      return { mail: m, f, wa: [name || '-', lines[0].domain, lines[0].date, `${ctx.site}/account/renewals`], detail: { domains: lines.map((l) => l.domain) } };
    } });
    if (renewalCands.length) await deliver(ctx, res, { kind: 'renewal', cid, email, lang, country, pf, phone, items: renewalCands.map((x) => ({ item: x.item, stage: x.stage, cycle: x.cycle })), build: async () => {
      const inv = await unpaidRenewalInvoices(cid, s.i).catch(() => ({ services: new Map<number, number>(), domains: new Map<number, number>() }));
      const tld = renewalCands.some((x) => x.row.kind === 'domain' && x.row.amount === null) ? await tldPrices(ctx, Number(client.currency) || ctx.defaultCur) : null;
      let sum = 0, priced = true;
      const lines: RenewLine[] = renewalCands.sort((a, b) => a.days - b.days).map(({ row, days }) => {
        let amount: number | null = row.amount;
        if (amount === null && row.kind === 'domain' && tld) { const t = row.name.split('.').slice(1).join('.'); const v = Number((tld as any)[t]?.renew?.['1']); amount = v > 0 ? v : null; }
        if (amount === null) priced = false; else sum += amount;
        const invId = (row.kind === 'service' ? inv.services : inv.domains).get(row.id);
        return { title: row.name, detail: row.kind === 'service' ? [row.product, cycleLabel(String(s.p.find((p) => Number(p.id) === row.id)?.billingcycle || ''), lang)].filter(Boolean).join(' · ') : domainKind('register', lang),
          date: niceDate(row.date, lang), rel: relDays(days, lang), price: amount === null ? null : money(amount, cur), auto: row.kind === 'domain' ? row.autoRenew !== false : null,
          invoice: invId ? { num: String(invId), url: `${ctx.site}/account/invoices/${invId}` } : undefined };
      });
      const f = footerFor(ctx, 'renewal', email, cid, lang);
      const total = priced && lines.length > 1 ? money(sum, cur) : null;
      const m = renewalEmail({ lang, name, copy: cfg.copy.renewal[lang], lines, total, cta: `${ctx.site}/account/renewals`, footer: f.footer });
      const what = lines.length === 1 ? lines[0].title : lang === 'ar' ? `${lines[0].title} و${lines.length - 1} غيرها` : `${lines[0].title} and ${lines.length - 1} more`;
      return { mail: m, f, wa: [name || '-', what, lines[0].date, `${ctx.site}/account/renewals`], detail: { items: lines.map((l) => l.title), total } };
    } });
  }
  return res;
}

type Built = { mail: { subject: string; html: string; text: string }; f: { footer: { unsubUrl: string }; unsubPost: string }; wa: string[]; detail: unknown } | null;
async function deliver(ctx: Ctx, res: { sent: number; whatsapp: number; failed: number; skipped: Record<string, number> }, o: {
  kind: WaKind; cid: number; email: string; lang: Lang; country: unknown; pf: store.Prefs; phone: string | null; items: { item: string; stage: string; cycle: string }[]; build: () => Promise<Built>;
}) {
  const skip = (why: string) => { res.skipped[why] = (res.skipped[why] || 0) + 1; };
  const why = await gate(ctx, { kind: o.kind, clientId: o.cid, email: o.email, country: o.country, prefs: o.pf });
  if (why) { skip(why); return; }
  if (ctx.dry) { res.sent++; return; }
  const built = await o.build();
  if (!built) { skip('resolved'); return; }
  const ch = channelsFor(ctx.cfg, o.kind);
  const messageId = randomId();
  if (ch.email) {
    const ids = (await Promise.all(o.items.map((x) => store.claim({ kind: o.kind, clientId: o.cid, email: o.email, item: x.item, stage: x.stage, channel: 'email', cycle: x.cycle, messageId, detail: built.detail })))).filter(Boolean) as string[];
    if (ids.length) {
      const r = await sendEmail(ctx.cfg, { clientId: o.cid, to: o.email, subject: built.mail.subject, html: built.mail.html, text: built.mail.text, unsubUrl: built.f.footer.unsubUrl, unsubPost: built.f.unsubPost, lang: o.lang });
      await store.finish(ids, r.ok, r.error);
      if (r.ok) { res.sent++; ctx.sent++; } else res.failed++;
    }
  }
  // WhatsApp: opted in, a valid E.164 number from the client profile, flow channel on, template + credentials set
  if (ch.whatsapp && o.pf.whatsapp && o.phone && await whatsappReady(ctx.cfg, o.kind)) {
    const ids = (await Promise.all(o.items.map((x) => store.claim({ kind: o.kind, clientId: o.cid, email: o.email, item: x.item, stage: x.stage, channel: 'whatsapp', cycle: x.cycle, messageId, detail: built.detail })))).filter(Boolean) as string[];
    if (ids.length) {
      const r = await sendWhatsapp(ctx.cfg, o.kind, o.phone, o.lang, built.wa);
      await store.finish(ids, r.ok, r.ok ? '' : r.error);
      if (r.ok) res.whatsapp++; else res.failed++;
    }
  }
}

/** Mark reminders as converted: the service/domain renewed (due date moved past the reminded cycle), the invoice paid. */
async function conversions(ctx: Ctx, products: any[], domains: any[], unpaid: any[]) {
  const rows = await store.unconverted(['renewal', 'domain', 'overdue']);
  let n = 0, lookups = 0;
  const svc = new Map(products.map((p) => [itemKey('svc', p.id), String(p.nextduedate || '').slice(0, 10)]));
  const dom = new Map(domains.map((d) => [itemKey('dom', d.id), String(d.expirydate && !/^0000/.test(String(d.expirydate)) ? d.expirydate : d.nextduedate || '').slice(0, 10)]));
  const open = new Set(unpaid.map((i) => itemKey('inv', i.id)));
  for (const r of rows) {
    let done = false;
    if (r.item.startsWith('svc:') && svc.has(r.item)) done = svc.get(r.item)! > r.cycle;
    else if (r.item.startsWith('dom:') && dom.has(r.item)) done = dom.get(r.item)! > r.cycle;
    else if (r.item.startsWith('inv:') && !open.has(r.item) && lookups < 30) {
      lookups++;
      const inv = await whmcs('GetInvoice', { invoiceid: Number(r.item.slice(4)) }).catch(() => null);
      done = !!inv && /^paid$/i.test(String(inv.status || ''));
    }
    if (done) { await store.markConverted(r.kind, r.item, r.cycle); n++; }
  }
  return n;
}

/* ------------------------------------------------------------------ entry points */
export type RunResult = { ok: boolean; skipped?: string; cart?: unknown; accounts?: unknown; error?: string; ms?: number };

export async function runReminders(reason = 'manual', o: { deadlineMs?: number; dry?: boolean } = {}): Promise<RunResult> {
  const t0 = Date.now();
  let cfg: ReminderConfig;
  try { cfg = await store.loadConfig(); } catch (e: any) { return { ok: false, error: `config: ${e?.message || e}` }; }
  if (!cfg.enabled) return { ok: true, skipped: 'disabled' };
  if (!whmcsConfigured()) return { ok: false, skipped: 'whmcs-not-configured' };
  if (!transportReady(cfg)) return { ok: false, skipped: `transport-not-ready:${cfg.transport}` };
  if (!(await store.acquire().catch(() => false))) return { ok: true, skipped: 'busy' };
  const out: RunResult = { ok: true };
  try {
    const ctx = await makeCtx(cfg, o);
    if (cfg.cart.enabled) out.cart = await runCarts(ctx).catch((e: any) => { out.ok = false; return { error: String(e?.message || e) }; });
    if (cfg.renewal.enabled || cfg.overdue.enabled || cfg.domain.enabled) out.accounts = await runAccounts(ctx).catch((e: any) => { out.ok = false; return { error: String(e?.message || e) }; });
  } finally {
    await store.release();
  }
  out.ms = Date.now() - t0;
  if (!o.dry) await store.patchState({ lastRun: new Date().toISOString(), lastResult: { reason, ...out } });
  return out;
}

/** Webhook: WHMCS says an invoice was paid → mark overdue + renewal reminders for its items converted (no more nudges). */
export async function invoicePaid(invoiceId: number) {
  await store.markConverted('overdue', itemKey('inv', invoiceId));
  const inv = await whmcs('GetInvoice', { invoiceid: invoiceId }).catch(() => null);
  for (const it of arr(inv?.items?.item)) {
    const rel = Number(it.relid); if (!rel) continue;
    if (/^hosting$/i.test(String(it.type))) await store.markConverted('renewal', itemKey('svc', rel));
    if (/^domain/i.test(String(it.type))) { await store.markConverted('renewal', itemKey('dom', rel)); await store.markConverted('domain', itemKey('dom', rel)); }
  }
}

/* ------------------------------------------------------------------ admin: preview + test send */
// Previews use real catalog data (synced WHMCS products and TLD prices) and, for account reminders, the owner's own
// WHMCS client when it has services; dates for the example rows are computed from today. The admin page labels them.
export async function previewData(kind: Kind, lang: Lang, cfg?: ReminderConfig) {
  cfg = cfg || await store.loadConfig();
  const ctx = await makeCtx(cfg, {});
  const owner = (await supportSettings().catch(() => ({ clientId: 1 }))).clientId;
  const client = await details(ctx, owner);
  const name = firstName(client) || (lang === 'ar' ? 'منوج' : 'Manoj');
  const email = String(client?.email || 'support@globalhostia.com');
  const f = footerFor(ctx, kind, email, owner, lang);
  const cur = curOf(ctx, client?.currency);
  const catalog = await db.select({ pid: schema.products.whmcsPid, name: schema.products.name, id: schema.products.id }).from(schema.products)
    .where(and(eq(schema.products.status, 'PUBLISHED'))).limit(40).catch(() => []);
  const priced = (await Promise.all(catalog.filter((p) => p.pid).map(async (p) => ({ p, pr: await db.select().from(schema.productPrices).where(and(eq(schema.productPrices.productId, p.id), eq(schema.productPrices.currency, cur.code))).catch(() => []) }))))
    .filter((x) => x.pr.some((r) => Number(r.price) > 0));
  const day = (n: number) => new Date(ctx.now + n * DAY).toISOString().slice(0, 10);
  if (kind === 'cart') {
    const pick = priced.slice(0, 2).map((x) => { const r = x.pr.find((y) => y.cycle === 'annually' && Number(y.price) > 0) || x.pr.find((y) => Number(y.price) > 0)!; return { pid: Number(x.p.pid), cycle: r.cycle, domain: '', options: false }; });
    const items = { p: pick, d: [{ domain: 'yourbrand.com', type: 'register' as const, years: 1 }] };
    const { lines, total } = await cartLines(ctx, { items, currencyId: Number(client?.currency) || ctx.defaultCur }, lang, cfg.cart.promoCode || undefined);
    return cartEmail({ lang, name, copy: cfg.copy.cart[lang], lines, total, cta: `${ctx.site}/api/reminders/restore?t=preview`, promo: cfg.cart.thirdEnabled && cfg.cart.promoCode ? cfg.cart.promoCode : undefined, stage: 'c2', footer: f.footer });
  }
  if (kind === 'renewal') {
    const rows = client ? buildRenewals(await whmcs('GetClientsProducts', { clientid: owner, limitnum: 250 }).then((r) => arr(r.products?.product)).catch(() => []), [], { now: ctx.now }).filter((r) => r.days >= 0).slice(0, 3) : [];
    const lines: RenewLine[] = rows.length ? rows.map((r) => ({ title: r.name, detail: r.product, date: niceDate(r.date, lang), rel: relDays(r.days, lang), price: r.amount === null ? null : money(r.amount, cur), auto: null }))
      : priced.slice(0, 2).map((x, i) => { const r = x.pr.find((y) => Number(y.price) > 0)!; return { title: x.p.name, detail: cycleLabel(r.cycle, lang), date: niceDate(day(14 + i * 7), lang), rel: relDays(14 + i * 7, lang), price: money(Number(r.price), cur), auto: null }; });
    const tl = await tldPrices(ctx, Number(client?.currency) || ctx.defaultCur);
    const com = Number((tl as any).com?.renew?.['1']);
    if (com > 0) lines.push({ title: 'yourbrand.com', detail: domainKind('register', lang), date: niceDate(day(30), lang), rel: relDays(30, lang), price: money(com, cur), auto: true });
    return renewalEmail({ lang, name, copy: cfg.copy.renewal[lang], lines, total: null, cta: `${ctx.site}/account/renewals`, footer: f.footer });
  }
  if (kind === 'overdue') {
    const inv = client ? arr((await whmcs('GetInvoices', { userid: owner, status: 'Unpaid', limitnum: 5 }).catch(() => ({}))).invoices?.invoice)[0] : null;
    const p0 = priced[0];
    const amount = inv ? Number(inv.total) : Number(p0?.pr.find((y) => Number(y.price) > 0)?.price || 0);
    return overdueEmail({ lang, name, copy: cfg.copy.overdue[lang], footer: f.footer, items: inv ? [] : p0 ? [p0.p.name] : [],
      invoice: { num: String(inv?.invoicenum || inv?.id || '10482'), date: niceDate(String(inv?.date || day(-10)), lang), due: niceDate(String(inv?.duedate || day(-3)), lang), days: inv ? Math.max(1, -(daysUntil(inv.duedate, ctx.now) || -1)) : 3, total: money(amount, cur), url: `${ctx.site}/account/invoices/${inv?.id || ''}` } });
  }
  const tl = await tldPrices(ctx, Number(client?.currency) || ctx.defaultCur);
  const com = Number((tl as any).com?.renew?.['1']);
  return domainEmail({ lang, name, copy: cfg.copy.domain[lang], cta: `${ctx.site}/account/renewals`, footer: f.footer,
    lines: [{ domain: 'yourbrand.com', date: niceDate(day(7), lang), rel: relDays(7, lang, 'expires'), price: com > 0 ? money(com, cur) : null, grace: false, url: `${ctx.site}/account/domains` }] });
}

/** Send one preview of `kind` to the owner's WHMCS client account (Support settings → notify client ID). */
export async function sendTestTo(kind: Kind, lang: Lang) {
  const cfg = await store.loadConfig();
  const ctx = await makeCtx(cfg, {});
  const owner = (await supportSettings()).clientId;
  const client = await details(ctx, owner);
  if (!client?.email) throw new Error(`WHMCS client #${owner} not found (Support → notify client ID)`);
  const m = await previewData(kind, lang, cfg);
  const f = footerFor(ctx, kind, String(client.email), owner, lang);
  const r = await sendEmail(cfg, { clientId: owner, to: String(client.email), subject: `[Test] ${m.subject}`, html: m.html, text: m.text, unsubUrl: f.footer.unsubUrl, unsubPost: f.unsubPost, lang });
  if (!r.ok) throw new Error(r.error || 'send failed');
  return { to: String(client.email), via: r.via, clientId: owner };
}
export { KINDS };
export type { CartStage };
