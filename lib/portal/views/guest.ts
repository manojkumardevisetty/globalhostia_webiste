// Signed-out views (sign in, password reset) in the theme's auth split layout (same as /sign-in).
import { breadcrumbs, hexIcon } from '../../theme/ui';
import { esc, icon, okMark, errMark, t } from './kit';
import { lang } from '../i18n';

export type LoginState = { email?: string; error?: 'invalid' | 'locked' | 'down' | 'tfa' | 'noclient' | 'origin'; next?: string; secureUrl: string; reset?: boolean; signedOut?: boolean };

const ERR = (): Record<NonNullable<LoginState['error']>, string> => ({
  invalid: t('That email and password combination did not match an account. Check both and try again.'),
  locked: t('Too many sign-in attempts. Wait 15 minutes, then try again or reset your password.'),
  down: t('Sign-in is temporarily unavailable. Please try again in a few minutes.'),
  tfa: '',
  noclient: t('That email and password combination did not match an account. Check both and try again.'),
  origin: t('Your sign-in form expired. Please try again.'),
});

/** Email + password form posting to /account/login. Shared by /account/login and the theme's /sign-in page. */
export function signInForm(o: { email?: string; next?: string; autofocusPw?: boolean; invalid?: boolean } = {}) {
  // wrong email/password: both fields are marked invalid and point at the message above the form
  const bad = o.invalid ? ' aria-invalid="true" aria-describedby="au-err"' : '';
  return `<form class="au-form" method="post" action="/account/login" novalidate data-ac-busy>
      ${o.next ? `<input type="hidden" name="next" value="${esc(o.next)}">` : ''}
      <label class="au-label" for="au-email">${esc(t('Email address'))}</label>
      <div class="au-field">${icon('mail')}<input class="hp-input" id="au-email" name="email" type="email" autocomplete="username" inputmode="email" spellcheck="false" required placeholder="you@company.com" value="${esc(o.email || '')}"${bad}></div>
      <div class="ac-lrow"><label class="au-label" for="au-pass">${esc(t('Password'))}</label><a href="/account/forgot">${esc(t('Forgot password?'))}</a></div>
      <div class="au-field ac-pw">${icon('lock')}<input class="hp-input" id="au-pass" name="password" type="password" autocomplete="current-password" required${o.autofocusPw ? ' autofocus' : ''}${bad}>
        <button type="button" class="ac-pw__t" data-ac-pw aria-label="${esc(t('Show password'))}" data-show="${esc(t('Show password'))}" data-hide="${esc(t('Hide password'))}" aria-pressed="false">${icon('eye')}</button></div>
      <button class="hp-btn hp-btn--brand hp-btn--block hp-btn--lg" type="submit">${esc(t('Sign in'))}</button>
    </form>`;
}

/** Hexagon network for the brand panel (same drawing as the theme auth pages). */
export function hexNet() {
  const R = 34, W = R * Math.sqrt(3);
  const nodes: [number, number][] = [];
  for (let row = 0; row < 7; row++) for (let col = 0; col < 6; col++) nodes.push([col * W + (row % 2 ? W / 2 : 0) + 20, row * R * 1.5 + 24]);
  const hex = (x: number, y: number) => `M${x} ${y - R}L${(x + W / 2).toFixed(1)} ${y - R / 2}L${(x + W / 2).toFixed(1)} ${y + R / 2}L${x} ${y + R}L${(x - W / 2).toFixed(1)} ${y + R / 2}L${(x - W / 2).toFixed(1)} ${y - R / 2}Z`;
  const lit = [7, 14, 16, 21, 27, 30, 35];
  const path = 'M' + lit.map((i) => nodes[i].map((v) => v.toFixed(1)).join(' ')).join(' L');
  return `<svg class="au-net" viewBox="0 0 380 330" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
    <g class="au-net__hex">${nodes.map(([x, y]) => `<path d="${hex(x, y)}"/>`).join('')}</g>
    <path class="au-net__link" d="${path}" pathLength="100"/>
    <g class="au-net__nodes">${lit.map((i, k) => `<circle cx="${nodes[i][0].toFixed(1)}" cy="${nodes[i][1].toFixed(1)}" r="5" style="--k:${k}"/>`).join('')}</g>
  </svg>`;
}

/** Language switch on the signed-out pages: a plain link (only sets the gh_lang preference cookie, then returns here). */
const langLink = (path: string) => {
  const to = lang() === 'ar' ? 'en' : 'ar';
  return `<a class="ac-lang" href="/account/lang?set=${to}&amp;next=${esc(encodeURIComponent(path))}" lang="${to}" hreflang="${to}">${icon('globe')}${to === 'ar' ? 'العربية' : 'English'}</a>`;
};

function split(o: { crumb: string; statement: string; lead: string; items: [string, string, string][]; card: string; path: string }) {
  return `<section class="au-split" aria-labelledby="au-h1">
    <div class="au-brand">
      <div class="au-brand__bg" aria-hidden="true"></div>${hexNet()}
      <div class="au-brand__in">
        <p class="au-kicker"><i aria-hidden="true"></i>${esc(t('Globalhostia account'))}</p>
        <p class="au-statement">${esc(o.statement)}</p>
        <p class="au-lead">${esc(o.lead)}</p>
        <ul class="au-benefits">${o.items.map(([ic, t, d], i) => `<li style="--i:${i}">${hexIcon(ic)}<span><b>${esc(t)}</b><small>${esc(d)}</small></span></li>`).join('')}</ul>
        <p class="au-trust">${icon('shield')}<span>${esc(t('Encrypted with HTTPS. Your password is never stored on this website.'))}</span></p>
      </div>
    </div>
    <div class="au-main">
      ${breadcrumbs([{ label: t('Home'), href: '/' }, { label: t('My account'), href: '/account' }, { label: o.crumb }], { light: true })}
      <div class="au-card">${langLink(o.path)}${o.card}</div>
    </div>
  </section>`;
}

