// Dedicated servers: isometric rack hero, Xeon / Ryzen / 10Gbps explainer, filterable spec explorer of every
// real server (EOL clearly marked), datacenter map, features, FAQ.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { money } from '../../pricing';
import { getCatalog, productsFor, minFrom, fromPrice, orderUrl, type TProduct, type Catalog } from '../data';
import { page } from '../shell';
import { pageHero, sectionHead, splitHead, featureGrid, faq, faqJsonLd, ctaBand, breadcrumbJsonLd, dcMap, icon, plansNote, emptyState, link } from '../ui';
import { siteOf, gb, specsOf, productsLd, crumbsFor } from './vps';

const isEol = (p: TProduct) => /^(eol|end of life|discontinued|retired)$/i.test((p.badge || '').trim());
const isOut = (p: TProduct) => /^(out|sold ?out)$/i.test((p.badge || '').trim());
const is10g = (p: TProduct) => /10\s*gbps/i.test([p.name, p.badge, ...p.features, specsOf(p).bandwidth || ''].join(' '));
const family = (p: TProduct) => {
  const t = `${p.tagline} ${specsOf(p).cpu || ''}`;
  if (/ryzen/i.test(t)) return 'AMD Ryzen';
  if (/E5-/i.test(t)) return 'Dual Xeon E5';
  if (/dual\s+L5|L5\d{3}/i.test(t)) return 'Dual Xeon L5';
  if (/E3-/i.test(t)) return 'Xeon E3';
  return 'Other';
};
const threads = (p: TProduct) => {
  const c = `${specsOf(p).cpu || ''}`;
  const t = c.match(/(\d+)\s*T\b/i); if (t) return +t[1];
  const m = c.match(/\/(\d+)T/i); return m ? +m[1] : 0;
};
const cpuModel = (p: TProduct) => (p.tagline.split(/\s+[–-]\s+/)[0] || '').trim();
const storeType = (s: string) => (/nvme/i.test(s) ? 'NVMe' : /ssd/i.test(s) && /hdd|sata/i.test(s) ? 'SSD + HDD' : /ssd/i.test(s) ? 'SSD' : /sata|hdd/i.test(s) ? 'SATA HDD' : 'Other');
const bwText = (s: string) => s.replace(/(unmetered|\d+TB)\s*(\d+\s*Gbps)/i, '$1, $2').replace(/^unmetered/i, 'Unmetered');

