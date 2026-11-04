// Hosting usage in the portal (lib/cx/usage*.ts): meters for disk, bandwidth, inodes and mailboxes vs the plan limits
// (warn / critical thresholds from the admin settings), the dashboard alert strip, the service page card, and the
// one-click upgrade page (also loaded into a dialog by account.js): the next plans with their catalog prices and the
// prorated amount due today from WHMCS. The order is only placed after the customer confirms.
import { card, esc, fmtDate, icon, money, t, cycleLabel } from './kit';
import { tn, intlTag } from '../i18n';
import { pctOf, levelOf, worstOf, fmtAmount, type Metric, type MetricKey, type Snapshot, type UsageConfig, type PlanOption, type Quote, type UpgradeOptions } from '../../cx/usage-core';

const LABEL: () => Record<MetricKey, string> = () => ({ disk: t('Disk space'), bandwidth: t('Bandwidth this month'), inodes: t('Files and folders'), mailboxes: t('Email accounts') });
const SHORT: () => Record<MetricKey, string> = () => ({ disk: t('disk space'), bandwidth: t('monthly bandwidth'), inodes: t('files and folders (inodes)'), mailboxes: t('email accounts') });
const amt = (v: number, u: 'MB' | '') => fmtAmount(v, u, intlTag());
const tone = (l: string) => (l === 'critical' ? 'bad' : l === 'warn' ? 'warn' : 'ok');

function meter(m: Metric, cfg: UsageConfig) {
  const label = LABEL()[m.key];
  if (m.limit === null) {
    return `<div class="ac-meter ac-meter--unl"><div class="ac-meter__top"><span>${esc(label)}</span><b class="num">${esc(amt(m.used, m.unit))} <small>${esc(t('used · Unlimited'))}</small></b></div><div class="ac-meter__bar" aria-hidden="true"><i></i></div></div>`;
  }
  const pct = pctOf(m)!, lv = levelOf(pct, cfg), shown = Math.floor(pct);
  const word = pct >= 100 ? t('Limit reached') : lv === 'critical' ? t('Almost full') : lv === 'warn' ? t('Getting full') : t('Healthy');
  const text = t('{u} of {l} used ({p}%)', { u: amt(m.used, m.unit), l: amt(m.limit, m.unit), p: shown });
  return `<div class="ac-meter ac-meter--${tone(lv)}" data-metric="${m.key}">
    <div class="ac-meter__top"><span>${esc(label)}</span><b class="num">${esc(amt(m.used, m.unit))} <small>${esc(t('of {l}', { l: amt(m.limit, m.unit) }))}</small></b></div>
    <div class="ac-meter__bar" role="meter" aria-label="${esc(t('{x} used', { x: label }))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(shown, 100)}" aria-valuetext="${esc(text)}"><i style="width:${Math.min(pct, 100)}%"></i><b class="ac-meter__tick" style="inset-inline-start:${cfg.warn}%" aria-hidden="true"></b></div>
    <small class="ac-meter__st">${shown}% · ${esc(word)}</small>
  </div>`;
}

const upgradeLink = (sid: number, label: string, primary = true) =>
  `<a class="hp-btn ${primary ? 'hp-btn--brand' : 'hp-btn--ghost'} ac-sm" href="/account/services/${sid}/upgrade" data-ac-upgrade>${icon('trend')}${esc(label)}</a>`;
const panelForm = (csrf: string, sid: number, label: string) =>
  `<form method="post" action="/account/sso" class="ac-inline"><input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="to" value="panel"><input type="hidden" name="id" value="${sid}"><input type="hidden" name="tab" value="files"><button type="submit" class="hp-btn hp-btn--ghost ac-sm">${esc(label)}</button></form>`;

