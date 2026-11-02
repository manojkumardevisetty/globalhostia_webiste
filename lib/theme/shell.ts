// Full HTML document for a theme page: head/meta, utility bar, header + mega menus, drawer, main, footer.
import { esc } from '../render/util';
import { money } from '../pricing';
import type { PageCtx } from './index';
import { getCatalog, whmcsLinks, type Catalog } from './data';
import { getMenu, footerColumns, type ThemeMenu } from './menu';
import { icon, iconSprite, hexIcon } from './ui';

export type PageOpts = {
  title: string; description: string; path: string; body: string; ctx: PageCtx;
  css?: string[]; js?: string[]; jsonLd?: string | string[]; bodyClass?: string; ogImage?: string; preload?: string[];
  catalog?: Catalog; noindex?: boolean;
};

const ASSET_V = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 8);
const asset = (p: string) => `${p}?v=${ASSET_V}`;
const safeKey = (k: string) => k.replace(/[^a-z0-9_-]/gi, '');
const telHref = (p: string) => 'tel:' + String(p).replace(/[^\d+]/g, '');

function megaPanel(m: ThemeMenu) {
  const f = m.featured;
  const links = m.groups.map((g) => `<div class="hp-mega__group"><h3${g.title ? '' : ' aria-hidden="true"'}>${esc(g.title || '\u00a0')}</h3>${g.items.map((i) =>
    `<a class="hp-mega-link" href="${esc(i.href)}">${hexIcon(i.icon)}<div><strong>${esc(i.label)}${i.soon ? '<em class="hp-soon">Soon</em>' : ''}</strong>${i.desc ? `<span>${esc(i.desc)}</span>` : ''}</div></a>`).join('')}</div>`).join('');
  const feat = f ? `<div class="hp-mega-feat">${f.tag ? `<span class="hp-tag">${esc(f.tag)}</span>` : ''}<h4>${esc(f.title)}</h4>${f.big ? `<div class="hp-big num"><span class="sr-only">From </span>${esc(f.big.amount)}${f.big.unit ? `<small>${esc(f.big.unit)}</small>` : ''}</div>` : ''}${f.text ? `<p>${esc(f.text)}</p>` : ''}${f.list?.length ? `<ul class="hp-tl num">${f.list.map(([k, v]) => `<li><span>${esc(k)}</span><b>${esc(v)}</b></li>`).join('')}</ul>` : ''}${f.link ? `<a class="hp-link" href="${esc(f.link.href)}">${esc(f.link.label)}${icon('arrow')}</a>` : ''}</div>` : '';
  return `<div class="hp-mega" id="m-${esc(m.id)}" data-panel><div class="hp-mega__panel"${f ? '' : ' style="grid-template-columns:1fr"'}><div class="hp-mega__cols">${links}</div>${feat}</div></div>`;
}

function header(menus: ThemeMenu[], L: ReturnType<typeof whmcsLinks>) {
  return `<header class="hp-header">
  <div class="hp-container hp-header__inner">
    <a class="hp-brand" href="/" aria-label="Globalhostia home"><img src="/image/logo-main-black.png" alt="Globalhostia" width="178" height="34"></a>
    <nav class="hp-nav" aria-label="Main">${menus.map((m) => `<button type="button" class="hp-nav__btn" aria-expanded="false" aria-controls="m-${esc(m.id)}" data-menu="m-${esc(m.id)}">${esc(m.label)}${icon('chev')}</button>`).join('')}</nav>
    <div class="hp-header__actions">
      <a class="hp-btn hp-btn--ghost" href="/account">Client login</a>
      <a class="hp-btn hp-btn--brand" href="${esc(L.register)}">Sign up</a>
      <button type="button" class="hp-burger" aria-expanded="false" aria-controls="hp-drawer" aria-label="Open menu">${icon('menu')}</button>
    </div>
  </div>
  ${menus.map(megaPanel).join('\n  ')}
</header>`;
}

