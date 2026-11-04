// "Sell your domain": /account/sell (my listings), /account/sell/new (pick a domain, set the price, pay the fee by WHMCS
// invoice) and /account/sell/<id> (status, invoice, edit, Featured, renewal, withdraw). Rules: lib/sell/core.ts.
import { card, dl, empty, esc, fmtDate, icon, money, ssoButton, btn, okMark, errMark, t, fieldErr, invalid } from './kit';
import { tn } from '../i18n';
import {
  SELL_CURRENCIES, SELL_CATEGORIES, sellTone, sellerActions, featuredNow, transferUrl, MIN_PRICE,
  type Listing, type FeeQuote, type SellConfig, type SellForm, type SellErr, type Eligibility,
} from '../../sell/core';

/* ------------------------------------------------------------------ strings */
const statusLabel = (s: string) => ({
  draft: t('Draft'), awaiting_payment: t('Awaiting payment'), in_review: t('In review'), live: t('Live'), expired: t('Listing expired'),
  rejected: t('Not approved'), suspended: t('Hidden'), sold: t('Sold'), withdrawn: t('Withdrawn'),
} as Record<string, string>)[s] || s;
export const sellPill = (s: string) => `<span class="ac-pill ac-pill--${sellTone(s)}"><i aria-hidden="true"></i>${esc(statusLabel(s))}</span>`;

const catLabel = (c: string) => ({
  Business: t('Business'), Technology: t('Technology'), AI: t('AI'), Finance: t('Finance'), Crypto: t('Crypto'), 'E-commerce': t('E-commerce'), 'Real estate': t('Real estate'),
  Travel: t('Travel'), Health: t('Health'), Media: t('Media'), Education: t('Education'), Gaming: t('Gaming'), Other: t('Other'),
} as Record<string, string>)[c] || c;

/** Field error texts (validateSell keys + handler keys). */
const errText = (k: string) => ({
  domain: t('Choose one of your active domains.'), price: t('Enter the price as a number, for example 2500.'),
  price_range: t('The price must be between {a} and {b}.', { a: String(MIN_PRICE), b: '10,000,000' }), min_offer: t('Enter the minimum offer as a number, or leave it empty.'),
  min_offer_high: t('The minimum offer must be lower than the price.'), currency: t('Choose a currency.'),
  description: t('Describe the name in plain text, without links or HTML.'), category: t('Choose a category from the list.'),
  terms: t('Please confirm the seller terms.'),
} as Record<string, string>)[k] || k;

/** Messages after an action (?ok= / ?err= on the sell pages). */
const MSG = (): Record<string, [string, 'ok' | 'err']> => ({
  sell_invoice: [t('Your invoice is ready. Pay it in your client area; your listing goes to review as soon as it is paid.'), 'ok'],
  sell_draft: [t('Saved as a draft. Add more domains, then pay for them together on one invoice.'), 'ok'],
  sell_saved: [t('Changes saved.'), 'ok'],
  sell_review: [t('Saved. Price changes apply now; your new description is shown after a quick review.'), 'ok'],
  sell_withdrawn: [t('Your listing is withdrawn and no longer shown.'), 'ok'],
  sell_featured: [t('Your Featured invoice is ready. The listing is featured as soon as it is paid.'), 'ok'],
  sell_renew: [t('Your renewal invoice is ready. The listing continues for another year once it is paid.'), 'ok'],
  sell_paid: [t('Payment received. Your listing is in review; we usually approve within one business day.'), 'ok'],
  sell_ineligible: [t('This domain cannot be listed right now. See the reason next to it.'), 'err'],
  sell_taken: [t('This domain is already listed in the marketplace.'), 'err'],
  sell_limit: [t('You have reached the maximum number of open listings. Withdraw one first or contact us.'), 'err'],
  sell_state: [t('That action is not available for this listing right now.'), 'err'],
  sell_currency: [t('We could not price the fees in your account currency. Please contact support.'), 'err'],
  sell_failed: [t('We could not create the invoice right now. Nothing was charged. Please try again in a moment.'), 'err'],
  sell_nosel: [t('Select at least one draft to pay for.'), 'err'],
  sell_off: [t('Listing domains for sale is paused right now. Please check back soon.'), 'err'],
  rate: [t('Too many changes in a short time. Please wait a few minutes and try again.'), 'err'],
  failed: [t('That change could not be saved. Please try again or contact support.'), 'err'],
});
export function sellFlash(key: string | null) {
  const m = key ? MSG()[key] : undefined;
  return m ? `<div class="ac-flash ac-flash--${m[1]} ac-sell-flash" role="${m[1] === 'ok' ? 'status' : 'alert'}">${m[1] === 'ok' ? okMark() : errMark()}<span>${esc(m[0])}</span></div>` : '';
}
const eligText = (e: Eligibility | { ok: false; code: 'taken' | 'listed' }) => {
  if (e.ok) return '';
  return ({
    not_found: t('Not in your GlobalHostia account.'), invalid: t('Not a valid domain name.'), taken: t('Already listed in the marketplace.'), listed: t('You already listed this domain.'),
    not_active: t('Status: {s}. Only active domains can be listed.', { s: t(String((e as any).status || 'Unknown')) }),
    expiring: (e as any).days < 0 ? t('Expired. Renew it first.') : t('Expires in {n} days. Renew it first.', { n: (e as any).days ?? 0 }),
  } as Record<string, string>)[e.code] || '';
};

