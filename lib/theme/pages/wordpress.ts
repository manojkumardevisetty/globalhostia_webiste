// Managed WordPress hosting: hero = animated mock wp-admin (cache hit, updates applied, backup done)
// with an illustrative speed gauge; then install steps, staging/updates/backups explained, real plans.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { money } from '../../pricing';
import { getCatalog, productsFor, minFrom, currencyPrefix } from '../data';
import { page } from '../shell';
import {
  pageHero, sectionHead, splitHead, planCards, plansNote, featureGrid, faq, faqJsonLd, ctaBand, breadcrumbJsonLd, bigTabs,
  icon, ld, link, available,
} from '../ui';

const H = ['hosting-usa', 'hostia-shared', 'hosting-singapore'];

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const { currency, base } = cat;
  const prefix = currencyPrefix(cat) || '$';
  const woo = /ecommerce/.test(ctx.slug);
  const wpOnly = productsFor(cat, ['wordpress-hosting']);
  const fallback = !wpOnly.length;
  const products = fallback ? productsFor(cat, (ctx.route.categories || H).filter((c) => c !== 'wordpress-hosting')) : wpOnly;
  const from = minFrom(available(products), currency);
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Hosting', href: '/web-hosting' }, { label: ctx.route.title }];

  /* ---------------- hero: animated mock wp-admin ---------------- */
  const R = 52, C = +(2 * Math.PI * R * 0.75).toFixed(1); // 270-degree arc
  const tasks = [
    { ic: 'bolt', t: 'Page cache', s: 'HIT', d: 'Served from cache' },
    { ic: 'refresh', t: 'Plugin and theme updates', s: '3 applied', d: 'Checked against a backup' },
    { ic: 'archive', t: 'Nightly backup', s: 'Complete', d: 'Files and database' },
  ];
  const mock = `<figure class="wpx-win" data-wpx-demo data-pause>
    <div class="wpx-bar" aria-hidden="true"><span></span><span></span><span></span><p>yourbusiness.com/wp-admin</p></div>
    <div class="wpx-body" aria-hidden="true">
      <div class="wpx-side"><span class="wpx-logo">${icon('wp')}</span>${['Dashboard', 'Posts', 'Media', 'Pages', 'Plugins', 'Settings'].map((m, i) => `<span class="wpx-nav${i === 0 ? ' is-on' : ''}"><i></i>${m}</span>`).join('')}</div>
      <div class="wpx-main">
        <p class="wpx-hi">Good morning. Here is what happened overnight.</p>
        <div class="wpx-top">
          <div class="wpx-gauge"><svg viewBox="0 0 120 120"><circle class="wpx-gauge__bg" cx="60" cy="60" r="${R}" stroke-dasharray="${C} 400"/><circle class="wpx-gauge__fg" cx="60" cy="60" r="${R}" stroke-dasharray="${C} 400" style="--c:${C};--v:.96"/></svg><b class="num" data-wpx-score>96</b><small>Speed score</small></div>
          <ul class="wpx-vitals"><li><span>Page load</span><i style="--w:.82"></i></li><li><span>Images</span><i style="--w:.9"></i></li><li><span>Database</span><i style="--w:.74"></i></li></ul>
        </div>
        <ul class="wpx-log">${tasks.map((t, i) => `<li class="wpx-task" style="--i:${i}"><span class="wpx-task__ic">${icon(t.ic)}</span><span class="wpx-task__t"><b>${esc(t.t)}</b><small>${esc(t.d)}</small></span><span class="wpx-task__s"><i>${icon('check')}</i>${esc(t.s)}</span></li>`).join('')}</ul>
      </div>
    </div>
    <figcaption class="wpx-cap">Illustration of a WordPress dashboard. The score and task results are examples, not measurements of your site.</figcaption>
  </figure>`;

  const hero = pageHero({
    crumbs, eyebrow: woo ? 'WooCommerce hosting' : 'WordPress hosting',
    title: woo ? 'WordPress hosting for stores that cannot afford to stall' : 'WordPress hosting that keeps itself fast, current and backed up',
    lead: woo
      ? 'Run WooCommerce on flash storage with caching, daily backups and free SSL for checkout. We look after the server so you can look after orders.'
      : 'WordPress installed for you on NVMe-backed hosting, with caching, safe updates and automatic backups. You write and sell; we keep the engine running.',
    ctas: [{ label: 'See WordPress plans', href: '#plans' }, { label: 'How it works', href: '#how', variant: 'ghost' }],
    fromHtml: from ? `Plans from <b class="num">${esc(money(from.price, from.prefix || prefix))}</b> ${from.cycle === 'monthly' ? 'a month' : from.cycle === 'annually' ? 'a year' : ''}, free SSL included` : undefined,
    trust: ['Free SSL certificate', 'Daily backups', 'Free migration'],
    visualHtml: mock,
  });

  /* ---------------- install steps ---------------- */
  const steps = [
    { ic: 'cart', t: 'Pick a plan', d: 'Choose the plan size and the datacenter closest to your readers or customers.' },
    { ic: 'globe', t: 'Add your domain', d: 'Register a new domain or connect one you already own while ordering.' },
    { ic: 'wp', t: 'Install WordPress', d: 'One click in the control panel’s app installer, or ask support and we set it up for you.' },
    { ic: 'rocket', t: 'Log in and publish', d: 'Open yourdomain.com/wp-admin, pick a theme and publish your first page.' },
  ];
  const how = `<section class="hp-section" id="how" aria-labelledby="how-h"><div class="hp-container">
    ${sectionHead({ id: 'how-h', title: 'From order to first post in four steps', lead: 'No servers to configure and no files to upload. Most sites are ready the same day.' })}
    <ol class="wpx-steps" data-stagger>${steps.map((s, i) => `<li class="wpx-step" data-reveal><span class="wpx-step__n num" aria-hidden="true">${i + 1}</span><span class="wpx-step__ic">${icon(s.ic)}</span><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></li>`).join('')}</ol>
  </div></section>`;

  /* ---------------- staging / updates / backups ---------------- */
  const stagingPanel = `<div class="wpx-panel"><div class="wpx-panel__copy"><h3>Try changes where visitors cannot see them</h3><p>A staging site is a private copy of your live site. Install a new plugin, switch themes or rework a page there first. When it looks right, push the changes live; if it breaks, delete the copy and nothing on your real site changed.</p><ul class="wpx-ticks"><li>${icon('check')}Clone your live site in a few clicks</li><li>${icon('check')}Test plugins and themes safely</li><li>${icon('check')}Publish only when you are ready</li></ul></div>
    <div class="wpx-dia wpx-dia--stage" aria-hidden="true"><div class="wpx-site"><b>Live site</b><small>yourbusiness.com</small><span class="wpx-ok">Visitors see this</span></div><div class="wpx-arrows"><span>${icon('right')}Copy to staging</span><span class="is-back">${icon('left')}Push changes live</span></div><div class="wpx-site is-stage"><b>Staging copy</b><small>Private preview</small><span class="wpx-ok">Only you see this</span></div></div></div>`;
  const updatesPanel = `<div class="wpx-panel"><div class="wpx-panel__copy"><h3>Updates without the Sunday-night worry</h3><p>Most WordPress break-ins exploit plugins that were never updated. Keep WordPress core, themes and plugins current with automatic updates, and because a backup runs every day, a bad update can be rolled back.</p><ul class="wpx-ticks"><li>${icon('check')}Security releases applied promptly</li><li>${icon('check')}A recent backup to fall back on</li><li>${icon('check')}Choose which plugins update automatically</li></ul></div>
    <div class="wpx-dia" aria-hidden="true"><ul class="wpx-upd">${[['WordPress core', 'Security release'], ['Contact form plugin', 'Bug fix'], ['Your theme', 'New version']].map(([n, k]) => `<li><span class="wpx-upd__ic">${icon('refresh')}</span><span><b>${n}</b><small>${k}</small></span><em>${icon('check')}Updated</em></li>`).join('')}</ul><p class="wpx-dia__note">Example items</p></div></div>`;
  const backupsPanel = `<div class="wpx-panel"><div class="wpx-panel__copy"><h3>Every day has a restore point</h3><p>Your files and database are backed up automatically every day and every week, stored away from the server your site runs on. Restore a single file, the database or the whole site from your control panel, or open a ticket and we restore it for you.</p><ul class="wpx-ticks"><li>${icon('check')}Daily and weekly backups</li><li>${icon('check')}Files and databases included</li><li>${icon('check')}Restore yourself or ask support</li></ul></div>
    <div class="wpx-dia" aria-hidden="true"><div class="wpx-days">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => `<span class="${i === 6 ? 'is-wk' : ''}"><i></i>${d}</span>`).join('')}</div><p class="wpx-dia__note">Daily restore points, plus a weekly copy</p></div></div>`;
  const care = `<section class="hp-section hp-section--tint" aria-labelledby="care-h"><div class="hp-container">
    ${splitHead({ id: 'care-h', title: 'Staging, updates and backups, explained', lead: 'The three habits that keep a WordPress site healthy. Here is what each one does for you and why it matters.' })}
    ${bigTabs([
      { label: 'Staging', sub: 'Test before you publish', icon: 'layers', panelHtml: stagingPanel },
      { label: 'Updates', sub: 'Stay patched', icon: 'refresh', panelHtml: updatesPanel },
      { label: 'Backups', sub: 'Daily restore points', icon: 'archive', panelHtml: backupsPanel },
    ], { label: 'WordPress care', id: 'wpx-care' })}
  </div></section>`;

  /* ---------------- plans ---------------- */
  const plans = `<section class="hp-section" id="plans" aria-labelledby="plans-h"><div class="hp-container">
    ${sectionHead({ id: 'plans-h', title: woo ? 'Plans for WordPress and WooCommerce' : 'WordPress hosting plans', lead: fallback ? 'WordPress runs on our NVMe web hosting plans. Pick a location and a size; every plan can host WordPress.' : 'Pick a plan size. Every plan includes free SSL and daily backups.' })}
    ${planCards(products, { currency, base, locationTabs: true, groupLabel: 'Hosting location', id: 'wpx-plans',
      note: fallback ? 'These are our web hosting plans, the same servers we run WordPress on. Larger stores with many products are better on the Ultra or Infinity sizes.' : undefined,
      emptyTitle: 'WordPress plans are being updated', emptyText: 'Tell us about your site and we will recommend the right setup.' })}
    ${plansNote(currency, link('Compare all web hosting', '/web-hosting'))}
  </div></section>`;

  /* ---------------- built for blogs and stores ---------------- */
  const fit = `<section class="hp-section" aria-labelledby="fit-h"><div class="hp-container wpx-fit">
    <figure class="wpx-fit__img" data-reveal><img src="/hp/img/wordpress-store.jpg" alt="A shop owner serving customers behind the counter" width="600" height="400" loading="lazy" decoding="async"></figure>
    <div>
      ${sectionHead({ id: 'fit-h', title: woo ? 'Built for the checkout moment' : 'Built for blogs, portfolios and shops', align: 'left' })}
      ${featureGrid([
        { icon: 'drive', title: 'Flash storage', text: 'WordPress reads thousands of small files and database rows per page. NVMe and SSD drives answer quickly.' },
        { icon: 'lock', title: 'Free SSL for checkout', text: 'HTTPS on your domain from day one, so logins, forms and payments are encrypted.' },
        { icon: 'shield', title: 'Hardened servers', text: 'We patch the operating system and web server, so you only look after WordPress itself.' },
        { icon: 'move', title: 'Free migration', text: 'Already on WordPress elsewhere? We move files and database and check everything works.' },
        { icon: 'mail', title: 'Email on your domain', text: 'Order confirmations and contact forms sent from addresses on your own domain.' },
        { icon: 'headset', title: 'WordPress-aware support', text: 'White screen, broken plugin or login loop: our engineers help at any hour.' },
      ], { cols: 2 })}
    </div>
  </div></section>`;

  /* ---------------- FAQ ---------------- */
  const faqs = [
    { q: 'Is WordPress already installed?', a: 'You can install WordPress in one click from the app installer in your control panel. If you prefer, open a ticket after ordering and our team installs it for you.' },
    { q: 'Can you move my existing WordPress site?', a: 'Yes, migration is free. We copy your files and database from your current host, check the site works on our servers, and you point your domain once you are happy.' },
    { q: 'Which plan do I need for WooCommerce?', a: 'Small stores run well on the entry plans. If you have a large catalogue, many plugins or run several stores, choose a larger plan for more storage, databases and websites. You can upgrade later without moving your site.' },
    { q: 'What happens if an update breaks my site?', a: 'Your site is backed up every day and every week. Restore the previous day’s files and database from your control panel, or ask support to roll it back for you.' },
    { q: 'Can I use any theme or plugin?', a: 'Yes. You have full access to WordPress, so you can install any theme or plugin from WordPress.org or a vendor. We only step in if a plugin puts the server or other customers at risk.' },
    { q: 'Do I get a free domain and SSL?', a: 'Every plan includes a free SSL certificate. Domains are registered separately at the prices shown in our domain search, and transfers to us are free.' },
  ];
  const faqSec = `<section class="hp-section hp-section--tint" aria-labelledby="faq-h"><div class="hp-container wpx-faq">
    ${sectionHead({ id: 'faq-h', title: 'WordPress hosting questions' })}
    ${faq(faqs, { id: 'wpx-faq', single: true })}
  </div></section>`;

  const cta = ctaBand({ id: 'cta', title: woo ? 'Open your store on hosting that keeps up' : 'Launch your WordPress site today', text: 'Pick a plan, add your domain and install WordPress in one click. Migration and SSL are free.',
    primary: { label: 'See plans', href: '#plans' }, secondary: { label: 'Talk to sales', href: '/contact' } });

  const site = String(cat.settings.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const offer = from ? ld({ '@context': 'https://schema.org', '@type': 'Product', name: ctx.route.title, description: ctx.route.description, brand: { '@type': 'Brand', name: cat.settings.site_name || 'Globalhostia' },
    offers: { '@type': 'AggregateOffer', priceCurrency: currency, lowPrice: from.price.toFixed(2), offerCount: products.length, url: `${site}/${ctx.slug}` } }) : '';

  return page({
    ctx, catalog: cat, path: `/${ctx.slug}`, title: ctx.route.title, description: ctx.route.description,
    css: ['wordpress'], js: ['wordpress'],
    jsonLd: [breadcrumbJsonLd(crumbs, site), faqJsonLd(faqs), offer].filter(Boolean),
    body: [hero, how, care, plans, fit, faqSec, cta].join('\n'),
  });
}
