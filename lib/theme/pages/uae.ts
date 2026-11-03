// UAE SEO landing pages, one module with four deliberately different layouts:
//   /web-hosting-dubai  light split hero + quick-facts card, alternating reasons, plans, 3-step timeline
//   /vps-uae            dark hero with a live spec console, use-case tiles, spec table, plans
//   /windows-rdp-uae    desktop-window visual, who-uses-it, connect-from-any-device tabs, plans
//   /best-hosting-uae   long-form guide with sticky contents, checklist, honest comparison, live picks
// All prices come from the catalog (planCards / fromText); competitor names are never used.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { getCatalog, productsFor, minFrom, deriveSpecs, availableCurrencies, orderUrl, fromPrice, type Catalog, type TProduct } from '../data';
import { page } from '../shell';
import {
  pageHero, breadcrumbs, breadcrumbJsonLd, sectionHead, splitHead, planCards, plansNote, specTable, faq, faqJsonLd, ctaBand,
  icon, hexIcon, link, ld, fromText, available, bigTabs, VAT_NOTE, type IconName,
} from '../ui';
import { trustStrip, trustOn, trustText, waLink } from '../growth';
import { siteOf, crumbsFor } from './vps';

const H = ['hosting-usa', 'hostia-shared', 'hosting-singapore'];
type QA = { q: string; a: string };

/** Hosting locations present in a product set, e.g. "Malaysia, Singapore and USA". */
function locText(ps: TProduct[]) {
  const ls = [...new Set(ps.map((p) => deriveSpecs(p.features, p.attributes).location).filter(Boolean))] as string[];
  return { list: ls, text: ls.length > 1 ? `${ls.slice(0, -1).join(', ')} and ${ls[ls.length - 1]}` : ls[0] || '' };
}
const fromHtml = (ps: TProduct[], cat: Catalog, what: string) => {
  const f = minFrom(available(ps), cat.currency);
  const p = f && available(ps).find((x) => minFrom([x], cat.currency)?.amount === f.amount);
  return p ? `${esc(what)} from <b class="num">${esc(fromText(p, cat.currency))}</b>` : '';
};
const linksRow = (items: [string, string][]) => `<nav class="ua-links" aria-label="Related pages">${items.map(([l, h]) => link(l, h)).join('')}</nav>`;
const faqBlock = (id: string, title: string, qs: QA[]) => `<section class="hp-section hp-section--tint" aria-labelledby="${id}-h"><div class="hp-container ua-faq">
  ${sectionHead({ id: `${id}-h`, title, align: 'left' })}${faq(qs, { id, single: true })}</div></section>`;

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const site = siteOf(cat);
  const crumbs = crumbsFor(ctx.route.title);
  const r = await ({ 'web-hosting-dubai': dubai, 'vps-uae': vpsUae, 'windows-rdp-uae': rdpUae, 'best-hosting-uae': guide } as Record<string, (c: Catalog, x: PageCtx) => Promise<{ body: string; faqs: QA[]; ld?: string[] }>>)[ctx.slug]?.(cat, ctx);
  if (!r) return null as unknown as string;
  return page({
    ctx, catalog: cat, path: `/${ctx.slug}`, title: ctx.route.title, description: ctx.route.description, css: ['uae'], js: ['uae'],
    jsonLd: [breadcrumbJsonLd(crumbs, site), faqJsonLd(r.faqs), ...(r.ld || [])],
    body: r.body,
  });
}

