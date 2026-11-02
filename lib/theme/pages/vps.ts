// VPS hosting: animated terminal hero, "build your VPS" sizer that picks the closest REAL plan, plans, OS row, FAQ.
// Also exports small helpers shared by the other infrastructure pages (cloud, dedicated, forex, ai).
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { getCatalog, productsFor, minFrom, deriveSpecs, orderUrl, cycles, type Catalog, type TProduct } from '../data';
import { page } from '../shell';
import {
  pageHero, sectionHead, splitHead, planCards, plansNote, featureGrid, faq, faqJsonLd, ctaBand, breadcrumbJsonLd,
  ld, link, icon, fromText, type FeatureItem,
} from '../ui';

/* ------------------------------------------------------------------ shared helpers (infra pages) */
export const siteOf = (cat: Catalog) => String(cat.settings.site_url || 'https://globalhostia.com').replace(/\/$/, '');
/** "6GB" → 6, "1TB" → 1024, "2x2TB SSD" → 4096 */
export function gb(s: string | undefined): number {
  if (!s) return 0;
  const m = s.match(/(?:(\d+)\s*x\s*)?(\d+(?:\.\d+)?)\s*(TB|GB)/i);
  if (!m) return 0;
  return (m[1] ? +m[1] : 1) * parseFloat(m[2]) * (/tb/i.test(m[3]) ? 1024 : 1);
}
/** "4 vCPU Cores" → 4 */
export const cores = (s: string | undefined) => { const m = (s || '').match(/(\d+)/); return m ? +m[1] : 0; };
export const specsOf = (p: TProduct) => deriveSpecs(p.features, p.attributes);
export const range = (xs: number[]) => { const v = xs.filter((x) => x > 0); return v.length ? [Math.min(...v), Math.max(...v)] as const : null; };
export const fmtRange = (r: readonly [number, number] | null, unit: string) => (r ? (r[0] === r[1] ? `${r[0]}${unit}` : `${r[0]} to ${r[1]}${unit}`) : '');
/** Product + Offer JSON-LD for priced products only (unpriced ones are skipped, never invented). */
export function productsLd(ps: TProduct[], cat: Catalog, name: string) {
  const site = siteOf(cat);
  const items = ps.map((p) => {
    const c = cycles(p, cat.currency).filter((x) => Number.isFinite(x.price));
    if (!c.length) return null;
    const best = c.reduce((a, b) => (b.perMonth < a.perMonth ? b : a));
    const sold = /^(out|sold ?out)$/i.test((p.badge || '').trim());
    return {
      '@type': 'Product', name: p.name, description: p.tagline || p.features.filter((f) => !f.startsWith('-')).slice(0, 3).join(', '),
      brand: { '@type': 'Brand', name: String(cat.settings.site_name || 'Globalhostia') }, url: `${site}/p/${p.slug}`,
      offers: { '@type': 'Offer', price: best.price.toFixed(2), priceCurrency: cat.currency, url: orderUrl(p, cat.base, best.cycle),
        availability: sold ? 'https://schema.org/OutOfStock' : /pre-?order/i.test(p.badge || '') ? 'https://schema.org/PreOrder' : 'https://schema.org/InStock' },
    };
  }).filter(Boolean);
  if (!items.length) return '';
  return ld({ '@context': 'https://schema.org', '@type': 'ItemList', name, itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, item })) });
}
export const crumbsFor = (title: string, mid?: { label: string; href: string }) =>
  [{ label: 'Home', href: '/' }, ...(mid ? [mid] : []), { label: title }];

/* ------------------------------------------------------------------ VPS page */
const VCPU_STEPS = [1, 2, 4, 6, 8, 12, 16, 24, 32, 48, 64];
const RAM_STEPS = [1, 2, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 256];
const DISK_STEPS = [20, 40, 60, 80, 120, 160, 200, 320, 500, 1000, 2000];

