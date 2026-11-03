// Homepage: the approved 5-hostpen.html concept, rebuilt from shared components and live catalog data.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { money } from '../../pricing';
import { getCatalog, productsFor, minFrom, pricedTlds, currencyPrefix, deriveSpecs, type TProduct, type FromPrice } from '../data';
import { page } from '../shell';
import { trustStrip, brokerCard } from '../growth';
import { getLatestPosts, postPath, fmtPostDate } from '../../blog';
import { postCard } from './blog';
import {
  heroSlider, domainSearch, sectionHead, bigTabs, planCards, plansNote, link, statRow, barChart, dcMap, splitHead, featureGrid,
  ctaBand, colHead, testimonials, faq, articleList, logosStrip, available,
} from '../ui';

const H = ['hosting-usa', 'hostia-shared', 'hosting-singapore'];
const D = ['dedicated-servers', 'premiumdedicated-servers'];
const PER: Record<string, string> = { monthly: 'a month', quarterly: 'a quarter', semiannually: 'every 6 months', annually: 'a year', biennially: 'every 2 years', triennially: 'every 3 years' };
const PER_B: Record<string, string> = { monthly: 'per month', quarterly: 'per quarter', semiannually: 'every 6 months', annually: 'per year, billed annually', biennially: 'every 2 years', triennially: 'every 3 years' };
const UNIT: Record<string, string> = { monthly: '/ month', annually: '/ year', quarterly: '/ quarter', semiannually: '/ 6 months', biennially: '/ 2 years', triennially: '/ 3 years' };
/** billed price of a FromPrice ("$29.99") */
const billed = (f: FromPrice) => money(f.price, f.prefix);

/** Threads from a CPU spec: "32C/64T @ 2.1GHz" → 64, "Ryzen 9 5950X 32T" → 32, "8 cores" → 8. */
function threads(p: TProduct) {
  const cpu = deriveSpecs(p.features, p.attributes).cpu || '';
  const t = cpu.match(/(\d+)\s*T\b/i) || cpu.match(/\/(\d+)\s*T/i); if (t) return +t[1];
  const c = cpu.match(/(\d+)\s*C\b/i) || cpu.match(/(\d+)\s*(?:v?cpu|v?cores?)/i); return c ? +c[1] : 0;
}
const is10g = (p: TProduct) => /10\s*gbps/i.test(p.name + ' ' + p.features.join(' '));

/** Pick up to 3 showcase products: cheapest, the highlighted one, and another badged/next one. */
function showcase(ps: TProduct[], currency: string) {
  const av = available(ps);
  const per = (p: TProduct) => minFrom([p], currency)?.amount ?? 1e9;
  const byPrice = [...av].sort((a, b) => per(a) - per(b));
  const first = byPrice[0];
  const hot = av.find((p) => p !== first && (p.featured || /hot|popular|best|recommend/i.test(p.badge))) || byPrice[Math.floor(byPrice.length / 2)];
  const third = av.find((p) => p !== first && p !== hot && p.badge) || byPrice.find((p) => p !== first && p !== hot);
  return [first, hot, third].filter((p, i, a): p is TProduct => !!p && a.indexOf(p) === i).sort((a, b) => per(a) - per(b));
}