const priceOf = (l: Pick<Listing, 'price' | 'currency' | 'minOffer'>) => (l.price !== null && l.price !== '' && Number(l.price) > 0 ? money(l.price, l.currency) : l.minOffer ? t('Offers from {p}', { p: money(l.minOffer, l.currency) }) : t('Make an offer'));
/** "15% commission when your domain sells, deducted from the payout" (+ minimum), shown only when a commission is set. */
export const commissionNote = (cfg: SellConfig) => cfg.commissionPct > 0
  ? `<p class="ac-sell-comm">${icon('info')}<span>${esc(t('{p}% commission when your domain sells, deducted from the payout.', { p: String(cfg.commissionPct) }))}${cfg.commissionMinUsd > 0 ? ' ' + esc(t('Minimum commission {m}.', { m: money(cfg.commissionMinUsd, 'USD') })) : ''}</span></p>` : '';
export const feeLine = (q: FeeQuote | null) => (q ? `${esc(t('Listing fee'))} <b class="num">${esc(money(q.listing, q.currency))}</b> · ${esc(t('Featured'))} <b class="num">+${esc(money(q.featured, q.currency))}</b>` : esc(t('Fees are shown on your invoice.')));

/* ------------------------------------------------------------------ /account/sell */
export function sellListView(o: { csrf: string; listings: Listing[]; quote: FeeQuote | null; cfg: SellConfig; flash?: string | null; enabled: boolean }) {
  const ls = o.listings;
  const drafts = ls.filter((l) => l.status === 'draft');
  const open = ls.filter((l) => !['rejected', 'sold', 'withdrawn'].includes(l.status));
  const live = ls.filter((l) => l.status === 'live').length;
  const intro = `<div class="ac-sell-intro" data-reveal>
    <div><h2>${esc(t('List your domains in our premium marketplace'))}</h2>
      <p>${esc(t('Domains registered with GlobalHostia can be listed for sale on our premium domains page. You set the price; our broker team handles buyers, payment and the transfer.'))}</p>
      <p class="ac-sell-fee">${feeLine(o.quote)} <span class="ac-muted">${esc(t('per domain, for one year'))}</span></p>${commissionNote(o.cfg)}</div>
    <div class="ac-sell-intro__a">${o.enabled ? btn(t('List a domain'), '/account/sell/new', { variant: 'brand', ic: 'plus' }) : ''}<a class="hp-link" href="/sell-domains">${esc(t('How selling works'))}${icon('arrow')}</a></div>
  </div>`;
  const batch = drafts.length ? `<form method="post" action="/account/sell" class="ac-sell-batch" data-ac-busy>
    <input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="op" value="pay_drafts">
    <div><b>${esc(tn(drafts.length, '{n} draft ready to pay', '{n} drafts ready to pay'))}</b><small>${esc(t('One invoice with a line per domain. Untick any you want to keep as a draft.'))}</small></div>
    <ul>${drafts.map((l) => `<li><label><input type="checkbox" name="sel" value="${esc(l.id)}" checked><span class="ac-mono">${esc(l.domain)}</span>${l.featuredState === 'requested' ? `<small>${esc(t('+ Featured'))}</small>` : ''}</label></li>`).join('')}</ul>
    <button class="hp-btn hp-btn--brand" type="submit">${icon('lock')}${esc(t('Continue to payment'))}</button>
  </form>` : '';
  const rows = ls.map((l) => {
    const a = sellerActions(l);
    const until = l.listedUntil ? `<span class="num">${esc(fmtDate(String(new Date(l.listedUntil).toISOString())))}</span>` : '<span class="ac-muted">—</span>';
    const next = a.invoice ? ssoButton(o.csrf, 'invoice', l.invoiceId!, t('Pay invoice'), { variant: 'brand', sm: true })
      : a.renewInvoice ? ssoButton(o.csrf, 'invoice', l.renewInvoiceId!, t('Pay renewal'), { variant: 'brand', sm: true })
      : a.renew ? btn(t('Renew'), `/account/sell/${l.id}#renew`, { variant: 'brand', sm: true }) : '';
    return `<tr>
      <th scope="row"><a class="ac-strong ac-mono" href="/account/sell/${esc(l.id)}" dir="ltr">${esc(l.domain)}</a>${featuredNow(l) ? ` <span class="ac-sell-star" title="${esc(t('Featured'))}">${icon('star')}<span class="sr-only">${esc(t('Featured'))}</span></span>` : ''}<small class="ac-sell-ref num">${esc(l.ref)}</small></th>
      <td data-l="${esc(t('Status'))}">${sellPill(l.status)}${l.pending ? ` <small class="ac-muted">${esc(t('changes in review'))}</small>` : ''}</td>
      <td data-l="${esc(t('Price'))}" class="num">${esc(priceOf(l))}</td>
      <td data-l="${esc(t('Listed until'))}">${until}</td>
      <td class="ac-td-act">${next}<a class="hp-btn hp-btn--ghost ac-sm" href="/account/sell/${esc(l.id)}">${esc(t('Manage'))}</a></td></tr>`;
  }).join('');
  const table = ls.length
    ? `<table class="ac-table ac-table--rows ac-sell-table"><thead><tr><th scope="col">${esc(t('Domain'))}</th><th scope="col">${esc(t('Status'))}</th><th scope="col">${esc(t('Price'))}</th><th scope="col">${esc(t('Listed until'))}</th><th scope="col"><span class="sr-only">${esc(t('Actions'))}</span></th></tr></thead><tbody>${rows}</tbody></table>`
    : empty(t('No listings yet'), t('List a domain from your account and buyers can find it on our premium domains page.'), o.enabled ? btn(t('List a domain'), '/account/sell/new', { variant: 'brand', ic: 'plus' }) : '', 'tag');
  const stats = ls.length ? `<p class="ac-sell-count">${esc(tn(open.length, '{n} open listing', '{n} open listings'))} · ${esc(tn(live, '{n} live', '{n} live'))}</p>` : '';
  return `${sellFlash(o.flash || null)}${intro}${batch}${card(t('Your listings'), stats + table, { id: 'ac-sell-h', flush: true })}`;
}

