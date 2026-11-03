// /hosting-for (hub) and /hosting-for/<usecase>: real plans that fit a use case, each with reasons taken from its
// own specs, a setup outline, FAQ and links to the plan finder and free migration. A use case the catalog cannot
// serve (no fitting plan) has no page (lib/theme/pseo.ts → useCasePages).
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { fitDescription } from '../../seo';
import { getCatalog, orderUrl, fromPrice, minFrom, cycles, type Catalog, type TProduct } from '../data';
import { page } from '../shell';
import { pageHero, sectionHead, featureGrid, faq, faqJsonLd, ctaBand, breadcrumbJsonLd, icon, hexIcon, link, fromText, VAT_NOTE, type IconName } from '../ui';
import { trustStrip } from '../growth';
import { productsLd } from './vps';
import { TYPE_LABEL } from './planfinder';
import { TYPE } from './planfinder';
import { useCasePages, siteOf, type UseCase, type Pick } from '../pseo';

export default async function render(ctx: PageCtx): Promise<string | null> {
  const slug = ctx.slug.split('/')[1] || '';
  const cat = await getCatalog();
  const all = useCasePages(cat);
  if (!slug) return all.length ? renderHub(ctx, cat, all) : null;
  const hit = all.find((x) => x.u.slug === slug);
  return hit ? renderUseCase(ctx, cat, hit.u, hit.picks, all) : null;
}

const kindOf = (p: TProduct) => TYPE_LABEL[TYPE[p.categorySlug] || ''] || (p.categorySlug === 'ssl-certificates' ? 'SSL certificate' : p.categorySlug === 'business-email' ? 'Business email' : 'Plan');

function pickCard(x: Pick, i: number, cat: Catalog) {
  const { p, why } = x;
  const f = fromPrice(p, cat.currency);
  const priced = !!cycles(p, cat.currency).length;
  const href = orderUrl(p, cat.base, f?.cycle);
  return `<li class="ps-pick${i === 0 ? ' is-first' : ''}" data-reveal style="--i:${i}">
    <div class="ps-pick__top"><span class="ps-pick__kind">${esc(kindOf(p))}</span><h3><a href="/p/${esc(p.slug)}">${esc(p.name)}</a></h3>
      <p class="ps-pick__price num">${priced ? `From <b>${esc(fromText(p, cat.currency))}</b>` : 'See price in the order form'}</p></div>
    <h4 class="sr-only">Why it fits</h4>
    <ul class="ps-pick__why">${why.map((w) => `<li>${icon('check')}<span>${esc(w)}</span></li>`).join('')}</ul>
    <div class="ps-pick__foot"><a class="hp-btn hp-btn--${i === 0 ? 'brand' : 'ghost'}" href="${esc(href)}" aria-label="${esc(`${priced ? 'Order' : 'See price'}: ${p.name}`)}">${priced ? 'Order now' : 'See price'}</a><a class="hp-link" href="/p/${esc(p.slug)}">Plan details</a></div>
  </li>`;
}

