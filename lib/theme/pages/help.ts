// /help/<slug>: one "Watch how" help topic — a short captioned how-to video (or an illustrated walkthrough for checkout
// and AI connector setup), the steps as text in English and Arabic, related links and a way to reach a person.
// Also exports the searchable "Watch how" grid shown on /help-center (lib/theme/pages/content.ts).
// Topic data: lib/help/topics.ts, admin edits: Admin → Help videos (settings.help_overrides, lib/help/view.ts).
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { getCatalog, whmcsLinks } from '../data';
import { page } from '../shell';
import { breadcrumbs, breadcrumbJsonLd, sectionHead, icon, link, ld, button } from '../ui';
import { waLink } from '../growth';
import { HELP_GROUPS, frameUrl, helpPath, type HelpGroup } from '../../help/topics';
import { helpTopics, clock, isoDuration, type HelpView } from '../../help/view';

const thumb = (t: HelpView) => t.kind === 'video' ? t.media.poster : frameUrl(t.frames?.[0]?.src || '');

/** One topic card for the grid. */
const card = (t: HelpView) => `<li class="hw-card" data-help-item data-g="${esc(t.group)}" data-k="${esc(`${t.title} ${t.summary} ${t.keywords} ${t.titleAr} ${HELP_GROUPS[t.group].en}`.toLowerCase())}">
  <a href="${esc(helpPath(t.slug))}">
    <span class="hw-card__media"><img src="${esc(thumb(t))}" alt="" width="1280" height="720" loading="lazy" decoding="async">
      <span class="hw-card__badge">${t.kind === 'video' ? `${icon('play')}${t.media.duration ? esc(clock(t.media.duration)) : 'Video'}` : `${icon('layers')}Step by step`}</span></span>
    <span class="hw-card__body"><small>${esc(HELP_GROUPS[t.group].en)}</small><b>${esc(t.title)}</b><span>${esc(t.summary)}</span></span>
  </a></li>`;

/** "Watch how" section: searchable grid of every visible topic, grouped by chips. */
export function watchHowSection(settings: Record<string, any> | null | undefined, o: { limit?: number; id?: string } = {}) {
  const topics = helpTopics(settings);
  if (!topics.length) return '';
  const groups = [...new Set(topics.map((t) => t.group))] as HelpGroup[];
  const id = o.id || 'hw';
  return `<section class="hp-section hw-sec" id="watch-how" aria-labelledby="${id}-h"><div class="hp-container">
    ${sectionHead({ id: `${id}-h`, title: 'Watch how', lead: 'Short videos and step-by-step walkthroughs for the tasks customers ask about most. Each one shows the real screens, with captions and the steps written out.' })}
    <div class="hw-tools" data-help-tools>
      <label class="sr-only" for="${id}-q">Search how-to videos</label>
      <div class="hw-q">${icon('search')}<input id="${id}-q" type="search" class="hp-input" placeholder="Search, like DNS, invoice or WordPress" autocomplete="off" data-help-q aria-controls="${id}-list"></div>
      <div class="hw-chips" role="group" aria-label="Filter by topic"><button type="button" class="is-on" aria-pressed="true" data-help-g="">All</button>${groups.map((g) => `<button type="button" aria-pressed="false" data-help-g="${esc(g)}">${esc(HELP_GROUPS[g].en)}</button>`).join('')}</div>
    </div>
    <ul class="hw-grid" id="${id}-list" data-help-list>${topics.slice(0, o.limit || topics.length).map(card).join('')}</ul>
    <p class="hw-empty" data-help-empty hidden role="status">No how-to matches your search. Try another word, or <a href="#cn-ch-h">ask our team</a>.</p>
    <p class="hw-count sr-only" data-help-count aria-live="polite"></p>
  </div></section>`;
}

