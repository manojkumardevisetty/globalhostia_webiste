// Cloud VPS & Servers (WHMCS group "servers", provisioned automatically by the rdp.monster VPS Automation
// module) and Windows RDP (group "windows-rdp"). Prices are the selling prices synced from WHMCS (cost + your margin).
// Tiers: Classic and High performance VPS in Europe and USA, Dedicated servers, Windows RDP.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { getCatalog, productsFor, minFrom, fromPrice, type TProduct } from '../data';
import { page } from '../shell';
import { pageHero, sectionHead, planCards, plansNote, featureGrid, faq, faqJsonLd, ctaBand, breadcrumbJsonLd, bigTabs, icon } from '../ui';

const CLASSIC = /^(basic|standard|pro|advanced|elite)\b/i;
const PERF = /^(swift|velocity|turbo|boost|mega)\b/i;
const region = (p: TProduct) => (/\b(usa|us)\b/i.test(p.name) ? 'USA' : /\beurope|france|\bfr\b|\beu\b/i.test(p.name) ? 'Europe' : 'Other');
const strip = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** WHMCS descriptions read like "2 vCPU 6 GB RAM 40 GB NVMe 1 IPv4": turn them into a features list when none exists. */
function withFeatures(p: TProduct): TProduct {
  if (p.features.length) return p;
  const d = strip(`${p.description} ${p.name}`);
  const f: string[] = [];
  const cpu = d.match(/(\d+)\s*v?CPU/i) || d.match(/(\d+)\s*Core/i); if (cpu) f.push(`${cpu[1]} vCPU`);
  const proc = d.match(/((?:\d+x\s*)?(?:Dual\s+)?(?:AMD Ryzen [\w ]+?\d{4}X|Intel Xeon [\w -]+?\d{3,4}(?:\s?v\d)?|E5-\d{4}v\d|Xeon Silver \d{4}))/i); if (proc && !cpu) f.push(proc[1].trim());
  const ram = d.match(/(\d+)\s*GB\s*(?:RAM|DDR\d)/i) || d.match(/(\d+)GB\s*RAM/i); if (ram) f.push(`${ram[1]} GB RAM`);
  const disk = d.match(/((?:\d+x\s*)?\d+(?:\.\d+)?\s*(?:GB|TB))\s*(NVMe|SSD|SAS|SATA)/i); if (disk) f.push(`${disk[1].replace(/\s+/g, ' ')} ${disk[2]}`);
  const ip = d.match(/(\d+)\s*IPv4/i); f.push(ip ? `${ip[1]} dedicated IPv4` : '1 dedicated IPv4');
  const port = d.match(/(\d+\s*G(?:bit|bps)\/?s?)/i); if (port) f.push(`${port[1].replace(/bit\/s/i, 'bps')} port`);
  f.push('Full root / administrator access', 'Choose your OS at checkout');
  return { ...p, features: f };
}