/* ------------------------------------------------------------------ isometric rack */
function rack() {
  const W = 200, D = 104, H = 30, GAP = 7, N = 5, X0 = 66, Y0 = 118;
  const u = [W * 0.866, W * 0.5], v = [D * 0.866, -D * 0.5];
  const unit = (k: number) => {
    const x = X0, y = Y0 + k * (H + GAP);
    const top = `M${x} ${y} l${u[0]} ${u[1]} l${v[0]} ${v[1]} l${-u[0]} ${-u[1]}Z`;
    const side = `M${x + u[0]} ${y + u[1]} l${v[0]} ${v[1]} v${H} l${-v[0]} ${-v[1]}Z`;
    const bays = Array.from({ length: 6 }, (_, i) => `<rect x="${78 + i * 17}" y="8" width="13" height="${H - 16}" rx="1.5" class="dr-bay"/>`).join('');
    const leds = [0, 1, 2].map((i) => `<rect x="${11 + i * 10}" y="${H / 2 - 3}" width="6.5" height="6.5" rx="1" class="dr-led dr-led--${['ok', 'act', k === 1 ? 'warm' : 'act'][i]}" style="--d:${((k * 3 + i) * 0.37) % 2.2}s;--t:${0.6 + ((k + i) % 3) * 0.45}s"/>`).join('');
    const pk = k % 2 === 0 ? `<circle class="dr-pk" cx="0" cy="${H - 5}" r="2.4" style="--d:${k * 0.6}s"/>` : '';
    return `<g class="dr-unit" style="--k:${k}">
      <path d="${top}" class="dr-top"/><path d="${side}" class="dr-side"/>
      <g transform="matrix(.866 .5 0 1 ${x} ${y})"><rect width="${W}" height="${H}" class="dr-front"/><rect width="${W}" height="2" class="dr-lip"/>${leds}<rect x="42" y="${H / 2 - 1}" width="26" height="2" class="dr-vent"/>${bays}<rect x="${W - 22}" y="9" width="12" height="${H - 18}" rx="2" class="dr-handle"/>${pk}</g>
    </g>`;
  };
  // frame posts + cap + plinth
  const hTot = N * (H + GAP) + 10;
  const cap = (y: number, th: number) => {
    const x = X0 - 10 * 0.866, yy = y - 10 * 0.5 + 5;
    const uu = [(W + 20) * 0.866, (W + 20) * 0.5], vv = [(D + 14) * 0.866, -(D + 14) * 0.5];
    return `<path d="M${x} ${yy} l${uu[0]} ${uu[1]} l${vv[0]} ${vv[1]} l${-uu[0]} ${-uu[1]}Z" class="dr-cap-top"/>
      <path d="M${x} ${yy} l${uu[0]} ${uu[1]} v${th} l${-uu[0]} ${-uu[1]}Z" class="dr-cap-front"/>
      <path d="M${x + uu[0]} ${yy + uu[1]} l${vv[0]} ${vv[1]} v${th} l${-vv[0]} ${-vv[1]}Z" class="dr-cap-side"/>`;
  };
  const up = `M${(X0 + u[0] + v[0] - 20).toFixed(1)} ${(Y0 + u[1] + v[1] - 30).toFixed(1)} C 400 60, 420 40, 436 30`;
  return `<figure class="dr-rack" data-dr-rack>
  <svg viewBox="0 0 440 480" role="img" aria-label="Illustration of a server rack with five dedicated servers, status lights blinking and network traffic flowing">
    <ellipse cx="236" cy="${Y0 + hTot + 110}" rx="190" ry="34" class="dr-shadow"/>
    ${cap(Y0 + hTot - 2, 14)}
    <path d="M${X0 - 6} ${Y0 - 14} v${hTot + 16}" class="dr-post"/><path d="M${X0 + u[0] + 6} ${Y0 + u[1] - 10} v${hTot + 16}" class="dr-post"/>
    ${Array.from({ length: N }, (_, k) => unit(N - 1 - k)).join('')}
    ${cap(Y0 - 22, 12)}
    <g class="dr-uplink"><path d="${up}" pathLength="1"/><circle r="3" class="dr-pk2" style="offset-path:path('${up}')"/></g>
  </svg>
  <figcaption><span><i class="is-ok"></i>Healthy</span><span><i class="is-act"></i>Disk and network activity</span><span><i class="is-pk"></i>Traffic</span></figcaption>
</figure>`;
}

