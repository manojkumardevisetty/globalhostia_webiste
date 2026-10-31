// Forex VPS: latency ticker to broker hubs (illustrative), MT4/MT5 + EA flow, 24/7 uptime explainer,
// plans (forex-vps, may be empty → empty state + Windows VPS alternative from the real catalog), FAQ.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { getCatalog, productsFor, minFrom, type TProduct } from '../data';
import { page } from '../shell';
import { pageHero, sectionHead, splitHead, planCards, plansNote, featureGrid, faq, faqJsonLd, ctaBand, breadcrumbJsonLd, icon, link, fromText } from '../ui';
import { siteOf, specsOf, productsLd, crumbsFor } from './vps';

function ticker() {
  const hubs: [string, string, string, number][] = [
    ['LD4', 'London', 'Equinix LD4, Slough', 1.6],
    ['NY4', 'New York', 'Equinix NY4, Secaucus', 2.3],
    ['TY3', 'Tokyo', 'Equinix TY3, Tokyo', 1.9],
  ];
  return `<figure class="fx-tick" data-fx-tick>
  <div class="fx-tick__head"><span class="fx-live"><i aria-hidden="true"></i>Round-trip to broker hub</span><em>Illustrative values</em></div>
  <ul class="fx-tick__rows">${hubs.map(([code, city, dc, ms], i) => `<li class="fx-row" data-base="${ms}" style="--i:${i}">
    <div class="fx-row__id"><b>${code}</b><span>${esc(city)}</span><small>${esc(dc)}</small></div>
    <svg class="fx-spark" viewBox="0 0 120 36" aria-hidden="true" preserveAspectRatio="none"><polyline points="${Array.from({ length: 25 }, (_, k) => `${k * 5},${18 + Math.sin(k * 1.3 + i) * 5}`).join(' ')}"/></svg>
    <div class="fx-row__ms num"><b data-ms>${ms.toFixed(1)}</b><small>ms</small></div>
  </li>`).join('')}</ul>
  <figcaption>Example of what a VPS in the same metro as your broker can look like. Not measured from our network: real latency depends on where your VPS is hosted and where your broker's servers are.</figcaption>
</figure>`;
}

function flow() {
  const nodes = [
    { ic: 'monitor', h: 'You, from anywhere', p: 'Phone, laptop or office PC. Connect over Remote Desktop to check positions or change settings, then disconnect.' },
    { ic: 'server', h: 'Your forex VPS', p: 'MetaTrader 4 and 5 terminals and your Expert Advisors keep running when you log off.', main: true },
    { ic: 'chart', h: 'Your broker', p: 'Orders go from the VPS straight to the broker’s trade server over a datacenter connection, not your home Wi-Fi.' },
  ];
  return `<div class="fx-flow" data-fx-flow data-reveal>
  ${nodes.map((n, i) => `<div class="fx-node${n.main ? ' is-main' : ''}">
    <div class="fx-node__ico">${icon(n.ic)}</div><h3>${esc(n.h)}</h3><p>${esc(n.p)}</p>
    ${n.main ? `<ul class="fx-node__apps">${['MT4', 'MT5', 'Expert Advisors', 'Copy trading', 'Custom indicators'].map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
  </div>${i < nodes.length - 1 ? `<div class="fx-link" aria-hidden="true"><span class="fx-pkt"></span><span class="fx-pkt" style="--d:.9s"></span>${icon('right')}</div>` : ''}`).join('')}
