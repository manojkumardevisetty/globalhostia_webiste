// Arabic section (/ar, /ar/<english-slug>): one module for every Arabic page. Copy comes from lib/i18n/ar-pages.ts
// (owner-editable in Admin → Arabic pages); prices, plans, TLDs, premium listings and fees come from the same synced
// catalog and the same building blocks (planCards, domainSearch, faq, ctaBand, itemListLd …) as the English pages.
// The shared chrome those helpers print in English (shell header/footer, plan cards, cycle switch …) is localised by
// lib/i18n/ar-chrome.ts after rendering, so no English renderer had to change. RTL styles: public/hp/pages/ar.css.
import { domainToUnicode } from 'node:url';
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { money } from '../../pricing';
import { getCatalog, productsFor, minFrom, fromPrice, deriveSpecs, pricedTlds, currencyPrefix, domainCartUrl, whmcsLinks, whmcsBase, type Catalog, type TProduct, type TTld } from '../data';
import { page } from '../shell';
import { pageHero, sectionHead, featureGrid, planCards, plansNote, domainSearch, faq, faqJsonLd, ctaBand, breadcrumbJsonLd, icon, hexIcon, ld, available, type Cta, type IconName } from '../ui';
import { trustPoints, waLink, TRUST_DEFAULTS } from '../growth';
import { itemListLd } from '../../agents/ld';
import { arDefForThemeSlug, arPage, arPathOf, hreflangLinks, enabledArDefs, AR_DEFS, type ArDef, type ArQA } from '../../i18n/ar-pages';
import { arabizeHtml, arLocation, AR_TRUST } from '../../i18n/ar-chrome';

const siteOf = (cat: Catalog) => String(cat.settings.site_url || 'https://globalhostia.com').replace(/\/$/, '');
const HOME = { label: 'الرئيسية', href: '/ar' };
/** Arabic font (public/hp/fonts, @font-face in ar.css): preload the regular weight used above the fold. */
const FONT = '<link rel="preload" as="font" type="font/woff2" href="/hp/fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2" crossorigin>';

type Built = { body: string; faqs?: ArQA[]; ld?: string[]; css?: string[]; js?: string[]; noindex?: boolean };
type Ctx = { cat: Catalog; def: ArDef; ctx: PageCtx; site: string; wa: (t: string) => string; links: Map<string, string> };

/** Arabic trust strip: only the claims that are switched on AND still worded as the default (an edited English claim
 *  could say something the Arabic default does not, so it is left out rather than mistranslated). */
function trustStripAr(cat: Catalog) {
  const on = trustPoints(cat.settings).filter((p) => p.on && AR_TRUST[p.id] && p.text === TRUST_DEFAULTS.find((d) => d.id === p.id)?.text);
  if (!on.length) return '';
  const items = on.map((p) => {
    const [b, rest] = AR_TRUST[p.id];
    const inner = `${icon(p.icon)}<span class="hp-trustbar__t"><b>${esc(b)}</b>${rest ? `<span>${esc(rest)}</span>` : ''}</span>`;
    return `<li>${p.href ? `<a href="${esc(p.href)}">${inner}</a>` : `<div>${inner}</div>`}</li>`;
  }).join('');
  return `<section class="hp-trustbar hp-trustbar--tint" aria-label="لماذا يختار العملاء GlobalHostia"><div class="hp-container"><ul style="--n:${on.length}">${items}</ul></div></section>`;
}
const trustOnAr = (cat: Catalog, id: string) => trustPoints(cat.settings).some((p) => p.id === id && p.on);

const pointsSec = (x: Ctx, tint = false) => x.def.copy.points.length ? `<section class="hp-section${tint ? ' hp-section--tint' : ''}" aria-labelledby="ar-pts-h"><div class="hp-container">
  ${sectionHead({ id: 'ar-pts-h', title: x.def.copy.pointsTitle })}${featureGrid(x.def.copy.points.map((p) => ({ icon: p.icon as IconName, title: p.h, text: p.p })), { cols: x.def.copy.points.length === 4 ? 4 : x.def.copy.points.length === 2 ? 2 : 3 })}
</div></section>` : '';
const faqSec = (x: Ctx, qs: ArQA[]) => qs.length ? `<section class="hp-section hp-section--tint" aria-labelledby="ar-faq-h"><div class="hp-container ar-faq">
  ${sectionHead({ id: 'ar-faq-h', title: x.def.copy.faqTitle })}${faq(qs, { id: 'ar-faq', single: true })}</div></section>` : '';
