// /plan-finder: four questions → one recommended plan + two alternatives, all from the live catalog.
// Scoring runs in the browser (public/hp/pages/planfinder.js) on a JSON snapshot of real products and prices
// in the visitor's currency. Nothing is invented: unpriced products say "See price".
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { getCatalog, fromPrice, orderUrl, deriveSpecs, type TProduct } from '../data';
import { page } from '../shell';
import { pageHero, sectionHead, faq, faqJsonLd, breadcrumbJsonLd, icon, fromText, available, ld, type IconName } from '../ui';
import { trustStrip, waLink } from '../growth';
import { leadForm } from '../lead';
import { siteOf, crumbsFor } from './vps';

/** Category slug → product family used by the scorer. */
export const TYPE: Record<string, string> = {
  'hosting-usa': 'shared', 'hostia-shared': 'shared', 'hosting-singapore': 'shared',
  'wordpress-hosting': 'wp', 'cpanel-reseller': 'reseller',
  hostiavps: 'vps', 'high-performance-vps': 'vps',
  'dedicated-servers': 'dedicated', 'premiumdedicated-servers': 'dedicated',
  'windows-rdp': 'rdp', 'linux-rdp': 'rdp', 'forex-vps': 'forex', mcps: 'automation', 'ai-llm': 'ai',
};
export const TYPE_LABEL: Record<string, string> = {
  shared: 'Web hosting', wp: 'WordPress hosting', reseller: 'Reseller hosting', vps: 'VPS', dedicated: 'Dedicated server',
  rdp: 'Remote desktop (RDP)', forex: 'Forex VPS', automation: 'Automation server', ai: 'AI / LLM server',
};
export const TYPE_PAGE: Record<string, string> = {
  shared: '/web-hosting', wp: '/wordpress-hosting', reseller: '/cpanel-reseller', vps: '/vps-hosting', dedicated: '/dedicated-servers',
  rdp: '/windows-rdp', forex: '/forex-vps', automation: '/n8n-automation', ai: '/ai-llm-hosting',
};

/** Websites capacity from features ("10 Websites", "Unlimited websites"); 0 = unknown. */
function sitesCap(p: TProduct) {
  for (const f of p.features) { const m = f.replace(/^-\s*/, '').match(/(unlimited|\d+)\s*websites?/i); if (m) return /unlimited/i.test(m[1]) ? 9999 : parseInt(m[1], 10); }
  return 0;
}

