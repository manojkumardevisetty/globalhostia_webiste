// SSL certificates: animated "Not secure → https" browser hero, DV/OV/EV explainer with a chooser,
// live certificate products, issuance steps, FAQ.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { getCatalog, productsFor, fromPrice, orderUrl, type TProduct, type Catalog } from '../data';
import { page } from '../shell';
import {
  pageHero, sectionHead, splitHead, planCards, plansNote, featureGrid, faq, faqJsonLd, ctaBand, breadcrumbJsonLd, ld, icon, link,
  available, type FeatureItem,
} from '../ui';

/** Light display clean-up for CA product names synced from WHMCS ("Positivessl Dv" → "PositiveSSL DV"). */
function prettyName(n: string) {
  return n
    .replace(/\b(\w+?)ssl\b/gi, (_m, a: string) => `${a[0].toUpperCase()}${a.slice(1).toLowerCase()}SSL`)
    .replace(/\bSsl(\d*)\b/g, 'SSL$1')
    .replace(/\b(Dv|Ov|Ev)\b/g, (m) => m.toUpperCase())
    .replace(/\bGeotrust\b/g, 'GeoTrust').replace(/\bBusinessid\b/g, 'BusinessID').replace(/\bFlex\b/g, '(Flex)');
}

type Level = 'dv' | 'ov' | 'ev';
const levelOf = (p: TProduct): Level => {
  const t = [p.name, ...p.features.filter((f) => !f.trim().startsWith('-'))].join(' ');
  if (/extended validat|\bEV\b/i.test(t)) return 'ev';
  if (/organi[sz]ation validat|\bOV\b|business ?id/i.test(t)) return 'ov';
  return 'dv';
};
const has = (p: TProduct, re: RegExp) => p.features.some((f) => !f.trim().startsWith('-') && re.test(f));

/** Product + Offer JSON-LD for priced products only. */
function offersLd(ps: TProduct[], cat: Catalog, site: string, kind: string) {
  const items = ps.map((p) => ({ p, f: fromPrice(p, cat.currency) })).filter((x) => x.f);
  if (!items.length) return '';
  return ld({ '@context': 'https://schema.org', '@type': 'ItemList', name: kind, itemListElement: items.map((x, i) => ({
    '@type': 'ListItem', position: i + 1, item: { '@type': 'Product', name: x.p.name, description: x.p.tagline || x.p.description || undefined, url: `${site}/p/${x.p.slug}`,
      offers: { '@type': 'Offer', price: x.f!.price.toFixed(2), priceCurrency: cat.currency, url: orderUrl(x.p, cat.base, x.f!.cycle), availability: 'https://schema.org/InStock' } },
  })) });
}

/** Hero visual: browser bar flips from "Not secure http://" to padlock "https://"; certificate card slides in. */
function browserDemo(host: string) {
  return `<div class="ssl-demo" data-ssl-demo role="img" aria-label="Illustration: after an SSL certificate is installed, the browser address bar changes from Not secure to a padlock with https, and the warning disappears.">
  <div class="ssl-win" aria-hidden="true">
    <div class="ssl-chrome">
      <span class="ssl-dots"><i></i><i></i><i></i></span>
      <div class="ssl-bar">
        <span class="ssl-badge"><span class="ssl-badge__bad">${icon('alert')}Not secure</span><span class="ssl-badge__ok">${icon('lock')}</span></span>
        <span class="ssl-url"><span class="ssl-proto"><span class="ssl-proto__http">http://</span><span class="ssl-proto__https">https://</span></span><span class="ssl-host">${esc(host)}</span><span class="ssl-path">/checkout</span></span>
      </div>
    </div>
    <div class="ssl-page">
      <div class="ssl-msgs"><div class="ssl-warn">${icon('alert')}<div><b>Your connection is not private</b><span>Information you send on this page could be read by others.</span></div></div><div class="ssl-okmsg">${icon('lock')}<div><b>Connection is secure</b><span>Details you enter are encrypted on the way to ${esc(host)}.</span></div></div></div>
      <div class="ssl-sk"><i style="width:46%"></i><i style="width:72%"></i><i style="width:58%"></i></div>
      <div class="ssl-form">
        <div class="ssl-field"><span>Email</span><i></i></div>
        <div class="ssl-field"><span>Card details</span><i></i><b class="ssl-field__lock">${icon('lock')}</b></div>
        <div class="ssl-pay">Pay securely</div>
      </div>
    </div>
  </div>
  <div class="ssl-cert" aria-hidden="true">
    <div class="ssl-cert__head"><span class="ssl-seal">${icon('shield')}</span><div><b>Certificate</b><span>Valid</span></div></div>
    <dl>
      <div><dt>Issued to</dt><dd>${esc(host)}</dd></div>
      <div><dt>Validation</dt><dd>Domain (DV)</dd></div>
      <div><dt>Encryption</dt><dd>256-bit TLS</dd></div>
    </dl>
    <div class="ssl-cert__hs"><i></i><i></i><i></i><span>Handshake complete</span></div>
  </div>
  <span class="ssl-illu" aria-hidden="true">Illustration</span>
</div>`;
}