function cta(x: Ctx, secondary?: Cta) {
  const w = x.wa(`مرحباً GlobalHostia، لدي استفسار عن: ${x.def.copy.crumb}`);
  return ctaBand({ title: x.def.copy.ctaTitle, text: x.def.copy.ctaText,
    primary: w ? { label: 'راسلنا على واتساب', href: w, icon: 'whatsapp' } : { label: 'تواصل معنا', href: '/ar/contact' },
    secondary: secondary || { label: 'تواصل معنا', href: '/ar/contact' } });
}
const relLinks = (x: Ctx, slugs: string[]) => {
  const ds = slugs.map((s) => AR_DEFS.find((d) => d.slug === s)).filter((d): d is ArDef => !!d && x.links.has(d.en));
  return ds.length ? `<nav class="ar-rel" aria-label="صفحات ذات صلة">${ds.map((d) => `<a class="hp-link" href="${esc(arPathOf(d))}">${esc(arPage(d, x.cat.settings.ar_pages).copy.crumb)}${icon('arrow')}</a>`).join('')}</nav>` : '';
};
const UNIT_AR: Record<string, string> = { monthly: '/ شهر', quarterly: '/ 3 أشهر', semiannually: '/ 6 أشهر', annually: '/ سنة', biennially: '/ سنتان', triennially: '/ 3 سنوات' };
/** "AED 12.00 / شهر" for a product (the same price fromText() shows on the English pages), '' when unpriced. */
function fromTextAr(p: TProduct, currency: string) {
  const f = fromPrice(p, currency);
  return f ? `${money(f.price, f.prefix)}${UNIT_AR[f.cycle] ? ` ${UNIT_AR[f.cycle]}` : ''}` : '';
}
/** Cheapest priced product of a set. */
function cheapest(cat: Catalog, ps: TProduct[]) {
  const f = minFrom(available(ps), cat.currency);
  return f ? available(ps).find((x) => minFrom([x], cat.currency)?.amount === f.amount) || null : null;
}
/** "from AED 12.00 / شهر" for a product set ('' when unpriced). */
function fromLine(cat: Catalog, ps: TProduct[], what: string) {
  const p = cheapest(cat, ps);
  return p ? `${esc(what)} <b class="num">${esc(fromTextAr(p, cat.currency))}</b>` : '';
}
const locations = (ps: TProduct[]) => [...new Set(ps.map((p) => deriveSpecs(p.features, p.attributes).location).filter(Boolean))] as string[];
const joinAr = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join('، ')} و${xs[xs.length - 1]}` : xs[0] || '');
const tldMoney = (cat: Catalog, v: number | null | undefined) => (v === null || v === undefined ? '' : money(v, currencyPrefix(cat) || '$'));

function hero(x: Ctx, o: { ctas?: Cta[]; fromHtml?: string; visualHtml?: string; crumbs?: boolean } = {}) {
  const c = x.def.copy;
  return pageHero({ crumbs: o.crumbs === false ? undefined : [HOME, { label: c.crumb }], eyebrow: c.kicker, title: c.title, lead: c.lead,
    ctas: o.ctas, fromHtml: o.fromHtml, visualHtml: o.visualHtml, network: !o.visualHtml });
}

/* ------------------------------------------------------------------ home */
async function home(x: Ctx): Promise<Built> {
  const { cat } = x;
  const tlds = pricedTlds(cat);
  const pick = ['.com', '.ae', '.net', '.org', '.co'].map((t) => tlds.find((d) => d.tld === t)).filter((t): t is TTld => !!t).map((t) => ({ ...t, featured: true }));
  const search = `<section class="hp-domain ar-dsearch" aria-labelledby="ar-q-h"><div class="hp-container">${domainSearch({ tlds: pick.length ? pick : tlds.slice(0, 5), base: cat.base, id: 'ar-q', title: 'ابحث عن نطاقك', max: 5, prefix: currencyPrefix(cat) || '$',
    typing: ['yourcompany.ae', 'dubaistore.com', 'mybrand.ae', 'alnoor.com'], note: `أسعار السنة الأولى بعملة ${cat.currency}. يظهر سعر التجديد قبل الدفع.`, moreHref: '/ar/domains-registration' })}</div></section>`;
  // one tile per Arabic product page, "from" price straight from the catalog (no price → no number)
  const tiles: { slug: string; ic: IconName; from: string }[] = [
    { slug: 'web-hosting', ic: 'globe', from: fromLine(cat, productsFor(cat, AR_DEFS.find((d) => d.slug === 'web-hosting')!.categories), 'تبدأ من') },
    { slug: 'vps-hosting', ic: 'server', from: fromLine(cat, productsFor(cat, ['hostiavps']), 'تبدأ من') },
    { slug: 'dedicated-servers', ic: 'cpu', from: fromLine(cat, productsFor(cat, AR_DEFS.find((d) => d.slug === 'dedicated-servers')!.categories), 'تبدأ من') },
    { slug: 'domains-registration', ic: 'at', from: (() => { const t = tlds.find((d) => d.tld === '.com'); return t ? `.com <b class="num">${esc(tldMoney(cat, t.register))}</b> للسنة الأولى` : ''; })() },
    { slug: 'ae-domains', ic: 'pin', from: (() => { const t = tlds.find((d) => d.tld === '.ae'); return t ? `<b class="num">${esc(tldMoney(cat, t.register))}</b> للسنة الأولى` : ''; })() },
    { slug: 'google-workspace', ic: 'mail', from: fromLine(cat, productsFor(cat, ['business-email']), 'تبدأ من') },
    { slug: 'ssl-certificate', ic: 'lock', from: fromLine(cat, productsFor(cat, ['ssl-certificates']), 'تبدأ من') },
    { slug: 'free-migration', ic: 'move', from: '' },
    { slug: 'connectors', ic: 'bot', from: '' },
  ];
  const cards = tiles.map((t) => ({ t, d: AR_DEFS.find((d) => d.slug === t.slug)! })).filter(({ d }) => x.links.has(d.en)).map(({ t, d }, i) => {
    const c = arPage(d, cat.settings.ar_pages).copy;
    return `<li data-reveal style="--i:${i % 3}"><a class="ar-tile" href="${esc(arPathOf(d))}">${hexIcon(t.ic)}<span class="ar-tile__t"><b>${esc(c.crumb)}</b><span>${esc(c.kicker)}</span>${t.from ? `<em>${t.from}</em>` : ''}</span>${icon('arrow')}</a></li>`;
  }).join('');
  const prod = `<section class="hp-section" aria-labelledby="ar-prod-h"><div class="hp-container">
    ${sectionHead({ id: 'ar-prod-h', title: 'خدماتنا', lead: 'الأسعار معروضة مباشرة من نظام الفوترة لدينا، وتتغير تلقائياً عند تحديثها.' })}
    <ul class="ar-tiles">${cards}</ul></div></section>`;
  const body = [
    hero(x, { crumbs: false, ctas: [{ label: 'خطط الاستضافة', href: '/ar/web-hosting', icon: 'arrow' }, { label: 'سجّل نطاقاً', href: '#ar-q', variant: 'ghost', attrs: 'data-focus-domain' }] }),
    search, trustStripAr(cat), prod, pointsSec(x, true), faqSec(x, x.def.copy.faqs),
    cta(x, { label: 'اعرض جميع الخطط', href: '/ar/web-hosting' }),
  ].join('\n');
  return { body };
}

/* ------------------------------------------------------------------ plan pages (hosting, VPS, dedicated, SSL, email) */
async function plans(x: Ctx): Promise<Built> {
  const { cat, def } = x;
  const ps = productsFor(cat, def.categories);
  const hosting = def.slug === 'web-hosting';
  const locs = locations(ps);
  const fromHtml = fromLine(cat, ps, def.kind === 'email' ? 'تبدأ الخطط من' : 'تبدأ الخطط من');
  const sec = `<section class="hp-section hp-section--tint" id="plans" aria-labelledby="ar-plans-h"><div class="hp-container">
    ${sectionHead({ id: 'ar-plans-h', title: 'الخطط والأسعار', lead: hosting && locs.length > 1 ? `اختر موقع الخادم (${joinAr(locs.map(arLocation))})، ثم اختر الحجم المناسب.` : 'جميع الأسعار مباشرة من نظام الفوترة، ويظهر سعر التجديد بجانب كل خطة.' })}
    ${planCards(ps, { currency: cat.currency, base: cat.base, locationTabs: hosting, groupLabel: 'موقع الاستضافة', id: 'ar-plans', orderLabel: 'اطلب الآن', contactHref: '/ar/contact',
      emptyTitle: 'يجري تحديث الخطط', emptyText: 'لا توجد خطط معروضة هنا حالياً. أخبرنا بما تحتاجه وسيرسل لك فريقنا عرض سعر.' })}
    ${plansNote(cat.currency)}
  </div></section>`;
  const faqs = [...def.copy.faqs];
  const p = cheapest(cat, ps);
  if (p) {
    faqs.unshift({ q: `كم سعر ${def.copy.crumb} لدى GlobalHostia؟`, a: `تبدأ الأسعار من ${fromTextAr(p, cat.currency)} (${p.name})، بعملة ${cat.currency} وقبل ضريبة القيمة المضافة حيثما تنطبق. الأسعار مباشرة من نظام الفوترة، ويظهر سعر التجديد قبل الدفع.` });
  }
  const rel: Record<string, string[]> = {
    'web-hosting': ['free-migration', 'ae-domains', 'google-workspace', 'ssl-certificate'],
    'vps-hosting': ['dedicated-servers', 'web-hosting', 'connectors'],
    'dedicated-servers': ['vps-hosting', 'contact'],
    'ssl-certificate': ['web-hosting', 'domains-registration'],
    'google-workspace': ['domains-registration', 'ae-domains', 'web-hosting'],
  };
  const body = [
    hero(x, { ctas: [{ label: 'شاهد الخطط', href: '#plans', icon: 'arrow' }, { label: 'تحدث مع المبيعات', href: '/ar/contact', variant: 'ghost' }], fromHtml }),
    trustStripAr(cat), sec, pointsSec(x),
    rel[def.slug] ? `<div class="hp-container ar-relwrap">${relLinks(x, rel[def.slug])}</div>` : '',
    faqSec(x, faqs), cta(x),
  ].join('\n');
  return { body, faqs, ld: [itemListLd(cat, ps, def.copy.title, x.site + arPathOf(def))].filter(Boolean) };
}

/* ------------------------------------------------------------------ domains */
const isIdn = (t: string) => /xn--|[^\x00-\x7f]/i.test(t);
/** xn--mgbaam7a8h → امارات (only for display; the cart takes the stored form). */
function idnLabel(t: string) { if (!/xn--/i.test(t)) return t; const u = domainToUnicode(t.replace(/^\./, '')); return u ? `.${u}` : t; }
async function domains(x: Ctx): Promise<Built> {
  const { cat, def } = x;
  const tlds = pricedTlds(cat);
  const top = ['.com', '.ae', '.net', '.org', '.co', '.shop', '.store', '.online', '.io', '.ai'];
  const rank = (t: TTld) => { const i = top.indexOf(t.tld); return i < 0 ? 99 : i; };
  const rows = [...tlds].sort((a, b) => rank(a) - rank(b) || a.tld.localeCompare(b.tld)).slice(0, 40);
  const search = `<section class="hp-domain ar-dsearch" aria-labelledby="ar-q-h"><div class="hp-container">${domainSearch({ tlds: rows.slice(0, 5).map((t) => ({ ...t, featured: true })), base: cat.base, id: 'ar-q', title: 'ابحث عن نطاقك', max: 5, prefix: currencyPrefix(cat) || '$',
    typing: ['yourcompany.com', 'mybrand.ae', 'alnoor.net', 'dubaistore.shop'], note: `أسعار السنة الأولى بعملة ${cat.currency}. يظهر سعر التجديد قبل الدفع.` })}</div></section>`;
  const table = rows.length ? `<section class="hp-section" id="pricing" aria-labelledby="ar-tld-h"><div class="hp-container">
    ${sectionHead({ id: 'ar-tld-h', title: 'أسعار النطاقات', lead: `أسعار التسجيل والتجديد والنقل لكل سنة بعملة ${cat.currency}، مباشرة من نظام الفوترة وقبل ضريبة القيمة المضافة حيثما تنطبق.` })}
    <div class="ar-table-wrap" tabindex="0" role="region" aria-labelledby="ar-tld-h"><table class="ar-table num">
      <thead><tr><th scope="col">الامتداد</th><th scope="col">التسجيل (السنة الأولى)</th><th scope="col">التجديد</th><th scope="col">النقل</th><td aria-hidden="true"></td></tr></thead>
      <tbody>${rows.map((t) => `<tr><th scope="row"><bdi class="ar-ltr">${esc(idnLabel(t.tld))}</bdi>${t.promo ? ` <span class="hp-badge hp-badge--inline">${esc(t.promo)}</span>` : ''}</th><td>${esc(tldMoney(cat, t.register) || '—')}</td><td>${esc(tldMoney(cat, t.renew) || '—')}</td><td>${esc(tldMoney(cat, t.transfer) || '—')}</td><td><a class="hp-link" href="${esc(domainCartUrl(cat.base))}">سجّل${icon('arrow')}</a></td></tr>`).join('')}</tbody>
    </table></div>
    <p class="ar-note">${icon('info')}يُضاف سعر النطاق إلى سلة الطلب مع الاسم الذي تختاره، ويظهر الإجمالي قبل الدفع.</p>
  </div></section>` : '';
  // Arabic-script (IDN) extensions: shown only when the synced catalog actually sells one
  const idn = tlds.filter((t) => isIdn(t.tld));
  const idnSec = idn.length ? `<section class="hp-section hp-section--tint" aria-labelledby="ar-idn-h"><div class="hp-container">
    ${sectionHead({ id: 'ar-idn-h', title: 'نطاقات بالحروف العربية', lead: 'امتدادات بالحروف العربية متاحة في نظام الفوترة لدينا، بأسعارها الحالية:' })}
    <ul class="ar-idn">${idn.map((t) => `<li><b dir="rtl">${esc(idnLabel(t.tld))}</b><span class="num">${esc(tldMoney(cat, t.register))}</span></li>`).join('')}</ul></div></section>` : '';
  const faqs = [...def.copy.faqs];
  const com = tlds.find((t) => t.tld === '.com');
  if (com) faqs.unshift({ q: 'كم سعر تسجيل نطاق .com؟', a: `يبلغ سعر نطاق .com للسنة الأولى ${tldMoney(cat, com.register)}${com.renew !== null ? `، ويُجدَّد بسعر ${tldMoney(cat, com.renew)} سنوياً` : ''}، بعملة ${cat.currency} وقبل ضريبة القيمة المضافة حيثما تنطبق. السعر مباشر من نظام الفوترة ويُؤكَّد في نموذج الطلب.` });
  const L = whmcsLinks(cat.base);
  const body = [
    hero(x, { ctas: [{ label: 'ابحث عن نطاق', href: '#ar-q', icon: 'search', attrs: 'data-focus-domain' }, { label: 'انقل نطاقك', href: L.transfer, variant: 'ghost', icon: 'transfer' }] }),
    search, trustStripAr(cat), table, idnSec, pointsSec(x, true),
    `<div class="hp-container ar-relwrap">${relLinks(x, ['ae-domains', 'premium-domains', 'sell-domains', 'google-workspace'])}</div>`,
    faqSec(x, faqs), cta(x, { label: 'خدمة وسيط النطاقات', href: '/domain-broker' }),
  ].join('\n');
  const offers = rows.filter((t) => t.register !== null).slice(0, 10).map((t) => ({ '@type': 'Offer', name: `تسجيل نطاق ${t.tld}`, price: t.register!.toFixed(2), priceCurrency: cat.currency, url: domainCartUrl(cat.base) }));
  return { body, faqs, ld: offers.length ? [ld({ '@context': 'https://schema.org', '@type': 'Product', name: 'تسجيل النطاقات', description: def.copy.meta, brand: { '@type': 'Brand', name: 'GlobalHostia' }, inLanguage: 'ar',
    offers: { '@type': 'AggregateOffer', priceCurrency: cat.currency, lowPrice: Math.min(...rows.filter((t) => t.register !== null).map((t) => t.register!)).toFixed(2), highPrice: Math.max(...rows.filter((t) => t.register !== null).map((t) => t.register!)).toFixed(2), offerCount: offers.length, offers } })] : [] };
}

/* ------------------------------------------------------------------ .ae */
async function aeDomains(x: Ctx): Promise<Built> {
  const { cat, def } = x;
  const tlds = pricedTlds(cat);
  const ae = tlds.find((t) => t.tld === '.ae');
  const others = ['.com', '.co', '.net', '.org', '.shop'].map((t) => tlds.find((d) => d.tld === t)).filter((t): t is TTld => !!t);
  const card = `<div class="ae-price ar-aeprice"><div class="ae-price__tld" aria-hidden="true">.ae</div>
    ${ae ? `<dl class="ae-price__rows num"><div><dt>السنة الأولى</dt><dd><b>${esc(tldMoney(cat, ae.register))}</b></dd></div>${ae.renew !== null ? `<div><dt>التجديد</dt><dd>${esc(tldMoney(cat, ae.renew))} / سنة</dd></div>` : ''}${ae.transfer !== null ? `<div><dt>النقل</dt><dd>${esc(tldMoney(cat, ae.transfer))}</dd></div>` : ''}</dl>
      <p class="ae-price__note">سعر مباشر بعملة ${esc(cat.currency)} من نظام الفوترة. تُضاف ضريبة القيمة المضافة 5% حيثما تنطبق.</p>`
    : `<p class="ae-price__na"><a class="hp-btn hp-btn--light" href="${esc(domainCartUrl(cat.base))}">اعرض السعر</a></p><p class="ae-price__note">يظهر سعر .ae المباشر في نموذج الطلب قبل الدفع.</p>`}</div>`;
  const search = `<section class="hp-domain ar-dsearch" aria-labelledby="ar-q-h"><div class="hp-container">${domainSearch({ tlds: [...(ae ? [ae] : []), ...others].map((t) => ({ ...t, featured: true })), base: cat.base, id: 'ar-q', title: 'ابحث عن اسمك بامتداد .ae', max: 5, prefix: currencyPrefix(cat) || '$',
    typing: ['yourcompany.ae', 'dubaistore.ae', 'mybrand.ae', 'alnoor.ae'], note: ae ? `أسعار السنة الأولى بعملة ${cat.currency}. سعر تجديد .ae هو ${tldMoney(cat, ae.renew) || 'المعروض قبل الدفع'}.` : 'يظهر سعر .ae المباشر في نموذج الطلب قبل الدفع.' })}</div></section>`;
  // eligibility: plain-language summary with the official sources (rules are set by the registry and can change)
  const req = `<section class="hp-section hp-section--tint" aria-labelledby="ar-req-h"><div class="hp-container ae-req">
    <div class="ae-req__intro" data-reveal><h2 id="ar-req-h" class="hp-hline hp-h2">من يمكنه تسجيل نطاق .ae؟</h2><p class="hp-lead">يضع سجل نطاقات .ae شروط الأهلية، وقد تتغير. بشكل عام:</p></div>
    <ul class="ae-req__list" data-reveal>
      <li>${icon('check')}<div><b>قد يُشترط وجود في الإمارات</b><span>مثل رخصة تجارية إماراتية، أو جهة اتصال أو ممثل محلي في الدولة.</span></div></li>
      <li>${icon('check')}<div><b>قد يلزم أن يرتبط الاسم بك</b><span>مثل اسم شركتك أو اسمها التجاري أو علامة تجارية تملكها.</span></div></li>
      <li>${icon('check')}<div><b>قد تُطلب مستندات</b><span>إذا طلب السجل إثباتاً، نخبرك بالمطلوب تحديداً ونتولى تقديمه.</span></div></li>
      <li>${icon('info')}<div><b>نتحقق قبل أن تدفع</b><span>لست متأكداً من أهليتك؟ اسألنا أولاً وسنؤكد لك المتطلبات الحالية لحالتك.</span></div></li>
    </ul>
    <p class="ae-req__note">${icon('info')}هذا ملخص مبسّط وليس استشارة قانونية، وتنطبق دائماً السياسة الحالية للسجل. المصادر الرسمية:
      <a href="https://aeda.ae" rel="noopener" target="_blank" lang="en" dir="ltr">.ae Domain Administration (aeDA)</a> التابعة لهيئة تنظيم الاتصالات والحكومة الرقمية
      (<a href="https://tdra.gov.ae" rel="noopener" target="_blank" lang="en" dir="ltr">TDRA</a>)، وسجل
      <a href="https://www.iana.org/domains/root/db/ae.html" rel="noopener" target="_blank" lang="en" dir="ltr">IANA لنطاق .ae</a>.</p>
  </div></section>`;
  const faqs = [...def.copy.faqs];
  faqs.unshift({ q: 'كم سعر نطاق .ae؟', a: ae ? `سعر نطاق .ae للسنة الأولى ${tldMoney(cat, ae.register)}${ae.renew !== null ? `، ويُجدَّد بسعر ${tldMoney(cat, ae.renew)} سنوياً` : ''}، بعملة ${cat.currency} وقبل ضريبة القيمة المضافة حيثما تنطبق. السعر مباشر من نظام الفوترة ويُؤكَّد في نموذج الطلب.` : 'يظهر سعر .ae المباشر في نموذج الطلب قبل الدفع، مع سعر التجديد.' });
  const body = [
    hero(x, { ctas: [{ label: 'ابحث عن اسم .ae', href: '#ar-q', icon: 'search', attrs: 'data-focus-domain' }], visualHtml: card }),
    search, trustStripAr(cat), pointsSec(x), req,
    `<div class="hp-container ar-relwrap">${relLinks(x, ['web-hosting', 'google-workspace', 'domains-registration'])}</div>`,
    faqSec(x, faqs), cta(x, { label: 'ابحث عن اسم .ae', href: '#ar-q', attrs: 'data-focus-domain' }),
  ].join('\n');
  const offer = ae ? ld({ '@context': 'https://schema.org', '@type': 'Product', name: 'تسجيل نطاق .ae', description: 'تسجيل اسم نطاق .ae (الإمارات العربية المتحدة) لمدة سنة.', inLanguage: 'ar',
    brand: { '@type': 'Brand', name: 'GlobalHostia' }, offers: { '@type': 'Offer', price: ae.register!.toFixed(2), priceCurrency: cat.currency, url: x.site + arPathOf(def), availability: 'https://schema.org/InStock' } }) : '';
  return { body, faqs, ld: [offer].filter(Boolean), css: ['aedomains'] };
}

/* ------------------------------------------------------------------ free migration (form posts to the same API, lang=ar) */
const WHAT: [string, string][] = [['Website files', 'ملفات الموقع'], ['Databases', 'قواعد البيانات'], ['Email accounts', 'حسابات البريد الإلكتروني'], ['Domain and DNS', 'النطاق وإعدادات DNS']];
const PANELS: [string, string][] = [['cPanel', 'cPanel'], ['Plesk', 'Plesk'], ['DirectAdmin', 'DirectAdmin'], ['WordPress admin only', 'لوحة WordPress فقط'], ['Other', 'أخرى'], ['Not sure', 'لست متأكداً']];
const WHEN: [string, string][] = [['As soon as possible', 'في أقرب وقت'], ['Outside UAE business hours', 'خارج ساعات العمل في الإمارات'], ['At the weekend', 'في عطلة نهاية الأسبوع'], ['A specific date (see notes)', 'في تاريخ محدد (اذكره في الملاحظات)']];
async function migration(x: Ctx): Promise<Built> {
  const { cat, def, ctx } = x;
  const ticket = (ctx.query.get('ticket') || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 24);
  const err = (ctx.query.get('error') || '').slice(0, 200);
  const email = String(cat.settings.email || '');
  const field = (id: string, label: string, input: string, o: { req?: boolean; hint?: string; wide?: boolean } = {}) =>
    `<div class="mg-field${o.wide ? ' mg-field--wide' : ''}" data-field="${id}"><label for="mg-${id}">${esc(label)}${o.req ? ' <span class="mg-req" aria-hidden="true">*</span>' : ' <span class="mg-opt">اختياري</span>'}</label>${input}${o.hint ? `<p class="mg-hint" id="mg-${id}-hint">${esc(o.hint)}</p>` : ''}<p class="mg-err" id="mg-${id}-err" hidden></p></div>`;
  const inp = (id: string, type: string, extra = '') => `<input class="hp-input" id="mg-${id}" name="${id}" type="${type}" ${extra} aria-describedby="mg-${id}-err">`;
  const form = `<form class="mg-form" action="/api/free-migration?lang=ar" method="post" data-mg-form novalidate aria-labelledby="mg-form-h">
    <h2 id="mg-form-h" class="mg-form__h">اطلب نقل موقعك</h2>
    <p class="mg-form__lead">الحقول المعلّمة بـ <span class="mg-req" aria-hidden="true">*</span><span class="sr-only">علامة النجمة</span> مطلوبة. نرد عليك في تذكرة دعم تصل إلى بريدك الإلكتروني.</p>
    ${err ? `<p class="mg-alert" role="alert">${icon('alert')}${esc(err)}</p>` : '<p class="mg-alert" role="alert" data-mg-alert hidden></p>'}
    <div class="mg-grid">
      ${field('name', 'الاسم', inp('name', 'text', 'autocomplete="name" required minlength="2" maxlength="80"'), { req: true })}
      ${field('email', 'البريد الإلكتروني', inp('email', 'email', 'autocomplete="email" required maxlength="120" dir="ltr"'), { req: true })}
      ${field('phone', 'الهاتف أو واتساب', inp('phone', 'tel', 'autocomplete="tel" inputmode="tel" maxlength="30" dir="ltr" placeholder="+971 50 000 0000"'))}
      ${field('site', 'الموقع المراد نقله', inp('site', 'text', 'inputmode="url" autocapitalize="off" spellcheck="false" required maxlength="200" dir="ltr" placeholder="example.com"'), { req: true })}
      ${field('host', 'شركة الاستضافة الحالية', inp('host', 'text', 'maxlength="80" autocomplete="off"'))}
      ${field('panel', 'لوحة التحكم لدى مزودك الحالي', `<select class="hp-select" id="mg-panel" name="panel"><option value="">اختر</option>${PANELS.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`)}
      <fieldset class="mg-field mg-field--wide mg-what" data-field="what" aria-describedby="mg-what-err"><legend>ما الذي تريد نقله؟ <span class="mg-req" aria-hidden="true">*</span></legend>
        <div class="mg-checks">${WHAT.map(([v, l], i) => `<label class="mg-check"><input type="checkbox" name="what" value="${esc(v)}"${i < 2 ? ' checked' : ''}><span>${icon('check')}</span>${esc(l)}</label>`).join('')}</div>
        <p class="mg-err" id="mg-what-err" hidden></p></fieldset>
      ${field('when', 'الوقت المفضل', `<select class="hp-select" id="mg-when" name="when">${WHEN.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`, { wide: true })}
      ${field('notes', 'ملاحظات تود إخبارنا بها', `<textarea class="hp-input mg-ta" id="mg-notes" name="notes" aria-describedby="mg-notes-hint mg-notes-err" rows="4" maxlength="2000" placeholder="مثلاً: عدد المواقع، أو موقع WordPress متعدد، أو موعد نهائي، أو الخطة التي ستطلبها."></textarea>`, { wide: true, hint: 'يرجى عدم كتابة كلمات المرور هنا، فسنطلب بيانات الوصول بأمان في التذكرة.' })}
    </div>
    <div class="mg-hp" aria-hidden="true"><label for="mg-cu">اترك هذا الحقل فارغاً</label><input id="mg-cu" name="company_url" type="text" tabindex="-1" autocomplete="off"></div>
    <input type="hidden" name="t" value="" data-mg-t>
    <div class="mg-submit"><button class="hp-btn hp-btn--brand hp-btn--lg" type="submit" data-mg-btn>${icon('move')}<span>أرسل طلب النقل</span></button>
      <p>نفتح تذكرة دعم ببياناتك. ${email ? `تفضّل البريد الإلكتروني؟ راسلنا على <a href="mailto:${esc(email)}" dir="ltr">${esc(email)}</a>.` : ''}</p></div>
  </form>`;
  const done = `<div class="mg-done" data-mg-done${ticket ? '' : ' hidden'} tabindex="-1" role="status">${hexIcon('check')}
    <h2>استلمنا طلبك</h2>
    <p data-mg-tline${ticket && ticket !== 'received' ? '' : ' hidden'}>رقم تذكرتك <b class="num" data-mg-ticket>${esc(ticket && ticket !== 'received' ? ticket : '')}</b>. احتفظ به عند التواصل معنا.</p>
    <p>أرسلنا نسخة إلى بريدك الإلكتروني. سيرد عليك مهندس في التذكرة للاتفاق على الموعد وطريقة مشاركة بيانات الوصول بأمان.</p>
    <div class="hp-actions"><a class="hp-link" href="/ar/web-hosting">قارن خطط الاستضافة${icon('arrow')}</a></div></div>`;
  const main = `<section class="hp-section mg-sec" id="request" aria-label="طلب نقل الموقع"><div class="hp-container mg-wrap">
    <div class="mg-card">${ticket ? '' : form}${done}</div>
    <aside class="mg-side" aria-labelledby="mg-side-h"><h2 id="mg-side-h">ما الذي ننقله لك</h2><ul class="mg-list">${[
      ['المواقع والتطبيقات', 'مواقع WordPress وWooCommerce وJoomla وLaravel ومواقع PHP أو HTML.'],
      ['قواعد البيانات', 'MySQL وMariaDB، تُصدَّر وتُستورد بترميز الأحرف الصحيح، بما فيها النصوص العربية.'],
      ['البريد الإلكتروني', 'صناديق البريد ورسائلها وإعادة التوجيه، عندما يسمح مزودك القديم بالوصول عبر IMAP.'],
      ['النطاق وDNS', 'نجهّز السجلات ونساعدك في تغيير خوادم الأسماء عندما تكون جاهزاً.'],
    ].map(([h, p]) => `<li>${icon('check')}<div><b>${esc(h)}</b><span>${esc(p)}</span></div></li>`).join('')}</ul></aside>
  </div></section>`;
  const body = [hero(x, { ctas: [{ label: 'اطلب النقل', href: '#request', icon: 'arrow' }] }), trustStripAr(cat), main, pointsSec(x, true), faqSec(x, def.copy.faqs), cta(x, { label: 'خطط الاستضافة', href: '/ar/web-hosting' })].join('\n');
  const service = ld({ '@context': 'https://schema.org', '@type': 'Service', name: 'نقل المواقع', serviceType: 'Website migration', inLanguage: 'ar', url: x.site + arPathOf(def),
    provider: { '@id': `${x.site}/#organization` }, areaServed: 'Worldwide', ...(trustOnAr(cat, 'migration') ? { offers: { '@type': 'Offer', price: '0', priceCurrency: cat.currency } } : {}) });
  return { body, ld: [service], css: ['migration'], js: ['migration'], noindex: !!(ticket || err) };
}

