// Signed-out views (sign in, password reset) in the theme's auth split layout (same as /sign-in).
import { breadcrumbs, hexIcon } from '../../theme/ui';
import { esc, icon } from './kit';

export type LoginState = { email?: string; error?: 'invalid' | 'locked' | 'down' | 'tfa' | 'noclient' | 'origin'; next?: string; secureUrl: string; reset?: boolean; signedOut?: boolean };

const ERR: Record<NonNullable<LoginState['error']>, string> = {
  invalid: 'That email and password combination did not match an account. Check both and try again.',
  locked: 'Too many sign-in attempts. Wait 15 minutes, then try again or reset your password.',
  down: 'Sign-in is temporarily unavailable. Please try again in a few minutes.',
  tfa: '',
  noclient: 'That email and password combination did not match an account. Check both and try again.',
  origin: 'Your sign-in form expired. Please try again.',
};

/** Email + password form posting to /account/login. Shared by /account/login and the theme's /sign-in page. */
export function signInForm(o: { email?: string; next?: string; autofocusPw?: boolean } = {}) {
  return `<form class="au-form" method="post" action="/account/login" novalidate data-ac-busy>
      ${o.next ? `<input type="hidden" name="next" value="${esc(o.next)}">` : ''}
      <label class="au-label" for="au-email">Email address</label>
      <div class="au-field">${icon('mail')}<input class="hp-input" id="au-email" name="email" type="email" autocomplete="username" inputmode="email" spellcheck="false" required placeholder="you@company.com" value="${esc(o.email || '')}"></div>
      <div class="ac-lrow"><label class="au-label" for="au-pass">Password</label><a href="/account/forgot">Forgot password?</a></div>
      <div class="au-field ac-pw">${icon('lock')}<input class="hp-input" id="au-pass" name="password" type="password" autocomplete="current-password" required${o.autofocusPw ? ' autofocus' : ''}>
        <button type="button" class="ac-pw__t" data-ac-pw aria-label="Show password" aria-pressed="false">${icon('eye')}</button></div>
      <button class="hp-btn hp-btn--brand hp-btn--block hp-btn--lg" type="submit">Sign in</button>
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

function split(o: { crumb: string; statement: string; lead: string; items: [string, string, string][]; card: string }) {
  return `<section class="au-split" aria-labelledby="au-h1">
    <div class="au-brand">
      <div class="au-brand__bg" aria-hidden="true"></div>${hexNet()}
      <div class="au-brand__in">
        <p class="au-kicker"><i aria-hidden="true"></i>Globalhostia account</p>
        <p class="au-statement">${esc(o.statement)}</p>
        <p class="au-lead">${esc(o.lead)}</p>
        <ul class="au-benefits">${o.items.map(([ic, t, d], i) => `<li style="--i:${i}">${hexIcon(ic)}<span><b>${esc(t)}</b><small>${esc(d)}</small></span></li>`).join('')}</ul>
        <p class="au-trust">${icon('shield')}<span>Encrypted with HTTPS. Your password is never stored on this website.</span></p>
      </div>
    </div>
    <div class="au-main">
      ${breadcrumbs([{ label: 'Home', href: '/' }, { label: 'My account', href: '/account' }, { label: o.crumb }], { light: true })}
      <div class="au-card">${o.card}</div>
    </div>
  </section>`;
}

const SIGNIN_ITEMS: [string, string, string][] = [
  ['server', 'Products and servers', 'Status, IP addresses, renewal dates and one-click access to your control panel.'],
  ['globe', 'Domains', 'Expiry dates, auto-renew and nameservers you can change yourself.'],
  ['card', 'Billing and support', 'Invoices, secure payment and tickets answered around the clock.'],
];

export function loginView(s: LoginState) {
  const tfa = s.error === 'tfa';
  const alert = s.error && !tfa ? `<div class="ac-alert ac-alert--err" role="alert">${icon('alert')}<span>${esc(ERR[s.error])}</span></div>`
    : tfa ? `<div class="ac-alert ac-alert--info" role="alert">${icon('lock')}<span>Your account uses two-step verification. <a href="${esc(s.secureUrl)}">Continue on our secure sign-in page</a> to enter your code.</span></div>`
    : s.signedOut ? `<div class="ac-alert ac-alert--ok" role="status">${icon('check')}<span>You have signed out.</span></div>` : '';
  return split({
    crumb: 'Sign in', statement: 'Everything you host, in one place.', lead: 'Manage services, pay invoices and talk to our engineers from your account.', items: SIGNIN_ITEMS,
    card: `<h1 class="au-h1" id="au-h1">Sign in</h1>
      <p class="au-sub">Use the email address and password on your Globalhostia account.</p>
      ${alert ? `<div class="ac-gap">${alert}</div>` : ''}
      ${signInForm({ email: s.email, next: s.next, autofocusPw: !!s.email && !!s.error })}
      <div class="au-links"><a href="/account/forgot">Forgot your password?</a><a href="/sign-up">Create an account</a></div>
      <p class="au-secure">${icon('lock')}<span>You stay signed in for up to 8 hours on this device. Use <b>Sign out</b> in the account menu on shared computers.</span></p>`,
  });
}

export function forgotView(s: { email?: string; sent?: boolean; error?: 'origin' | 'invalid' }) {
  const card = s.sent
    ? `<h1 class="au-h1" id="au-h1">Check your email</h1>
      <div class="ac-gap"><div class="ac-alert ac-alert--ok" role="status">${icon('check')}<span>If <b>${esc(s.email || 'that address')}</b> is on an account, we have sent a link to reset your password. It can take a few minutes. Check your spam folder too.</span></div></div>
      <a class="hp-btn hp-btn--brand hp-btn--block hp-btn--lg" href="/account/login">Back to sign in</a>
      <div class="au-links"><a href="/account/forgot">Send another link</a><a href="/help-center">Contact support</a></div>`
    : `<h1 class="au-h1" id="au-h1">Reset your password</h1>
      <p class="au-sub">Enter the email address on your account and we'll send you a link to choose a new password.</p>
      ${s.error ? `<div class="ac-gap"><div class="ac-alert ac-alert--err" role="alert">${icon('alert')}<span>${s.error === 'invalid' ? 'Enter a valid email address.' : 'Your form expired. Please try again.'}</span></div></div>` : ''}
      <form class="au-form" method="post" action="/account/forgot" novalidate data-ac-busy>
        <label class="au-label" for="au-email">Email address</label>
        <div class="au-field">${icon('mail')}<input class="hp-input" id="au-email" name="email" type="email" autocomplete="email" inputmode="email" spellcheck="false" required placeholder="you@company.com" value="${esc(s.email || '')}"></div>
        <button class="hp-btn hp-btn--brand hp-btn--block hp-btn--lg" type="submit">${icon('key')}Send reset link</button>
      </form>
      <div class="au-links"><a href="/account/login">Back to sign in</a><a href="/help-center">Contact support</a></div>`;
  return split({
    crumb: 'Reset password', statement: 'Locked out? You will be back in shortly.', lead: 'We email a one-time link so only you can choose a new password.',
    items: [['mail', 'Reset link by email', 'Sent to the address on your account within a few minutes.'], ['key', 'Choose a new password', 'Pick a strong password you do not use anywhere else.'], ['headset', 'Still stuck?', 'Our support team can verify your identity and help you back in.']],
    card,
  });
}
