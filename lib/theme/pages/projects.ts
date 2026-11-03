// Project management workspace: animated kanban hero, "one workspace, zero extra cost" seat-cost explainer,
// features by job (plan / collaborate / track), plans + comparison, setup steps with team photo, FAQ.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { picture } from '../img';
import { getCatalog, productsFor, fromPrice, orderUrl, type TProduct, type Catalog } from '../data';
import { page } from '../shell';
import {
  pageHero, sectionHead, splitHead, planCards, plansNote, specTable, featureGrid, bigTabs, faq, faqJsonLd, ctaBand, breadcrumbJsonLd, ld, icon,
  available, type FeatureItem,
} from '../ui';

type Card = { t: string; tag: string; tone: 'a' | 'b' | 'c'; who: string; due: string };
const COLS: { name: string; cards: Card[] }[] = [
  { name: 'To do', cards: [
    { t: 'Homepage wireframes', tag: 'Design', tone: 'a', who: 'SK', due: 'Mon' },
    { t: 'Upload brand assets', tag: 'Client', tone: 'c', who: 'AR', due: 'Tue' },
    { t: 'Sprint 14 backlog', tag: 'Planning', tone: 'b', who: 'MJ', due: 'Wed' },
  ] },
  { name: 'Doing', cards: [
    { t: 'Fix checkout bug', tag: 'Development', tone: 'b', who: 'HN', due: 'Today' },
    { t: 'Client kickoff notes', tag: 'Client', tone: 'c', who: 'SK', due: 'Today' },
  ] },
  { name: 'Done', cards: [
    { t: 'Q3 roadmap review', tag: 'Planning', tone: 'b', who: 'MJ', due: 'Thu' },
    { t: 'Staging deploy', tag: 'Development', tone: 'a', who: 'AR', due: 'Fri' },
  ] },
];

function kanban() {
  const card = (c: Card, col: number) => `<li class="kb-card" data-due="${esc(c.due)}"><span class="kb-tag is-${c.tone}">${esc(c.tag)}</span><b>${esc(c.t)}</b><span class="kb-meta"><i class="kb-av">${esc(c.who)}</i><span class="kb-due">${icon('calendar')}${esc(col === 2 ? 'Done' : c.due)}</span></span></li>`;
  return `<div class="kb" data-kb role="img" aria-label="Illustration: a project board with To do, Doing and Done columns. Cards move from To do to Doing to Done as the team works.">
  <div class="kb__top" aria-hidden="true"><span class="kb__proj"><i></i>Website relaunch</span><span class="kb__views"><b>Board</b><span>Gantt</span><span>Wiki</span></span></div>
  <div class="kb__cols" aria-hidden="true">${COLS.map((c, i) => `<div class="kb-col" data-col="${i}"><h3><span>${esc(c.name)}</span><em class="num">${c.cards.length}</em></h3><ul>${c.cards.map((x) => card(x, i)).join('')}</ul></div>`).join('')}</div>
  <span class="kb__cap" aria-hidden="true">Illustration</span>
</div>`;
}

function offersLd(ps: TProduct[], cat: Catalog, site: string) {
  const items = ps.map((p) => ({ p, f: fromPrice(p, cat.currency) })).filter((x) => x.f);
  if (!items.length) return '';
  return ld({ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Project management workspaces', itemListElement: items.map((x, i) => ({
    '@type': 'ListItem', position: i + 1, item: { '@type': 'Product', name: x.p.name, description: x.p.tagline || undefined, url: `${site}/p/${x.p.slug}`,
      offers: { '@type': 'Offer', price: x.f!.price.toFixed(2), priceCurrency: cat.currency, url: orderUrl(x.p, cat.base, x.f!.cycle), availability: 'https://schema.org/InStock' } },
  })) });
}

