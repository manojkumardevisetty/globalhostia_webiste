// Pre-sales tools for the website chat (and the customer assistant). Plans, prices and links come only from the live
// catalog helpers in lib/agents/* (synced from WHMCS); domain checks use the same WHOIS path as /api/domain-check.
// Results go to the model as compact text and to the browser as UI events (plan cards, domain chips, cart items).
import 'server-only';
import { agentData, agentTlds, searchProducts, type AgentData, type AgentProduct, type AgentPrice } from '../../agents/catalog';
import { recommend, compare, cartLinkFor } from '../../agents/shop';
import { checkDomain, domainLimit, validDomain } from '../../agents/domain';
import { callTool } from '../../agents/mcp';
import { brokerConfig, catalogRate } from '../../broker';
import { ToolError, type AiTool, type ToolCtx, type UiEvent } from '../agent';

export interface ShopCtx extends ToolCtx {
  ip: string;
  currency?: string;
  country?: string;
  /** stable per conversation (hashed), for the domain-check cap */
  convKey: string;
  maxNameChecks: number;
  /** cheap-model name ideas (Haiku); returns [] on failure */
  genNames?: (brief: string, n: number) => Promise<string[]>;
  /** visitor details + transcript for create_handoff */
  handoff?: (i: { name: string; email: string; phone: string; summary: string }) => Promise<{ ticket?: string; whatsapp?: string; error?: string }>;
}

const S = (p: Record<string, unknown>, req: string[] = []) => ({ type: 'object' as const, additionalProperties: false, properties: p, ...(req.length ? { required: req } : {}) });
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown) => { const n = typeof v === 'number' ? v : typeof v === 'string' && v ? Number(v) : NaN; return Number.isFinite(n) ? n : undefined; };
const CYCLES = ['monthly', 'quarterly', 'semiannually', 'annually', 'biennially', 'triennially', 'onetime', 'free'];

async function data(ctx: ShopCtx): Promise<AgentData> { return agentData(ctx.currency || null); }

/** Price shown on a card: the requested cycle, else monthly, else the plan's headline cycle. */
function pick(p: AgentProduct, cycle?: string): AgentPrice | null {
  return (cycle && p.prices.find((x) => x.cycle === cycle)) || p.prices.find((x) => x.cycle === 'monthly') || p.prices.find((x) => x.cycle === p.from?.cycle) || p.prices[0] || null;
}
const specLine = (p: AgentProduct) => Object.entries(p.specs).filter(([k, v]) => v && k !== 'location').slice(0, 4).map(([k, v]) => ({ k, v: String(v) }));

/** One plan card. WHMCS renews at the same recurring price for the cycle, so renewal = cycle price unless the catalog says otherwise. */
export function planCard(p: AgentProduct, badge: string, why: string, cycle?: string) {
  const c = pick(p, cycle);
  return {
    slug: p.slug, name: p.name, category: p.category?.name || null, badge, why: why.slice(0, 140), specs: specLine(p), location: p.location,
    currency: p.currency, price: c?.price ?? null, setupFee: c?.setupFee || 0, cycle: c?.cycle || null, cycleLabel: c?.label || null, perMonth: c?.perMonth ?? null,
    renew: c?.price ?? null, cycles: p.prices.map((x) => ({ cycle: x.cycle, label: x.label, price: x.price, setupFee: x.setupFee })),
    cartUrl: c?.orderUrl || p.orderUrl || null, url: p.url, configurable: p.configurable,
  };
}
const brief = (p: AgentProduct) => `${p.slug} | ${p.name} | ${p.category?.name || ''} | ${Object.entries(p.specs).filter(([, v]) => v).slice(0, 5).map(([k, v]) => `${k}: ${v}`).join(', ')} | ${p.prices.map((x) => `${x.cycle} ${x.price.toFixed(2)}${x.setupFee ? `+${x.setupFee.toFixed(2)} setup` : ''}`).join('; ')} ${p.currency}`;