function player(t: HelpView) {
  const m = t.media;
  return `<figure class="hw-player">
    <video controls preload="none" playsinline width="1280" height="720" poster="${esc(m.poster)}" aria-describedby="hw-steps-h">
      <source src="${esc(m.mp4)}" type="video/mp4">${m.hasWebm ? `<source src="${esc(m.webm)}" type="video/webm">` : ''}
      <track kind="captions" srclang="en" label="English" src="${esc(m.vttEn)}">
      <track kind="captions" srclang="ar" label="العربية" src="${esc(m.vttAr)}">
      <a href="${esc(m.mp4)}">Download the video</a>
    </video>
    <figcaption>${icon('info')}No sound: the steps are shown on screen and written out below. Captions are available in English and Arabic.</figcaption>
  </figure>`;
}

function walkthrough(t: HelpView) {
  const fr = t.frames || [];
  return `<div class="hw-walk" data-walk aria-roledescription="carousel" aria-label="${esc(t.title)}: step by step">
    <div class="hw-walk__stage">${fr.map((f, i) => `<figure class="hw-walk__f${i === 0 ? ' is-on' : ''}" data-i="${i}" aria-roledescription="slide" aria-label="Step ${i + 1} of ${fr.length}">
      <img src="${esc(frameUrl(f.src))}" alt="Step ${i + 1}: ${esc(t.steps[i]?.en || '')}" width="1280" height="720" loading="${i === 0 ? 'eager' : 'lazy'}" decoding="async">
      <figcaption><b>${i + 1}</b><span>${esc(t.steps[i]?.en || '')}</span></figcaption></figure>`).join('')}</div>
    <div class="hw-walk__bar" hidden data-walk-bar>
      <button type="button" class="hw-walk__btn" data-walk-prev aria-label="Previous step">${icon('left')}</button>
      <button type="button" class="hw-walk__btn hw-walk__play" data-walk-play aria-label="Play the steps">${icon('play')}</button>
      <div class="hw-walk__dots">${fr.map((_, i) => `<button type="button" data-walk-go="${i}" aria-label="Step ${i + 1}"${i === 0 ? ' aria-current="step"' : ''}></button>`).join('')}</div>
      <button type="button" class="hw-walk__btn" data-walk-next aria-label="Next step">${icon('right')}</button>
    </div>
  </div>`;
}