const LEVELS: { id: Level; name: string; short: string; checks: string; who: string; time: string; shows: string; depth: number }[] = [
  { id: 'dv', name: 'Domain Validated', short: 'DV', depth: 1,
    checks: 'That you control the domain, by email, a DNS record or a file on your website.',
    who: 'Blogs, portfolios, landing pages and internal tools.',
    time: 'Usually within minutes of completing the check.',
    shows: 'The padlock and https. No company details in the certificate.' },
  { id: 'ov', name: 'Organization Validated', short: 'OV', depth: 2,
    checks: 'Domain control, plus that your organization legally exists, using public business records.',
    who: 'Company websites, client portals and sites with logins or forms.',
    time: 'Usually 1 to 3 business days, depending on how quickly the documents check out.',
    shows: 'The padlock, plus your company name in the certificate details.' },
  { id: 'ev', name: 'Extended Validation', short: 'EV', depth: 3,
    checks: 'Everything in OV, plus a stricter review of your legal, physical and operational existence.',
    who: 'Banks, large stores and brands that are common phishing targets.',
    time: 'Usually several business days, as the review is the most thorough.',
    shows: 'The padlock, plus your verified legal name and location in the certificate details.' },
];

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const { currency, base } = cat;
  const site = String(cat.settings.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const raw = available(productsFor(cat, ctx.route.categories));
  const products = raw.map((p) => ({ ...p, name: prettyName(p.name) }));
  const count: Record<Level, number> = { dv: 0, ov: 0, ev: 0 };
  products.forEach((p) => { count[levelOf(p)]++; });
  const wildcard = products.filter((p) => has(p, /wildcard/i));
  const brands = [...new Set(products.flatMap((p) => p.features.map((f) => f.match(/^(\w+) trusted brand/i)?.[1]).filter(Boolean) as string[]))];
  const warranties = products.flatMap((p) => p.features.map((f) => f.match(/\$([\d,]+)\s*warranty/i)?.[1]).filter(Boolean) as string[])
    .map((s) => +s.replace(/,/g, '')).filter((n) => n > 0);
  const wMin = warranties.length ? Math.min(...warranties) : 0, wMax = warranties.length ? Math.max(...warranties) : 0;
  const usd = (n: number) => `$${n.toLocaleString('en-US')}`;
  const host = 'yourbrand.com';

  const crumbs = [{ label: 'Home', href: '/' }, { label: ctx.route.title }];
  const levelList = (['dv', 'ov', 'ev'] as Level[]).filter((l) => count[l]).map((l) => l.toUpperCase());

  /* hero */
  const hero = pageHero({
    crumbs, eyebrow: 'SSL certificates',
    title: 'Turn "Not secure" into a padlock your visitors trust.',
    lead: `${products.length ? `${products.length} certificates from ${brands.length ? brands.join(', ').replace(/, ([^,]+)$/, ' and $1') : 'trusted authorities'}` : 'Certificates from trusted authorities'}, from quick domain validation to verified company details. Encrypt every form, login and checkout on your site.`,
    ctas: [{ label: 'Compare certificates', href: '#plans' }, { label: 'DV, OV or EV?', href: '#levels', variant: 'ghost' }],
    trust: ['256-bit encryption', levelList.length ? `${levelList.join(' and ')} certificates` : 'Domain and business validation', wildcard.length ? 'Wildcard options' : 'Free reissues'],
    visualHtml: browserDemo(host),
  });

  /* plans */
  const plans = `<section class="hp-section" id="plans" aria-labelledby="plans-h"><div class="hp-container">
    ${sectionHead({ id: 'plans-h', title: 'Choose your certificate', lead: 'Every certificate encrypts traffic the same way. What changes is how much the authority verifies about you, how many hostnames it covers, and the warranty behind it.' })}
    ${planCards(products, { currency, base, id: 'ssl-plans', highlight: false, orderLabel: 'Order certificate',
      note: 'One-year certificates. Prices and longer terms are confirmed in the order form.',
      emptyTitle: 'Certificates are being updated', emptyText: 'Our certificate list is being refreshed. Tell us which domain you need to secure and we will send you options.' })}
    ${plansNote(currency, link('Already host with us? Free SSL is included', '/web-hosting'))}
  </div></section>`;

  /* DV / OV / EV */
  const availTag = (l: Level) => count[l]
    ? `<a class="ssl-avail" href="#plans">${icon('check')}${count[l]} ${count[l] === 1 ? 'certificate' : 'certificates'} below</a>`
    : `<a class="ssl-avail is-ask" href="/contact">${icon('chat')}Ask our team</a>`;
  const levels = `<section class="hp-section hp-section--tint" id="levels" aria-labelledby="levels-h"><div class="hp-container">
    ${splitHead({ id: 'levels-h', title: 'DV, OV or EV: what the letters mean', lead: 'All three give you the padlock and the same strength of encryption. They differ in what the certificate authority checks before it vouches for you.' })}
    <div class="ssl-chooser" data-reveal>
      <p id="ssl-q">What are you securing?</p>
      <div class="ssl-chooser__opts" role="radiogroup" aria-labelledby="ssl-q" data-ssl-chooser>
        <button type="button" role="radio" aria-checked="false" data-pick="dv" data-why="Domain validation is all a personal or content site needs: visitors get the padlock and their connection is encrypted.">A blog or personal site</button>
        <button type="button" role="radio" aria-checked="false" data-pick="dv" data-why="${esc(wildcard.length ? `A wildcard DV certificate covers ${host} and every first-level subdomain, such as shop. or app., with one certificate.` : 'A domain validated certificate per hostname is the simplest way to cover several subdomains.')}">Many subdomains</button>
        <button type="button" role="radio" aria-checked="false" data-pick="ov" data-why="Organization validation puts your verified company name in the certificate, which matters when people sign in or send you details.">A company site with logins or forms</button>
        <button type="button" role="radio" aria-checked="false" data-pick="${count.ev ? 'ev' : 'ov'}" data-why="${esc(count.ev ? 'Extended validation is the most thorough check, for brands that handle payments and are likely phishing targets.' : 'For stores and payments, choose organization validation so your verified company name is in the certificate. Ask our team if you need extended validation.')}">An online store or payments</button>
      </div>
      <p class="ssl-chooser__why" aria-live="polite" data-ssl-why>Pick one to see which level fits.</p>
    </div>
    <div class="ssl-levels" data-ssl-levels>${LEVELS.map((l, i) => `
      <article class="ssl-level" data-level="${l.id}" data-reveal style="--i:${i}">
        <header><span class="ssl-depth" role="img" aria-label="Validation depth ${l.depth} of 3">${[1, 2, 3].map((d) => `<i class="${d <= l.depth ? 'on' : ''}"></i>`).join('')}</span>
          <h3><b>${l.short}</b>${esc(l.name)}</h3></header>
        <dl>
          <div><dt>What is checked</dt><dd>${esc(l.checks)}</dd></div>
          <div><dt>Best for</dt><dd>${esc(l.who)}</dd></div>
          <div><dt>Issuance time</dt><dd>${esc(l.time)}</dd></div>
          <div><dt>What visitors can see</dt><dd>${esc(l.shows)}</dd></div>
        </dl>
        <footer>${availTag(l.id)}<span class="ssl-match">${icon('check')}Good fit</span></footer>
      </article>`).join('')}
    </div>
    <p class="ssl-foot" data-reveal>Issuance times are typical for each validation level and depend on the certificate authority and how quickly checks are completed.</p>
  </div></section>`;

  /* how issuance works */
  const steps = [
    { t: 'Order your certificate', d: 'Pick the validation level and coverage you need. You can order for a site hosted with us or anywhere else.' },
    { t: 'Create a signing request', d: 'Generate a CSR in your control panel. It pairs the certificate with a private key that never leaves your server.' },
    { t: 'Prove you own the domain', d: 'Confirm by email, a DNS record or a file upload. For OV, the authority also checks your company records.' },
    { t: 'Install and switch to https', d: 'Install the issued certificate, redirect http to https, and set a reminder to renew before it expires.' },
  ];
  const how = `<section class="hp-section" aria-labelledby="how-h"><div class="hp-container">
    ${sectionHead({ id: 'how-h', title: 'How issuance works', lead: 'Four steps from order to padlock. Our support team can help with the CSR and installation on Globalhostia hosting.' })}
    <ol class="ssl-steps" data-ssl-steps data-reveal>${steps.map((s, i) => `<li style="--i:${i}"><span class="ssl-steps__n num" aria-hidden="true">${i + 1}</span><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></li>`).join('')}</ol>
  </div></section>`;

  /* benefits */
  const feats: FeatureItem[] = [
    { icon: 'lock', title: '256-bit encryption', text: 'Logins, forms and payments travel encrypted between the browser and your server.' },
    { icon: 'eye', title: 'No browser warnings', text: 'Browsers mark plain http pages as Not secure. With a certificate, visitors see the padlock instead.' },
    { icon: 'trend', title: 'HTTPS for search', text: 'Search engines treat HTTPS as a ranking signal, and modern browser features require it.' },
    { icon: 'award', title: brands.length ? `${brands.join(', ').replace(/, ([^,]+)$/, ' and $1')} brands` : 'Trusted authorities', text: 'Certificates from long-established authorities, recognised by all major browsers and devices.' },
    { icon: 'refresh', title: 'Free reissues', text: 'Changed servers or lost the private key? Reissue the certificate during its validity at no cost.' },
    ...(wildcard.length ? [{ icon: 'layers', title: 'Wildcard coverage', text: `${wildcard.length} ${wildcard.length === 1 ? 'certificate covers' : 'certificates cover'} unlimited subdomains, so new subdomains are secured without a new order.` }] : []),
    ...(wMax ? [{ icon: 'shield', title: 'Warranty protection', text: wMin !== wMax ? `Warranties from ${usd(wMin)} up to ${usd(wMax)}, set by the certificate authority for each product.` : `A ${usd(wMax)} warranty from the certificate authority.` }] : []),
    ...(products.some((p) => has(p, /site seal/i)) ? [{ icon: 'tag', title: 'Site seal', text: 'Display the authority seal on checkout and contact pages to show visitors the site is verified.' }] : []),
    { icon: 'headset', title: 'Help installing', text: 'Our engineers answer by phone, email and ticket, around the clock, if you get stuck on a CSR or install.' },
  ];
  const benefits = `<section class="hp-section hp-section--dark hp-on-dark" aria-labelledby="ben-h"><div class="hp-container">
    ${splitHead({ id: 'ben-h', title: 'What a certificate does for your site', lead: 'Encryption is the baseline. Trust, search visibility and fewer abandoned checkouts follow.' })}
    ${featureGrid(feats.slice(0, 9))}
  </div></section>`;

  /* FAQ */
  const faqs = [
    { q: 'I already have free SSL with my hosting. Why buy a certificate?', a: 'The free certificate included with our hosting is domain validated and encrypts your site perfectly well. A paid certificate adds what free ones do not: organization validation with your company name, wildcard coverage for subdomains, a warranty from the authority, a site seal and longer support from the issuer.' },
    { q: 'Which certificate do I need for subdomains?', a: 'A standard certificate covers one hostname (usually with and without www). A wildcard certificate covers the domain and every first-level subdomain, such as shop.yourbrand.com and app.yourbrand.com, under one certificate.' },
    { q: 'How long does issuance take?', a: 'Domain validated certificates are usually issued within minutes of completing the email, DNS or file check. Organization validated certificates usually take one to three business days while the authority checks your company records.' },
    { q: 'Can I use the certificate on a server that is not hosted with Globalhostia?', a: 'Yes. Certificates are not tied to our hosting. Generate a CSR on your own server, complete validation and install the issued files there.' },
    { q: 'What happens when the certificate expires?', a: 'Browsers will show a security warning on your site. Renew before the expiry date and install the renewed certificate; we send renewal reminders to the email on your account.' },
    { q: 'Does a certificate change how fast my site loads?', a: 'Modern TLS adds very little overhead, and HTTPS enables HTTP/2 and HTTP/3 in browsers, which often makes pages load faster overall.' },
  ];
  const faqSec = `<section class="hp-section" aria-labelledby="faq-h"><div class="hp-container ssl-faq">
    ${sectionHead({ id: 'faq-h', title: 'SSL questions, answered', align: 'left', lead: 'Still unsure which certificate fits? Our team will recommend one.' })}
    ${faq(faqs, { id: 'ssl-faq', single: true })}
  </div></section>`;

  const cta = ctaBand({ id: 'cta', title: 'Secure your site today', text: 'Order a certificate, validate your domain and switch to https. We help with the install.',
    primary: { label: 'Compare certificates', href: '#plans' }, secondary: { label: 'Talk to our team', href: '/contact' } });

  return page({
    ctx, catalog: cat, path: `/${ctx.slug}`, title: ctx.route.title, description: ctx.route.description, css: ['ssl'], js: ['ssl'],
    jsonLd: [breadcrumbJsonLd(crumbs.map((c) => ({ ...c, href: c.href || `/${ctx.slug}` })), site), faqJsonLd(faqs), offersLd(products, cat, site, 'SSL certificates')].filter(Boolean),
    body: [hero, plans, levels, how, benefits, faqSec, cta].join('\n'),
  });
}