function drawer(menus: ThemeMenu[], L: ReturnType<typeof whmcsLinks>, phone: string, email: string) {
  return `<div class="hp-drawer" id="hp-drawer" aria-hidden="true" inert>
  <div class="hp-drawer__scrim" data-close></div>
  <div class="hp-drawer__sheet" role="dialog" aria-modal="true" aria-label="Menu">
    <div class="hp-drawer__head"><img src="/image/logo-main-black.png" alt="Globalhostia" width="147" height="28"><button type="button" data-close aria-label="Close menu">${icon('close')}</button></div>
    <nav class="hp-drawer__body" aria-label="Mobile">${menus.map((m, i) => `<button type="button" class="hp-dacc__btn" aria-expanded="false" aria-controls="hp-dp${i}">${esc(m.label)}${icon('chev')}</button><div class="hp-dacc__panel" id="hp-dp${i}"><ul>${m.groups.flatMap((g) => g.items).map((it) =>
      `<li><a href="${esc(it.href)}">${icon(it.icon)}${esc(it.label)}</a></li>`).join('')}</ul></div>`).join('')}</nav>
    <div class="hp-drawer__foot">
      <a class="hp-btn hp-btn--ghost" href="/account">Client login</a>
      <a class="hp-btn hp-btn--brand" href="${esc(L.register)}">Sign up</a>
      <div class="hp-drawer__contact">${phone ? `<a href="${esc(telHref(phone))}">${icon('phone')}<span class="num">${esc(phone)}</span></a>` : ''}${email ? `<a href="mailto:${esc(email)}">${icon('mail')}${esc(email)}</a>` : ''}</div>
    </div>
  </div>
</div>`;
}

function utilBar(cat: Catalog, L: ReturnType<typeof whmcsLinks>, phone: string, email: string) {
  return `<div class="hp-util"><div class="hp-container">
  <div class="hp-u-left">${phone ? `<a href="${esc(telHref(phone))}">${icon('phone')}<span class="num">${esc(phone)}</span></a>` : ''}${phone && email ? '<span class="hp-sep" aria-hidden="true"></span>' : ''}${email ? `<a href="mailto:${esc(email)}">${icon('mail')}${esc(email)}</a>` : ''}</div>
  <div class="hp-u-right">
    <span class="hp-u-item">${icon('coin')}Currency <b>${esc(cat.currency)}</b></span>
    <span class="hp-u-item">${icon('globe')}Language <b>English</b></span>
    <span class="hp-sep" aria-hidden="true"></span>
    <a href="${esc(L.ticket)}" class="hp-hide-md">${icon('ticket')}Submit a ticket</a>
    <a href="/account">${icon('user')}Client login</a>
  </div>
</div></div>`;
}

function footer(menus: ThemeMenu[], cat: Catalog, phone: string, email: string) {
  const s = cat.settings;
  const wa = String(s.whatsapp || phone || '').replace(/[^\d]/g, '');
  const company = String(s.company || 'Desert Tech Cloud Services LLC');
  const cols = footerColumns(menus);
  const pays = ['visa', 'mastercard', 'amex', 'discover', 'jcb', 'maestro'];
  return `<footer class="hp-footer">
  <div class="hp-container">
    <div class="hp-fbox">
      <div class="hp-contact-card">
        <h2>Contact us</h2>
        <p>Sales and technical support, every hour of every day.</p>
        ${phone ? `<div class="hp-cc-row">${hexIcon('phone')}<div><small>Call us</small><a class="num" href="${esc(telHref(phone))}">${esc(phone)}</a></div></div>` : ''}
        ${email ? `<div class="hp-cc-row">${hexIcon('mail')}<div><small>Email us</small><a href="mailto:${esc(email)}">${esc(email)}</a></div></div>` : ''}
        ${wa ? `<div class="hp-cc-row">${hexIcon('chat')}<div><small>Chat on WhatsApp</small><a href="https://wa.me/${esc(wa)}">Message us on WhatsApp</a></div></div>` : ''}
      </div>
      <nav class="hp-fcols" aria-label="Footer">${cols.map((c) => `<div><h3>${esc(c.title)}</h3>${c.links.map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join('')}</div>`).join('')}</nav>
      <div class="hp-pay" role="img" aria-label="Accepted payment methods: Visa, Mastercard, American Express, Discover, JCB, Maestro and Bitcoin">
        ${pays.map((p) => `<img src="/image/payment/${p}.png" alt="" width="48" height="30" loading="lazy">`).join('')}<span class="hp-btc">Bitcoin</span>
      </div>
    </div>
  </div>
  <div class="hp-foot-bottom">
    <div class="hp-container">
      <img src="/image/logo-main-white.png" alt="Globalhostia" width="157" height="30" loading="lazy">
      <p class="hp-legal">© ${new Date().getFullYear()} ${esc(s.site_name || 'Globalhostia')} · ${esc(company)}, Dubai, UAE. <a href="/terms-conditions">Terms</a> · <a href="/privacy-policy">Privacy</a><br><span class="hp-live"><i aria-hidden="true"></i><b>Prices shown live from our billing system.</b></span></p>
      <a class="hp-totop" href="#main" aria-label="Back to top">${icon('up')}</a>
    </div>
  </div>
</footer>`;
}