</div>`;
}

function uptime() {
  // a 24-hour day, illustrative: home PC is off overnight, restarts for updates, drops Wi-Fi; VPS stays on.
  const gaps: [number, number, string][] = [[1, 7, 'Asleep'], [13, 13.6, 'Update restart'], [19.5, 20.2, 'Wi-Fi drop']];
  const signals = [3.5, 9, 13.2, 16.5, 19.8, 22.5];
  const pct = (h: number) => `${((h / 24) * 100).toFixed(2)}%`;
  const off = (h: number) => gaps.some(([a, b]) => h >= a && h <= b);
  const row = (label: string, sub: string, home: boolean) => `<div class="fx-up__row${home ? ' is-home' : ' is-vps'}">
    <div class="fx-up__lbl"><b>${esc(label)}</b><span>${esc(sub)}</span></div>
    <div class="fx-up__bar">
      <span class="fx-up__fill"></span>
      ${home ? gaps.map(([a, b, t]) => `<span class="fx-up__gap" style="left:${pct(a)};width:${pct(b - a)}"><em>${esc(t)}</em></span>`).join('') : ''}
      ${signals.map((s, i) => { const miss = home && off(s); return `<span class="fx-sig${miss ? ' is-miss' : ''}" style="left:${pct(s)};--i:${i}" title="${miss ? 'Signal missed' : 'Trade placed'}">${icon(miss ? 'x' : 'check')}</span>`; }).join('')}
    </div>
  </div>`;
  const missed = signals.filter(off).length;
  return `<figure class="fx-up" data-reveal>
  <div class="fx-up__axis" aria-hidden="true">${[0, 6, 12, 18, 24].map((h) => `<span style="left:${pct(h)}">${String(h).padStart(2, '0')}:00</span>`).join('')}</div>
  ${row('Home computer', 'Sleeps, restarts, loses Wi-Fi', true)}
  ${row('Forex VPS', 'Datacenter power and network', false)}
  <figcaption><span class="fx-key"><i class="is-ok">${icon('check')}</i>Trade placed</span><span class="fx-key"><i class="is-miss">${icon('x')}</i>Signal missed</span><span>Illustrative day: ${signals.length} signals from an Expert Advisor, ${missed} missed while the home computer was offline.</span></figcaption>
