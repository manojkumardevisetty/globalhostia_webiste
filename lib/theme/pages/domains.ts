// Domain registration: centered search hero with drifting extensions, filterable TLD price grid
// (register / renew / transfer), animated transfer-in flow, what's included, FAQ.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { picture, HERO_BG_SIZES } from '../img';
import { money } from '../../pricing';
import { getCatalog, pricedTlds, currencyPrefix, domainCartUrl, type TTld } from '../data';
import { page } from '../shell';
import { trustStrip, brokerCard } from '../growth';
import {
  breadcrumbs, breadcrumbJsonLd, domainSearch, sectionHead, splitHead, featureGrid, faq, faqJsonLd, ctaBand, ld, icon, link, trustRow,
} from '../ui';

const POPULAR = ['.com', '.net', '.org', '.co', '.io', '.ai'];
const TECH = ['.io', '.ai', '.tech', '.dev', '.app', '.cloud', '.xyz', '.online', '.digital', '.software'];
const BUSINESS = ['.com', '.co', '.biz', '.store', '.shop', '.company', '.business', '.online', '.net', '.inc', '.ltd'];
const ABOUT: Record<string, string> = {
  '.com': 'The default for businesses worldwide',
  '.net': 'Networks, tech and online services',
  '.org': 'Non-profits, communities and projects',
  '.co': 'Short alternative to .com for companies',
  '.io': 'Popular with startups and developers',
  '.ai': 'AI products and research',
  '.shop': 'Online shops of every size',
  '.store': 'Retail and e-commerce brands',
  '.xyz': 'Flexible and low cost for any idea',
  '.live': 'Streams, events and creators',
  '.tech': 'Technology companies and products',
  '.online': 'Any business with an online presence',
};

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const { currency, base } = cat;
  const prefix = currencyPrefix(cat) || '$';
  const site = String(cat.settings.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const tlds = pricedTlds(cat);
  const m = (v: number | null) => (v === null ? '' : money(v, prefix));
  const cheapest = [...tlds].sort((a, b) => a.register! - b.register!)[0];
  const transfers = tlds.filter((t) => t.transfer !== null);
  const cheapTransfer = [...transfers].sort((a, b) => a.transfer! - b.transfer!)[0];
  // search chips: featured first, then popular names, then the rest
  const ordered = [...tlds].sort((a, b) => Number(b.featured) - Number(a.featured) || (POPULAR.indexOf(a.tld) + 1 || 99) - (POPULAR.indexOf(b.tld) + 1 || 99));
  const search = ordered.map((t) => ({ ...t, featured: true }));

  const crumbs = [{ label: 'Home', href: '/' }, { label: ctx.route.title }];
  const isSearch = ctx.slug === 'aws-pro-domains-search';
  const q = (ctx.query.get('q') || ctx.query.get('query') || '').slice(0, 80);

  /* ---------------- hero ---------------- */
  const drift = tlds.slice(0, 12).map((t, i) => `<span class="dom-float" style="--x:${[6, 84, 14, 74, 3, 90, 22, 66, 9, 79, 30, 58][i]}%;--y:${[18, 14, 70, 72, 44, 46, 88, 90, 92, 30, 8, 6][i]}%;--d:${16 + (i % 5) * 3}s;--dl:${-i * 1.7}s">${esc(t.tld)}</span>`).join('');
  const hero = `<section class="hp-hero hp-hero--page is-solo dom-hero" data-network aria-labelledby="dom-h1">
  ${picture({ src: '/hp/img/hero-domains.jpg', className: 'hp-hero__bg', priority: true, sizes: HERO_BG_SIZES })}
  <div class="hp-hero__hex" aria-hidden="true"></div>
  <div class="dom-drift" aria-hidden="true" data-pause>${drift}</div>
  <div class="hp-container">
    <div class="hp-hero__copy dom-hero__copy">
      ${breadcrumbs(crumbs)}
      <h1 id="dom-h1" data-words>${esc(isSearch ? 'Search for your domain name' : 'Find the name your business will be known by.')}</h1>
      <p class="hp-lead">${esc(`${tlds.length ? `Search ${tlds.length} extensions${cheapest ? `, from ${m(cheapest.register)} for the first year` : ''}. ` : ''}Every price below shows what you pay today and what the renewal costs, so there are no surprises in year two.`)}</p>
      <div class="dom-search">${domainSearch({ tlds: search, base, title: '', id: 'domain-q', max: 5, prefix, value: q,
        typing: ['yourbrand.com', 'freshbakery.shop', 'launchpad.io', 'studio.live', 'greenleaf.org', 'nextidea.ai'],
        note: `First-year prices in ${currency}. Pick an extension, or type the full name like yourbrand.net.` })}</div>
      ${trustRow(['DNS management included', 'Renewal price shown upfront', 'Manage everything in one client area'])}
      <div class="dom-broker" style="max-width:880px;margin:0 auto;text-align:left">${brokerCard(cat.settings, { dark: true, domain: /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(q.trim()) ? q.trim().toLowerCase() : '' })}</div>
    </div>
  </div>
</section>`;

  /* ---------------- TLD price grid ---------------- */
  const groups = [
    { id: 'all', label: 'All', test: () => true },
    { id: 'popular', label: 'Popular', test: (t: TTld) => POPULAR.includes(t.tld) || t.featured },
    { id: 'cheap', label: `Under ${money(5, prefix)}`, test: (t: TTld) => (t.register ?? 99) < 5 },
    { id: 'tech', label: 'Tech and startups', test: (t: TTld) => TECH.includes(t.tld) },
    { id: 'business', label: 'Business and stores', test: (t: TTld) => BUSINESS.includes(t.tld) },
  ].map((g) => ({ ...g, n: tlds.filter(g.test).length })).filter((g) => g.n > 0);
  const tagsOf = (t: TTld) => groups.filter((g) => g.id !== 'all' && g.test(t)).map((g) => g.id).join(' ');
  const rows = tlds.map((t, i) => {
    return `<tr data-tags="${esc(tagsOf(t))}" data-reg="${t.register}" data-i="${i}" style="--k:${i}">
      <th scope="row"><span class="dom-tld">${esc(t.tld)}</span>${t.promo ? `<span class="hp-badge hp-badge--inline">${esc(t.promo)}</span>` : ''}${ABOUT[t.tld] ? `<small>${esc(ABOUT[t.tld])}</small>` : ''}</th>
      <td data-label="First year"><b class="num">${esc(m(t.register))}</b></td>
      <td data-label="Renews at"><span class="num">${t.renew !== null ? `${esc(m(t.renew))}<span class="dom-per"> / year</span>` : '<span class="hp-muted">Shown at checkout</span>'}</span></td>
      <td data-label="Transfer"><span class="num">${t.transfer !== null ? esc(m(t.transfer)) : '<span class="hp-muted">Not available</span>'}</span></td>
      <td class="dom-act"><a class="hp-btn hp-btn--ghost" href="${esc(domainCartUrl(base))}" data-dom-tld="${esc(t.tld)}" aria-label="${esc(`Search ${t.tld} domains`)}">${icon('search')}Search ${esc(t.tld)}</a></td>
    </tr>`;
  }).join('');
  const grid = tlds.length ? `<section class="hp-section" id="pricing" aria-labelledby="pricing-h"><div class="hp-container">
    ${splitHead({ id: 'pricing-h', title: 'Domain prices, first year and every year after', lead: 'First-year prices are often promotional. We show the renewal and transfer price next to each one, straight from our billing system.' })}
    <div class="dom-grid" data-dom-grid data-reveal>
      <div class="dom-grid__bar">
        <div class="dom-chips" role="group" aria-label="Filter extensions">${groups.map((g, i) => `<button type="button" aria-pressed="${i === 0}" data-f="${g.id}">${esc(g.label)}<span class="num">${g.n}</span></button>`).join('')}</div>
        <label class="dom-sort"><span class="sr-only">Sort extensions</span><select class="hp-select" data-dom-sort><option value="">Recommended order</option><option value="price">First year: lowest first</option><option value="name">Extension: A to Z</option></select></label>
      </div>
      <div class="dom-table-wrap">
        <table class="dom-table">
          <caption class="sr-only">Domain extension prices in ${esc(currency)}</caption>
          <thead><tr><th scope="col">Extension</th><th scope="col">First year</th><th scope="col">Renews at</th><th scope="col">Transfer in</th><th scope="col"><span class="sr-only">Search</span></th></tr></thead>
          <tbody data-dom-body>${rows}</tbody>
        </table>
      </div>
      <p class="dom-grid__note"><span class="hp-live"><i aria-hidden="true"></i>Prices shown live from our billing system, in ${esc(currency)}. Taxes may apply at checkout.</span><span aria-live="polite" class="sr-only" data-dom-count></span></p>
    </div>
  </div></section>` : '';

  /* ---------------- transfer in ---------------- */
  const tSteps = [
    { icon: 'lock', t: 'Unlock and get your code', d: 'At your current registrar, turn off the transfer lock and request the authorization (EPP) code. For most extensions, the domain must have been registered or transferred at least 60 days ago.' },
    { icon: 'transfer', t: 'Start the transfer here', d: 'Enter the domain and the code in our order form. For most extensions, the transfer adds a year to your registration.' },
    { icon: 'check', t: 'Approve and you are done', d: 'Confirm the email from your current registrar. Most transfers complete within 5 to 7 days and your website stays online throughout.' },
  ];
  const transfer = `<section class="hp-section hp-section--dark hp-on-dark" id="transfer" aria-labelledby="transfer-h"><div class="hp-container">
    <div class="dom-tr">
      <div class="dom-tr__copy" data-reveal>
        <h2 id="transfer-h" class="hp-hline hp-h2">Move your domains here in three steps</h2>
        <p class="hp-lead">Keep your name, your email and your website. Only the company that manages the registration changes.${cheapTransfer ? ` Transfers start at ${esc(m(cheapTransfer.transfer))}, depending on the extension.` : ''}</p>
        <form class="dom-tform" action="${esc(base)}/cart.php" method="get" data-dom-transfer>
          <input type="hidden" name="a" value="add"><input type="hidden" name="domain" value="transfer">
          <label class="sr-only" for="dom-tq">Domain to transfer</label>
          <input id="dom-tq" class="hp-input" name="query" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="yourdomain.com" required>
          <button class="hp-btn hp-btn--brand" type="submit">${icon('transfer')}Start transfer</button>
        </form>
      </div>
      <div class="dom-flow" data-dom-flow data-pause data-reveal role="img" aria-label="Illustration: a domain moves from your current registrar to Globalhostia through unlock, authorize and approve steps.">
        <div class="dom-flow__end"><span>${icon('server')}</span><b>Current registrar</b></div>
        <div class="dom-flow__track" aria-hidden="true">
          <i class="dom-flow__line"></i><i class="dom-flow__fill"></i>
          <span class="dom-flow__cp" style="--p:16.6%">${icon('lock')}<em>Unlock</em></span>
          <span class="dom-flow__cp" style="--p:50%">${icon('key')}<em>Authorize</em></span>
          <span class="dom-flow__cp" style="--p:83.3%">${icon('check')}<em>Approve</em></span>
          <span class="dom-flow__rider"><span class="dom-flow__chip">${icon('globe')}yourbrand.com</span></span>
        </div>
        <div class="dom-flow__end is-us"><span>${icon('shield')}</span><b>Globalhostia</b></div>
      </div>
    </div>
    <ol class="dom-tsteps">${tSteps.map((s, i) => `<li data-reveal style="--i:${i}"><span class="dom-tsteps__n num" aria-hidden="true">${i + 1}</span><div><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></div></li>`).join('')}</ol>
  </div></section>`;

  /* ---------------- included ---------------- */
  const included = `<section class="hp-section" aria-labelledby="inc-h"><div class="hp-container">
    ${sectionHead({ id: 'inc-h', title: 'Every domain comes with the controls you need', lead: 'Manage records, nameservers and renewals for all your domains from one client area.' })}
    ${featureGrid([
      { icon: 'database', title: 'DNS management', text: 'Edit A, CNAME, MX and TXT records to point your domain at any website, email or service.' },
      { icon: 'net', title: 'Custom nameservers', text: 'Use our nameservers or set your own, for example to use an external DNS or CDN provider.' },
      { icon: 'external', title: 'Domain forwarding', text: 'Send visitors from one domain to another, such as a campaign name to your main website.' },
      { icon: 'lock', title: 'Transfer lock', text: 'Keep your domain locked against unauthorized transfers, and unlock it only when you decide to move.' },
      { icon: 'calendar', title: 'Renewal reminders', text: 'Email reminders before expiry, with auto-renew so your name never lapses by accident.' },
      { icon: 'grid', title: 'One client area', text: 'Domains, hosting, email and invoices together, with one login and one bill.' },
      { icon: 'globe', title: 'Pair with hosting', text: 'Connect a domain to a Globalhostia hosting plan and it is ready for a website and email.' },
      { icon: 'headset', title: '24/7 support', text: 'Engineers on call by phone, email and ticket if a record or transfer needs a hand.' },
    ], { cols: 4 })}
  </div></section>`;

  /* ---------------- FAQ ---------------- */
  const faqs = [
    { q: 'Why is the renewal price different from the first-year price?', a: 'Registries and registrars often discount the first year of a new registration. From the second year the standard renewal price applies. We show both prices side by side so you can plan ahead.' },
    { q: 'Which extension should I choose?', a: 'Choose .com if it is available, as visitors type it by default. Otherwise pick an extension that says what you do, like .shop for a store or .io for a software product, and consider registering close variants so nobody else can.' },
    { q: 'How long does a domain transfer take?', a: 'Most transfers complete within 5 to 7 days after you approve them at your current registrar. Your website and email keep working during the transfer as long as the nameservers stay the same.' },
    { q: 'What is an EPP or authorization code?', a: 'It is a password for your domain, issued by your current registrar. It proves you own the domain and is required to move it to a new registrar.' },
    { q: 'Can I use my domain with hosting from another company?', a: 'Yes. Point the nameservers or DNS records to any provider. Registering a domain with us does not require hosting with us.' },
    { q: 'What happens if I forget to renew?', a: 'Most extensions have a grace period after expiry during which you can still renew, though the website and email stop working. The length of the grace period and any restore fee depend on the extension, so turning on auto-renew is the safest option.' },
  ];
  const faqSec = `<section class="hp-section hp-section--tint" aria-labelledby="faq-h"><div class="hp-container">
    ${sectionHead({ id: 'faq-h', title: 'Domain questions' })}
    ${faq(faqs, { id: 'dom-faq', single: true })}
    <p class="dom-faq-more">${link('More answers in the help center', '/help-center')}</p>
  </div></section>`;

  const cta = ctaBand({ id: 'cta', title: 'Your name is waiting', text: 'Search now and register in minutes. Add hosting and email whenever you are ready.',
    primary: { label: 'Search for a domain', href: '#domain-q', attrs: 'data-focus-domain' }, secondary: { label: 'Transfer a domain', href: '#transfer' } });

  const offers = tlds.length ? ld({ '@context': 'https://schema.org', '@type': 'OfferCatalog', name: 'Domain registration', url: `${site}/${ctx.slug}`,
    itemListElement: tlds.map((t) => ({ '@type': 'Offer', name: `${t.tld} domain registration, first year`, price: t.register!.toFixed(2), priceCurrency: currency, url: domainCartUrl(base),
      itemOffered: { '@type': 'Service', name: `${t.tld} domain name` } })) }) : '';

  return page({
    ctx, catalog: cat, path: `/${ctx.slug}`, title: ctx.route.title, description: ctx.route.description, css: ['domains'], js: ['domains'],
    preload: [{ src: '/hp/img/hero-domains.jpg', sizes: HERO_BG_SIZES }],
    jsonLd: [breadcrumbJsonLd(crumbs.map((c) => ({ ...c, href: c.href || `/${ctx.slug}` })), site), faqJsonLd(faqs), offers].filter(Boolean),
    body: [hero, trustStrip(cat.settings), grid, transfer, included, faqSec, cta].join('\n'),
  });
}