export default async function render(ctx: PageCtx): Promise<string> {
  const [cat, posts] = await Promise.all([getCatalog(), getLatestPosts(3)]);
  const { currency, base } = cat;
  const prefix = currencyPrefix(cat) || '$';
  const hosting = productsFor(cat, H), vps = productsFor(cat, ['hostiavps']), ded = productsFor(cat, D);
  const hostFrom = minFrom(available(hosting), currency);
  const hostCheapest = available(hosting).find((p) => { const f = minFrom([p], currency); return f && hostFrom && f.amount === hostFrom.amount; });
  const dedFrom = minFrom(available(ded), currency);
  const tlds = pricedTlds(cat);
  const cheapTld = [...tlds].sort((a, b) => a.register! - b.register!)[0];
  const locations = [...new Set(hosting.map((p) => deriveSpecs(p.features, p.attributes).location).filter(Boolean))];
  const theLoc = (l: string) => (/^(USA|UK|UAE|Netherlands|United States)$/i.test(l) ? `the ${l}` : l);
  const locText = locations.length > 1 ? `${locations.slice(0, -1).map(theLoc).join(', ')} and ${locations[locations.length - 1]}` : locations[0] ? theLoc(locations[0]) : '';
  const NUM = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];
  const locTitle = locations.length ? `${NUM[locations.length] || locations.length} hosting location${locations.length > 1 ? 's' : ''}` : 'Hosting near your visitors';
  const planNames = [...new Set(hosting.map((p) => p.name.replace(/\s+(USA|US|MY|SG|UK|EU|Malaysia|Singapore)$/i, '')))].slice(0, 3);
  // "Hostia Lite, Ultra and Infinity" when the plan names share a first word
  const firstWord = planNames[0]?.split(' ')[0] || '';
  const shared = planNames.length > 1 && planNames.every((n) => n.startsWith(firstWord + ' '));
  const short = shared ? planNames.map((n, i) => (i ? n.slice(firstWord.length + 1) : n)) : planNames;
  const planText = short.length > 1 ? `${short.slice(0, -1).join(', ')} and ${short[short.length - 1]}` : short[0] || 'Shared hosting';

  /* ---------------- hero ---------------- */
  const hero = heroSlider([
    {
      kicker: 'Web hosting', dot: 'Web hosting', image: '/hp/img/hero-hosting.jpg', imageH: 1280,
      title: hostFrom ? `Fast NVMe web hosting, from ${billed(hostFrom)} ${PER[hostFrom.cycle] || ''}.`.replace(/\s+\./, '.') : 'Fast NVMe web hosting for every website.',
      text: `${planText} plans${locText ? ` in ${locText}` : ''}. Free SSL, daily and weekly backups, and engineers on call around the clock.`,
      ctas: [{ label: 'View hosting plans', href: '#plans' }, { label: 'How it works', href: '/web-hosting', variant: 'ghost' }],
      fromHtml: hostFrom ? `${esc(hostCheapest?.name.replace(/\s+(USA|US|MY|SG)$/i, '') || 'Hosting')} from <b class="num">${esc(billed(hostFrom))}</b> ${esc(PER_B[hostFrom.cycle] || '')}` : undefined,
    },
    {
      kicker: 'Cloud VPS and dedicated', dot: 'Cloud VPS and dedicated', image: '/hp/img/hero-servers.jpg', imageH: 1260,
      title: 'Servers that stay up while you grow.',
      text: 'Managed SSD cloud VPS for Linux or Windows, and dedicated servers up to 64 threads with 10Gbps ports, across six datacenters at 99.93% uptime.',
      ctas: [{ label: 'Explore dedicated servers', href: '/dedicated-servers' }, { label: 'Cloud VPS', href: '/cloudvps-hosting', variant: 'ghost' }],
      fromHtml: dedFrom ? `Dedicated servers from <b class="num">${esc(billed(dedFrom))}</b> ${esc(PER_B[dedFrom.cycle] || '')}` : undefined,
    },
    {
      kicker: 'Domains and SSL', dot: 'Domains and SSL', image: '/hp/img/hero-domains.jpg', imageH: 1080,
      title: 'Claim your name and secure it the same day.',
      text: 'Register .com, .shop, .org and more, transfer existing domains for free, and add an SSL certificate that is issued in minutes.',
      ctas: [{ label: 'Search for a domain', href: '#domain-q', attrs: 'data-focus-domain' }, { label: 'SSL certificates', href: '/ssl-certificate', variant: 'ghost' }],
      fromHtml: cheapTld ? `${esc(cheapTld.tld)} domains from <b class="num">${esc(money(cheapTld.register!, prefix))}</b> for the first year` : undefined,
    },
  ]);

  /* ---------------- domain search ---------------- */
  const domain = `<section class="hp-domain" aria-labelledby="domain-q-h"><div class="hp-container">${domainSearch({ tlds, base, moreHref: '/domains-registration', prefix })}${brokerCard(cat.settings)}</div></section>`;

  /* ---------------- plans ---------------- */
  const vpsByOs = new Map<string, TProduct[]>();
  for (const p of vps) { const os = deriveSpecs(p.features, p.attributes).os || 'Linux'; vpsByOs.set(os, [...(vpsByOs.get(os) || []), p]); }
  const vpsShow = [...vpsByOs.values()].flatMap((l) => l.slice(0, 3));
  const cores = vps.map((p) => parseInt(deriveSpecs(p.features, p.attributes).cpu || '', 10)).filter((n) => n > 0);
  const dedShow = showcase(ded, currency);
  const dedCount = available(ded).length;
  const tabs = bigTabs([
    {
      id: 'p-web', label: 'Web Hosting', icon: 'globe', sub: hostFrom ? `Starting from ${billed(hostFrom)} ${UNIT[hostFrom.cycle] || ''}` : 'NVMe hosting with free SSL',
      panelHtml: planCards(hosting, { currency, base, locationTabs: true, groupLabel: 'Hosting location', id: 'plans-web',
        note: 'Pick the datacenter closest to your visitors. Every plan includes free SSL and daily and weekly backups.' }),
    },
    {
      id: 'p-vps', label: 'Cloud VPS', icon: 'cloud', sub: cores.length ? `${vpsByOs.size > 1 ? 'Linux or Windows' : [...vpsByOs.keys()][0]}, ${Math.min(...cores)} to ${Math.max(...cores)} vCPU` : 'Managed SSD cloud servers',
      panelHtml: planCards(vpsShow, { currency, base, groupBy: 'os', groupLabel: 'Operating system', id: 'plans-vps', highlight: 1,
        note: 'Fully managed SSD cloud servers. Choose your operating system; the price is confirmed live in the order form.',
        barHtml: link('All VPS plans', '/vps-hosting') }),
    },
    {
      id: 'p-ded', label: 'Dedicated', icon: 'server', sub: dedFrom ? `Starting from ${billed(dedFrom)} ${UNIT[dedFrom.cycle] || ''}` : 'Bare-metal servers',
      panelHtml: planCards(dedShow, { currency, base, id: 'plans-ded', orderLabel: 'Configure server', highlight: dedShow.length === 3 ? 1 : 'auto',
        note: `Bare-metal servers with 5 IPv4 addresses each, billed monthly. ${dedCount} current models, from Xeon to Ryzen 9.`,
        barHtml: link('Compare all dedicated servers', '/dedicated-servers') }),
    },
  ], { label: 'Product type', id: 'home-tabs' });
  const plans = `<section class="hp-section" id="plans" aria-labelledby="plans-h"><div class="hp-container">
    ${sectionHead({ id: 'plans-h', title: 'Choose the right home for your website', lead: 'Shared hosting for sites and stores, managed cloud VPS for applications, and dedicated servers for heavy workloads.' })}
    ${tabs}
    ${plansNote(currency, `<span class="hp-pf-links">${link('Not sure which plan? Try the plan finder', '/plan-finder')}${link('Domain and add-on pricing', '/domains-registration#pricing')}</span>`)}
  </div></section>`;

  /* ---------------- infrastructure ---------------- */
  const chartPool = available(ded).map((p) => ({ p, t: threads(p) })).filter((x) => x.t > 0)
    .sort((a, b) => a.t - b.t || (minFrom([a.p], currency)?.amount ?? 0) - (minFrom([b.p], currency)?.amount ?? 0));
  const seen = new Set<string>(); const uniq = chartPool.filter((x) => { const k = `${x.t}-${is10g(x.p)}-${deriveSpecs(x.p.features, x.p.attributes).ram}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const top = uniq.find((x) => is10g(x.p));
  let bars = uniq.filter((x) => x !== top);
  if (bars.length > (top ? 4 : 5)) { const n = top ? 4 : 5; bars = Array.from({ length: n }, (_, i) => bars[Math.round((i * (bars.length - 1)) / (n - 1))]); }
  if (top) bars.push(top);
  const chart = bars.length >= 2 ? barChart({
    title: 'Threads per dedicated server', caption: 'Current models, from entry level to the flagship.', unit: 'threads',
    bars: bars.map((x) => ({ label: x.p.name.replace(/\s+Server$/i, ''), value: x.t, top: is10g(x.p) })),
    legend: top ? [{ label: '1Gbps port' }, { label: '10Gbps port', gold: true }] : undefined,
  }) : '';
  const infra = `<section class="hp-section hp-section--dark hp-on-dark" aria-labelledby="infra-h"><div class="hp-container hp-infra">
    <div>
      <h2 id="infra-h" class="hp-hline hp-h2">Infrastructure you can measure</h2>
      <p class="hp-lead">Six datacenters on five continents, a CDN with more than 200 points of presence, and flash storage behind every website and server.</p>
      ${statRow([
        { value: '99.93', suffix: '%', label: 'Network uptime' },
        { value: '6', label: 'Datacenters: USA, Brazil, Algeria (EU), South Africa, India, Russia' },
        { value: '200', suffix: '+', label: 'CDN points of presence' },
        { value: '24/7', label: 'Technical support by phone, email and ticket' },
      ])}
    </div>
    ${chart || '<div></div>'}
    ${dcMap()}
  </div></section>`;

  /* ---------------- features ---------------- */
  const features = `<section class="hp-section" aria-labelledby="feat-h"><div class="hp-container">
    ${splitHead({ id: 'feat-h', title: 'Everything a hosting plan should include', lead: 'No add-on maze. Security, backups and support come with every plan, and our engineers help you move in.' })}
    ${featureGrid([
      { icon: 'drive', title: 'NVMe and SSD storage', text: 'No spinning disks behind your website. Pages and databases load from flash.' },
      { icon: 'lock', title: 'Free SSL certificate', text: 'Every hosting plan is served over HTTPS from the first day.' },
      { icon: 'archive', title: 'Daily and weekly backups', text: 'Automatic restore points for files and databases, kept off the server.' },
      { icon: 'activity', title: '99.93% uptime', text: 'Redundant power and network across our datacenters, monitored around the clock.' },
      { icon: 'headset', title: '24/7 technical support', text: 'Real engineers by phone, email, WhatsApp and ticket, at any hour.' },
      { icon: 'transfer', title: 'Free domain transfer', text: 'Bring your existing domains to Globalhostia at no cost.' },
      { icon: 'move', title: 'Help moving in', text: 'Our team migrates your files, email and databases from your old host.' },
      { icon: 'wp', title: 'Managed WordPress', text: 'WordPress installed, updated and backed up for you.' },
      { icon: 'mail', title: 'Business email', text: 'From 10 to unlimited mailboxes on your own domain.' },
      { icon: 'pin', title: locTitle, text: locText ? `Host in ${locText.replace(/ and ([^ ]+)$/, ' or $1')}, close to your visitors.` : 'Choose the datacenter nearest your audience.' },
      { icon: 'net', title: '200+ CDN locations', text: 'Static files served from the point of presence nearest each visitor.' },
      { icon: 'card', title: 'Flexible payment', text: 'Visa, Mastercard, American Express, Discover, JCB, Maestro and Bitcoin.' },
    ])}
  </div></section>`;

  /* ---------------- CTA ---------------- */
  const cta = ctaBand({ id: 'cta', title: 'Start building your fast website today', text: 'Pick a plan, add a domain and go live in minutes. Free domain transfer included.',
    primary: { label: 'Compare all plans', href: '#plans' }, secondary: { label: 'Talk to sales', href: '/contact' } });

  /* ---------------- trio ---------------- */
  const why = [
    { icon: 'transfer', q: 'Free domain transfer', a: 'Unlock your domain at your current registrar, request the EPP code and start the transfer. Your website stays online and we add the transfer at no cost.' },
    { icon: 'drive', q: 'NVMe and SSD-only cloud', a: 'Every hosting account, VPS and cloud server runs on flash storage. There are no spinning disks in the path of your visitors.' },
    { icon: 'headset', q: '24/7 priority support', a: 'Engineers answer by phone, email, WhatsApp and ticket around the clock, including weekends and public holidays.' },
    { icon: 'archive', q: 'Daily and weekly backups', a: 'Your files and databases are backed up automatically every day and every week. Restore from your control panel or ask support.' },
  ];
  const trio = `<section class="hp-section" aria-label="Customers, reasons to choose us and help articles"><div class="hp-container hp-trio" data-stagger>
    <div data-reveal>${colHead('Happy customers')}${testimonials({ /* no rating score until there is a verified review source to quote */ reviews: [
      { quote: 'We moved our store from another host over a weekend. Support handled the migration and pages now load noticeably faster on NVMe.', who: 'Online store owner', meta: 'Shared hosting, Singapore', avatar: '/hp/img/avatar-1.jpg' },
      { quote: 'We run client projects on a cloud VPS. When we needed help at 2am, an engineer answered within minutes and stayed until it was fixed.', who: 'Agency founder', meta: 'Cloud VPS, Linux', avatar: '/hp/img/avatar-2.jpg' },
    ] })}</div>
    <div data-reveal>${colHead('Why choose us')}${faq(why.map((w) => ({ q: w.q, a: w.a, icon: w.icon })), { id: 'why', single: true, icons: true })}</div>
    <div data-reveal>${colHead('From the help center')}${articleList([
      { title: 'Point your domain to Globalhostia nameservers', meta: 'Domains, 4 minute read', href: '/help-center', image: '/hp/img/help-1.jpg' },
      { title: 'Transfer a domain to us without downtime', meta: 'Domains, 5 minute read', href: '/help-center', image: '/hp/img/help-2.jpg' },
      { title: 'Restore files and databases from a backup', meta: 'Hosting, 3 minute read', href: '/help-center', image: '/hp/img/help-3.jpg' },
    ])}<div style="margin-top:10px">${link('Visit the help center', '/help-center')}</div></div>
  </div></section>`;

  /* ---------------- latest from the blog (hidden when nothing is published) ---------------- */
  const blog = posts.length ? `<section class="hp-section hp-section--tint bl-home" aria-labelledby="blog-h"><div class="hp-container">
    <div class="bl-related__head"><h2 id="blog-h" class="hp-hline">Latest from the blog</h2>${link('All articles', '/blog')}</div>
    <div class="bl-grid">${posts.map((p) => postCard(p)).join('')}</div>
  </div></section>` : '';

  // Organization + WebSite JSON-LD is emitted site-wide by the shell (lib/seo.ts).
  return page({
    ctx, catalog: cat, path: '/', title: ctx.route.title, description: ctx.route.description,
    // the blog strip's card styles live in theme.css, so no page stylesheet is needed here
    preload: ['/hp/img/hero-hosting.jpg'],
    body: [hero, domain, trustStrip(cat.settings), plans, infra, features, cta, trio, blog, logosStrip()].join('\n'),
  });
}
