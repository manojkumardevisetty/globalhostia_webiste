// Portal frame: the site's Hostpen shell (utility bar, mega menu, footer) + the theme's charcoal page-hero band
// (hex texture, network canvas, breadcrumbs, gold kicker) as the account header, then a control-panel layout:
// left sidebar on desktop, bottom tab bar on mobile. Also: language (English / Arabic, RTL), the command palette
// shell (Ctrl/⌘+K), the install-app menu item, the portal web manifest and the customer assistant entry points
// (floating "Ask GlobalHostia" button, account menu item, palette action; account.js loads /hp/ai-assist.js on first use).
import { asset, page } from '../../theme/shell';
import { assistAvailable } from '../../ai/server';
import { portalPageContext } from '../../ai/assist-context';
import { breadcrumbs } from '../../theme/ui';
import type { PageCtx } from '../../theme/index';
import { esc, icon, initials, okMark, errMark, t, type Nav } from './kit';
import { clientStrings, isRtl, lang } from '../i18n';

export type Viewer = { name: string; email: string; clientId: number; csrf: string };

const NAV: () => { key: Nav; label: string; short: string; href: string; ic: string; tab?: boolean }[] = () => [
  { key: 'dashboard', label: t('Dashboard'), short: t('Home'), href: '/account', ic: 'grid', tab: true },
  { key: 'services', label: t('Products & Services'), short: t('Products'), href: '/account/services', ic: 'server', tab: true },
  { key: 'domains', label: t('Domains'), short: t('Domains'), href: '/account/domains', ic: 'globe', tab: true },
  { key: 'renewals', label: t('Renewals'), short: t('Renewals'), href: '/account/renewals', ic: 'refresh', tab: true },
  { key: 'billing', label: t('Billing'), short: t('Billing'), href: '/account/invoices', ic: 'card', tab: true },
  { key: 'support', label: t('Support'), short: t('Support'), href: '/account/support', ic: 'headset', tab: true },
  { key: 'reports', label: t('Site reports'), short: t('Reports'), href: '/account/reports', ic: 'chart' },
  { key: 'sell', label: t('Sell domains'), short: t('Sell'), href: '/account/sell', ic: 'tag' },
  { key: 'profile', label: t('Profile'), short: t('Profile'), href: '/account/profile', ic: 'user' },
  { key: 'team', label: t('Team access'), short: t('Team'), href: '/account/team', ic: 'users' },
  { key: 'settings', label: t('App & notifications'), short: t('Settings'), href: '/account/settings', ic: 'settings' },
];

const BUY: () => [string, string, string][] = () => [
  ['/web-hosting', t('Web hosting'), 'layers'], ['/vps-hosting', t('VPS servers'), 'cloud'], ['/dedicated-servers', t('Dedicated servers'), 'server'],
  ['/domains-registration', t('Register a domain'), 'globe'], ['/ssl-certificate', t('SSL certificates'), 'shield'], ['/google-workspace', t('Business email'), 'mail'],
];

const FLASH: () => Record<string, [string, 'ok' | 'err']> = () => ({
  ns_saved: [t('Nameservers updated. Changes can take up to 24 hours to spread across the internet.'), 'ok'],
  ticket_opened: [t('Ticket opened. Our team will reply by email and here in your account.'), 'ok'],
  reply_sent: [t('Reply sent.'), 'ok'],
  profile_saved: [t('Profile saved.'), 'ok'],
  csrf: [t('Your session form expired. Please try again.'), 'err'],
  sso: [t('We could not open that page right now. Please try again in a moment.'), 'err'],
  autorenew_on: [t('Auto-renew is on. The domain renews automatically before it expires.'), 'ok'],
  autorenew_off: [t('Auto-renew is off. Renew the domain yourself before it expires to keep it.'), 'ok'],
  autorenew_failed: [t('Auto-renew could not be changed right now. Please try again or contact support.'), 'err'],
  autorenew_state: [t('Auto-renew can only be changed while the domain is active or in its grace period.'), 'err'],
  rate: [t('Too many changes in a short time. Please wait a few minutes and try again.'), 'err'],
  nosel: [t('Select at least one domain to renew.'), 'err'],
  failed: [t('That change could not be saved. Please try again or contact support.'), 'err'],
  lang_saved: [t('Language updated.'), 'ok'],
  invited: [t('Invitation sent. It stays pending until the person accepts it from the email.'), 'ok'],
  perms_saved: [t('Permissions updated.'), 'ok'],
  removed: [t('Access removed.'), 'ok'],
  owner_only: [t('Only the account owner can manage team access.'), 'err'],
  bulk_nosel: [t('Select at least one domain first.'), 'err'],
  push_on: [t('Notifications are on for this device.'), 'ok'],
  push_off: [t('Notifications are off for this device.'), 'ok'],
  push_saved: [t('Your notification choices are saved.'), 'ok'],
  push_test: [t('Test notification sent.'), 'ok'],
  push_none: [t('No device received the test. Turn notifications on for this device first.'), 'err'],
  push_bad: [t('Something went wrong. Please try again.'), 'err'],
  push_unavailable: [t('Notifications are not available yet. Please check back soon.'), 'err'],
});

