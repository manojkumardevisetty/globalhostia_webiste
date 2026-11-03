// Contact: one switchboard visual that routes a message to Sales, Support or Billing, department cards
// with real channels from settings (phone, email, WhatsApp), WHMCS ticket links, office, network map, FAQ.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { picture } from '../img';
import { getCatalog, whmcsLinks } from '../data';
import { page } from '../shell';
import { pageHero, sectionHead, splitHead, dcMap, faq, faqJsonLd, ctaBand, breadcrumbJsonLd, icon, hexIcon, ld, type IconName } from '../ui';

const tel = (p: string) => 'tel:' + p.replace(/[^\d+]/g, '');

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const s = cat.settings;
  const L = whmcsLinks(cat.base);
  const phone = String(s.phone || ''), email = String(s.email || '');
  const waNum = String(s.whatsapp || phone || '').replace(/[^\d]/g, '');
  const wa = (text: string) => (waNum ? `https://wa.me/${waNum}?text=${encodeURIComponent(text)}` : '');
  const company = String(s.company || 'GlobalHostia');
  const site = String(s.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Contact us' }];

  /* hero visual: a message routed to three desks */
  const desks: [string, IconName][] = [['Sales', 'tag'], ['Support', 'headset'], ['Billing', 'card']];
  const visual = `<div class="ct-route" aria-hidden="true">
    <svg viewBox="0 0 420 320" class="ct-route__svg">
      ${[60, 160, 260].map((y, i) => `<path class="ct-line" d="M120 160 C 200 160, 210 ${y}, 290 ${y}"/><path class="ct-pkt" style="--i:${i}" d="M120 160 C 200 160, 210 ${y}, 290 ${y}" pathLength="100"/>`).join('')}
    </svg>
    <div class="ct-src"><span class="ct-src__ico">${icon('chat')}</span><b>Your message</b><small>Phone, email, WhatsApp or ticket</small></div>
    ${desks.map(([d, ic], i) => `<div class="ct-desk" style="--i:${i}">${hexIcon(ic)}<b>${esc(d)}</b></div>`).join('')}
  </div>`;
  const hero = pageHero({
    crumbs, eyebrow: 'Contact us', title: 'Talk to the people who run your servers',
    lead: 'Sales, technical support and billing, by phone, email, WhatsApp or ticket. Tell us what you need and the right team picks it up.',
    ctas: [
      ...(phone ? [{ label: `Call ${phone}`, href: tel(phone), icon: 'phone' as IconName }] : []),
      { label: 'Open a support ticket', href: L.ticket, variant: 'ghost' as const, icon: 'ticket' as IconName },
    ],
    visualHtml: visual, network: true,
  });

  /* quick channels */
  const channels: { ic: IconName; label: string; value: string; href: string; note: string }[] = [
    ...(phone ? [{ ic: 'phone' as IconName, label: 'Call us', value: phone, href: tel(phone), note: 'Sales and support' }] : []),
    ...(email ? [{ ic: 'mail' as IconName, label: 'Email us', value: email, href: `mailto:${email}`, note: 'We reply as soon as possible' }] : []),
    ...(waNum ? [{ ic: 'whatsapp' as IconName, label: 'WhatsApp', value: 'Message us', href: wa('Hello Globalhostia, I have a question.'), note: 'Quick questions and quotes' }] : []),
    { ic: 'ticket', label: 'Support ticket', value: 'Open a ticket', href: L.ticket, note: 'Tracked with a reference number' },
  ];
  const quick = `<section class="ct-quick-wrap" aria-label="Ways to reach us"><div class="hp-container"><ul class="ct-quick ct-quick--${channels.length}" data-stagger>${channels.map((c) =>
    `<li data-reveal><a href="${esc(c.href)}"${c.href.startsWith('http') ? ' rel="noopener"' : ''}>${hexIcon(c.ic)}<span><small>${esc(c.label)}</small><b class="${c.ic === 'phone' ? 'num' : ''}">${esc(c.value)}</b><em>${esc(c.note)}</em></span></a></li>`).join('')}</ul></div></section>`;

  /* departments */
  const depts: { id: string; ic: IconName; title: string; text: string; topics: string[]; primary: { label: string; href: string }; waText: string }[] = [
    { id: 'sales', ic: 'tag', title: 'Sales', text: 'Not sure which plan fits, need a custom server or a quote for several services? Our sales team will recommend a setup and explain the costs before you order.',
      topics: ['Choosing between hosting, VPS and dedicated', 'Custom server configurations and quotes', 'Moving several websites to Globalhostia'],
      primary: { label: 'Message sales on WhatsApp', href: wa('Hello Globalhostia sales, I would like advice on a plan.') || (email ? `mailto:${email}?subject=${encodeURIComponent('Sales question')}` : L.ticket) }, waText: '' },
    { id: 'support', ic: 'headset', title: 'Technical support', text: 'Website down, email not arriving, a server that needs attention? Open a ticket so an engineer can see your services and history straight away.',
      topics: ['Websites, email and DNS', 'VPS and dedicated server issues', 'Migrations, backups and restores'],
      primary: { label: 'Open a support ticket', href: L.ticket }, waText: '' },
    { id: 'billing', ic: 'card', title: 'Billing', text: 'Questions about an invoice, a payment method, renewals or upgrades. Most of it is also available in your client area.',
      topics: ['Invoices, receipts and payment methods', 'Renewals, upgrades and cancellations', 'Account and contact details'],
      primary: { label: 'View your invoices', href: `${cat.base}/clientarea.php?action=invoices` }, waText: '' },
  ];
  const deptHtml = `<section class="hp-section" aria-labelledby="ct-dept-h"><div class="hp-container">
    ${sectionHead({ id: 'ct-dept-h', title: 'Choose the team you need', lead: 'Every team can be reached on the same phone number, email and WhatsApp. Tell us the topic and we route it for you.' })}
    <div class="ct-depts" data-stagger>${depts.map((d) => `<article class="ct-dept" id="${d.id}" data-reveal>
      <header>${hexIcon(d.ic)}<h3>${esc(d.title)}</h3></header>
      <p>${esc(d.text)}</p>
      <ul class="ct-topics">${d.topics.map((t) => `<li>${icon('check')}${esc(t)}</li>`).join('')}</ul>
      <a class="hp-btn hp-btn--${d.id === 'support' ? 'brand' : 'dark'} hp-btn--block" href="${esc(d.primary.href)}">${esc(d.primary.label)}</a>
      <ul class="ct-chan">
        ${phone ? `<li><a href="${esc(tel(phone))}">${icon('phone')}<span class="num">${esc(phone)}</span></a></li>` : ''}
        ${email ? `<li><a href="mailto:${esc(email)}?subject=${encodeURIComponent(d.title)}">${icon('mail')}<span>${esc(email)}</span></a></li>` : ''}
        ${waNum && d.id !== 'sales' ? `<li><a href="${esc(wa(`Hello Globalhostia ${d.title.toLowerCase()}, `))}" rel="noopener">${icon('whatsapp')}<span>WhatsApp</span></a></li>` : ''}
      </ul>
    </article>`).join('')}</div>
  </div></section>`;

  /* ticket tips + office */
  const office = `<section class="hp-section hp-section--tint" aria-labelledby="ct-office-h"><div class="hp-container ct-office">
    <figure class="ct-office__img" data-reveal>${picture({ src: '/hp/img/contact-team.jpg', sizes: '(max-width: 900px) calc(100vw - 32px), 600px' })}</figure>
    <div class="ct-office__txt" data-reveal>
      <h2 class="hp-hline" id="ct-office-h">Our office in Dubai</h2>
      <p class="hp-lead">Globalhostia is operated by ${esc(company)}, based in Dubai, United Arab Emirates. Our team looks after customers and servers around the world from here.</p>
      <dl class="ct-facts">
        <div><dt>${icon('pin')}Office</dt><dd>Dubai, UAE</dd></div>
        <div><dt>${icon('award')}Company</dt><dd>${esc(company)}</dd></div>
        <div><dt>${icon('clock')}Replies</dt><dd>We reply as soon as possible, and every ticket gets a reference number so you can follow its progress.</dd></div>
      </dl>
      <div class="ct-tip"><h3>Getting help faster</h3><ul>${['Write from the email address on your account, or open the ticket while signed in.', 'Name the domain or server the problem is about.', 'Describe what you expected and what happened instead, with any error message.'].map((t) => `<li>${icon('check')}${esc(t)}</li>`).join('')}</ul></div>
    </div>
  </div></section>`;

  const map = `<section class="hp-section hp-section--dark hp-on-dark" aria-labelledby="ct-map-h"><div class="hp-container ct-map">
    ${splitHead({ id: 'ct-map-h', title: 'Support from Dubai, servers worldwide', lead: 'Your services run in the datacenter you choose when ordering. Support for all of them is handled by the same team.' })}
    ${dcMap({ caption: 'Datacenters linked to our headquarters in Dubai, where support and operations are based.' })}
  </div></section>`;

  const qs = [
    { q: 'What is the fastest way to get technical help?', a: 'Open a support ticket from your client area. The engineer sees your services and account straight away, and you can follow every reply in one place. For urgent issues you can also call us.' },
    { q: 'Can I get a quote for a custom server or a large project?', a: 'Yes. Contact sales by WhatsApp, email or phone with what you need, such as the workload, traffic and preferred location, and we will recommend a configuration with its price.' },
    { q: 'Do I need an account to contact you?', a: 'No. Anyone can call, email or message us on WhatsApp. To open a ticket about an existing service, sign in first so we can find it quickly.' },
    { q: 'Where is Globalhostia based?', a: `Globalhostia is operated by ${company} in Dubai, United Arab Emirates.` },
    { q: 'How do I ask about an invoice or a refund?', a: 'Sign in to your client area to view invoices, or open a ticket for the billing team with the invoice number so we can check it.' },
  ];
  const faqHtml = `<section class="hp-section" aria-labelledby="ct-faq-h"><div class="hp-container ct-faq">
    ${sectionHead({ id: 'ct-faq-h', title: 'Before you get in touch', align: 'left' })}
    ${faq(qs, { id: 'ct-faq', single: true })}
  </div></section>`;

  const cta = ctaBand({ title: 'Already know what you need?', text: 'Compare plans and order online, or open a ticket and our team will help you choose.',
    primary: { label: 'Compare hosting plans', href: '/web-hosting' }, secondary: { label: 'Open a ticket', href: L.ticket } });

  const contactLd = ld({ '@context': 'https://schema.org', '@type': 'ContactPage', name: 'Contact Globalhostia', url: `${site}/contact`,
    mainEntity: { '@type': 'Organization', '@id': `${site}/#organization`, name: 'GlobalHostia', url: `${site}/`, legalName: company, address: { '@type': 'PostalAddress', addressLocality: 'Dubai', addressCountry: 'AE' },
      contactPoint: ['sales', 'technical support', 'billing support'].map((t) => ({ '@type': 'ContactPoint', contactType: t, ...(phone ? { telephone: phone } : {}), ...(email ? { email } : {}), availableLanguage: ['English'] })) } });

  return page({
    ctx, catalog: cat, path: '/contact', title: ctx.route.title, description: ctx.route.description,
    css: ['contact'], js: ['contact'],
    jsonLd: [breadcrumbJsonLd(crumbs, site), faqJsonLd(qs), contactLd],
    body: [hero, quick, deptHtml, office, map, faqHtml, cta].join('\n'),
  });
}
