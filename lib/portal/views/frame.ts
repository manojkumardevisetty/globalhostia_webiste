// Portal frame: the site's Hostpen shell (utility bar, mega menu, footer) + the theme's charcoal page-hero band
// (hex texture, network canvas, breadcrumbs, gold kicker) as the account header, then a control-panel layout:
// left sidebar on desktop, bottom tab bar on mobile.
import { page } from '../../theme/shell';
import { breadcrumbs } from '../../theme/ui';
import type { PageCtx } from '../../theme/index';
import { esc, icon, initials, type Nav } from './kit';

export type Viewer = { name: string; email: string; clientId: number; csrf: string };

const NAV: { key: Nav; label: string; short: string; href: string; ic: string }[] = [
  { key: 'dashboard', label: 'Dashboard', short: 'Home', href: '/account', ic: 'grid' },
  { key: 'services', label: 'Products & Services', short: 'Products', href: '/account/services', ic: 'server' },
  { key: 'domains', label: 'Domains', short: 'Domains', href: '/account/domains', ic: 'globe' },
  { key: 'billing', label: 'Billing', short: 'Billing', href: '/account/invoices', ic: 'card' },
  { key: 'support', label: 'Support', short: 'Support', href: '/account/support', ic: 'headset' },
  { key: 'profile', label: 'Profile', short: 'Profile', href: '/account/profile', ic: 'user' },
];

const BUY: [string, string, string][] = [
  ['/web-hosting', 'Web hosting', 'layers'], ['/vps-hosting', 'VPS servers', 'cloud'], ['/dedicated-servers', 'Dedicated servers', 'server'],
  ['/domains-registration', 'Register a domain', 'globe'], ['/ssl-certificate', 'SSL certificates', 'shield'], ['/google-workspace', 'Business email', 'mail'],
];

const FLASH: Record<string, [string, 'ok' | 'err']> = {
  ns_saved: ['Nameservers updated. Changes can take up to 24 hours to spread across the internet.', 'ok'],
  ticket_opened: ['Ticket opened. Our team will reply by email and here in your account.', 'ok'],
  reply_sent: ['Reply sent.', 'ok'],
  profile_saved: ['Profile saved.', 'ok'],
  csrf: ['Your session form expired. Please try again.', 'err'],
  sso: ['We could not open that page right now. Please try again in a moment.', 'err'],
  failed: ['That change could not be saved. Please try again or contact support.', 'err'],
};