async function renderUseCase(ctx: PageCtx, cat: Catalog, u: UseCase, picks: Pick[], all: { u: UseCase; picks: Pick[] }[]) {
  const site = siteOf(cat);
  const path = `/hosting-for/${u.slug}`;
  const ps = picks.map((x) => x.p);
  const cheapest = ps.slice().sort((a, b) => (fromPrice(a, cat.currency)?.amount ?? 1e9) - (fromPrice(b, cat.currency)?.amount ?? 1e9))[0];
  const cheapTxt = cheapest ? fromText(cheapest, cat.currency) : '';
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Hosting for', href: '/hosting-for' }, { label: u.name }];
  const kinds = [...new Set(ps.map(kindOf))];

  const needsCard = `<div class="ps-glance"><h2 class="ps-glance__h">${icon('check')}What ${esc(u.name)} needs</h2><ul>${u.needs.map((n) => `<li><span><b>${esc(n.h)}</b></span></li>`).join('')}</ul><p>${picks.length} plan${picks.length > 1 ? 's' : ''} from our catalog fit${picks.length > 1 ? '' : 's'}${cheapTxt ? `, from ${esc(cheapTxt)}` : ''}</p></div>`;
  const hero = pageHero({
    crumbs, eyebrow: `Hosting for ${u.name}`, title: u.h1, lead: u.lead,
    ctas: [{ label: 'See the plans that fit', href: '#picks', icon: 'arrow' }, { label: 'Plan finder', href: '/plan-finder', variant: 'ghost' }],
    visualHtml: needsCard, network: false,
  });
  const intro = `<section class="hp-section" aria-labelledby="ps-need-h"><div class="hp-container">
    ${sectionHead({ id: 'ps-need-h', title: `What ${u.name} needs from a host`, lead: u.intro })}
    ${featureGrid(u.needs.map((n, i) => ({ icon: (['check', 'gauge', 'shield'] as IconName[])[i % 3], title: n.h, text: n.p })))}
  </div></section>`;
  const pickSec = `<section class="hp-section hp-section--tint" id="picks" aria-labelledby="ps-picks-h"><div class="hp-container">
    ${sectionHead({ id: 'ps-picks-h', title: `Plans that fit ${u.name}`, lead: `Chosen from our live catalog by their specifications: ${kinds.join(', ').toLowerCase().replace('vps', 'VPS').replace('rdp', 'RDP')}. Prices in ${cat.currency}, ${VAT_NOTE.toLowerCase()}.` })}
    <ul class="ps-picks ps-picks--n${Math.min(picks.length, 4)}">${picks.map((x, i) => pickCard(x, i, cat)).join('')}</ul>
    <p class="ps-links">${link('Not sure? Use the plan finder', '/plan-finder')}${u.links.map((l) => link(l.label, l.href)).join('')}</p>
  </div></section>`;
  const steps = `<section class="hp-section" aria-labelledby="ps-steps-h"><div class="hp-container ps-two">
    <div data-reveal><h2 id="ps-steps-h" class="hp-hline hp-h2">Set up ${esc(u.name)} in ${u.steps.length} steps</h2>
      <p class="hp-lead">An outline of what happens after you order. Our engineers can do any step for you; just open a ticket.</p>
      <p class="ps-links">${link('Free website migration', '/free-migration')}</p></div>
    <ol class="ps-steps" data-reveal>${u.steps.map((s, i) => `<li><span class="ps-steps__n num" aria-hidden="true">${i + 1}</span><p>${esc(s)}</p></li>`).join('')}</ol>
  </div></section>`;
  const others = all.filter((x) => x.u.slug !== u.slug);
  const otherSec = others.length ? `<section class="hp-section hp-section--tint" aria-labelledby="ps-uc-h"><div class="hp-container">
    ${sectionHead({ id: 'ps-uc-h', title: 'Hosting for other projects' })}
    <ul class="ps-locs">${others.map((x, i) => `<li data-reveal style="--i:${i % 4}"><a href="/hosting-for/${esc(x.u.slug)}">${hexIcon(x.u.icon)}<span><b>${esc(x.u.name)}</b><small>${x.picks.length} plan${x.picks.length > 1 ? 's' : ''} that fit</small></span>${icon('arrow')}</a></li>`).join('')}</ul>
  </div></section>` : '';
  const faqs = [
    ...(cheapest ? [{ q: `What is the cheapest way to host ${u.name}?`, a: `Of the plans that fit, ${cheapest.name} is the lowest priced${cheapTxt ? ` at ${cheapTxt}` : ''}, live from our billing system. Start there and upgrade when you need more resources; we help you move.` }] : []),
    ...u.faqs,
  ];
  const faqSec = `<section class="hp-section" aria-labelledby="ps-faq-h"><div class="hp-container ps-faq">
    ${sectionHead({ id: 'ps-faq-h', title: `${u.name} hosting questions`, align: 'left' })}${faq(faqs, { id: 'ps-faq', single: true })}
  </div></section>`;
  const cta = ctaBand({ title: 'Already running somewhere else?', text: 'Our engineers move your site, databases and email to us for free, and you test everything before switching.',
    primary: { label: 'Request a free migration', href: '/free-migration' }, secondary: { label: 'Open the plan finder', href: '/plan-finder' } });

  const desc = fitDescription(u.meta, [cheapTxt ? `From ${cheapTxt}.` : '', 'Prices are live.'].filter(Boolean));
  return page({
    ctx: { ...ctx, route: { ...ctx.route, title: u.h1, description: desc, seoTitle: u.seoTitle, meta: desc } }, catalog: cat, path, title: u.h1, description: desc,
    css: ['pseo'], ogKicker: 'Hosting for',
    jsonLd: [breadcrumbJsonLd(crumbs, site), faqJsonLd(faqs), productsLd(ps, cat, `Plans for ${u.name}`)].filter(Boolean),
    body: [hero, trustStrip(cat.settings), intro, pickSec, steps, otherSec, faqSec, cta].join('\n'),
  });
}

