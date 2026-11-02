// /ae-domains: the UAE country domain. Live .ae price from `tlds` (else "See price"), a search box that defaults
// to .ae, plain-language eligibility notes (kept generic, no legal claims), steps and FAQ with FAQPage JSON-LD.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { money } from '../../pricing';
import { getCatalog, pricedTlds, currencyPrefix, domainCartUrl, type TTld } from '../data';
import { page } from '../shell';
import { breadcrumbs, breadcrumbJsonLd, domainSearch, sectionHead, faq, faqJsonLd, ctaBand, icon, hexIcon, link, ld } from '../ui';
import { trustStrip, waLink } from '../growth';
import { siteOf } from './vps';

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const { base, settings: s } = cat;
  const prefix = currencyPrefix(cat) || '$';
  const site = siteOf(cat);
  const tlds = pricedTlds(cat);
  const ae = tlds.find((t) => t.tld === '.ae');
  const aeAny = ae || cat.tlds.find((t) => t.tld === '.ae'); // listed, maybe without a price in this currency
  const m = (v: number | null | undefined) => (v === null || v === undefined ? '' : money(v, prefix));
  const others = ['.com', '.co', '.net', '.org', '.shop', '.store'].map((x) => tlds.find((t) => t.tld === x)).filter((t): t is TTld => !!t);
  const search: TTld[] = [...(ae ? [{ ...ae, featured: true }] : []), ...others.map((t) => ({ ...t, featured: true }))];
  const orderAe = domainCartUrl(base, '');
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Domains', href: '/domains-registration' }, { label: '.ae domains' }];
  const wa = waLink(s, 'Hello Globalhostia, I would like to register a .ae domain.');

  const priceCard = `<div class="ae-price" aria-labelledby="ae-price-h">
    <div class="ae-price__tld" aria-hidden="true">.ae</div>
    <h2 id="ae-price-h" class="sr-only">.ae price</h2>
    ${ae ? `<dl class="ae-price__rows num">
      <div><dt>First year</dt><dd><b>${esc(m(ae.register))}</b></dd></div>
      ${ae.renew !== null ? `<div><dt>Renews at</dt><dd>${esc(m(ae.renew))} / year</dd></div>` : ''}
      ${ae.transfer !== null ? `<div><dt>Transfer in</dt><dd>${esc(m(ae.transfer))}</dd></div>` : ''}
    </dl><p class="ae-price__note">Live price in ${esc(cat.currency)} from our billing system. +VAT 5% where applicable.</p>`
    : `<p class="ae-price__na"><a class="hp-btn hp-btn--light" href="${esc(orderAe)}">See price</a></p><p class="ae-price__note">${aeAny ? 'The .ae price in your currency is shown in the order form.' : 'Search a name below and the live .ae price is shown before you pay.'}</p>`}
  </div>`;

  const hero = `<section class="hp-hero hp-hero--page ae-hero" aria-labelledby="ae-h1">
  <div class="hp-hero__hex" aria-hidden="true"></div>
  <div class="ae-flag" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
  <div class="hp-container">
    <div class="hp-hero__copy">
      ${breadcrumbs(crumbs)}
      <span class="hp-kicker"><i aria-hidden="true"></i>The UAE country domain</span>
      <h1 id="ae-h1" data-words>A .ae domain for your UAE business</h1>
      <p class="hp-lead">Show customers in the Emirates that you are local. Search for your name, see the live price, and let our Dubai team help with the registry requirements.</p>
    </div>
    <div class="hp-hero__visual">${priceCard}</div>
  </div>
</section>
<section class="hp-domain ae-search" aria-labelledby="ae-q-h"><div class="hp-container">${domainSearch({ tlds: search, base, id: 'ae-q', title: 'Search for your .ae name', max: 5, prefix,
    typing: ['yourcompany.ae', 'dubaistore.ae', 'mybrand.ae', 'alnoor.ae'], note: ae ? `First-year prices in ${cat.currency}. The .ae renewal is ${m(ae.renew) || 'shown before you pay'}.` : 'The live .ae price is shown in the order form before you pay.' })}</div></section>`;

  const why = [
    { ic: 'pin', h: 'Instantly reads as local', p: 'Customers in the UAE recognise .ae as a business based here, which helps on adverts, packaging and shop fronts.' },
    { ic: 'search', h: 'Shorter names are often free', p: 'Many short, memorable words that are long gone in .com can still be available in .ae.' },
    { ic: 'shield', h: 'A registry with rules', p: 'Eligibility checks make .ae harder to squat than open extensions, so your name is better protected.' },
    { ic: 'mail', h: 'Email on your own name', p: 'Use you@yourcompany.ae for business email, and keep your .com pointing to the same site if you have one.' },
  ];
  const whySec = `<section class="hp-section" aria-labelledby="ae-why-h"><div class="hp-container">
    ${sectionHead({ id: 'ae-why-h', title: 'Why businesses choose .ae', lead: 'A country domain tells visitors where you trade before they read a word.' })}
    <ul class="ae-why">${why.map((w, i) => `<li data-reveal style="--i:${i}">${hexIcon(w.ic)}<h3>${esc(w.h)}</h3><p>${esc(w.p)}</p></li>`).join('')}</ul>
  </div></section>`;

  const req = `<section class="hp-section hp-section--tint" aria-labelledby="ae-req-h"><div class="hp-container ae-req">
    <div class="ae-req__intro" data-reveal>
      <h2 id="ae-req-h" class="hp-hline hp-h2">Who can register a .ae domain?</h2>
      <p class="hp-lead">The .ae registry sets its own eligibility rules, and they can change. In general:</p>
    </div>
    <ul class="ae-req__list" data-reveal>
      <li>${icon('check')}<div><b>A presence in the UAE may be required</b><span>For example a UAE trade licence, or a local contact or representative in the Emirates.</span></div></li>
      <li>${icon('check')}<div><b>The name may need to relate to you</b><span>Such as your company name, a trading name or a trademark you hold.</span></div></li>
      <li>${icon('check')}<div><b>Documents can be requested</b><span>If the registry asks for proof, we tell you exactly what is needed and submit it for you.</span></div></li>
      <li>${icon('info')}<div><b>We check before you pay</b><span>Not sure you qualify? Ask us first and we will confirm the current requirements for your case.</span></div></li>
    </ul>
    <p class="ae-req__note">${icon('info')}This is a plain-language summary, not legal advice. The registry's current policy always applies.</p>
  </div></section>`;

  const steps = `<section class="hp-section" aria-labelledby="ae-steps-h"><div class="hp-container">
    ${sectionHead({ id: 'ae-steps-h', title: 'From search to live in three steps' })}
    <ol class="ae-steps">${[
      ['search', 'Search and order', 'Find an available name above and add it to your cart. You see the first-year and renewal price before paying.'],
      ['book', 'Confirm eligibility', 'If the registry needs details or documents, our team asks you in a ticket and handles the submission.'],
      ['globe', 'Point it anywhere', 'Use our nameservers with your hosting and email, or point the domain to any service you already use.'],
    ].map(([ic, h, p], i) => `<li data-reveal style="--i:${i}"><span class="ae-steps__n num">${i + 1}</span>${hexIcon(ic)}<h3>${esc(h)}</h3><p>${esc(p)}</p></li>`).join('')}</ol>
    <p class="ae-links">${link('Web hosting in Dubai', '/web-hosting-dubai')}${link('Business email on your domain', '/google-workspace')}${link('All domain prices', '/domains-registration#pricing')}</p>
  </div></section>`;

  const faqs = [
    { q: 'How much does a .ae domain cost?', a: ae ? `A .ae domain is ${m(ae.register)} for the first year${ae.renew !== null ? ` and renews at ${m(ae.renew)} a year` : ''}, in ${cat.currency}, before VAT where it applies. The price is live from our billing system and confirmed in the order form.` : 'The live .ae price is shown in our order form before you pay, together with the renewal price.' },
    { q: 'Do I need a UAE trade licence to register .ae?', a: 'Often, a presence in the UAE is required, such as a UAE trade licence or a local contact. The exact rules are set by the .ae registry and can change, so ask us and we will confirm what applies to you before you order.' },
    { q: 'Can I register .ae as an individual?', a: 'The registry rules decide this, and they can differ for individuals and companies. Contact us with your details and we will check the current policy for you.' },
    { q: 'How long does .ae registration take?', a: 'Many .ae names activate soon after payment. If the registry asks for documents it can take longer, and our team keeps you updated in your ticket.' },
    { q: 'Can I transfer my existing .ae domain to Globalhostia?', a: 'Yes. Get the transfer code from your current registrar and start a transfer from our domains page. Your website and email stay online during the transfer.' },
    { q: 'Should I also register the .com?', a: 'If it is available, registering both and pointing them to the same site protects your brand and catches visitors who type .com out of habit.' },
  ];
  const faqSec = `<section class="hp-section hp-section--tint" aria-labelledby="ae-faq-h"><div class="hp-container ae-faq">
    ${sectionHead({ id: 'ae-faq-h', title: '.ae domain questions', align: 'left' })}${faq(faqs, { id: 'ae-faq', single: true })}
  </div></section>`;

  const cta = ctaBand({ title: 'Not sure if you qualify for .ae?', text: 'Send us your company name and we will check the current registry requirements with you before you pay.',
    primary: wa ? { label: 'Ask on WhatsApp', href: wa, icon: 'whatsapp' } : { label: 'Contact us', href: '/contact' }, secondary: { label: 'Search a .ae name', href: '#ae-q', attrs: 'data-focus-domain' } });

  const offer = ae ? ld({ '@context': 'https://schema.org', '@type': 'Product', name: '.ae domain registration', description: 'Registration of a .ae (United Arab Emirates) domain name for one year.',
    brand: { '@type': 'Organization', name: s.site_name || 'Globalhostia' },
    offers: { '@type': 'Offer', price: ae.register!.toFixed(2), priceCurrency: cat.currency, url: `${site}/ae-domains`, availability: 'https://schema.org/InStock' } }) : '';
  return page({
    ctx, catalog: cat, path: '/ae-domains', title: ctx.route.title, description: ctx.route.description, css: ['aedomains'],
    jsonLd: [breadcrumbJsonLd(crumbs, site), faqJsonLd(faqs), offer].filter(Boolean),
    body: [hero, trustStrip(s), whySec, req, steps, faqSec, cta].join('\n'),
  });
}
