// Dashboard welcome checklist "Get your site live" (lib/cx/onboarding*.ts): progress, one row per step with its
// status (detected or marked by the customer), a short why, the action (portal page or a Manage hosting tab via single
// sign-on), the matching how-to video, and Mark as done / Skip / Undo. Celebrates once when everything is done.
import { esc, icon, t } from './kit';
import { lang } from '../i18n';
import { HELP_TOPICS, helpPath, helpMedia, frameUrl } from '../../help/topics';
import { HELP_MEDIA } from '../../help/media';
import type { Card } from '../../cx/onboarding';
import type { StepView, StepId } from '../../cx/onboarding-core';

const TITLE: () => Record<StepId, string> = () => ({
  domain: t('Connect your domain'), ssl: t('Turn on free SSL'), email: t('Create a mailbox'), site: t('Publish your website'),
  wordpress: t('Install WordPress'), backups: t('Make your first backup'), team: t('Invite a team member'), ai: t('Connect an AI assistant'),
});
const WHY: (d: string, hosting: boolean) => Record<StepId, string> = (d, hosting) => ({
  domain: hosting ? t('Point {d} to GlobalHostia so your website and email work on it.', { d }) : t('Point {d} to your website so visitors can find it.', { d }),
  ssl: t('Gives your site the padlock. Browsers warn visitors away from sites without HTTPS.'),
  email: t('An address like you@{d} looks professional and keeps business mail in one place.', { d }),
  site: t('Upload your site or build one. We check that {d} shows your pages, not the default page.', { d }),
  wordpress: t('The easiest way to build a site, a blog or a shop, installed in one click.'),
  backups: t('A copy you can restore in one click if an update or a mistake breaks something.'),
  team: t('Give a developer or your accountant their own sign-in, with only the access they need.'),
  ai: t('Manage domains, DNS and invoices by chat in Claude or ChatGPT.'),
});
const ACTION: () => Record<StepId, string> = () => ({
  domain: t('Connect domain'), ssl: t('Turn on SSL'), email: t('Create mailbox'), site: t('Upload files'),
  wordpress: t('Install WordPress'), backups: t('Make a backup'), team: t('Invite someone'), ai: t('Connect'),
});
const STEP_IC: Record<StepId, string> = { domain: 'globe', ssl: 'lock', email: 'mail', site: 'rocket', wordpress: 'wp', backups: 'archive', team: 'users', ai: 'bot' };

const dur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
/** how-to video (or illustrated walkthrough) thumbnail link for a step */
function helpLink(slug: string) {
  const tp = HELP_TOPICS.find((x) => x.slug === slug);
  if (!tp) return '';
  const ar = lang() === 'ar';
  const title = ar ? tp.titleAr : tp.title;
  const media = HELP_MEDIA[slug];
  const img = tp.kind === 'video' ? helpMedia(slug).poster : tp.frames?.[0] ? frameUrl(tp.frames[0].src) : '';
  const meta = tp.kind === 'video' && media ? t('Watch how · {t}', { t: dur(media.duration) }) : t('See how, step by step');
  return `<a class="ac-ob__help" href="${esc(helpPath(slug))}" aria-label="${esc(`${meta}: ${title}`)}">
    ${img ? `<span class="ac-ob__thumb" aria-hidden="true"><img src="${esc(img)}" alt="" width="64" height="36" loading="lazy" decoding="async">${icon('play')}</span>` : ''}<span>${esc(meta)}</span></a>`;
}

function actionHtml(s: StepView, csrf: string, serviceId: number | null, primary: boolean) {
  const a = s.action;
  if (!a) return '';
  const cls = `hp-btn ${primary ? 'hp-btn--brand' : 'hp-btn--ghost'} ac-sm`;
  const label = ACTION()[s.id];
  if (a.kind === 'link') return `<a class="${cls}" href="${esc(a.href)}">${esc(label)}</a>`;
  if (!serviceId) return '';
  return `<form method="post" action="/account/sso" class="ac-inline"><input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="to" value="panel"><input type="hidden" name="id" value="${esc(serviceId)}"><input type="hidden" name="tab" value="${esc(a.tab)}"><button type="submit" class="${cls}">${esc(label)}${icon('external')}</button></form>`;
}
const mini = (csrf: string, op: string, step: string, label: string, cls = '') =>
  `<form method="post" action="/account/onboarding" class="ac-inline" data-ob-op><input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="op" value="${esc(op)}"><input type="hidden" name="step" value="${esc(step)}"><button type="submit" class="ac-ob__mini${cls ? ' ' + cls : ''}">${esc(label)}</button></form>`;

