// Reusable lead-capture form (email + optional WhatsApp number). Posts to /api/lead; /hp/track.js submits it with
// fetch (inline errors, generate_lead event), and without JavaScript it is a normal form post that redirects back.
// Styles: /hp/lead.css (loaded by the shell and the landing pages).
import { esc } from '../render/util';
import { icon } from './ui';

let n = 0;
export type LeadFormOpts = {
  source: string; page: string;
  title?: string; text?: string; cta?: string; consent?: string;
  /** dark background (footer contact card, dark bands) */
  tone?: 'light' | 'dark';
  /** extra context stored with the lead (e.g. the landing page's product) */
  interest?: string;
  /** collect the visitor's name too */
  withName?: boolean;
  /** heading level for the title (default 2) */
  level?: 2 | 3;
  /** "done" state (after a no-JavaScript submit: ?lead=ok) */
  done?: boolean;
  /** CSS hook */
  cls?: string;
  /** read the interest from the page at submit time (plan finder) */
  interestFrom?: 'plan-finder';
};

export function leadForm(o: LeadFormOpts): string {
  const id = `ghl${++n}`;
  const h = o.level === 3 ? 'h3' : 'h2';
  const consent = o.consent || 'Send me hosting deals and guides by email or WhatsApp. I can unsubscribe at any time.';
  const thanks = `<p class="gh-lead__done" role="status">${icon('check')}<span><b>Thank you, you are on the list.</b> We only write when we have something useful.</span></p>`;
  return `<div class="gh-lead gh-lead--${o.tone || 'light'}${o.cls ? ' ' + esc(o.cls) : ''}" id="${o.done ? 'gh-lead' : id + '-wrap'}">
  ${o.title ? `<${h} class="gh-lead__t" id="${id}-t">${esc(o.title)}</${h}>` : ''}${o.text ? `<p class="gh-lead__p">${esc(o.text)}</p>` : ''}
  ${o.done ? thanks : `<form class="gh-lead__f" action="/api/lead" method="post" data-gh-lead novalidate${o.title ? ` aria-labelledby="${id}-t"` : ' aria-label="Sign up for hosting deals and guides"'}${o.interestFrom ? ` data-interest-from="${esc(o.interestFrom)}"` : ''}>
    <input type="hidden" name="source" value="${esc(o.source)}"><input type="hidden" name="page" value="${esc(o.page)}"><input type="hidden" name="t" value="">
    ${o.interest ? `<input type="hidden" name="interest" value="${esc(o.interest)}">` : ''}
    <div class="gh-lead__hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
    <div class="gh-lead__row">
      ${o.withName ? `<div class="gh-lead__fld"><label for="${id}-n">Name <span class="gh-lead__opt">(optional)</span></label><input id="${id}-n" name="name" type="text" autocomplete="name" maxlength="80"></div>` : ''}
      <div class="gh-lead__fld"><label for="${id}-e">Email</label><input id="${id}-e" name="email" type="email" autocomplete="email" inputmode="email" required maxlength="160" placeholder="you@company.com" aria-describedby="${id}-e-err"><span class="gh-lead__err" id="${id}-e-err" data-err="email"></span></div>
      <div class="gh-lead__fld"><label for="${id}-w">WhatsApp number <span class="gh-lead__opt">(optional)</span></label><input id="${id}-w" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="30" placeholder="+971 50 000 0000" aria-describedby="${id}-w-err"><span class="gh-lead__err" id="${id}-w-err" data-err="phone"></span></div>
    </div>
    <div class="gh-lead__chk"><input id="${id}-c" name="consent" type="checkbox" value="on" required aria-describedby="${id}-c-err"><label for="${id}-c">${esc(consent)} <a href="/privacy-policy">Privacy policy</a></label></div>
    <span class="gh-lead__err" id="${id}-c-err" data-err="consent"></span>
    <button type="submit" class="hp-btn hp-btn--brand gh-lead__btn">${esc(o.cta || 'Sign me up')}${icon('arrow')}</button>
    <p class="gh-lead__msg" role="status" aria-live="polite" data-gh-lead-msg></p>
  </form>`}
</div>`;
}