/* ================================================================== /web-hosting-dubai */
async function dubai(cat: Catalog, ctx: PageCtx) {
  const s = cat.settings, { currency, base } = cat;
  const hosting = productsFor(cat, ctx.route.categories);
  const loc = locText(hosting);
  const curs = availableCurrencies(cat.products);
  const aed = curs.includes('AED');
  const company = String(s.company || 'Desert Tech Cloud Services LLC');
  const wa = waLink(s, 'Hello Globalhostia, I am interested in web hosting in Dubai.');
  const from = fromHtml(hosting, cat, 'Plans');
  const facts: [IconName, string, string][] = [
    ['award', 'Company', `${company}, Dubai`],
    ['coin', 'Billing', aed ? `AED${curs.length > 1 ? ` or ${curs.filter((c) => c !== 'AED').join(', ')}` : ''}` : curs.join(', ') || currency],
    ['headset', 'Support', trustOn(s, 'support') ? '24/7 by ticket and WhatsApp' : 'By ticket, email and phone'],
    ...(loc.text ? [['pin', 'Server locations', loc.text] as [IconName, string, string]] : []),
  ];
  const hero = `<section class="ua-hero ua-hero--light" aria-labelledby="ua-h1"><div class="hp-container ua-hero__grid">
    <div class="ua-hero__copy">
      ${breadcrumbs(crumbsFor(ctx.route.title), { light: true })}
      <span class="ua-eyebrow">Web hosting · Dubai, UAE</span>
      <h1 id="ua-h1">Web hosting from a Dubai company that answers on WhatsApp</h1>
      <p class="ua-lead">Fast NVMe hosting for UAE businesses, with free SSL, daily backups and engineers you can message any time. Pay in ${aed ? 'dirhams' : 'your currency'}, and keep the same renewal price${trustOn(s, 'price-lock') ? ' year after year' : ''}.</p>
      <div class="hp-actions">${[{ l: 'See hosting plans', h: '#plans', v: 'brand' }, ...(wa ? [{ l: 'WhatsApp our team', h: wa, v: 'ghost' }] : [])].map((b) => `<a class="hp-btn hp-btn--${b.v}" href="${esc(b.h)}"${b.h.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${esc(b.l)}</a>`).join('')}</div>
      ${from ? `<p class="ua-from">${from}</p>` : ''}
    </div>
    <aside class="ua-facts" aria-label="Quick facts"><h2>Quick facts</h2><dl>${facts.map(([ic, k, v]) => `<div>${icon(ic)}<dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <p>${link('Test speed from your browser', '/data-centers#speed', 'gauge')}</p></aside>
  </div></section>`;

  const reasons: [IconName, string, string][] = [
    ['users', 'A local team, in your time zone', `Globalhostia is run by ${company} in Dubai. Our engineers work on Gulf time and reply ${trustOn(s, 'support') ? 'around the clock by ticket and WhatsApp' : 'by ticket, email and phone'}, in plain English.`],
    ['coin', aed ? 'Prices in dirhams, no card surprises' : 'Clear prices before you pay', aed ? 'See and pay every invoice in AED, so your bank does not add currency conversion. The renewal price is shown next to every plan.' : 'Every plan shows the renewal price next to the first payment, so year two holds no surprises.'],
    ['pin', 'Hosted where your visitors are', loc.text ? `Choose ${loc.text.replace(/ and ([^,]+)$/, ' or $1')} when you order. We are open about where each plan runs, and you can measure the speed from your own browser before buying.` : 'Choose the datacenter when you order, and measure the speed from your own browser before buying.'],
    ['move', trustOn(s, 'migration') ? 'We move your site for free' : 'Help moving your site', trustOn(s, 'migration') ? 'Already online somewhere else? Our engineers copy your files, databases and email and switch you over without downtime.' : 'Already online somewhere else? Our engineers can copy your site and email for you.'],
  ];
  const why = `<section class="hp-section" aria-labelledby="ua-why-h"><div class="hp-container">
    ${splitHead({ id: 'ua-why-h', title: 'Why UAE businesses host with us', lead: 'Hosting is easier when the company behind it is on the same clock, bills in the same currency and picks up the phone.' })}
    <div class="ua-rows">${reasons.map(([ic, h, p], i) => `<article class="ua-row${i % 2 ? ' is-alt' : ''}" data-reveal><div class="ua-row__ico">${hexIcon(ic)}<span class="num">0${i + 1}</span></div><div><h3>${esc(h)}</h3><p>${esc(p)}</p></div></article>`).join('')}</div>
  </div></section>`;

  const plans = `<section class="hp-section hp-section--tint" id="plans" aria-labelledby="ua-plans-h"><div class="hp-container">
    ${sectionHead({ id: 'ua-plans-h', title: 'Web hosting plans', lead: 'Every plan includes free SSL, NVMe storage and automatic backups. Choose the location, then the size.' })}
    ${planCards(hosting, { currency, base, locationTabs: true, groupLabel: 'Hosting location', id: 'ua-plans' })}
    ${plansNote(currency, `<span class="hp-pf-links">${link('Help me choose', '/plan-finder')}</span>`)}
  </div></section>`;

  const steps = `<section class="hp-section" aria-labelledby="ua-steps-h"><div class="hp-container">
    ${sectionHead({ id: 'ua-steps-h', title: 'Online in an afternoon' })}
    <ol class="ua-timeline">${[
      ['Pick a plan and a domain', 'Order hosting and register a .com or .ae name in the same checkout.'],
      ['Install or move your site', 'One-click WordPress, upload your files, or let us migrate your existing site.'],
      ['Go live with HTTPS', 'Free SSL is issued automatically, and backups start from the first day.'],
    ].map(([h, p], i) => `<li data-reveal style="--i:${i}"><span class="ua-timeline__dot num">${i + 1}</span><h3>${esc(h)}</h3><p>${esc(p)}</p></li>`).join('')}</ol>
    ${linksRow([['.ae domains', '/ae-domains'], ['Free website migration', '/free-migration'], ['WordPress hosting', '/wordpress-hosting'], ['Business email', '/google-workspace']])}
  </div></section>`;

  const faqs: QA[] = [
    { q: 'Are your servers located in Dubai?', a: `Globalhostia is based in Dubai, and our hosting runs in international datacenters${loc.text ? ` in ${loc.text}` : ''}. You choose the location when ordering, and you can test the speed from your browser on our data centers page.` },
    { q: 'Can I pay for hosting in AED?', a: aed ? 'Yes. Choose AED in the currency menu at the top of the page and your prices, invoices and checkout use dirhams.' : 'Prices are shown in the currencies our billing system supports. Choose yours from the currency menu at the top of the page.' },
    { q: 'Is VAT added to the price?', a: `Prices are shown before tax. ${VAT_NOTE.replace(/^\+/, 'Plus ')}, and the total is shown in the order form before you pay.` },
    { q: 'Do you help move an existing website?', a: trustOn(s, 'migration') ? 'Yes, migration is free. Request it on our free migration page and an engineer will copy your site, databases and email, then help you switch DNS with no downtime.' : 'Yes. Open a request and our engineers will explain the steps and any cost before starting.' },
    { q: 'Can I use a .ae domain with this hosting?', a: 'Yes. Register a .ae domain with us or point an existing one to your hosting. Our team can help with the .ae registry requirements.' },
  ];
  const body = [hero, trustStrip(s), why, plans, steps, faqBlock('ua-faq', 'Web hosting in Dubai: questions', faqs),
    ctaBand({ title: 'Talk to a hosting engineer in Dubai', text: 'Tell us about your site and we will recommend a plan, or start the free migration.', primary: wa ? { label: 'WhatsApp us', href: wa, icon: 'whatsapp' } : { label: 'Contact us', href: '/contact' }, secondary: { label: 'Open the plan finder', href: '/plan-finder' } })].join('\n');
  return { body, faqs, ld: [ld({ '@context': 'https://schema.org', '@type': 'Service', serviceType: 'Web hosting', name: 'Web hosting in Dubai', areaServed: { '@type': 'Country', name: 'United Arab Emirates' }, provider: { '@type': 'Organization', name: s.site_name || 'Globalhostia', url: siteOf(cat) }, url: `${siteOf(cat)}/web-hosting-dubai` })] };
}

/* ================================================================== /vps-uae */
async function vpsUae(cat: Catalog, ctx: PageCtx) {
  const s = cat.settings, { currency, base } = cat;
  const vps = productsFor(cat, ctx.route.categories);
  const av = available(vps);
  const per = (p: TProduct) => fromPrice(p, currency)?.amount ?? 1e9;
  const sorted = [...av].sort((a, b) => per(a) - per(b));
  const small = sorted[0], big = sorted[sorted.length - 1];
  const loc = locText(vps);
  const oses = [...new Set(vps.map((p) => deriveSpecs(p.features, p.attributes).os).filter(Boolean))];
  const wa = waLink(s, 'Hello Globalhostia, I need a VPS for my business in the UAE.');
  const spec = (p?: TProduct) => { if (!p) return []; const x = deriveSpecs(p.features, p.attributes); return [x.cpu, x.ram, x.storage].filter(Boolean) as string[]; };
  const line = (k: string, v: string) => `<div class="ua-con__l"><span class="ua-con__k">${esc(k)}</span><span class="ua-con__v">${esc(v)}</span></div>`;
  const console = small ? `<figure class="ua-con" aria-label="VPS range from the live catalog">
    <div class="ua-con__bar" aria-hidden="true"><i></i><i></i><i></i><span>vps --list-range</span></div>
    <div class="ua-con__body num">
      ${line('smallest', small.name)}${spec(small).map((x) => line('', x)).join('')}${fromText(small, currency) ? line('price', fromText(small, currency)) : ''}
      ${big && big !== small ? `<div class="ua-con__sep" aria-hidden="true"></div>${line('largest', big.name)}${spec(big).map((x) => line('', x)).join('')}${fromText(big, currency) ? line('price', fromText(big, currency)) : ''}` : ''}
      ${oses.length ? line('os', oses.join(' / ')) : ''}${loc.text ? line('regions', loc.text) : ''}
      <div class="ua-con__l"><span class="ua-con__k">$</span><span class="ua-con__cur" aria-hidden="true"></span></div>
    </div>
    <figcaption>Read from the plans on sale today, ${av.length} in total.</figcaption>
  </figure>` : '';
  const hero = pageHero({
    crumbs: crumbsFor(ctx.route.title), eyebrow: 'VPS for UAE businesses', title: 'VPS hosting for the UAE, with root access and a team on WhatsApp',
    lead: `Reserved vCPU and memory, NVMe storage and full root or administrator access${oses.length ? ` on ${oses.join(' or ')}` : ''}. Run your ERP, store, APIs or bots on a server that is yours alone.`,
    ctas: [{ label: 'Compare VPS plans', href: '#plans' }, ...(wa ? [{ label: 'Ask an engineer', href: wa, variant: 'ghost' as const, icon: 'whatsapp' as IconName }] : [])],
    fromHtml: fromHtml(vps, cat, 'VPS') || undefined, visualHtml: console || undefined,
  });
  const uses: [IconName, string, string][] = [
    ['database', 'ERP and accounting', 'Odoo, ERPNext or your accounting database, reachable by the whole team from the office or home.'],
    ['store', 'Busy online stores', 'WooCommerce and Magento stores that have outgrown shared hosting.'],
    ['code', 'APIs and web apps', 'Node.js, Python, PHP or .NET with your own stack and versions.'],
    ['bot', 'Bots and automation', 'n8n, Telegram and WhatsApp bots and scheduled jobs that run all day.'],
    ['box', 'Docker and dev servers', 'Containers, staging environments and CI runners for your team.'],
    ['lock', 'Private services', 'Your own VPN, file sync or Git server, under your control.'],
  ];
  const useSec = `<section class="hp-section" aria-labelledby="ua-use-h"><div class="hp-container">
    ${sectionHead({ id: 'ua-use-h', title: 'What UAE teams run on a VPS', lead: 'If it needs to stay on, stay private or use more than shared hosting allows, a VPS is the next step.' })}
    <ul class="ua-tiles">${uses.map(([ic, h, p], i) => `<li data-reveal style="--i:${i % 3}">${icon(ic)}<h3>${esc(h)}</h3><p>${esc(p)}</p></li>`).join('')}</ul>
  </div></section>`;
  const cmp = sorted.slice(0, 4);
  const table = cmp.length >= 2 ? `<section class="hp-section hp-section--tint" aria-labelledby="ua-cmp-h"><div class="hp-container">
    ${splitHead({ id: 'ua-cmp-h', title: 'Entry plans side by side', lead: 'The four lowest-priced VPS plans on sale today, with live prices in your currency.' })}
    ${specTable(cmp, { currency, caption: 'VPS plan comparison' })}
  </div></section>` : '';
  const plans = `<section class="hp-section" id="plans" aria-labelledby="ua-plans-h"><div class="hp-container">
    ${sectionHead({ id: 'ua-plans-h', title: 'All VPS plans', lead: `${av.length ? `${av.length} plan${av.length > 1 ? 's' : ''}. ` : ''}CPU and memory are reserved for your server only.` })}
    ${planCards(vps, { currency, base, groupBy: oses.length > 1 ? 'os' : undefined, groupLabel: 'Operating system', id: 'ua-vps', orderLabel: 'Order VPS' })}
    ${plansNote(currency, `<span class="hp-pf-links">${link('All VPS details', '/vps-hosting')}${link('Data center speed test', '/data-centers#speed')}</span>`)}
  </div></section>`;
  const faqs: QA[] = [
    { q: 'Where are your VPS servers located?', a: loc.text ? `Our VPS plans run in ${loc.text}. Choose the location when you order; for Gulf visitors, test each option from your browser on our data centers page.` : 'You choose the location when you order. Each plan lists where it runs.' },
    { q: 'Do I get full root or administrator access?', a: 'Yes. Linux servers come with root access and Windows servers with administrator access, so you can install any software you need.' },
    { q: 'Is the VPS managed?', a: 'You manage your own software, and our engineers help with the server, network and operating system whenever you need them, around the clock.' },
    { q: 'Can I upgrade my VPS later?', a: 'Yes. Move to a larger plan or add resources from the order form options, and we explain any price difference before the change.' },
    { q: 'Are prices shown with VAT?', a: `Prices are shown before tax. ${VAT_NOTE.replace(/^\+/, 'Plus ')}, and the full total is shown before you pay. Your renewal price is the same as the price for your billing period.` },
  ];
  const body = [hero, trustStrip(s, { tone: 'light' }), useSec, table, plans,
    `<section class="hp-section ua-links-sec" aria-label="Related pages"><div class="hp-container">${linksRow([['Windows RDP in the UAE', '/windows-rdp-uae'], ['Dedicated servers', '/dedicated-servers'], ['Forex VPS', '/forex-vps'], ['Free migration', '/free-migration']])}</div></section>`,
    faqBlock('ua-faq', 'VPS in the UAE: questions', faqs)].join('\n');
  return { body, faqs };
}

/* ================================================================== /windows-rdp-uae */
async function rdpUae(cat: Catalog, ctx: PageCtx) {
  const s = cat.settings, { currency, base } = cat;
  let rdp = productsFor(cat, ctx.route.categories);
  const fallback = !rdp.length;
  if (fallback) rdp = productsFor(cat, ['hostiavps']).filter((p) => /windows/i.test(deriveSpecs(p.features, p.attributes).os || p.name));
  const wa = waLink(s, 'Hello Globalhostia, I am interested in a Windows RDP server.');
  const desk = `<figure class="ua-desk" aria-hidden="true">
    <div class="ua-desk__win"><div class="ua-desk__title"><i></i><i></i><i></i><span>Remote Desktop</span></div>
      <div class="ua-desk__screen"><div class="ua-desk__icons">${['monitor', 'chart', 'database', 'mail'].map((i) => `<span>${icon(i)}</span>`).join('')}</div>
        <div class="ua-desk__app"><b></b><span></span><span></span><span class="is-short"></span></div>
        <div class="ua-desk__task">${icon('win')}<span></span><span></span><span></span><em>Online</em></div></div></div>
    <div class="ua-desk__dev">${icon('monitor')}${icon('phone')}${icon('cloud')}</div>
  </figure>`;
  const hero = pageHero({
    crumbs: crumbsFor(ctx.route.title), eyebrow: 'Windows RDP · UAE', title: 'A Windows desktop in the cloud that never switches off',
    lead: 'Run MetaTrader, accounting software or any Windows app on a server that stays on around the clock. Connect from your laptop, Mac, iPhone or Android, wherever you are in the Emirates.',
    ctas: [{ label: 'See RDP plans', href: '#plans' }, ...(wa ? [{ label: 'WhatsApp us', href: wa, variant: 'ghost' as const, icon: 'whatsapp' as IconName }] : [])],
    fromHtml: fromHtml(rdp, cat, 'Windows RDP') || undefined, visualHtml: desk,
  });
  const who: [IconName, string, string][] = [
    ['chart', 'Traders', 'MetaTrader terminals and Expert Advisors keep running when your PC sleeps or your Wi-Fi drops.'],
    ['book', 'Accountants and finance teams', 'One desktop with your accounting app and files, shared securely with the people who need it.'],
    ['users', 'Remote and travelling staff', 'The same Windows desktop from the office, home or a hotel, on any device.'],
  ];
  const whoSec = `<section class="hp-section" aria-labelledby="ua-who-h"><div class="hp-container ua-who">
    <div>${sectionHead({ id: 'ua-who-h', title: 'Who uses a Windows RDP server', align: 'left' })}<p class="ua-note">You get administrator access, so you install the software you already use and keep your own licences.</p></div>
    <ul>${who.map(([ic, h, p]) => `<li data-reveal>${hexIcon(ic)}<div><h3>${esc(h)}</h3><p>${esc(p)}</p></div></li>`).join('')}</ul>
  </div></section>`;
  const how = (steps: string[]) => `<ol class="ua-howto">${steps.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>`;
  const connect = `<section class="hp-section hp-section--tint" aria-labelledby="ua-con-h"><div class="hp-container">
    ${sectionHead({ id: 'ua-con-h', title: 'Connect from any device', lead: 'Your login details arrive by email once the server is set up after payment.' })}
    ${bigTabs([
      { label: 'Windows', icon: 'win', panelHtml: how(['Open Remote Desktop Connection from the Start menu.', 'Enter your server IP address and click Connect.', 'Sign in with the administrator user and password from your welcome email.']) },
      { label: 'Mac', icon: 'monitor', panelHtml: how(['Install the free Windows App (Microsoft Remote Desktop) from the Mac App Store.', 'Add a PC with your server IP address.', 'Double-click it and sign in with your administrator details.']) },
      { label: 'Phone or tablet', icon: 'phone', panelHtml: how(['Install the Windows App or Remote Desktop app on iPhone, iPad or Android.', 'Add a PC with your server IP address.', 'Tap to connect and sign in. Rotate the screen for a wider desktop.']) },
    ], { label: 'Device', id: 'ua-con-tabs' })}
  </div></section>`;
  const plans = `<section class="hp-section" id="plans" aria-labelledby="ua-plans-h"><div class="hp-container">
    ${sectionHead({ id: 'ua-plans-h', title: fallback ? 'Windows servers' : 'Windows RDP plans', lead: fallback ? 'Our Windows VPS plans work as an always-on remote desktop.' : 'Set up automatically after payment, with administrator access.' })}
    ${planCards(rdp, { currency, base, id: 'ua-rdp', orderLabel: 'Order RDP', emptyTitle: 'RDP plans are being updated', emptyText: 'Tell us which apps you need to run and we will recommend a Windows server.' })}
    ${plansNote(currency, `<span class="hp-pf-links">${link('All Windows RDP details', '/windows-rdp')}${link('Forex VPS', '/forex-vps')}</span>`)}
  </div></section>`;
  const faqs: QA[] = [
    { q: 'What is a Windows RDP server?', a: 'It is a Windows computer in a datacenter that you use over Remote Desktop. It stays on all the time, so programs keep running when you disconnect.' },
    { q: 'Can I run MetaTrader 4 or 5 on it?', a: 'Yes. Install MetaTrader and your Expert Advisors as you would on your own PC; they keep running after you disconnect.' },
    { q: 'How quickly is my RDP ready?', a: 'Servers are set up automatically after payment, and your login details are emailed to you. If anything needs a manual check, our team handles it and keeps you updated.' },
    { q: 'Can more than one person use it?', a: 'Windows Server allows administrators to connect. For several people working at the same time, ask us about the right Windows licensing for your team.' },
    { q: 'Is the price shown with VAT?', a: `Prices are shown before tax. ${VAT_NOTE.replace(/^\+/, 'Plus ')}. The renewal price is the same as the price for your billing period.` },
  ];
  const body = [hero, trustStrip(s), whoSec, connect, plans,
    `<section class="hp-section ua-links-sec" aria-label="Related pages"><div class="hp-container">${linksRow([['VPS hosting UAE', '/vps-uae'], ['Data centers and speed test', '/data-centers'], ['Plan finder', '/plan-finder']])}</div></section>`,
    faqBlock('ua-faq', 'Windows RDP: questions', faqs)].join('\n');
  return { body, faqs };
}

/* ================================================================== /best-hosting-uae */
async function guide(cat: Catalog, ctx: PageCtx) {
  const s = cat.settings, { currency, base } = cat;
  const site = siteOf(cat);
  const aed = availableCurrencies(cat.products).includes('AED');
  const shared = available(productsFor(cat, H)), vps = available(productsFor(cat, ['hostiavps', 'high-performance-vps'])), rdp = available(productsFor(cat, ['windows-rdp', 'linux-rdp']));
  const cheapest = (ps: TProduct[]) => [...ps].sort((a, b) => (fromPrice(a, currency)?.amount ?? 1e9) - (fromPrice(b, currency)?.amount ?? 1e9))[0];
  const picks = [
    { tag: 'A first website', p: cheapest(shared), why: 'Shared hosting with free SSL and backups. Enough for a company site, a blog or a small shop.' },
    { tag: 'Busy sites and apps', p: cheapest(vps), why: 'Reserved CPU and memory with root access, for stores, ERPs and apps that outgrow shared hosting.' },
    { tag: 'Trading and remote work', p: cheapest(rdp), why: 'An always-on Windows desktop for MetaTrader, accounting software and remote teams.' },
  ].filter((x) => x.p);
  const toc: [string, string][] = [['checklist', 'What to compare'], ['compare', 'Us and typical big providers'], ['picks', 'Our picks by need'], ['ua-faq', 'Questions']];
  const hero = `<section class="ua-hero ua-hero--guide" aria-labelledby="ua-h1"><div class="hp-container">
    ${breadcrumbs(crumbsFor(ctx.route.title), { light: true })}
    <span class="ua-eyebrow">Buyer’s guide · UAE</span>
    <h1 id="ua-h1">How to choose the best web hosting in the UAE</h1>
    <p class="ua-lead">The cheapest headline price is rarely the cheapest hosting. Here is what to check before you buy, how we compare with what large international hosts typically offer, and which of our plans fits each need.</p>
    <p class="ua-meta">${icon('clock')}6 minute read · Prices on this page are live from our billing system</p>
  </div></section>`;
  const checks: [string, string][] = [
    ['The renewal price, not just the first payment', 'Many hosts advertise a low introductory price and renew at a much higher one. Look for the renewal price next to the plan, in writing, before you pay.'],
    ['Where the server actually is', 'Speed for visitors in the Gulf depends on the datacenter location. A host should tell you where each plan runs and let you test it.'],
    ['How you reach support, and when', 'Check the channels (ticket, phone, WhatsApp) and the hours in Gulf time. A chatbot that hands you to a queue at 3am is not 24/7 support.'],
    ['Invoices and currency', 'If you pay in dirhams, AED pricing avoids conversion fees on your card. Check that invoices show your company details and VAT where it applies.'],
    ['Backups and restores', 'Ask how often backups run, how long they are kept, and whether restoring one costs extra.'],
    ['Moving in and moving out', 'A good host moves your existing site for you, and lets you take your data with you if you ever leave.'],
    ['Room to grow', 'Check that you can move from shared hosting to a VPS or dedicated server with the same company when traffic grows.'],
  ];
  const checklist = `<section class="ua-sec" id="checklist" aria-labelledby="ua-chk-h"><h2 id="ua-chk-h" class="hp-hline">What to compare before you buy</h2>
    <ol class="ua-check">${checks.map(([h, p], i) => `<li data-reveal><span class="ua-check__n num">${i + 1}</span><div><h3>${esc(h)}</h3><p>${esc(p)}</p></div></li>`).join('')}</ol></section>`;
  const yes = (t: string) => `<span class="ua-yes">${icon('check')}${esc(t)}</span>`;
  const meh = (t: string) => `<span class="ua-meh">${esc(t)}</span>`;
  const rows: [string, string, string][] = [];
  rows.push(['Renewal price', trustOn(s, 'price-lock') ? yes('Same as your current price for the billing period (price-lock)') : yes('Shown next to every plan before you order'), meh('Low introductory price; renewal is often higher')]);
  if (trustOn(s, 'money-back')) rows.push(['Money-back', yes(trustText(s, 'money-back')), meh('Varies; setup or domain fees are often excluded')]);
  if (trustOn(s, 'migration')) rows.push(['Website migration', yes('Free, done by our engineers'), meh('Often a paid service or a plugin you run yourself')]);
  rows.push(['Support', trustOn(s, 'support') ? yes('24/7 engineers by ticket and WhatsApp') : yes('Engineers by ticket, email and phone'), meh('Chat or ticket queue; phone support may cost extra')]);
  rows.push(['Company', yes('Based in Dubai, on Gulf time'), meh('Often based outside the region')]);
  rows.push(['Currency', aed ? yes('Prices and invoices in AED or USD') : yes('Prices in the currencies our billing supports'), meh('Often USD only, with card conversion fees')]);
  if (trustOn(s, 'payments')) rows.push(['Payment', yes('Card or crypto'), meh('Card, sometimes other wallets')]);
  rows.push(['Server location', yes('Shown for every plan, with a browser speed test'), meh('Sometimes chosen for you')]);
  const compare = `<section class="ua-sec" id="compare" aria-labelledby="ua-cmp-h"><h2 id="ua-cmp-h" class="hp-hline">Globalhostia and typical big providers</h2>
    <p>A general comparison with what large international hosting companies typically offer. Individual providers and plans differ, so always check the terms of the plan you buy.</p>
    <div class="hp-table-wrap ua-cmp"><table class="hp-table"><caption class="sr-only">Globalhostia compared with typical large hosting providers</caption>
      <thead><tr><th scope="col">What to check</th><th scope="col">Globalhostia</th><th scope="col">Typical big providers</th></tr></thead>
      <tbody>${rows.map(([k, a, b]) => `<tr><th scope="row">${esc(k)}</th><td>${a}</td><td>${b}</td></tr>`).join('')}</tbody></table></div></section>`;
  const pickSec = picks.length ? `<section class="ua-sec" id="picks" aria-labelledby="ua-pick-h"><h2 id="ua-pick-h" class="hp-hline">Our picks by need</h2>
    <p>The lowest-priced plan in each family, with its live price. Every plan can be upgraded later.</p>
    <div class="ua-picks" style="--n:${picks.length}">${picks.map(({ tag, p, why }) => {
      const t = fromText(p!, currency);
      return `<article class="ua-pick" data-reveal><span class="ua-pick__tag">${esc(tag)}</span><h3><a href="/p/${esc(p!.slug)}">${esc(p!.name)}</a></h3><p>${esc(why)}</p>
        <p class="ua-pick__price num">${t ? `<b>${esc(t)}</b><small>Renews at the same price · ${esc(VAT_NOTE)}</small>` : '<b>See price</b>'}</p>
        <a class="hp-btn hp-btn--ghost" href="${esc(orderUrl(p!, base, fromPrice(p!, currency)?.cycle))}" aria-label="${esc(`${t ? 'Order' : 'See price'}: ${p!.name}`)}">${t ? 'Order now' : 'See price and order'}</a></article>`;
    }).join('')}</div>
    <p class="ua-pf">${icon('filter')}<span>Want a personal recommendation? <a href="/plan-finder">Answer four questions in the plan finder</a>.</span></p></section>` : '';
  const faqs: QA[] = [
    { q: 'What is the best web hosting in the UAE?', a: 'The best host for you is the one with a fair renewal price, servers close to your visitors, support you can reach in Gulf hours and an easy way to upgrade. Use the checklist on this page to compare any provider, including us.' },
    { q: 'Is it better to host my website inside the UAE?', a: 'Not always. What matters is the round-trip time to your visitors and the reliability of the datacenter. Test the options from your own browser, and use a CDN if your audience is spread across countries.' },
    { q: 'How much should hosting cost per month?', a: 'A small business website usually fits shared hosting; busy stores and apps need a VPS. Compare the renewal price over two or three years, not only the first payment.' },
    { q: 'Do I pay VAT on hosting in the UAE?', a: `VAT applies where the law requires it. ${VAT_NOTE.replace(/^\+/, 'We add ')} and show it in the order form before you pay.` },
    { q: 'Can I switch hosts without downtime?', a: trustOn(s, 'migration') ? 'Yes. With a free migration our engineers copy your site to the new server, test it and only then switch DNS, so visitors never see an outage.' : 'Yes. Copy the site to the new host, test it on a preview address and switch DNS only when it works.' },
  ];
  const body = [hero, `<div class="hp-container ua-guide">
    <aside class="ua-toc" aria-labelledby="ua-toc-h"><h2 id="ua-toc-h">On this page</h2><ol>${toc.map(([id, l]) => `<li><a href="#${id}">${esc(l)}</a></li>`).join('')}</ol>
      <div class="ua-toc__cta"><p>Rather ask a person?</p>${link('Contact our team', '/contact')}</div></aside>
    <div class="ua-article">${checklist}${compare}${pickSec}
      ${linksRow([['Web hosting in Dubai', '/web-hosting-dubai'], ['VPS hosting UAE', '/vps-uae'], ['Windows RDP UAE', '/windows-rdp-uae'], ['.ae domains', '/ae-domains'], ['Free migration', '/free-migration']])}</div>
  </div>`, trustStrip(s), faqBlock('ua-faq', 'Choosing hosting in the UAE: questions', faqs)].join('\n');
  const article = ld({ '@context': 'https://schema.org', '@type': 'Article', headline: 'How to choose the best web hosting in the UAE', description: ctx.route.description, url: `${site}/best-hosting-uae`, inLanguage: 'en',
    author: { '@type': 'Organization', name: s.site_name || 'Globalhostia', url: site }, publisher: { '@type': 'Organization', name: s.site_name || 'Globalhostia', url: site }, mainEntityOfPage: `${site}/best-hosting-uae` });
  return { body, faqs, ld: [article] };
}
