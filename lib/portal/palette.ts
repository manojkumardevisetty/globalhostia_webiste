// Command palette data (/account/api/palette): the signed-in client's pages, services, domains, invoices, tickets and
// actions as a small JSON index for account.js to search instantly. No secrets: names, statuses and links only.
// Cached in memory per session (2 minutes) so opening the palette repeatedly costs no billing-API calls.
import 'server-only';
import * as api from './api';
import { t } from './i18n';
import { fmtDate, money } from './views/kit';

export type PalItem = { g: 'pages' | 'services' | 'domains' | 'invoices' | 'tickets' | 'actions'; l: string; s?: string; h?: string; a?: { to: string; id?: number }; k?: string; ic: string };

const cache = new Map<string, { at: number; lang: string; items: PalItem[] }>();
const TTL = 120_000;

export function pages(): PalItem[] {
  return [
    { g: 'pages', l: t('Dashboard'), h: '/account', ic: 'grid', k: 'home overview' },
    { g: 'pages', l: t('Products & Services'), h: '/account/services', ic: 'server', k: 'hosting vps servers' },
    { g: 'pages', l: t('Domains'), h: '/account/domains', ic: 'globe', k: 'portfolio dns nameservers' },
    { g: 'pages', l: t('Renewals'), h: '/account/renewals', ic: 'refresh', k: 'renew expiring' },
    { g: 'pages', l: t('Billing'), h: '/account/invoices', ic: 'card', k: 'invoices payments' },
    { g: 'pages', l: t('Support'), h: '/account/support', ic: 'headset', k: 'tickets help' },
    { g: 'pages', l: t('Profile'), h: '/account/profile', ic: 'user', k: 'address contact' },
    { g: 'pages', l: t('Team access'), h: '/account/team', ic: 'users', k: 'users invite permissions' },
    { g: 'pages', l: t('App & notifications'), h: '/account/settings', ic: 'bell', k: 'install push language settings' },
  ];
}

export async function paletteItems(cid: number, jti: string, lang: string, cur: string): Promise<{ items: PalItem[]; partial: boolean }> {
  const hit = cache.get(jti);
  if (hit && hit.lang === lang && Date.now() - hit.at < TTL) return { items: hit.items, partial: false };
  const settle = async <T,>(p: Promise<T>) => { try { return await p; } catch { return null; } };
  const [svc, dom, inv, tix] = await Promise.all([
    settle(api.getClientsProducts(cid)), settle(api.getClientsDomains(cid)), settle(api.getInvoices(cid).then((r) => r.list)), settle(api.getTickets(cid)),
  ]);
  const items: PalItem[] = [...pages()];
  const unpaid = (inv || []).filter((i: any) => /unpaid/i.test(String(i.status)));
  if (unpaid.length) items.push({ g: 'actions', l: t('Pay all unpaid invoices'), s: `${unpaid.length}`, a: { to: 'masspay' }, ic: 'card', k: 'pay invoices balance' });
  items.push({ g: 'actions', l: t('Renew domains'), h: '/account/renewals', ic: 'refresh', k: 'renew domains expiring' });
  items.push({ g: 'actions', l: t('Open a support ticket'), h: '/account/support/new', ic: 'chat', k: 'new ticket help' });
  for (const p of (svc || []).filter((x: any) => !/terminated|cancelled|fraud/i.test(String(x.status))).slice(0, 100)) {
    const name = String(p.translated_name || p.name || t('Service'));
    items.push({ g: 'services', l: name, s: [p.domain, t(String(p.status || ''))].filter(Boolean).join(' · '), h: `/account/services/${Number(p.id)}`, ic: 'server', k: `${p.domain || ''} ${p.dedicatedip || ''} ${p.groupname || ''}` });
    if (/active/i.test(String(p.status)) && p.domain) items.push({ g: 'actions', l: t('Open Manage hosting for {s}', { s: String(p.domain) }), h: `/account/services/${Number(p.id)}`, ic: 'settings', k: `manage hosting ${name}` });
  }
  for (const d of (dom || []).slice(0, 250)) {
    const name = String(d.domainname || '').toLowerCase();
    items.push({ g: 'domains', l: name, s: `${t(String(d.status || ''))} · ${t('Expires {d}', { d: fmtDate(d.expirydate) })}`, h: `/account/domains/${Number(d.id)}`, ic: 'globe' });
    if (/^active$/i.test(String(d.status))) items.push({ g: 'actions', l: t('Add DNS record for {d}', { d: name }), h: `/account/domains/${Number(d.id)}?add=1#dns-add`, ic: 'database', k: 'dns record a mx txt cname' });
  }
  for (const i of (inv || []).slice(0, 100)) {
    const num = String(i.invoicenum || i.id);
    items.push({ g: 'invoices', l: t('Invoice #{n}', { n: num }), s: `${t(String(i.status || ''))} · ${money(i.total, i.currencycode || cur)} · ${t('Due {d}', { d: fmtDate(i.duedate) })}`, h: `/account/invoices/${Number(i.id)}`, ic: 'card', k: `${num} ${i.status}` });
  }
  for (const tk of (tix || []).slice(0, 100)) {
    items.push({ g: 'tickets', l: String(tk.subject || t('Ticket')), s: `#${tk.tid} · ${t(String(tk.status || ''))}`, h: `/account/support/${Number(tk.id)}`, ic: 'chat', k: String(tk.tid || '') });
  }
  const partial = !svc || !dom || !inv || !tix;
  if (cache.size > 2000) cache.clear();
  if (!partial) cache.set(jti, { at: Date.now(), lang, items });
  return { items, partial };
}

export const forgetPalette = (jti: string) => cache.delete(jti);
