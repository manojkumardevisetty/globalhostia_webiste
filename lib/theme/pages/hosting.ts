// Web / shared hosting: "Choose where your site lives".
// Hero = interactive location picker (dot-matrix map, pulsing pin, the real plans hosted there),
// then a "Which plan fits?" finder that reads plan capacities from the synced features.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { money } from '../../pricing';
import { getCatalog, productsFor, minFrom, fromPrice, orderUrl, deriveSpecs, currencyPrefix, type TProduct } from '../data';
import { page } from '../shell';
import { trustStrip } from '../growth';
import {
  pageHero, sectionHead, splitHead, planCards, plansNote, specTable, featureGrid, faq, faqJsonLd, ctaBand, breadcrumbJsonLd,
  icon, ld, link, fromText, available,
} from '../ui';

/* ------------------------------------------------------------------ helpers (local to this page) */
const LOC_SUFFIX = /\s+(USA|US|MY|SG|UK|EU|Malaysia|Singapore)$/i;
const family = (p: TProduct) => p.name.replace(LOC_SUFFIX, '').trim();
const locOf = (p: TProduct) => deriveSpecs(p.features, p.attributes).location || 'Other';

/** Known datacenter coordinates [lat, lon] and who they suit. Unknown locations still work, just without a pin. */
const GEO: Record<string, { ll: [number, number]; near: string; zoom: number }> = {
  USA: { ll: [38, -92], near: 'Best for visitors in North and South America', zoom: 1.6 },
  'United States': { ll: [38, -92], near: 'Best for visitors in North and South America', zoom: 1.7 },
  Malaysia: { ll: [3.1, 101.7], near: 'Best for visitors in Malaysia and Southeast Asia', zoom: 2.2 },
  Singapore: { ll: [1.35, 103.8], near: 'Best for visitors in Singapore, Southeast Asia and Australia', zoom: 2.2 },
  India: { ll: [19, 72.8], near: 'Best for visitors in South Asia', zoom: 2.2 },
  Germany: { ll: [50.1, 8.7], near: 'Best for visitors in Europe', zoom: 2.2 },
  UK: { ll: [51.5, -0.1], near: 'Best for visitors in the UK and Europe', zoom: 2.2 },
  UAE: { ll: [25.2, 55.3], near: 'Best for visitors in the Gulf region', zoom: 2.2 },
};
/** "-1 Website" style lines are marked "not included", but the number is still the plan's capacity. */
function capacity(p: TProduct, re: RegExp): number | null {
  for (const f of p.features) {
    const m = f.replace(/^-\s*/, '').match(re);
    if (m) return /unlimited/i.test(m[1]) ? Infinity : parseInt(m[1], 10);
  }
  return null;
}
const WEB_RE = /(unlimited|\d+)\s*websites?/i;
const MAIL_RE = /(unlimited|\d+)\s*email/i;
const SPACE_RE = /(unlimited|\d+\s*GB)\s*(?:of\s*)?(?:space|storage|NVMe|SSD)/i;
const capText = (n: number | null, one: string, many: string) => (n === null ? '' : n === Infinity ? `Unlimited ${many}` : `${n} ${n === 1 ? one : many}`);