/* ------------------------------------------------------------------ premium domains */
async function premium(x: Ctx): Promise<Built | null> {
  const { cat, def } = x;
  const { premiumItems, premiumConfig } = await import('../../premium/store');
  const { fmtMoney } = await import('../../premium/core');
  const { itemHref } = await import('../../premium/view');
  const cfg = await premiumConfig();
  if (!cfg.enabled) return null;
  const items = (await premiumItems()).filter((i) => i.status === 'for_sale').sort((a, b) => Number(b.featured) - Number(a.featured)).slice(0, 24);
  const list = items.length ? `<section class="hp-section" aria-labelledby="ar-pd-h"><div class="hp-container">
    ${sectionHead({ id: 'ar-pd-h', title: 'نطاقات متاحة الآن', lead: 'مختارات من القائمة الكاملة، بأسعارها الحالية. افتح أي اسم لطلبه.' })}
    <ul class="ar-pd">${items.map((i) => `<li><a href="${esc(itemHref(i))}"><b dir="ltr">${esc(i.domain)}</b><span class="num">${i.price !== null ? esc(fmtMoney(i.price, i.currency)) : 'قدّم عرضاً'}</span>${i.featured ? '<em>مميز</em>' : ''}</a></li>`).join('')}</ul>
    <p class="ar-more"><a class="hp-btn hp-btn--ghost" href="/premium-domains">اعرض القائمة الكاملة مع البحث والتصفية${icon('arrow')}</a></p>
  </div></section>` : '';
  const body = [hero(x, { ctas: [{ label: 'تصفّح النطاقات', href: '/premium-domains', icon: 'search' }, { label: 'بِع نطاقك', href: '/ar/sell-domains', variant: 'ghost' }] }),
    trustStripAr(cat), list, pointsSec(x, true), faqSec(x, def.copy.faqs), cta(x, { label: 'خدمة وسيط النطاقات', href: '/domain-broker' })].join('\n');
  const priced = items.filter((i) => i.price !== null);
  return { body, ld: priced.length ? [ld({ '@context': 'https://schema.org', '@type': 'ItemList', name: def.copy.title, url: x.site + arPathOf(def), inLanguage: 'ar', numberOfItems: priced.length,
    itemListElement: priced.map((i, n) => ({ '@type': 'ListItem', position: n + 1, item: { '@type': 'Product', name: i.domain, url: x.site + itemHref(i), offers: { '@type': 'Offer', price: i.price!.toFixed(2), priceCurrency: i.currency, availability: 'https://schema.org/InStock' } } })) })] : [] };
}

