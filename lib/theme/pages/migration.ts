// /free-migration: request form → POST /api/free-migration → WHMCS support ticket. Success shows the ticket number.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { getCatalog } from '../data';
import { page } from '../shell';
import { pageHero, sectionHead, faq, faqJsonLd, breadcrumbJsonLd, icon, hexIcon, ld, link } from '../ui';
import { trustStrip, trustOn, waLink } from '../growth';
import { siteOf, crumbsFor } from './vps';

const WHAT = ['Website files', 'Databases', 'Email accounts', 'Domain and DNS'];
const PANELS = ['cPanel', 'Plesk', 'DirectAdmin', 'WordPress admin only', 'Other', 'Not sure'];
const WHEN = ['As soon as possible', 'Outside UAE business hours', 'At the weekend', 'A specific date (see notes)'];

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const s = cat.settings, site = siteOf(cat);
  const crumbs = crumbsFor('Free website migration');
  const ticket = (ctx.query.get('ticket') || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 24);
  const err = (ctx.query.get('error') || '').slice(0, 200);
  const wa = waLink(s, 'Hello Globalhostia, I would like a free website migration.');
  const email = String(s.email || '');
  const free = trustOn(s, 'migration');

  const steps = [
    { ic: 'pen', h: 'You send the request', p: 'Tell us which site to move and when suits you. It takes about two minutes.' },
    { ic: 'key', h: 'We agree access', p: 'An engineer replies in your ticket and asks for access in a secure way, never by plain email.' },
    { ic: 'move', h: 'We copy and check', p: 'Files, databases and mailboxes are copied to your new plan and tested on a preview address.' },
    { ic: 'globe', h: 'You switch when ready', p: 'We update DNS together. Your old site stays online until the new one is confirmed.' },
  ];
  const visual = `<ol class="mg-steps" aria-label="How a migration works">${steps.map((x, i) => `<li style="--i:${i}"><span class="mg-steps__n num" aria-hidden="true">${i + 1}</span>${hexIcon(x.ic)}<div><h2>${esc(x.h)}</h2><p>${esc(x.p)}</p></div></li>`).join('')}</ol>`;
  const hero = pageHero({
    crumbs, eyebrow: free ? 'Free with every hosting plan' : 'Website migration',
    title: free ? 'We move your website for free' : 'Let our engineers move your website',
    lead: 'Files, databases, email and DNS, copied by our engineers from your current host to Globalhostia. Your site stays online the whole time and you switch only when the copy is checked.',
    ctas: [{ label: 'Request a migration', href: '#request', icon: 'arrow' }, ...(wa ? [{ label: 'Ask on WhatsApp', href: wa, variant: 'ghost' as const, icon: 'whatsapp' }] : [])],
    visualHtml: visual, network: false,
  });

  const field = (id: string, label: string, input: string, o: { req?: boolean; hint?: string; wide?: boolean } = {}) =>
    `<div class="mg-field${o.wide ? ' mg-field--wide' : ''}" data-field="${id}"><label for="mg-${id}">${esc(label)}${o.req ? ' <span class="mg-req" aria-hidden="true">*</span>' : ' <span class="mg-opt">optional</span>'}</label>${input}${o.hint ? `<p class="mg-hint" id="mg-${id}-hint">${esc(o.hint)}</p>` : ''}<p class="mg-err" id="mg-${id}-err" hidden></p></div>`;
  const inp = (id: string, type: string, extra = '') => `<input class="hp-input" id="mg-${id}" name="${id}" type="${type}" ${extra} aria-describedby="mg-${id}-err">`;
  const form = `<form class="mg-form" action="/api/free-migration" method="post" data-mg-form novalidate aria-labelledby="mg-form-h">
    <h2 id="mg-form-h" class="mg-form__h">Request your migration</h2>
    <p class="mg-form__lead">Fields marked <span class="mg-req" aria-hidden="true">*</span><span class="sr-only">with an asterisk</span> are required. We reply in a support ticket sent to your email.</p>
    ${err ? `<p class="mg-alert" role="alert">${icon('alert')}${esc(err)}</p>` : '<p class="mg-alert" role="alert" data-mg-alert hidden></p>'}
    <div class="mg-grid">
      ${field('name', 'Your name', inp('name', 'text', 'autocomplete="name" required minlength="2" maxlength="80"'), { req: true })}
      ${field('email', 'Email', inp('email', 'email', 'autocomplete="email" required maxlength="120"'), { req: true })}
      ${field('phone', 'Phone or WhatsApp', inp('phone', 'tel', 'autocomplete="tel" inputmode="tel" maxlength="30" placeholder="+971 50 000 0000"'))}
      ${field('site', 'Website to move', inp('site', 'text', 'inputmode="url" autocapitalize="off" spellcheck="false" required maxlength="200" placeholder="example.com"'), { req: true })}
      ${field('host', 'Current hosting company', inp('host', 'text', 'maxlength="80" autocomplete="off"'))}
      ${field('panel', 'Control panel at your current host', `<select class="hp-select" id="mg-panel" name="panel"><option value="">Choose one</option>${PANELS.map((p) => `<option>${esc(p)}</option>`).join('')}</select>`)}
      <fieldset class="mg-field mg-field--wide mg-what" data-field="what" aria-describedby="mg-what-err"><legend>What should we move? <span class="mg-req" aria-hidden="true">*</span></legend>
        <div class="mg-checks">${WHAT.map((w, i) => `<label class="mg-check"><input type="checkbox" name="what" value="${esc(w)}"${i < 2 ? ' checked' : ''}><span>${icon('check')}</span>${esc(w)}</label>`).join('')}</div>
        <p class="mg-err" id="mg-what-err" hidden></p></fieldset>
      ${field('when', 'Preferred time', `<select class="hp-select" id="mg-when" name="when">${WHEN.map((w) => `<option>${esc(w)}</option>`).join('')}</select>`, { wide: true })}
      ${field('notes', 'Anything we should know?', `<textarea class="hp-input mg-ta" id="mg-notes" name="notes" aria-describedby="mg-notes-hint mg-notes-err" rows="4" maxlength="2000" placeholder="For example: the number of sites, a WordPress multisite, a deadline, or the plan you are ordering."></textarea>`, { wide: true, hint: 'Please do not include passwords here. We ask for access securely in your ticket.' })}
    </div>
    <div class="mg-hp" aria-hidden="true"><label for="mg-cu">Leave this empty</label><input id="mg-cu" name="company_url" type="text" tabindex="-1" autocomplete="off"></div>
    <input type="hidden" name="t" value="" data-mg-t>
    <div class="mg-submit"><button class="hp-btn hp-btn--brand hp-btn--lg" type="submit" data-mg-btn>${icon('move')}<span>Send migration request</span></button>
      <p>We open a support ticket with your details. ${email ? `Prefer email? Write to <a href="mailto:${esc(email)}">${esc(email)}</a>.` : ''}</p></div>
  </form>`;
  const done = `<div class="mg-done" data-mg-done${ticket ? '' : ' hidden'} tabindex="-1" role="status">
    ${hexIcon('check')}
    <h2>Request received</h2>
    <p data-mg-tline${ticket && ticket !== 'received' ? '' : ' hidden'}>Your ticket number is <b class="num" data-mg-ticket>${esc(ticket && ticket !== 'received' ? ticket : '')}</b>. Keep it handy if you contact us.</p>
    <p>We have emailed you a copy. An engineer will reply in the ticket to agree a time and how to share access securely.</p>
    <div class="hp-actions">${link('Compare hosting plans', '/web-hosting')}${wa ? link('Message us on WhatsApp', wa, 'whatsapp') : ''}</div>
  </div>`;

  const side = `<aside class="mg-side" aria-labelledby="mg-side-h">
    <h2 id="mg-side-h">What we move for you</h2>
    <ul class="mg-list">${[
      ['Websites and apps', 'WordPress, WooCommerce, Joomla, Laravel and plain PHP or HTML sites.'],
      ['Databases', 'MySQL and MariaDB, exported and imported with the right character set.'],
      ['Email', 'Mailboxes and their messages, plus forwarders, when your old host allows IMAP access.'],
      ['Domain and DNS', 'We prepare the records and help you change nameservers when you are ready.'],
    ].map(([h, p]) => `<li>${icon('check')}<div><b>${esc(h)}</b><span>${esc(p)}</span></div></li>`).join('')}</ul>
    <div class="mg-need"><h3>Helpful to have ready</h3><ul>${['Login to your current control panel, or a full backup file', 'Access to the place your domain is registered', 'A quiet time for the final DNS switch'].map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
  </aside>`;

  const main = `<section class="hp-section mg-sec" id="request" aria-label="Migration request"><div class="hp-container mg-wrap">
    <div class="mg-card">${ticket ? '' : form}${done}</div>
    ${side}
  </div></section>`;

  const faqs = [
    { q: 'Is the migration really free?', a: free ? 'Yes, for websites moving to a Globalhostia hosting plan. Our engineers do the copy and checks at no extra cost. For large or unusual setups we tell you up front if anything is outside a standard migration.' : 'Our engineers can move your site for you. We confirm the scope and any cost in your ticket before starting.' },
    { q: 'Will my website go offline during the move?', a: 'No. We copy the site to your new plan while the old one keeps running, test it on a preview address, and only then switch DNS. DNS changes can take a few hours to reach every visitor, and both copies stay online during that time.' },
    { q: 'How long does a migration take?', a: 'Most single websites are copied within one to two working days of receiving access. Larger sites, many mailboxes or a specific time slot can take longer; we agree the timing in your ticket.' },
    { q: 'Do I need to buy a plan first?', a: 'You can send the request first and we will recommend a plan. The migration starts once your new hosting plan is active.' },
    { q: 'How do I share my passwords safely?', a: 'Do not put passwords in this form or in an email. Your engineer will explain how to share access securely inside your ticket, and you can change the passwords once the move is complete.' },
  ];
  const faqSec = `<section class="hp-section hp-section--tint" aria-labelledby="mg-faq-h"><div class="hp-container mg-faq">
    ${sectionHead({ id: 'mg-faq-h', title: 'Migration questions', align: 'left' })}${faq(faqs, { id: 'mg-faq', single: true })}
  </div></section>`;

  const service = ld({ '@context': 'https://schema.org', '@type': 'Service', name: 'Website migration', serviceType: 'Website migration', url: `${site}/free-migration`,
    provider: { '@type': 'Organization', '@id': `${site}/#organization`, name: 'GlobalHostia', url: `${site}/` }, areaServed: 'Worldwide', ...(free ? { offers: { '@type': 'Offer', price: '0', priceCurrency: cat.currency } } : {}) });
  return page({
    ctx, catalog: cat, path: '/free-migration', title: ctx.route.title, description: ctx.route.description,
    css: ['migration'], js: ['migration'], noindex: !!(ticket || err),
    jsonLd: [breadcrumbJsonLd(crumbs, site), faqJsonLd(faqs), service],
    body: [hero, trustStrip(s), main, faqSec].join('\n'),
  });
}