/* ------------------------------------------------------------------ world dots (same land mask as the shared datacenter map) */
// 120 x 43 bitmap, 3 degrees per cell, rows from 75N (copied from the shared datacenter map in theme.js)
const HEX = "00001000007ff800000000ff80000000000389f01fe000000017fffefe0083fffed60c3f80007f87ffffffffff03fffffc0c1c0400ef7ffffffffffe07fffff020080003dfffffffffff180001fff83a000000cfffffffffe04000007ffe3f0000001fffffffff80c000007fffbf800013ffffffffffe08000001ffffc00000fffffffffffe00000001ffffc00000ffd7fffffffc00000001ffff0000009383fffffff000000001fffe0000070133ffffffe000000001fffc000002007ffffffe2000000000fffc000003e00fffffff00000000003ff8000007f90fffffff00000000001f00000007ffff7fffff00000000000e0000001fffef83ffff0000000000060000001ffff7f1fbf80000000000072000001ffff3e071e00000000000006000001ffffb8060f00000000000001000001ffffc0040700000000000000100001ffffc80001000000000000003f0000fffff00000040000000000003fc00001fff00000200000000000003fe00001ffc00004600000000000007ff00001ffc00002600000000000007ffe0000ff800000003000000000003fff0000ff800000001800000000003fff00007f800000000000000000001ffe0000ff800000008000000000000ffe0000ff90000007d0000000000007fc0000ff10000007f8000000000007f800007f1000003ffc000000000007f000007e0000003ffe000000000007e000003c0000003ffe00000000000fe000003c0000001cfe00000000000f80000000000000003c00000000000f80000000000000001800000000000e00000000000000000000000000000c00000000000000000000000000001c00000000000000000000000000001800000000000000000000000000000800000000000000000000";
let MASK: string | null = null;
function landPath() {
  if (MASK !== null) return MASK;
  const d: string[] = [];
  for (let r = 0; r < 43; r++) for (let k = 0; k < 30; k++) {
    const v = parseInt(HEX.charAt(r * 30 + k), 16);
    if (Number.isNaN(v)) continue;
    for (let b = 3; b >= 0; b--) if ((v >> b) & 1) d.push(`M${k * 4 + (3 - b) + 0.5} ${r + 0.5}h0`);
  }
  return (MASK = d.join(''));
}
const px = (ll: [number, number]) => [(ll[1] + 180) / 3, (75 - ll[0]) / 3] as const;
// visible window of the map (grid units: 3 degrees per unit)
const VB = { x: 14, y: 3, w: 92, h: 31 };

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const { currency, base } = cat;
  const prefix = currencyPrefix(cat) || '$';
  const all = productsFor(cat, ctx.route.categories);
  const products = available(all);
  const shared = ctx.slug === 'shared-hosting';
  const from = minFrom(products, currency);

  // locations in data order, each with its plans (cheapest first)
  const per = (p: TProduct) => fromPrice(p, currency)?.amount ?? 1e9;
  const locs: { name: string; items: TProduct[] }[] = [];
  for (const p of products) { const l = locOf(p); let g = locs.find((x) => x.name === l); if (!g) locs.push((g = { name: l, items: [] })); g.items.push(p); }
  locs.forEach((g) => g.items.sort((a, b) => per(a) - per(b)));

  // plan families (Lite / Ultra / Infinity) with capacities read from their features
  const famMap = new Map<string, TProduct[]>();
  for (const p of products) { const f = family(p); famMap.set(f, [...(famMap.get(f) || []), p]); }
  const fams = [...famMap.entries()].map(([name, ps]) => {
    const ref = ps[0];
    return { name, ps, web: capacity(ref, WEB_RE), mail: capacity(ref, MAIL_RE), space: capacity(ref, SPACE_RE), spaceText: (ref.features.map((f) => f.replace(/^-\s*/, '')).find((f) => SPACE_RE.test(f)) || ''), from: minFrom(ps, currency) };
  }).sort((a, b) => (a.from?.amount ?? 1e9) - (b.from?.amount ?? 1e9));

  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Hosting', href: '/web-hosting' }, { label: ctx.route.title }];
  if (!shared) crumbs.splice(1, 1);

  /* ---------------- hero: location picker ---------------- */
  const mapped = locs.filter((l) => GEO[l.name]);
  const viewFor = (name: string) => {
    const g = GEO[name]; if (!g) return { tx: 0, ty: 0, s: 1 };
    const [x, y] = px(g.ll); const s = g.zoom;
    const cx = VB.x + VB.w / 2, cy = VB.y + VB.h / 2;
    // keep the zoomed window inside the map edges
    const tx = Math.max(Math.min(cx - x * s, VB.x - VB.x * s), VB.x + VB.w - (VB.x + VB.w) * s);
    const ty = Math.max(Math.min(cy - y * s, VB.y - VB.y * s), VB.y + VB.h - (VB.y + VB.h) * s);
    return { tx: +tx.toFixed(2), ty: +ty.toFixed(2), s };
  };
  const first = locs[0]?.name || '';
  const v0 = viewFor(first);
  const pins = mapped.map((l) => {
    const [x, y] = px(GEO[l.name].ll);
    return `<g class="ho-pin${l.name === first ? ' is-on' : ''}" data-pin="${esc(l.name)}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)})"><g class="ho-pin__k"><circle class="ho-pin__ring" r="1.6"/><circle class="ho-pin__ring ho-pin__ring--2" r="1.6"/><circle class="ho-pin__dot" r=".9"/></g></g>`;
  }).join('');
  const views = Object.fromEntries(locs.map((l) => [l.name, viewFor(l.name)]));
  const planRow = (p: TProduct) => {
    const web = capText(capacity(p, WEB_RE), 'website', 'websites'), mail = capText(capacity(p, MAIL_RE), 'email account', 'email accounts');
    const t = fromText(p, currency);
    return `<li><a href="${esc(orderUrl(p, base, fromPrice(p, currency)?.cycle))}"><span class="ho-pr__n"><b>${esc(family(p))}</b><small>${esc([web, mail].filter(Boolean).join(', ') || p.tagline)}</small></span><span class="ho-pr__p num">${t ? esc(t) : 'See price'}</span>${icon('right')}</a></li>`;
  };
  const picker = locs.length ? `<div class="ho-pick" data-ho-pick data-views="${esc(JSON.stringify(views))}" data-pause>
    <div class="ho-pick__head"><h2 class="ho-pick__t">Choose where your site lives</h2><p>Your website is served from the datacenter you pick. Closer servers mean shorter round trips for your visitors.</p></div>
    <div class="ho-pick__seg" role="radiogroup" aria-label="Hosting location">${locs.map((l) => `<button type="button" role="radio" aria-checked="${l.name === first}" data-loc="${esc(l.name)}"${l.name === first ? '' : ' tabindex="-1"'}>${icon('pin')}${esc(l.name)}</button>`).join('')}</div>
    <div class="ho-map" aria-hidden="true"><svg viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" preserveAspectRatio="xMidYMid slice" focusable="false"><g class="ho-map__g" style="transform:translate(${v0.tx}px,${v0.ty}px) scale(${v0.s});--k:${(1 / v0.s).toFixed(3)}"><path class="ho-map__land" d="${landPath()}"/>${pins}</g></svg>
      <span class="ho-map__cap" data-near>${esc(GEO[first]?.near || '')}</span></div>
    ${locs.map((l) => `<div class="ho-pick__plans" data-loc-pane="${esc(l.name)}"${l.name === first ? '' : ' hidden'}>
      <p class="ho-pick__lbl"><span>${l.items.length} plan${l.items.length === 1 ? '' : 's'} hosted in ${esc(l.name)}</span><a href="#plans" data-show-loc="${esc(l.name)}">Compare them</a></p>
      <ul class="ho-pr">${l.items.map(planRow).join('')}</ul></div>`).join('')}
    <p class="ho-pick__live" aria-live="polite"><span class="sr-only" data-live></span></p>
  </div>` : '';

  const locNames = locs.map((l) => l.name);
  const locList = locNames.length > 1 ? `${locNames.slice(0, -1).join(', ')} or ${locNames[locNames.length - 1]}` : locNames[0] || '';
  const hero = pageHero({
    crumbs, eyebrow: shared ? 'Shared hosting' : 'Web hosting',
    title: shared ? 'Shared hosting that puts your site near your visitors' : 'Web hosting, close to the people who visit your site',
    lead: shared
      ? `Your site shares a tuned, NVMe-backed server with other accounts, so you pay a fraction of a private server and we handle the upkeep. Host it in ${locList || 'the region you choose'}.`
      : `Pick a datacenter${locList ? ` in ${locList}` : ''}, choose a plan that fits how many sites and mailboxes you run, and we handle the servers, security patches and backups.`,
    ctas: [{ label: 'See plans and prices', href: '#plans' }, { label: 'Help me choose', href: '#finder', variant: 'ghost' }],
    fromHtml: from ? `Plans from <b class="num">${esc(money(from.price, from.prefix || prefix))}</b> ${from.cycle === 'monthly' ? 'a month' : from.cycle === 'annually' ? 'a year' : ''}, with free SSL on every plan` : undefined,
    visualHtml: picker || undefined,
  });

  /* ---------------- plan finder ---------------- */
  const webCaps = [...new Set(fams.map((f) => f.web).filter((n): n is number => n !== null && Number.isFinite(n)))].sort((a, b) => a - b);
  const anyUnlimitedWeb = fams.some((f) => f.web === Infinity);
  const webOpts: { v: number; label: string }[] = webCaps.map((n, i) => ({ v: n, label: n === 1 ? 'One website' : i && webCaps[i - 1] + 1 < n ? `${webCaps[i - 1] + 1} to ${n} websites` : `Up to ${n} websites` }));
  const maxWeb = webCaps[webCaps.length - 1] || 1;
  if (!anyUnlimitedWeb) webOpts.push({ v: maxWeb + 1, label: `More than ${maxWeb}` });
  const mailCaps = [...new Set(fams.map((f) => f.mail).filter((n): n is number => n !== null && Number.isFinite(n)))].sort((a, b) => a - b);
  const mailOpts: { v: number; label: string }[] = [...mailCaps.map((n) => ({ v: n, label: `Up to ${n}` })), ...(fams.some((f) => f.mail === Infinity) && mailCaps.length ? [{ v: (mailCaps[mailCaps.length - 1] || 0) + 1, label: `More than ${mailCaps[mailCaps.length - 1]}` }] : [])];
  const famResult = (f: (typeof fams)[number], i: number) => {
    const specs = [capText(f.web, 'website', 'websites'), capText(f.mail, 'email account', 'email accounts'), f.spaceText].filter(Boolean);
    return `<div class="ho-res" data-fam="${i}" data-web="${f.web === Infinity ? 'inf' : f.web ?? ''}" data-mail="${f.mail === Infinity ? 'inf' : f.mail ?? ''}"${i ? ' hidden' : ''}>
      <span class="ho-res__tag">${icon('check')}Your best fit</span>
      <h3>${esc(f.name)}</h3>
      <ul class="ho-res__specs">${specs.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      ${f.ps.map((p) => { const fp = fromPrice(p, currency); return `<div class="ho-res__buy" data-loc-buy="${esc(locOf(p))}"${locOf(p) === first ? '' : ' hidden'}><p class="ho-res__price num">${fp ? `<b>${esc(money(fp.price, fp.prefix))}</b> ${esc(fromText(p, currency).replace(/^\S+\s*/, ''))}` : 'See price in the order form'}<small>Hosted in ${esc(locOf(p))}</small></p><a class="hp-btn hp-btn--brand" href="${esc(orderUrl(p, base, fp?.cycle))}">Order ${esc(f.name)}</a></div>`; }).join('')}
    </div>`;
  };
  const finder = fams.length >= 2 && webOpts.length >= 2 ? `<section class="hp-section hp-section--tint ho-finder-sec" id="finder" aria-labelledby="finder-h"><div class="hp-container ho-finder" data-ho-finder>
    <div class="ho-finder__q">
      <h2 id="finder-h" class="hp-hline hp-h2">Which plan fits?</h2>
      <p class="hp-lead">Two questions. We match your answers against the limits of each plan, so you only pay for the room you need.</p>
      <fieldset class="ho-q"><legend>How many websites will you host?</legend><div class="ho-chips">${webOpts.map((o, i) => `<label><input type="radio" name="ho-web" value="${o.v}"${i === 0 ? ' checked' : ''}><span>${esc(o.label)}</span></label>`).join('')}</div></fieldset>
      ${mailOpts.length >= 2 ? `<fieldset class="ho-q"><legend>How many email accounts do you need?</legend><div class="ho-chips">${mailOpts.map((o, i) => `<label><input type="radio" name="ho-mail" value="${o.v}"${i === 0 ? ' checked' : ''}><span>${esc(o.label)}</span></label>`).join('')}</div></fieldset>` : ''}
    </div>
    <div class="ho-finder__a" aria-live="polite">
      ${fams.map(famResult).join('')}
      <div class="ho-res ho-res--vps" data-fam="vps" hidden>
        <span class="ho-res__tag">${icon('server')}Time for your own server</span>
        <h3>More sites than shared hosting allows</h3>
        <p>For more than ${maxWeb} websites, a VPS gives you dedicated resources and room for as many sites as it can carry.</p>
        <a class="hp-btn hp-btn--brand" href="/vps-hosting">See VPS hosting</a>
      </div>
      <p class="ho-finder__note">Limits come from each plan's listed features. You can upgrade to a bigger plan later without moving your site.</p>
    </div>
  </div></section>` : '';

  /* ---------------- plans ---------------- */
  const plans = `<section class="hp-section" id="plans" aria-labelledby="plans-h"><div class="hp-container">
    ${sectionHead({ id: 'plans-h', title: shared ? 'Shared hosting plans' : 'Web hosting plans', lead: 'The same three plan sizes in every location. Choose the datacenter, then the size. Every plan includes free SSL and daily and weekly backups.' })}
    ${planCards(all, { currency, base, locationTabs: true, groupLabel: 'Hosting location', id: 'ho-plans',
      emptyTitle: 'Hosting plans are being updated', emptyText: 'Our hosting plans are being refreshed right now. Tell us what you need and we will set it up for you.' })}
    ${plansNote(currency, `<span class="hp-pf-links">${link('Help me choose: plan finder', '/plan-finder')}${link('Domain prices', '/domains-registration')}</span>`)}
  </div></section>`;

  const cmpSet = locs[0]?.items || [];
  const compare = cmpSet.length >= 2 ? `<section class="hp-section hp-section--tint" aria-labelledby="cmp-h"><div class="hp-container">
    ${splitHead({ id: 'cmp-h', title: 'Compare the plans line by line', lead: `Every limit, side by side. Plans are identical across locations; the prices below are for ${cmpSet[0] ? locOf(cmpSet[0]) : 'the first location'}.` })}
    ${specTable(cmpSet, { currency, caption: 'Hosting plan comparison' })}
  </div></section>` : '';

  /* ---------------- what's included ---------------- */
  const included = `<section class="hp-section" aria-labelledby="inc-h"><div class="hp-container">
    ${splitHead({ id: 'inc-h', title: 'What every plan includes', lead: 'The essentials are part of the plan, not paid extras. You get the same security, backups and support on the smallest plan as on the largest.' })}
    ${featureGrid([
      { icon: 'drive', title: 'Flash storage', text: 'Your files and databases sit on NVMe or SSD drives, so pages are read from flash rather than spinning disks.' },
      { icon: 'lock', title: 'Free SSL certificate', text: 'HTTPS is switched on for your domain, so browsers show the padlock and forms are encrypted.' },
      { icon: 'archive', title: 'Daily and weekly backups', text: 'Automatic copies of files and databases. If an update goes wrong, restore yesterday’s site.' },
      { icon: 'mail', title: 'Email on your domain', text: 'Create addresses like hello@yourbusiness.com and read them in webmail or any mail app.' },
      { icon: 'database', title: 'Databases included', text: 'MySQL databases for WordPress, shops and custom apps, within your plan’s allowance.' },
      { icon: 'pin', title: 'Your choice of location', text: locList ? `Host in ${locList}, close to the audience you serve.` : 'Host in the region closest to your audience.' },
      { icon: 'transfer', title: 'Free migration help', text: 'Moving from another host? Our team copies your site, databases and email for you.' },
      { icon: 'trend', title: 'Upgrade any time', text: 'Start small and move to a bigger plan as you grow, without re-uploading your site.' },
      { icon: 'headset', title: '24/7 technical support', text: 'Engineers by phone, email, WhatsApp and ticket, including nights and weekends.' },
    ])}
  </div></section>`;

  /* ---------------- migration timeline ---------------- */
  const steps = [
    { t: 'Order your plan', d: 'Pick the location and plan size. Your hosting account is set up as soon as payment clears.' },
    { t: 'Open a migration ticket', d: 'Send us your old host’s login or a backup file from your client area. Nothing changes on your live site yet.' },
    { t: 'We copy everything', d: 'Files, databases and mailboxes are copied to your new account, and we check the site loads correctly.' },
    { t: 'Point your domain', d: 'Update your nameservers, or let us do it if your domain is with us. Visitors switch over as DNS updates.' },
  ];
  const migrate = `<section class="hp-section hp-section--dark hp-on-dark" aria-labelledby="mig-h"><div class="hp-container ho-mig">
    <div class="ho-mig__intro" data-reveal>
      <h2 id="mig-h" class="hp-hline hp-h2">Moving from another host? We do the heavy lifting.</h2>
      <p class="hp-lead">Migration is free with every hosting plan. Your current site stays online the whole time, and you only switch once the copy is checked.</p>
      <figure class="ho-mig__img"><img src="/hp/img/hosting-migrate.jpg" alt="Two developers reviewing a website on their monitors" width="1200" height="800" loading="lazy" decoding="async"></figure>
    </div>
    <ol class="ho-tl" data-ho-tl>${steps.map((s, i) => `<li class="ho-tl__step" data-reveal style="--i:${i}"><span class="ho-tl__n num" aria-hidden="true">${i + 1}</span><div><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></div></li>`).join('')}</ol>
  </div></section>`;

  /* ---------------- FAQ ---------------- */
  const faqs = [
    { q: 'Which location should I choose?', a: `Choose the datacenter closest to most of your visitors. ${locs.map((l) => GEO[l.name] ? `${l.name}: ${GEO[l.name].near.replace(/^Best for/, 'best for')}.` : '').filter(Boolean).join(' ')} If your audience is worldwide, pick the region where most of your customers are.`.trim() },
    { q: 'What is the difference between the plans?', a: fams.length ? `The plans differ in how many websites, email accounts, databases and how much storage you get. ${fams.map((f) => `${f.name}: ${[capText(f.web, 'website', 'websites'), capText(f.mail, 'email account', 'email accounts'), f.spaceText].filter(Boolean).join(', ')}.`).join(' ')}` : 'The plans differ in how many websites, email accounts and databases you can create and how much storage you get.' },
    { q: 'Can I upgrade later?', a: 'Yes. You can move to a larger plan from your client area at any time. Your files, databases and email stay in place, and you are only charged the difference for the rest of your billing period.' },
    { q: 'Is migration from my current host really free?', a: 'Yes. Open a ticket after ordering and our team copies your website files, databases and mailboxes. Your old site stays live until you point your domain at us.' },
    { q: 'Do I need to buy an SSL certificate?', a: 'No. Every hosting plan includes a free SSL certificate for your domain. If you need an organisation-validated or extended-validation certificate, you can add one separately.' },
    { q: 'Do I need a domain first?', a: 'You can register a new domain while ordering, or use one you already own by pointing its nameservers to us. Transferring an existing domain to Globalhostia is free.' },
  ];
  const faqSec = `<section class="hp-section" aria-labelledby="faq-h"><div class="hp-container ho-faq">
    <div>${sectionHead({ id: 'faq-h', title: 'Hosting questions, answered', align: 'left', lead: 'Still unsure? Our team answers around the clock.' })}<div class="hp-actions">${link('Contact sales', '/contact')}</div></div>
    ${faq(faqs, { id: 'ho-faq', single: true })}
  </div></section>`;

  const cta = ctaBand({ id: 'cta', title: 'Put your website where your visitors are', text: 'Choose a location and a plan, and your hosting is ready in minutes. Migration and SSL are on us.',
    primary: { label: 'Choose a plan', href: '#plans' }, secondary: { label: 'Talk to sales', href: '/contact' } });

  /* ---------------- structured data ---------------- */
  const site = String(cat.settings.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const offers = fams.filter((f) => f.from).map((f) => {
    const prices = f.ps.map((p) => fromPrice(p, currency)?.price).filter((n): n is number => typeof n === 'number');
    return { '@context': 'https://schema.org', '@type': 'Product', name: f.name, description: `${ctx.route.title}: ${f.ps[0].tagline || ''}`.trim(), brand: { '@type': 'Brand', name: cat.settings.site_name || 'Globalhostia' },
      offers: { '@type': 'AggregateOffer', priceCurrency: currency, lowPrice: Math.min(...prices).toFixed(2), highPrice: Math.max(...prices).toFixed(2), offerCount: f.ps.length, url: `${site}/${ctx.slug}` } };
  });

  return page({
    ctx, catalog: cat, path: `/${ctx.slug}`, title: ctx.route.title, description: ctx.route.description,
    css: ['hosting'], js: ['hosting'],
    jsonLd: [breadcrumbJsonLd(crumbs, site), faqJsonLd(faqs), ...offers.map((o) => ld(o))],
    body: [hero, trustStrip(cat.settings), finder, plans, compare, included, migrate, faqSec, cta].join('\n'),
  });
}