/* ------------------------------------------------------------------ sell your domain */
async function sell(x: Ctx): Promise<Built> {
  const { cat, def } = x;
  const { normalizeSell, SELL_KEY } = await import('../../sell/core');
  const { fmtMoney } = await import('../../premium/core');
  const c = normalizeSell((cat.settings as any)[SELL_KEY]);
  const usd = (n: number) => fmtMoney(n, 'USD');
  const fees = `<section class="hp-section hp-section--tint" id="fees" aria-labelledby="ar-fee-h"><div class="hp-container">
    ${sectionHead({ id: 'ar-fee-h', title: 'رسوم بسيطة لكل نطاق', lead: 'تُحصَّل بفاتورة بعملة حسابك، ولا يُدفع أي شيء في هذه الصفحة.' })}
    <ul class="ar-fees">
      <li data-reveal><span>رسوم العرض</span><b class="num">${esc(usd(c.listingFeeUsd))}</b><p>لكل نطاق، لمدة سنة من تاريخ الموافقة، ويُجدَّد بالرسوم نفسها.</p></li>
      <li data-reveal style="--i:1"><span>${icon('star')}عرض مميز</span><b class="num">+${esc(usd(c.featuredFeeUsd))}</b><p>لكل نطاق: يظهر أولاً في السوق وفي الصفحة الرئيسية طوال سنة العرض.</p></li>
      <li data-reveal style="--i:2"><span>عند البيع</span><b class="num">${c.commissionPct > 0 ? `${esc(String(c.commissionPct))}%` : 'بدون عمولة'}</b><p>${c.commissionPct > 0 ? `عمولة من سعر البيع${c.commissionMinUsd > 0 ? ` (بحد أدنى ${esc(usd(c.commissionMinUsd))})` : ''}، تُخصم من المبلغ المحوَّل إليك.` : 'تحصل على السعر المتفق عليه كاملاً.'}</p></li>
    </ul>
    <p class="ar-note">${icon('info')}المبالغ بالدولار الأمريكي، وتظهر الرسوم نفسها في فاتورتك بعملة حسابك.</p>
  </div></section>`;
  const faqs = [{ q: 'كم تكلفة عرض نطاقي للبيع؟', a: `${usd(c.listingFeeUsd)} لكل نطاق لمدة سنة من العرض، و${usd(c.featuredFeeUsd)} إضافية لكل نطاق إذا أردت عرضه مميزاً للسنة نفسها.${c.commissionPct > 0 ? ` وعند بيع النطاق تُخصم عمولة ${c.commissionPct}% من سعر البيع.` : ''}` }, ...def.copy.faqs];
  const body = [hero(x, { ctas: [{ label: 'اعرض نطاقاً للبيع', href: '/account/sell/new', icon: 'plus' }, { label: 'تصفّح النطاقات المميزة', href: '/ar/premium-domains', variant: 'ghost' }] }),
    trustStripAr(cat), pointsSec(x), fees, faqSec(x, faqs), cta(x, { label: 'اعرض نطاقاً للبيع', href: '/account/sell/new' })].join('\n');
  return { body, faqs };
}