async function renderHub(ctx: PageCtx, cat: Catalog, all: { u: UseCase; picks: Pick[] }[]) {
  const site = siteOf(cat);
  const path = '/hosting-for';
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Hosting for' }];
  const hero = pageHero({
    crumbs, eyebrow: 'Hosting by use case', title: 'What are you building?',
    lead: `Pick your project and we show the plans from our live catalog that fit it, with the reasons, a setup outline and answers to common questions. ${all.length} guides so far.`,
    ctas: [{ label: 'Plan finder', href: '/plan-finder', icon: 'filter' }, { label: 'Free migration', href: '/free-migration', variant: 'ghost' }],
    network: false,
  });
  const grid = `<section class="hp-section" aria-labelledby="ps-hub-h"><div class="hp-container">
    ${sectionHead({ id: 'ps-hub-h', title: 'Choose your project' })}
    <ul class="ps-hub">${all.map(({ u, picks }, i) => {
      const f = minFrom(picks.map((x) => x.p), cat.currency);
      const cheapest = f ? picks.find((x) => fromPrice(x.p, cat.currency)?.amount === f.amount)?.p : undefined;
      return `<li data-reveal style="--i:${i % 3}"><a href="/hosting-for/${esc(u.slug)}">${hexIcon(u.icon)}<h3>${esc(u.name)}</h3><p>${esc(u.lead.split('. ')[0].replace(/\.$/, ''))}.</p>
        <span class="ps-hub__meta num">${picks.length} plan${picks.length > 1 ? 's' : ''} that fit${cheapest ? `, from <b>${esc(fromText(cheapest, cat.currency))}</b>` : ''}</span><span class="hp-link" aria-hidden="true">Read the guide${icon('arrow')}</span></a></li>`;
    }).join('')}</ul>
  </div></section>`;
  const faqs = [
    { q: 'How are the plans chosen?', a: 'Each guide filters our live catalog by what the project needs, such as memory, operating system, number of websites or location, and explains why every plan fits. Prices are the same as in the order form.' },
    { q: 'My project is not listed. What now?', a: 'Use the plan finder for a recommendation in four questions, or tell our engineers what you run and they will suggest a plan.' },
  ];
  const faqSec = `<section class="hp-section hp-section--tint" aria-labelledby="ps-faq-h"><div class="hp-container ps-faq">
    ${sectionHead({ id: 'ps-faq-h', title: 'About these guides', align: 'left' })}${faq(faqs, { id: 'ps-faq', single: true })}
  </div></section>`;
  const cta = ctaBand({ title: 'Still deciding?', text: 'Answer four quick questions and get a plan from our live catalog with two alternatives.', primary: { label: 'Open the plan finder', href: '/plan-finder' }, secondary: { label: 'Talk to us', href: '/contact' } });
  const title = 'Hosting by Use Case: Find the Right Plan';
  const desc = fitDescription(`Hosting guides for ${all.map((x) => x.u.name).slice(0, 4).join(', ')} and more: the real plans from our catalog that fit each project, with reasons.`, [
    'Setup steps and FAQs included.', 'With setup steps.']);
  const ld = { '@context': 'https://schema.org', '@type': 'ItemList', name: 'Hosting guides by use case', url: site + path, numberOfItems: all.length,
    itemListElement: all.map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x.u.h1, url: `${site}/hosting-for/${x.u.slug}` })) };
  return page({
    ctx: { ...ctx, route: { ...ctx.route, title, description: desc } }, catalog: cat, path, title, description: desc,
    css: ['pseo'], ogKicker: 'Hosting for',
    jsonLd: [breadcrumbJsonLd(crumbs, site), faqJsonLd(faqs), `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`],
    body: [hero, grid, faqSec, cta].join('\n'),
  });
}
