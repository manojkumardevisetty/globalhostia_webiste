// /sell-domains: "Sell your domain on GlobalHostia" — requirements (the domain must be registered with GlobalHostia and
// active in the seller's account), fees (admin settings, shown in USD; the invoice uses the account currency), the process,
// seller terms and FAQ. The listing itself is created in the portal (/account/sell). Also exports the band shown on
// /premium-domains. Styles: public/hp/pages/sell.css.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { getCatalog, whmcsBase } from '../data';
import { page } from '../shell';
import { pageHero, sectionHead, faq, faqJsonLd, breadcrumbJsonLd, icon, hexIcon, ld, ctaBand } from '../ui';
import { trustStrip } from '../growth';
import { siteOf, crumbsFor } from './vps';
import { normalizeSell, SELL_KEY, transferUrl, type SellConfig } from '../../sell/core';
import { fmtMoney } from '../../premium/core';

export const SELL_PATH = '/sell-domains';
const usd = (n: number) => fmtMoney(n, 'USD');

const STEPS = (c: SellConfig) => [
  { ic: 'globe', h: 'Have the domain with us', p: 'The domain must be registered with GlobalHostia and active in your account. With another registrar? Transfer it to us first.' },
  { ic: 'pen', h: 'Set your price', p: 'Choose a fixed price or make-an-offer, a minimum offer and a short description. It takes two minutes in your account.' },
  { ic: 'card', h: `Pay ${usd(c.listingFeeUsd)} per domain`, p: `One invoice in your account currency, for one year of listing. Featured is +${usd(c.featuredFeeUsd)}. Several domains go on one invoice.` },
  { ic: 'check', h: 'We review and publish', p: 'Usually within one business day. Your domain then appears on our premium domains page, featured ones first.' },
  { ic: 'transfer', h: 'We handle the sale', p: `Our broker confirms the buyer, payment goes through escrow and we move the domain between GlobalHostia accounts.${c.commissionPct > 0 ? ` ${c.commissionPct}% commission is deducted from your payout.` : ''}` },
];

function faqs(c: SellConfig) {
  return [
    { q: 'Why must my domain be registered with GlobalHostia?', a: 'Because we deliver the domain to the buyer. With the domain in your GlobalHostia account, we can confirm you own it, keep the listing honest, and move it safely to the buyer\'s account once the payment has cleared. If your domain is elsewhere, transfer it to us first; a transfer usually takes 5 to 7 days and adds a year to the registration.' },
    { q: 'What does it cost?', a: `${usd(c.listingFeeUsd)} per domain for one year of listing, plus ${usd(c.featuredFeeUsd)} per domain if you want it Featured for the same year. ${c.commissionPct > 0 ? `When your domain sells, a ${c.commissionPct}% commission${c.commissionMinUsd > 0 ? ` (minimum ${usd(c.commissionMinUsd)})` : ''} is deducted from the payout. ` : ''}Fees are charged by an invoice in your account currency (for example AED or EUR); nothing is paid on this website.` },
    { q: 'How long does a listing stay up?', a: 'One year from approval. We email you 30, 7 and 1 day before it ends with a link to renew. If you do not renew, the listing is hidden until you do; a paid renewal adds another year without a new review, unless you changed the description.' },
    { q: 'What does Featured do?', a: 'Featured domains are shown first on the premium domains page and in the premium names row on our homepage, for the rest of the listing year. You can add Featured when you list a domain or later.' },
    { q: 'Who talks to the buyer?', a: 'Our broker team. Buyers send a Buy now request or an offer; we email you about it without sharing the buyer\'s details, confirm the deal with you, collect the payment through escrow, then move the domain to the buyer and pay you.' },
    { q: 'Can I change the price or withdraw?', a: 'Yes, at any time from your account. Price changes apply at once; a new description is shown after a quick review. You can withdraw a listing whenever you like; fees already paid are not refunded.' },
    { q: 'What if my listing is not approved?', a: c.refundPolicy },
    { q: 'What happens if I transfer the domain away or it expires?', a: 'We check every listed domain daily. If it leaves your GlobalHostia account, expires or is no longer active, the listing is hidden and we email you. Renew or bring the domain back and ask us to restore it.' },
  ];
}

const terms = (c: SellConfig) => [
  'You own the domain, or are authorised by its owner, and have the right to sell it.',
  'The domain does not infringe a trademark or anyone else\'s rights. Names that contain well-known brands are reviewed by hand and may be refused.',
  'The domain stays registered with GlobalHostia, active and renewed in your account while it is listed. You do not sell or transfer it elsewhere while a sale with us is in progress.',
  'The listing fee buys one year of listing from approval and is not refunded once approved. Featured runs until the end of the same year.',
  ...(c.commissionPct > 0 ? [`When a sale completes through us, a ${c.commissionPct}% commission on the sale price${c.commissionMinUsd > 0 ? ` (minimum ${usd(c.commissionMinUsd)})` : ''} is deducted from your payout.`] : []),
  'GlobalHostia may edit or remove a listing that is misleading, or refuse one, and handles buyers, escrow and the move of the domain.',
  c.refundPolicy,
];