/** Terminal + resource meters (illustrative session). */
function terminal() {
  const lines: [string, string][] = [
    ['cmd', 'ssh root@vps.yourdomain.com'],
    ['out', 'Welcome to your server. Last login: today'],
    ['cmd', 'apt update && apt upgrade -y'],
    ['ok', 'Reading package lists... Done'],
    ['ok', '0 upgraded, 0 newly installed. System is up to date.'],
    ['cmd', 'git clone https://git.example.com/shop.git && cd shop'],
    ['cmd', 'docker compose up -d'],
    ['ok', 'Container db     Started'],
    ['ok', 'Container app    Started'],
    ['ok', 'Container proxy  Started'],
    ['cmd', 'curl -sI https://shop.yourdomain.com | head -1'],
    ['hl', 'HTTP/2 200'],
  ];
  const meters = [['CPU', 'cpu'], ['Memory', 'ram'], ['Disk I/O', 'io']];
  return `<figure class="vx-term" data-vx-term>
  <div class="vx-term__bar" aria-hidden="true"><i></i><i></i><i></i><span>root@vps: ~</span></div>
  <pre class="vx-term__body" aria-label="Example terminal session: connect with SSH, update the system and start an application with Docker">${lines.map(([k, t]) =>
    `<span class="vx-l vx-l--${k}" data-k="${k}">${k === 'cmd' ? '<b aria-hidden="true">#</b> ' : ''}<span class="vx-t">${esc(t)}</span></span>`).join('')}<span class="vx-caret" aria-hidden="true"></span></pre>
  <div class="vx-meters" aria-hidden="true">${meters.map(([l, k]) => `<div class="vx-meter" data-m="${k}"><span>${l}</span><div class="vx-meter__track"><i></i></div><b class="num">0%</b></div>`).join('')}</div>
  <figcaption>Illustrative session. Your VPS runs whatever stack you install.</figcaption>
</figure>`;
}

type SizerPlan = { name: string; slug: string; os: string; cpu: number; ram: number; disk: number; price: string; href: string };

