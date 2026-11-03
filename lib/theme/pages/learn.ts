// /compare, /compare/<slug>, /guides and /guides/<slug>: search-traffic comparison and how-to pages.
// Page list, titles and meta: lib/theme/learn.ts. Layout reuses the long-form guide pieces of the UAE pages
// (uae.css: hero, sticky contents, article sections, comparison table, picks) plus learn.css for steps and cards.
// Every price, spec and location comes from the live catalog (getCatalog), so it follows the visitor's currency.
// Competitor brands are never named, and nothing here states a number the catalog does not hold.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { money, CYCLE_MONTHS } from '../../pricing';
import { getCatalog, productsFor, fromPrice, deriveSpecs, orderUrl, cycles, pricedTlds, currencyPrefix, availableCurrencies, type Catalog, type TProduct } from '../data';
import { page } from '../shell';
import { breadcrumbs, breadcrumbJsonLd, sectionHead, faq, faqJsonLd, ctaBand, icon, hexIcon, link, ld, fromText, available, VAT_NOTE, type IconName } from '../ui';
import { trustStrip, trustOn, waLink } from '../growth';
import { siteOf } from './vps';
import { ROUTES } from '../routes';
import { LEARN_SECTIONS, learnPage, learnPages, learnPath, type LearnPage, type LearnSection } from '../learn';

type QA = { q: string; a: string };
type Step = { name: string; html: string };
type Sec = { id: string; title: string; html: string };
type Built = { sections: Sec[]; faqs: QA[]; steps?: Step[]; related: [string, string][] };
type Fam = { key: string; href: string; label: string; products: TProduct[]; cheapest?: TProduct; from: string };

/* ------------------------------------------------------------------ helpers */
const CYC_NAME: Record<string, string> = { monthly: 'Monthly', quarterly: 'Every 3 months', semiannually: 'Every 6 months', annually: 'Yearly', biennially: 'Every 2 years', triennially: 'Every 3 years' };
const perMonthOf = (p: TProduct, cur: string) => fromPrice(p, cur)?.amount ?? 1e9;

/** A product family = the products shown on one of our category pages (ROUTES[key].categories). */
function fam(cat: Catalog, key: string): Fam {
  const r = ROUTES[key];
  const products = available(productsFor(cat, r?.categories));
  const priced = products.filter((p) => fromPrice(p, cat.currency));
  const cheapest = [...(priced.length ? priced : products)].sort((a, b) => perMonthOf(a, cat.currency) - perMonthOf(b, cat.currency))[0];
  return { key, href: `/${key}`, label: r?.title || key, products, cheapest, from: cheapest ? fromText(cheapest, cat.currency) : '' };
}
const specOf = (p?: TProduct) => (p ? deriveSpecs(p.features, p.attributes) : {}) as Record<string, string | undefined>;
const specLine = (p?: TProduct) => { const s = specOf(p); return [s.cpu, s.ram, s.storage].filter(Boolean).join(', '); };
const fromCell = (f: Fam) => (f.from ? `<b class="num">${esc(f.from)}</b><br><a class="ln-a" href="${esc(f.href)}">${esc(f.label)}</a>` : `<a class="ln-a" href="${esc(f.href)}">See ${esc(f.label.toLowerCase())} prices</a>`);

