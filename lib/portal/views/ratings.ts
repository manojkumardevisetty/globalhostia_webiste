// "How did we do?" — the public rating page (/account/rate, opened from the score buttons in the email; no login) and the
// rating card on a closed ticket in the portal. Review invitations: shown the same way to everyone who answers, whatever
// the score, only when the owner set the page addresses, with no reward offered (Google and Trustpilot rules).
import { card, esc, icon, okMark, errMark, t } from './kit';
import { split } from './guest';

const LABELS = () => [t('Very poor'), t('Poor'), t('Okay'), t('Good'), t('Excellent')];
const CSS = `<style>.cx-stars{border:0;margin:0 0 16px;padding:0}.cx-stars legend{font-weight:600;margin:0 0 10px}.cx-stars__row{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;direction:ltr}.cx-star{position:relative}.cx-star input{position:absolute;opacity:0;width:1px;height:1px}.cx-star label{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 4px;border:1px solid #9a9a9a;border-radius:12px;background:#fff;color:#111;cursor:pointer;text-align:center;min-height:64px;justify-content:center}.cx-star b{font-size:20px;line-height:1.1}.cx-star small{font-size:12px;color:#555;line-height:1.2}.cx-star input:checked+label{background:#111;color:#fff;border-color:#111}.cx-star input:checked+label small{color:#e8e8e8}.cx-star input:focus-visible+label{outline:3px solid #2563eb;outline-offset:2px}.cx-shown{font-size:22px;letter-spacing:2px;color:#111}.cx-review{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 0}.cx-rv{margin:18px 0 0;padding:16px;border:1px solid #e5e5e5;border-radius:12px}.cx-rv h2{font-size:16px;margin:0 0 6px}.cx-rv p{margin:0 0 6px}@media (max-width:420px){.cx-stars__row{grid-template-columns:repeat(5,minmax(0,1fr));gap:5px}.cx-star small{font-size:11px}}</style>`;

export function starsField(o: { name?: string; selected?: number | null; legend: string; idp: string }) {
  const L = LABELS();
  return `<fieldset class="cx-stars"><legend>${esc(o.legend)}</legend><div class="cx-stars__row">${[1, 2, 3, 4, 5].map((s) =>
    `<div class="cx-star"><input type="radio" id="${o.idp}-${s}" name="${o.name || 's'}" value="${s}" required${o.selected === s ? ' checked' : ''}><label for="${o.idp}-${s}"><b aria-hidden="true">${s}&#9733;</b><small>${esc(L[s - 1])}</small><span class="sr-only">${esc(t('{n} out of 5', { n: s }))}</span></label></div>`).join('')}</div></fieldset>`;
}
const shown = (score: number) => `<span class="cx-shown" aria-hidden="true">${'&#9733;'.repeat(score)}${'&#9734;'.repeat(5 - score)}</span> <span>${esc(t('{n} out of 5', { n: score }))}</span>`;

export type ReviewLinks = { google: string; trustpilot: string };
/** The same invitation for every answer (never depends on the score), only with the owner's real review pages. */
export function reviewInvite(r: ReviewLinks) {
  const links = [r.google ? `<a class="hp-btn hp-btn--ghost ac-sm" href="${esc(r.google)}" target="_blank" rel="noopener">${esc(t('Review us on Google'))}</a>` : '',
    r.trustpilot ? `<a class="hp-btn hp-btn--ghost ac-sm" href="${esc(r.trustpilot)}" target="_blank" rel="noopener">${esc(t('Review us on Trustpilot'))}</a>` : ''].filter(Boolean);
  if (!links.length) return '';
  return `<section class="cx-rv" aria-labelledby="cx-rv-h"><h2 id="cx-rv-h">${esc(t('Want to share your experience publicly?'))}</h2><p>${esc(t('If you like, you can also leave a public review, good or bad. It helps other customers decide.'))}</p><div class="cx-review">${links.join('')}</div></section>`;
}

export type RateState =
  | { state: 'confirm'; token: string; score: number | null; tid: string; subject: string }
  | { state: 'thanks'; token: string; score: number; tid: string; subject: string; comment: string; reviews: ReviewLinks; ticketUrl: string }
  | { state: 'commented'; score: number; tid: string; reviews: ReviewLinks; ticketUrl: string }
  | { state: 'demo'; score: number | null }
  | { state: 'invalid' | 'error' | 'not-closed' | 'disabled' };

