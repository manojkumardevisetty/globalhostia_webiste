// Sign in / create account / reset password. Sign-in posts to our own account portal (/account/login), which
// validates against the billing system server-side. Sign-up still hands off to the secure registration page.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { getCatalog, whmcsLinks, minFrom, productsFor, fmt } from '../data';
import { page } from '../shell';
import { signInForm } from '../../portal/views/guest';
import { breadcrumbs, breadcrumbJsonLd, button, icon, hexIcon, faq, faqJsonLd, sectionHead, type IconName } from '../ui';

type Mode = 'sign-in' | 'sign-up' | 'forget-password';

/** Animated hexagon network for the brand panel (SVG; CSS draws the links and lights the nodes). */
function hexNet() {
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

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const L = whmcsLinks(cat.base);
  const s = cat.settings;
  const mode = (['sign-in', 'sign-up', 'forget-password'].includes(ctx.slug) ? ctx.slug : 'sign-in') as Mode;
  const host = cat.base.replace(/^https?:\/\//, '');
  const company = String(s.company || 'Desert Tech Cloud Services LLC');
  const phone = String(s.phone || ''), email = String(s.email || '');
  const site = String(s.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const crumbs = [{ label: 'Home', href: '/' }, { label: ctx.route.title }];

  const panel: Record<Mode, { title: string; lead: string; items: [IconName, string, string][] }> = {
    'sign-in': {
      title: 'Everything you host, in one place.',
      lead: 'Your client area is where you manage services, pay invoices and talk to our engineers.',
      items: [
        ['server', 'Manage every service', 'Hosting, servers, domains and SSL certificates with their login details and renewal dates.'],
        ['card', 'Invoices and payments', 'See what is due, pay by card or another supported method, and download receipts.'],
        ['headset', 'Support tickets', 'Open a ticket at any hour and follow the conversation with our team.'],
      ],
    },
    'sign-up': {
      title: 'One account for all your hosting.',
      lead: 'Create your account once and use it for every plan, domain and invoice.',
      items: [
        ['rocket', 'Order in minutes', 'Hosting and domains are set up automatically after payment, with details sent by email.'],
        ['globe', 'Domains and DNS', 'Register, transfer and renew domains, and change nameservers yourself.'],
        ['shield', 'Secure by default', 'Your account and payments are handled in our secure client area over HTTPS.'],
      ],
    },
    'forget-password': {
      title: 'Locked out? You will be back in shortly.',
      lead: 'We email you a one-time link so only you can choose a new password.',
      items: [
        ['mail', 'Reset link by email', 'We send a one-time link to the email address on your account.'],
        ['key', 'Choose a new password', 'Pick a strong password you do not use anywhere else.'],
        ['headset', 'Still stuck?', 'Our support team can help you confirm your identity and regain access.'],
      ],
    },
  };
  const P = panel[mode];

  /* card */
  let card = '';
  if (mode === 'sign-in') {
    card = `<h1 class="au-h1">Sign in</h1>
    <p class="au-sub">Use the email address and password on your Globalhostia account.</p>
    ${signInForm()}
    <div class="au-links"><a href="/account/forgot">Forgot your password?</a><a href="/sign-up">Create an account</a></div>`;
  } else if (mode === 'sign-up') {
    const host_ = minFrom(productsFor(cat, ['hosting-usa', 'hostia-shared', 'hosting-singapore']), cat.currency);
    const routes: [string, string, IconName, string][] = [
      ['/web-hosting', 'Web hosting', 'globe', host_ ? `from ${fmt(host_.price, host_.prefix)}${host_.months === 12 ? ' / year' : host_.months === 1 ? ' / month' : ''}` : 'NVMe hosting'],
      ['/vps-hosting', 'VPS hosting', 'cloud', 'Linux or Windows'],
      ['/dedicated-servers', 'Dedicated servers', 'server', 'Bare metal'],
      ['/domains-registration', 'Domains', 'at', 'Search and register'],
    ];
    card = `<h1 class="au-h1">Create your account</h1>
    <p class="au-sub">Accounts are created in our secure client area. It takes about a minute and you can order straight away.</p>
    <ul class="au-get">${['Manage hosting, servers and domains from one login', 'Invoices, receipts and renewals in one place', 'Support tickets answered around the clock'].map((t) => `<li>${icon('check')}${esc(t)}</li>`).join('')}</ul>
    ${button({ label: 'Create account on our client area', href: L.register, icon: 'user', attrs: 'data-au-primary' }).replace('hp-btn--brand', 'hp-btn--brand hp-btn--block hp-btn--lg')}
    <div class="au-or"><span>or start by choosing a plan</span></div>
    <ul class="au-routes">${routes.map(([href, label, ic, sub]) => `<li><a href="${esc(href)}">${hexIcon(ic)}<span><b>${esc(label)}</b><small class="num">${esc(sub)}</small></span>${icon('right')}</a></li>`).join('')}</ul>
    <p class="au-sub au-sub--sm">You create your account during checkout. Already a customer? <a href="/sign-in">Sign in</a></p>`;
  } else {
    card = `<h1 class="au-h1">Reset your password</h1>
    <p class="au-sub">Here is how it works. It takes a couple of minutes.</p>
    <ol class="au-steps">${[
      ['Enter your email', 'Use the address you signed up with.'],
      ['Open the link we send', 'It arrives within a few minutes. Check your spam folder too.'],
      ['Choose a new password', 'Then sign in as usual.'],
    ].map(([a, b], i) => `<li><span class="au-steps__n num">${i + 1}</span><span><b>${esc(a)}</b><small>${esc(b)}</small></span></li>`).join('')}</ol>
    ${button({ label: 'Reset my password', href: '/account/forgot', icon: 'key' }).replace('hp-btn--brand', 'hp-btn--brand hp-btn--block hp-btn--lg')}
    <div class="au-links"><a href="/sign-in">Back to sign in</a><a href="${esc(L.ticket)}">Contact support</a></div>
    ${phone || email ? `<p class="au-sub au-sub--sm">No longer have access to your email? ${phone ? `Call <a class="num" href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">${esc(phone)}</a>` : ''}${phone && email ? ' or write to ' : email ? 'Write to ' : ''}${email ? `<a href="mailto:${esc(email)}">${esc(email)}</a>` : ''}.</p>` : ''}`;
  }

  const split = `<section class="au-split" aria-labelledby="au-h1">
    <div class="au-brand">
      <div class="au-brand__bg" aria-hidden="true"></div>${hexNet()}
      <div class="au-brand__in">
        <p class="au-kicker"><i aria-hidden="true"></i>Globalhostia client area</p>
        <p class="au-statement">${esc(P.title)}</p>
        <p class="au-lead">${esc(P.lead)}</p>
        <ul class="au-benefits">${P.items.map(([ic, t, d], i) => `<li style="--i:${i}">${hexIcon(ic)}<span><b>${esc(t)}</b><small>${esc(d)}</small></span></li>`).join('')}</ul>
        <p class="au-trust">${icon('shield')}<span>Encrypted with HTTPS. Operated by ${esc(company)}, Dubai, UAE.</span></p>
      </div>
    </div>
    <div class="au-main">
      ${breadcrumbs(crumbs, { light: true })}
      <div class="au-card">${card.replace('class="au-h1"', 'class="au-h1" id="au-h1"')}
        <p class="au-secure">${icon('lock')}<span>${mode === 'sign-in' ? 'Your password is sent over an encrypted connection and checked by our billing system. It is never stored on this website.' : `New accounts are created on our secure client area at <b>${esc(host)}</b>, where fraud checks protect your order.`}</span></p>
      </div>
    </div>
  </section>`;

  const qs = [
    { q: 'Where do I manage my services after signing in?', a: 'In My account on this website: your products and servers, domains, invoices and support tickets. Payments open on our secure payment page.' },
    { q: 'Do I need an account before I order?', a: 'No. If you are new, choose a plan and create your account during checkout. Your login details are then sent by email.' },
    { q: 'I did not receive the password reset email.', a: 'Check your spam or junk folder and make sure you used the email address on your account. If it still does not arrive, contact support and we will help you confirm your identity.' },
    { q: 'Is my card stored on this website?', a: 'No. Payments are made in our secure client area through the payment method you choose there. This website never handles card details.' },
  ];
  const help = `<section class="hp-section hp-section--tight hp-section--tint" aria-labelledby="au-faq-h"><div class="hp-container au-faq">
    ${sectionHead({ id: 'au-faq-h', title: 'Account questions', align: 'left', lead: 'Help with signing in and managing your Globalhostia account.' })}
    ${faq(qs, { id: 'au-faq', single: true })}
  </div></section>`;

  return page({
    ctx, catalog: cat, path: `/${ctx.slug}`, title: ctx.route.title, description: ctx.route.description,
    css: ['auth'], js: ['auth'], bodyClass: 'au-page',
    jsonLd: [breadcrumbJsonLd(crumbs, site), faqJsonLd(qs)],
    body: split + help,
  });
}
