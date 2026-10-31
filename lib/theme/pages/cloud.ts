// Cloud VPS: animated capacity-follows-demand graph hero, managed vs unmanaged comparison,
// backups/snapshots timeline, plans (hostiavps), features, FAQ.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { getCatalog, productsFor, minFrom, type TProduct } from '../data';
import { page } from '../shell';
import { pageHero, sectionHead, splitHead, planCards, plansNote, featureGrid, faq, faqJsonLd, ctaBand, breadcrumbJsonLd, link, icon, fromText } from '../ui';
import { siteOf, gb, cores, specsOf, range, fmtRange, productsLd, crumbsFor } from './vps';

/** Pick three plans of one OS that step up in size: smallest, middle, largest. */
function tiers(ps: TProduct[]) {
  const linux = ps.filter((p) => !/win/i.test(specsOf(p).os || ''));
  const pool = (linux.length >= 3 ? linux : ps).map((p) => ({ p, c: cores(specsOf(p).cpu), r: gb(specsOf(p).ram) })).filter((x) => x.c && x.r)
    .sort((a, b) => a.r - b.r || a.c - b.c);
  if (pool.length < 3) return pool;
  return [pool[0], pool[Math.floor((pool.length - 1) / 2)], pool[pool.length - 1]];
}

function scaleGraph(t: ReturnType<typeof tiers>) {
  // 560 x 300 plot. Traffic: calm → spike → settles higher. Capacity: steps that stay above traffic.
  const traffic = 'M0 236 C40 232 70 228 100 226 S150 214 180 206 S222 178 240 160 S266 128 282 128 S306 142 326 142 S380 130 420 120 S486 102 520 96 L560 92';
  const cap = 'M0 196 H196 V118 H300 V56 H560';
  const labels = t.length === 3 ? t.map((x, i) => ({ x: [12, 206, 310][i], y: [188, 110, 48][i], text: `${x.c} vCPU / ${x.r}GB` })) : [];
  return `<figure class="cx-graph" data-cx-graph>
  <div class="cx-graph__head"><span><i class="is-t"></i>Visitors</span><span><i class="is-c"></i>Server capacity</span><em>Illustrative</em></div>
  <svg viewBox="0 0 560 280" role="img" aria-labelledby="cx-g-t cx-g-d">
    <title id="cx-g-t">How capacity follows demand</title>
    <desc id="cx-g-d">Illustration: visitor traffic rises sharply; the server is moved up two plan sizes so capacity stays above demand${labels.length ? `, from ${labels[0].text} to ${labels[2].text}` : ''}.</desc>
    <defs><linearGradient id="cx-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e14c7f" stop-opacity=".45"/><stop offset="1" stop-color="#e14c7f" stop-opacity="0"/></linearGradient></defs>
    <g class="cx-grid">${[60, 120, 180, 240].map((y) => `<line x1="0" x2="560" y1="${y}" y2="${y}"/>`).join('')}</g>
    <path class="cx-area" d="${traffic} V280 H0Z" fill="url(#cx-fill)"/>
    <path class="cx-traffic" d="${traffic}" pathLength="1"/>
    <path class="cx-cap" d="${cap}" pathLength="1"/>
    ${labels.map((l, i) => `<g class="cx-tier" style="--i:${i}"><rect x="${l.x - 4}" y="${l.y - 15}" rx="4" width="${l.text.length * 6.6 + 14}" height="20"/><text x="${l.x + 3}" y="${l.y}">${esc(l.text)}</text></g>`).join('')}
    <g class="cx-head"><line x1="0" x2="0" y1="0" y2="280"/></g>
  </svg>
  <div class="cx-graph__axis" aria-hidden="true"><span>Launch</span><span>Campaign goes live</span><span>New normal</span></div>
  <figcaption>Illustration of moving between real plan sizes as traffic grows. Upgrades are requested from your client area or support.</figcaption>
</figure>`;
}

function compare() {
  const rows: [string, string, string][] = [
    ['Server setup and operating system', 'Prepared by our engineers', 'You install and configure it'],
    ['Security updates', 'Kept up to date with you', 'Your job, every week'],
    ['Monitoring', 'Watched around the clock', 'Set up your own alerts'],
    ['When something breaks', 'Engineers troubleshoot the server', 'You debug it, at any hour'],
    ['Backups', 'Scheduled for you', 'Script and store your own'],
    ['Root access and your own software', 'Yes', 'Yes'],
  ];
  return `<div class="cx-compare" data-reveal>
  <table>
    <caption class="sr-only">Managed cloud VPS compared with an unmanaged VPS</caption>
    <thead><tr><th scope="col"><span class="sr-only">Task</span></th><th scope="col" class="is-us">Managed cloud VPS<small>with Globalhostia</small></th><th scope="col">Unmanaged VPS<small>do it yourself</small></th></tr></thead>
    <tbody>${rows.map(([k, a, b]) => `<tr><th scope="row">${esc(k)}</th><td class="is-us">${icon('check')}<span>${esc(a)}</span></td><td>${b === 'Yes' ? icon('check') : icon('user')}<span>${esc(b)}</span></td></tr>`).join('')}</tbody>
  </table>
  <p class="cx-compare__note">The exact management scope for each plan is listed in the order form. Need something specific, such as a control panel or a particular stack? Ask before you order.</p>
</div>`;
}