/* ------------------------------------------------------------------ the listing form (new + edit) */
type FormOpts = { csrf: string; action: string; f: SellForm; errs?: Partial<Record<SellErr | 'form', string | true>>; quote: FeeQuote | null; cfg: SellConfig; edit?: boolean; live?: boolean };
function fields(o: FormOpts) {
  const f = o.f, e = (o.errs || {}) as Record<string, string | true>;
  const er: Record<string, string> = Object.fromEntries(Object.keys(e).filter((k) => k !== 'form').map((k) => [k, typeof e[k] === 'string' ? e[k] as string : errText(k)]));
  const sel = (n: string, opts: [string, string][], v: string, label: string) => `<div class="ac-field"><label for="ac-s-${n}">${esc(label)}</label><select class="ac-input" id="ac-s-${n}" name="${n}"${invalid(er, n)}>${opts.map(([k, l]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>${fieldErr(er, n)}</div>`;
  return `<fieldset class="ac-sell-mode"><legend>${esc(t('How do you want to sell?'))}</legend>
      <div class="ac-sell-mode__o"><label class="ac-sell-opt"><input type="radio" name="mode" value="price"${f.mode === 'price' ? ' checked' : ''}><span><b>${esc(t('Fixed price'))}</b><small>${esc(t('Buyers can buy now at your price.'))}</small></span></label>
      <label class="ac-sell-opt"><input type="radio" name="mode" value="offer"${f.mode === 'offer' ? ' checked' : ''}><span><b>${esc(t('Make an offer'))}</b><small>${esc(t('No price shown; buyers send offers.'))}</small></span></label></div>
    </fieldset>
    <div class="ac-form__row">
      <div class="ac-field ac-sell-price"><label for="ac-s-price">${esc(t('Price'))}</label><input class="ac-input num" id="ac-s-price" name="price" inputmode="decimal" autocomplete="off" maxlength="14" value="${esc(f.price)}" placeholder="2500"${invalid(er, er.price_range ? 'price_range' : 'price')}>${fieldErr(er, 'price')}${fieldErr(er, 'price_range')}</div>
      ${sel('currency', SELL_CURRENCIES.map((c): [string, string] => [c, c]), f.currency || 'USD', t('Currency'))}
    </div>
    <div class="ac-form__row">
      <div class="ac-field"><label for="ac-s-min">${esc(t('Minimum offer'))} <span class="ac-muted">${esc(t('(optional)'))}</span></label><input class="ac-input num" id="ac-s-min" name="min_offer" inputmode="decimal" autocomplete="off" maxlength="14" value="${esc(f.minOffer)}"${invalid(er, er.min_offer_high ? 'min_offer_high' : 'min_offer')}>${fieldErr(er, 'min_offer')}${fieldErr(er, 'min_offer_high')}</div>
      <div class="ac-field ac-sell-check"><label class="ac-switch-l"><input type="checkbox" name="accept_offers" value="1"${f.acceptOffers ? ' checked' : ''}><span>${esc(t('Also accept offers below the price'))}</span></label></div>
    </div>
    <div class="ac-form__row">
      ${sel('category', [['', t('Choose a category')], ...SELL_CATEGORIES.map((c): [string, string] => [c, catLabel(c)])], f.category, t('Category'))}
      <div class="ac-field"><label for="ac-s-tags">${esc(t('Tags'))} <span class="ac-muted">${esc(t('(optional, comma separated)'))}</span></label><input class="ac-input" id="ac-s-tags" name="tags" maxlength="200" value="${esc(f.tags)}" placeholder="${esc(t('brandable, short'))}"></div>
    </div>
    <div class="ac-field"><label for="ac-s-desc">${esc(t('Description'))} <span class="ac-muted">${esc(t('(optional)'))}</span></label><textarea class="ac-input ac-textarea" id="ac-s-desc" name="description" rows="3" maxlength="1200" placeholder="${esc(t('What makes this name valuable, and who could use it. Plain text, no links.'))}"${invalid(er, 'description')}>${esc(f.description)}</textarea>${fieldErr(er, 'description')}
      ${o.live ? `<p class="ac-muted ac-small">${esc(t('Price changes apply at once. Changes to the description, category or tags are shown after a quick review.'))}</p>` : ''}</div>`;
}

