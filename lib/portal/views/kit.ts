// Small HTML-string building blocks for the customer portal. All data passes through `esc`.
import { esc } from '../../render/util';
import { icon, hexIcon } from '../../theme/ui';
import { t, intlTag, moneyTag } from '../i18n';

export { esc, icon, hexIcon, t };

/** Hexagon status marks for flash messages and alerts (account.css .ac-mk): the success one draws itself in once
 *  (outline, fill, then the check), the error one is static. Decorative: the text next to it carries the meaning. */
export const okMark = () => '<span class="ac-mk ac-mk--ok" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" focusable="false"><path class="ac-mk__fill" d="M12 1.8 20.8 6.9v10.2L12 22.2 3.2 17.1V6.9z"/><path class="ac-mk__hex" d="M12 1.8 20.8 6.9v10.2L12 22.2 3.2 17.1V6.9z" pathLength="100"/><path class="ac-mk__tick" d="m8 12.3 2.8 2.8L16.3 9.6" pathLength="100"/></svg></span>';
export const errMark = () => '<span class="ac-mk ac-mk--err" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" focusable="false"><path class="ac-mk__fill" d="M12 1.8 20.8 6.9v10.2L12 22.2 3.2 17.1V6.9z"/><path class="ac-mk__bang" d="M12 7.5v5.5M12 16.3v.2"/></svg></span>';

export type Nav = 'dashboard' | 'services' | 'domains' | 'renewals' | 'billing' | 'support' | 'reports' | 'sell' | 'profile' | 'team' | 'settings';