/* ---------------------------------------------------------------- domain helpers */
const domCache = new Map<string, { at: number; r: any }>();
const convChecks = new Map<string, { n: number; at: number }>();
const DOM_TTL = 10 * 60_000;
async function cachedCheck(domain: string, currency: string) {
  const k = `${domain}|${currency}`;
  const hit = domCache.get(k);
  if (hit && Date.now() - hit.at < DOM_TTL) return hit.r;
  const r = await checkDomain(domain, currency);
  if (r.ok) { if (domCache.size > 3000) domCache.clear(); domCache.set(k, { at: Date.now(), r }); }
  return r;
}
function spendChecks(ctx: ShopCtx, n: number) {
  const c = convChecks.get(ctx.convKey) || { n: 0, at: Date.now() };
  if (Date.now() - c.at > 6 * 3600_000) { c.n = 0; c.at = Date.now(); }
  const allow = Math.max(0, Math.min(n, ctx.maxNameChecks - c.n));
  c.n += allow; convChecks.set(ctx.convKey, c);
  if (convChecks.size > 5000) convChecks.clear();
  return allow;
}
const COUNTRY_TLD: Record<string, string> = { AE: '.ae', IN: '.in', PK: '.pk', SA: '.sa', GB: '.co.uk', UK: '.co.uk', US: '.us', QA: '.qa', OM: '.om', KW: '.kw', BH: '.bh', EG: '.eg', DE: '.de', FR: '.fr', CA: '.ca', AU: '.com.au', SG: '.sg', MY: '.my', NG: '.ng', KE: '.ke', ZA: '.co.za' };
const domainChip = (r: any) => ({ domain: r.domain, available: !!r.available, register: r.register, renew: r.renew, currency: r.currency, cartUrl: r.addToCartUrl || null });
function brokerCard(d: AgentData, domain: string): UiEvent {
  const cfg = brokerConfig(d.cat.settings);
  const rate = d.currency === 'USD' ? 1 : catalogRate(d.cat.products, d.currency);
  return { type: 'broker', domain, fee: rate === null ? cfg.feeUsd : Math.round(cfg.feeUsd * rate), currency: rate === null ? 'USD' : d.currency, url: `${d.site}/domain-broker?domain=${encodeURIComponent(domain)}` };
}

/** "my bakery in dubai" -> fallback name ideas when the cheap model is unavailable. */
export function fallbackNames(brief: string): string[] {
  const w = brief.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((x) => x.length > 2 && !['the', 'and', 'for', 'with', 'my', 'our', 'shop', 'store', 'company', 'business', 'website', 'online'].includes(x)).slice(0, 3);
  if (!w.length) return [];
  const base = w.join('');
  return [...new Set([base, `${w[0]}hub`, `get${base}`, `${base}online`, `${w[0]}hq`, `the${base}`, `${base}co`, `${w[0]}${w[1] || 'pro'}`])].map((x) => x.slice(0, 40));
}

/* ---------------------------------------------------------------- upsells */
const ADDON_FAMILIES: [string, RegExp][] = [['email', /email|mail|workspace/i], ['ssl', /ssl|certificate|security|secure/i], ['backup', /backup/i], ['seo', /seo|marketing/i], ['builder', /builder|website design|design service/i]];
export function upsellsFor(d: AgentData, have: string[]): ReturnType<typeof planCard>[] {
  const famOf = new Map(d.cat.products.map((p) => [p.slug, p.type]));
  const haveFam = new Set(have.map((s) => famOf.get(s) || ''));
  const out: ReturnType<typeof planCard>[] = [];
  for (const [fam, re] of ADDON_FAMILIES) {
    if (haveFam.has(fam)) continue;
    const pool = d.products.filter((p) => p.from && p.availability !== 'out_of_stock' && !have.includes(p.slug) && (famOf.get(p.slug) === fam || re.test(`${p.category?.name || ''} ${p.name}`)));
    const cheap = pool.sort((a, b) => (a.from!.perMonth ?? a.from!.price) - (b.from!.perMonth ?? b.from!.price))[0];
    if (cheap) out.push(planCard(cheap, 'Add-on', fam === 'email' ? 'Professional email on your domain' : fam === 'ssl' ? 'Secure checkout and the browser padlock' : fam === 'backup' ? 'Daily copies you can restore' : 'Grow your site'));
    if (out.length >= 2) break;
  }
  return out;
}

