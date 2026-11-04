// /domain-transfer: move a domain you already own to GlobalHostia. Transfer form handing off to the WHMCS transfer
// order (cart.php?a=add&domain=transfer&query=), the four steps, a pre-transfer checklist, what is included, live
// transfer prices from `tlds` (synced from WHMCS; the section is left out when none are priced) and an FAQ with
// FAQPage + BreadcrumbList JSON-LD. Registry rules differ by extension, so the copy says "most" / "where the registry
// applies it" and never promises a fixed time or a free transfer. Styles: public/hp/pages/domains.css (transfer form and
// flow illustration) + public/hp/pages/domaintransfer.css.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { money } from '../../pricing';
import { getCatalog, pricedTlds, currencyPrefix, whmcsLinks, type TTld } from '../data';
import { page } from '../shell';
import { breadcrumbs, breadcrumbJsonLd, sectionHead, splitHead, featureGrid, faq, faqJsonLd, ctaBand, icon, link } from '../ui';
import { siteOf } from './vps';

/** Extensions shown first in the price table (then the rest of the priced ones, in catalog order). */
const POPULAR = ['.com', '.net', '.org', '.co', '.io', '.ai', '.ae', '.info', '.biz', '.shop', '.store', '.online', '.xyz', '.app', '.dev', '.tech'];
const MAX_ROWS = 12;

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const { base, currency } = cat;
  const prefix = currencyPrefix(cat) || '$';
  const site = siteOf(cat);
  const m = (v: number | null) => (v === null ? '' : money(v, prefix));
  const transferAction = whmcsLinks(base).cart; // GET cart.php?a=add&domain=transfer&query=<domain> (the existing "Transfer a domain" target)
  const q = (ctx.query.get('domain') || ctx.query.get('q') || '').trim().toLowerCase().slice(0, 80);
  const value = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(q) ? q : '';

  // live transfer prices (WHMCS TLD sync): only extensions that have a transfer price in this currency
  const withTransfer = pricedTlds(cat).filter((t) => t.transfer !== null);
  const rank = (t: TTld) => (POPULAR.indexOf(t.tld) + 1) || 99;
  const rows = [...withTransfer].sort((a, b) => rank(a) - rank(b)).slice(0, MAX_ROWS);

  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Domains', href: '/domains-registration' }, { label: 'Domain transfer' }];

  const form = (id: string, label: string) => `<form class="dom-tform dt-form" action="${esc(transferAction)}" method="get" data-domain-form aria-label="${esc(label)}">
          <input type="hidden" name="a" value="add"><input type="hidden" name="domain" value="transfer">
          <label class="sr-only" for="${id}">Domain to transfer</label>
          <input id="${id}" class="hp-input" name="query" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="yourdomain.com" value="${esc(value)}" required aria-describedby="${id}-note">
          <button class="hp-btn hp-btn--brand" type="submit">${icon('transfer')}Start transfer</button>
        </form>`;

  /* ---------------- hero ---------------- */
  const flow = `<div class="dom-flow" data-pause data-reveal role="img" aria-label="Illustration: a domain moves from your current registrar to GlobalHostia through unlock, authorize and approve steps.">
        <div class="dom-flow__end"><span>${icon('server')}</span><b>Current registrar</b></div>
        <div class="dom-flow__track" aria-hidden="true">
          <i class="dom-flow__line"></i><i class="dom-flow__fill"></i>
          <span class="dom-flow__cp" style="--p:16.6%">${icon('unlock')}<em>Unlock</em></span>
          <span class="dom-flow__cp" style="--p:50%">${icon('key')}<em>Authorize</em></span>
          <span class="dom-flow__cp" style="--p:83.3%">${icon('check')}<em>Approve</em></span>
          <span class="dom-flow__rider"><span class="dom-flow__chip">${icon('globe')}yourbrand.com</span></span>
        </div>
        <div class="dom-flow__end is-us"><span>${icon('shield')}</span><b>GlobalHostia</b></div>
      </div>`;
  const hero = `<section class="hp-hero hp-hero--page dt-hero" aria-labelledby="dt-h1">
  <div class="hp-hero__hex" aria-hidden="true"></div>
  <div class="hp-container">
    <div class="hp-hero__copy">
      ${breadcrumbs(crumbs)}
      <span class="hp-kicker"><i aria-hidden="true"></i>Domain transfer</span>
      <h1 id="dt-h1" data-words>Transfer your domain to GlobalHostia</h1>
      <p class="hp-lead">Keep your name, your website and your email. Only the company that manages the registration changes, and your domains, hosting and email end up in one client area.</p>
      ${form('dt-q', 'Start a domain transfer')}
      <p class="dt-note" id="dt-q-note">Enter the domain you own. You add the authorization (EPP) code in the next step${rows.length ? ', and the transfer price is shown before you pay' : ' and see the transfer price before you pay'}.</p>
    </div>
    <div class="hp-hero__visual">${flow}</div>
  </div>
</section>`;

  /* ---------------- steps ---------------- */
  const steps = [
    { ic: 'unlock', h: 'Unlock the domain', p: 'At your current registrar, turn off the transfer lock (sometimes called registrar lock or client transfer prohibited).' },
    { ic: 'key', h: 'Get the EPP or auth code', p: 'Request the authorization code from your current registrar. It is a password for the domain that proves you may move it.' },
    { ic: 'transfer', h: 'Start the transfer here', p: 'Enter the domain above, add the code in the order form and check out. We then send the request to the registry.' },
    { ic: 'mail', h: 'Approve the transfer email', p: 'Your current registrar may email the domain contact to confirm. Approving it can let the transfer finish sooner.' },
  ];
  const stepsSec = `<section class="hp-section" id="steps" aria-labelledby="dt-steps-h"><div class="hp-container">
    ${sectionHead({ id: 'dt-steps-h', title: 'How a domain transfer works', lead: 'Four steps, most of them at your current registrar. We are on hand by ticket and WhatsApp if any of them gets stuck.' })}
    <ol class="dt-steps">${steps.map((s, i) => `<li data-reveal style="--i:${i}"><span class="dt-steps__n num" aria-hidden="true">${i + 1}</span><span class="dt-steps__ic">${icon(s.ic)}</span><h3>${esc(s.h)}</h3><p>${esc(s.p)}</p></li>`).join('')}</ol>
    <p class="dt-time">${icon('clock')}<span><b>How long it takes:</b> most transfers of generic domains such as .com complete within 5 to 7 days of the request. The registry's rules set the timing, so some extensions, including many country-code domains, can be faster or slower.</span></p>
  </div></section>`;

  /* ---------------- checklist ---------------- */
  const checks = [
    ['Older than 60 days', 'Generic domains usually cannot move within 60 days of being registered or transferred. Country-code domains have their own rules.'],
    ['Contact email up to date', 'Approval messages go to the domain contact, so make sure that address is one you can read.'],
    ['DNS records copied', 'If your current registrar also runs your DNS, note your records (or keep its nameservers) so the website and email stay online.'],
    ['Not expired', 'A domain that has expired or is in a redemption period usually has to be renewed or restored at the current registrar first.'],
  ];
  const checklist = `<section class="hp-section hp-section--tint" aria-labelledby="dt-prep-h"><div class="hp-container dt-prep">
    <div class="dt-prep__intro" data-reveal>
      <h2 id="dt-prep-h" class="hp-hline hp-h2">Before you start</h2>
      <p class="hp-lead">A few quick checks prevent nearly every delayed transfer.</p>
      <p class="dt-prep__more">${link('Step-by-step guide with screenshots', '/help/transfer-a-domain')}</p>
    </div>
    <ul class="dt-prep__list" data-reveal>${checks.map(([h, p]) => `<li>${icon('check')}<div><b>${esc(h)}</b><span>${esc(p)}</span></div></li>`).join('')}</ul>
  </div></section>`;

  /* ---------------- included ---------------- */
  const included = `<section class="hp-section" aria-labelledby="dt-inc-h"><div class="hp-container">
    ${sectionHead({ id: 'dt-inc-h', title: 'What you get when the domain arrives', lead: 'The same controls as every domain registered with us.' })}
    ${featureGrid([
      { icon: 'calendar', title: 'A year added where it applies', text: 'For most generic extensions, the registry adds one year to the registration when the transfer completes. Some country-code extensions work differently; we confirm before you pay.' },
      { icon: 'database', title: 'DNS management', text: 'Edit A, CNAME, MX and TXT records to point your domain at any website, email or service.' },
      { icon: 'net', title: 'Custom nameservers', text: 'Use our nameservers or keep your own, for example an external DNS or CDN provider.' },
      { icon: 'lock', title: 'Transfer lock', text: 'Keep the domain locked against unauthorized transfers, and unlock it only when you decide to move.' },
      { icon: 'bell', title: 'Renewal reminders', text: 'Email reminders before expiry, with auto-renew so your name never lapses by accident.' },
      { icon: 'grid', title: 'One client area', text: 'Domains, hosting, email and invoices together, with one login.' },
    ], { cols: 3 })}
  </div></section>`;

  /* ---------------- prices (live, WHMCS) ---------------- */
  const prices = rows.length ? `<section class="hp-section hp-section--tint" id="pricing" aria-labelledby="dt-price-h"><div class="hp-container">
    ${splitHead({ id: 'dt-price-h', title: 'Transfer prices by extension', lead: 'Live from our billing system. The renewal price applies from the next renewal.' })}
    <div class="dom-grid" data-reveal>
      <div class="dom-table-wrap">
        <table class="dom-table dt-table">
          <caption class="sr-only">Domain transfer and renewal prices in ${esc(currency)}</caption>
          <thead><tr><th scope="col">Extension</th><th scope="col">Transfer in</th><th scope="col">Renews at</th></tr></thead>
          <tbody>${rows.map((t) => `<tr>
            <th scope="row"><span class="dom-tld">${esc(t.tld)}</span></th>
            <td data-label="Transfer in"><b class="num">${esc(m(t.transfer))}</b></td>
            <td data-label="Renews at"><span class="num">${t.renew !== null ? `${esc(m(t.renew))}<span class="dom-per"> / year</span>` : '<span class="hp-muted">Shown at checkout</span>'}</span></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
      <p class="dom-grid__note"><span class="hp-live"><i aria-hidden="true"></i>Prices in ${esc(currency)}. Taxes may apply at checkout.</span></p>
    </div>
    ${withTransfer.length > rows.length ? `<p class="dt-more">${link(`Transfer prices for all ${withTransfer.length} extensions`, '/domains-registration#pricing')}</p>` : ''}
  </div></section>` : '';

  /* ---------------- FAQ ---------------- */
  const faqs = [
    { q: 'How long does a domain transfer take?', a: 'Most transfers of generic domains such as .com, .net and .org complete within 5 to 7 days of the request. Approving the confirmation email from your current registrar can make it faster. Each registry sets its own rules, so some country-code domains take a different amount of time.' },
    { q: 'Will my website or email go offline during the transfer?', a: 'No, as long as the DNS keeps working. If your nameservers stay the same, nothing changes for visitors. If your current registrar also hosts your DNS, copy the records first or keep its nameservers until the transfer completes.' },
    { q: 'What is an EPP or authorization code?', a: 'It is a password for your domain, issued by your current registrar. It proves you are allowed to move the domain and is required to start the transfer. You enter it in our order form.' },
    { q: 'Does a transfer extend my registration?', a: 'For most generic extensions, yes: the registry adds one year to the current expiry date when the transfer completes, so you do not lose the time you already paid for. Some country-code extensions do not add a year or follow other rules; we confirm what applies to your domain before you pay.' },
    { q: 'Can I transfer a domain I registered recently?', a: 'Generic domains usually cannot be transferred within 60 days of registration or a previous transfer. Country-code domains have their own rules. If you are not sure, ask us and we will check your domain.' },
    { q: 'How much does a domain transfer cost?', a: rows.length ? 'It depends on the extension. The table above shows the live transfer price for popular extensions, and the exact price for your domain is shown in the order form before you pay.' : 'It depends on the extension. The exact transfer price for your domain is shown in the order form before you pay.' },
    { q: 'Do I need hosting with GlobalHostia to transfer my domain?', a: 'No. You can transfer only the domain and keep pointing it to any website or email provider. You can add hosting or business email later from the same client area.' },
  ];
  const faqSec = `<section class="hp-section${rows.length ? '' : ' hp-section--tint'}" aria-labelledby="dt-faq-h"><div class="hp-container dt-faq">
    ${sectionHead({ id: 'dt-faq-h', title: 'Domain transfer questions', align: 'left' })}
    ${faq(faqs, { id: 'dt-faq', single: true })}
    <p class="dt-more">${link('More answers in the help center', '/help-center')}</p>
  </div></section>`;

  const cta = ctaBand({ id: 'dt-cta', title: 'Ready to move your domain?', text: 'Enter the domain, add the code from your current registrar and we take it from there.',
    primary: { label: 'Start a transfer', href: '#dt-q', attrs: 'data-focus-domain' }, secondary: { label: 'Talk to our team', href: '/contact' } });

  return page({
    ctx, catalog: cat, path: '/domain-transfer', title: ctx.route.title, description: ctx.route.description, css: ['domains', 'domaintransfer'],
    jsonLd: [breadcrumbJsonLd(crumbs.map((c) => ({ ...c, href: c.href || '/domain-transfer' })), site), faqJsonLd(faqs)],
    body: [hero, stepsSec, checklist, included, prices, faqSec, cta].join('\n'),
  });
}