/* ------------------------------------------------------------------ spec explorer */
function explorer(ps: TProduct[], cat: Catalog) {
  if (!ps.length) return emptyState({ title: 'Servers are being restocked', text: 'There are no dedicated servers listed right now. Tell us the CPU, memory and storage you need and we will send you a quote.' });
  const rows = ps.map((p) => {
    const s = specsOf(p), f = fromPrice(p, cat.currency);
    const ram = gb(s.ram), disk = gb(s.storage);
    return { p, s, f, fam: family(p), thr: threads(p), ram, disk, st: storeType(s.storage || ''), port: is10g(p) ? '10Gbps' : '1Gbps', eol: isEol(p), out: isOut(p) };
  });
  const fams = [...new Set(rows.map((r) => r.fam))];
  const sts = [...new Set(rows.map((r) => r.st))];
  const rams = [...new Set(rows.map((r) => r.ram).filter(Boolean))].sort((a, b) => a - b);
  const ports = [...new Set(rows.map((r) => r.port))].sort();
  const eolN = rows.filter((r) => r.eol).length;
  const chipGroup = (key: string, label: string, vals: string[]) => vals.length < 2 ? '' :
    `<fieldset class="dx-fg"><legend>${esc(label)}</legend><div class="dx-chips">${vals.map((v) => `<label class="dx-chip"><input type="checkbox" data-f="${key}" value="${esc(v)}"><span>${esc(v)}</span></label>`).join('')}</div></fieldset>`;
  const badge = (r: (typeof rows)[number]) => r.eol ? '<span class="dx-tag dx-tag--eol" title="End-of-life hardware generation">End of life</span>'
    : r.out ? '<span class="dx-tag dx-tag--out">Out of stock</span>'
    : r.p.badge ? `<span class="dx-tag${/pre-?order/i.test(r.p.badge) ? ' dx-tag--pre' : ''}">${esc(r.p.badge)}</span>` : '';
  const body = rows.map((r, i) => {
    const price = r.f ? `<b class="num">${esc(money(r.f.price, r.f.prefix))}</b><small>${r.f.months > 1 ? `every ${r.f.months} months` : 'per month'}</small>` : `<a href="${esc(orderUrl(r.p, cat.base))}">See price</a>`;
    const label = r.out ? 'Ask sales' : r.f ? 'Configure' : 'See price';
    const href = r.out ? '/contact' : orderUrl(r.p, cat.base, r.f?.cycle);
    return `<tr class="dx-row${r.eol ? ' is-eol' : ''}${r.out ? ' is-out' : ''}" data-i="${i}" data-fam="${esc(r.fam)}" data-st="${esc(r.st)}" data-port="${r.port}" data-ram="${r.ram}" data-thr="${r.thr}" data-price="${r.f ? r.f.amount.toFixed(2) : ''}" data-eol="${r.eol ? 1 : 0}">
      <th scope="row"><a href="/p/${esc(r.p.slug)}">${esc(r.p.name)}</a>${badge(r)}<small>${esc(cpuModel(r.p) || r.fam)}</small></th>
      <td data-l="Processor"><span class="num">${esc(r.s.cpu || '—')}</span></td>
      <td data-l="Memory"><span class="num">${esc(r.s.ram || '—')}</span></td>
      <td data-l="Storage"><span class="num">${esc(r.s.storage || '—')}</span></td>
      <td data-l="Bandwidth"><span class="num">${esc(bwText(r.s.bandwidth || '—'))}</span>${r.port === '10Gbps' ? '<i class="dx-10g">10G</i>' : ''}</td>
      <td data-l="Price" class="dx-price">${price}</td>
      <td class="dx-cta"><a class="hp-btn ${r.eol || r.out ? 'hp-btn--ghost' : 'hp-btn--brand'}" href="${esc(href)}" aria-label="${esc(`${label}: ${r.p.name}`)}">${label}</a></td>
    </tr>`;
  }).join('');
  return `<div class="dx" data-dx>
  <div class="dx-filters">
    ${chipGroup('fam', 'Processor', fams)}
    ${chipGroup('st', 'Storage type', sts)}
    ${chipGroup('port', 'Network port', ports)}
    <div class="dx-fg dx-fg--row">
      <label class="dx-sel"><span>Minimum memory</span><select class="hp-select" data-f-ram><option value="0">Any</option>${rams.map((r) => `<option value="${r}">${r}GB or more</option>`).join('')}</select></label>
      <label class="dx-sel"><span>Sort by</span><select class="hp-select" data-sort><option value="price">Price: low to high</option><option value="price-d">Price: high to low</option><option value="thr">Most threads</option><option value="ram">Most memory</option></select></label>
      ${eolN ? `<label class="dx-switch"><input type="checkbox" data-eol-toggle><span class="dx-switch__ui" aria-hidden="true"></span><span>Show end-of-life models <span class="num">(${eolN})</span></span></label>` : ''}
    </div>
  </div>
  <div class="dx-status"><p data-dx-count aria-live="polite" class="num">${rows.length} servers</p><button type="button" class="dx-reset" data-dx-reset hidden>Clear filters</button></div>
  <div class="dx-wrap">
    <table class="dx-table">
      <caption class="sr-only">Dedicated servers with processor, memory, storage, bandwidth and monthly price</caption>
      <thead><tr><th scope="col">Server</th><th scope="col">Processor</th><th scope="col">Memory</th><th scope="col">Storage</th><th scope="col">Bandwidth</th><th scope="col">Price</th><th scope="col"><span class="sr-only">Order</span></th></tr></thead>
      <tbody data-dx-body>${body}</tbody>
    </table>
    <div class="dx-empty" data-dx-empty hidden><p>No server matches every filter. Clear one, or tell us what you need and we will source it.</p><a class="hp-btn hp-btn--ghost" href="/contact">Ask for a custom server</a></div>
  </div>
  ${eolN ? `<p class="dx-eolnote">${icon('info')}<span><b>End of life</b> marks an older hardware generation. These servers still carry live prices and suit backups, staging or light workloads. Ask sales to confirm stock before you rely on one for production.</span></p>` : ''}
</div>`;
}

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const { currency } = cat;
  const ps = productsFor(cat, ctx.route.categories);
  const current = ps.filter((p) => !isEol(p));
  const crumbs = crumbsFor(ctx.route.title);
  const from = minFrom(current.length ? current : ps, currency);
  const maxThr = Math.max(0, ...ps.map(threads));
  const maxRam = Math.max(0, ...ps.map((p) => gb(specsOf(p).ram)));
  const ips = specsOf(ps[0] || ({ features: [], attributes: {} } as unknown as TProduct)).ips;

  const hero = pageHero({
    crumbs, eyebrow: ctx.route.title,
    title: 'Bare-metal servers. All of the machine is yours.',
    lead: `No neighbours, no shared CPU. ${ps.length} models from proven Xeon to Ryzen 9${ps.some(is10g) ? ' and a 10Gbps flagship' : ''}${maxThr ? `, up to ${maxThr} threads` : ''}${maxRam ? ` and ${maxRam}GB of memory` : ''}, billed monthly.`,
    ctas: [{ label: 'Compare every server', href: '#servers' }, { label: 'Which CPU do I need?', href: '#tiers', variant: 'ghost' }],
    fromHtml: from ? `${current.length ? 'Current models' : 'Servers'} from <b class="num">${esc(money(from.price, from.prefix))}</b> per month` : undefined,
    visualHtml: rack(), network: false,
  });

  // tiers
  const xeon = ps.filter((p) => !/ryzen/i.test(family(p)) && !is10g(p)), ryzen = ps.filter((p) => /ryzen/i.test(family(p))), ten = ps.filter(is10g);
  const tierCard = (o: { id: string; name: string; list: TProduct[]; who: string; pros: string[]; ic: string; gold?: boolean }) => {
    if (!o.list.length) return '';
    const cur = o.list.filter((p) => !isEol(p));
    const f = minFrom(cur.length ? cur : o.list, currency);
    const mt = Math.max(0, ...o.list.map(threads)), mr = Math.max(0, ...o.list.map((p) => gb(specsOf(p).ram)));
    return `<article class="dx-tier${o.gold ? ' is-gold' : ''}" data-reveal>
      <div class="dx-tier__ico">${icon(o.ic)}</div>
      <h3>${esc(o.name)}</h3>
      <p class="dx-tier__who">${esc(o.who)}</p>
      <dl class="num"><div><dt>Models</dt><dd>${o.list.length}${cur.length !== o.list.length ? `<small>${cur.length} current</small>` : ''}</dd></div><div><dt>Up to</dt><dd>${mt} threads</dd></div><div><dt>Memory</dt><dd>${mr}GB</dd></div></dl>
      <ul>${o.pros.map((x) => `<li>${icon('check')}<span>${esc(x)}</span></li>`).join('')}</ul>
      <p class="dx-tier__from">${f ? `From <b class="num">${esc(money(f.price, f.prefix))}</b> per month` : 'See price in the order form'}</p>
      <a class="hp-link" href="#servers" data-dx-jump="${esc(o.id)}">Show these servers${icon('arrow')}</a>
    </article>`;
  };
  const tiersSec = `<section class="hp-section" id="tiers" aria-labelledby="tiers-h"><div class="hp-container">
    ${sectionHead({ id: 'tiers-h', title: 'Xeon, Ryzen or 10Gbps?', lead: 'Three kinds of server in one catalog. Start from what your workload needs most: many threads, fast single cores, or a very large network pipe.' })}
    <div class="dx-tiers">
      ${tierCard({ id: 'xeon', name: 'Intel Xeon', list: xeon, ic: 'server', who: 'Many cores at a low monthly price. Good for virtualisation, backups, game panels and multi-site hosting.', pros: ['Dual-socket models for high thread counts', 'Large-capacity SATA options for storage', 'Lowest entry price in the range'] })}
      ${tierCard({ id: 'ryzen', name: 'AMD Ryzen 9', list: ryzen, ic: 'bolt', who: 'Fast single-thread performance for databases, game servers, CI builds and busy applications.', pros: ['Modern high-clock cores', ...(ryzen.every((p) => /ecc/i.test(specsOf(p).ram || '')) ? ['ECC memory on every model'] : []), ...(ryzen.every((p) => /2x.*nvme/i.test(specsOf(p).storage || '')) ? ['Two NVMe drives per server'] : ['NVMe storage'])] })}
      ${tierCard({ id: '10g', name: '10Gbps network', list: ten, ic: 'net', gold: true, who: 'A ten-gigabit unmetered port for streaming, large downloads, CDN origins and heavy APIs.', pros: ['Unmetered 10Gbps port', ...(ten.length ? [`${Math.max(...ten.map(threads))} threads, ${Math.max(...ten.map((p) => gb(specsOf(p).ram)))}GB memory`] : []), 'Built for sustained traffic'] })}
    </div>
  </div></section>`;

  const servers = `<section class="hp-section hp-section--tint" id="servers" aria-labelledby="servers-h"><div class="hp-container">
    ${splitHead({ id: 'servers-h', title: 'Every server, every spec', lead: 'Filter by processor, memory, storage and network port, then sort by price or power. Prices come live from our billing system.' })}
    ${explorer(ps, cat)}
    ${plansNote(currency, link('Need a custom build? Talk to sales', '/contact'))}
  </div></section>`;

  const bws = ps.map((p) => specsOf(p).bandwidth || '');
  const unm = bws.some((b) => /unmetered/i.test(b)), capped = bws.find((b) => /\d+TB/i.test(b))?.match(/\d+TB/i)?.[0];
  const netFacts: [string, string][] = [
    ...(ips && ps.every((p) => specsOf(p).ips === ips) ? [[ips.replace(/IPs?$/i, 'IPv4'), 'addresses with every server listed here'] as [string, string]] : []),
    ...(unm || capped ? [[unm && capped ? `Unmetered or ${capped}` : unm ? 'Unmetered' : capped!, 'monthly traffic, depending on the model'] as [string, string]] : []),
    [ps.some(is10g) ? 'Up to 10Gbps' : '1Gbps', ps.some(is10g) ? 'network port on the flagship' : 'network port on every server'],
  ];
  const net = `<section class="hp-section hp-section--dark hp-on-dark" aria-labelledby="dc-h"><div class="hp-container dx-net">
    <div>
      <h2 id="dc-h" class="hp-hline hp-h2">Racked in our datacenter network</h2>
      <p class="hp-lead">Six datacenters on five continents, run from our headquarters in Dubai. The location of each server is confirmed in the order form; tell us where your users are and we will suggest the closest one.</p>
      <ul class="dx-netlist">${netFacts.map(([a, b]) => `<li><b class="num">${esc(a)}</b><span>${esc(b)}</span></li>`).join('')}</ul>
    </div>
    ${dcMap({ title: 'Where your server can live', caption: 'Datacenter locations, linked to our Dubai headquarters.' })}
  </div></section>`;

  const features = `<section class="hp-section" aria-labelledby="feat-h"><div class="hp-container">
    ${sectionHead({ id: 'feat-h', title: 'What comes with every dedicated server' })}
    ${featureGrid([
      { icon: 'server', title: 'The whole machine', text: 'Every core, every gigabyte and every disk belongs to you. No virtualisation layer, no neighbours.' },
      { icon: 'key', title: 'Full root access', text: 'Install your own operating system build, hypervisor or control panel.' },
      { icon: 'net', title: ips ? ips.replace(/IPs?$/i, 'IPv4 addresses') : 'Dedicated IPv4 addresses', text: 'Enough addresses for several sites, services or virtual machines.' },
      { icon: 'activity', title: 'Unmetered options', text: 'Most models include unmetered traffic or a 30TB monthly allowance on a 1Gbps port.' },
      { icon: 'memory', title: maxRam ? `Up to ${maxRam}GB memory` : 'Large memory', text: 'From 16GB entry servers to ECC DDR4 and DDR5 configurations.' },
      { icon: 'drive', title: 'SSD, NVMe or bulk SATA', text: 'Fast NVMe for databases, or large SATA disks when capacity matters more than speed.' },
      { icon: 'calendar', title: 'Monthly billing', text: 'Pay month to month. No long contracts to sign before you know the server fits.' },
      { icon: 'headset', title: '24/7 engineers', text: 'Hardware checks, reboots and network help by phone, email, WhatsApp and ticket.' },
      { icon: 'move', title: 'Help moving in', text: 'We help move your data and services from your current provider.' },
    ])}
  </div></section>`;

  const faqs = [
    { q: 'Which dedicated server should I choose?', a: 'Start from your bottleneck. Choose dual Xeon models for many parallel tasks at a low price, Ryzen 9 for fast single-thread work such as databases and game servers, and the 10Gbps server when network throughput matters most. If you are unsure, send us your current usage and we will suggest a model.' },
    { q: 'What does "End of life" mean in the list?', a: 'It marks an older hardware generation. These servers are still listed with live prices and are useful for backups, staging and light workloads, but stock is limited. Ask sales to confirm availability before you depend on one for production.' },
    { q: 'What do "Pre-Order" and "Out of stock" mean?', a: 'Pre-Order servers can be ordered now and are delivered when the hardware arrives. Out-of-stock servers cannot be delivered at the moment; contact sales and we will tell you when it is back or suggest an equivalent.' },
    { q: 'How long does it take to set up a server?', a: 'It depends on the model and stock. We confirm the delivery time after your order, and you receive your login details by email when the server is ready.' },
    { q: 'Is the bandwidth really unmetered?', a: 'Models marked "Unmetered" have no monthly traffic cap on their port speed (1Gbps or 10Gbps). Models marked "30TB" include 30TB of traffic per month. The port speed is shown next to each server.' },
    { q: 'Can I install my own operating system or hypervisor?', a: 'Yes. You get full root access to the hardware. Tell us the operating system you want when you order, or install your own hypervisor such as Proxmox and run virtual machines on the IP addresses included.' },
  ];
  const faqSec = `<section class="hp-section hp-section--tint" aria-labelledby="faq-h"><div class="hp-container dx-faq">
    ${sectionHead({ id: 'faq-h', title: 'Dedicated server questions', align: 'left', lead: 'Need a configuration you cannot see here? Our team can source and rack it.' })}
    ${faq(faqs, { id: 'ded-faq' })}
  </div></section>`;

  const cta = ctaBand({ id: 'cta', title: 'Get a whole server to yourself', text: 'Pick a model, configure it and go. Engineers are on call around the clock.',
    primary: { label: 'Compare every server', href: '#servers' }, secondary: { label: 'Ask for a custom build', href: '/contact' } });

  return page({
    ctx, catalog: cat, path: ctx.path, title: ctx.route.title, description: ctx.route.description, css: ['dedicated'], js: ['dedicated'],
    jsonLd: [breadcrumbJsonLd(crumbs, siteOf(cat)), faqJsonLd(faqs), productsLd(ps, cat, 'Dedicated servers')].filter(Boolean),
    body: [hero, tiersSec, servers, net, features, faqSec, cta].join('\n'),
  });
}