/* ---------------------------------------------------------------- tools */
export const publicTools: AiTool<ShopCtx>[] = [
  {
    name: 'recommend_plan', scope: 'public', kind: 'read',
    description: 'Pick GlobalHostia plans for a described need. The UI shows the best pick and one alternative as cards with price, renewal and Add to cart. Use after at most 2 clarifying questions.',
    input_schema: S({
      need: { type: 'string', description: 'What they want to host, in English even when the visitor writes another language, e.g. "WooCommerce shop, 2 sites, UAE customers".' },
      budget_monthly: { type: 'number', description: 'Max monthly-equivalent price in the visitor currency.' },
      location: { type: 'string' }, os: { type: 'string' }, min_ram_gb: { type: 'number' }, websites: { type: 'integer' },
      billing_cycle: { type: 'string', enum: CYCLES, description: 'Billing preference if stated.' },
    }, ['need']),
    async run(a, ctx) {
      const d = await data(ctx);
      const r = recommend(d, { need: str(a.need, 300) || 'website hosting', budget: num(a.budget_monthly), location: str(a.location, 60) || undefined, os: str(a.os, 40) || undefined, minRamGb: num(a.min_ram_gb), websites: num(a.websites), limit: 3 });
      if (!r.recommendations.length) return { text: r.note || 'No plan matched. Ask what matters most or offer browse_category.' };
      const prods = r.recommendations.map((x) => d.products.find((p) => p.slug === x.slug)!).filter(Boolean);
      const cyc = str(a.billing_cycle, 20) || undefined;
      const why = (w: string[]) => w.map((x) => x.replace(/^matches ".*" plans$/, 'Built for what you described').replace(/^closest available: .* plan$/, 'Closest plan we offer for this').replace('lowest price of these picks', 'lowest price of these options')).join(', ').replace(/^./, (c) => c.toUpperCase());
      const cards = prods.slice(0, 2).map((p, i) => planCard(p, i ? 'Alternative' : 'Best pick', why(r.recommendations[i].why) || (i ? 'Another good option' : 'Closest match to your needs'), cyc));
      return { text: `Shown to the visitor as cards (best pick first). Prices in ${d.currency}:\n${prods.map(brief).join('\n')}`, ui: [{ type: 'plans', items: cards }] };
    },
  },
  {
    name: 'browse_category', scope: 'public', kind: 'read',
    description: 'List the plans in one GlobalHostia category (slug or name from STORE CATEGORIES). Shows up to 6 product cards.',
    input_schema: S({ category: { type: 'string' }, max_price: { type: 'number' }, location: { type: 'string' } }, ['category']),
    async run(a, ctx) {
      const d = await data(ctx);
      const q = str(a.category, 80).toLowerCase();
      const c = d.categories.find((x) => x.slug === q) || d.categories.find((x) => x.name.toLowerCase() === q) || d.categories.find((x) => x.name.toLowerCase().includes(q) || x.slug.includes(q.replace(/\s+/g, '-')));
      if (!c) return { text: `No category "${q}". Categories: ${d.categories.map((x) => x.slug).join(', ')}`, isError: true };
      const items = searchProducts(d, { category: c.slug, maxPrice: num(a.max_price), location: str(a.location, 60) || undefined, limit: 6 });
      if (!items.length) return { text: `No plans in ${c.name} match.` };
      return { text: `${c.name} (${d.currency}):\n${items.map(brief).join('\n')}${c.url ? `\nPage: ${c.url}` : ''}`, ui: [{ type: 'plans', title: c.name, items: items.map((p, i) => planCard(p, i === 0 ? 'From' : '', p.tagline || '')) }] };
    },
  },
  {
    name: 'get_product', scope: 'public', kind: 'read',
    description: 'Every detail of one plan by slug: specs, features, all billing cycles with prices and setup fees.',
    input_schema: S({ slug: { type: 'string' } }, ['slug']),
    async run(a, ctx) {
      const d = await data(ctx);
      const p = d.products.find((x) => x.slug === str(a.slug, 121).toLowerCase());
      if (!p) return { text: 'Unknown slug; use recommend_plan or browse_category.', isError: true };
      return { text: `${brief(p)}\nFeatures: ${p.features.slice(0, 20).join('; ')}${p.notIncluded.length ? `\nNot included: ${p.notIncluded.join('; ')}` : ''}\nPage: ${p.url}`, ui: [{ type: 'plans', items: [planCard(p, '', p.tagline || '')] }] };
    },
  },
  {
    name: 'compare_plans', scope: 'public', kind: 'read',
    description: 'Compare 2 to 4 GlobalHostia plans by slug (specs and prices per cycle).',
    input_schema: S({ slugs: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 } }, ['slugs']),
    async run(a, ctx) {
      const slugs = (Array.isArray(a.slugs) ? a.slugs : []).map((x) => String(x).toLowerCase().trim()).filter((x) => /^[a-z0-9][a-z0-9-]{0,120}$/.test(x)).slice(0, 4);
      if (slugs.length < 2) throw new ToolError('Give 2 to 4 plan slugs.');
      const d = await data(ctx);
      const c = compare(d, slugs);
      const prods = c.plans.map((x) => d.products.find((p) => p.slug === x.slug)!).filter(Boolean);
      return { text: JSON.stringify({ currency: c.currency, specs: c.specs, prices: c.prices, missing: c.missing }).slice(0, 6000), ui: [{ type: 'plans', title: 'Comparison', items: prods.map((p) => planCard(p, '', '')) }] };
    },
  },
  {
    name: 'check_domain', scope: 'public', kind: 'read',
    description: 'Live availability and first-year + renewal price of one exact domain (e.g. mybrand.ae). If taken, the UI shows the domain broker card.',
    input_schema: S({ domain: { type: 'string' } }, ['domain']),
    async run(a, ctx) {
      const dom = validDomain(str(a.domain, 253));
      if (!dom) throw new ToolError('That is not a full domain name; ask for one like mybrand.com.');
      if (domainLimit(ctx.ip)) throw new ToolError('Too many domain checks right now; ask the visitor to wait a minute.');
      if (!spendChecks(ctx, 1)) throw new ToolError('Domain check limit for this chat reached; point the visitor to /domains-registration.');
      const d = await data(ctx);
      const r = await cachedCheck(dom, d.currency);
      if (!r.ok) return { text: r.message + (r.supportedTlds ? ` We sell: ${r.supportedTlds.slice(0, 20).join(' ')}` : ''), isError: true };
      const ui: UiEvent[] = [{ type: 'domains', items: [domainChip(r)] }];
      if (!r.available) ui.push(brokerCard(d, dom));
      return { text: r.available ? `${dom} is available: ${r.register ?? 'see checkout'} ${r.currency} first year, renews ${r.renew ?? 'see checkout'} ${r.currency}/year.` : `${dom} is taken. Broker card shown; offer suggest_domains alternatives.`, ui };
    },
  },
  {
    name: 'suggest_domains', scope: 'public', kind: 'read',
    description: 'Generate 6-10 brandable domain ideas for a business and check them in one batch on extensions we sell (.com, .ae, .net, .store, .online and the visitor country first). Only available names are shown as chips with real prices.',
    input_schema: S({ business: { type: 'string', description: 'Business name or description.' }, keywords: { type: 'array', items: { type: 'string' }, maxItems: 5 }, tlds: { type: 'array', items: { type: 'string' }, maxItems: 4 } }, ['business']),
    async run(a, ctx) {
      const d = await data(ctx);
      const sold = agentTlds(d).map((t) => t.tld);
      const want = [...(Array.isArray(a.tlds) ? a.tlds.map((t) => '.' + String(t).replace(/^\./, '').toLowerCase()) : []), '.com', '.ae', COUNTRY_TLD[ctx.country || ''] || '', '.net', '.store', '.online'].filter((t, i, l) => t && sold.includes(t) && l.indexOf(t) === i).slice(0, 4);
      if (!want.length) throw new ToolError('Domain prices are unavailable right now.');
      const brief = `${str(a.business, 200)} ${(Array.isArray(a.keywords) ? a.keywords.map((x) => str(x, 30)).join(' ') : '')}`.trim();
      let names = (await ctx.genNames?.(brief, 8).catch(() => [])) || [];
      if (names.length < 3) names = [...names, ...fallbackNames(brief)];
      names = [...new Set(names.map((n) => n.toLowerCase().replace(/\.[a-z.]+$/, '').replace(/[^a-z0-9-]/g, '')).filter((n) => n.length >= 3 && n.length <= 40 && !n.startsWith('-') && !n.endsWith('-')))].slice(0, 10);
      if (!names.length) throw new ToolError('Ask for a business name or a few keywords.');
      // first TLD for every name, then the others, until the per-chat cap
      const cands = [...want.flatMap((t, i) => names.map((n) => ({ n, t, i })))].sort((x, y) => x.i - y.i).map((x) => `${x.n}${x.t}`);
      const allow = spendChecks(ctx, Math.min(cands.length, 16));
      if (!allow) throw new ToolError('Domain check limit for this chat reached; point the visitor to /domains-registration.');
      const list = cands.slice(0, allow);
      const out: any[] = [];
      for (let i = 0; i < list.length; i += 5) {
        const part = await Promise.all(list.slice(i, i + 5).map((x) => cachedCheck(x, d.currency).catch(() => null)));
        out.push(...part.filter((r) => r && r.ok));
        if (out.filter((r) => r.available).length >= 8) break;
      }
      const avail = out.filter((r) => r.available).slice(0, 8);
      return {
        text: avail.length ? `Available (shown as chips): ${avail.map((r) => `${r.domain} ${r.register ?? '?'} ${r.currency} first year, renews ${r.renew ?? '?'}`).join('; ')}` : 'None of the ideas were available; ask for other keywords.',
        ui: avail.length ? [{ type: 'domains', title: 'Available names', items: avail.map(domainChip) }] : [],
      };
    },
  },
  {
    name: 'cart_add', scope: 'public', kind: 'read',
    description: 'Add an item to the visitor\'s chat cart: a plan (slug + billing_cycle, optional domain to use with it) or a domain registration alone (domain only). Returns the priced item and add-on suggestions from our catalog.',
    input_schema: S({ slug: { type: 'string' }, billing_cycle: { type: 'string', enum: CYCLES }, domain: { type: 'string' } }),
    async run(a, ctx) {
      const d = await data(ctx);
      const slug = str(a.slug, 121).toLowerCase();
      const dom = a.domain ? validDomain(str(a.domain, 253)) : null;
      if (a.domain && !dom) throw new ToolError('Invalid domain name.');
      if (!slug) {
        if (!dom) throw new ToolError('Give a plan slug or a domain.');
        const r = await cachedCheck(dom, d.currency);
        if (!r.ok || !r.available) throw new ToolError(r.ok ? `${dom} is not available.` : r.message);
        const item = { key: `d:${dom}`, kind: 'domain', domain: dom, label: dom, detail: 'Domain registration, 1 year', price: r.register, setupFee: 0, renew: r.renew, currency: r.currency, cartUrl: r.addToCartUrl };
        return { text: `Added ${dom} (${r.register ?? 'price at checkout'} ${r.currency}).`, ui: [{ type: 'cart_add', item }] };
      }
      const p = d.products.find((x) => x.slug === slug);
      if (!p) throw new ToolError('Unknown slug.');
      const cyc = str(a.billing_cycle, 20) || pick(p)?.cycle || 'monthly';
      const r = cartLinkFor(d, slug, cyc, dom || undefined);
      if (!r.ok) throw new ToolError(r.message);
      const item = { key: `p:${slug}:${r.billingCycle}`, kind: 'product', slug, cycle: r.billingCycle, domain: r.domain, label: r.name, detail: `${r.cycleLabel}${r.domain ? ` · ${r.domain}` : ''}`, price: r.price, setupFee: r.setupFee, renew: r.price, currency: r.currency, cartUrl: r.cartUrl, configurable: r.configurable };
      const ups = upsellsFor(d, [slug, ...((ctx.cartSlugs as string[]) || [])]);
      return {
        text: `Added ${r.name} ${r.cycleLabel} ${r.price.toFixed(2)} ${r.currency}${r.setupFee ? ` + ${r.setupFee.toFixed(2)} setup` : ''}.${ups.length ? ` Possible add-ons: ${ups.map((u) => `${u.slug} (${u.price ?? '?'} ${u.currency} ${u.cycleLabel || ''})`).join(', ')}` : ''}`,
        ui: [{ type: 'cart_add', item }, ...(ups.length ? [{ type: 'plans', title: 'Often added', items: ups.slice(0, 1) }] : [])],
      };
    },
  },
  {
    name: 'quote_bundle', scope: 'public', kind: 'read',
    description: 'Total for a bundle of a hosting plan (+cycle), a domain and optionally an email plan, from live prices.',
    input_schema: S({ hosting_slug: { type: 'string' }, billing_cycle: { type: 'string', enum: CYCLES }, domain: { type: 'string' }, email_slug: { type: 'string' } }, ['hosting_slug']),
    async run(a, ctx) {
      const d = await data(ctx);
      const lines: { label: string; price: number | null; setup: number }[] = [];
      for (const s of [str(a.hosting_slug, 121), str(a.email_slug, 121)].filter(Boolean)) {
        const p = d.products.find((x) => x.slug === s.toLowerCase());
        if (!p) throw new ToolError(`Unknown slug ${s}.`);
        const c = pick(p, str(a.billing_cycle, 20) || undefined);
        lines.push({ label: `${p.name} (${c?.label || 'see checkout'})`, price: c?.price ?? null, setup: c?.setupFee || 0 });
      }
      const dom = a.domain ? validDomain(str(a.domain, 253)) : null;
      if (dom) {
        const r = await cachedCheck(dom, d.currency).catch(() => null);
        lines.push({ label: `${dom} (1 year)`, price: r?.ok && r.available ? r.register : null, setup: 0 });
      }
      const known = lines.every((l) => l.price !== null);
      const total = lines.reduce((t, l) => t + (l.price || 0) + l.setup, 0);
      return { text: `${lines.map((l) => `${l.label}: ${l.price === null ? 'see price at checkout' : (l.price + l.setup).toFixed(2)}`).join('; ')}. Total ${known ? total.toFixed(2) : 'partly at checkout'} ${d.currency} (taxes at checkout).`, ui: [{ type: 'bundle', currency: d.currency, lines, total: known ? Math.round(total * 100) / 100 : null }] };
    },
  },
  {
    name: 'get_policies', scope: 'public', kind: 'read',
    description: 'Refund, renewal, tax/VAT and cancellation policies from the Terms & Conditions.',
    input_schema: S({ topic: { type: 'string', enum: ['all', 'refunds', 'renewal', 'taxes', 'cancellation', 'domains'] } }),
    async run(a, ctx) {
      const r: any = await callTool('get_policies', { topic: str(a.topic, 20) || 'all' }, ctx.ip, () => 0);
      return { text: String(r.content?.[0]?.text || '').slice(0, 5000) };
    },
  },
  {
    name: 'create_handoff', scope: 'public', kind: 'action',
    description: 'Hand the conversation to the GlobalHostia sales team: opens a Sales ticket with the transcript and returns a WhatsApp link. Needs the visitor\'s name and email (ask once).',
    input_schema: S({ name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, summary: { type: 'string', description: 'One or two sentences: what they need.' } }, ['name', 'email', 'summary']),
    async run(a, ctx) {
      if (!ctx.handoff) throw new ToolError('Hand-off is not available here.');
      const r = await ctx.handoff({ name: str(a.name, 80), email: str(a.email, 160), phone: str(a.phone, 30), summary: str(a.summary, 600) });
      if (r.error) throw new ToolError(r.error);
      return { text: `Done. ${r.ticket ? `Ticket #${r.ticket} opened; the team replies by email.` : ''} ${r.whatsapp ? 'WhatsApp link shown.' : ''}`, ui: [{ type: 'handoff', ticket: r.ticket || null, whatsapp: r.whatsapp || null }] };
    },
  },
];