export const ctxFor = (path: string, query: URLSearchParams, title: string): PageCtx => ({
  slug: path.replace(/^\//, ''), path, preview: false, query, route: { kind: 'account', title, description: 'Manage your Globalhostia services, domains, invoices and support tickets.' },
});

/** Arabic font (only when Arabic is active) + the portal's own web manifest (installable app scoped to /account). */
function headExtra() {
  const font = isRtl()
    ? '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">'
    : '';
  return `${font}<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="GlobalHostia"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`;
}

/** The shell writes <html lang="en"> and the site manifest: the portal swaps in its language/direction and its own manifest. */
export function localize(html: string) {
  const l = lang();
  return html
    .replace('<html lang="en">', l === 'ar' ? '<html lang="ar" dir="rtl">' : '<html lang="en" dir="ltr">')
    .replace('<link rel="manifest" href="/site.webmanifest">', '<link rel="manifest" href="/account.webmanifest">');
}

/** The assistant's hexagon avatar (same mark as the website chat). */
const AI_HEX = '<svg class="ac-ask__hex" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path d="M20 2.5 35.2 11.25v17.5L20 37.5 4.8 28.75v-17.5z" fill="#c5386f"/><path d="M20 8.6 29.9 14.3v11.4L20 31.4l-9.9-5.7V14.3z" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.4"/><circle cx="14.6" cy="20" r="2.1" fill="#fff"/><circle cx="20" cy="20" r="2.1" fill="#fff"/><circle cx="25.4" cy="20" r="2.1" fill="#fff"/></svg>';

const langSwitch = (v: Viewer, path: string) => {
  const to = lang() === 'ar' ? 'en' : 'ar';
  return `<form method="post" action="/account/lang"><input type="hidden" name="csrf" value="${esc(v.csrf)}"><input type="hidden" name="lang" value="${to}"><input type="hidden" name="next" value="${esc(path)}"><button role="menuitem" type="submit" lang="${to}">${icon('globe')}${to === 'ar' ? 'العربية' : 'English'}</button></form>`;
};

/** Command palette (filled by account.js) and the iOS "Add to Home Screen" sheet. */
const overlays = () => `<dialog class="ac-pal" id="ac-pal" aria-label="${esc(t('Search your account'))}">
  <div class="ac-pal__box">
    <div class="ac-pal__in">${icon('search')}<input id="ac-pal-q" type="text" role="combobox" aria-expanded="false" aria-controls="ac-pal-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="${esc(t('Search pages, services, domains, invoices…'))}" aria-label="${esc(t('Search your account'))}"><button type="button" class="ac-pal__x" data-pal-close aria-label="${esc(t('Close'))}">${icon('close')}</button></div>
    <ul class="ac-pal__list" id="ac-pal-list" role="listbox" aria-label="${esc(t('Results'))}"></ul>
    <p class="ac-pal__foot"><span><kbd>↑</kbd><kbd>↓</kbd> ${esc(t('to navigate'))}</span><span><kbd>↵</kbd> ${esc(t('to open'))}</span><span><kbd>Esc</kbd> ${esc(t('to close'))}</span></p>
  </div>
</dialog>
<dialog class="ac-sheet" id="ac-ios" aria-labelledby="ac-ios-h">
  <div class="ac-sheet__box">
    <h2 id="ac-ios-h">${esc(t('Install GlobalHostia on your iPhone or iPad'))}</h2>
    <ol class="ac-sheet__steps">
      <li><b>1</b><span>${t('Open this page in <strong>Safari</strong>.')}</span></li>
      <li><b>2</b><span>${t('Tap the <strong>Share</strong> button at the bottom of the screen.')}</span></li>
      <li><b>3</b><span>${t('Choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.')}</span></li>
    </ol>
    <p class="ac-muted">${esc(t('GlobalHostia then opens full screen from your home screen, like any other app.'))}</p>
    <form method="dialog"><button class="hp-btn hp-btn--dark hp-btn--block">${esc(t('Got it'))}</button></form>
  </div>
</dialog>`;

export async function frame(o: {
  path: string; query: URLSearchParams; title: string; h1?: string; sub?: string; active: Nav; viewer: Viewer; body: string;
  crumbs?: { label: string; href?: string }[]; headAction?: string; heroExtra?: string;
  /** what the assistant should target on this page (domain / service detail pages) */
  ai?: { domainId?: number; domain?: string; serviceId?: number };
}) {
  const v = o.viewer;
  // customer assistant: hidden entirely when switched off in Admin > AI assistant (or no API key)
  const aiOn = await assistAvailable();
  const aiCtx = aiOn ? portalPageContext(o.active, o.path, o.ai) : null;
  const aiAttrs = aiCtx ? ` data-ai="1" data-ai-page="${aiCtx.page}"${aiCtx.domain ? ` data-ai-domain="${esc(aiCtx.domain)}"` : ''}${aiCtx.domainId ? ` data-ai-domain-id="${aiCtx.domainId}"` : ''}${aiCtx.serviceId ? ` data-ai-service-id="${aiCtx.serviceId}"` : ''}${aiCtx.invoiceId ? ` data-ai-invoice-id="${aiCtx.invoiceId}"` : ''} data-ai-js="${esc(asset('/hp/ai-assist.js'))}" data-ai-css="${esc(asset('/hp/ai-assist.css'))}"` : '';
  const fk = o.query.get('ok') || o.query.get('err') || '';
  const f = FLASH()[fk];
  // failures that a retry may not fix get a way to reach a person; a stale form gets a fresh page
  const help = f?.[1] === 'err' && ['sso', 'failed', 'autorenew_failed', 'push_bad', 'push_unavailable'].includes(fk)
    ? ` <a class="ac-flash__a" href="/account/support/new">${esc(t('Contact support'))}</a>` : f?.[1] === 'err' && fk === 'csrf' ? ` <a class="ac-flash__a" href="${esc(o.path)}">${esc(t('Reload the page'))}</a>` : '';
  const flash = f ? `<div class="ac-flash ac-flash--${f[1]}" role="${f[1] === 'ok' ? 'status' : 'alert'}" data-flash="${esc(fk)}">${f[1] === 'ok' ? okMark() : errMark()}<span>${esc(f[0])}${help}</span></div>` : '';
  const crumbs: { label: string; href?: string }[] = [{ label: t('Home'), href: '/' }];
  if (o.active === 'dashboard' && !o.crumbs?.length) crumbs.push({ label: t('My account') });
  else crumbs.push({ label: t('My account'), href: '/account' }, ...(o.crumbs?.length ? o.crumbs : [{ label: o.title }]));
  const ini = initials(v.name, v.email);
  const nav = NAV();
  const navList = nav.map((n) => `<li><a href="${n.href}"${n.key === o.active ? ' aria-current="page" class="is-on"' : ''}>${icon(n.ic)}<span>${esc(n.label)}</span></a></li>`).join('');
  const mac = '<span class="ac-kbd" aria-hidden="true"><kbd data-mod>Ctrl</kbd><kbd>K</kbd></span>';

  const hero = `<section class="hp-hero hp-hero--page is-solo ac-hero" data-network aria-labelledby="ac-h1">
  <div class="hp-hero__hex" aria-hidden="true"></div>
  <div class="hp-container">
    <div class="hp-hero__copy">
      ${breadcrumbs(crumbs)}
      <span class="hp-kicker"><i aria-hidden="true"></i>${esc(t('My account'))}<span class="ac-hero__id num">${esc(t('Customer #{n}', { n: v.clientId }))}</span></span>
      <h1 id="ac-h1">${esc(o.h1 || o.title)}</h1>
      ${o.sub ? `<p class="hp-lead">${o.sub}</p>` : ''}
    </div>
    <div class="ac-hero__a">
      <button type="button" class="ac-search" data-ac-palette aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K" title="${esc(t('Search your account'))}">${icon('search')}<span class="ac-search__l">${esc(t('Search'))}</span>${mac}</button>
      ${o.headAction || ''}
      <details class="ac-dd ac-dd--buy"><summary class="hp-btn ${o.headAction ? 'hp-btn--ghost' : 'hp-btn--brand'}">${icon('plus')}${esc(t('Buy more'))}</summary>
        <div class="ac-dd__menu" role="menu">${BUY().map(([h, l, i]) => `<a role="menuitem" href="${h}">${icon(i)}${esc(l)}</a>`).join('')}</div></details>
      <details class="ac-dd ac-dd--me"><summary class="ac-me"><span class="ac-avatar ac-avatar--sm" aria-hidden="true">${esc(ini)}</span><span class="ac-me__n">${esc((v.name || v.email).split(' ')[0])}</span><span class="sr-only"> ${esc(t('Account menu'))}</span>${icon('chev')}</summary>
        <div class="ac-dd__menu" role="menu">
          <div class="ac-dd__who"><b>${esc(v.name)}</b><small>${esc(v.email)}</small></div>
          ${aiOn ? `<button role="menuitem" type="button" data-ac-ask aria-haspopup="dialog" hidden>${AI_HEX}${esc(t('Ask the assistant'))}</button>` : ''}
          <a role="menuitem" href="/account/profile">${icon('user')}${esc(t('Profile'))}</a>
          <a role="menuitem" href="/account/team">${icon('users')}${esc(t('Team access'))}</a>
          <a role="menuitem" href="/account/settings">${icon('bell')}${esc(t('App & notifications'))}</a>
          <button role="menuitem" type="button" data-ac-install hidden>${icon('download')}${esc(t('Install app'))}</button>
          ${langSwitch(v, o.path)}
          <form method="post" action="/account/sso"><input type="hidden" name="csrf" value="${esc(v.csrf)}"><input type="hidden" name="to" value="password"><button role="menuitem" type="submit">${icon('key')}${esc(t('Change password'))}</button></form>
          <form method="post" action="/account/sso"><input type="hidden" name="csrf" value="${esc(v.csrf)}"><input type="hidden" name="to" value="home"><button role="menuitem" type="submit">${icon('settings')}${esc(t('Advanced settings'))}</button></form>
          <form method="post" action="/account/logout" data-ac-logout><input type="hidden" name="csrf" value="${esc(v.csrf)}"><button role="menuitem" type="submit" class="ac-dd__out">${icon('logout')}${esc(t('Sign out'))}</button></form>
        </div></details>
    </div>
    ${o.heroExtra ? `<div class="ac-hero__x">${o.heroExtra}</div>` : ''}
  </div>
</section>`;

  const body = `${hero}<div class="ac" data-ac data-lang="${lang()}" data-cid="${esc(v.clientId)}"${aiAttrs}>
  <aside class="ac-side" aria-label="${esc(t('Account'))}">
    <div class="ac-who"><span class="ac-avatar" aria-hidden="true">${esc(ini)}</span><div><b>${esc(v.name || t('Your account'))}</b><small>${esc(v.email)}</small></div></div>
    <nav aria-label="${esc(t('Account sections'))}"><ul class="ac-nav">${navList}</ul></nav>
    <div class="ac-side__help">
      <b>${esc(t('Need a hand?'))}</b><p>${esc(t('Our engineers answer tickets around the clock.'))}</p>
      <a class="hp-link" href="/account/support/new">${esc(t('Open a ticket'))}${icon('arrow')}</a>
    </div>
  </aside>
  <div class="ac-main">${flash}<div class="ac-content">${o.body}</div></div>
  <nav class="ac-tabbar" aria-label="${esc(t('Account sections (mobile)'))}">${nav.filter((n) => n.tab).map((n) =>
    `<a href="${n.href}"${n.key === o.active ? ' aria-current="page" class="is-on"' : ''}>${icon(n.ic)}<span>${esc(n.short)}</span></a>`).join('')}</nav>
</div>${aiOn ? `<button type="button" class="ac-ask" data-ac-ask aria-haspopup="dialog" hidden>${AI_HEX}<span>${esc(t('Ask GlobalHostia'))}</span></button>` : ''}${overlays()}<script type="application/json" id="ac-i18n">${JSON.stringify(clientStrings()).replace(/</g, '\\u003c')}</script>`;

  return localize(await page({
    ctx: ctxFor(o.path, o.query, o.title), path: o.path, title: `${o.title} · ${t('My account')}`, description: 'Your GlobalHostia account: hosting, domains, invoices, DNS, email and support tickets in one place.',
    css: ['account'], js: ['account'], bodyClass: `ac-page${isRtl() ? ' ac-rtl' : ''}`, noindex: true, body, headExtra: headExtra(),
    // signed in, the customer assistant replaces the website's pre-sales chat
    aiChat: !aiOn,
  }));
}

/** Signed-out pages (login, forgot): same shell, theme auth split layout. */
export async function guestFrame(o: { path: string; query: URLSearchParams; title: string; body: string }) {
  return localize(await page({
    ctx: ctxFor(o.path, o.query, o.title), path: o.path, title: lang() === 'ar' ? `${o.title}: منطقة عملاء GlobalHostia` : `${o.title}: GlobalHostia client area`,
    description: lang() === 'ar' ? 'سجّل الدخول إلى منطقة عملاء GlobalHostia لإدارة الاستضافة والنطاقات والفواتير وسجلات DNS والبريد وتذاكر الدعم.'
      : 'Sign in to the GlobalHostia client area to manage your hosting, domains, invoices, DNS, email and support tickets.',
    css: ['auth', 'account'], js: ['auth', 'account'], bodyClass: `ac-page ac-page--guest au-page${isRtl() ? ' ac-rtl' : ''}`, noindex: true, body: o.body, headExtra: headExtra(),
  }));
}