/** Meters + the "running out" note with Upgrade / Free up space. */
export function usageBlock(p: any, snap: Snapshot | undefined, cfg: UsageConfig, csrf: string, o: { title?: boolean } = {}) {
  const sid = Number(p.id);
  const head = o.title ? `<div class="ac-usage__head"><a href="/account/services/${sid}">${esc(p.translated_name || p.name || t('Hosting'))}</a>${p.domain ? `<small class="ac-mono">${esc(p.domain)}</small>` : ''}</div>` : '';
  const metrics = (snap?.metrics || []).filter((m) => cfg.metrics[m.key] || m.limit === null);
  if (!metrics.length) return `<div class="ac-usage">${head}<p class="ac-usage__na">${icon('info')}${esc(t('Usage figures appear after the first daily sync from the server.'))}</p></div>`;
  const w = worstOf(metrics, cfg);
  const active = /^active$/i.test(String(p.status || ''));
  const note = w.level !== 'ok' && w.metric && active ? `<div class="ac-usage__up ac-usage__up--${tone(w.level)}" role="status"><p>${icon('alert')}<span>${esc((w.pct ?? 0) >= 100
    ? t('You have reached the {m} limit of your plan.', { m: SHORT()[w.metric.key] })
    : t('You are using {p}% of your {m}.', { p: Math.floor(w.pct ?? 0), m: SHORT()[w.metric.key] }))} ${esc(t('Free up space, or move to a bigger plan and pay only the difference.'))}</span></p>
    <div class="ac-usage__acts">${upgradeLink(sid, t('Upgrade'))}${w.metric.key !== 'bandwidth' ? panelForm(csrf, sid, t('Free up space')) : ''}</div></div>` : '';
  return `<div class="ac-usage">${head}<div class="ac-usage__m">${metrics.map((m) => meter(m, cfg)).join('')}</div>${note}
    <small class="ac-usage__t">${esc(snap?.source === 'panel' ? t('From your hosting panel · updated {d}', { d: fmtDate(snap.at) }) : t('From the daily billing sync · updated {d}', { d: fmtDate(snap?.at) }))}</small></div>`;
}

/** Service page card (hosting services only). */
export function usageServiceCard(p: any, snap: Snapshot | undefined, cfg: UsageConfig, csrf: string) {
  const sid = Number(p.id);
  const action = /^active$/i.test(String(p.status || '')) ? `<a class="ac-more" href="/account/services/${sid}/upgrade" data-ac-upgrade>${esc(t('Change plan'))}${icon('right')}</a>` : '';
  return card(t('Usage'), usageBlock(p, snap, cfg, csrf), { id: 'ac-usage-h', action });
}

/** Dashboard card: usage for each hosting service, fullest first (hidden without hosting). */
export function usageDashCard(products: any[], snaps: Map<number, Snapshot>, cfg: UsageConfig, csrf: string, i = 2) {
  if (!products.length) return '';
  const score = (p: any) => worstOf(snaps.get(Number(p.id))?.metrics || [], cfg).pct ?? -1;
  const shown = [...products].sort((a, b) => score(b) - score(a)).slice(0, 4);
  return card(t('Hosting usage'), `<div class="ac-usage-list">${shown.map((p) => usageBlock(p, snaps.get(Number(p.id)), cfg, csrf, { title: true })).join('')}</div>`,
    { id: 'ac-use-h', i, action: products.length > shown.length ? `<a class="ac-more" href="/account/services">${esc(t('All {n}', { n: products.length }))}${icon('right')}</a>` : '' });
}

/** Dashboard alert strip: services at or over the warning threshold. */
export function usageStrip(products: any[], snaps: Map<number, Snapshot>, cfg: UsageConfig) {
  const hot = products.map((p) => ({ p, w: worstOf(snaps.get(Number(p.id))?.metrics || [], cfg) })).filter((x) => x.w.level !== 'ok' && x.w.metric && /^active$/i.test(String(x.p.status)))
    .sort((a, b) => (b.w.pct ?? 0) - (a.w.pct ?? 0));
  if (!hot.length) return '';
  const crit = hot.some((x) => x.w.level === 'critical');
  const items = hot.slice(0, 3).map((x) => `<li><span><a href="/account/services/${Number(x.p.id)}#ac-usage-h">${esc(x.p.translated_name || x.p.name || t('Hosting'))}</a>${x.p.domain ? ` <small class="ac-mono">${esc(x.p.domain)}</small>` : ''}: ${esc(t('{p}% of {m} used', { p: Math.floor(x.w.pct ?? 0), m: SHORT()[x.w.metric!.key] }))}</span>${upgradeLink(Number(x.p.id), t('Upgrade'), false)}</li>`).join('');
  return `<div class="ac-ustrip ac-ustrip--${crit ? 'bad' : 'warn'}" role="${crit ? 'alert' : 'status'}">${icon('gauge')}<div><b>${esc(crit ? tn(hot.length, '{n} hosting plan is almost full', '{n} hosting plans are almost full') : tn(hot.length, '{n} hosting plan is getting full', '{n} hosting plans are getting full'))}</b><ul>${items}</ul></div></div>`;
}