function stepRow(s: StepView, o: { csrf: string; domain: string; hosting: boolean; serviceId: number | null; next: boolean }) {
  const why = WHY(o.domain, o.hosting)[s.id];
  const state = s.status === 'checking'
    ? `<span class="ac-ob__st" data-ob-checking>${esc(t('Not checked yet'))}</span>`
    : s.optional ? `<span class="ac-ob__st">${esc(t('Optional'))}</span>` : '';
  const extra = s.id === 'email' ? `<a class="ac-ob__extra" href="${esc(helpPath('set-up-email'))}">${icon('phone')}${esc(t('Set up email on your phone'))}</a>` : '';
  // the next step is open; the others are one line each and open on click (native <details>, keyboard accessible)
  return `<li class="ac-ob__s is-${s.status}${o.next ? ' is-next' : ''}" data-step="${esc(s.id)}"><details${o.next ? ' open' : ''}>
    <summary><span class="ac-ob__ic" aria-hidden="true">${icon(STEP_IC[s.id])}</span><span class="ac-ob__t"><b>${esc(TITLE()[s.id])}</b>${state}</span>${icon('chev')}</summary>
    <div class="ac-ob__b">
      <p class="ac-ob__why">${esc(why)}</p>
      <div class="ac-ob__a">${actionHtml(s, o.csrf, o.serviceId, o.next)}${helpLink(s.help)}${extra}<span class="ac-ob__m">${mini(o.csrf, 'done', s.id, t('Mark as done'))}${mini(o.csrf, 'skip', s.id, t('Skip'))}</span></div>
    </div>
  </details></li>`;
}

/** The checklist card (or '' when it is not shown). `refresh`: account.js asks /account/api/onboarding for fresh checks. */
export function onboardingCard(c: Card, o: { csrf: string }) {
  if (!c.show || !c.target) return '';
  const tg = c.target, p = c.prog;
  const closed = c.steps.filter((s) => s.status === 'done' || s.status === 'skipped');
  const open = c.steps.filter((s) => s.status !== 'done' && s.status !== 'skipped');
  const R = 20, CIRC = 2 * Math.PI * R;
  const ring = `<span class="ac-ob__ring" aria-hidden="true"><svg viewBox="0 0 48 48" width="48" height="48"><circle cx="24" cy="24" r="${R}" class="ac-ob__ring-bg"/><circle cx="24" cy="24" r="${R}" class="ac-ob__ring-fg" stroke-dasharray="${CIRC.toFixed(1)}" stroke-dashoffset="${(CIRC * (1 - p.pct / 100)).toFixed(1)}"/></svg><b class="num">${p.done}/${p.total}</b></span>`;
  const sub = t('{n} of {m} done', { n: p.done, m: p.total });
  const doneList = closed.length ? `<ul class="ac-ob__done" aria-label="${esc(t('Done'))}">${closed.map((s) => `<li class="is-${s.status}">${icon(s.status === 'done' ? 'check' : 'right')}<span>${esc(TITLE()[s.id])}</span><small>${esc(s.status === 'skipped' ? t('Skipped') : s.auto ? t('Detected') : t('Marked done'))}</small>${s.auto ? '' : mini(o.csrf, 'undo', s.id, t('Undo'), 'ac-ob__mini--undo')}</li>`).join('')}</ul>` : '';
  const celebrate = c.celebrate ? `<div class="ac-ob__yay" role="status" data-ob-yay data-ghfx-slot>${icon('check')}<div><b>${esc(t('Your site is live!'))}</b><p>${esc(t('Everything is set up for {d}. Nice work.', { d: tg.domain }))}</p></div></div>` : '';
  const nextId = p.next?.id;
  return `<section class="ac-card ac-ob${c.celebrate ? ' is-complete' : ''}" id="ob" aria-labelledby="ac-ob-h" data-reveal style="--i:0" data-ob${c.stale ? ' data-ob-refresh="1"' : ''}>
    <header class="ac-ob__head">${ring}
      <div class="ac-ob__hd"><h2 class="hp-col-h" id="ac-ob-h">${esc(t('Get your site live'))}</h2><p class="ac-ob__sub"><span class="ac-mono">${esc(tg.domain)}</span><span aria-hidden="true"> · </span><span>${esc(sub)}</span></p></div>
      <form method="post" action="/account/onboarding" class="ac-inline ac-ob__x"><input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="op" value="dismiss"><button type="submit" class="ac-ob__mini" aria-label="${esc(t('Hide the setup checklist'))}">${icon('x')}<span>${esc(t('Hide'))}</span></button></form>
    </header>
    <div class="ac-ob__bar" role="progressbar" aria-label="${esc(t('Setup progress'))}" aria-valuemin="0" aria-valuemax="${p.total}" aria-valuenow="${p.done}" aria-valuetext="${esc(`${tg.domain}: ${sub}`)}"><i style="width:${p.pct}%"></i></div>
    ${celebrate}
    ${open.length ? `<ol class="ac-ob__list">${open.map((s) => stepRow(s, { csrf: o.csrf, domain: tg.domain, hosting: tg.hosting, serviceId: tg.serviceId, next: s.id === nextId })).join('')}</ol>` : ''}
    ${doneList}
    <p class="ac-ob__live" aria-live="polite" data-ob-msg></p>
  </section>`;
}