</figure>`;
}

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const { currency, base } = cat;
  const ps = productsFor(cat, ctx.route.categories);
  const winVps: TProduct[] = productsFor(cat, ['hostiavps']).filter((p) => /win/i.test(specsOf(p).os || ''));
  const from = minFrom(ps, currency);
  const crumbs = crumbsFor(ctx.route.title, { label: 'VPS Hosting', href: '/vps-hosting' });

  const hero = pageHero({
    crumbs, eyebrow: 'Forex VPS for MetaTrader',
    title: 'Your trading terminal, awake when you are not.',
    lead: 'Run MetaTrader 4, MetaTrader 5 and your Expert Advisors on a server that stays on around the clock, close to the network, away from home power cuts and Wi-Fi drops.',
    ctas: [{ label: ps.length ? 'See forex plans' : 'Ask for a forex VPS', href: ps.length ? '#plans' : '/contact' }, { label: 'How it works', href: '#how', variant: 'ghost' }],
    fromHtml: from ? `Forex VPS from <b class="num">${esc(fromText(ps.find((p) => minFrom([p], currency)?.amount === from.amount)!, currency))}</b>` : undefined,
    visualHtml: ticker(), network: false,
  });

  const how = `<section class="hp-section" id="how" aria-labelledby="how-h"><div class="hp-container">
    ${sectionHead({ id: 'how-h', title: 'MetaTrader runs on the VPS. You just check in.', lead: 'Install your terminals and Expert Advisors once. They keep trading while your own computer is closed.' })}
    ${flow()}
  </div></section>`;

  const up = `<section class="hp-section hp-section--dark hp-on-dark" aria-labelledby="up-h"><div class="hp-container">
    ${splitHead({ id: 'up-h', title: 'An Expert Advisor only works while it is running', lead: 'Strategies trigger at any hour. A computer at home sleeps, installs updates and loses its connection; a server in a datacenter does not need to.' })}
    ${uptime()}
  </div></section>`;

  const alt = winVps.length ? `<div class="fx-alt">
      <h3>Run MetaTrader today on a Windows VPS</h3>
      <p>MetaTrader terminals run on Windows. These Windows VPS plans are available now and suit one or several terminals; choose more memory when you run many charts or Expert Advisors.</p>
      ${planCards(winVps, { currency, base, id: 'fx-win', orderLabel: 'Order Windows VPS', highlight: false })}
    </div>` : '';
  const plans = `<section class="hp-section hp-section--tint" id="plans" aria-labelledby="plans-h"><div class="hp-container">
    ${sectionHead({ id: 'plans-h', title: 'Forex VPS plans', lead: ps.length ? 'Every plan runs Windows for MetaTrader. Pick by how many terminals and Expert Advisors you run.' : 'Dedicated forex plans are being prepared. Our team can set one up for your broker today.' })}
    ${planCards(ps, { currency, base, id: 'fx-plans', orderLabel: 'Order forex VPS',
      emptyTitle: 'Tell us your broker and we will set it up', emptyText: 'Forex VPS plans are not listed yet. Send us your broker, the number of terminals and your Expert Advisors, and we will recommend a server and send you a quote.' })}
    ${alt}
    ${plansNote(currency, link('All VPS plans', '/vps-hosting'))}
  </div></section>`;

  const features = `<section class="hp-section" aria-labelledby="feat-h"><div class="hp-container">
    ${sectionHead({ id: 'feat-h', title: 'Built for traders who automate' })}
    ${featureGrid([
      { icon: 'chart', title: 'MetaTrader 4 and 5', text: 'Install both side by side, with as many broker accounts as your plan’s memory allows.' },
      { icon: 'bot', title: 'Expert Advisors and indicators', text: 'Run your EAs, scripts and custom indicators exactly as on your desktop.' },
      { icon: 'clock', title: 'On around the clock', text: 'No sleep mode, no lid to close. Your terminals keep running when you log off.' },
      { icon: 'monitor', title: 'Remote Desktop from any device', text: 'Check trades from Windows, Mac, iPhone or Android with a Remote Desktop app.' },
      { icon: 'bolt', title: 'Datacenter connection', text: 'Orders leave over a datacenter network, not a home router shared with streaming and calls.' },
      { icon: 'win', title: 'Windows Server', text: 'MetaTrader is a Windows application, so forex servers run Windows.' },
      { icon: 'key', title: 'Full Administrator access', text: 'Install any broker terminal, VPN or trade copier you need.' },
      { icon: 'headset', title: '24/7 engineers', text: 'Phone, email, WhatsApp and ticket support at any hour the markets are open, and when they are not.' },
    ], { cols: 4 })}
  </div></section>`;

  const faqs = [
    { q: 'Why use a VPS for forex trading?', a: 'Expert Advisors and copy-trading only work while MetaTrader is running and connected. A VPS keeps your terminal on around the clock in a datacenter, so a sleeping laptop, a Windows update or a home internet outage does not stop your strategy.' },
    { q: 'Can I run MetaTrader 4 and MetaTrader 5 together?', a: 'Yes. You can install several terminals, including MT4 and MT5 from different brokers. Each terminal uses memory, so choose a plan with more RAM if you run many terminals or charts.' },
    { q: 'Are the latency figures on this page real?', a: 'No. They are illustrative examples of what a server in the same metro as a broker hub can see. Real latency depends on where your VPS is hosted and where your broker’s trade servers are. Tell us your broker and we will advise on the closest location we can offer.' },
    { q: 'How do I connect to my forex VPS?', a: 'With Remote Desktop. It is built into Windows, and free apps are available for Mac, iPhone and Android. You receive your login details by email when the server is ready.' },
    { q: 'Which plan do I need?', a: 'One or two terminals with a few Expert Advisors run comfortably on the smallest Windows plan. Choose more memory for many terminals, many charts or heavy indicators. If you are unsure, send us your setup and we will size it.' },
    { q: 'Do you provide trading signals or manage my account?', a: 'No. We provide and support the server. Your broker account, strategies and trading decisions remain yours.' },
  ];
  const faqSec = `<section class="hp-section hp-section--tint" aria-labelledby="faq-h"><div class="hp-container fx-faq">
    ${sectionHead({ id: 'faq-h', title: 'Forex VPS questions', align: 'left', lead: 'Tell us your broker and setup, and we will recommend a server.' })}
    ${faq(faqs, { id: 'fx-faq' })}
  </div></section>`;

  const cta = ctaBand({ id: 'cta', title: 'Keep your strategy running tonight', text: 'Move your MetaTrader terminals to a server that does not sleep. Our team helps you set it up.',
    primary: { label: ps.length ? 'See forex plans' : 'Ask for a forex VPS', href: ps.length ? '#plans' : '/contact' }, secondary: { label: 'Windows VPS plans', href: '/vps-hosting#plans' } });

  return page({
    ctx, catalog: cat, path: ctx.path, title: ctx.route.title, description: ctx.route.description, css: ['forex'], js: ['forex'],
    jsonLd: [breadcrumbJsonLd(crumbs, siteOf(cat)), faqJsonLd(faqs), productsLd(ps, cat, 'Forex VPS plans')].filter(Boolean),
    body: [hero, how, up, plans, features, faqSec, cta].join('\n'),
  });
}