export const validDate = (s: unknown) => !!s && !/^0000/.test(String(s)) && !Number.isNaN(Date.parse(String(s).slice(0, 10)));
export function fmtDate(s: unknown) {
  if (!validDate(s)) return '—';
  const d = new Date(String(s).slice(0, 10) + 'T00:00:00Z');
  return d.toLocaleDateString(intlTag(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
export function fmtDateTime(s: unknown) {
  const v = String(s || '');
  if (!validDate(v)) return '—';
  const d = new Date(v.replace(' ', 'T') + (v.length > 10 && !/Z|[+-]\d\d:?\d\d$/.test(v) ? 'Z' : ''));
  if (Number.isNaN(+d)) return fmtDate(v);
  return d.toLocaleString(intlTag(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
}
export function daysUntil(s: unknown) {
  if (!validDate(s)) return null;
  const t = Date.parse(String(s).slice(0, 10) + 'T00:00:00Z');
  return Math.round((t - Date.now()) / 86400000);
}
export function money(v: unknown, code = 'USD') {
  const n = parseFloat(String(v ?? ''));
  if (!Number.isFinite(n)) return '—';
  try { return new Intl.NumberFormat(moneyTag(), { style: 'currency', currency: code || 'USD' }).format(n); }
  catch { return `${n.toFixed(2)} ${code}`; }
}
export const cycleLabel = (c: unknown) => {
  const s = String(c || '');
  return t(({ 'Free Account': 'Free', 'One Time': 'One-time', Onetime: 'One-time' } as Record<string, string>)[s] || s || '—');
};

type Tone = 'ok' | 'warn' | 'bad' | 'muted' | 'info';
const TONES: [RegExp, Tone][] = [
  [/^(active|paid|answered|completed)$/i, 'ok'],
  [/^(pending|unpaid|customer-reply|awaiting reply|in progress|on hold|pending transfer|payment pending|grace|redemption)/i, 'warn'],
  [/^(suspended|overdue|expired|fraud|collections|transferred away)$/i, 'bad'],
  [/^(open)$/i, 'info'],
];
export function pill(status: unknown, override?: Tone) {
  const raw = String(status || 'Unknown');
  const s = ({ 'Customer-Reply': 'Awaiting reply', 'Answered': 'Answered', 'In Progress': 'In progress', 'On Hold': 'On hold' } as Record<string, string>)[raw] || raw;
  const tone = override || TONES.find(([r]) => r.test(raw))?.[1] || 'muted';
  return `<span class="ac-pill ac-pill--${tone}"><i aria-hidden="true"></i>${esc(t(s))}</span>`;
}

export function productIcon(p: any) {
  const s = `${p.groupname || ''} ${p.name || ''} ${p.module || ''}`.toLowerCase();
  if (/ssl|certificate/.test(s)) return 'shield';
  if (/mail/.test(s)) return 'mail';
  if (/reseller/.test(s)) return 'users';
  if (/dedicated|bare/.test(s)) return 'server';
  if (/vps|server|cloud|vpsautomation|virtual/.test(s)) return 'cloud';
  if (/wordpress/.test(s)) return 'wp';
  return 'layers';
}
/** VPS/servers (incl. the rdp.monster module): get the server status card. */
export const isServer = (p: any) => /vps|server|dedicated|cloud/i.test(`${p.groupname || ''} ${p.name || ''}`) || /vpsautomation|virtualizor|proxmox|solusvm/i.test(String(p.module || ''));

export const ipList = (p: any) => {
  const extra = String(p.assignedips || '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
  return [...new Set([String(p.dedicatedip || '').trim(), ...extra].filter(Boolean))];
};

export const configOptions = (p: any): { label: string; value: string }[] => {
  const raw = p.configoptions?.configoption;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.map((o: any) => ({ label: String(o.option || ''), value: String(o.value ?? '') })).filter((o) => o.label && o.value !== '');
};

/** A POST form button that hands off securely to the full client area. */
const vmap = (v?: string) => (v === 'quiet' || !v ? 'ghost' : v);
export function ssoButton(csrf: string, to: string, id: number | string | undefined, label: string, o: { variant?: 'brand' | 'ghost' | 'dark' | 'quiet' | 'light' | 'outline'; ic?: string; sm?: boolean; block?: boolean } = {}) {
  const v = vmap(o.variant);
  return `<form method="post" action="/account/sso" class="ac-inline" target="_self">
    <input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="to" value="${esc(to)}">${id !== undefined ? `<input type="hidden" name="id" value="${esc(id)}">` : ''}
    <button type="submit" class="hp-btn hp-btn--${v}${o.sm ? ' ac-sm' : ''}${o.block ? ' hp-btn--block' : ''}">${o.ic ? icon(o.ic) : ''}${esc(label)}</button>
  </form>`;
}

export const btn = (label: string, href: string, o: { variant?: 'brand' | 'ghost' | 'dark' | 'quiet' | 'light' | 'outline'; ic?: string; sm?: boolean } = {}) =>
  `<a class="hp-btn hp-btn--${vmap(o.variant)}${o.sm ? ' ac-sm' : ''}" href="${esc(href)}">${o.ic ? icon(o.ic) : ''}${esc(label)}</a>`;

export function empty(title: string, text: string, actionHtml = '', ic = 'box') {
  return `<div class="hp-empty ac-empty">${hexIcon(ic)}<h3>${esc(title)}</h3><p>${esc(text)}</p>${actionHtml ? `<div class="hp-actions">${actionHtml}</div>` : ''}</div>`;
}

export function errorBox(what: string, retryHref: string) {
  return `<div class="ac-error" role="alert"><span class="ac-error__ic">${icon('alert')}</span><div><h3>${esc(t("We couldn't load {what} right now", { what }))}</h3><p>${esc(t('Our billing system did not respond. Your services are not affected. Try again in a moment.'))}</p></div><a class="hp-btn hp-btn--ghost ac-sm" href="${esc(retryHref)}">${icon('refresh')}${esc(t('Try again'))}</a></div>`;
}

export const card = (title: string, body: string, o: { action?: string; id?: string; cls?: string; flush?: boolean; i?: number } = {}) =>
  `<section class="ac-card${o.cls ? ' ' + o.cls : ''}" data-reveal style="--i:${o.i ?? 0}"${o.id ? ` aria-labelledby="${esc(o.id)}"` : ''}><header class="ac-card__head"><h2 class="hp-col-h"${o.id ? ` id="${esc(o.id)}"` : ''}>${esc(title)}</h2>${o.action || ''}</header><div class="ac-card__body${o.flush ? ' ac-card__body--flush' : ''}">${body}</div></section>`;

export const dl = (rows: [string, string][]) =>
  `<dl class="ac-dl">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

/** Plain-text ticket message: escaped, line breaks kept, no HTML from the message is ever rendered. */
export const plainText = (s: unknown) =>
  esc(String(s ?? '').replace(/\r\n?/g, '\n').replace(/<br\s*\/?>/gi, '\n')).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');

export const initials = (name: string, email = '') => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = parts.length ? (parts[0][0] + (parts[1]?.[0] || '')) : email[0] || '?';
  return s.toUpperCase();
};

export function fieldErr(errs: Record<string, string> | undefined, k: string) {
  return errs?.[k] ? `<p class="ac-ferr" id="err-${esc(k)}">${icon('alert')}${esc(errs[k])}</p>` : '';
}
export const invalid = (errs: Record<string, string> | undefined, k: string) => (errs?.[k] ? ` aria-invalid="true" aria-describedby="err-${esc(k)}"` : '');