export default async function render(ctx: PageCtx): Promise<string | null> {
  const slug = ctx.slug.replace(/^help\//, '');
  const cat = await getCatalog();
  const s = cat.settings;
  const all = helpTopics(s);
  const t = all.find((x) => x.slug === slug);
  if (!t) return null;
  const L = whmcsLinks(cat.base);
  const site = String(s.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const url = site + helpPath(t.slug);
  const abs = (u: string) => (u.startsWith('http') ? u : site + u);
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Help Center', href: '/help-center' }, { label: t.title }];
  const wa = waLink(s, `Hi, I need help with: ${t.title}`);

  const steps = `<ol class="hw-steps">${t.steps.map((x, i) => `<li id="step-${i + 1}"><span class="hw-steps__n" aria-hidden="true">${i + 1}</span><p>${esc(x.en)}</p></li>`).join('')}</ol>`;
  const stepsAr = t.steps.some((x) => x.ar) ? `<details class="hw-ar" lang="ar" dir="rtl"><summary>${icon('globe')}<span>الخطوات بالعربية</span></summary>
    <h3>${esc(t.titleAr)}</h3><p>${esc(t.summaryAr)}</p><ol class="hw-steps">${t.steps.map((x, i) => `<li><span class="hw-steps__n" aria-hidden="true">${i + 1}</span><p>${esc(x.ar || x.en)}</p></li>`).join('')}</ol>
    ${t.note?.ar ? `<p class="hw-note">${esc(t.note.ar)}</p>` : ''}</details>` : '';
  const more = all.filter((x) => x.slug !== t.slug && x.group === t.group).concat(all.filter((x) => x.slug !== t.slug && x.group !== t.group)).slice(0, 3);

  const body = `<section class="hp-hero hp-hero--page is-solo hw-hero"><div class="hp-container"><div class="hp-hero__copy">
      ${breadcrumbs(crumbs)}
      <span class="hp-kicker"><i aria-hidden="true"></i>${t.kind === 'video' ? 'Watch how' : 'Step by step'}</span>
      <h1>${esc(t.title)}</h1><p class="hp-lead">${esc(t.summary)}</p>
      <ul class="hw-meta"><li>${icon('pin')}${esc(t.where)}</li>${t.kind === 'video' && t.media.duration ? `<li>${icon('clock')}${esc(clock(t.media.duration))} video</li>` : `<li>${icon('layers')}${t.steps.length} steps</li>`}<li>${icon('globe')}English · العربية</li></ul>
    </div></div></section>
    <section class="hp-section hw-main" aria-label="${esc(t.title)}"><div class="hp-container hw-layout">
      <div class="hw-media">${t.kind === 'video' ? player(t) : walkthrough(t)}</div>
      <aside class="hw-side">
        <h2 class="hw-h" id="hw-steps-h">Steps${t.kind === 'video' ? ' <small>(transcript)</small>' : ''}</h2>
        ${steps}
        ${t.note ? `<p class="hw-note">${icon('info')}<span>${esc(t.note.en)}</span></p>` : ''}
        <div class="hw-start">${button({ label: t.start.label, href: t.start.href, icon: 'arrow' })}</div>
        ${stepsAr}
      </aside>
    </div></section>
    ${t.related.length ? `<section class="hp-section hp-section--tight hw-rel" aria-labelledby="hw-rel-h"><div class="hp-container"><h2 class="hw-h" id="hw-rel-h">Related</h2><ul class="hw-links">${t.related.map(([l, h]) => `<li>${link(l, h)}</li>`).join('')}</ul></div></section>` : ''}
    <section class="hp-section hp-section--tight hw-stuck" aria-labelledby="hw-stuck-h"><div class="hp-container"><div class="hw-stuck__box">
      <div><h2 id="hw-stuck-h">Still stuck?</h2><p>Our engineers answer around the clock. Tell us what you see and which domain or service it is about.</p></div>
      <div class="hw-stuck__a">${button({ label: 'Open a ticket', href: L.ticket, icon: 'ticket' })}${wa ? `<a class="hp-btn hp-btn--ghost hw-wa" href="${esc(wa)}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp us</a>` : ''}</div>
    </div></div></section>
    ${more.length ? `<section class="hp-section hp-section--tint hw-more" aria-labelledby="hw-more-h"><div class="hp-container"><h2 class="hw-h" id="hw-more-h">More how-tos</h2><ul class="hw-grid hw-grid--3">${more.map(card).join('')}</ul><p class="hw-all">${link('All how-to videos', '/help-center#watch-how')}</p></div></section>` : ''}`;

  const lds = [breadcrumbJsonLd(crumbs, site)];
  const video = t.kind === 'video' ? {
    '@type': 'VideoObject', name: t.title, description: t.summary, thumbnailUrl: [abs(t.media.poster)], uploadDate: t.media.uploadDate,
    ...(t.media.duration ? { duration: isoDuration(t.media.duration) } : {}), contentUrl: abs(t.media.mp4), embedUrl: url, inLanguage: 'en',
    publisher: { '@type': 'Organization', name: 'GlobalHostia', url: site },
  } : null;
  lds.push(ld({ '@context': 'https://schema.org', '@type': 'HowTo', name: t.title, description: t.summary, url, inLanguage: 'en',
    ...(t.kind === 'video' && t.media.duration ? { totalTime: isoDuration(t.media.duration) } : {}),
    image: abs(thumb(t)), ...(video ? { video } : {}),
    step: t.steps.map((x, i) => ({ '@type': 'HowToStep', position: i + 1, name: x.en, text: x.en, url: `${url}#step-${i + 1}`, ...(t.frames?.[i] ? { image: abs(frameUrl(t.frames[i].src)) } : {}) })) }));
  if (video) lds.push(ld({ '@context': 'https://schema.org', ...video }));

  return page({
    ctx: { ...ctx, route: { ...ctx.route, title: t.title, description: t.summary, seoTitle: `How to ${t.title.charAt(0).toLowerCase()}${t.title.slice(1)}`, meta: `${t.summary} ${t.kind === 'video' ? 'Short captioned video' : 'Illustrated steps'} with the steps written out in English and Arabic.`.slice(0, 160) } },
    catalog: cat, path: helpPath(t.slug), title: t.title, description: t.summary,
    css: ['help'], js: ['help'], jsonLd: lds, body,
  });
}