function sizer(vps: TProduct[], cat: Catalog) {
  const plans: SizerPlan[] = vps.map((p) => {
    const s = specsOf(p);
    return { name: p.name, slug: p.slug, os: s.os || 'Linux', cpu: cores(s.cpu), ram: gb(s.ram), disk: gb(s.storage), price: fromText(p, cat.currency), href: orderUrl(p, cat.base) };
  }).filter((p) => p.cpu > 0 && p.ram > 0);
  if (plans.length < 2) return '';
  const oses = [...new Set(plans.map((p) => p.os))];
  const maxCpu = Math.max(...plans.map((p) => p.cpu)), maxRam = Math.max(...plans.map((p) => p.ram));
  const mk = (steps: number[], max: number) => [...new Set([...steps.filter((v) => v <= max), max])].sort((a, b) => a - b);
  const cpuSteps = mk(VCPU_STEPS, maxCpu), ramSteps = mk(RAM_STEPS, maxRam);
  const withDisk = plans.filter((p) => p.disk > 0).length >= plans.length / 2;
  const maxDisk = withDisk ? Math.max(...plans.map((p) => p.disk)) : 0;
  const diskSteps = withDisk ? mk(DISK_STEPS, maxDisk) : [];
  // presets: starting points mapped onto the catalog's own range
  const at = (steps: number[], f: number) => steps[Math.min(steps.length - 1, Math.round((steps.length - 1) * f))];
  const presets = [
    { label: 'A few websites or a small app', cpu: Math.min(...plans.map((p) => p.cpu)), ram: Math.min(...plans.map((p) => p.ram)) },
    { label: 'Busy store or several apps', cpu: at(cpuSteps, 0.55), ram: at(ramSteps, 0.6) },
    { label: 'Databases and many containers', cpu: at(cpuSteps, 0.8), ram: maxRam },
  ];
  const nearest = (steps: number[], v: number) => steps.reduce((a, b, i) => (Math.abs(b - v) < Math.abs(steps[a] - v) ? i : a), 0);
  const ci = nearest(cpuSteps, presets[0].cpu), ri = nearest(ramSteps, presets[0].ram);
  const slider = (id: string, label: string, steps: number[], idx: number, unit: string) =>
    `<div class="vx-ctl"><div class="vx-ctl__top"><label for="${id}">${esc(label)}</label><output class="num" for="${id}" data-out="${id}">${steps[idx]}${unit}</output></div>
    <input type="range" id="${id}" min="0" max="${steps.length - 1}" step="1" value="${idx}" data-steps="${steps.join(',')}" data-unit="${esc(unit)}" aria-valuetext="${steps[idx]}${unit}">
    <div class="vx-ctl__ends num" aria-hidden="true"><span>${steps[0]}${unit}</span><span>${steps[steps.length - 1]}${unit}</span></div></div>`;
  const first = plans.find((p) => p.os === oses[0])!;
  const chips = oses.map((os) => `<div class="vx-chips" data-os-list="${esc(os)}"${os === oses[0] ? '' : ' hidden'}>${plans.filter((p) => p.os === os).map((p) =>
    `<button type="button" class="vx-chip${p === first ? ' is-on' : ''}" data-slug="${esc(p.slug)}" aria-pressed="${p === first}"><b>${esc(p.name)}</b><span class="num">${p.cpu} vCPU · ${p.ram}GB</span></button>`).join('')}</div>`).join('');
  return `<section class="hp-section hp-section--tint vx-sizer-sec" id="sizer" aria-labelledby="sizer-h"><div class="hp-container">
  ${splitHead({ id: 'sizer-h', title: 'Build your VPS', lead: 'Set the resources your project needs and we highlight the closest plan from our current catalog. Nothing here is a custom quote: every match is a real plan you can order.' })}
  <div class="vx-sizer" data-vx-sizer>
    <script type="application/json" data-plans>${JSON.stringify(plans).replace(/</g, '\\u003c')}</script>
    <div class="vx-sizer__ctrls">
      <fieldset class="vx-presets"><legend>Start from a common setup</legend>${presets.map((p, i) =>
        `<button type="button" class="vx-preset" data-cpu="${p.cpu}" data-ram="${p.ram}" aria-pressed="${i === 0}">${esc(p.label)}</button>`).join('')}</fieldset>
      ${oses.length > 1 ? `<div class="vx-ctl"><span class="vx-ctl__lbl" id="vx-os-l">Operating system</span><div class="hp-seg vx-os" role="radiogroup" aria-labelledby="vx-os-l"><span class="hp-seg__thumb" aria-hidden="true"></span>${oses.map((o, i) =>
        `<button type="button" role="radio" aria-checked="${i === 0}" data-os="${esc(o)}"${i ? ' tabindex="-1"' : ''}>${icon(/win/i.test(o) ? 'win' : 'term')}${esc(o)}</button>`).join('')}</div></div>` : ''}
      ${slider('vx-cpu', 'vCPU cores', cpuSteps, ci, '')}
      ${slider('vx-ram', 'Memory (RAM)', ramSteps, ri, 'GB')}
      ${withDisk ? slider('vx-disk', 'Storage', diskSteps, 0, 'GB') : '<p class="vx-note">Storage size for each plan is shown in the order form before you pay.</p>'}
    </div>
    <div class="vx-match" aria-live="polite">
      <p class="vx-match__k">Closest plan in our catalog</p>
      <h3 class="vx-match__name" data-r="name">${esc(first.name)}</h3>
      <dl class="vx-match__specs num">
        <div><dt>vCPU</dt><dd data-r="cpu">${first.cpu}</dd></div>
        <div><dt>RAM</dt><dd data-r="ram">${first.ram}GB</dd></div>
        <div><dt>System</dt><dd data-r="os">${esc(first.os)}</dd></div>
      </dl>
      <p class="vx-match__fit" data-r="fit">Meets what you selected.</p>
      <div class="vx-match__price num" data-r="price">${first.price ? esc(first.price) : 'Price shown in the order form'}</div>
      <div class="hp-actions"><a class="hp-btn hp-btn--brand" data-r="href" href="${esc(first.href)}">${first.price ? 'Order this plan' : 'See price and order'}</a><a class="hp-link" data-r="details" href="/p/${esc(first.slug)}">View details${icon('arrow')}</a></div>
      <div class="vx-match__all"><p>All ${oses.length > 1 ? 'plans for this system' : 'plans'}</p>${chips}</div>
    </div>
  </div>
</div></section>`;
}

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const { currency, base } = cat;
  const vps = productsFor(cat, ctx.route.categories);
  const specs = vps.map(specsOf);
  const cpuR = range(specs.map((s) => cores(s.cpu))), ramR = range(specs.map((s) => gb(s.ram)));
  const oses = [...new Set(specs.map((s) => s.os).filter(Boolean))];
  const osText = oses.length > 1 ? 'Linux or Windows' : oses[0] || 'Linux';
  const from = minFrom(vps, currency);
  const crumbs = crumbsFor(ctx.route.title);

  const hero = pageHero({
    crumbs, eyebrow: `${osText} VPS`,
    title: 'Your own server, with root access from day one.',
    lead: `A virtual private server with its own vCPU cores and memory${cpuR ? `: ${fmtRange(cpuR, ' vCPU')} and ${fmtRange(ramR, 'GB')} RAM` : ''}. Install any stack, keep it running around the clock, and call our engineers when you need a hand.`,
    ctas: [{ label: 'Find my plan', href: '#sizer' }, { label: 'Compare all plans', href: '#plans', variant: 'ghost' }],
    fromHtml: from ? `Plans from <b class="num">${esc(fromText(vps.find((p) => minFrom([p], currency)?.amount === from.amount)!, currency))}</b>` : 'Prices are confirmed live in the order form.',
    visualHtml: terminal(), network: false,
  });

  const oslist = [['Ubuntu', 'term'], ['Debian', 'term'], ['AlmaLinux', 'term'], ['Rocky Linux', 'term'], ['CentOS Stream', 'term'], ['Windows Server', 'win']]
    .filter(([n]) => oses.length === 0 || oses.some((o) => (/win/i.test(o) ? /win/i.test(n) : !/win/i.test(n))));
  const osRow = `<div class="vx-osrow" data-reveal><p>Popular systems people run on our VPS. The order form lists the exact templates available for each plan.</p><ul>${oslist.map(([n, ic]) => `<li>${icon(ic)}<span>${esc(n)}</span></li>`).join('')}</ul></div>`;

  const plans = `<section class="hp-section" id="plans" aria-labelledby="plans-h"><div class="hp-container">
    ${sectionHead({ id: 'plans-h', title: 'Every VPS plan, side by side', lead: `${vps.length} plans${oses.length > 1 ? ', split by operating system' : ''}. The core count and memory are reserved for your server alone.` })}
    <div class="vx-plans">${planCards(vps, { currency, base, groupBy: vps.some((p) => p.attributes?.tier) ? ((p: any) => [p.attributes?.tier || 'Other', p.attributes?.location].filter(Boolean).join(' · ')) : oses.length > 1 ? 'os' : undefined, groupLabel: vps.some((p) => p.attributes?.tier) ? 'Plan type and region' : 'Operating system', details: true, id: 'vps-plans', orderLabel: 'Order VPS',
      note: 'Pick the system you know. Linux suits most web stacks; choose Windows for .NET, MSSQL or desktop software over Remote Desktop.' })}</div>
    ${plansNote(currency, link('Need more power? Dedicated servers', '/dedicated-servers'))}
    ${osRow}
  </div></section>`;

  const feats: FeatureItem[] = [
    { icon: 'key', title: 'Full root or Administrator access', text: 'Root over SSH on Linux, Administrator over Remote Desktop on Windows. Nothing is locked down.' },
    { icon: 'cpu', title: cpuR ? `${fmtRange(cpuR, ' vCPU cores')}` : 'Reserved vCPU cores', text: 'Processor cores reserved for your server, so a neighbour\u2019s traffic spike does not become yours.' },
    { icon: 'memory', title: ramR ? `${fmtRange(ramR, 'GB')} of RAM` : 'Reserved memory', text: 'Enough headroom for databases, caches and background workers on the larger plans.' },
    { icon: 'drive', title: 'SSD flash storage', text: 'Your operating system, files and databases sit on flash, not spinning disks.' },
    { icon: 'code', title: 'Install any stack', text: 'Docker, Node.js, Python, PHP, Go, Java, PostgreSQL, MySQL or Redis: if it runs on the system, it runs here.' },
    { icon: 'win', title: osText === 'Linux or Windows' ? 'Linux or Windows' : osText, text: oses.length > 1 ? 'Choose the operating system at order time. Windows plans are listed separately.' : 'Choose your distribution at order time.' },
    { icon: 'trend', title: 'Move up when you grow', text: 'Outgrow your plan and we move you to a larger one. Any price difference is confirmed before it is applied.' },
    { icon: 'headset', title: '24/7 engineers', text: 'Phone, email, WhatsApp and ticket support around the clock, including help with the server itself.' },
    { icon: 'move', title: 'Help moving in', text: 'Coming from another host? Our team helps copy your sites, databases and email across.' },
  ];
  const features = `<section class="hp-section hp-section--dark hp-on-dark" aria-labelledby="feat-h"><div class="hp-container">
    ${splitHead({ id: 'feat-h', title: 'What a VPS gives you that shared hosting cannot', lead: 'Your own operating system, your own resources and the freedom to run any software, without buying hardware.' })}
    ${featureGrid(feats)}
  </div></section>`;

  const faqs = [
    { q: 'What is the difference between a VPS and shared hosting?', a: 'Shared hosting puts many websites on one server with a fixed software stack and a control panel. A VPS is a virtual server of your own: it has reserved vCPU cores and memory, its own operating system, and you can install any software. Choose a VPS when you run applications, need specific versions, or have outgrown shared hosting.' },
    { q: 'Should I choose Linux or Windows?', a: 'Linux is the usual choice for websites and web applications: PHP, Node.js, Python, Docker and most databases. Choose Windows when you need .NET Framework, Microsoft SQL Server, MetaTrader or other desktop software that you reach over Remote Desktop. Windows plans are listed separately because Windows Server is licensed software.' },
    { q: 'Do I get full root access?', a: 'Yes. Linux servers come with root access over SSH and Windows servers with an Administrator account over Remote Desktop. Your login details are sent to you when the server has been set up.' },
    { q: 'Can I upgrade to a bigger plan later?', a: 'Yes. Request an upgrade from your client area or ask support, and we move your server to the larger plan. We confirm any price difference with you before it is applied.' },
    { q: 'Why does a plan say "See price"?', a: 'Prices are synced from our billing system. When a plan has no synced price yet, the order form shows the current price for every billing period before you pay anything.' },
    { q: 'How is a VPS different from a dedicated server?', a: 'A VPS is a share of a powerful physical machine with resources reserved for you. A dedicated server is the whole machine. Move to dedicated when you need the full CPU, very large memory or disks, or hardware-level isolation.' },
  ];
  const faqSec = `<section class="hp-section" aria-labelledby="faq-h"><div class="hp-container vx-faq">
    ${sectionHead({ id: 'faq-h', title: 'VPS questions, answered', align: 'left', lead: 'Still unsure which plan fits? Our engineers will size it with you.' })}
    ${faq(faqs, { id: 'vps-faq' })}
  </div></section>`;

  const cta = ctaBand({ id: 'cta', title: 'Launch your VPS today', text: 'Pick a plan, choose your system and get your login details by email. Engineers are on call around the clock.',
    primary: { label: 'Find my plan', href: '#sizer' }, secondary: { label: 'Talk to an engineer', href: '/contact' } });

  return page({
    ctx, catalog: cat, path: ctx.path, title: ctx.route.title, description: ctx.route.description, css: ['vps'], js: ['vps'],
    jsonLd: [breadcrumbJsonLd(crumbs, siteOf(cat)), faqJsonLd(faqs), productsLd(vps, cat, 'VPS plans')].filter(Boolean),
    body: [hero, sizer(vps, cat), plans, features, faqSec, cta].join('\n'),
  });
}