function timeline() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const ev = [
    { d: 2, kind: 'snap', title: 'Snapshot before a change', text: 'Before an upgrade or a risky deploy, a snapshot captures the whole server as it is right now.' },
    { d: 4, kind: 'restore', title: 'Something went wrong? Roll back', text: 'Restore files, a database or the whole server to an earlier point. Our engineers can do it for you.' },
    { d: 6, kind: 'weekly', title: 'Weekly backup', text: 'A full weekly copy kept alongside the dailies, so you can go back further than yesterday.' },
  ];
  return `<div class="cx-tl" data-cx-tl data-reveal>
  <div class="cx-tl__track" role="list" aria-label="An example week of backups">
    ${days.map((d, i) => { const e = ev.find((x) => x.d === i); return `<div class="cx-tl__day" role="listitem"><span class="cx-tl__lbl">${d}</span><i class="cx-dot" aria-hidden="true"></i>${e ? `<button type="button" class="cx-ev cx-ev--${e.kind}" aria-pressed="${e.kind === 'snap'}" data-ev="${e.kind}">${icon(e.kind === 'snap' ? 'box' : e.kind === 'restore' ? 'refresh' : 'archive')}<span>${esc(e.title)}</span></button>` : '<span class="cx-tl__daily">Daily backup</span>'}</div>`; }).join('')}
    <svg class="cx-tl__arc" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><path d="M64 18 C58 2 42 2 36 18" pathLength="1"/></svg>
  </div>
  <div class="cx-tl__panels">${ev.map((e) => `<div class="cx-tl__panel" data-panel-ev="${e.kind}"${e.kind === 'snap' ? '' : ' hidden'}><h3>${esc(e.title)}</h3><p>${esc(e.text)}</p></div>`).join('')}</div>
  <p class="cx-tl__cap">Illustrative week. Backup frequency, retention and snapshot options for your plan are confirmed in the order form.</p>
</div>`;
}

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const { currency, base } = cat;
  const ps = productsFor(cat, ctx.route.categories);
  const specs = ps.map(specsOf);
  const cpuR = range(specs.map((s) => cores(s.cpu))), ramR = range(specs.map((s) => gb(s.ram)));
  const oses = [...new Set(specs.map((s) => s.os).filter(Boolean))];
  const from = minFrom(ps, currency);
  const crumbs = crumbsFor(ctx.route.title);
  const t = tiers(ps);

  const hero = pageHero({
    crumbs, eyebrow: 'Managed cloud VPS',
    title: 'A cloud server that grows when your traffic does.',
    lead: `Start on the size you need today and move up when a launch, a campaign or a busy season arrives. ${cpuR ? `Plans run from ${fmtRange(cpuR, ' vCPU')} and ${fmtRange(ramR, 'GB')} RAM` : 'Plans in several sizes'}${oses.length > 1 ? ', on Linux or Windows' : ''}, managed by engineers who answer around the clock.`,
    ctas: [{ label: 'See cloud plans', href: '#plans' }, { label: 'Managed or unmanaged?', href: '#managed', variant: 'ghost' }],
    fromHtml: from ? `Cloud plans from <b class="num">${esc(fromText(ps.find((p) => minFrom([p], currency)?.amount === from.amount)!, currency))}</b>` : 'Prices are confirmed live in the order form.',
    visualHtml: scaleGraph(t),
  });

  const steps = `<section class="hp-section hp-section--tight cx-steps" aria-labelledby="steps-h"><div class="hp-container">
    <h2 id="steps-h" class="sr-only">How scaling works</h2>
    <ol class="cx-steps__list" data-stagger>${[
      ['rocket', 'Start right-sized', 'Pay for the capacity you use now, not for the traffic you hope to have next year.'],
      ['gauge', 'Watch the headroom', 'Our monitoring and your own graphs show when CPU or memory are getting tight.'],
      ['trend', 'Move up a plan', `Ask for the next size up${t.length === 3 ? `, for example from ${t[0].c} to ${t[1].c} vCPU` : ''}. We confirm any price difference before anything changes.`],
    ].map(([ic, h, p], i) => `<li data-reveal style="--i:${i}"><span class="cx-steps__n num">${i + 1}</span>${icon(ic)}<div><h3>${esc(h)}</h3><p>${esc(p)}</p></div></li>`).join('')}</ol>
  </div></section>`;

  const plans = `<section class="hp-section hp-section--tint" id="plans" aria-labelledby="plans-h"><div class="hp-container">
    ${sectionHead({ id: 'plans-h', title: 'Cloud plans, from first launch to full load', lead: 'Each step up adds reserved vCPU cores and memory. Pick the size that fits today; you can move up later.' })}
    ${planCards(ps, { currency, base, groupBy: oses.length > 1 ? 'os' : undefined, groupLabel: 'Operating system', id: 'cloud-plans', orderLabel: 'Order cloud VPS' })}
    ${plansNote(currency, link('Use the VPS sizing tool', '/vps-hosting#sizer'))}
  </div></section>`;

  const managed = `<section class="hp-section" id="managed" aria-labelledby="managed-h"><div class="hp-container cx-two">
    <div>${sectionHead({ id: 'managed-h', title: 'Managed means you keep building', align: 'left', lead: 'An unmanaged VPS is cheaper only until the first 3am outage. With a managed cloud VPS, the server is our job and the product is yours.' })}</div>
    ${compare()}
  </div></section>`;

  const backups = `<section class="hp-section hp-section--dark hp-on-dark" aria-labelledby="bk-h"><div class="hp-container">
    ${splitHead({ id: 'bk-h', title: 'Every change has a way back', lead: 'Scheduled backups and on-demand snapshots mean a bad deploy costs you minutes, not a weekend. Select a point on the week to see how it works.' })}
    ${timeline()}
  </div></section>`;

  const features = `<section class="hp-section" aria-labelledby="feat-h"><div class="hp-container">
    ${sectionHead({ id: 'feat-h', title: 'Included with every cloud plan' })}
    ${featureGrid([
      { icon: 'cpu', title: 'Reserved vCPU and memory', text: 'The cores and RAM in your plan are set aside for your server alone.' },
      { icon: 'drive', title: 'SSD flash storage', text: 'Operating system, files and databases on flash for quick reads and writes.' },
      { icon: 'trend', title: 'Room to grow', text: `${cpuR ? `Sizes from ${fmtRange(cpuR, ' vCPU')}` : 'Several sizes'}, so the next step up is always there.` },
      { icon: 'key', title: 'Root access', text: 'Managed does not mean locked. Install the software your project needs.' },
      { icon: 'win', title: oses.length > 1 ? 'Linux or Windows' : 'Your choice of Linux', text: 'Pick the operating system when you order. Windows plans are listed separately.' },
      { icon: 'activity', title: 'Monitored around the clock', text: 'Our team watches the platform and is on call every hour of every day.' },
      { icon: 'archive', title: 'Backups and snapshots', text: 'Restore points for your server, with options confirmed in the order form.' },
      { icon: 'headset', title: '24/7 engineers', text: 'Phone, email, WhatsApp and ticket support, with people who can log in and fix it.' },
      { icon: 'move', title: 'Help moving in', text: 'We help migrate your sites, applications and databases from another provider.' },
    ])}
  </div></section>`;

  const faqs = [
    { q: 'What is a managed cloud VPS?', a: 'It is a virtual server with reserved vCPU cores and memory, where our engineers look after the server itself: setup, updates, monitoring and troubleshooting. You keep root access and decide what runs on it.' },
    { q: 'How do I scale up when traffic grows?', a: 'Request an upgrade from your client area or contact support and we move your server to the larger plan. We confirm any price difference first. Moving up a plan is a manual step agreed with you, not an automatic charge.' },
    { q: 'Is the scaling graph on this page real data?', a: 'No. It is an illustration of how capacity can follow demand when you move between our real plan sizes. It does not show measurements from our network.' },
    { q: 'How do backups and snapshots work?', a: 'Backups are scheduled copies of your server data; a snapshot captures the whole server at one moment, which is useful before an upgrade or a big deploy. The backup frequency, retention and snapshot options for your plan are shown in the order form.' },
    { q: 'What is the difference between this page and VPS hosting?', a: 'Both use the same server plans. This page explains the managed cloud approach and growing over time; the VPS page has a sizing tool if you want to match resources to a plan yourself.' },
  ];
  const faqSec = `<section class="hp-section hp-section--tint" aria-labelledby="faq-h"><div class="hp-container cx-faq">
    ${sectionHead({ id: 'faq-h', title: 'Cloud VPS questions', align: 'left', lead: 'Not sure what size to start with? Tell us about your traffic and we will suggest a plan.' })}
    ${faq(faqs, { id: 'cloud-faq' })}
  </div></section>`;

  const cta = ctaBand({ id: 'cta', title: 'Start small. Scale when it matters.', text: 'Choose a cloud plan now and move up when your traffic does. Engineers are on call around the clock.',
    primary: { label: 'See cloud plans', href: '#plans' }, secondary: { label: 'Talk to sales', href: '/contact' } });

  return page({
    ctx, catalog: cat, path: ctx.path, title: ctx.route.title, description: ctx.route.description, css: ['cloud'], js: ['cloud'],
    jsonLd: [breadcrumbJsonLd(crumbs, siteOf(cat)), faqJsonLd(faqs), productsLd(ps, cat, 'Cloud VPS plans')].filter(Boolean),
    body: [hero, steps, plans, managed, backups, features, faqSec, cta].join('\n'),
  });
}
