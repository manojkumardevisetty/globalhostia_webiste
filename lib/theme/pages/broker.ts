// /domain-broker: Domain Broker Service (premium or taken domain acquisition).
// Request form → POST /api/broker-request → broker_requests row + WHMCS ticket. Fees come from admin settings
// (broker_fee_usd / broker_commission_pct / broker_min_commission_usd) and are shown in the visitor currency
// only when our own catalog prices give a USD ratio; otherwise in USD with an "account currency" note.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { getCatalog, currencyPrefix } from '../data';
import { page } from '../shell';
import { pageHero, sectionHead, faq, faqJsonLd, breadcrumbJsonLd, icon, hexIcon, ld, link, ctaBand } from '../ui';
import { trustStrip, waLink } from '../growth';
import { siteOf, crumbsFor } from './vps';
import { brokerConfig, catalogRate, commissionFor, BROKER_CURRENCIES } from '../../broker';
import { validDomain } from '../../agents/domain';
import { autoEnsureBrokerProduct } from '../../broker-whmcs';

const USES = ['Main business website', 'New brand or product launch', 'Rebrand of an existing business', 'Protect my brand or trademark', 'Investment', 'Other'];

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const s = cat.settings, site = siteOf(cat);
  const cfg = brokerConfig(s);
  const pid = cfg.pid || (await autoEnsureBrokerProduct());
  const crumbs = crumbsFor('Domain broker service', { label: 'Domains', href: '/domains-registration' });
  const want = validDomain((ctx.query.get('domain') || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '')) || '';
  const ref = (ctx.query.get('ref') || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 24);
  const err = (ctx.query.get('error') || '').slice(0, 200);
  const wa = waLink(s, `Hello Globalhostia, I would like your domain broker service${want ? ` for ${want}` : ''}.`);
  const email = String(s.email || '');

  // ---- money: USD settings, shown in the visitor currency only via our own catalog ratios
  const cur = cat.currency;
  const rate = cur === 'USD' ? 1 : catalogRate(cat.products, cur);
  const conv = rate !== null && cur !== 'USD';
  const pre = conv ? (currencyPrefix(cat) || `${cur} `) : '$';
  const whole = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n % 1 ? 2 : 0 });
  const usd = (n: number) => `$${whole(n)}`;
  const show = (n: number) => (conv ? `${pre}${whole(Math.round(n * rate!))}` : usd(n));
  const pair = (n: number) => (conv ? `${show(n)} <small class="br-usd">(${usd(n)})</small>` : usd(n));
  const curNote = conv
    ? `Shown in ${cur} using the exchange ratio of our own price list; fees are set in USD and your invoice uses your account currency.`
    : cur === 'USD' ? 'Fees in US dollars.' : `Fees are set in USD and charged in your account currency at checkout.`;
  const feeTxt = usd(cfg.feeUsd), minTxt = usd(cfg.minUsd), pctTxt = `${whole(cfg.pct)}%`;

  // ---- hero visual: a deal moving from "taken" to "transferred"
  const shown = want || 'yourbrand.com';
  const stages: [string, string][] = [['search', 'Owner researched'], ['eye', 'Contacted anonymously'], ['chat', 'Offer within your budget'], ['lock', 'Paid into escrow'], ['check', 'Transferred to you']];
  const visual = `<div class="br-deal" aria-hidden="true" data-pause>
    <div class="br-deal__top"><span class="br-deal__dom">${icon('globe')}<b>${esc(shown)}</b></span><span class="br-deal__tag"><i></i>Registered</span></div>
    <ol class="br-deal__track">${stages.map(([ic, t], i) => `<li style="--i:${i}">${icon(ic)}<span>${esc(t)}</span></li>`).join('')}</ol>
    <div class="br-deal__foot"><span>Your budget</span><b>You set the ceiling</b></div>
  </div>`;
  const hero = pageHero({
    crumbs, eyebrow: 'Domain broker service',
    title: 'The domain you want is taken? We\'ll negotiate it for you.',
    lead: `A dedicated broker finds the owner, approaches them without revealing who you are and negotiates within your budget. When a deal is agreed, the domain moves to you through a licensed escrow service. ${feeTxt} to start, and a ${pctTxt} commission only if we succeed.`,
    ctas: [{ label: 'Start a broker request', href: '#request', icon: 'arrow' }, { label: 'How the fees work', href: '#fees', variant: 'ghost' }],
    visualHtml: visual, network: false,
  });

  // ---- process
  const steps = [
    { ic: 'pen', h: 'You send the request', p: 'Tell us the domain and the most you would pay. It takes about two minutes, and your budget stays private.' },
    { ic: 'eye', h: 'We research and reach out anonymously', p: 'We check who holds the name, its history and comparable sales, then contact the owner without naming you.' },
    { ic: 'chat', h: 'We negotiate within your budget', p: 'Your broker handles every counter-offer and only accepts a price you have approved. You can stop at any time.' },
    { ic: 'lock', h: 'Secure transfer through escrow', p: 'You pay the seller through a licensed escrow service. The money is released only once the domain is in your account.' },
  ];
  const process = `<section class="hp-section" id="process" aria-labelledby="br-proc-h"><div class="hp-container">
    ${sectionHead({ id: 'br-proc-h', title: 'How a domain purchase works', lead: 'Four steps from "taken" to "yours". You approve every price before anything is agreed.' })}
    <ol class="br-steps">${steps.map((x, i) => `<li data-reveal style="--i:${i}"><span class="br-steps__n num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>${hexIcon(x.ic)}<h3>${esc(x.h)}</h3><p>${esc(x.p)}</p></li>`).join('')}</ol>
  </div></section>`;

  // ---- fees + what's included
  const exA = 2000, exB = 500;
  const cA = commissionFor(exA, cfg.pct, cfg.minUsd), cB = commissionFor(exB, cfg.pct, cfg.minUsd);
  const exRow = (price: number, c: number) => `<div class="br-ex">
      <p class="br-ex__h">If the owner agrees to <b class="num">${show(price)}</b></p>
      <dl>
        <div><dt>Service fee, paid at the start</dt><dd class="num">${show(cfg.feeUsd)}</dd></div>
        <div><dt>Commission: ${pctTxt} of ${show(price)}${c > (price * cfg.pct) / 100 ? `, raised to the ${show(cfg.minUsd)} minimum` : ''}</dt><dd class="num">${show(c)}</dd></div>
        <div class="br-ex__tot"><dt>Our fees in total</dt><dd class="num">${show(cfg.feeUsd + c)}</dd></div>
        <div class="br-ex__seller"><dt>Purchase price, paid by you to the seller through escrow</dt><dd class="num">${show(price)}</dd></div>
      </dl>
    </div>`;
  const included = [
    ['user', 'A dedicated broker', 'One person owns your request from research to transfer and reports back at every step.'],
    ['eye', 'Anonymous outreach', 'The owner never learns who is buying, which keeps the asking price grounded.'],
    ['chart', 'Valuation guidance', 'Comparable sales and an honest view of a fair price before you set your ceiling.'],
    ['lock', 'Escrow handling', 'We arrange a licensed escrow service so neither side pays or transfers on trust.'],
    ['transfer', 'Transfer support', 'We guide the registrar change and point the domain wherever you need it.'],
  ];
  const fees = `<section class="hp-section hp-section--tint" id="fees" aria-labelledby="br-fee-h"><div class="hp-container br-fees">
    <div class="br-feebox" data-reveal>
      <span class="br-feebox__k">Simple, success-based pricing</span>
      <h2 id="br-fee-h">${pair(cfg.feeUsd)} to start, ${pctTxt} only on success</h2>
      <div class="br-feebox__grid">
        <div class="br-fee"><b class="num">${show(cfg.feeUsd)}</b><span>Service fee</span><small>One-time and non-refundable. Covers research, valuation and owner outreach.</small></div>
        <div class="br-fee br-fee--gold"><b class="num">${pctTxt}</b><span>Success commission</span><small>Of the agreed purchase price, minimum ${conv ? show(cfg.minUsd) : minTxt}. Only charged if a deal closes.</small></div>
      </div>
      <p class="br-feebox__note">${icon('info')}<span>${esc(curNote)} The purchase price itself is paid by you to the seller, through escrow.</span></p>
    </div>
    <div class="br-exs" data-reveal>
      <h3 class="br-exs__h">Two worked examples</h3>
      ${exRow(exA, cA)}${exRow(exB, cB)}
      <p class="br-exs__note">Illustrative prices only. Escrow service charges and any registrar transfer fee are quoted before you commit.</p>
    </div>
    <div class="br-inc" data-reveal>
      <h3>Included in every request</h3>
      <ul>${included.map(([ic, h, p]) => `<li>${hexIcon(ic)}<div><b>${esc(h)}</b><span>${esc(p)}</span></div></li>`).join('')}</ul>
    </div>
  </div></section>`;

  // ---- request form
  const defCur = (BROKER_CURRENCIES as readonly string[]).includes(cur) ? cur : 'USD';
  const field = (id: string, label: string, input: string, o: { req?: boolean; hint?: string; wide?: boolean } = {}) =>
    `<div class="br-field${o.wide ? ' br-field--wide' : ''}" data-field="${id}"><label for="br-${id}">${esc(label)}${o.req ? ' <span class="br-req" aria-hidden="true">*</span>' : ' <span class="br-opt">optional</span>'}</label>${input}${o.hint ? `<p class="br-hint" id="br-${id}-hint">${esc(o.hint)}</p>` : ''}<p class="br-err" id="br-${id}-err" hidden></p></div>`;
  const inp = (id: string, type: string, extra = '') => `<input class="hp-input" id="br-${id}" name="${id}" type="${type}" ${extra} aria-describedby="br-${id}-err">`;
  const budget = `<fieldset class="br-field br-field--wide br-budget" data-field="budget_max" aria-describedby="br-budget-hint"><legend>Your budget for the domain <span class="br-req" aria-hidden="true">*</span></legend>
      <div class="br-budget__row">
        <label class="br-budget__cur"><span class="sr-only">Currency</span><select class="hp-select" name="currency" id="br-currency">${BROKER_CURRENCIES.map((c) => `<option${c === defCur ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="br-budget__in" data-field="budget_min"><span>Minimum</span><input class="hp-input" id="br-budget_min" name="budget_min" type="text" inputmode="decimal" autocomplete="off" maxlength="14" placeholder="500" aria-describedby="br-budget_min-err"></label>
        <label class="br-budget__in"><span>Maximum</span><input class="hp-input" id="br-budget_max" name="budget_max" type="text" inputmode="decimal" autocomplete="off" maxlength="14" placeholder="2,500" required aria-describedby="br-budget_max-err"></label>
      </div>
      <p class="br-hint" id="br-budget-hint">The purchase price you are willing to pay the owner, before our fees. We never share it with the seller.</p>
      <p class="br-err" id="br-budget_min-err" hidden></p><p class="br-err" id="br-budget_max-err" hidden></p>
    </fieldset>`;
  const form = `<form class="br-form" action="/api/broker-request" method="post" data-br-form novalidate aria-labelledby="br-form-h">
    <h2 id="br-form-h" class="br-form__h">Start your broker request</h2>
    <p class="br-form__lead">Fields marked <span class="br-req" aria-hidden="true">*</span><span class="sr-only">with an asterisk</span> are required. Nothing is charged by sending this form.</p>
    ${err ? `<p class="br-alert" role="alert">${icon('alert')}${esc(err)}</p>` : '<p class="br-alert" role="alert" data-br-alert hidden></p>'}
    <div class="br-grid">
      ${field('domain', 'Domain you want', inp('domain', 'text', `inputmode="url" autocapitalize="off" spellcheck="false" required maxlength="253" placeholder="yourbrand.com" value="${esc(want)}"`), { req: true, wide: true })}
      ${budget}
      ${field('name', 'Your name', inp('name', 'text', 'autocomplete="name" required minlength="2" maxlength="80"'), { req: true })}
      ${field('email', 'Email', inp('email', 'email', 'autocomplete="email" required maxlength="120"'), { req: true })}
      ${field('phone', 'WhatsApp number', inp('phone', 'tel', 'autocomplete="tel" inputmode="tel" maxlength="30" placeholder="+971 50 000 0000"'), { hint: 'With your country code. Updates are faster on WhatsApp.' })}
      ${field('use', 'Intended use', `<select class="hp-select" id="br-use" name="use"><option value="">Choose one</option>${USES.map((u) => `<option>${esc(u)}</option>`).join('')}</select>`)}
      ${field('notes', 'Notes for your broker', `<textarea class="hp-input br-ta" id="br-notes" name="notes" aria-describedby="br-notes-hint br-notes-err" rows="4" maxlength="2000" placeholder="For example: a deadline, other names you would accept, or anything you already know about the owner."></textarea>`, { wide: true, hint: 'Optional. Please do not include passwords or payment details.' })}
      <div class="br-field br-field--wide" data-field="consent">
        <label class="br-consent"><input type="checkbox" name="consent" value="yes" required aria-describedby="br-consent-err"><span class="br-consent__bx">${icon('check')}</span><span>I understand the ${esc(feeTxt)} service fee is non-refundable, the ${esc(pctTxt)} commission (minimum ${esc(minTxt)}) is charged only if a deal closes, and the owner may decline to sell.</span></label>
        <p class="br-err" id="br-consent-err" hidden></p>
      </div>
    </div>
    <div class="br-hp" aria-hidden="true"><label for="br-cu">Leave this empty</label><input id="br-cu" name="company_url" type="text" tabindex="-1" autocomplete="off"></div>
    <input type="hidden" name="t" value="" data-br-t>
    ${['utm_source', 'utm_medium', 'utm_campaign', 'referrer'].map((k) => `<input type="hidden" name="${k}" value="" data-br-${k.replace('_', '-')}>`).join('')}
    <div class="br-submit"><button class="hp-btn hp-btn--brand hp-btn--lg" type="submit" data-br-btn>${icon('arrow')}<span>Send broker request</span></button>
      <p>We reply within one business day. ${email ? `Prefer email? Write to <a href="mailto:${esc(email)}">${esc(email)}</a>.` : ''}</p></div>
  </form>`;
  const payHtml = (url: string) => `<a class="hp-btn hp-btn--brand hp-btn--lg" href="${esc(url)}" data-br-pay>${icon('card')}<span>Pay the ${esc(feeTxt)} service fee to start</span></a>`;
  const curId = cat.currencyIds?.[cat.currency];
  const payUrl = pid ? `${cat.base}/cart.php?a=add&pid=${pid}${curId ? `&currency=${curId}` : ''}` : '';
  const realRef = ref && ref !== 'received' ? ref : '';
  const done = `<div class="br-done" data-br-done${ref ? '' : ' hidden'} tabindex="-1" role="status">
    ${hexIcon('check')}
    <h2>Request received</h2>
    <p data-br-refline${realRef ? '' : ' hidden'}>Your reference is <b class="num" data-br-ref>${esc(realRef)}</b>. Quote it in any message to us.</p>
    <div class="br-done__pay" data-br-paywrap${payUrl ? '' : ' hidden'}>${payUrl ? payHtml(payUrl) : payHtml('#')}<p>Your broker starts research as soon as the fee is paid. ${esc(curNote)}</p></div>
    <p class="br-done__wait" data-br-wait${payUrl ? ' hidden' : ''}>We'll email or WhatsApp you within 1 business day to confirm the details and send the fee invoice.</p>
    <div class="hp-actions">${link('Search for another domain', '/domains-registration')}${wa ? link('Message us on WhatsApp', wa, 'whatsapp') : ''}</div>
  </div>`;
  const side = `<aside class="br-side" aria-labelledby="br-side-h">
    <h2 id="br-side-h">What happens next</h2>
    <ol class="br-next">${[
      ['Within one business day', 'Your broker confirms the request and sends the service fee invoice.'],
      ['Research', 'Ownership, history and comparable sales, with a view on a realistic price.'],
      ['Anonymous outreach', 'We contact the owner and report every reply and counter-offer to you.'],
      ['Your decision', 'Nothing is agreed without your approval, and you can stop at any time.'],
    ].map(([h, p], i) => `<li><span class="num" aria-hidden="true">${i + 1}</span><div><b>${esc(h)}</b><span>${esc(p)}</span></div></li>`).join('')}</ol>
    <div class="br-side__fee"><div><span>Service fee</span><b class="num">${show(cfg.feeUsd)}</b></div><div><span>On success</span><b class="num">${pctTxt}<small> min ${show(cfg.minUsd)}</small></b></div></div>
  </aside>`;
  const main = `<section class="hp-section br-sec" id="request" aria-label="Broker request"><div class="hp-container br-wrap">
    <div class="br-card">${ref ? '' : form}${done}</div>
    ${side}
  </div></section>`;

  // ---- FAQ (honest)
  const faqs = [
    { q: 'Can you guarantee the owner will sell?', a: 'No. Some owners do not reply, and some will not sell at any price. We research the owner, make contact through every channel we can find and negotiate in good faith, but nobody can guarantee a sale. If the owner refuses, we tell you and the request is closed.' },
    { q: `Is the ${feeTxt} service fee refundable?`, a: `No. The service fee pays for the research, valuation and outreach work, which starts as soon as it is paid, so it is non-refundable whatever the outcome.` },
    { q: 'When do I pay the commission?', a: `Only if a deal closes. The commission is ${pctTxt} of the agreed purchase price, with a minimum of ${minTxt}, and is invoiced once you and the owner agree a price. If no deal is reached, there is no commission.` },
    { q: 'Who pays the purchase price?', a: 'You do. The price agreed with the owner is paid by you, through escrow, and is separate from our fees. We never ask you to pay the seller directly.' },
    { q: 'How does escrow work?', a: 'We use a licensed escrow service. You pay the purchase price to the escrow company, the seller transfers the domain, and the escrow company releases the money to the seller only after the domain is confirmed in your account. Escrow charges are quoted before you commit.' },
    { q: 'How long does it take?', a: 'It varies. Some owners reply within days; others take weeks or need several follow-ups. A straightforward purchase often completes in two to six weeks, and the transfer itself usually takes a few days once payment is in escrow. Your broker keeps you updated throughout.' },
    { q: 'Will the owner know who I am?', a: 'No. We approach the owner on your behalf without naming you or your company, which helps stop the price rising just because of who is asking.' },
  ];
  const faqSec = `<section class="hp-section" aria-labelledby="br-faq-h"><div class="hp-container br-faq">
    ${sectionHead({ id: 'br-faq-h', title: 'Domain broker questions', align: 'left' })}${faq(faqs, { id: 'br-faq', single: true })}
  </div></section>`;
  const cta = ctaBand({ id: 'br-cta', title: 'Happy with a different name?', text: 'Search hundreds of extensions with the first-year and renewal price shown upfront.',
    primary: { label: 'Search available domains', href: '/domains-registration' }, secondary: { label: 'Start a broker request', href: '#request' } });

  const service = ld({ '@context': 'https://schema.org', '@type': 'Service', name: 'Domain broker service', serviceType: 'Domain name acquisition', url: `${site}/domain-broker`,
    provider: { '@type': 'Organization', '@id': `${site}/#organization`, name: 'GlobalHostia', url: `${site}/` }, areaServed: 'Worldwide',
    offers: { '@type': 'Offer', price: cfg.feeUsd.toFixed(2), priceCurrency: 'USD', description: `Non-refundable service fee. ${pctTxt} commission on the agreed price (minimum ${minTxt}) only if a deal closes.` } });
  return page({
    ctx, catalog: cat, path: '/domain-broker', title: ctx.route.title, description: ctx.route.description,
    css: ['broker'], js: ['broker'], noindex: !!(ref || err),
    canonical: `${site}/domain-broker`,
    jsonLd: [breadcrumbJsonLd(crumbs, site), faqJsonLd(faqs), service],
    body: [hero, trustStrip(s), process, fees, main, faqSec, cta].join('\n'),
  });
}
