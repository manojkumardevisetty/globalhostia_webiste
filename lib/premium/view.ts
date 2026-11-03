// Premium domains: HTML pieces shared by /premium-domains, the detail pages and the homepage marquee.
// Pure string builders (no data access). Styles: public/hp/pages/premium.css (pages) and pdm.css (homepage row).
import { esc } from '../render/util';
import { icon } from '../theme/ui';
import { PREMIUM_PATH, fmtMoney, type PItem } from './core';

export const itemHref = (i: Pick<PItem, 'domain'>) => `${PREMIUM_PATH}/${encodeURIComponent(i.domain)}`;

/** "$4,500" · "Make an offer" · "Offers from $500" */
export function priceText(i: PItem) {
  if (i.price !== null) return fmtMoney(i.price, i.currency);
  return i.minOffer ? `Offers from ${fmtMoney(i.minOffer, i.currency)}` : 'Make an offer';
}
export const sourceLabel = (i: PItem) => (i.source === 'dynadot' ? 'Marketplace listing' : i.owned ? 'Owned by GlobalHostia' : 'Listed by our broker');

/** The domain split into name + extension, so long names wrap at the dot and the extension stays visible. */
export const domainHtml = (i: Pick<PItem, 'sld' | 'tld'>, tag = 'span') =>
  `<${tag} class="pd-dom" dir="ltr"><b>${esc(i.sld)}</b><i>${esc(i.tld)}</i></${tag}>`;

/** One listing card (grid, feature spread and the homepage row). The domain link covers the card. */
export function card(i: PItem, o: { feature?: boolean; clone?: boolean; heading?: 'h2' | 'h3' } = {}) {
  const h = o.heading || 'h3';
  const badge = i.featured ? '<span class="pd-tag pd-tag--gold">Featured</span>' : i.status === 'under_offer' ? '<span class="pd-tag">Under offer</span>' : '';
  const sub = i.price === null ? '<small>Name your price</small>' : i.base !== undefined ? '<small>Including broker fee</small>' : '<small>One-time price</small>';
  const attrs = `data-pd data-d="${esc(i.domain)}" data-tld="${esc(i.tld)}" data-len="${i.len}" data-p="${i.price ?? ''}" data-mo="${i.minOffer ?? ''}" data-c="${esc(i.cats.join(' '))}" data-f="${i.featured ? 1 : 0}" data-o="${i.source === 'own' ? 1 : 0}"`;
  return `<article class="pd-card${o.feature ? ' pd-card--feature' : ''}${i.status === 'under_offer' ? ' is-offer' : ''}" ${o.clone ? 'aria-hidden="true"' : attrs}>
    <div class="pd-card__top">${badge}<span class="pd-card__len">${i.len} ${i.len === 1 ? 'character' : 'characters'}</span></div>
    <${h} class="pd-card__h"><a href="${esc(itemHref(i))}"${o.clone ? ' tabindex="-1"' : ''}>${domainHtml(i)}</a></${h}>
    ${o.feature && i.description ? `<p class="pd-card__desc">${esc(i.description.slice(0, 180))}${i.description.length > 180 ? '…' : ''}</p>` : ''}
    <div class="pd-card__foot"><span class="pd-card__price"><b class="num">${esc(priceText(i))}</b>${sub}</span><span class="pd-card__go" aria-hidden="true">${icon('arrow')}</span></div>
  </article>`;
}

/**
 * Homepage "Premium domains for sale" row: an auto-scrolling marquee (two copies of the list, the second hidden from
 * assistive tech and the tab order), with a Pause button (WCAG 2.2.2), paused on hover, focus and touch.
 * Reduced motion: a static, swipeable row with scroll snapping. Empty list → ''.
 */
export function marquee(items: PItem[], o: { title: string; brokerFee?: number }) {
  if (!items.length) return '';
  const cells = (clone: boolean) => items.map((i) => `<li class="pdm__cell">${card(i, { clone })}</li>`).join('');
  const dur = Math.max(30, items.length * 6);
  return `<section class="pdm" aria-labelledby="pdm-h" data-pdm>
  <div class="hp-container pdm__head">
    <div><h2 id="pdm-h" class="pdm__h">${icon('star')}${esc(o.title)}</h2><p class="pdm__lead">Short, brandable names with the price shown upfront. Want one that's taken? Our broker can negotiate it.</p></div>
    <div class="pdm__acts"><button type="button" class="pdm__toggle" data-pdm-toggle aria-pressed="false">${icon('pause')}<span>Pause</span></button><a class="hp-link" href="${PREMIUM_PATH}">See all premium domains${icon('arrow')}</a></div>
  </div>
  <div class="pdm__viewport" style="--pdm-dur:${dur}s">
    <ul class="pdm__track" role="list">${cells(false)}</ul><ul class="pdm__track pdm__track--clone" aria-hidden="true" role="presentation">${cells(true)}</ul>
  </div>
</section>`;
}