/** Band for /premium-domains: "Sell your domain with us". */
export function sellBand(c: SellConfig) {
  if (!c.enabled) return '';
  return `<section class="hp-section" aria-labelledby="sl-band-h"><div class="hp-container"><div class="sl-band" data-reveal>
    <div class="sl-band__t">
      <span class="sl-band__k">${icon('tag')}For domain owners</span>
      <h2 id="sl-band-h">Sell your domain with us</h2>
      <p>List a domain from your GlobalHostia account next to these names. You set the price; our broker team handles buyers, escrow and the transfer.</p>
      <ul class="sl-band__facts">
        <li><b class="num">${esc(usd(c.listingFeeUsd))}</b><span>per domain, one year</span></li>
        <li><b class="num">+${esc(usd(c.featuredFeeUsd))}</b><span>to feature it first</span></li>
        ${c.commissionPct > 0 ? `<li><b class="num">${esc(String(c.commissionPct))}%</b><span>commission only when it sells</span></li>` : ''}
      </ul>
    </div>
    <div class="sl-band__a"><a class="hp-btn hp-btn--brand hp-btn--lg" href="/account/sell/new">${icon('plus')}<span>List a domain</span></a><a class="hp-link" href="${SELL_PATH}">How selling works${icon('arrow')}</a></div>
  </div></div></section>`;
}

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const s = cat.settings, site = siteOf(cat);
  const c = normalizeSell((s as any)[SELL_KEY]);
  const crumbs = crumbsFor('Sell your domain', { label: 'Premium domains', href: '/premium-domains' });
  const base = whmcsBase(s);
  const visual = `<div class="sl-cert" aria-hidden="true">
    <span class="sl-cert__k">${icon('tag')}Your listing</span>
    <span class="sl-cert__d"><b>yourbrand</b><i>.com</i></span>
    <dl><div><dt>Asking price</dt><dd>You decide</dd></div><div><dt>Listed for</dt><dd>1 year</dd></div><div><dt>Buyers</dt><dd>Handled by our broker</dd></div></dl>
  </div>`;
  const hero = pageHero({
    crumbs, eyebrow: 'Sell your domain',
    title: 'Sell your domain to the right buyer.',
    lead: `List domains from your GlobalHostia account in our premium domains marketplace for ${usd(c.listingFeeUsd)} per domain a year. You set the price; we handle buyers, escrow and the transfer.`,
    ctas: [{ label: 'List a domain', href: '/account/sell/new', icon: 'arrow' }, { label: 'See the requirements', href: '#requirements', variant: 'ghost' }],
    visualHtml: visual, network: false,
  });
  const req = `<section class="hp-section" id="requirements" aria-labelledby="sl-req-h"><div class="hp-container sl-req">
    <div class="sl-req__t">${sectionHead({ id: 'sl-req-h', title: 'One requirement: the domain is with GlobalHostia', lead: 'You can list a domain only while it is registered with us and active in your own account. That is what lets us check ownership and hand the domain to the buyer safely.', align: 'left' })}
      <ul class="sl-ticks">
        <li>${icon('check')}<span>Registered with GlobalHostia, in the account you sign in with</span></li>
        <li>${icon('check')}<span>Status Active, and not expiring in the next ${esc(String(c.minExpiryDays))} days (renew it first)</span></li>
        <li>${icon('check')}<span>Not listed already, and kept in your account while listed (we check daily)</span></li>
      </ul></div>
    <div class="sl-xfer" data-reveal>
      ${hexIcon('transfer')}
      <h3>Domain with another registrar?</h3>
      <p>Transfer it to GlobalHostia first. You need the transfer (EPP) code from your current registrar; the transfer adds a year to the registration.</p>
      <form method="get" action="${esc(base)}/cart.php" class="sl-xfer__f"><input type="hidden" name="a" value="add"><input type="hidden" name="domain" value="transfer">
        <label class="sr-only" for="sl-xq">Domain to transfer</label><input class="hp-input" id="sl-xq" name="query" placeholder="yourname.com" required maxlength="253" autocomplete="off" spellcheck="false" autocapitalize="none" inputmode="url">
        <button class="hp-btn hp-btn--brand" type="submit">${icon('transfer')}<span>Transfer it to GlobalHostia</span></button></form>
      <p class="sl-xfer__n">Opens our secure order page (${esc(transferUrl(base, 'yourname.com').replace(/^https?:\/\//, '').split('/')[0])}).</p>
    </div>
  </div></section>`;
  const fees = `<section class="hp-section hp-section--tint" id="fees" aria-labelledby="sl-fee-h"><div class="hp-container">
    ${sectionHead({ id: 'sl-fee-h', title: 'Simple fees, per domain', lead: 'Charged by an invoice in your account currency. Nothing is paid on this website.' })}
    <div class="sl-fees">
      <div class="sl-fee" data-reveal><span class="sl-fee__k">Listing</span><b class="num">${esc(usd(c.listingFeeUsd))}</b><span>per domain, for one year from approval. Renew for the same fee.</span></div>
      <div class="sl-fee sl-fee--gold" data-reveal style="--i:1"><span class="sl-fee__k">${icon('star')}Featured</span><b class="num">+${esc(usd(c.featuredFeeUsd))}</b><span>per domain: shown first in the marketplace and on our homepage, for the listing year.</span></div>
      <div class="sl-fee" data-reveal style="--i:2"><span class="sl-fee__k">When it sells</span><b class="num">${c.commissionPct > 0 ? `${esc(String(c.commissionPct))}%` : 'No commission'}</b><span>${c.commissionPct > 0 ? `commission on the sale price${c.commissionMinUsd > 0 ? ` (minimum ${esc(usd(c.commissionMinUsd))})` : ''}, deducted from your payout.` : 'You receive the agreed price.'}</span></div>
    </div>
    <p class="sl-fees__n">Amounts in US dollars; your invoice shows the same fees in your account currency.</p>
  </div></section>`;
  const how = `<section class="hp-section" aria-labelledby="sl-how-h"><div class="hp-container">
    ${sectionHead({ id: 'sl-how-h', title: 'How selling works', lead: 'Five steps. You stay in control of the price; we do the rest.' })}
    <ol class="sl-steps">${STEPS(c).map((x, i) => `<li data-reveal style="--i:${i}"><span class="sl-steps__n num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>${hexIcon(x.ic as any)}<h3>${esc(x.h)}</h3><p>${esc(x.p)}</p></li>`).join('')}</ol>
  </div></section>`;
  const termsSec = `<section class="hp-section hp-section--tint" id="terms" aria-labelledby="sl-terms-h"><div class="hp-container sl-terms">
    <h2 id="sl-terms-h" class="hp-hline">Seller terms</h2>
    <p>By listing a domain you confirm that:</p>
    <ol>${terms(c).map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
  </div></section>`;
  const fq = faqs(c);
  const faqSec = `<section class="hp-section" aria-labelledby="sl-faq-h"><div class="hp-container sl-faq">${sectionHead({ id: 'sl-faq-h', title: 'Selling questions', align: 'left' })}${faq(fq, { id: 'sl-faq', single: true })}</div></section>`;
  const cta = ctaBand({ id: 'sl-cta', title: 'Ready to list your domain?', text: `${usd(c.listingFeeUsd)} per domain for a year. Sign in, pick the domain and set your price.`, primary: { label: 'List a domain', href: '/account/sell/new' }, secondary: { label: 'Browse premium domains', href: '/premium-domains' } });
  const service = ld({ '@context': 'https://schema.org', '@type': 'Service', name: 'Sell your domain on GlobalHostia', url: `${site}${SELL_PATH}`, serviceType: 'Domain name marketplace listing',
    provider: { '@type': 'Organization', '@id': `${site}/#organization`, name: 'GlobalHostia' }, areaServed: 'Worldwide',
    offers: [{ '@type': 'Offer', name: 'Listing (1 year)', price: c.listingFeeUsd.toFixed(2), priceCurrency: 'USD' }, { '@type': 'Offer', name: 'Featured upgrade', price: c.featuredFeeUsd.toFixed(2), priceCurrency: 'USD' }] });
  const howTo = ld({ '@context': 'https://schema.org', '@type': 'HowTo', name: 'How to sell your domain on GlobalHostia', step: STEPS(c).map((x, i) => ({ '@type': 'HowToStep', position: i + 1, name: x.h, text: x.p })) });
  return page({
    ctx, catalog: cat, path: SELL_PATH, title: ctx.route.title, description: ctx.route.description,
    css: ['sell'], canonical: `${site}${SELL_PATH}`,
    jsonLd: [breadcrumbJsonLd(crumbs, site), faqJsonLd(fq), service, howTo],
    body: [hero, trustStrip(s), req, fees, how, termsSec, faqSec, cta].join('\n'),
  });
}