export function rateView(s: RateState) {
  let body = '';
  if (s.state === 'confirm') {
    body = `<h1 class="au-h1" id="au-h1">${esc(t('How did we do?'))}</h1>
      <p class="au-sub">${esc(t('Ticket #{n}', { n: s.tid }))}: ${esc(s.subject)}</p>
      <form class="au-form" method="post" action="/account/rate" id="cx-rate" data-ac-busy>
        <input type="hidden" name="t" value="${esc(s.token)}"><input type="hidden" name="op" value="rate">
        ${starsField({ selected: s.score, legend: t('Your rating'), idp: 'cx-s' })}
        <button class="hp-btn hp-btn--brand hp-btn--block hp-btn--lg" type="submit">${icon('check')}${esc(t('Send rating'))}</button>
      </form>
      ${s.score ? `<script>(function(){var f=document.getElementById('cx-rate');if(f&&!sessionStorage.getItem('cx-rated-'+${JSON.stringify(s.tid).replace(/</g, '\\u003c')})){try{sessionStorage.setItem('cx-rated-'+${JSON.stringify(s.tid).replace(/</g, '\\u003c')},'1')}catch(e){}f.requestSubmit?f.requestSubmit():f.submit()}})()</script>` : ''}`;
  } else if (s.state === 'thanks') {
    body = `<h1 class="au-h1" id="au-h1">${esc(t('Thank you for your rating'))}</h1>
      <div class="ac-gap"><div class="ac-alert ac-alert--ok ac-alert--fx" role="status">${okMark()}<span>${shown(s.score)}</span></div></div>
      <p class="au-sub">${esc(t('Ticket #{n}', { n: s.tid }))}: ${esc(s.subject)}</p>
      <form class="au-form" method="post" action="/account/rate" data-ac-busy>
        <input type="hidden" name="t" value="${esc(s.token)}"><input type="hidden" name="op" value="comment">
        <div class="ac-field"><label for="cx-c" class="au-label">${esc(t('Anything you would like to add? (optional)'))}</label>
          <textarea class="ac-input ac-textarea" id="cx-c" name="comment" rows="4" maxlength="2000">${esc(s.comment)}</textarea></div>
        <button class="hp-btn hp-btn--dark hp-btn--block" type="submit">${esc(s.comment ? t('Update comment') : t('Send comment'))}</button>
      </form>
      <details class="ac-gap"><summary>${esc(t('Change my rating'))}</summary>
        <form class="au-form" method="post" action="/account/rate" data-ac-busy><input type="hidden" name="t" value="${esc(s.token)}"><input type="hidden" name="op" value="rate">
          ${starsField({ selected: s.score, legend: t('Your rating'), idp: 'cx-s2' })}<button class="hp-btn hp-btn--ghost hp-btn--block" type="submit">${esc(t('Save rating'))}</button></form></details>
      ${reviewInvite(s.reviews)}
      <div class="au-links"><a href="${esc(s.ticketUrl)}">${esc(t('Open the ticket in my account'))}</a></div>`;
  } else if (s.state === 'commented') {
    body = `<h1 class="au-h1" id="au-h1">${esc(t('Thanks, we got your comment'))}</h1>
      <div class="ac-gap"><div class="ac-alert ac-alert--ok ac-alert--fx" role="status">${okMark()}<span>${esc(t('Your comment is with our support team. If you asked a question, reply to the ticket so we can answer it.'))}</span></div></div>
      <p class="au-sub">${shown(s.score)}</p>
      ${reviewInvite(s.reviews)}
      <div class="au-links"><a href="${esc(s.ticketUrl)}">${esc(t('Open the ticket in my account'))}</a></div>`;
  } else if (s.state === 'demo') {
    body = `<h1 class="au-h1" id="au-h1">${esc(t('How did we do?'))}</h1>
      <div class="ac-gap"><div class="ac-alert ac-alert--info" role="status">${icon('info')}<span>${esc(t('This is a test link from a preview email. Nothing was saved.'))}</span></div></div>
      ${s.score ? `<p class="au-sub">${shown(s.score)}</p>` : ''}`;
  } else {
    const msg = s.state === 'not-closed' ? t('This ticket is open again, so there is nothing to rate yet. We will ask once it is closed.')
      : s.state === 'disabled' ? t('Ratings are not available right now.')
      : s.state === 'error' ? t('Something went wrong. Please try again in a moment.') : t('This rating link is incomplete, was changed or has expired.');
    body = `<h1 class="au-h1" id="au-h1">${esc(t('This link does not work'))}</h1>
      <div class="ac-gap"><div class="ac-alert ac-alert--err" role="alert">${errMark()}<span>${esc(msg)}</span></div></div>
      <a class="hp-btn hp-btn--dark hp-btn--block hp-btn--lg" href="/account/support">${esc(t('Go to my tickets'))}</a>`;
  }
  return CSS + split({
    path: '/account/rate', crumb: t('Rate our support'), statement: t('Your opinion makes our support better.'), lead: t('One tap is enough. Every answer is read by our support team.'),
    items: [['star', t('Quick'), t('No sign-in needed.')], ['chat', t('Optional comment'), t('Tell us what went well or what we can do better.')], ['shield', t('Private'), t('Your rating is only seen by our team.')]],
    card: body,
  });
}

/** Rating card on a closed ticket in the portal. */
export function ticketRatingCard(o: { token: string; score: number | null; comment: string; back: string }) {
  const inner = o.score
    ? `<p>${shown(o.score)}</p>${o.comment ? `<blockquote class="ac-muted">${esc(o.comment)}</blockquote>` : ''}<p class="ac-help">${esc(t('Thank you. Your rating helps our team.'))}</p>
      <details><summary>${esc(t('Change my rating'))}</summary>${form(o, o.score)}</details>`
    : `<p class="ac-help">${esc(t('Tell us how this ticket went. One tap is enough; a comment is optional.'))}</p>${form(o, null)}`;
  return CSS + card(t('How did we do?'), inner, { id: 'cx-rate-h' });
}
function form(o: { token: string; comment: string; back: string }, score: number | null) {
  return `<form method="post" action="/account/rate" class="ac-form" data-ac-busy>
    <input type="hidden" name="t" value="${esc(o.token)}"><input type="hidden" name="op" value="rate"><input type="hidden" name="from" value="portal"><input type="hidden" name="back" value="${esc(o.back)}">
    ${starsField({ selected: score, legend: t('Your rating'), idp: score ? 'cx-p2' : 'cx-p' })}
    <div class="ac-field"><label for="cx-pc${score ? '2' : ''}">${esc(t('Comment (optional)'))}</label><textarea class="ac-input ac-textarea" id="cx-pc${score ? '2' : ''}" name="comment" rows="3" maxlength="2000">${esc(o.comment)}</textarea></div>
    <div class="ac-form__foot"><button class="hp-btn hp-btn--brand ac-sm" type="submit">${icon('star')}${esc(t('Send rating'))}</button></div>
  </form>`;
}