const yes = (t: string) => `<span class="ua-yes">${icon('check')}${t}</span>`;
const meh = (t: string) => `<span class="ua-meh">${t}</span>`;
/** Comparison table: first column is the row header. Cells are trusted HTML built in this file. */
function table(caption: string, head: string[], rows: string[][]) {
  return `<div class="hp-table-wrap ua-cmp ln-tbl"><table class="hp-table"><caption class="sr-only">${esc(caption)}</caption>
    <thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([k, ...v]) => `<tr><th scope="row">${k}</th>${v.map((x) => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
const note = (html: string, ic: IconName = 'info') => `<p class="ln-note">${icon(ic)}<span>${html}</span></p>`;
const code = (t: string) => `<pre class="ln-code"><code>${esc(t)}</code></pre>`;
const ul = (items: string[]) => `<ul class="ln-list">${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
const a = (label: string, href: string) => `<a class="ln-a" href="${esc(href)}">${esc(label)}</a>`;

/** "Matching plans" cards: the lowest-priced plan of each family with its live price, order button and category link. */
function picks(cat: Catalog, items: { f: Fam; tag: string; why: string }[]) {
  const list = items.filter((x) => x.f.cheapest);
  if (!list.length) return note(`Plans are being updated. ${a('Ask our team', '/contact')} for a recommendation.`);
  return `<div class="ua-picks">${list.map(({ f, tag, why }) => {
    const p = f.cheapest!, t = fromText(p, cat.currency), spec = specLine(p);
    return `<article class="ua-pick"><span class="ua-pick__tag">${esc(tag)}</span><h3><a href="/p/${esc(p.slug)}">${esc(p.name)}</a></h3><p>${esc(why)}</p>${spec ? `<p class="ln-spec">${esc(spec)}</p>` : ''}
      <p class="ua-pick__price num">${t ? `<b>${esc(t)}</b><small>${esc(VAT_NOTE)}</small>` : '<b>See price</b>'}</p>
      <a class="hp-btn hp-btn--ghost" href="${esc(orderUrl(p, cat.base, fromPrice(p, cat.currency)?.cycle))}" aria-label="${esc(`${t ? 'Order' : 'See price'}: ${p.name}`)}">${t ? 'Order now' : 'See price and order'}</a>
      <a class="hp-link" href="${esc(f.href)}">All ${esc(f.label.toLowerCase())} plans${icon('arrow')}</a></article>`;
  }).join('')}</div>`;
}

/** Locations named in the catalog, e.g. ["USA", "Singapore"]. */
function locations(ps: TProduct[]) { return [...new Set(ps.map((p) => specOf(p).location).filter(Boolean))] as string[]; }
const andList = (l: string[], word = 'and') => (l.length > 1 ? `${l.slice(0, -1).join(', ')} ${word} ${l[l.length - 1]}` : l[0] || '');

/* ================================================================== comparisons */

function cmpTypes(cat: Catalog): Built {
  const sh = fam(cat, 'shared-hosting'), vps = fam(cat, 'vps-hosting'), cl = fam(cat, 'cloudvps-hosting'), de = fam(cat, 'dedicated-servers');
  const verdicts: [IconName, string, Fam, string][] = [
    ['layers', 'Shared hosting', sh, 'Choose it for a company website, a blog or a small shop. The server is run for you and costs the least.'],
    ['server', 'VPS', vps, 'Choose it when you need your own software, versions or background jobs, with reserved CPU and memory.'],
    ['cloud', 'Managed cloud VPS', cl, 'Choose it when you want the power of a VPS but would rather our engineers look after the server.'],
    ['cpu', 'Dedicated server', de, 'Choose it when one machine’s full CPU, memory, disks and network port must be yours alone.'],
  ];
  const short = `<ul class="ln-verdicts">${verdicts.map(([ic, h, f, t]) => `<li>${hexIcon(ic)}<div><h3>${esc(h)}</h3><p>${esc(t)}</p>${f.from ? `<p class="ln-from num">From <b>${esc(f.from)}</b></p>` : ''}${link(`See ${h.toLowerCase()}`, f.href)}</div></li>`).join('')}</ul>`;
  const start = (f: Fam) => esc(specLine(f.cheapest) || 'Listed on each plan');
  const rows = [
    ['How resources work', 'Shared with other sites on the same server, within your plan’s limits', 'Reserved vCPU and memory on a shared physical host', 'Reserved vCPU and memory, resized as you grow', 'The whole physical machine'],
    ['Root or administrator access', 'No, you use a control panel', 'Yes', 'Yes', 'Yes'],
    ['Who runs the server', 'We do', 'You run your software; our engineers help with the server, network and OS', 'Our engineers, together with you', 'You, with our engineers on call for the hardware and network'],
    ['Your own software and versions', 'Within what the platform supports', 'Anything that runs on the OS', 'Anything that runs on the OS', 'Anything, including your own virtualisation'],
    ['Smallest plan today', start(sh), start(vps), start(cl), start(de)],
    ['Live starting price', fromCell(sh), fromCell(vps), fromCell(cl), fromCell(de)],
    ['Typical use', 'Company sites, blogs, small stores', 'Apps, APIs, busy stores, bots', 'Growing stores and apps without a sysadmin', 'Large databases, heavy traffic, private clouds'],
  ];
  const tbl = table('Shared, VPS, cloud VPS and dedicated hosting compared', ['<span class="sr-only">What to compare</span>', 'Shared', 'VPS', 'Cloud VPS', 'Dedicated'], rows)
    + note(`Prices are the lowest live price in each family, in ${esc(cat.currency)}, ${esc(VAT_NOTE)}. Plans differ, so check the plan you buy.`);
  const outgrown = ul([
    '<b>You keep hitting your plan’s limits.</b> Resource warnings in the control panel, or pages that slow down only when traffic peaks.',
    '<b>You need software the platform does not offer.</b> A specific PHP, Node.js or database version, Docker, a queue worker or a custom port.',
    '<b>Jobs must run all the time.</b> Bots, scheduled tasks, websockets and automation tools like n8n need a VPS.',
    '<b>Your VPS is busy all day.</b> CPU close to 100% for long periods, or a database that no longer fits in memory, points to a larger VPS or a dedicated server.',
    '<b>You need isolation.</b> Some contracts or audits ask that no other customer shares your hardware: that is a dedicated server.',
  ]);
  return {
    sections: [
      { id: 'short', title: 'The short answer', html: short },
      { id: 'table', title: 'Side by side', html: tbl },
      { id: 'outgrown', title: 'Signs it is time to move up', html: `<p>Most sites start on shared hosting and never need more. These are the signals that you do:</p>${outgrown}<p>Not sure? The ${a('plan finder', '/plan-finder')} asks four questions and recommends a plan from our live catalog.</p>` },
      { id: 'plans', title: 'Matching plans', html: picks(cat, [
        { f: sh, tag: 'Shared', why: 'Free SSL, email and backups, with the server run for you.' },
        { f: vps, tag: 'VPS', why: 'Reserved resources and full root or administrator access.' },
        { f: de, tag: 'Dedicated', why: 'A whole bare-metal machine with full root access.' },
      ]) },
    ],
    faqs: [
      { q: 'What is the difference between shared hosting and a VPS?', a: 'Shared hosting places many websites on one server with a fixed software stack and a control panel. A VPS is a virtual server of your own with reserved vCPU and memory, its own operating system and full root or administrator access.' },
      { q: 'Is cloud hosting the same as a VPS?', a: 'A cloud VPS is a virtual server too. On our managed cloud VPS plans our engineers look after the server with you, and you can move between plan sizes as your traffic changes.' },
      { q: 'When do I need a dedicated server?', a: 'When a large VPS is busy all day, when you need very large memory or disks, the full network port, or hardware that no other customer shares.' },
      { q: 'Can I start on shared hosting and upgrade later?', a: 'Yes. Start small and move to a VPS or dedicated server when you need to. Our engineers can move your site for you, so you do not have to rebuild it.' },
      { q: 'Which is cheapest?', a: `Shared hosting${sh.from ? `, from ${sh.from} today` : ''}. The live starting price of every type is in the table on this page, in your currency.` },
    ],
    related: [['Managed vs unmanaged VPS', '/compare/managed-vs-unmanaged-vps'], ['How to choose a VPS size', '/guides/choose-vps-size'], ['Plan finder', '/plan-finder'], ['Free migration', '/free-migration']],
  };
}

function cmpPanels(cat: Catalog): Built {
  const all = available(cat.products);
  const has = (re: RegExp) => all.filter((p) => re.test([p.name, p.tagline, ...p.features].join(' ')));
  const cp = has(/cpanel/i), da = has(/directadmin/i);
  const famsWith = (ps: TProduct[]) => {
    const keys = ['shared-hosting', 'wordpress-hosting', 'cpanel-reseller', 'vps-hosting', 'cloudvps-hosting', 'dedicated-servers'];
    return keys.filter((k) => { const cats = new Set(ROUTES[k]?.categories || []); return ps.some((p) => cats.has(p.categorySlug)); }).map((k) => a(ROUTES[k].title, `/${k}`));
  };
  const reseller = fam(cat, 'cpanel-reseller');
  const rows = [
    ['Email, webmail and forwarders', yes('Yes'), yes('Yes')],
    ['DNS zone editor', yes('Yes'), yes('Yes')],
    ['Files, FTP and databases', yes('File manager, FTP accounts, MySQL or MariaDB with phpMyAdmin'), yes('File manager, FTP accounts, MySQL or MariaDB with phpMyAdmin')],
    ['One-click app installers', yes('Supported, for example Softaculous, when the host includes it'), yes('Supported, for example Softaculous, when the host includes it')],
    ['Backups', yes('Built-in account backups and restores'), yes('Built-in account backups and restores')],
    ['Reseller accounts', yes('Through WHM, the server and reseller side of cPanel'), yes('Built in as a reseller access level')],
    ['Server footprint', meh('Heavier; needs more memory on small servers'), yes('Lighter; comfortable on a small VPS')],
    ['Licence', meh('Commercial, generally priced by the number of accounts'), meh('Commercial, generally lower priced at the same account count')],
    ['Learning curve', yes('Very widely documented; most tutorials assume it'), yes('Simpler menus, fewer screens')],
  ];
  const ours: string[] = [];
  if (cp.length) ours.push(`<b>cPanel</b> is listed on ${cp.length} plan${cp.length === 1 ? '' : 's'} in our live catalog${famsWith(cp).length ? `, in ${andList(famsWith(cp))}` : ''}.`);
  else if (reseller.products.length) ours.push(`<b>cPanel</b> powers our ${a('cPanel reseller hosting', '/cpanel-reseller')}, with WHM for managing your clients.`);
  if (da.length) ours.push(`<b>DirectAdmin</b> is listed on ${da.length} plan${da.length === 1 ? '' : 's'}${famsWith(da).length ? `, in ${andList(famsWith(da))}` : ''}.`);
  ours.push(`On a ${a('VPS', '/vps-hosting')} or ${a('dedicated server', '/dedicated-servers')} you have root access, so you can install either panel with a licence from its vendor, or ask our engineers which fits your server.`);
  const steps = ul([
    '<b>Back up everything on the old panel</b>, including databases and mailboxes.',
    '<b>Use the target panel’s import tool</b> where one exists: both panels can import accounts from the other, with some limits for email and settings.',
    '<b>Check PHP versions, cron jobs and DNS records</b> after the import, since each panel stores them differently.',
    '<b>Test on a temporary address</b> before you change DNS.',
  ]);
  return {
    sections: [
      { id: 'what', title: 'What a control panel does', html: `<p>A control panel is the web dashboard where you create email accounts, databases, FTP users and DNS records, install apps like WordPress and restore backups, without typing commands on the server. cPanel and DirectAdmin both do this well. They differ mostly in weight, licence cost and how familiar they are.</p>` },
      { id: 'table', title: 'Feature by feature', html: table('cPanel compared with DirectAdmin', ['<span class="sr-only">Feature</span>', 'cPanel', 'DirectAdmin'], rows) + note('Features depend on the licence and the add-ons a host installs. Check the plan details before you order.') },
      { id: 'which', title: 'Which one should you pick?', html: ul([
        '<b>Pick cPanel</b> if you want the panel most guides, developers and agencies already know, or you run reseller hosting for clients who expect it.',
        '<b>Pick DirectAdmin</b> if you run your own small VPS, want the panel to use as little memory as possible and want a lower licence cost.',
        '<b>Pick neither</b> for a single application server managed with SSH, Docker or a deployment tool: a panel adds little there.',
      ]) },
      { id: 'ours', title: 'Which panel comes with our plans', html: ul(ours) + (reseller.from ? `<p>cPanel reseller hosting starts at <b class="num">${esc(reseller.from)}</b> today. ${link('See reseller plans', '/cpanel-reseller')}</p>` : '') },
      { id: 'switch', title: 'Switching from one panel to the other', html: steps + `<p>Moving to us? Our ${a('free migration', '/free-migration')} accepts sites from cPanel, Plesk, DirectAdmin or plain WordPress, and our engineers handle the differences for you.</p>` },
    ],
    faqs: [
      { q: 'Is cPanel better than DirectAdmin?', a: 'Neither is better for everyone. cPanel is the most widely known panel with the largest set of tutorials. DirectAdmin is lighter on server resources and generally cheaper to license. Both handle email, DNS, databases, files and backups.' },
      { q: 'Can I move a site from DirectAdmin to cPanel?', a: 'Yes. cPanel can import accounts from DirectAdmin, and our free migration service moves sites from DirectAdmin, cPanel and Plesk for you.' },
      { q: 'Can I install a control panel on my VPS?', a: 'Yes. With root access you can install cPanel or DirectAdmin on a supported Linux distribution. You need a licence from the panel vendor; ask our engineers if you want help choosing.' },
      { q: 'What is WHM?', a: 'WHM (WebHost Manager) is the server and reseller side of cPanel. Resellers use it to create cPanel accounts and packages for their own clients.' },
    ],
    related: [['cPanel reseller hosting', '/cpanel-reseller'], ['Shared vs VPS vs cloud vs dedicated', '/compare/shared-vs-vps-vs-cloud-vs-dedicated'], ['Free migration', '/free-migration'], ['Plan finder', '/plan-finder']],
  };
}

function cmpManaged(cat: Catalog): Built {
  const vps = fam(cat, 'vps-hosting'), cl = fam(cat, 'cloudvps-hosting');
  const rows = [
    ['Operating system install', 'Prepared for you', 'Installed from a template; you configure the rest'],
    ['Security updates and patches', 'Applied with you', 'Your job, every week'],
    ['Firewall and hardening', 'Set up for you', 'You configure it'],
    ['Monitoring and alerts', 'Watched around the clock', 'You set up your own'],
    ['Backups', 'Scheduled for you', 'You script and store them, or add a backup option'],
    ['When something breaks at 3am', 'Engineers troubleshoot the server', 'You debug it'],
    ['Root or administrator access', yes('Yes'), yes('Yes')],
    ['Live starting price', fromCell(cl), fromCell(vps)],
  ].map(([k, m, u]) => [esc(k), m.startsWith('<') ? m : esc(m), u.startsWith('<') ? u : esc(u)]);
  const who = ul([
    '<b>Managed suits</b> online stores, agencies and businesses without a system administrator, or anyone who would rather spend the time on their product.',
    '<b>Unmanaged suits</b> developers and teams who already run Linux or Windows servers, automate them with their own tools and want full control of every package.',
    '<b>Either way</b> you keep root or administrator access, and you can move from one to the other later.',
  ]);
  const costs = `<p>The plan price is only part of the cost. With an unmanaged server, your own time (or a contractor’s) goes into updates, monitoring and recovery. Compare that time with the difference between the two starting prices below before deciding.</p>`;
  return {
    sections: [
      { id: 'difference', title: 'The difference in one sentence', html: '<p>On a managed VPS, engineers look after the server itself (operating system, security updates, monitoring and backups) while you run your website or app. On an unmanaged VPS, the server is handed over to you and everything after the first boot is yours.</p>' },
      { id: 'table', title: 'Who does what', html: table('Managed VPS compared with an unmanaged VPS', ['Task', 'Managed (cloud VPS)', 'Unmanaged (VPS)'], rows) + note('Our VPS plans are self-managed, yet our engineers still help with the server, network and operating system whenever you ask. The exact management scope of each plan is shown in the order form.') },
      { id: 'who', title: 'Which one fits you', html: who + costs },
      { id: 'plans', title: 'Matching plans', html: picks(cat, [
        { f: cl, tag: 'Managed', why: 'Engineers look after the server with you, around the clock.' },
        { f: vps, tag: 'Self-managed', why: 'Reserved resources and full control of every package.' },
      ]) },
    ],
    faqs: [
      { q: 'What does a managed VPS include?', a: 'Server setup, operating system and security updates, monitoring and scheduled backups, with engineers who troubleshoot the server when something goes wrong. The exact scope for each plan is shown in the order form.' },
      { q: 'Do I still get root access on a managed VPS?', a: 'Yes. You keep root or administrator access on both, so you can install your own software.' },
      { q: 'Will you help me on an unmanaged VPS?', a: 'Yes. Our engineers help with the server, network and operating system whenever you ask. Work inside your own application may be quoted separately, and we tell you before starting.' },
      { q: 'Can I switch from unmanaged to managed later?', a: 'Yes. Contact us and we will move you to a managed plan, or check whether your current server can be taken over as it is.' },
    ],
    related: [['Managed cloud VPS', '/cloudvps-hosting'], ['VPS hosting', '/vps-hosting'], ['How to choose a VPS size', '/guides/choose-vps-size'], ['Plan finder', '/plan-finder']],
  };
}

function cmpAeCom(cat: Catalog): Built {
  const prefix = currencyPrefix(cat) || '$';
  const tl = pricedTlds(cat);
  const ae = tl.find((t) => t.tld === '.ae'), com = tl.find((t) => t.tld === '.com');
  const m = (v: number | null | undefined) => (v === null || v === undefined ? '<span class="ua-meh">Shown in the order form</span>' : `<b class="num">${esc(money(v, prefix))}</b>`);
  const rows = [
    ['Who can register', 'Generally needs a UAE presence, such as a trade licence or local contact; registry rules apply', 'Anyone, anywhere'],
    ['What it tells visitors', 'A business based in or serving the UAE', 'A global or international brand'],
    ['Search targeting', 'Country domain: search engines treat it as aimed at the UAE', 'Generic: you can target any country or several'],
    ['Short names still free', 'Often easier to find', 'Most short words are taken'],
    ['Paperwork', 'Documents may be requested', 'None'],
  ].map((r) => r.map(esc));
  rows.push(['First year', m(ae?.register), m(com?.register)], ['Renewal (per year)', m(ae?.renew), m(com?.renew)], ['Transfer in', m(ae?.transfer), m(com?.transfer)]);
  return {
    sections: [
      { id: 'short', title: 'The short answer', html: '<p>If you sell mainly to customers in the Emirates and qualify for it, a .ae name reads as local and helps search engines show you to people in the UAE. If you sell across borders, or do not qualify, .com is the safe default. Many businesses register both and point one at the other.</p>' },
      { id: 'table', title: '.ae and .com side by side', html: table('.ae compared with .com', ['<span class="sr-only">What to compare</span>', '.ae', '.com'], rows) + note(`Live prices in ${esc(cat.currency)} from our billing system, ${esc(VAT_NOTE)}. Other registrars set their own prices; compare the renewal price, not only the first year.`) },
      { id: 'both', title: 'Why many businesses register both', html: ul([
        '<b>Protect the brand.</b> Nobody else can take the matching name and confuse your customers.',
        '<b>Catch typing habits.</b> Visitors who type .com out of habit still reach you.',
        '<b>One main address.</b> Pick one as your main website and email address and redirect the other to it, so search engines see a single site.',
      ]) + `<p>${link('Search both now', '/domains-registration')}</p>` },
      { id: 'ae', title: 'Registering .ae', html: `<p>The .ae registry sets its own eligibility rules, and they can change. Our ${a('.ae registration guide', '/guides/register-ae-domain')} lists what to prepare, and the ${a('.ae domains page', '/ae-domains')} has the live price and a search box.</p>` },
    ],
    faqs: [
      { q: 'Is .ae better than .com for SEO in the UAE?', a: 'A country domain like .ae tells search engines your site is aimed at the UAE, which can help local results. A .com can rank just as well with good content and local signals, and is not tied to one country.' },
      { q: 'Can a foreign company register a .ae domain?', a: 'The .ae registry generally expects a presence in the UAE, such as a trade licence or a local contact. Rules can change, so ask us and we will confirm the current requirements for your case before you order.' },
      { q: 'Should I use .ae or .com for business email?', a: 'Either works. Use the domain you put on your website and business cards, and keep the other redirecting to it.' },
      { q: 'How much do .ae and .com cost?', a: ae || com ? `Today: ${[ae ? `.ae ${money(ae.register!, prefix)} for the first year${ae.renew !== null ? `, renewing at ${money(ae.renew, prefix)}` : ''}` : '', com ? `.com ${money(com.register!, prefix)} for the first year${com.renew !== null ? `, renewing at ${money(com.renew, prefix)}` : ''}` : ''].filter(Boolean).join('; ')} (${cat.currency}, before VAT where it applies).` : 'Live prices for both are shown in our domain search and the order form before you pay.' },
    ],
    related: [['.ae domains', '/ae-domains'], ['Domain registration', '/domains-registration'], ['How to register a .ae domain', '/guides/register-ae-domain'], ['Business email setup', '/guides/business-email-setup']],
  };
}

function cmpDataCenter(cat: Catalog): Built {
  const all = available(cat.products);
  const locs = locations(all);
  const uae = locs.filter((l) => /UAE|Dubai/i.test(l));
  const abroad = locs.filter((l) => !/UAE|Dubai/i.test(l));
  const offer = uae.length
    ? `<p>Our live catalog includes plans in ${esc(andList(uae))}${abroad.length ? ` as well as ${esc(andList(abroad))}` : ''}. Each plan shows its location before you order.</p>`
    : `<p>Our plans run in international datacenters${abroad.length ? ` in ${esc(andList(abroad))}` : ''}, and each plan shows its location before you order. The company and support team are in Dubai, on Gulf time.</p>`;
  const rows = [
    ['Network distance to UAE visitors', 'Shortest', 'Longer; depends on the route and the country'],
    ['Data residency rules', 'Data stays in the country', 'Data is stored abroad; check whether your sector allows it'],
    ['Choice of plans and hardware', 'Narrower in most markets', 'Wide'],
    ['Price for the same resources', 'Often higher', 'Often lower'],
    ['Visitors outside the UAE', 'Further away', 'Can be closer, depending on the location'],
  ].map((r) => r.map(esc));
  return {
    sections: [
      { id: 'short', title: 'The short answer', html: '<p>Host inside the UAE when a law, regulator or contract requires your data to stay in the country, or when every millisecond matters to visitors who are all in the Emirates. For most business websites, a well-connected overseas datacenter, plus caching or a CDN, is fast enough and gives you more choice for the money. Measure before you decide.</p>' },
      { id: 'table', title: 'Local and overseas compared', html: table('UAE datacenter compared with overseas hosting', ['<span class="sr-only">What to compare</span>', 'In the UAE', 'Overseas'], rows) },
      { id: 'latency', title: 'Latency: measure it, do not guess', html: `<p>Speed depends on the network route between your visitors and the server, not only on the distance on a map. Open our ${a('data centers page', '/data-centers#speed')} to test the round-trip time from your own browser to each of our locations, then pick the fastest for your audience.</p>${ul(['<b>Cache pages</b> so most visits never wait for the server.', '<b>Use a CDN</b> for images, scripts and styles when your audience is spread across countries.', '<b>Keep the database next to the application</b>, wherever you host it.'])}` },
      { id: 'residency', title: 'Data residency', html: `<p>Some sectors, such as government, health and financial services, can have rules on where personal or customer data is stored. These rules depend on your sector, your regulator and your contracts. ${note('This is general information, not legal advice. Check the requirements that apply to your business with your regulator or a legal adviser.')}</p>` },
      { id: 'ours', title: 'Where our servers are', html: offer + `<p>${link('Test the speed from your browser', '/data-centers#speed')}</p>` },
    ],
    faqs: [
      { q: 'Is hosting inside the UAE faster?', a: 'For visitors in the UAE, a server in the country usually has the shortest network path. Whether you notice the difference depends on your site; caching and a CDN often close most of the gap. Test from your own browser on our data centers page.' },
      { q: 'Does UAE law require my website to be hosted in the UAE?', a: 'Not for every website. Some sectors and contracts have data residency requirements. This page is general information, not legal advice; check with your regulator or adviser.' },
      { q: 'Which location should I choose for visitors in the Gulf?', a: 'The one with the lowest round-trip time from where your visitors are. Our data centers page measures it from your browser for each location.' },
      { q: 'Can I move my site to another location later?', a: 'Yes. Our engineers can move your site between locations; contact support and we plan the move with you.' },
    ],
    related: [['Data centers and speed test', '/data-centers'], ['Web hosting in Dubai', '/web-hosting-dubai'], ['VPS hosting UAE', '/vps-uae'], ['Plan finder', '/plan-finder']],
  };
}

function cmpBilling(cat: Catalog): Built {
  const cur = cat.currency;
  const order = ['quarterly', 'semiannually', 'annually', 'biennially', 'triennially'];
  // savings of each longer cycle against the same plan's monthly price, across every plan that offers both
  const stats = new Map<string, number[]>();
  let plans = 0;
  for (const p of available(cat.products)) {
    const cs = cycles(p, cur); const mo = cs.find((c) => c.cycle === 'monthly');
    if (!mo || !(mo.price > 0)) continue;
    let used = false;
    for (const c of cs) {
      if (!order.includes(c.cycle) || !(c.price > 0)) continue;
      const l = stats.get(c.cycle) || []; l.push((1 - c.perMonth / mo.price) * 100); stats.set(c.cycle, l); used = true;
    }
    if (used) plans++;
  }
  const pct = (v: number) => `${Math.round(v)}%`;
  const rangeRows = order.filter((c) => stats.get(c)?.length).map((c) => {
    const l = stats.get(c)!; const lo = Math.min(...l), hi = Math.max(...l);
    const r = hi <= 0.5 ? 'No saving' : Math.round(lo) === Math.round(hi) ? pct(hi) : `${pct(Math.max(0, lo))} to ${pct(hi)}`;
    return [esc(CYC_NAME[c]), `<span class="num">${l.length}</span>`, `<b class="num">${esc(r)}</b>`];
  });
  const rangeTbl = rangeRows.length
    ? table('Savings of each billing period compared with paying monthly', ['Billing period', 'Plans offering it', 'Saving vs monthly'], rangeRows)
      + note(`Calculated just now from the live prices of ${plans} plan${plans === 1 ? '' : 's'} that offer monthly billing, in ${esc(cur)}.`)
    : note('Longer billing periods and their prices are shown on every plan and in the order form.');
  const example = (f: Fam, label: string) => {
    const p = f.products.filter((x) => cycles(x, cur).some((c) => c.cycle === 'monthly')).sort((x, y) => perMonthOf(x, cur) - perMonthOf(y, cur))[0];
    if (!p) return '';
    const cs = cycles(p, cur).filter((c) => CYCLE_MONTHS[c.cycle] && c.price > 0);
    const mo = cs.find((c) => c.cycle === 'monthly');
    if (!mo || cs.length < 2) return '';
    const rows = cs.map((c) => {
      const m = CYCLE_MONTHS[c.cycle]; const over36 = c.price * (36 / m) + c.setup;
      const save = (1 - c.perMonth / mo.price) * 100;
      return [esc(CYC_NAME[c.cycle] || c.cycle), `<span class="num">${esc(money(c.price, c.prefix))}</span>`, `<span class="num">${esc(money(c.perMonth, c.prefix))}</span>`, c.cycle === 'monthly' ? '<span class="ua-meh">-</span>' : `<b class="num">${save >= 0.5 ? esc(pct(save)) : 'None'}</b>`, `<span class="num">${esc(money(over36, c.prefix))}</span>`];
    });
    return `<h3 class="ln-h3">${esc(label)}: ${a(p.name, `/p/${p.slug}`)}</h3>` + table(`${p.name} billing periods`, ['Billing period', 'You pay', 'Per month', 'Saving', 'Over 3 years'], rows);
  };
  const ex = [example(fam(cat, 'shared-hosting'), 'Shared hosting'), example(fam(cat, 'vps-hosting'), 'VPS')].filter(Boolean).join('');
  return {
    sections: [
      { id: 'short', title: 'The short answer', html: '<p>Paying for a longer period up front lowers the monthly equivalent on most plans. Pay monthly while you are testing an idea or expect to change plans soon; pay yearly or for three years once you know the plan fits and want the lowest total.</p>' },
      { id: 'savings', title: 'How much each period saves', html: rangeTbl },
      { id: 'examples', title: 'Worked examples from today’s prices', html: ex ? `<p>The lowest-priced plan in two families, with every billing period it offers. “Over 3 years” is what you would pay in total for 36 months on that period, including any setup fee once.</p>${ex}${note(`Prices in ${esc(cur)}, ${esc(VAT_NOTE)}.`)}` : note('Every plan page shows its billing periods and prices in your currency.') },
      { id: 'renewal', title: 'Renewal prices', html: `<p>Each billing period renews at the price shown for that period, so the saving continues at renewal${trustOn(cat.settings, 'price-lock') ? ', and with our price-lock your renewal price does not go up' : ''}. Typical providers often advertise a low introductory price for a long term and renew at a higher one, so always compare the renewal price.</p>` },
      { id: 'choose', title: 'Which period to choose', html: ul([
        '<b>Monthly</b> keeps your options open: good for testing, short projects and servers you may resize soon.',
        '<b>Yearly</b> is the usual balance between saving and flexibility for a site that is already running.',
        '<b>Two or three years</b> gives the lowest monthly equivalent when you are sure about the plan, and fixes your cost for longer.',
      ]) + (trustOn(cat.settings, 'money-back') ? `<p>Unsure? Shared hosting comes with a money-back period; see the terms in the order form.</p>` : '') },
    ],
    faqs: [
      { q: 'Is it cheaper to pay for 3 years of hosting?', a: rangeRows.length && stats.get('triennially')?.length ? `On our plans that offer it, three-year billing has a lower monthly equivalent than monthly billing. The exact saving for every plan is calculated from live prices on this page.` : 'Longer billing periods usually have a lower monthly equivalent. Each plan shows its periods and prices before you order.' },
      { q: 'Does the price go up when I renew?', a: 'Each billing period renews at the price shown for that period. The price is confirmed in the order form and on your invoice.' },
      { q: 'Can I change my billing period later?', a: 'Yes. Ask support or change it from the client area before your next invoice is created, and the new period applies from the next renewal.' },
      { q: 'What happens if I upgrade during a long billing period?', a: 'You pay the difference for the remaining time on your period. We confirm the amount before the upgrade is applied.' },
    ],
    related: [['Plan finder', '/plan-finder'], ['Shared hosting', '/shared-hosting'], ['VPS hosting', '/vps-hosting'], ['Free migration', '/free-migration']],
  };
}

/* ================================================================== guides */

function gMove(cat: Catalog): Built {
  const migration = trustOn(cat.settings, 'migration');
  const steps: Step[] = [
    { name: 'List what you are moving', html: '<p>Write down every website, database, mailbox, cron job and subdomain on the old host, and where the domain is registered. Note the PHP version your site uses.</p>' },
    { name: 'Order hosting at Globalhostia', html: `<p>Pick a plan with enough storage, websites and mailboxes for that list. The ${a('plan finder', '/plan-finder')} helps if you are unsure. Do not cancel the old host yet.</p>` },
    { name: 'Take a full backup', html: '<p>Download a full backup from the old control panel, or at least a copy of the files and an export (.sql) of every database. Keep it on your computer until the move is finished.</p>' },
    { name: 'Copy files and databases', html: `<p>Upload the files to <code>public_html</code> with the file manager or FTP, create a new database and user in the control panel, and import the .sql file with phpMyAdmin. For WordPress, update the database name, user and password in <code>wp-config.php</code>.</p>${code("define( 'DB_NAME', 'account_dbname' );\ndefine( 'DB_USER', 'account_dbuser' );\ndefine( 'DB_PASSWORD', 'your-new-password' );")}` },
    { name: 'Recreate mailboxes and copy mail', html: '<p>Create the same email addresses on the new hosting. To keep old messages, connect both accounts in a desktop mail app over IMAP and drag the folders across, or ask us to copy them.</p>' },
    { name: 'Test before switching', html: '<p>Preview the site on the new server before DNS changes, for example by adding the new server IP for your domain to your computer’s hosts file. Click through forms, logins and checkout.</p>' },
    { name: 'Lower the DNS TTL, then switch', html: `<p>A day before, lower the TTL of your DNS records to a few minutes. Then change the nameservers, or the A and MX records, to the values in your welcome email. Our ${a('nameserver guide', '/guides/change-nameservers')} shows both ways.</p>` },
    { name: 'Check, then cancel the old host', html: '<p>Once the new site and email work for everyone, and no new mail arrives on the old server, take one last backup and cancel the old hosting.</p>' },
  ];
  return {
    steps,
    sections: [
      { id: 'free', title: 'The easy way: let us do it', html: `<p>${migration ? 'Migration is free.' : 'Our engineers can move your site for you.'} Tell us where the site is hosted and our engineers copy the files, databases and email, test the site on our servers and help you switch DNS when you are ready, with no downtime.</p><p>${link('Request a free migration', '/free-migration')}</p>` },
      { id: 'diy', title: 'Doing it yourself, step by step', html: '' },
      { id: 'pitfalls', title: 'Common pitfalls', html: ul([
        '<b>Cancelling the old host too early.</b> Keep it until DNS has fully switched and mail has stopped arriving there.',
        '<b>Hard-coded old addresses.</b> Search the database for the old server path or temporary URL and replace it.',
        '<b>Different PHP version.</b> Select the same version in the control panel first, then upgrade on purpose later.',
        '<b>Forgotten cron jobs and email forwarders.</b> Recreate them from your list in step one.',
      ]) },
    ],
    faqs: [
      { q: 'Will my website go down while it moves?', a: 'No, if you copy everything first and switch DNS only after testing. Visitors move to the new server gradually as DNS updates, and both copies work in the meantime.' },
      { q: 'How long does a migration take?', a: 'Copying usually takes from minutes to a few hours depending on size. DNS changes then take effect for most visitors within hours, and can take up to 48 hours everywhere.' },
      { q: 'Do I need to transfer my domain too?', a: 'No. You can keep the domain at its current registrar and only point it to us. Transferring it is optional and can be done later.' },
      { q: 'Is your migration really free?', a: migration ? 'Yes. Request it on our free migration page; our engineers handle the copy and help you switch DNS.' : 'Open a request and our engineers will explain the steps and any cost before starting.' },
    ],
    related: [['Free migration', '/free-migration'], ['Change nameservers', '/guides/change-nameservers'], ['Install SSL', '/guides/install-ssl'], ['Plan finder', '/plan-finder']],
  };
}

function gNameservers(cat: Catalog): Built {
  const steps: Step[] = [
    { name: 'Find your new DNS details', html: '<p>Your hosting welcome email lists our nameservers and your server’s IP address. They are also in the client area under your hosting service.</p>' },
    { name: 'Sign in where the domain is registered', html: '<p>That is the company you pay for the domain renewal. If you are not sure, a WHOIS lookup of your domain shows the registrar.</p>' },
    { name: 'Copy any records you still need', html: '<p>If the old DNS has records for things that are not moving, such as email at another provider, write them down (MX, TXT, CNAME) so you can add them again.</p>' },
    { name: 'Replace the nameservers', html: '<p>Open the domain’s nameserver or DNS settings, choose custom nameservers, remove the old ones and enter ours exactly as written. Save.</p>' },
    { name: 'Wait for DNS to update', html: '<p>Most visitors see the change within a few hours; allow up to 48 hours everywhere. Keep the old hosting running until then.</p>' },
    { name: 'Check the result', html: `<p>Look up your domain with a DNS checker, or from a terminal:</p>${code('dig NS yourdomain.com +short\ndig A yourdomain.com +short')}` },
  ];
  const rows = [
    ['What changes', 'Who answers for all DNS records', 'Only the records you edit'],
    ['Where you edit DNS later', 'In our control panel or client area', 'At your current DNS provider'],
    ['Keeps email or other services elsewhere', 'Only if you add their records again', 'Yes, untouched'],
    ['Best for', 'Moving everything to us', 'Keeping DNS, a CDN or email where it is'],
  ].map((r) => r.map(esc));
  return {
    steps,
    sections: [
      { id: 'ways', title: 'Two ways to point a domain', html: `<p>You can hand the whole domain to our nameservers, or keep your current DNS provider and change only the records for the website (A or CNAME) and email (MX).</p>${table('Changing nameservers compared with editing DNS records', ['<span class="sr-only">What changes</span>', 'Change nameservers', 'Edit A/CNAME/MX records'], rows)}` },
      { id: 'steps', title: 'Change nameservers step by step', html: '' },
      { id: 'records', title: 'Or point individual records', html: `<p>At your current DNS provider, set:</p>${ul(['<b>A record</b> for <code>@</code> (the bare domain) to your server IP.', '<b>CNAME</b> for <code>www</code> to your bare domain, or an A record to the same IP.', '<b>MX records</b> to your mail service, if email moves too. See the ' + a('business email guide', '/guides/business-email-setup') + '.'])}${code('@     A      203.0.113.10\nwww   CNAME  yourdomain.com.\n@     MX 10  mail.yourdomain.com.')}${note('Example values only. Use the IP address and mail server from your welcome email.')}` },
    ],
    faqs: [
      { q: 'How long do nameserver changes take?', a: 'Usually a few hours, and up to 48 hours for every network worldwide, because resolvers cache the old answer until it expires.' },
      { q: 'Will my email stop working when I change nameservers?', a: 'It can, if your email is hosted elsewhere and its MX records are not added to the new DNS. Copy those records first, or point only the website records instead.' },
      { q: 'Do I need to transfer my domain to change nameservers?', a: 'No. You can change nameservers at any registrar. Transferring the domain is a separate, optional step.' },
      { q: 'What is the difference between nameservers and DNS records?', a: 'Nameservers decide which service answers for your domain. DNS records (A, CNAME, MX, TXT) are the individual answers, such as which server shows your website and which receives your email.' },
    ],
    related: [['Domain registration', '/domains-registration'], ['Move a website to Globalhostia', '/guides/move-website-to-hostia'], ['Business email setup', '/guides/business-email-setup'], ['Free migration', '/free-migration']],
  };
}

function gEmail(cat: Catalog): Built {
  const em = fam(cat, 'google-workspace');
  const steps: Step[] = [
    { name: 'Choose where your email lives', html: `<p>Use the mailboxes included with your hosting, or a dedicated service such as Google Workspace when you also want shared calendars and documents. Both are on our ${a('business email page', '/google-workspace')}${em.from ? `, from <b class="num">${esc(em.from)}</b>` : ''}.</p>` },
    { name: 'Create the mailboxes', html: '<p>In the control panel (or the email service’s admin console) create each address, such as info@, sales@ and your own name, with a strong password.</p>' },
    { name: 'Point the MX records', html: `<p>MX records tell the world where to deliver mail for your domain. Set them to the values your mail service gives you and remove old MX records.</p>${code('@   MX  10  mail.yourdomain.com.')}` },
    { name: 'Add SPF', html: `<p>An SPF TXT record lists the servers allowed to send mail as your domain. Keep a single SPF record and include every service that sends for you.</p>${code('@   TXT  "v=spf1 include:<your mail service> ~all"')}` },
    { name: 'Turn on DKIM', html: '<p>Enable DKIM signing in your control panel or mail service, then publish the TXT record it shows. Receiving servers use it to check your mail was not altered.</p>' },
    { name: 'Publish a DMARC policy', html: `<p>Start with a monitoring policy, read the reports for a few weeks, then tighten it.</p>${code('_dmarc   TXT  "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com"')}` },
    { name: 'Connect phones and computers', html: '<p>Add the account in your mail app with IMAP for incoming and SMTP for outgoing mail, using the server names and ports from your welcome email, with SSL/TLS turned on.</p>' },
    { name: 'Send a test', html: '<p>Send to and from an outside address, check that it does not land in spam, and look at the message headers for <code>spf=pass</code>, <code>dkim=pass</code> and <code>dmarc=pass</code>.</p>' },
  ];
  return {
    steps,
    sections: [
      { id: 'options', title: 'Hosting mailboxes or a workspace suite?', html: table('Hosting mailboxes compared with a workspace suite', ['<span class="sr-only">What to compare</span>', 'Mailboxes with hosting', 'Workspace suite'], [
        ['Email on your domain', yes('Yes'), yes('Yes')],
        ['Webmail and phone apps', yes('Yes'), yes('Yes')],
        ['Shared calendars, documents, video meetings', meh('No'), yes('Yes')],
        ['Pricing', esc('Included with hosting plans'), esc('Per user, per month or year')],
        ['Best for', esc('Teams that mainly need email'), esc('Teams that collaborate all day')],
      ]) },
      { id: 'steps', title: 'Set it up step by step', html: '' },
      { id: 'trouble', title: 'If mail is not arriving', html: ul(['<b>Check the MX records</b> with a DNS checker; old records can still be cached for a few hours.', '<b>Make sure there is only one SPF record.</b> Two SPF records make both fail.', '<b>Look in spam</b> on the receiving side and read the headers to see which check failed.']) },
    ],
    faqs: [
      { q: 'Can I keep my website at one host and email at another?', a: 'Yes. Email depends only on the MX (and SPF, DKIM, DMARC) records, so your website can stay wherever it is.' },
      { q: 'Why do my emails go to spam?', a: 'The most common causes are missing or wrong SPF, DKIM or DMARC records, or sending from a server not listed in SPF. Check the headers of a test message for which check failed.' },
      { q: 'Can I move old emails to the new mailbox?', a: 'Yes. Connect both accounts over IMAP in a desktop mail app and copy the folders, or ask our team to help with the copy.' },
      { q: 'What are SPF, DKIM and DMARC?', a: 'SPF lists who may send mail for your domain, DKIM signs each message so it cannot be changed in transit, and DMARC tells receivers what to do when those checks fail and sends you reports.' },
    ],
    related: [['Business email', '/google-workspace'], ['Change nameservers', '/guides/change-nameservers'], ['.ae vs .com', '/compare/ae-vs-com'], ['Plan finder', '/plan-finder']],
  };
}

function gWordPress(cat: Catalog): Built {
  const wp = fam(cat, 'wordpress-hosting');
  const steps: Step[] = [
    { name: 'Point your domain and enable SSL', html: `<p>Make sure the domain points to your hosting and the free SSL certificate is active, so WordPress is installed on an https:// address from the start. See ${a('how to change nameservers', '/guides/change-nameservers')}.</p>` },
    { name: 'Open the app installer', html: '<p>Sign in to your control panel and open the one-click app installer, then choose WordPress.</p>' },
    { name: 'Choose the address', html: '<p>Select the https:// version of your domain and leave the directory empty to install at the root. Use a sub-folder only if WordPress should live at an address like /blog.</p>' },
    { name: 'Set the admin account', html: '<p>Pick an admin username other than “admin”, a long unique password and an email address you check. Set the site name and language.</p>' },
    { name: 'Install and sign in', html: '<p>Run the installer, then sign in at <code>/wp-admin</code> with the account you just created.</p>' },
    { name: 'Finish the first settings', html: ul(['Settings, Permalinks: choose “Post name”.', 'Delete the sample post, page and unused themes and plugins.', 'Turn on automatic updates for plugins you trust.', 'Confirm backups are running for your hosting account.']) },
  ];
  return {
    steps,
    sections: [
      { id: 'before', title: 'Before you start', html: `<p>You need a hosting plan with PHP and MySQL or MariaDB (every web hosting plan has them), a domain and about ten minutes. ${wp.from ? `WordPress hosting starts at <b class="num">${esc(wp.from)}</b> today.` : ''} ${link('See WordPress hosting', '/wordpress-hosting')}</p>` },
      { id: 'steps', title: 'Install with the one-click installer', html: '' },
      { id: 'manual', title: 'Or install it by hand', html: `${ul(['Download WordPress from wordpress.org and upload the files to <code>public_html</code>.', 'In the control panel, create a MySQL database and a user, and give the user all privileges on it.', 'Open your domain in a browser; the setup wizard asks for the database name, user, password and host (usually <code>localhost</code>).', 'Follow the wizard to create the admin account.'])}${code('# or with WP-CLI over SSH\nwp core download\nwp config create --dbname=DB --dbuser=USER --dbpass=PASS\nwp core install --url=https://yourdomain.com --title="Site" --admin_user=you --admin_email=you@yourdomain.com')}` },
      { id: 'secure', title: 'Keep it fast and safe', html: ul(['<b>Update</b> WordPress, themes and plugins regularly; remove what you do not use.', '<b>Use a caching plugin</b> and compress images before uploading.', '<b>Turn on two-factor login</b> for every administrator.', '<b>Test restores</b> from your backups once in a while.']) },
    ],
    faqs: [
      { q: 'Is WordPress free?', a: 'Yes. WordPress itself is free and open source. You pay for the hosting and domain, and for any premium themes or plugins you choose.' },
      { q: 'Can you install WordPress for me?', a: 'Yes. Open a ticket after ordering and our team installs it, or moves your existing WordPress site for free.' },
      { q: 'Which PHP version should I use?', a: 'The newest version your theme and plugins support. Select it in the control panel and test the site after changing it.' },
      { q: 'Why does my new site show “Not secure”?', a: 'WordPress was installed on http:// or the SSL certificate was not active yet. Activate SSL, then set both addresses in Settings, General to https://. Our SSL guide covers the rest.' },
    ],
    related: [['WordPress hosting', '/wordpress-hosting'], ['Install SSL', '/guides/install-ssl'], ['Move a website to Globalhostia', '/guides/move-website-to-hostia'], ['Free migration', '/free-migration']],
  };
}

function gSsl(cat: Catalog): Built {
  const ssl = fam(cat, 'ssl-certificate');
  const steps: Step[] = [
    { name: 'Check the free certificate first', html: '<p>Every hosting plan includes a free domain-validated certificate. In the control panel, open the SSL/TLS status page and make sure the domain and www are covered. If not, run the check again once DNS points to us.</p>' },
    { name: 'For a paid certificate, generate a CSR', html: `<p>A Certificate Signing Request contains your domain and organisation details. Create it in the control panel’s SSL/TLS section, or on your server:</p>${code('openssl req -new -newkey rsa:2048 -nodes \\\n  -keyout yourdomain.key -out yourdomain.csr')}<p>Keep the .key file private; it never leaves your server.</p>` },
    { name: 'Order and validate', html: '<p>Paste the CSR when ordering. Domain validation is done by email, a DNS TXT record or a file on your site; organisation and extended validation also check your company records.</p>' },
    { name: 'Install the certificate', html: '<p>Paste the issued certificate and the CA bundle (intermediate certificates) into the control panel’s Install SSL page, next to the private key. On your own server, add the files to the web server configuration and reload it.</p>' },
    { name: 'Force HTTPS', html: `<p>Redirect every http:// request to https://. On Apache, in <code>.htaccess</code>:</p>${code('RewriteEngine On\nRewriteCond %{HTTPS} off\nRewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]')}` },
    { name: 'Fix mixed content', html: '<p>Open the browser console and look for images, scripts or styles still loaded over http://. Update those links, or in WordPress set both site addresses to https:// and search-replace the old URL in the database.</p>' },
  ];
  return {
    steps,
    sections: [
      { id: 'types', title: 'Which certificate do you need?', html: table('SSL certificate types compared', ['Type', 'What is checked', 'Good for'], [
        ['Free (DV)', esc('Control of the domain'), esc('Most websites and blogs; included with hosting')],
        ['Paid DV', esc('Control of the domain'), esc('Sites on other servers, longer support, warranty')],
        ['Wildcard', esc('Control of the domain'), esc('One domain and all its first-level subdomains')],
        ['OV', esc('The domain and your organisation'), esc('Businesses that want their company name in the certificate')],
        ['EV', esc('Extended checks on your organisation'), esc('Payments and finance, where the strongest checks are expected')],
      ].map(([k, ...r]) => [esc(k), ...r])) + (ssl.from ? `<p>Paid certificates start at <b class="num">${esc(ssl.from)}</b> today. ${link('Compare SSL certificates', '/ssl-certificate')}</p>` : `<p>${link('Compare SSL certificates', '/ssl-certificate')}</p>`) },
      { id: 'steps', title: 'Install SSL step by step', html: '' },
      { id: 'check', title: 'Check it worked', html: ul(['The padlock shows on every page, including checkout and login.', 'http:// and www addresses redirect to the same https:// address.', 'The certificate covers every hostname you use, and you know its expiry date.']) },
    ],
    faqs: [
      { q: 'Is SSL free with your hosting?', a: 'Yes. Every hosting plan includes a free domain-validated certificate. Paid certificates add organisation validation, wildcard coverage, a warranty and a site seal.' },
      { q: 'Why does my site still show “Not secure”?', a: 'Usually mixed content: a page loads an image, script or style over http://. Fix those links, then reload the page.' },
      { q: 'How long does a certificate take to issue?', a: 'Domain-validated certificates are usually issued within minutes of completing validation. Organisation-validated certificates usually take one to three business days.' },
      { q: 'Do I need a new certificate when I move hosts?', a: 'A free certificate is issued again on the new host. A paid certificate can be moved by installing it with its private key, or reissued with a new CSR.' },
    ],
    related: [['SSL certificates', '/ssl-certificate'], ['Install WordPress', '/guides/install-wordpress'], ['Move a website to Globalhostia', '/guides/move-website-to-hostia'], ['Plan finder', '/plan-finder']],
  };
}

function gVpsSize(cat: Catalog): Built {
  const vps = fam(cat, 'vps-hosting');
  const sorted = [...vps.products].sort((a, b) => perMonthOf(a, cat.currency) - perMonthOf(b, cat.currency)).slice(0, 10);
  const planRows = sorted.map((p) => { const s = specOf(p); const t = fromText(p, cat.currency); return [a(p.name, `/p/${p.slug}`), esc(s.cpu || '-'), esc(s.ram || '-'), esc(s.storage || '-'), t ? `<b class="num">${esc(t)}</b>` : `<a class="ln-a" href="${esc(orderUrl(p, cat.base))}">See price</a>`]; });
  const steps: Step[] = [
    { name: 'Write down what will run on it', html: '<p>List every application, database, worker and container, and roughly how many visitors or jobs per day you expect. Memory is usually the first limit you hit, so start there.</p>' },
    { name: 'Estimate memory', html: '<p>Add up the operating system, the web server, each application and the database. A database is fastest when its working data fits in memory, so give it room.</p>' },
    { name: 'Estimate CPU', html: '<p>Steady traffic and background jobs need cores; occasional bursts are handled well by modern vCPUs. Add a core for every busy worker or build job that runs at the same time.</p>' },
    { name: 'Estimate storage', html: '<p>Add the size of your files, databases, logs and local backups, then leave at least a quarter free for growth and updates.</p>' },
    { name: 'Start a size smaller, then measure', html: `<p>Pick the smallest plan that fits your estimate, run real traffic for a week and measure:</p>${code('free -h        # memory and swap use\nuptime         # load average vs number of vCPUs\ndf -h          # disk space\nhtop           # live view per process')}<p>Upgrade when memory is regularly full and swap is in use, the load average stays above the number of vCPUs, or the disk is more than about 80% full.</p>` },
  ];
  return {
    steps,
    sections: [
      { id: 'starting', title: 'Common starting points', html: table('Common VPS starting points by workload', ['Workload', 'Start with', 'Watch'], [
        ['One small website or blog', esc('1 to 2 vCPU, 1 to 2 GB RAM'), esc('Memory during traffic peaks')],
        ['Busy WordPress or WooCommerce store', esc('2 to 4 vCPU, 4 to 8 GB RAM'), esc('Database memory and PHP workers')],
        ['Several sites with a control panel', esc('2 to 4 vCPU, 4 GB RAM or more'), esc('The panel’s own memory use')],
        ['n8n, bots and automation', esc('2 vCPU, 2 to 4 GB RAM'), esc('Concurrent workflow runs')],
        ['Docker stack or small app with a database', esc('2 to 4 vCPU, 4 to 8 GB RAM'), esc('Container memory limits')],
        ['Windows Server with Remote Desktop', esc('2 vCPU, 4 GB RAM or more'), esc('Memory per signed-in user')],
      ].map(([k, ...r]) => [esc(k), ...r])) + note('Rules of thumb to start from, not guarantees. Your own code, plugins and traffic decide the real numbers, so measure after launch.') },
      { id: 'steps', title: 'Size it step by step', html: '' },
      { id: 'plans', title: 'Our VPS plans, smallest first', html: planRows.length ? table('Live VPS plans', ['Plan', 'vCPU', 'Memory', 'Storage', 'Price'], planRows) + note(`Live prices in ${esc(cat.currency)}, ${esc(VAT_NOTE)}. ${a('See every VPS plan', '/vps-hosting')}.`) : note(`VPS plans are being updated. ${a('Ask our team', '/contact')} for a recommendation.`) },
    ],
    faqs: [
      { q: 'How much RAM does my VPS need?', a: 'Add up the operating system, web server, applications and database, and leave headroom. For one small website, 1 to 2 GB is a common start; busy stores and databases need more. Measure with free -h after launch.' },
      { q: 'Can I upgrade my VPS later?', a: 'Yes. Request an upgrade from the client area or ask support, and we move your server to the larger plan. We confirm any price difference first.' },
      { q: 'Is more vCPU or more RAM better?', a: 'It depends on the bottleneck. If memory is full and swap is used, add RAM. If the load average stays above the number of vCPUs, add CPU.' },
      { q: 'What if I am still not sure?', a: 'Use the plan finder, or tell our engineers what you run and we recommend a size from our live plans.' },
    ],
    related: [['VPS hosting', '/vps-hosting'], ['Managed vs unmanaged VPS', '/compare/managed-vs-unmanaged-vps'], ['Shared vs VPS vs cloud vs dedicated', '/compare/shared-vs-vps-vs-cloud-vs-dedicated'], ['Plan finder', '/plan-finder']],
  };
}

function gAe(cat: Catalog): Built {
  const prefix = currencyPrefix(cat) || '$';
  const ae = pricedTlds(cat).find((t) => t.tld === '.ae');
  const steps: Step[] = [
    { name: 'Check eligibility', html: '<p>The .ae registry generally expects a presence in the UAE, such as a UAE trade licence or a local contact, and may ask that the name relates to you, for example your company or trading name or a trademark you hold. Unsure? Ask us before you order.</p>' },
    { name: 'Prepare your details', html: ul(['The registrant’s legal name, exactly as on your documents.', 'A UAE address, phone number and email you check.', 'A copy of your trade licence or other documents, in case the registry asks.']) },
    { name: 'Search for the name', html: `<p>Search on the ${a('.ae domains page', '/ae-domains')}. You see the first-year and renewal price before you pay.</p>` },
    { name: 'Order and complete the contact details', html: '<p>Add the domain to your cart and enter the registrant details carefully: the registry checks them against your documents.</p>' },
    { name: 'Answer any registry request', html: '<p>If the registry needs documents, our team asks you in a support ticket and submits them for you.</p>' },
    { name: 'Point the domain', html: `<p>Once active, point the domain to your hosting and email. See ${a('how to change nameservers', '/guides/change-nameservers')}.</p>` },
  ];
  return {
    steps,
    sections: [
      { id: 'price', title: 'What it costs', html: ae ? table('.ae domain prices', ['<span class="sr-only">Price</span>', 'Price'], [
        ['First year', `<b class="num">${esc(money(ae.register!, prefix))}</b>`],
        ...(ae.renew !== null ? [['Renewal per year', `<span class="num">${esc(money(ae.renew, prefix))}</span>`]] : []),
        ...(ae.transfer !== null ? [['Transfer in', `<span class="num">${esc(money(ae.transfer, prefix))}</span>`]] : []),
      ]) + note(`Live price in ${esc(cat.currency)} from our billing system, ${esc(VAT_NOTE)}.`) : note(`The live .ae price is shown on the ${a('.ae domains page', '/ae-domains')} and in the order form before you pay.`) },
      { id: 'steps', title: 'Register a .ae domain step by step', html: '' },
      { id: 'caution', title: 'Good to know', html: ul(['Registry rules can change; the registry’s current policy always applies.', 'Use details that match your documents exactly to avoid delays.', 'Consider registering the matching .com too. See ' + a('.ae vs .com', '/compare/ae-vs-com') + '.']) + note('This is a plain-language summary, not legal advice.') },
    ],
    faqs: [
      { q: 'Do I need a trade licence for a .ae domain?', a: 'Often a UAE presence is required, such as a trade licence or a local contact. The exact rules are set by the .ae registry and can change, so ask us to confirm before you order.' },
      { q: 'How long does .ae registration take?', a: 'Many .ae names activate soon after payment. If the registry asks for documents it can take longer, and our team keeps you updated in your ticket.' },
      { q: 'Can I transfer my .ae domain to Globalhostia?', a: 'Yes. Get the transfer code from your current registrar and start a transfer from our domains page. Your website and email stay online during the transfer.' },
      { q: 'How much is a .ae domain?', a: ae ? `${money(ae.register!, prefix)} for the first year${ae.renew !== null ? `, then ${money(ae.renew, prefix)} a year` : ''}, in ${cat.currency}, before VAT where it applies.` : 'The live price is shown on our .ae domains page and in the order form before you pay.' },
    ],
    related: [['.ae domains', '/ae-domains'], ['.ae vs .com', '/compare/ae-vs-com'], ['Change nameservers', '/guides/change-nameservers'], ['Business email setup', '/guides/business-email-setup']],
  };
}

function gVat(cat: Catalog): Built {
  const aed = availableCurrencies(cat.products).includes('AED');
  return {
    sections: [
      { id: 'disclaimer', title: 'Read this first', html: note('This page is general information about UAE VAT as it relates to buying hosting. It is not tax advice. Rules and thresholds can change; check with the Federal Tax Authority (FTA) or a registered tax agent for your situation.', 'alert') },
      { id: 'basics', title: 'The basics', html: ul([
        '<b>UAE VAT</b> was introduced on 1 January 2018 at a standard rate of 5%.',
        '<b>Hosting, domains, SSL and email</b> are services, and are generally subject to VAT at the standard rate when supplied to customers in the UAE.',
        `<b>Our prices</b> are shown before tax: ${esc(VAT_NOTE.replace(/^\+/, ''))}. The full total, with any VAT, is shown in the order form before you pay.`,
      ]) },
      { id: 'invoice', title: 'What appears on your invoice', html: `<p>When VAT is charged, your invoice shows the amount before tax, the VAT amount and the total. Add your company name and, if you have one, your Tax Registration Number (TRN) to your account details before ordering, so they appear on the invoice. ${aed ? 'You can choose AED in the currency menu so prices and invoices are in dirhams.' : ''}</p>` },
      { id: 'overseas', title: 'Buying from providers outside the UAE', html: '<p>When a UAE VAT-registered business buys services from a supplier outside the UAE, the reverse charge mechanism generally applies: the business accounts for the VAT itself in its VAT return instead of the supplier charging it. Businesses that are not registered usually do not account for it this way. Ask your tax adviser how this applies to you.</p>' },
      { id: 'reclaim', title: 'Can a business reclaim it?', html: '<p>A VAT-registered business can generally recover input VAT on business expenses, including hosting, when it holds a valid tax invoice and the expense relates to taxable supplies. Keep your invoices; you can download them any time from the client area.</p>' },
      { id: 'checklist', title: 'Checklist before you order', html: ul(['Company name and address on your account match your trade licence.', 'TRN added to your account details, if you are VAT-registered.', 'Billing currency chosen (AED or another available currency).', 'Invoices downloaded each period for your bookkeeping.']) },
    ],
    faqs: [
      { q: 'Do you charge VAT on hosting?', a: `Prices are shown before tax. ${VAT_NOTE.replace(/^\+/, 'We add ')}, and the total is shown in the order form before you pay.` },
      { q: 'What is the VAT rate in the UAE?', a: 'The standard rate is 5%, in force since 1 January 2018. Check the Federal Tax Authority for any changes.' },
      { q: 'Can I get my TRN on the invoice?', a: 'Yes. Add your company name and TRN to your account details in the client area before ordering, and they appear on your invoices.' },
      { q: 'Is this tax advice?', a: 'No. This page is general information only. Ask the Federal Tax Authority or a registered tax agent about your own situation.' },
    ],
    related: [['Web hosting in Dubai', '/web-hosting-dubai'], ['Monthly vs 3-year billing', '/compare/monthly-vs-3-year-billing'], ['Plan finder', '/plan-finder'], ['Contact us', '/contact']],
  };
}

const BUILDERS: Record<string, (cat: Catalog) => Built> = {
  'compare/shared-vs-vps-vs-cloud-vs-dedicated': cmpTypes,
  'compare/cpanel-vs-directadmin': cmpPanels,
  'compare/managed-vs-unmanaged-vps': cmpManaged,
  'compare/ae-vs-com': cmpAeCom,
  'compare/uae-data-center-vs-overseas': cmpDataCenter,
  'compare/monthly-vs-3-year-billing': cmpBilling,
  'guides/move-website-to-hostia': gMove,
  'guides/change-nameservers': gNameservers,
  'guides/business-email-setup': gEmail,
  'guides/install-wordpress': gWordPress,
  'guides/install-ssl': gSsl,
  'guides/choose-vps-size': gVpsSize,
  'guides/register-ae-domain': gAe,
  'guides/vat-on-hosting-uae': gVat,
};

/* ================================================================== rendering */

const faqBlock = (title: string, qs: QA[]) => `<section class="hp-section hp-section--tint" aria-labelledby="ln-faq-h"><div class="hp-container ua-faq">
  ${sectionHead({ id: 'ln-faq-h', title, align: 'left' })}${faq(qs, { id: 'ln-faq', single: true })}</div></section>`;
const linksRow = (items: [string, string][]) => `<nav class="ua-links" aria-label="Related pages">${items.map(([l, h]) => link(l, h)).join('')}</nav>`;
const stepsHtml = (steps: Step[]) => `<ol class="ln-steps">${steps.map((s, i) => `<li id="step-${i + 1}"><span class="ln-steps__n num" aria-hidden="true">${i + 1}</span><div><h3>${esc(s.name)}</h3>${s.html}</div></li>`).join('')}</ol>`;
const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

function cta(cat: Catalog) {
  const migration = trustOn(cat.settings, 'migration');
  return ctaBand({ title: 'Not sure which plan you need?', text: `Answer four questions and get a recommendation from our live plans${migration ? ', or let our engineers move your site for free' : ''}.`,
    primary: { label: 'Open the plan finder', href: '/plan-finder' }, secondary: { label: migration ? 'Free website migration' : 'Contact us', href: migration ? '/free-migration' : '/contact' } });
}

async function renderItem(ctx: PageCtx, cat: Catalog, item: LearnPage) {
  const s = cat.settings, site = siteOf(cat), path = learnPath(item), url = `${site}${path}`;
  const sec = LEARN_SECTIONS[item.section];
  const b = BUILDERS[path.slice(1)](cat);
  // the empty "steps" section is where the numbered steps go
  const sections = b.sections.map((x) => (x.html === '' && b.steps ? { ...x, html: stepsHtml(b.steps) } : x));
  const crumbs = [{ label: 'Home', href: '/' }, { label: sec.title, href: `/${item.section}` }, { label: item.title }];
  const isGuide = item.section === 'guides';
  const wa = waLink(s, `Hello ${s.site_name || 'Globalhostia'}, I have a question about "${item.title}".`);
  const hero = `<section class="ua-hero ua-hero--guide" aria-labelledby="ln-h1"><div class="hp-container">
    ${breadcrumbs(crumbs, { light: true })}
    <span class="ua-eyebrow">${esc(sec.kicker)}</span>
    <h1 id="ln-h1">${esc(item.title)}</h1>
    <p class="ua-lead">${esc(item.description)}</p>
    <p class="ua-meta">${icon('clock')}${item.minutes} minute read · Prices on this page are live from our billing system</p>
  </div></section>`;
  const more = learnPages(item.section).filter((p) => p.slug !== item.slug).slice(0, 4);
  const body = [hero, `<div class="hp-container ua-guide">
    <aside class="ua-toc" aria-labelledby="ln-toc-h"><h2 id="ln-toc-h">On this page</h2><ol>${sections.map((x) => `<li><a href="#${x.id}">${esc(x.title)}</a></li>`).join('')}<li><a href="#ln-faq-h">Questions</a></li></ol>
      <div class="ua-toc__cta"><p>Rather ask a person?</p>${wa ? `<a class="hp-link" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp our team${icon('arrow')}</a>` : link('Contact our team', '/contact')}</div></aside>
    <article class="ua-article ln-article">${sections.map((x) => `<section class="ua-sec" id="${x.id}" aria-labelledby="${x.id}-h"><h2 id="${x.id}-h" class="hp-hline">${esc(x.title)}</h2><div class="ln-prose">${x.html}</div></section>`).join('')}
      ${linksRow(b.related)}
      <aside class="ln-more" aria-labelledby="ln-more-h"><h2 id="ln-more-h">More ${esc(sec.title.toLowerCase())}</h2><ul>${more.map((p) => `<li><a href="${esc(learnPath(p))}">${esc(p.title)}</a></li>`).join('')}</ul>${link(`All ${sec.title.toLowerCase()}`, `/${item.section}`)}</aside>
    </article>
  </div>`, trustStrip(s), faqBlock(`${item.title}: questions`, b.faqs), cta(cat)].join('\n');

  const org = { '@type': 'Organization', name: s.site_name || 'Globalhostia', url: site };
  const lds = [breadcrumbJsonLd(crumbs, site), faqJsonLd(b.faqs),
    ld({ '@context': 'https://schema.org', '@type': 'Article', headline: item.title, description: item.meta, url, mainEntityOfPage: url, inLanguage: 'en', author: org, publisher: org, articleSection: sec.title })];
  if (isGuide && b.steps?.length) {
    lds.push(ld({ '@context': 'https://schema.org', '@type': 'HowTo', name: item.title, description: item.description, url, inLanguage: 'en',
      totalTime: `PT${item.minutes}M`, step: b.steps.map((x, i) => ({ '@type': 'HowToStep', position: i + 1, name: x.name, text: plain(x.html), url: `${url}#step-${i + 1}` })) }));
  }
  return page({ ctx, catalog: cat, path, title: item.title, description: item.description, css: ['uae', 'learn'], js: ['uae'], jsonLd: lds, ogType: 'article', ogKicker: sec.kicker, body });
}

async function renderIndex(ctx: PageCtx, cat: Catalog, section: LearnSection) {
  const s = cat.settings, site = siteOf(cat), sec = LEARN_SECTIONS[section], path = `/${section}`;
  const other: LearnSection = section === 'compare' ? 'guides' : 'compare';
  const items = learnPages(section);
  const crumbs = [{ label: 'Home', href: '/' }, { label: sec.title }];
  const icons: IconName[] = section === 'compare' ? ['layers', 'grid', 'server', 'globe', 'pin', 'coin'] : ['move', 'net', 'mail', 'wp', 'lock', 'cpu', 'globe', 'book'];
  const hero = `<section class="ua-hero ua-hero--guide" aria-labelledby="ln-h1"><div class="hp-container">
    ${breadcrumbs(crumbs, { light: true })}
    <span class="ua-eyebrow">${esc(section === 'compare' ? 'Compare before you buy' : 'Step by step')}</span>
    <h1 id="ln-h1">${esc(sec.title)}</h1>
    <p class="ua-lead">${esc(sec.description)}</p>
  </div></section>`;
  const cards = `<section class="hp-section" aria-labelledby="ln-list-h"><div class="hp-container">
    <h2 id="ln-list-h" class="sr-only">All ${esc(sec.title.toLowerCase())}</h2>
    <ul class="ln-cards">${items.map((p, i) => `<li><a class="ln-card" href="${esc(learnPath(p))}">${hexIcon(icons[i % icons.length])}<h3>${esc(p.title)}</h3><p>${esc(p.description)}</p><span class="ln-card__meta">${icon('clock')}${p.minutes} min read</span></a></li>`).join('')}</ul>
  </div></section>`;
  const otherSec = LEARN_SECTIONS[other];
  const teaser = `<section class="hp-section hp-section--tint" aria-labelledby="ln-other-h"><div class="hp-container">
    ${sectionHead({ id: 'ln-other-h', title: otherSec.title, lead: otherSec.description })}
    <ul class="ln-mini">${learnPages(other).map((p) => `<li><a href="${esc(learnPath(p))}">${esc(p.title)}${icon('arrow')}</a></li>`).join('')}</ul>
    <p class="ln-center">${link(`All ${otherSec.title.toLowerCase()}`, `/${other}`)}</p>
  </div></section>`;
  const faqs: QA[] = section === 'compare' ? [
    { q: 'Are the prices on these comparisons up to date?', a: 'Yes. Every price is read from our billing system when the page loads, in the currency you choose at the top of the page.' },
    { q: 'Do you compare yourselves with other hosting companies?', a: 'We compare what typical providers offer in general terms and never quote another company’s prices. Always check the terms of any plan you buy, including ours.' },
    { q: 'I still cannot decide. What next?', a: 'Use the plan finder for a recommendation from our live plans, or message our engineers with what you want to run.' },
  ] : [
    { q: 'Can you do these steps for me?', a: 'Yes. Our engineers can move your website, point your domain, set up email or install WordPress and SSL for you. Open a ticket or message us.' },
    { q: 'Do these guides work with other hosts?', a: 'Most steps are standard and work anywhere. Where a step is specific to our control panel or client area, the guide says so.' },
    { q: 'Where do I find my nameservers and server IP?', a: 'In your hosting welcome email and in the client area under your service.' },
  ];
  const body = [hero, cards, teaser, `<section class="hp-section ua-links-sec" aria-label="Related pages"><div class="hp-container">${linksRow([['Plan finder', '/plan-finder'], ['Free migration', '/free-migration'], ['Help center', '/help-center'], ['Blog', '/blog']])}</div></section>`,
    faqBlock(`${sec.title}: questions`, faqs), cta(cat)].join('\n');
  const url = `${site}${path}`;
  const lds = [breadcrumbJsonLd(crumbs, site), faqJsonLd(faqs), ld({ '@context': 'https://schema.org', '@type': 'CollectionPage', name: sec.title, description: sec.meta, url, inLanguage: 'en',
    mainEntity: { '@type': 'ItemList', itemListElement: items.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.title, url: `${site}${learnPath(p)}` })) } })];
  return page({ ctx, catalog: cat, path, title: sec.title, description: sec.description, css: ['uae', 'learn'], jsonLd: lds, ogKicker: sec.kicker, body });
}

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const [section, slug] = ctx.slug.split('/') as [LearnSection, string | undefined];
  if (!LEARN_SECTIONS[section]) return null as unknown as string;
  if (!slug) return renderIndex(ctx, cat, section);
  const item = learnPage(section, slug);
  if (!item || !BUILDERS[`${section}/${slug}`]) return null as unknown as string;
  return renderItem(ctx, cat, item);
}