/* ------------------------------------------------------------------ AI connectors */
async function connectors(x: Ctx): Promise<Built> {
  const { cat, def, site } = x;
  const box = (label: string, v: string) => `<div class="ar-url"><span>${esc(label)}</span><code dir="ltr">${esc(v)}</code></div>`;
  const how = `<section class="hp-section hp-section--tint" aria-labelledby="ar-how-h"><div class="hp-container">
    ${sectionHead({ id: 'ar-how-h', title: 'روابط الربط', lead: 'انسخ الرابط المناسب إلى تطبيقك، ثم سجّل الدخول بحسابك في GlobalHostia عندما يُطلب منك.' })}
    <div class="ar-urls">${box('Claude (موصل مخصص)', `${site}/mcp`)}${box('ChatGPT', `${site}/mcp/chatgpt`)}${box('Claude Code', `claude mcp add --transport http globalhostia ${site}/mcp`)}</div>
    <p class="ar-more"><a class="hp-btn hp-btn--ghost" href="/connectors" hreflang="en">خطوات الربط التفصيلية (بالإنجليزية)${icon('arrow')}</a> <a class="hp-link" href="/docs/mcp" hreflang="en">وثائق المطورين${icon('arrow')}</a></p>
  </div></section>`;
  const body = [hero(x, { ctas: [{ label: 'خطوات الربط', href: '/connectors', icon: 'plug' }] }), pointsSec(x), how, faqSec(x, def.copy.faqs), cta(x, { label: 'خطوات الربط', href: '/connectors' })].join('\n');
  return { body, ld: [ld({ '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'GlobalHostia MCP connector', applicationCategory: 'BusinessApplication', operatingSystem: 'Web', inLanguage: 'ar', url: site + arPathOf(def), offers: { '@type': 'Offer', price: '0', priceCurrency: cat.currency }, publisher: { '@id': `${site}/#organization` } })] };
}

/* ------------------------------------------------------------------ contact */
async function contact(x: Ctx): Promise<Built> {
  const { cat, def } = x;
  const s = cat.settings, L = whmcsLinks(cat.base);
  const phone = String(s.phone || ''), email = String(s.email || '');
  const w = x.wa('مرحباً GlobalHostia، لدي استفسار.');
  const ch: { ic: IconName; label: string; value: string; href: string; ltr?: boolean }[] = [
    ...(phone ? [{ ic: 'phone' as IconName, label: 'اتصل بنا', value: phone, href: 'tel:' + phone.replace(/[^\d+]/g, ''), ltr: true }] : []),
    ...(email ? [{ ic: 'mail' as IconName, label: 'راسلنا بالبريد', value: email, href: `mailto:${email}`, ltr: true }] : []),
    ...(w ? [{ ic: 'whatsapp' as IconName, label: 'واتساب', value: 'أرسل رسالة', href: w }] : []),
    { ic: 'ticket', label: 'تذكرة دعم', value: 'افتح تذكرة', href: L.ticket },
  ];
  const quick = `<section class="ct-quick-wrap ar-quick" aria-label="طرق التواصل"><div class="hp-container"><ul class="ar-chan">${ch.map((c) =>
    `<li data-reveal><a href="${esc(c.href)}"${c.href.startsWith('http') ? ' rel="noopener"' : ''}>${hexIcon(c.ic)}<span><small>${esc(c.label)}</small><b${c.ltr ? ' dir="ltr" class="num"' : ''}>${esc(c.value)}</b></span></a></li>`).join('')}</ul></div></section>`;
  const office = `<section class="hp-section" aria-labelledby="ar-off-h"><div class="hp-container ar-office">
    <h2 id="ar-off-h" class="hp-hline hp-h2">مكتبنا</h2><dl class="ar-facts"><div><dt>الشركة</dt><dd>GlobalHostia</dd></div><div><dt>المقر</dt><dd>دبي، الإمارات العربية المتحدة</dd></div>${trustOnAr(cat, 'support') ? '<div><dt>الدعم</dt><dd>على مدار الساعة عبر التذاكر وواتساب</dd></div>' : ''}</dl></div></section>`;
  const body = [hero(x, { ctas: [...(w ? [{ label: 'راسلنا على واتساب', href: w, icon: 'whatsapp' as IconName }] : []), { label: 'افتح تذكرة دعم', href: L.ticket, variant: 'ghost', icon: 'ticket' }] }),
    quick, pointsSec(x, true), office, faqSec(x, def.copy.faqs)].join('\n');
  return { body, ld: [ld({ '@context': 'https://schema.org', '@type': 'ContactPage', name: def.copy.title, inLanguage: 'ar', url: x.site + arPathOf(def), about: { '@id': `${x.site}/#organization` } })] };
}

/* ------------------------------------------------------------------ about */
async function about(x: Ctx): Promise<Built> {
  const { cat, def } = x;
  const all = cat.products;
  const locs = locations(all).map(arLocation);
  const facts = `<section class="hp-section" aria-labelledby="ar-facts-h"><div class="hp-container ar-office">
    <h2 id="ar-facts-h" class="hp-hline hp-h2">GlobalHostia في سطور</h2>
    <dl class="ar-facts"><div><dt>الشركة</dt><dd>GlobalHostia</dd></div><div><dt>المقر</dt><dd>دبي، الإمارات العربية المتحدة</dd></div>${locs.length ? `<div><dt>مواقع الخوادم في الخطط الحالية</dt><dd>${esc(joinAr(locs))}</dd></div>` : ''}<div><dt>الخدمات</dt><dd>استضافة المواقع، خوادم VPS ومخصصة، النطاقات، شهادات SSL، البريد الإلكتروني للشركات</dd></div></dl>
    ${relLinks(x, ['web-hosting', 'vps-hosting', 'domains-registration', 'contact'])}</div></section>`;
  const body = [hero(x), trustStripAr(cat), facts, pointsSec(x, true), faqSec(x, def.copy.faqs), cta(x)].join('\n');
  return { body, ld: [ld({ '@context': 'https://schema.org', '@type': 'AboutPage', name: def.copy.title, inLanguage: 'ar', url: x.site + arPathOf(def), about: { '@id': `${x.site}/#organization` } })] };
}

const KINDS: Record<string, (x: Ctx) => Promise<Built | null>> = {
  home, plans, email: plans, domains, ae: aeDomains, migration, premium, sell, connectors, contact, about,
};

export default async function render(ctx: PageCtx): Promise<string | null> {
  const base = arDefForThemeSlug(ctx.slug);
  if (!base) return null;
  const cat = await getCatalog();
  const def = arPage(base, cat.settings.ar_pages);
  if (!def.copy.enabled) return null;
  const site = siteOf(cat);
  const links = new Map(enabledArDefs(cat.settings.ar_pages).map((d) => [d.en, arPathOf(d)]));
  const x: Ctx = { cat, def, ctx, site, links, wa: (t) => waLink(cat.settings, t) };
  const built = await KINDS[def.kind](x);
  if (!built) return null;
  const path = arPathOf(def);
  const c = def.copy;
  const crumbs = def.slug ? [HOME, { label: c.crumb }] : [{ label: 'الرئيسية', href: '/ar' }];
  const faqs = built.faqs || c.faqs;
  // WebPage in Arabic (Organization/WebSite come from the shell; same @id, so search engines join them)
  const webPage = ld({ '@context': 'https://schema.org', '@type': 'WebPage', '@id': `${site}${path}#webpage`, url: site + path, name: c.seoTitle, description: c.meta, inLanguage: 'ar',
    isPartOf: { '@id': `${site}/#website` }, publisher: { '@id': `${site}/#organization` }, ...(c.keywords.length ? { keywords: c.keywords.join('، ') } : {}) });
  const orgAr = def.kind === 'home' ? ld({ '@context': 'https://schema.org', '@type': 'Organization', '@id': `${site}/#organization`, name: 'GlobalHostia', url: `${site}/`,
    description: c.meta, address: { '@type': 'PostalAddress', addressLocality: 'دبي', addressCountry: 'AE' }, areaServed: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'] }) : '';
  // the route's title/description become the page's Arabic SEO title and meta (shell uses route.seoTitle/meta)
  const route = { ...ctx.route, title: c.title, description: c.meta, seoTitle: c.seoTitle, meta: c.meta, categories: def.categories };
  // a plan page with no live plans is noindex (shell.ts); hreflang only joins indexable pages
  const indexable = !built.noindex && !(def.categories?.length && !productsFor(cat, def.categories).length);
  const html = await page({
    ctx: { ...ctx, route }, catalog: cat, path, title: c.title, description: c.meta, ogKicker: 'GlobalHostia',
    css: ['ar', ...(built.css || [])], js: built.js, noindex: built.noindex, bodyClass: 'ar-page',
    headExtra: `${indexable ? hreflangLinks(site, def) : ''}<meta property="og:locale:alternate" content="en_AE">${FONT}`,
    jsonLd: [webPage, orgAr, breadcrumbJsonLd(crumbs, site), faqs.length ? faqJsonLd(faqs) : '', ...(built.ld || [])].filter(Boolean),
    body: built.body,
  });
  return arabizeHtml(html, { links, enPath: def.en });
}