/* ------------------------------------------------------------------ upgrade */
export type UpgradeView = {
  csrf: string; p: any; cur: string; plans: UpgradeOptions | null; quotes: Map<number, Quote | null>; key: string; fragment?: boolean;
  error?: string; snap?: Snapshot; cfg?: UsageConfig;
};
const cyc = (c: string) => cycleLabel(({ monthly: 'Monthly', quarterly: 'Quarterly', semiannually: 'Semi-Annually', annually: 'Annually', biennially: 'Biennially', triennially: 'Triennially' } as Record<string, string>)[c] || c);

function planCard(x: PlanOption, q: Quote | null | undefined, cur: string, first: boolean, nextDue: string) {
  const id = `up-${x.pid}`;
  const due = q ? `<span class="ac-up__due"><small>${esc(t('Due today'))}</small><b class="num">${esc(money(q.dueToday, cur))}</b></span>` : '';
  const detail = q ? (q.daysLeft !== null ? t('Prorated for the {n} days left in this billing period. Then {p} {c} from {d}.', { n: q.daysLeft, p: money(x.price, cur), c: cyc(x.cycle).toLowerCase(), d: fmtDate(nextDue) }) : t('Then {p} {c}.', { p: money(x.price, cur), c: cyc(x.cycle).toLowerCase() }))
    : t('The prorated amount could not be calculated right now, so this plan cannot be ordered here. Try again in a moment.');
  return `<li class="ac-up__opt${q ? '' : ' is-off'}">
    <input type="radio" name="pid" value="${x.pid}" id="${id}"${first && q ? ' checked' : ''}${q ? '' : ' disabled'} data-due="${q ? esc(money(q.dueToday, cur)) : ''}" data-name="${esc(x.name)}">
    <label for="${id}">
      <span class="ac-up__top"><b>${esc(x.name)}</b><span class="ac-up__price num">${esc(money(x.price, cur))}<small> / ${esc(cyc(x.cycle))}</small></span></span>
      ${x.features.length ? `<span class="ac-up__f">${x.features.slice(0, 4).map((f) => `<span>${icon('check')}${esc(f)}</span>`).join('')}</span>` : ''}
      ${x.setupFee > 0 ? `<small class="ac-up__setup">${esc(t('Setup fee {p}', { p: money(x.setupFee, cur) }))}</small>` : ''}
      <span class="ac-up__q">${due}<small>${esc(detail)}</small></span>
    </label>
  </li>`;
}