/** Render a complete themed HTML document. */
export async function page(o: PageOpts): Promise<string> {
  const cat = o.catalog || await getCatalog();
  const s = cat.settings;
  const L = whmcsLinks(cat.base);
  const menus = getMenu(cat);
  const phone = String(s.phone || ''), email = String(s.email || '');
  const site = String(s.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const canonical = site + (o.path === '/' || !o.path ? '/' : o.path);
  const siteName = String(s.site_name || 'Globalhostia');
  const fullTitle = o.title.includes(siteName) ? o.title : `${o.title} | ${siteName}`;
  const preview = o.ctx.query.get('theme') === 'hostpen';
  const noindex = preview || o.noindex;
  const css = (o.css || []).map(safeKey).filter(Boolean);
  const js = (o.js || []).map(safeKey).filter(Boolean);
  const lds = ([] as string[]).concat(o.jsonLd || []);
  const og = o.ogImage ? new URL(o.ogImage, site + '/').toString() : `${site}/image/logo-main-black.png`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(o.description)}">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(siteName)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:title" content="${esc(fullTitle)}"><meta property="og:description" content="${esc(o.description)}"><meta property="og:image" content="${esc(og)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(fullTitle)}"><meta name="twitter:description" content="${esc(o.description)}">
<meta name="theme-color" content="#16212b">
<link rel="icon" href="/image/favicon/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=Inter:wght@400;500;600&display=swap">
${(o.preload || []).map((p) => `<link rel="preload" as="image" href="${esc(p)}">`).join('')}
<link rel="stylesheet" href="${asset('/hp/theme.css')}">
${css.map((k) => `<link rel="stylesheet" href="${asset(`/hp/pages/${k}.css`)}">`).join('\n')}
<script>if(!matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.classList.add("hp-mo")</script>
${ldOrg(s, site)}${lds.join('\n')}
${s.custom_css ? `<style id="gh-custom">${String(s.custom_css).replace(/<\/style/gi, '<\\/style')}</style>` : ''}
</head>
<body${o.bodyClass ? ` class="${esc(o.bodyClass)}"` : ''}>
${iconSprite()}
<div class="hp-progress" aria-hidden="true"></div>
<a class="hp-skip" href="#main">Skip to content</a>
${utilBar(cat, L, phone, email)}
${header(menus, L)}
${drawer(menus, L, phone, email)}
<main id="main" tabindex="-1">
${o.body}
</main>
${footer(menus, cat, phone, email)}
${preview ? `<a class="hp-preview-pill" href="${esc((o.path || '/') + '?theme=original')}"><i aria-hidden="true"></i>Theme preview · switch back to the current site</a>` : ''}
<script src="${asset('/hp/theme.js')}" defer></script>
${js.map((k) => `<script src="${asset(`/hp/pages/${k}.js`)}" defer></script>`).join('\n')}
</body>
</html>`;
}

function ldOrg(s: Catalog['settings'], site: string) {
  const o = { '@context': 'https://schema.org', '@type': 'Organization', name: s.site_name || 'Globalhostia', url: site, logo: `${site}/image/logo-main-black.png`, telephone: s.phone || undefined, email: s.email || undefined, legalName: s.company || undefined,
    address: { '@type': 'PostalAddress', addressLocality: 'Dubai', addressCountry: 'AE' } };
  return `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>\n`;
}

/** Shared helper for page modules: "$X / month" text. */
export const priceText = (v: number, prefix = '$') => money(v, prefix);