export type PickDomain = { id: number; name: string; status: string; expires: string; elig: Eligibility | { ok: false; code: 'taken' | 'listed' }; listingId?: string };

export function sellNewView(o: FormOpts & { domains: PickDomain[]; whmcsBase: string; loadError?: boolean }) {
  const f = o.f;
  const ok = o.domains.filter((d) => d.elig.ok);
  const errs = (o.errs || {}) as Record<string, string | true>;
  const formErr = errs.form ? `<div class="ac-alert ac-alert--err" role="alert">${icon('alert')}<span>${esc(typeof errs.form === 'string' ? errs.form : t('Check the highlighted fields and try again.'))}</span></div>`
    : Object.keys(errs).length ? `<div class="ac-alert ac-alert--err" role="alert">${icon('alert')}<span>${esc(t('Check the highlighted fields and try again.'))}</span></div>` : '';
  const picker = o.loadError ? `<div class="ac-alert ac-alert--warn" role="status">${icon('alert')}<span>${esc(t('We could not load your domains right now. Please try again in a moment.'))}</span></div>`
    : o.domains.length ? `<ul class="ac-sell-pick" role="list">${o.domains.map((d) => {
      const on = d.elig.ok;
      const why = eligText(d.elig);
      // the renew hand-off form lives outside the listing form (forms cannot nest); the button points at it with form=""
      const renew = !d.elig.ok && d.elig.code === 'expiring' ? `<button type="submit" form="ac-rn-${esc(d.id)}" class="hp-btn hp-btn--ghost ac-sm">${esc(t('Renew'))}</button>` : '';
      const view = !d.elig.ok && d.elig.code === 'listed' && d.listingId ? btn(t('View listing'), `/account/sell/${d.listingId}`, { sm: true }) : '';
      return `<li class="${on ? '' : 'is-off'}"><label><input type="radio" name="domain" value="${esc(d.name)}"${on ? '' : ' disabled'}${on && f.domain === d.name ? ' checked' : ''}${errs.domain ? ' aria-invalid="true" aria-describedby="err-domain"' : ''}>
        <span class="ac-sell-pick__n"><b class="ac-mono" dir="ltr">${esc(d.name)}</b><small>${on ? esc(t('Active · expires {d}', { d: fmtDate(d.expires) })) : esc(why)}</small></span></label>${renew}${view}</li>`;
    }).join('')}</ul>${fieldErr(Object.fromEntries(errs.domain ? [['domain', errText('domain')]] : []), 'domain')}`
    : empty(t('No domains in your account yet'), t('Register or transfer a domain to GlobalHostia first, then list it here.'), '', 'globe');

  const transfer = `<details class="ac-sell-xfer"${!ok.length ? ' open' : ''}><summary>${icon('transfer')}<span><b>${esc(t('Is your domain with another registrar?'))}</b><small>${esc(t('Transfer it to GlobalHostia first. It usually takes 5 to 7 days and adds a year to the registration.'))}</small></span></summary>
    <div class="ac-sell-xfer__b">
      <p>${esc(t('Only domains registered with GlobalHostia, active in your account, can be listed. This lets us move the domain to the buyer safely once it sells.'))}</p>
      <form method="get" action="${esc(o.whmcsBase.replace(/\/$/, ''))}/cart.php" class="ac-sell-xfer__f" target="_blank" rel="noopener">
        <input type="hidden" name="a" value="add"><input type="hidden" name="domain" value="transfer">
        <label class="sr-only" for="ac-s-xq">${esc(t('Domain to transfer'))}</label><input class="ac-input ac-mono" id="ac-s-xq" name="query" placeholder="yourname.com" autocomplete="off" spellcheck="false" autocapitalize="none" inputmode="url" required maxlength="253" dir="ltr">
        <button class="hp-btn hp-btn--outline" type="submit">${icon('transfer')}${esc(t('Transfer it to GlobalHostia first'))}</button>
      </form>
    </div></details>`;

  const q = o.quote;
  const total = (feat: boolean) => (q ? money(q.listing + (feat ? q.featured : 0), q.currency) : '');
  const summary = `<aside class="ac-sell-sum" aria-labelledby="ac-sum-h">
    <h3 id="ac-sum-h">${esc(t('Fees'))}</h3>
    <dl><div><dt>${esc(t('Listing fee (1 year)'))}</dt><dd class="num">${q ? esc(money(q.listing, q.currency)) : '—'}</dd></div>
      <div class="ac-sell-sum__f"><dt>${esc(t('Featured upgrade'))}</dt><dd class="num">${q ? '+' + esc(money(q.featured, q.currency)) : '—'}</dd></div>
      <div class="ac-sell-sum__t"><dt>${esc(t('Total today'))}</dt><dd class="num"><span class="ac-sell-t0">${esc(total(false))}</span><span class="ac-sell-t1">${esc(total(true))}</span></dd></div></dl>
    <p class="ac-muted ac-small">${esc(t('Charged by an invoice in your account currency. You pay it in your client area; nothing is charged on this page.'))}</p>
    ${commissionNote(o.cfg)}
  </aside>`;

  const form = `<form method="post" action="${esc(o.action)}" class="ac-form ac-sell-form" novalidate data-ac-busy>
    <input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="op" value="create">
    <fieldset><legend>${esc(t('1. Choose the domain'))}</legend>${picker}</fieldset>
    <fieldset><legend>${esc(t('2. Set your price'))}</legend>${fields(o)}${commissionNote(o.cfg)}</fieldset>
    <fieldset><legend>${esc(t('3. Options and terms'))}</legend>
      <label class="ac-sell-feat"><input type="checkbox" name="featured" value="1"${f.featured ? ' checked' : ''}><span>${icon('star')}<b>${esc(t('Make it Featured'))}</b><small>${esc(t('Shown first in the marketplace and in the premium row on our homepage, for the listing year.'))}${q ? ` +${esc(money(q.featured, q.currency))}` : ''}</small></span></label>
      <label class="ac-sell-terms"><input type="checkbox" name="terms" value="1"${f.terms ? ' checked' : ''}${errs.terms ? ' aria-invalid="true" aria-describedby="err-terms"' : ''}><span>${t('I confirm I own this domain and have the right to sell it, the name does not infringe anyone\'s trademark, and I keep it in my GlobalHostia account while it is listed. I accept the <a href="/sell-domains#terms">seller terms</a>.')}${o.cfg.commissionPct > 0 ? ' ' + esc(t('I agree to the {p}% commission on the sale price, deducted from my payout.', { p: String(o.cfg.commissionPct) })) : ''}</span></label>${fieldErr(Object.fromEntries(errs.terms ? [['terms', errText('terms')]] : []), 'terms')}
      <p class="ac-muted ac-small">${esc(o.cfg.refundPolicy)}</p>
    </fieldset>
    <div class="ac-form__foot ac-sell-foot">
      <button class="hp-btn hp-btn--brand" type="submit" name="next" value="pay"${ok.length ? '' : ' disabled'}>${icon('lock')}${esc(t('Continue to payment'))}</button>
      <button class="hp-btn hp-btn--ghost" type="submit" name="next" value="draft"${ok.length ? '' : ' disabled'}>${esc(t('Save and list another domain'))}</button>
    </div>
  </form>`;
  const renewForms = o.domains.filter((d) => !d.elig.ok && d.elig.code === 'expiring').map((d) =>
    `<form method="post" action="/account/sso" id="ac-rn-${esc(d.id)}" hidden><input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="to" value="domain_renew"><input type="hidden" name="id" value="${esc(d.id)}"></form>`).join('');
  return `${formErr}${renewForms}<div class="ac-grid ac-grid--detail ac-sell-new"><div class="ac-col">${card(t('List a domain for sale'), form, { id: 'ac-sn-h' })}${transfer}</div><div class="ac-col">${summary}${card(t('What happens next'), steps(), { id: 'ac-sx-h' })}</div></div>`;
}

