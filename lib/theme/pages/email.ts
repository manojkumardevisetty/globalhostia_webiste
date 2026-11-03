// Business email & Google Workspace: hero = animated inbox receiving mail at yourname@yourdomain,
// a domain-ownership explainer with an interactive MX diagram, mailbox vs Google Workspace comparison (no prices),
// business-email plans (or a sales CTA plus the real mailbox allowances of our hosting plans), setup steps, FAQ.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { picture } from '../img';
import { getCatalog, productsFor, minFrom, pricedTlds, currencyPrefix, type TProduct } from '../data';
import { page } from '../shell';
import {
  pageHero, sectionHead, splitHead, planCards, plansNote, faq, faqJsonLd, ctaBand, breadcrumbJsonLd, domainSearch,
  icon, ld, link, fromText, available,
} from '../ui';

const H = ['hosting-usa', 'hostia-shared', 'hosting-singapore'];
const LOC_SUFFIX = /\s+(USA|US|MY|SG|UK|EU|Malaysia|Singapore)$/i;
const MAIL_RE = /(unlimited|\d+)\s*email/i;
function mailCap(p: TProduct) { for (const f of p.features) { const m = f.replace(/^-\s*/, '').match(MAIL_RE); if (m) return /unlimited/i.test(m[1]) ? 'Unlimited email accounts' : `${m[1]} email accounts`; } return ''; }

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const { currency, base } = cat;
  const prefix = currencyPrefix(cat) || '$';
  const products = productsFor(cat, ctx.route.categories);
  const from = minFrom(available(products), currency);
  const workspace = ctx.slug === 'google-workspace';
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Email', href: '/google-workspace' }, { label: ctx.route.title }];
  if (workspace) crumbs.splice(1, 1);

  /* ---------------- hero: inbox ---------------- */
  const msgs = [
    { f: 'Website contact form', s: 'New enquiry about your services', t: '09:41' },
    { f: 'Store', s: 'New order received', t: '09:38' },
    { f: 'Accounts', s: 'Invoice paid, thank you', t: '09:20' },
    { f: 'Sara, design team', s: 'Homepage drafts are ready', t: '08:57' },
    { f: 'Omar', s: 'Lunch with the new supplier?', t: '08:30' },
    { f: 'Booking system', s: 'Tomorrow, 10:00 appointment confirmed', t: '08:12' },
  ];
  const inbox = `<figure class="em-box" data-em-inbox data-pause>
    <div class="em-box__top" aria-hidden="true"><span class="em-av">Y</span><span class="em-addr"><b>you@yourbusiness.com</b><small>Inbox</small></span><span class="em-unread num"><i data-em-unread>2</i> new</span></div>
    <div class="em-box__tabs" aria-hidden="true"><span class="is-on">Inbox</span><span>Sent</span><span>Calendar</span></div>
    <ul class="em-list" aria-hidden="true">${msgs.map((m, i) => `<li class="em-msg${i < 2 ? ' is-unread' : ''}" data-i="${i}"><span class="em-msg__av">${esc(m.f.charAt(0))}</span><span class="em-msg__b"><b>${esc(m.f)}</b><span>${esc(m.s)}</span></span><time>${esc(m.t)}</time></li>`).join('')}</ul>
    <figcaption class="em-cap">Illustration of a business inbox. Senders and messages are examples.</figcaption>
  </figure>`;

  const hero = pageHero({
    crumbs, eyebrow: workspace ? 'Business email and Google Workspace' : 'Business email',
    title: 'Email that carries your name, not a free provider’s',
    lead: 'Addresses like hello@yourbusiness.com tell customers they are dealing with a real company. Choose simple mailboxes for your team, or Google Workspace for calendar, documents and meetings.',
    ctas: [{ label: 'Compare email options', href: '#compare' }, { label: 'Talk to sales', href: '/contact', variant: 'ghost' }],
    trust: ['Your own domain', 'Works on phone and desktop', 'Spam and virus filtering'],
    visualHtml: inbox,
  });

  /* ---------------- domain ownership explainer ---------------- */
  const own = `<section class="hp-section" aria-labelledby="own-h"><div class="hp-container">
    ${splitHead({ id: 'own-h', title: 'Why the address matters', lead: 'The part after the @ is a domain you own. That one detail changes how people see you, and who controls your email.' })}
    <div class="em-vs">
      <div class="em-card em-card--free" data-reveal><span class="em-card__lbl">Free address</span><p class="em-card__addr">yourbusiness2024@gmail.com</p>
        <ul>${['Looks like a side project to new customers', 'Tied to one provider; leaving means a new address', 'Hard to hand over when staff change'].map((t) => `<li>${icon('x')}${esc(t)}</li>`).join('')}</ul></div>
      <div class="em-card em-card--own" data-reveal style="--i:1"><span class="em-card__lbl">Your domain</span><p class="em-card__addr">hello@yourbusiness.com</p>
        <ul>${['Matches your website and builds trust', 'Switch email providers and keep every address', 'Create role addresses like sales@ and support@'].map((t) => `<li>${icon('check')}${esc(t)}</li>`).join('')}</ul></div>
    </div>
    <div class="em-mx" data-em-mx data-reveal data-pause>
      <div class="em-mx__copy"><h3>How mail finds your inbox</h3><p>Your domain has MX records, a signpost telling the internet which mail service accepts your email. Point it at a different service and your address stays exactly the same.</p>
        <div class="hp-seg em-mx__seg" role="radiogroup" aria-label="Mail service to point your domain at" data-em-mx-seg><button type="button" role="radio" aria-checked="true" data-mx="host">Hosting mailboxes</button><button type="button" role="radio" aria-checked="false" tabindex="-1" data-mx="gws">Google Workspace</button></div></div>
      <div class="em-mx__dia" aria-hidden="true">
        <div class="em-node"><span>${icon('mail')}</span><b>Email to hello@yourbusiness.com</b></div>
        <i class="em-pipe"><em></em></i>
        <div class="em-node em-node--dns"><span>${icon('globe')}</span><b>yourbusiness.com</b><small>MX record points to <strong data-mx-label>your hosting server</strong></small></div>
        <i class="em-pipe"><em></em></i>
        <div class="em-node em-node--dest" data-mx-dest="host"><span>${icon('server')}</span><b>Hosting mailbox</b><small>Webmail and mail apps</small></div>
        <div class="em-node em-node--dest" data-mx-dest="gws" hidden><span>${icon('grid')}</span><b>Google Workspace</b><small>Gmail, Calendar, Drive</small></div>
      </div>
    </div>
    ${pricedTlds(cat).length ? `<div class="em-dom" data-reveal><div><h3>No domain yet?</h3><p>Register one first. Your email, website and everything else will use it.</p></div>${domainSearch({ tlds: pricedTlds(cat), base, compact: true, title: '', id: 'em-domain', max: 4, prefix, typing: ['yourbusiness.com', 'studio-name.co', 'familyclinic.org'] })}</div>` : ''}
  </div></section>`;

  /* ---------------- comparison (qualitative, no prices) ---------------- */
  type Cell = true | false | string;
  const rows: [string, Cell, Cell][] = [
    ['Addresses on your own domain', true, true],
    ['Webmail in the browser', 'Webmail', 'Gmail'],
    ['Phone and desktop mail apps (IMAP, SMTP)', true, true],
    ['Spam and virus filtering', true, true],
    ['Shared calendars and scheduling', false, 'Google Calendar'],
    ['Cloud file storage and documents', false, 'Drive, Docs, Sheets'],
    ['Video meetings', false, 'Google Meet'],
    ['Manage users from one place', 'Control panel', 'Admin console'],
    ['How it is priced', 'Included with web hosting plans', 'Per user, quoted by our sales team'],
  ];
  const cell = (c: Cell) => c === true ? `<span class="hp-yes">${icon('check')}<span class="sr-only">Included</span></span>` : c === false ? `<span class="hp-no">${icon('minus')}<span class="sr-only">Not included</span></span>` : esc(c);
  const compare = `<section class="hp-section hp-section--tint" id="compare" aria-labelledby="cmp-h"><div class="hp-container">
    ${sectionHead({ id: 'cmp-h', title: 'Mailboxes or Google Workspace?', lead: 'Both give you professional addresses on your domain. The difference is everything around the inbox.' })}
    <div class="em-cmp">
      <div class="em-pick" data-reveal><span class="hp-hexi">${icon('mail')}</span><h3>Hosting mailboxes</h3><p>For teams that need reliable email and nothing else. Mailboxes come with our web hosting plans, so your site and email live in one account.</p></div>
      <div class="em-pick em-pick--gws" data-reveal style="--i:1"><span class="hp-hexi">${icon('grid')}</span><h3>Google Workspace</h3><p>For teams that work together all day: Gmail on your domain plus shared calendars, documents, storage and video calls.</p></div>
    </div>
    <div class="hp-table-wrap em-table" data-reveal><table class="hp-table"><caption class="sr-only">Hosting mailboxes compared with Google Workspace</caption>
      <thead><tr><th scope="col"><span class="sr-only">Feature</span></th><th scope="col">Hosting mailboxes</th><th scope="col">Google Workspace</th></tr></thead>
      <tbody>${rows.map(([k, a, b]) => `<tr><th scope="row">${esc(k)}</th><td>${cell(a)}</td><td>${cell(b)}</td></tr>`).join('')}</tbody></table></div>
    <p class="em-fine">Google Workspace features depend on the edition you choose. Our team confirms the edition and price with you before you order.</p>
  </div></section>`;

  /* ---------------- plans ---------------- */
  const hosting = available(productsFor(cat, H));
  const fams = new Map<string, TProduct>();
  for (const p of hosting) { const n = p.name.replace(LOC_SUFFIX, '').trim(); const cur = fams.get(n); if (!cur || (minFrom([p], currency)?.amount ?? 1e9) < (minFrom([cur], currency)?.amount ?? 1e9)) fams.set(n, p); }
  const famList = [...fams.entries()].filter(([, p]) => mailCap(p)).sort((a, b) => (minFrom([a[1]], currency)?.amount ?? 1e9) - (minFrom([b[1]], currency)?.amount ?? 1e9));
  const included = famList.length ? `<div class="em-inc" data-reveal>
      <div class="em-inc__head"><h3>Need mailboxes today?</h3><p>Every web hosting plan includes email accounts on your domain.</p></div>
      <ul class="em-inc__list">${famList.map(([n, p]) => { const t = fromText(p, currency); return `<li><b>${esc(n)}</b><span>${esc(mailCap(p))}</span><em class="num">${t ? `from ${esc(t)}` : 'See price'}</em></li>`; }).join('')}</ul>
      ${link('See web hosting plans', '/web-hosting#plans')}
    </div>` : '';
  const empty = `<div class="em-sales" data-reveal><span class="hp-hexi">${icon('headset')}</span><div><h3>Get a Google Workspace or business email quote</h3><p>Tell us how many people need an address and which tools they use. We recommend the right setup, quote the per-user price and handle the DNS changes for you.</p></div><div class="hp-actions"><a class="hp-btn hp-btn--brand" href="/contact">Talk to sales</a><a class="hp-btn hp-btn--ghost" href="${esc(base)}/submitticket.php">Open a ticket</a></div></div>`;
  const plans = `<section class="hp-section" id="plans" aria-labelledby="plans-h"><div class="hp-container">
    ${sectionHead({ id: 'plans-h', title: 'Business email plans', lead: products.length ? 'Pick the plan that fits your team. Prices are per plan, shown live from our billing system.' : 'Business email packages are quoted by our team, so you only pay for the users you need.' })}
    ${products.length ? planCards(products, { currency, base, id: 'em-plans' }) + plansNote(currency) : empty}
    ${included}
  </div></section>`;

  /* ---------------- setup steps ---------------- */
  const steps = [
    { ic: 'cart', t: 'Choose your email option', d: 'Mailboxes with a hosting plan, or Google Workspace through our team.' },
    { ic: 'globe', t: 'Point your domain', d: 'We update the MX records for you, or give you the exact values to add at your registrar.' },
    { ic: 'users', t: 'Create addresses', d: 'Add a mailbox for each person, plus shared ones like info@ and sales@.' },
    { ic: 'monitor', t: 'Connect your devices', d: 'Sign in on the web, or add the account to the mail app on your phone and computer.' },
  ];
  const setup = `<section class="hp-section hp-section--dark hp-on-dark" aria-labelledby="setup-h"><div class="hp-container em-setup">
    <div class="em-setup__intro">
      <h2 id="setup-h" class="hp-hline hp-h2">Set up in an afternoon</h2>
      <p class="hp-lead">Most businesses send their first email from the new address the same day. If you already have mail elsewhere, we can help you move old messages across.</p>
      <figure class="em-setup__img">${picture({ src: '/hp/img/email-office.jpg', alt: 'A smiling team member working at her desk in a bright office', sizes: '(max-width: 900px) calc(100vw - 32px), 600px' })}</figure>
    </div>
    <ol class="em-steps">${steps.map((s, i) => `<li data-reveal style="--i:${i}"><span class="em-steps__ic">${icon(s.ic)}<i class="num">${i + 1}</i></span><div><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></div></li>`).join('')}</ol>
  </div></section>`;

  /* ---------------- FAQ ---------------- */
  const faqs = [
    { q: 'Do I need a domain to get business email?', a: 'Yes. Your address uses your domain, for example you@yourbusiness.com. If you do not have one yet, register it with us first; if you already own one, you keep it where it is or transfer it to us for free.' },
    { q: 'Can I keep my current website host and still use your email?', a: 'Yes. Email and website are separate. Only the MX records of your domain change, so your website keeps running wherever it is today.' },
    { q: 'Can I move my old emails across?', a: 'Yes. When you switch, our team can help copy existing messages from your previous provider into your new mailboxes.' },
    { q: 'Should I choose mailboxes or Google Workspace?', a: 'Choose hosting mailboxes if your team mainly needs email. Choose Google Workspace if you also want shared calendars, cloud documents, storage and video meetings in one place.' },
    { q: 'Will my email work on my phone?', a: 'Yes. Both options work in any modern mail app on iPhone, Android, Windows and Mac, as well as in the browser.' },
    { q: 'How much does Google Workspace cost?', a: 'Google Workspace is priced per user and depends on the edition. Contact our sales team and we will confirm the current price for the edition and number of users you need before you order.' },
  ];
  const faqSec = `<section class="hp-section" aria-labelledby="faq-h"><div class="hp-container em-faq">
    ${sectionHead({ id: 'faq-h', title: 'Business email questions' })}
    ${faq(faqs, { id: 'em-faq', single: true })}
  </div></section>`;

  const cta = ctaBand({ id: 'cta', title: 'Send your next email from your own domain', text: 'Tell us how many people need an address and we will set it up with you.',
    primary: { label: 'Talk to sales', href: '/contact' }, secondary: { label: 'Compare options', href: '#compare' } });

  const site = String(cat.settings.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const offer = from ? ld({ '@context': 'https://schema.org', '@type': 'Product', name: ctx.route.title, description: ctx.route.description, brand: { '@type': 'Brand', name: cat.settings.site_name || 'Globalhostia' },
    offers: { '@type': 'AggregateOffer', priceCurrency: currency, lowPrice: from.price.toFixed(2), offerCount: products.length, url: `${site}/${ctx.slug}` } }) : '';
  const service = ld({ '@context': 'https://schema.org', '@type': 'Service', name: ctx.route.title, description: ctx.route.description, serviceType: 'Business email hosting', provider: { '@type': 'Organization', name: cat.settings.site_name || 'Globalhostia', url: site } });

  return page({
    ctx, catalog: cat, path: `/${ctx.slug}`, title: ctx.route.title, description: ctx.route.description,
    css: ['email'], js: ['email'],
    jsonLd: [breadcrumbJsonLd(crumbs, site), faqJsonLd(faqs), service, offer].filter(Boolean),
    body: [hero, own, compare, plans, setup, faqSec, cta].join('\n'),
  });
}