/** Upgrade page body (or the dialog fragment). One form: choose a plan, confirm, pay the invoice in the client area. */
export function upgradeView(o: UpgradeView) {
  const p = o.p, sid = Number(p.id), cur = o.plans?.currency || o.cur;
  const current = o.plans?.current;
  const offered = (o.plans?.options || []);
  const usable = offered.filter((x) => o.quotes.get(x.pid));
  const head = `<div class="ac-up__cur"><small>${esc(t('Current plan'))}</small><b>${esc(p.translated_name || p.name || current?.name || '')}</b>${current?.price !== null && current?.price !== undefined ? `<span class="num">${esc(money(current.price, cur))} / ${esc(cyc(current.cycle))}</span>` : ''}${p.domain ? `<small class="ac-mono">${esc(p.domain)}</small>` : ''}</div>`;
  const usage = o.snap && o.cfg ? (() => { const w = worstOf(o.snap.metrics, o.cfg); return w.metric && w.level !== 'ok' ? `<p class="ac-up__why">${icon('gauge')}${esc(t('You are using {p}% of your {m}.', { p: Math.floor(w.pct ?? 0), m: SHORT()[w.metric.key] }))}</p>` : ''; })() : '';
  const err = o.error ? `<div class="ac-alert ac-alert--err" role="alert">${icon('alert')}<span>${esc(o.error)}</span></div>` : '';
  const fallback = `<form method="post" action="/account/sso" class="ac-inline"><input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="to" value="upgrade"><input type="hidden" name="id" value="${sid}"><button type="submit" class="ac-ob__mini">${esc(t('More options in the client area'))}${icon('external')}</button></form>`;
  let body: string;
  if (!o.plans) body = `<p class="ac-up__none">${esc(t('We could not load the plans right now. Please try again in a moment.'))}</p>`;
  else if (!offered.length) body = `<p class="ac-up__none">${esc(o.plans.reason === 'cycle' ? t('This service cannot be upgraded online. Open a ticket and we will help.') : t('You are already on the biggest plan in this range. For more room, a VPS gives you dedicated resources.'))}</p>
    <div class="ac-up__acts">${o.plans.reason === 'cycle' ? `<a class="hp-btn hp-btn--brand ac-sm" href="/account/support/new?service=${sid}">${esc(t('Open a ticket'))}</a>` : `<a class="hp-btn hp-btn--brand ac-sm" href="/vps-hosting">${esc(t('See VPS servers'))}</a><a class="hp-btn hp-btn--ghost ac-sm" href="/account/support/new?service=${sid}">${esc(t('Ask us'))}</a>`}</div>`;
  else body = `<form method="post" action="/account/services/${sid}/upgrade" class="ac-up__form" data-ac-busy data-up-form>
      <input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="key" value="${esc(o.key)}">
      <fieldset><legend class="ac-up__lg">${esc(t('Choose your new plan'))}</legend><ul class="ac-up__list">${offered.map((x, i) => planCard(x, o.quotes.get(x.pid), cur, i === offered.indexOf(usable[0]), p.nextduedate)).join('')}</ul></fieldset>
      <p class="ac-up__fine">${icon('info')}<span>${esc(t('You pay only the difference for the rest of this billing period, with your usual payment method. The new limits apply as soon as the invoice is paid. Nothing changes if you do not pay.'))}</span></p>
      <div class="ac-up__acts"><button type="submit" class="hp-btn hp-btn--brand" name="confirm" value="yes"${usable.length ? '' : ' disabled'}>${icon('card')}<span data-up-cta>${esc(usable[0] ? t('Confirm and pay {p}', { p: money(o.quotes.get(usable[0].pid)!.dueToday, cur) }) : t('Confirm and pay'))}</span></button>${o.fragment ? `<button type="button" class="hp-btn hp-btn--ghost" data-up-close>${esc(t('Cancel'))}</button>` : `<a class="hp-btn hp-btn--ghost" href="/account/services/${sid}">${esc(t('Cancel'))}</a>`}</div>
    </form>`;
  return `<div class="ac-up${o.fragment ? ' ac-up--dlg' : ''}">${o.fragment ? `<header class="ac-up__h"><h2 id="ac-up-h">${esc(t('Upgrade your plan'))}</h2><button type="button" class="ac-up__x" data-up-close aria-label="${esc(t('Close'))}">${icon('x')}</button></header>` : ''}
    ${err}${head}${usage}${body}<div class="ac-up__more">${fallback}</div></div>`;
}

/** Empty dialog the upgrade fragment is loaded into (dashboard and service page). */
export const upgradeDialog = () => `<dialog class="ac-up-dlg" id="ac-up-dlg" aria-labelledby="ac-up-h"><div data-up-body><p class="ac-up__loading">${esc(t('Loading…'))}</p></div></dialog>`;

/** App & notifications: hosting usage alert emails on / off (unsubscribe scope 'usage'). Web push follows the Services topic. */
export function usagePrefsCard(o: { csrf: string; on: boolean; saved?: boolean; cfg: Pick<UsageConfig, 'warn' | 'critical'> }) {
  return card(t('Hosting usage alerts'), `<form method="post" action="/account/settings" class="ac-form ac-st__cats" id="usage-alerts">
      <input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="op" value="usage_prefs">
      ${o.saved ? `<p class="ac-alert ac-alert--ok" role="status">${icon('check')}<span>${esc(t('Your choice is saved.'))}</span></p>` : ''}
      <label class="ac-st__cat"><input type="checkbox" name="usage" value="1"${o.on ? ' checked' : ''}><span><b>${esc(t('Email me when a hosting plan is getting full'))}</b><small>${esc(t('At {w}% and {c}% of disk space, bandwidth, files or email accounts. At most one email per limit each month.', { w: o.cfg.warn, c: o.cfg.critical }))}</small></span></label>
      <div class="ac-form__foot"><button class="hp-btn hp-btn--dark ac-sm" type="submit">${icon('check')}${esc(t('Save choice'))}</button></div>
    </form>`, { id: 'ac-st-use-h' });
}