const steps = () => `<ol class="ac-sell-steps">
  <li><b>${esc(t('Pay the listing fee'))}</b><span>${esc(t('An invoice in your client area, in your account currency.'))}</span></li>
  <li><b>${esc(t('We review the listing'))}</b><span>${esc(t('Usually within one business day. We check the name and the price.'))}</span></li>
  <li><b>${esc(t('Buyers find it'))}</b><span>${esc(t('Your domain is shown on our premium domains page for one year.'))}</span></li>
  <li><b>${esc(t('We handle the sale'))}</b><span>${esc(t('Our broker confirms the buyer, payment goes through escrow and we move the domain between accounts.'))}</span></li>
</ol>`;

/* ------------------------------------------------------------------ /account/sell/<id> */
export function sellDetailView(o: { csrf: string; l: Listing; quote: FeeQuote | null; cfg: SellConfig; f: SellForm; errs?: Partial<Record<SellErr | 'form', string | true>>; flash?: string | null; confirmWithdraw?: boolean }) {
  const l = o.l, a = sellerActions(l);
  const d = (v: unknown) => (v ? esc(fmtDate(new Date(v as any).toISOString())) : '—');
  const timeline: [string, boolean][] = [
    [t('Listing created'), true], [t('Fee paid'), !!l.paidAt || ['in_review', 'live', 'expired', 'sold', 'suspended'].includes(l.status)],
    [t('Approved'), !!l.approvedAt], [t('Live in the marketplace'), l.status === 'live'],
  ];
  const statusBox = `<div class="ac-sell-status">
    <div class="ac-sell-status__top">${sellPill(l.status)}${featuredNow(l) ? `<span class="ac-pill ac-pill--info">${icon('star')}${esc(t('Featured'))}</span>` : ''}<span class="ac-muted num">${esc(l.ref)}</span></div>
    ${l.status === 'rejected' && l.rejectReason ? `<div class="ac-alert ac-alert--err" role="status">${icon('alert')}<span>${esc(t('Reason: {r}', { r: l.rejectReason }))}<br>${esc(o.cfg.refundPolicy)}</span></div>` : ''}
    ${l.status === 'suspended' ? `<div class="ac-alert ac-alert--warn" role="status">${icon('alert')}<span>${esc(l.hiddenReason === 'gone' ? t('Hidden: the domain is no longer in your GlobalHostia account.') : l.hiddenReason === 'expired' ? t('Hidden: the domain has expired. Renew it, then contact us to restore the listing.') : t('Hidden: the domain is not active in your account.'))}</span></div>` : ''}
    ${l.status === 'expired' ? `<div class="ac-alert ac-alert--warn" role="status">${icon('alert')}<span>${esc(t('The listing year has ended, so the domain is not shown. Renew the listing to show it again.'))}</span></div>` : ''}
    ${l.status === 'in_review' ? `<div class="ac-alert ac-alert--info" role="status">${icon('info')}<span>${esc(t('Paid. We are reviewing your listing; this usually takes one business day.'))}</span></div>` : ''}
    ${l.pending ? `<div class="ac-alert ac-alert--info" role="status">${icon('info')}<span>${esc(t('Your new description is waiting for review. The current one stays visible until then.'))}</span></div>` : ''}
    <ol class="ac-sell-tl">${timeline.map(([x, done]) => `<li class="${done ? 'is-done' : ''}">${done ? icon('check') : '<i aria-hidden="true"></i>'}<span>${esc(x)}</span></li>`).join('')}</ol>
    ${dl([[t('Price'), `<span class="num">${esc(priceOf(l))}</span>`], [t('Listed until'), `<span class="num">${d(l.listedUntil)}</span>`], ...(featuredNow(l) ? [[t('Featured until'), `<span class="num">${d(l.featuredUntil)}</span>`] as [string, string]] : []), [t('Created'), `<span class="num">${d(l.createdAt)}</span>`]])}
    ${l.status === 'live' ? `<a class="hp-link" href="/premium-domains/${encodeURIComponent(l.domain)}" target="_blank" rel="noopener">${esc(t('See it in the marketplace'))}${icon('external')}</a>` : ''}
  </div>`;
  const pay = a.invoice ? `<div class="ac-sell-act"><p>${esc(t('Pay the invoice to send the listing to review.'))}</p>${ssoButton(o.csrf, 'invoice', l.invoiceId!, t('Pay invoice #{n}', { n: l.invoiceId! }), { variant: 'brand', ic: 'lock', block: true })}</div>`
    : a.pay ? `<form method="post" action="/account/sell/${esc(l.id)}" class="ac-sell-act" data-ac-busy><input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="op" value="pay"><p>${feeLine(o.quote)}</p><button class="hp-btn hp-btn--brand hp-btn--block" type="submit">${icon('lock')}${esc(t('Continue to payment'))}</button></form>` : '';
  const featured = a.featuredInvoice ? `<div class="ac-sell-act">${ssoButton(o.csrf, 'invoice', l.featuredInvoiceId!, t('Pay Featured invoice'), { variant: 'brand', ic: 'star', block: true })}</div>`
    : a.featured ? `<form method="post" action="/account/sell/${esc(l.id)}" class="ac-sell-act" data-ac-busy><input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="op" value="featured">
      <p><b>${esc(t('Make it Featured'))}</b> ${o.quote ? `<span class="num">+${esc(money(o.quote.featured, o.quote.currency))}</span>` : ''}<br><small class="ac-muted">${esc(t('Shown first in the marketplace and on our homepage until {d}.', { d: l.listedUntil ? fmtDate(new Date(l.listedUntil).toISOString()) : '—' }))}</small></p>
      <button class="hp-btn hp-btn--outline hp-btn--block" type="submit">${icon('star')}${esc(t('Add Featured'))}</button></form>` : '';
  const renew = a.renewInvoice ? `<div class="ac-sell-act" id="renew">${ssoButton(o.csrf, 'invoice', l.renewInvoiceId!, t('Pay renewal invoice'), { variant: 'brand', ic: 'refresh', block: true })}</div>`
    : a.renew ? `<form method="post" action="/account/sell/${esc(l.id)}" class="ac-sell-act" id="renew" data-ac-busy><input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="op" value="renew">
      <p><b>${esc(t('Renew the listing for one year'))}</b> ${o.quote ? `<span class="num">${esc(money(o.quote.listing, o.quote.currency))}</span>` : ''}<br><small class="ac-muted">${esc(t('No new review unless you changed the description.'))}</small></p>
      <label class="ac-sell-feat ac-sell-feat--sm"><input type="checkbox" name="featured" value="1"${featuredNow(l) ? ' checked' : ''}><span>${icon('star')}<b>${esc(t('Keep it Featured'))}</b>${o.quote ? `<small class="num">+${esc(money(o.quote.featured, o.quote.currency))}</small>` : ''}</span></label>
      <button class="hp-btn hp-btn--brand hp-btn--block" type="submit">${icon('refresh')}${esc(t('Renew listing'))}</button></form>` : '';
  const withdraw = a.withdraw ? (o.confirmWithdraw
    ? `<form method="post" action="/account/sell/${esc(l.id)}" class="ac-sell-act ac-sell-act--danger"><input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="op" value="withdraw"><input type="hidden" name="confirm" value="yes">
      <p><b>${esc(t('Withdraw this listing?'))}</b><br><small>${esc(t('It is removed from the marketplace at once. Fees already paid are not refunded.'))}</small></p>
      <div class="ac-sell-act__row"><button class="hp-btn hp-btn--dark" type="submit">${esc(t('Yes, withdraw'))}</button><a class="hp-btn hp-btn--ghost" href="/account/sell/${esc(l.id)}">${esc(t('Cancel'))}</a></div></form>`
    : `<form method="post" action="/account/sell/${esc(l.id)}" class="ac-sell-act"><input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="op" value="withdraw"><button class="hp-btn hp-btn--ghost hp-btn--block ac-sell-wd" type="submit">${esc(t('Withdraw listing'))}</button></form>`) : '';
  const errs = (o.errs || {}) as Record<string, string | true>;
  const editForm = a.edit ? card(t('Listing details'), `${Object.keys(errs).length ? `<div class="ac-alert ac-alert--err" role="alert">${icon('alert')}<span>${esc(typeof errs.form === 'string' ? errs.form : t('Check the highlighted fields and try again.'))}</span></div>` : ''}
    <form method="post" action="/account/sell/${esc(l.id)}" class="ac-form ac-sell-form" novalidate data-ac-busy><input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="op" value="edit">
      ${fields({ csrf: o.csrf, action: '', f: o.f, errs: o.errs, quote: o.quote, cfg: o.cfg, edit: true, live: ['live', 'expired', 'suspended'].includes(l.status) })}
      <div class="ac-form__foot"><button class="hp-btn hp-btn--brand" type="submit">${esc(t('Save changes'))}</button></div></form>`, { id: 'ac-se-h' }) : '';
  const side = card(t('Listing'), statusBox + pay + renew + featured + withdraw, { id: 'ac-ss-h' });
  return `${sellFlash(o.flash || null)}<div class="ac-grid ac-grid--detail"><div class="ac-col">${editForm || card(t('Listing details'), dl([[t('Description'), esc(l.description || '—')], [t('Category'), esc(l.category ? catLabel(l.category) : '—')]]), { id: 'ac-se-h' })}</div><div class="ac-col">${side}</div></div>`;
}

/** Form values from a stored listing (edit page). */
export function formOf(l: Listing): SellForm {
  const hasPrice = l.price !== null && l.price !== '' && Number(l.price) > 0;
  const src = l.pending || {};
  return {
    domain: l.domain, mode: hasPrice ? 'price' : 'offer', price: hasPrice ? String(Number(l.price)) : '', currency: l.currency || 'USD',
    minOffer: l.minOffer ? String(Number(l.minOffer)) : '', acceptOffers: !!l.acceptOffers, description: src.description ?? l.description, category: src.category ?? l.category,
    tags: (src.tags ?? l.tags ?? []).join(', '), featured: false, terms: true,
  };
}
export const transferHref = transferUrl;