type Q = { id: string; title: string; hint: string; opts: { v: string; label: string; sub?: string; ic: IconName }[] };
const QUESTIONS: Q[] = [
  { id: 'build', title: 'What are you building?', hint: 'Pick the closest match. You can change any answer later.', opts: [
    { v: 'site', label: 'A website', sub: 'Company site, portfolio, landing pages', ic: 'globe' },
    { v: 'wp', label: 'A WordPress site', sub: 'Blog or business site on WordPress', ic: 'wp' },
    { v: 'store', label: 'An online store', sub: 'WooCommerce or another shop', ic: 'store' },
    { v: 'app', label: 'An app, API or bot', sub: 'Node, Python, PHP, Docker, n8n, Telegram bots', ic: 'bot' },
    { v: 'trade', label: 'Trading or a remote desktop', sub: 'MetaTrader, EAs, Windows apps from anywhere', ic: 'monitor' },
  ] },
  { id: 'traffic', title: 'How many visits do you expect each month?', hint: 'A rough guess is fine. For a bot or remote desktop, think of how busy it will be.', opts: [
    { v: '0', label: 'Just starting', sub: 'Under 10,000 visits', ic: 'spark' },
    { v: '1', label: 'Growing', sub: '10,000 to 100,000 visits', ic: 'trend' },
    { v: '2', label: 'Busy', sub: '100,000 to 1 million visits', ic: 'activity' },
    { v: '3', label: 'Very busy', sub: 'More than 1 million visits', ic: 'rocket' },
  ] },
  { id: 'sites', title: 'How many websites or projects?', hint: 'Count every domain or app you want on the same plan.', opts: [
    { v: '1', label: 'One', sub: 'A single site or app', ic: 'box' },
    { v: '2', label: '2 to 5', sub: 'A few sites or brands', ic: 'layers' },
    { v: '6', label: '6 to 20', sub: 'Several sites', ic: 'grid' },
    { v: '21', label: 'More than 20', sub: 'Client sites, an agency', ic: 'users' },
  ] },
  { id: 'budget', title: 'What matters most on price?', hint: 'We only suggest real plans with their live price.', opts: [
    { v: 'low', label: 'Lowest cost', sub: 'The smallest plan that does the job', ic: 'tag' },
    { v: 'mid', label: 'Good balance', sub: 'Some headroom to grow', ic: 'gauge' },
    { v: 'high', label: 'Performance first', sub: 'More resources, fewer limits', ic: 'bolt' },
  ] },
];

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const { currency, base, settings: s } = cat;
  const site = siteOf(cat);
  const pool = available(cat.products.filter((p) => TYPE[p.categorySlug]));
  const data = pool.map((p) => {
    const sp = deriveSpecs(p.features, p.attributes);
    const f = fromPrice(p, currency);
    return {
      n: p.name, t: TYPE[p.categorySlug], k: p.categorySlug, u: orderUrl(p, base, f?.cycle), d: `/p/${p.slug}`,
      a: f ? +f.amount.toFixed(4) : null, p: fromText(p, currency) || '', w: sitesCap(p), l: sp.location || '', os: sp.os || '',
      sp: [sp.cpu, sp.ram, sp.storage].filter(Boolean).slice(0, 3).join(' · ') || p.tagline || '',
    };
  });
  const types = [...new Set(data.map((d) => d.t))];
  const crumbs = crumbsFor('Plan finder');
  const wa = waLink(s, 'Hello Globalhostia, I used the plan finder and would like advice on a plan.');

  const hero = pageHero({
    crumbs, eyebrow: 'Plan finder', title: 'Find the right plan in four questions',
    lead: 'Tell us what you are building and how busy it will be. We match your answers against our live plans and prices, then suggest one plan and two alternatives.',
    network: false,
  });

  const qHtml = QUESTIONS.map((q, i) => `<fieldset class="pf-q" data-q="${q.id}" id="pf-q-${q.id}">
    <legend><span class="pf-q__n num">Question ${i + 1} of ${QUESTIONS.length}</span><span class="pf-q__t">${esc(q.title)}</span></legend>
    <p class="pf-q__hint">${esc(q.hint)}</p>
    <div class="pf-opts${q.opts.length === 3 ? ' pf-opts--3' : ''}">${q.opts.map((o) => `<label class="pf-opt"><input type="radio" name="${q.id}" value="${esc(o.v)}"><span class="pf-opt__box">${icon(o.ic)}<span><b>${esc(o.label)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span><span class="pf-opt__tick" aria-hidden="true">${icon('check')}</span></span></label>`).join('')}</div>
  </fieldset>`).join('');

  const quiz = `<section class="hp-section pf-sec" id="finder" aria-labelledby="pf-h"><div class="hp-container">
    <h2 id="pf-h" class="sr-only">Plan finder questions</h2>
    <div class="pf" data-pf data-types="${esc(types.join(','))}">
      <div class="pf__main">
        <div class="pf-prog" aria-hidden="true"><span class="pf-prog__bar"></span></div>
        <form class="pf-form" data-pf-form novalidate>${qHtml}
          <div class="pf-nav"><button type="button" class="hp-btn hp-btn--ghost" data-pf-back>${icon('left')}Back</button><button type="submit" class="hp-btn hp-btn--brand" data-pf-next>See my plan${icon('arrow')}</button></div>
        </form>
        <noscript><p class="pf-noscript">The plan finder needs JavaScript. You can still <a href="/web-hosting">compare hosting</a>, <a href="/vps-hosting">VPS</a> or <a href="/dedicated-servers">dedicated servers</a>, or <a href="/contact">ask our team</a>.</p></noscript>
        <div class="pf-res" data-pf-res hidden tabindex="-1" aria-labelledby="pf-res-h">
          <div class="pf-res__head"><h2 id="pf-res-h" class="hp-hline">Our recommendation</h2><button type="button" class="hp-link" data-pf-restart>${icon('refresh')}Start over</button></div>
          <p class="pf-res__why" data-pf-why></p>
          <div class="pf-res__loc" data-pf-locwrap hidden><span id="pf-loc-l">Datacenter</span><div class="pf-chips" role="radiogroup" aria-labelledby="pf-loc-l" data-pf-locs></div></div>
          <div class="pf-cards" data-pf-cards></div>
          <p class="pf-res__note">Prices are live from our billing system in ${esc(currency)}; the renewal price is the same for each billing period. +VAT 5% where applicable. You can change the billing period and add-ons in the order form.</p>
          ${leadForm({ source: 'plan-finder', page: '/plan-finder', cls: 'pf-lead gh-lead--wide', title: 'Email me this recommendation', text: 'Get these plans and a short note from our team in your inbox, to compare later or share.', cta: 'Email me the plans', level: 3, interestFrom: 'plan-finder', consent: 'Email me this recommendation and occasional hosting tips. I can unsubscribe at any time.' })}
        </div>
      </div>
      <aside class="pf__side" aria-label="Your answers">
        <h3>Your answers</h3>
        <ol class="pf-sum" data-pf-sum>${QUESTIONS.map((q) => `<li data-sum="${q.id}"><span>${esc(q.title)}</span><button type="button" class="pf-sum__v" data-goto="${q.id}" disabled>Not answered</button></li>`).join('')}</ol>
        <div class="pf-help">${icon('headset')}<p>Prefer to talk it through? Our engineers reply ${wa ? `on <a href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a> and` : 'by'} <a href="/contact">phone, email or ticket</a>.</p></div>
      </aside>
    </div>
  </div></section>
  <script type="application/json" id="pf-data">${JSON.stringify({ products: data, labels: TYPE_LABEL, pages: TYPE_PAGE }).replace(/</g, '\\u003c')}</script>`;

  const faqs = [
    { q: 'How does the plan finder choose a plan?', a: 'It maps what you are building to a type of service (web hosting, VPS, dedicated server, RDP and so on), checks website limits against how many sites you need, then picks a size from our current plans based on your traffic and price preference.' },
    { q: 'Are the prices real?', a: 'Yes. Every price comes from our billing system in your currency. If a plan has no published price yet it says “See price”, and the exact total is always shown in the order form before you pay.' },
    { q: 'What if I pick a plan that turns out too small?', a: 'You can upgrade from your client area or ask support. Hosting plans and VPS can be moved to a larger size, and we explain any price difference before anything changes.' },
    { q: 'Can someone help me choose instead?', a: 'Yes. Message us on WhatsApp, call or open a ticket with a short description of your project and we will recommend a plan.' },
  ];
  const faqSec = `<section class="hp-section hp-section--tint" aria-labelledby="pf-faq-h"><div class="hp-container pf-faq">
    ${sectionHead({ id: 'pf-faq-h', title: 'Questions about the plan finder', align: 'left' })}
    ${faq(faqs, { id: 'pf-faq', single: true })}
  </div></section>`;

  const appLd = ld({ '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Globalhostia plan finder', url: `${site}/plan-finder`, applicationCategory: 'BusinessApplication', operatingSystem: 'Any', isAccessibleForFree: true });
  return page({
    ctx, catalog: cat, path: '/plan-finder', title: ctx.route.title, description: ctx.route.description,
    css: ['planfinder'], js: ['planfinder'],
    jsonLd: [breadcrumbJsonLd(crumbs, site), faqJsonLd(faqs), appLd],
    body: [hero, quiz, trustStrip(s), faqSec].join('\n'),
  });
}
