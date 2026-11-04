// /security: how to report a vulnerability (linked from /.well-known/security.txt) and what protects the site and the
// client area. Only states what the platform actually does (lib/security/*).
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { getCatalog } from '../data';
import { page } from '../shell';
import { pageHero, sectionHead, breadcrumbJsonLd } from '../ui';

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const s = cat.settings;
  const site = String(s.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const contact = String(s.security_public?.contact || s.email || 'support@globalhostia.com');
  const mail = /^https:\/\//.test(contact) ? contact : `mailto:${contact}`;
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Security' }];
  const hero = pageHero({ crumbs, eyebrow: 'Security', title: 'Security at GlobalHostia', lead: 'How we protect the website and client area, and how to tell us about a vulnerability.' });
  const li = (items: string[]) => `<ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  const body = hero + `
<section class="hp-section" aria-labelledby="sec-report"><div class="hp-container cn-narrow"><div class="cn-prose">
    ${sectionHead({ id: 'sec-report', title: 'Report a vulnerability', align: 'left' })}
    <p>If you believe you have found a security problem on globalhostia.com, the client area (my.globalhostia.com) or our hosting platform, email <a href="${esc(mail)}">${esc(contact)}</a> with the subject <b>Security report</b>. Please include the affected URL, the steps to reproduce it and what an attacker could do with it.</p>
    ${li([
      'We confirm that we have received your report and keep you updated until the issue is fixed.',
      'Please give us reasonable time to fix the issue before you share it publicly.',
      'Do not access, change or delete other customers’ data, do not run denial-of-service or spam tests, and do not use social engineering against our staff or customers.',
      'Test only with your own account and services.',
    ])}
    <p>For account problems that are not security issues (a forgotten password, a suspicious invoice), open a support ticket instead. Our machine-readable contact file is at <a href="/.well-known/security.txt">/.well-known/security.txt</a>.</p>
  </div></div></section>
  <section class="hp-section hp-section--alt" aria-labelledby="sec-how"><div class="hp-container cn-narrow"><div class="cn-prose">
    ${sectionHead({ id: 'sec-how', title: 'How the website and client area are protected', align: 'left' })}
    ${li([
      'All traffic uses HTTPS with HSTS, and pages send a Content-Security-Policy, clickjacking protection and strict referrer rules.',
      'Billing, payments and service provisioning run in our billing system; card details are handled by the payment providers and never stored on this website.',
      'Sign-in, password reset, contact forms and the website assistant are rate-limited, and public forms are protected against automated spam.',
      'The administration area supports two-factor authentication and session controls, and every administrative change is logged.',
      'API credentials for the billing system and hosting panels stay on our servers and are never sent to your browser.',
    ])}
  </div></div></section>`;
  return page({ ctx, catalog: cat, path: '/security', title: ctx.route.title, description: ctx.route.description, css: ['content'], jsonLd: [breadcrumbJsonLd(crumbs, site)], body });
}