const SIGNIN_ITEMS = (): [string, string, string][] => [
  ['server', t('Products and servers'), t('Status, IP addresses, renewal dates and one-click access to your control panel.')],
  ['globe', t('Domains'), t('Expiry dates, auto-renew and nameservers you can change yourself.')],
  ['card', t('Billing and support'), t('Invoices, secure payment and tickets answered around the clock.')],
];

export function loginView(s: LoginState) {
  const tfa = s.error === 'tfa';
  const alert = s.error && !tfa ? `<div class="ac-alert ac-alert--err" role="alert" id="au-err">${errMark()}<span>${esc(ERR()[s.error])}</span></div>`
    : tfa ? `<div class="ac-alert ac-alert--info" role="alert">${icon('lock')}<span>${t('Your account uses two-step verification. <a href="{u}">Continue on our secure sign-in page</a> to enter your code.', { u: esc(s.secureUrl) })}</span></div>`
    : s.signedOut ? `<div class="ac-alert ac-alert--ok" role="status">${okMark()}<span>${esc(t('You have signed out.'))}</span></div>` : '';
  return split({
    path: '/account/login', crumb: t('Sign in'), statement: t('Everything you host, in one place.'), lead: t('Manage services, pay invoices and talk to our engineers from your account.'), items: SIGNIN_ITEMS(),
    card: `<h1 class="au-h1" id="au-h1">${esc(t('Sign in'))}</h1>
      <p class="au-sub">${esc(t('Use the email address and password on your Globalhostia account.'))}</p>
      ${alert ? `<div class="ac-gap">${alert}</div>` : ''}
      ${signInForm({ email: s.email, next: s.next, autofocusPw: !!s.email && !!s.error, invalid: s.error === 'invalid' || s.error === 'noclient' })}
      <div class="au-links"><a href="/account/forgot">${esc(t('Forgot your password?'))}</a><a href="/sign-up">${esc(t('Create an account'))}</a></div>
      <p class="au-secure">${icon('lock')}<span>${t('You stay signed in for up to 8 hours on this device. Use <b>Sign out</b> in the account menu on shared computers.')}</span></p>`,
  });
}

export function forgotView(s: { email?: string; sent?: boolean; error?: 'origin' | 'invalid' }) {
  const card = s.sent
    ? `<h1 class="au-h1" id="au-h1">${esc(t('Check your email'))}</h1>
      <div class="ac-gap"><div class="ac-alert ac-alert--ok ac-alert--fx" role="status">${okMark()}<span>${t('If <b>{e}</b> is on an account, we have sent a link to reset your password. It can take a few minutes. Check your spam folder too.', { e: esc(s.email || t('that address')) })}</span></div></div>
      <a class="hp-btn hp-btn--brand hp-btn--block hp-btn--lg" href="/account/login">${esc(t('Back to sign in'))}</a>
      <div class="au-links"><a href="/account/forgot">${esc(t('Send another link'))}</a><a href="/help-center">${esc(t('Contact support'))}</a></div>`
    : `<h1 class="au-h1" id="au-h1">${esc(t('Reset your password'))}</h1>
      <p class="au-sub">${esc(t("Enter the email address on your account and we'll send you a link to choose a new password."))}</p>
      ${s.error ? `<div class="ac-gap"><div class="ac-alert ac-alert--err" role="alert" id="au-err">${errMark()}<span>${esc(s.error === 'invalid' ? t('Enter a valid email address.') : t('Your form expired. Please try again.'))}</span></div></div>` : ''}
      <form class="au-form" method="post" action="/account/forgot" novalidate data-ac-busy>
        <label class="au-label" for="au-email">${esc(t('Email address'))}</label>
        <div class="au-field">${icon('mail')}<input class="hp-input" id="au-email" name="email" type="email" autocomplete="email" inputmode="email" spellcheck="false" required placeholder="you@company.com" value="${esc(s.email || '')}"${s.error === 'invalid' ? ' aria-invalid="true" aria-describedby="au-err" autofocus' : ''}></div>
        <button class="hp-btn hp-btn--brand hp-btn--block hp-btn--lg" type="submit">${icon('key')}${esc(t('Send reset link'))}</button>
      </form>
      <div class="au-links"><a href="/account/login">${esc(t('Back to sign in'))}</a><a href="/help-center">${esc(t('Contact support'))}</a></div>`;
  return split({
    path: '/account/forgot', crumb: t('Reset password'), statement: t('Locked out? You will be back in shortly.'), lead: t('We email a one-time link so only you can choose a new password.'),
    items: [['mail', t('Reset link by email'), t('Sent to the address on your account within a few minutes.')], ['key', t('Choose a new password'), t('Pick a strong password you do not use anywhere else.')], ['headset', t('Still stuck?'), t('Our support team can verify your identity and help you back in.')]],
    card,
  });
}