export const ctxFor = (path: string, query: URLSearchParams, title: string): PageCtx => ({
  slug: path.replace(/^\//, ''), path, preview: false, query, route: { kind: 'account', title, description: 'Manage your Globalhostia services, domains, invoices and support tickets.' },
});

export async function frame(o: {
  path: string; query: URLSearchParams; title: string; h1?: string; sub?: string; active: Nav; viewer: Viewer; body: string;
  crumbs?: { label: string; href?: string }[]; headAction?: string; heroExtra?: string;
}) {
  const v = o.viewer;
  const f = FLASH[o.query.get('ok') || o.query.get('err') || ''];
  const flash = f ? `<div class="ac-flash ac-flash--${f[1]}" role="${f[1] === 'ok' ? 'status' : 'alert'}">${icon(f[1] === 'ok' ? 'check' : 'alert')}<span>${esc(f[0])}</span></div>` : '';
  const crumbs: { label: string; href?: string }[] = [{ label: 'Home', href: '/' }];
  if (o.active === 'dashboard' && !o.crumbs?.length) crumbs.push({ label: 'My account' });
  else crumbs.push({ label: 'My account', href: '/account' }, ...(o.crumbs?.length ? o.crumbs : [{ label: o.title }]));
  const ini = initials(v.name, v.email);
  const navList = NAV.map((n) => `<li><a href="${n.href}"${n.key === o.active ? ' aria-current="page" class="is-on"' : ''}>${icon(n.ic)}<span>${n.label}</span></a></li>`).join('');

  const hero = `<section class="hp-hero hp-hero--page is-solo ac-hero" data-network aria-labelledby="ac-h1">
  <div class="hp-hero__hex" aria-hidden="true"></div>
  <div class="hp-container">
    <div class="hp-hero__copy">
      ${breadcrumbs(crumbs)}
      <span class="hp-kicker"><i aria-hidden="true"></i>My account<span class="ac-hero__id num">Customer #${esc(v.clientId)}</span></span>
      <h1 id="ac-h1">${esc(o.h1 || o.title)}</h1>
      ${o.sub ? `<p class="hp-lead">${o.sub}</p>` : ''}
    </div>
    <div class="ac-hero__a">
      ${o.headAction || ''}
      <details class="ac-dd ac-dd--buy"><summary class="hp-btn hp-btn--brand">${icon('plus')}Buy more</summary>
        <div class="ac-dd__menu" role="menu">${BUY.map(([h, l, i]) => `<a role="menuitem" href="${h}">${icon(i)}${l}</a>`).join('')}</div></details>
      <details class="ac-dd ac-dd--me"><summary class="ac-me" aria-label="Account menu for ${esc(v.name || v.email)}"><span class="ac-avatar ac-avatar--sm" aria-hidden="true">${esc(ini)}</span><span class="ac-me__n">${esc((v.name || v.email).split(' ')[0])}</span>${icon('chev')}</summary>
        <div class="ac-dd__menu" role="menu">
          <div class="ac-dd__who"><b>${esc(v.name)}</b><small>${esc(v.email)}</small></div>
          <a role="menuitem" href="/account/profile">${icon('user')}Profile</a>
          <form method="post" action="/account/sso"><input type="hidden" name="csrf" value="${esc(v.csrf)}"><input type="hidden" name="to" value="password"><button role="menuitem" type="submit">${icon('key')}Change password</button></form>
          <form method="post" action="/account/sso"><input type="hidden" name="csrf" value="${esc(v.csrf)}"><input type="hidden" name="to" value="home"><button role="menuitem" type="submit">${icon('settings')}Advanced settings</button></form>
          <form method="post" action="/account/logout"><input type="hidden" name="csrf" value="${esc(v.csrf)}"><button role="menuitem" type="submit" class="ac-dd__out">${icon('logout')}Sign out</button></form>
        </div></details>
    </div>
    ${o.heroExtra ? `<div class="ac-hero__x">${o.heroExtra}</div>` : ''}
  </div>
</section>`;

  const body = `${hero}<div class="ac" data-ac>
  <aside class="ac-side" aria-label="Account">
    <div class="ac-who"><span class="ac-avatar" aria-hidden="true">${esc(ini)}</span><div><b>${esc(v.name || 'Your account')}</b><small>${esc(v.email)}</small></div></div>
    <nav aria-label="Account sections"><ul class="ac-nav">${navList}</ul></nav>
    <div class="ac-side__help">
      <b>Need a hand?</b><p>Our engineers answer tickets around the clock.</p>
      <a class="hp-link" href="/account/support/new">Open a ticket${icon('arrow')}</a>
    </div>
  </aside>
  <div class="ac-main">${flash}<div class="ac-content">${o.body}</div></div>
  <nav class="ac-tabbar" aria-label="Account sections (mobile)">${NAV.filter((n) => n.key !== 'profile').map((n) =>
    `<a href="${n.href}"${n.key === o.active ? ' aria-current="page" class="is-on"' : ''}>${icon(n.ic)}<span>${n.short}</span></a>`).join('')}</nav>
</div>`;

  return page({
    ctx: ctxFor(o.path, o.query, o.title), path: o.path, title: `${o.title} · My account`, description: 'Your Globalhostia account.',
    css: ['account'], js: ['account'], bodyClass: 'ac-page', noindex: true, body,
  });
}

/** Signed-out pages (login, forgot): same shell, theme auth split layout. */
export async function guestFrame(o: { path: string; query: URLSearchParams; title: string; body: string }) {
  return page({
    ctx: ctxFor(o.path, o.query, o.title), path: o.path, title: o.title, description: 'Sign in to manage your Globalhostia services.',
    css: ['auth', 'account'], js: ['auth', 'account'], bodyClass: 'ac-page ac-page--guest au-page', noindex: true, body: o.body,
  });
}