/** "Globalhostia Pm Shared Workspace" → "Globalhostia PM Shared Workspace" */
const prettyName = (n: string) => n.replace(/\bPm\b/g, 'PM');

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const { currency, base } = cat;
  const site = String(cat.settings.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const products = available(productsFor(cat, ctx.route.categories)).map((p) => ({ ...p, name: prettyName(p.name) }));
  const unlimited = products.length > 0 && products.every((p) => p.features.some((f) => /unlimited users/i.test(f)));
  const crumbs = [{ label: 'Home', href: '/' }, { label: ctx.route.title }];

  /* hero */
  const hero = pageHero({
    crumbs, eyebrow: 'Globalhostia PM',
    title: 'Every project, sprint and client in one workspace.',
    lead: 'A hosted, open source project management workspace with boards, Gantt timelines, time tracking and a shared wiki. We run the servers and backups; your team gets on with the work.',
    ctas: [{ label: 'See plans', href: '#plans' }, { label: 'How it works', href: '#how', variant: 'ghost' }],
    trust: [unlimited ? 'Unlimited users on every plan' : 'Invite your whole team', 'Built on OpenProject', 'Export your data any time'],
    visualHtml: kanban(),
  });

  /* value prop: one workspace, zero extra cost */
  const people = Array.from({ length: 24 }, (_, i) => `<i style="--k:${i}"${i >= 5 ? ' class="is-off"' : ''}></i>`).join('');
  const value = `<section class="hp-section" aria-labelledby="val-h"><div class="hp-container pm-val">
    <div class="pm-val__copy" data-reveal>
      <h2 id="val-h" class="hp-hline hp-h2">One workspace. Every project. Zero extra cost.</h2>
      <p class="hp-lead">Most project tools charge for every person you add, so the bill grows each time you bring in a freelancer or give a client access. ${unlimited ? 'Our plans include unlimited users, so the price stays the same whether five or fifty people log in.' : 'Our workspaces are priced per workspace, not per person.'}</p>
      <ul class="pm-val__pts">
        <li>${icon('users')}<span><b>Invite everyone who touches the work.</b> Staff, freelancers and clients, each with the right role.</span></li>
        <li>${icon('layers')}<span><b>Replace the stack.</b> Boards, timelines, docs and time tracking live in one place instead of four subscriptions.</span></li>
      </ul>
    </div>
    <figure class="pm-cost" data-pm-cost data-reveal>
      <div class="pm-cost__head"><label for="pm-team">Team size</label><output class="num" id="pm-team-out" for="pm-team">5 people</output></div>
      <input type="range" id="pm-team" min="1" max="24" value="5" data-pm-range aria-describedby="pm-cost-cap">
      <div class="pm-people" aria-hidden="true">${people}</div>
      <svg class="pm-cost__chart" viewBox="0 0 400 190" aria-hidden="true" focusable="false">
        <path class="pm-axis" d="M30 10V160H392"/>
        <path class="pm-line pm-line--seat" d="M30 152 L392 18" pathLength="1"/>
        <path class="pm-line pm-line--flat" d="M30 112 L392 112" pathLength="1"/>
        <g class="pm-mark" data-pm-mark><line x1="0" y1="10" x2="0" y2="160"/><circle class="pm-mark__seat" cx="0" cy="0" r="6"/><circle class="pm-mark__flat" cx="0" cy="112" r="6"/></g>
        <text x="30" y="180" class="pm-ax">1 person</text><text x="392" y="180" text-anchor="end" class="pm-ax">24 people</text>
      </svg>
      <div class="pm-legend"><span><i class="is-seat"></i>Per-seat pricing</span><span><i class="is-flat"></i>Globalhostia PM workspace</span></div>
      <figcaption id="pm-cost-cap" class="pm-cost__cap">Illustration of how the two pricing models grow, not to scale and not based on any specific product's prices.</figcaption>
    </figure>
  </div></section>`;

  /* features by job */
  const groups: { label: string; icon: 'calendar' | 'users' | 'clock'; sub: string; items: FeatureItem[] }[] = [
    { label: 'Plan', icon: 'calendar', sub: 'Roadmaps, boards, sprints', items: [
      { icon: 'calendar', title: 'Gantt charts and roadmaps', text: 'Plan milestones, link dependencies and drag dates on a full project timeline.' },
      { icon: 'kanban', title: 'Kanban and agile boards', text: 'Run Scrum sprints, manage backlogs and see every task’s status at a glance.' },
      { icon: 'layers', title: 'Multi-project workspace', text: 'Run unlimited projects and sub-projects side by side, each with its own boards and timeline.' },
    ] },
    { label: 'Collaborate', icon: 'users', sub: 'Roles, wiki, clients', items: [
      { icon: 'key', title: 'Roles and permissions', text: 'Give clients read or comment access while your team keeps full edit control.' },
      { icon: 'book', title: 'Wiki and documents', text: 'Keep specs, meeting notes and decisions in a searchable wiki next to the work.' },
      { icon: 'mail', title: 'Notifications', text: 'Email alerts for due dates, mentions and status changes keep everyone on track.' },
    ] },
    { label: 'Track', icon: 'clock', sub: 'Time, budgets, reports', items: [
      { icon: 'clock', title: 'Time and cost tracking', text: 'Log hours against tasks, follow budgets and export cost reports per project.' },
      { icon: 'filter', title: 'Work package tracking', text: 'Tasks, bugs, features and milestones with custom statuses and priorities.' },
      { icon: 'download', title: 'Reports and exports', text: 'Filter by status, priority or due date and export to XLS, CSV or PDF.' },
    ] },
  ];
  const features = `<section class="hp-section hp-section--tint" aria-labelledby="feat-h"><div class="hp-container">
    ${sectionHead({ id: 'feat-h', title: 'Everything a busy team needs to deliver', lead: 'Open source project management, organised around the three jobs every project has.' })}
    ${bigTabs(groups.map((g) => ({ label: g.label, sub: g.sub, icon: g.icon, panelHtml: `<div class="pm-tabpanel">${featureGrid(g.items)}</div>` })), { label: 'Feature groups', id: 'pm-feat' })}
  </div></section>`;

  /* plans */
  const plans = `<section class="hp-section" id="plans" aria-labelledby="plans-h"><div class="hp-container">
    ${sectionHead({ id: 'plans-h', title: 'Choose your workspace', lead: 'Shared suits small teams getting started. Dedicated gives agencies an isolated instance on their own address, with client access and branding.' })}
    ${planCards(products, { currency, base, id: 'pm-plans', orderLabel: 'Start workspace',
      note: 'Prices, billing periods and any setup fee are confirmed live in the order form.',
      emptyTitle: 'Workspaces are being updated', emptyText: 'Tell us about your team and projects and we will set up the right workspace for you.' })}
    ${products.length >= 2 ? `<details class="pm-compare"><summary>${icon('grid')}Compare plans side by side</summary>${specTable(products, { currency, caption: 'Workspace plans compared' })}</details>` : ''}
    ${plansNote(currency)}
  </div></section>`;

  /* how it works */
  const steps = [
    ['Choose a plan', 'Shared or Dedicated, based on your team and how many client projects you run.'],
    ['We provision your workspace', 'Your workspace is set up at its own web address and ready for you to sign in.'],
    ['Invite your team', 'Add teammates and clients with the right roles: full access for staff, view and comment for clients.'],
    ['Start managing', 'Create projects, boards and Gantt timelines, and keep every task and deadline on track.'],
  ];
  const how = `<section class="hp-section hp-section--dark hp-on-dark" id="how" aria-labelledby="how-h"><div class="hp-container pm-how">
    <div class="pm-how__img" data-reveal>${picture({ src: '/hp/img/projects-team.jpg', alt: 'A team planning work together around laptops', sizes: '(max-width: 900px) calc(100vw - 32px), 600px' })}
      <div class="pm-how__badge">${icon('shield')}<span><b>Your data, your control</b>Open source core. Export your projects whenever you like.</span></div></div>
    <div>
      <h2 id="how-h" class="hp-hline hp-h2">Up and running in four steps</h2>
      <ol class="pm-steps">${steps.map(([t, d], i) => `<li data-reveal style="--i:${i}"><span class="pm-steps__n num" aria-hidden="true">${i + 1}</span><div><h3>${esc(t)}</h3><p>${esc(d)}</p></div></li>`).join('')}</ol>
    </div>
  </div></section>`;

  /* FAQ */
  const faqs = [
    { q: 'What is the difference between Shared and Dedicated?', a: 'Shared runs on shared server resources with private, permission-controlled access, and suits small teams. Dedicated gives you your own isolated instance and database at your own workspace address, with custom branding and client portal access, which suits agencies managing several clients.' },
    { q: 'Is my project data isolated from other customers?', a: 'On the Dedicated plan, each workspace has its own container and database, fully separate from other customers. On the Shared plan, projects run on shared infrastructure and are only visible to the people you invite.' },
    { q: 'Is it really open source?', a: 'Yes. Globalhostia PM is built on the OpenProject Community edition. You can export your project data at any time and there is no vendor lock-in.' },
    { q: 'Can I move from Jira, Trello or Asana?', a: 'Yes. Work packages can be imported from CSV or XLS, and our onboarding team can help map your existing boards, tasks and statuses to your new workspace.' },
    { q: 'Are my projects backed up?', a: 'Yes. The Dedicated plan includes daily automated backups. Ask our team about the backup schedule for the Shared plan.' },
    { q: 'Can I upgrade from Shared to Dedicated later?', a: 'Yes. Upgrade from your client area at any time. The price difference is prorated and we move your projects to the dedicated instance for you.' },
  ];
  const faqSec = `<section class="hp-section" aria-labelledby="faq-h"><div class="hp-container">
    ${sectionHead({ id: 'faq-h', title: 'Questions about Globalhostia PM' })}
    ${faq(faqs, { id: 'pm-faq', single: true })}
  </div></section>`;

  const cta = ctaBand({ id: 'cta', title: 'Bring every project under one roof', text: 'Pick a workspace, invite your team and plan your next sprint today.',
    primary: { label: 'Choose a workspace', href: '#plans' }, secondary: { label: 'Talk to our team', href: '/contact' } });

  return page({
    ctx, catalog: cat, path: `/${ctx.slug}`, title: ctx.route.title, description: ctx.route.description, css: ['projects'], js: ['projects'],
    jsonLd: [breadcrumbJsonLd(crumbs.map((c) => ({ ...c, href: c.href || `/${ctx.slug}` })), site), faqJsonLd(faqs), offersLd(products, cat, site)].filter(Boolean),
    body: [hero, value, features, plans, how, faqSec, cta].join('\n'),
  });
}
