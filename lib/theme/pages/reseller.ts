// cPanel reseller hosting: hero = white-label control panel mock with client accounts appearing,
// "how reselling works" flow with animated connectors, a revenue calculator (no invented costs), plans or waitlist.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { picture } from '../img';
import { money } from '../../pricing';
import { getCatalog, productsFor, minFrom, currencyPrefix, whmcsLinks } from '../data';
import { page } from '../shell';
import {
  pageHero, sectionHead, splitHead, planCards, plansNote, featureGrid, faq, faqJsonLd, ctaBand, breadcrumbJsonLd,
  icon, hexIcon, ld, available,
} from '../ui';

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const { currency, base } = cat;
  const prefix = currencyPrefix(cat) || '$';
  const products = productsFor(cat, ctx.route.categories);
  const from = minFrom(available(products), currency);
  const L = whmcsLinks(base);
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Hosting', href: '/web-hosting' }, { label: ctx.route.title }];
  const cpanelOnly = ctx.slug === 'aws-pro-cpanel-hosting';

  /* ---------------- hero: white-label panel ---------------- */
  const accounts = [
    ['northwind-bakery.com', 'Starter', .22], ['studio-amara.co', 'Business', .48], ['greenleaf-dental.com', 'Starter', .31],
    ['kite-and-co.shop', 'Business', .64], ['orbit-tutors.org', 'Starter', .17],
  ] as const;
  const panel = `<figure class="rs-panel" data-rs-panel data-pause>
    <div class="rs-panel__top" aria-hidden="true"><span class="rs-brand"><i></i>YourBrand Hosting</span><span class="rs-user">${icon('user')}Reseller</span></div>
    <div class="rs-panel__body" aria-hidden="true">
      <div class="rs-kpis"><div><small>Client accounts</small><b class="num" data-rs-count>5</b></div><div><small>Packages</small><b class="num">2</b></div><div><small>Branding</small><b>Yours</b></div></div>
      <div class="rs-list__head"><span>Domain</span><span>Package</span><span>Disk used</span></div>
      <ul class="rs-list">${accounts.map(([d, p, u], i) => `<li class="rs-acc" style="--i:${i}"><span class="rs-acc__d"><i>${esc(d.charAt(0).toUpperCase())}</i>${esc(d)}</span><span class="rs-acc__p">${esc(p)}</span><span class="rs-acc__u"><i style="--u:${u}"></i></span><em>Active</em></li>`).join('')}</ul>
      <span class="rs-new">${icon('plus')}Create account</span>
    </div>
    <figcaption class="rs-cap">Illustration: your clients see your brand, not ours. Account names are examples.</figcaption>
  </figure>`;

  const hero = pageHero({
    crumbs, eyebrow: cpanelOnly ? 'cPanel hosting' : 'Reseller hosting',
    title: 'Sell hosting under your own brand',
    lead: 'Buy hosting resources in bulk, split them into packages for your clients, and set your own prices. You own the client relationship; we run the servers behind it.',
    ctas: products.length ? [{ label: 'See reseller plans', href: '#plans' }, { label: 'Estimate your revenue', href: '#calc', variant: 'ghost' }]
      : [{ label: 'Join the waitlist', href: '#plans' }, { label: 'Estimate your revenue', href: '#calc', variant: 'ghost' }],
    fromHtml: from ? `Reseller plans from <b class="num">${esc(money(from.price, from.prefix || prefix))}</b> ${from.cycle === 'monthly' ? 'a month' : from.cycle === 'annually' ? 'a year' : ''}` : undefined,
    trust: ['Your brand on every account', 'cPanel for each client', 'We handle the servers'],
    visualHtml: panel,
  });

  /* ---------------- how reselling works ---------------- */
  const flow = [
    { ic: 'server', t: 'Get a reseller plan', d: 'You receive a pool of disk space and bandwidth on our servers, plus a control panel to manage it.' },
    { ic: 'layers', t: 'Create your packages', d: 'Split the pool into your own plans, name them, and put your brand and nameservers on them.' },
    { ic: 'users', t: 'Sell and bill your clients', d: 'Set your own prices and invoice clients yourself. The difference between what you charge and what you pay is yours.' },
  ];
  const how = `<section class="hp-section" aria-labelledby="how-h"><div class="hp-container">
    ${sectionHead({ id: 'how-h', title: 'How reselling works', lead: 'Three steps between you and a hosting business, without buying or managing a single server.' })}
    <ol class="rs-flow" data-rs-flow data-pause>${flow.map((s, i) => `<li class="rs-flow__step" data-reveal style="--i:${i}">${hexIcon(s.ic)}<span class="rs-flow__n num">Step ${i + 1}</span><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></li>${i < flow.length - 1 ? `<li class="rs-flow__link" aria-hidden="true"><svg viewBox="0 0 100 20" preserveAspectRatio="none"><path class="rs-flow__path" d="M2 10 H98"/></svg><span class="rs-flow__dot"></span></li>` : ''}`).join('')}</ol>
  </div></section>`;

  /* ---------------- calculator ---------------- */
  const planMonthly = from ? from.amount : null;
  const calc = `<section class="hp-section hp-section--dark hp-on-dark" id="calc" aria-labelledby="calc-h"><div class="hp-container rs-calc" data-rs-calc data-prefix="${esc(prefix)}"${planMonthly ? ` data-plan="${planMonthly.toFixed(4)}"` : ''}>
    <div class="rs-calc__intro">
      <h2 id="calc-h" class="hp-hline hp-h2">What could reselling earn you?</h2>
      <p class="hp-lead">Enter how many clients you expect and what you would charge each of them. The calculator multiplies the two, nothing more; it does not assume any costs on your behalf.</p>
    </div>
    <form class="rs-calc__card" data-rs-form>
      <div class="rs-field"><label for="rs-clients">Number of clients</label>
        <div class="rs-field__row"><input id="rs-clients-r" type="range" min="1" max="200" value="20" aria-label="Number of clients" data-rs-range><input id="rs-clients" class="rs-num num" type="number" inputmode="numeric" min="1" max="10000" value="20" data-rs-clients></div></div>
      <div class="rs-field"><label for="rs-price">Your price per client, per month</label>
        <div class="rs-money"><span>${esc(prefix)}</span><input id="rs-price" class="rs-num num" type="number" inputmode="decimal" min="0" step="0.5" value="" placeholder="Enter your price" data-rs-price></div>
        <p class="rs-help">Use the price you plan to charge. Look at what hosting sells for in your market.</p></div>
      <div class="rs-out" aria-live="polite">
        <div><small>Monthly revenue</small><b class="num" data-rs-month>—</b></div>
        <div><small>Yearly revenue</small><b class="num" data-rs-year>—</b></div>
      </div>
      ${planMonthly ? `<p class="rs-note">Our reseller plans start from about ${esc(money(planMonthly, prefix))} a month; see the plans below for what each includes.</p>` : '<p class="rs-note">Revenue before your own costs, such as your reseller plan, domains and payment fees.</p>'}
    </form>
  </div></section>`;

  /* ---------------- plans or waitlist ---------------- */
  const soon = `<div class="rs-soon" data-reveal>
    <div class="rs-soon__copy"><span class="rs-soon__tag"><i aria-hidden="true"></i>Launching soon</span>
      <h3>Reseller plans are on their way</h3>
      <p>We are finishing our new reseller packages. Join the waitlist and we will contact you with plan details and prices before they go public, or talk to sales now if you have clients waiting.</p>
      <div class="hp-actions"><a class="hp-btn hp-btn--brand" href="${esc(L.ticket)}">Join the waitlist</a><a class="hp-btn hp-btn--ghost" href="/contact">Talk to sales</a></div>
      <p class="rs-soon__fine">Joining the waitlist opens a support ticket so our team can reply to you directly.</p>
    </div>
    <ul class="rs-soon__list">${['Your brand and private nameservers', 'cPanel for every client account', 'Create your own packages', 'Free SSL on client sites', 'Daily and weekly backups', '24/7 support for you, the reseller'].map((t) => `<li>${icon('check')}${esc(t)}</li>`).join('')}</ul>
  </div>`;
  const plans = `<section class="hp-section" id="plans" aria-labelledby="plans-h"><div class="hp-container">
    ${sectionHead({ id: 'plans-h', title: 'Reseller plans', lead: products.length ? 'Pick the pool size that fits your client base. You can move up as you sign more clients.' : 'Be first in line when our reseller packages open.' })}
    ${products.length ? planCards(products, { currency, base, id: 'rs-plans' }) + plansNote(currency) : soon}
  </div></section>`;

  /* ---------------- features ---------------- */
  const feats = `<section class="hp-section hp-section--tint" aria-labelledby="feat-h"><div class="hp-container">
    ${splitHead({ id: 'feat-h', title: 'Run a hosting business without running servers', lead: 'You handle sales and your clients. We look after hardware, networks, security patches and backups.' })}
    <div class="rs-feat">
      <figure class="rs-feat__img" data-reveal>${picture({ src: '/hp/img/reseller-agency.jpg', alt: 'A web agency team working together on laptops', sizes: '(max-width: 900px) calc(100vw - 32px), 600px' })}</figure>
      ${featureGrid([
        { icon: 'tag', title: 'White label', text: 'Your company name on the panel and your own nameservers. We stay invisible to your clients.' },
        { icon: 'grid', title: 'Separate cPanel per client', text: 'Each client gets their own control panel, files and email, isolated from the others.' },
        { icon: 'dollar', title: 'You set the prices', text: 'Charge monthly, yearly or bundle hosting with your design and maintenance work.' },
        { icon: 'lock', title: 'Free SSL on every site', text: 'HTTPS for each client domain, so you never sell a site without a padlock.' },
        { icon: 'archive', title: 'Backups for all accounts', text: 'Daily and weekly backups cover every client account in your pool.' },
        { icon: 'headset', title: 'Support behind you', text: 'Our engineers back you up around the clock when something needs a server-side fix.' },
      ], { cols: 2 })}
    </div>
  </div></section>`;

  /* ---------------- FAQ ---------------- */
  const faqs = [
    { q: 'Who is reseller hosting for?', a: 'Web designers, agencies and IT providers who host websites for their clients, and anyone who wants to start a hosting brand without owning servers.' },
    { q: 'Will my clients know the hosting comes from Globalhostia?', a: 'No. Accounts carry your brand and can use your own nameservers. Your clients deal with you, and you deal with us.' },
    { q: 'Who supports my clients?', a: 'You do the first-line support for your clients, because they are your customers. Whenever a problem needs server-level access, our engineers help you around the clock.' },
    { q: 'How do I bill my clients?', a: 'You invoice your clients directly at the prices you set. We bill you only for your reseller plan.' },
    { q: 'Can I move my existing clients to a reseller plan?', a: 'Yes. Our team can migrate existing client websites, databases and email from your current host into accounts under your reseller plan.' },
  ];
  const faqSec = `<section class="hp-section" aria-labelledby="faq-h"><div class="hp-container rs-faq">
    ${sectionHead({ id: 'faq-h', title: 'Reseller questions' })}
    ${faq(faqs, { id: 'rs-faq', single: true })}
  </div></section>`;

  const cta = ctaBand({ id: 'cta', title: 'Turn your client list into recurring revenue', text: products.length ? 'Choose a reseller plan and create your first client account today.' : 'Join the waitlist and we will contact you as soon as reseller plans open.',
    primary: products.length ? { label: 'See plans', href: '#plans' } : { label: 'Join the waitlist', href: L.ticket }, secondary: { label: 'Talk to sales', href: '/contact' } });

  const site = String(cat.settings.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const offer = from ? ld({ '@context': 'https://schema.org', '@type': 'Product', name: ctx.route.title, description: ctx.route.description, brand: { '@type': 'Brand', name: cat.settings.site_name || 'Globalhostia' },
    offers: { '@type': 'AggregateOffer', priceCurrency: currency, lowPrice: from.price.toFixed(2), offerCount: products.length, url: `${site}/${ctx.slug}` } }) : '';

  return page({
    ctx, catalog: cat, path: `/${ctx.slug}`, title: ctx.route.title, description: ctx.route.description,
    css: ['reseller'], js: ['reseller'],
    jsonLd: [breadcrumbJsonLd(crumbs, site), faqJsonLd(faqs), offer].filter(Boolean),
    body: [hero, how, calc, plans, feats, faqSec, cta].join('\n'),
  });
}