export default async function render(ctx: PageCtx) {
  const cat = await getCatalog();
  const { currency, base } = cat;
  const linuxPage = ctx.slug === 'linux-rdp';
  const rdpPage = ctx.slug === 'windows-rdp' || linuxPage;
  const rdpName = linuxPage ? 'Linux RDP' : 'Windows RDP';
  // VPS Automation products are placed by sync rules: Classic and High performance → hostiavps (attributes.tier),
  // France/USA bare metal → dedicated-servers, RDP → windows-rdp (anything unmatched stays in "servers").
  const AUTO_DED = /^(france|usa|germany|netherlands|uk)\s*-/i;
  const classic = productsFor(cat, ['hostiavps', 'servers']).filter((p) => CLASSIC.test(p.name)).map(withFeatures);
  const perf = productsFor(cat, ['hostiavps', 'servers']).filter((p) => PERF.test(p.name)).map(withFeatures);
  const dedicated = productsFor(cat, ['dedicated-servers', 'servers']).filter((p) => AUTO_DED.test(p.name)).map(withFeatures);
  const rdp = productsFor(cat, ['windows-rdp']).map(withFeatures);
  const lrdp = productsFor(cat, ['linux-rdp']).map(withFeatures);
  const all = [...classic, ...perf, ...dedicated];
  const allRdp = [...rdp, ...lrdp];
  const from = (ps: TProduct[]) => { const m = minFrom(ps, currency); return m ? `${m.prefix}${m.amount.toFixed(2)}` : ''; };
  const osList = (() => { const o = all.concat(allRdp).flatMap((p) => p.configOptions || []).find((c) => /operating|system|os\b/i.test(c.name)); return o ? o.options.map((x) => x.name) : []; })();
  const addOns = (() => { const s = new Set<string>(); for (const p of all) for (const c of p.configOptions || []) if (c.type === 'quantity') s.add(c.name.replace(/^additional\s+/i, '')); return [...s]; })();

  const cards = (ps: TProduct[], id: string, note?: string) => planCards(ps, { currency, base, id, groupBy: (p) => region(p as TProduct), cycleSwitch: true, details: true, note, orderLabel: 'Configure & order', emptyTitle: 'Coming soon', emptyText: 'These servers are being added. Talk to our team for a quote.' });

  const tabs = [
    classic.length && { id: 'classic', label: 'Classic VPS', sub: from(classic) ? `from ${from(classic)}/mo` : 'Balanced', icon: 'server', panelHtml: cards(classic, 'sv-classic', 'Balanced vCPU, RAM and NVMe for websites, apps and databases.') },
    perf.length && { id: 'perf', label: 'High-performance VPS', sub: from(perf) ? `from ${from(perf)}/mo` : 'Faster cores', icon: 'bolt', panelHtml: cards(perf, 'sv-perf', 'Faster CPU and storage for heavy apps, game servers and CI.') },
    dedicated.length && { id: 'dedicated', label: 'Dedicated servers', sub: from(dedicated) ? `from ${from(dedicated)}/mo` : 'Bare metal', icon: 'cpu', panelHtml: cards(dedicated, 'sv-ded', 'A whole physical server: no neighbours, full hardware.') },
    lrdp.length && { id: 'lrdp', label: 'Linux RDP', sub: from(lrdp) ? `from ${from(lrdp)}/mo` : 'Linux desktop', icon: 'term', panelHtml: cards(lrdp, 'sv-lrdp', 'A cloud Linux desktop with remote access and full root.') },
    rdp.length && { id: 'rdp', label: 'Windows RDP', sub: from(rdp) ? `from ${from(rdp)}/mo` : 'Remote desktop', icon: 'monitor', panelHtml: cards(rdp, 'sv-rdp', 'A ready Windows desktop you connect to from anywhere.') },
  ].filter(Boolean) as any[];
  const first = linuxPage ? 'lrdp' : 'rdp';
  if (rdpPage) tabs.sort((a, b) => (a.id === first ? -1 : b.id === first ? 1 : 0));

  const title = linuxPage ? 'Linux RDP servers, ready in minutes' : rdpPage ? 'Windows RDP servers, ready in minutes' : 'Cloud VPS and servers in Europe and the USA';
  const lead = linuxPage
    ? 'A Linux desktop in the cloud that is always on. Connect remotely from any device, keep full root access and run development tools, automation and browsers 24/7.'
    : rdpPage
    ? 'A Windows desktop in the cloud that is always on. Connect from any computer or phone with Remote Desktop and run trading platforms, bots and office software around the clock.'
    : 'Pick Classic or High-performance VPS in Europe or the USA, or a dedicated server. Choose your operating system, add RAM, vCPU or disk, and your server is set up automatically after payment.';
  const crumbs = [{ label: 'Home', href: '/' }, { label: rdpPage ? rdpName : 'Cloud servers' }];

  const steps = [
    { icon: 'settings', title: '1. Configure', text: 'Choose a plan, region, operating system and any extra RAM, vCPU or disk.' },
    { icon: 'cart', title: '2. Pay securely', text: 'Check out in our client area. Your price is shown before you pay.' },
    { icon: 'bolt', title: '3. Automatic setup', text: 'The server is created automatically and the login details are emailed to you.' },
    { icon: 'monitor', title: '4. Manage it', text: 'Reboot, view graphs, open the console and upgrade from your client area.' },
  ];
  const features = [
    { icon: 'bolt', title: 'Automatic provisioning', text: 'Servers are created by our automation as soon as your payment clears — no waiting for a ticket.' },
    { icon: 'drive', title: 'NVMe storage', text: 'Fast NVMe disks on every VPS plan. Disk can be increased later from your client area.' },
    { icon: 'settings', title: 'Build your own size', text: addOns.length ? `Add ${addOns.join(', ').toLowerCase()} at checkout or later as an upgrade.` : 'Add resources at checkout or later as an upgrade.' },
    { icon: 'globe', title: 'Europe or USA', text: 'Host close to your visitors or trading servers in our Europe and USA regions.' },
    { icon: 'term', title: 'Full access', text: 'Root on Linux, Administrator on Windows. Install whatever your project needs.' },
    { icon: 'life', title: '24/7 support', text: 'Our team helps by ticket, phone and WhatsApp whenever you need it.' },
  ];
  const faqs = [
    { q: 'How quickly is my server ready?', a: 'Setup is automatic. As soon as your payment is confirmed the server is created and the access details are emailed to you, usually within minutes.' },
    { q: 'Which operating systems can I choose?', a: osList.length ? `You pick the system at checkout: ${osList.join(', ')}.` : 'You pick the operating system at checkout.' },
    { q: 'Can I add more RAM, vCPU or disk later?', a: 'Yes. You can add resources when you order and upgrade later from your client area. Disk space can only be increased, not reduced.' },
    { q: 'What is the difference between Classic and High performance?', a: 'Both include NVMe storage and full access. High-performance plans run on faster processors and storage for workloads that need more speed per core.' },
    { q: 'Do I need a domain to order?', a: 'No. Servers and Windows RDP are ordered without a domain. You can point a domain at your server later if you want one.' },
    { q: 'How is billing handled?', a: 'Pay monthly, every 3, 6 or 12 months. Longer periods cost less per month. The price you see includes everything for the plan; add-ons are listed separately at checkout.' },
  ];

  const hero = pageHero({
    eyebrow: rdpPage ? rdpName : 'VPS & dedicated servers', title, lead, crumbs,
    ctas: [{ label: 'Choose a server', href: '#plans', icon: 'server' }, { label: 'Talk to sales', href: '/contact', variant: 'ghost' }],
    fromHtml: from(all.concat(allRdp)) ? `From <b>${esc(from(all.concat(allRdp)))}</b> a month` : '',
    network: true,
  });

  const body = `${hero}
<section class="hp-section" id="plans" aria-labelledby="sv-plans-h">
  <div class="hp-container">${sectionHead({ id: 'sv-plans-h', title: 'Choose your server', lead: 'Every plan is created automatically after payment. Switch region on each tab, then configure your OS and add-ons on the next step.' })}
  ${tabs.length ? bigTabs(tabs, { label: 'Server type', id: 'sv-tabs' }) : '<p>Servers are being added. Please contact sales.</p>'}
  ${plansNote(currency)}</div>
</section>
<section class="hp-section hp-section--tint" aria-labelledby="sv-how-h"><div class="hp-container">${sectionHead({ id: 'sv-how-h', title: 'From order to online in four steps' })}${featureGrid(steps as any, { cols: 4 })}</div></section>
${osList.length ? `<section class="hp-section" aria-labelledby="sv-os-h"><div class="hp-container">${sectionHead({ id: 'sv-os-h', title: 'Your choice of operating system' })}
  <ul class="sv-os" role="list">${osList.map((o) => `<li>${icon(/windows/i.test(o) ? 'win' : 'term')}<span>${esc(o)}</span></li>`).join('')}</ul></div></section>` : ''}
<section class="hp-section hp-section--dark" aria-labelledby="sv-f-h"><div class="hp-container">${sectionHead({ id: 'sv-f-h', title: 'Built for always-on workloads' })}${featureGrid(features as any, { cols: 3 })}</div></section>
<section class="hp-section" aria-labelledby="sv-faq-h"><div class="hp-container">${sectionHead({ id: 'sv-faq-h', title: 'Questions about servers' })}${faq(faqs, { openFirst: true })}</div></section>
${ctaBand({ title: linuxPage ? 'Get your Linux desktop online today' : rdpPage ? 'Get your Windows desktop online today' : 'Launch your server today', text: 'Configure it in a minute — setup is automatic.', primary: { label: 'Choose a server', href: '#plans' }, secondary: { label: 'Talk to sales', href: '/contact' } })}`;

  return page({
    title: ctx.route.title, description: ctx.route.description, path: ctx.path, body, ctx, css: ['servers'],
    jsonLd: [breadcrumbJsonLd(crumbs, cat.settings.site_url || ''), faqJsonLd(faqs)],
  });
}
