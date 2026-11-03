// DNS records section of /account/domains/<id> (anchor #dns). Server-rendered; public/hp/pages/account.js adds
// in-place edit/delete toggles, per-type fields and the type filter. Every action is a CSRF-protected POST to
// /account/domains/<id>/dns, so the page works without JavaScript too (?edit= / ?del= / ?add= open the same panels).
import type { DnsRecord } from '../../hosting/types';
import { TEMPLATES, dnsHostName, type ZonePlan } from '../../hosting/dns-plan';
import type { DnsState } from '../dns';
import { card, esc, hexIcon, icon, okMark, t } from './kit';
import { tn } from '../i18n';

export const DNS_OK: Record<string, string> = {
  dns_added: 'Record added. Most resolvers see the change within the record’s TTL.',
  dns_updated: 'Record updated.',
  dns_deleted: 'Record deleted.',
  dns_template: 'Template applied. Your records are updated below.',
  dns_on: 'DNS management is on. Your zone was created with our standard records.',
  dns_ns: 'Nameservers switched to GlobalHostia DNS. The change can take a few hours to reach every network.',
};
/** DNS_OK values are dictionary keys too (translated when shown). */
const okText = (k: string) => ({
  dns_added: t('Record added. Most resolvers see the change within the record’s TTL.'), dns_updated: t('Record updated.'), dns_deleted: t('Record deleted.'),
  dns_template: t('Template applied. Your records are updated below.'), dns_on: t('DNS management is on. Your zone was created with our standard records.'),
  dns_ns: t('Nameservers switched to GlobalHostia DNS. The change can take a few hours to reach every network.'),
} as Record<string, string>)[k] || '';

export interface DnsForm { type?: string; name?: string; value?: string; ttl?: string; priority?: string; weight?: string; port?: string }
export interface DnsView {
  csrf: string; d: any; st?: DnsState; ok?: string;
  /** record id whose edit / delete panel is open (no-JS links), or 'add' */
  edit?: string; del?: string; add?: boolean; tpl?: string;
  err?: { msg: string; scope: 'add' | 'edit' | 'tpl' | 'zone'; id?: string; form?: DnsForm };
}

const TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV'] as const;
const ORDER = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS'];
const TTLS = (): [number, string][] => [[300, t('5 minutes')], [1800, t('30 minutes')], [3600, t('1 hour')], [14400, t('4 hours')], [86400, t('1 day')]];
const HINT = (): Record<string, [string, string]> => ({
  A: ['203.0.113.10', t('IPv4 address of your server.')],
  AAAA: ['2001:db8::10', t('IPv6 address of your server.')],
  CNAME: ['target.example.com', t('Host name this name is an alias of. Not allowed on @.')],
  MX: ['mail.example.com', t('Mail server host name. Lower priority is tried first.')],
  TXT: ['v=spf1 include:_spf.example.com ~all', t('Text value, without surrounding quotes.')],
  SRV: ['sip.example.com', t('Target host. Name must look like _service._tcp.')],
});

const rid = (r: DnsRecord) => r.id.replace(/[^A-Za-z0-9_-]/g, '').slice(-16) || 'x';
const ttlLabel = (n: number) => TTLS().find(([v]) => v === n)?.[1] || (n % 86400 === 0 ? `${n / 86400} d` : n % 3600 === 0 ? `${n / 3600} h` : n % 60 === 0 ? `${n / 60} min` : `${n} s`);
const typePill = (t: string) => `<span class="ac-rt ac-rt--${esc(t.toLowerCase())}">${esc(t)}</span>`;
const nameCell = (n: string, zone: string) => n === '@'
  ? `<span class="ac-dns__n"><b>@</b><small>${esc(zone)}</small></span>`
  : `<span class="ac-dns__n"><b>${esc(n)}</b><small>.${esc(zone)}</small></span>`;
const hidden = (k: string, v: string) => `<input type="hidden" name="${k}" value="${esc(v)}">`;
const alert = (tone: 'ok' | 'err' | 'warn' | 'info', text: string, ic = tone === 'ok' ? 'check' : tone === 'info' ? 'info' : 'alert') =>
  `<div class="ac-alert ac-alert--${tone}" role="${tone === 'ok' || tone === 'info' ? 'status' : 'alert'}">${tone === 'ok' ? okMark() : icon(ic)}<span>${text}</span></div>`;

function ttlSelect(id: string, val?: string | number) {
  const v = Number(val) || 3600;
  const opts = TTLS().some(([n]) => n === v) ? TTLS() : [...TTLS(), [v, ttlLabel(v)] as [number, string]];
  return `<select class="ac-input" id="${id}" name="ttl">${opts.map(([n, l]) => `<option value="${n}"${n === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
}

/** Fields shared by the add and edit forms. `fixedType` = edit (type cannot change). */
function fields(px: string, zone: string, f: DnsForm, fixedType?: string) {
  const ty = fixedType || f.type || 'A';
  const [ph, help] = HINT()[ty] || HINT().A;
  const typeField = fixedType
    ? `<div class="ac-field ac-dns__ft"><span class="ac-dns__lbl">${esc(t('Type'))}</span>${typePill(fixedType)}${hidden('type', fixedType)}</div>`
    : `<div class="ac-field ac-dns__ft"><label for="${px}-type">${esc(t('Type'))}</label><select class="ac-input" id="${px}-type" name="type" data-dns-type>${TYPES.map((x) => `<option${x === ty ? ' selected' : ''}>${x}</option>`).join('')}</select></div>`;
  return `${typeField}
    <div class="ac-field ac-dns__fn"><label for="${px}-name">${esc(t('Name'))}</label>
      <div class="ac-dns__suffix"><input class="ac-input ac-mono" id="${px}-name" name="name" value="${esc(f.name ?? '')}" placeholder="@" autocomplete="off" spellcheck="false" autocapitalize="none"><span aria-hidden="true">.${esc(zone)}</span></div>
      <small class="ac-help">${esc(t('Use @ for {z} itself, or a name like www.', { z: zone }))}</small></div>
    <div class="ac-field ac-dns__fv"><label for="${px}-value">${esc(t('Value'))}</label>
      <input class="ac-input ac-mono" id="${px}-value" name="value" value="${esc(f.value ?? '')}" placeholder="${esc(ph)}" required autocomplete="off" spellcheck="false" autocapitalize="none" data-dns-value>
      <small class="ac-help" data-dns-help>${esc(help)}</small></div>
    <div class="ac-field ac-dns__fp" data-for="MX SRV"><label for="${px}-prio">${esc(t('Priority'))}</label><input class="ac-input" id="${px}-prio" name="priority" inputmode="numeric" value="${esc(f.priority ?? (ty === 'SRV' ? '0' : '10'))}"></div>
    <div class="ac-field ac-dns__fp" data-for="SRV"><label for="${px}-weight">${esc(t('Weight'))}</label><input class="ac-input" id="${px}-weight" name="weight" inputmode="numeric" value="${esc(f.weight ?? '0')}"></div>
    <div class="ac-field ac-dns__fp" data-for="SRV"><label for="${px}-port">${esc(t('Port'))}</label><input class="ac-input" id="${px}-port" name="port" inputmode="numeric" value="${esc(f.port ?? '')}" placeholder="443"></div>
    <div class="ac-field ac-dns__fttl"><label for="${px}-ttl">TTL</label>${ttlSelect(`${px}-ttl`, f.ttl)}</div>`;
}

const formOpen = (o: DnsView, op: string, extra = '', attrs = '') =>
  `<form method="post" action="/account/domains/${esc(o.d.id)}/dns" class="ac-dns-form" novalidate${attrs}>${hidden('csrf', o.csrf)}${hidden('op', op)}${extra}`;

function recordRows(o: DnsView, zone: string, recs: DnsRecord[]) {
  return recs.map((r) => {
    const k = rid(r);
    const editOpen = o.edit === r.id || (o.err?.scope === 'edit' && o.err.id === r.id);
    const delOpen = o.del === r.id;
    const val = ['CNAME', 'MX', 'SRV', 'NS'].includes(r.type) ? r.value.replace(/\.$/, '') : r.value;
    const srvMeta = r.type === 'SRV' ? `<small class="ac-dns__meta">${esc(t('port {p} · weight {w}', { p: r.port ?? '', w: r.weight ?? 0 }))}</small>` : '';
    const act = r.readonly
      ? `<span class="ac-dns__lock" title="${esc(t('Managed by GlobalHostia'))}">${icon('lock')}<span>${esc(t('Protected'))}</span></span>`
      : `<a class="ac-dns__ib" href="?edit=${esc(encodeURIComponent(r.id))}#rec-${k}" data-dns-open="ed-${k}" aria-controls="ed-${k}" aria-expanded="${editOpen}">${icon('pen')}<span>${esc(t('Edit'))}</span></a>
         <a class="ac-dns__ib ac-dns__ib--del" href="?del=${esc(encodeURIComponent(r.id))}#rec-${k}" data-dns-open="del-${k}" aria-controls="del-${k}" aria-expanded="${delOpen}">${icon('x')}<span>${esc(t('Delete'))}</span></a>`;
    const f: DnsForm = o.err?.scope === 'edit' && o.err.id === r.id && o.err.form ? o.err.form
      : { name: r.name, value: val, ttl: String(r.ttl), priority: r.priority !== undefined ? String(r.priority) : undefined, weight: r.weight !== undefined ? String(r.weight) : undefined, port: r.port !== undefined ? String(r.port) : undefined };
    const edit = r.readonly ? '' : `<tr class="ac-dns__panel" id="ed-${k}" data-type="${esc(r.type)}"${editOpen ? '' : ' hidden'}><td colspan="6">
      ${o.err?.scope === 'edit' && o.err.id === r.id ? alert('err', esc(o.err.msg)) : ''}
      ${formOpen(o, 'edit', hidden('id', r.id), ` data-type="${esc(r.type)}"`)}<div class="ac-dns__grid">${fields(`ed-${k}`, zone, f, r.type)}</div>
        <div class="ac-dns__btns"><button class="hp-btn hp-btn--brand ac-sm" type="submit">${esc(t('Save changes'))}</button><a class="hp-btn hp-btn--ghost ac-sm" href="#rec-${k}" data-dns-close="ed-${k}">${esc(t('Cancel'))}</a></div></form></td></tr>`;
    const del = r.readonly ? '' : `<tr class="ac-dns__panel ac-dns__panel--del" id="del-${k}"${delOpen ? '' : ' hidden'}><td colspan="6">
      ${formOpen(o, 'delete', hidden('id', r.id) + hidden('confirm', 'yes'))}<p>${icon('alert')}<span>${t('Delete the <b>{t}</b> record for <b class="ac-mono">{n}</b>? Services using it stop resolving once caches expire.', { t: esc(r.type), n: esc(r.name === '@' ? zone : `${r.name}.${zone}`) })}</span></p>
        <div class="ac-dns__btns"><button class="hp-btn hp-btn--danger ac-sm" type="submit">${esc(t('Delete record'))}</button><a class="hp-btn hp-btn--ghost ac-sm" href="#rec-${k}" data-dns-close="del-${k}">${esc(t('Keep it'))}</a></div></form></td></tr>`;
    return `<tr class="ac-dns__rec${r.readonly ? ' is-ro' : ''}" id="rec-${k}" data-rt="${esc(r.type)}" data-rn="${esc(String(r.name).toLowerCase())}">
      <td data-l="${esc(t('Type'))}">${typePill(r.type)}</td>
      <th scope="row" data-l="${esc(t('Name'))}">${nameCell(r.name, zone)}</th>
      <td data-l="${esc(t('Value'))}" class="ac-dns__v"><span class="ac-mono" title="${esc(val)}">${esc(val)}</span>${srvMeta}${r.type === 'TXT' && val.length > 40 ? `<button type="button" class="ac-copy" data-copy="${esc(val)}" aria-label="${esc(t('Copy value'))}">${icon('copy')}<span>${esc(t('Copy'))}</span></button>` : ''}</td>
      <td data-l="${esc(t('Priority'))}" class="num">${r.priority !== undefined && (r.type === 'MX' || r.type === 'SRV') ? esc(r.priority) : '<span class="ac-muted">—</span>'}</td>
      <td data-l="${esc(t('TTL'))}" class="num">${esc(ttlLabel(r.ttl))}</td>
      <td class="ac-dns__act">${act}</td></tr>${edit}${del}`;
  }).join('');
}

function templates(o: DnsView, zone: string, recs: DnsRecord[]) {
  const mx = recs.filter((r) => r.type === 'MX' && r.name === '@').length;
  const msMx = `${zone.replace(/\./g, '-')}.mail.protection.outlook.com`;
  const note: Record<string, string> = {
    google: mx ? tn(mx, 'Replaces {n} existing MX record on {z} and its SPF record.', 'Replaces {n} existing MX records on {z} and its SPF record.', { z: zone }) : t('Adds MX smtp.google.com and an SPF record.'),
    microsoft: mx ? tn(mx, 'MX {m}, replacing {n} MX record. Check the exact value in your Microsoft 365 admin center.', 'MX {m}, replacing {n} MX records. Check the exact value in your Microsoft 365 admin center.', { m: msMx }) : t('MX {m}. Check the exact value in your Microsoft 365 admin center.', { m: msMx }),
    ip: t('Sets A records for {z} and www.{z}, replacing the current ones.', { z: zone }),
    verify: t('Adds a TXT record. Existing records are kept.'),
  };
  const TPL: Record<string, [string, string]> = {
    google: ['Google Workspace', t('Gmail MX record and SPF for your domain.')], microsoft: ['Microsoft 365', t('Outlook MX, SPF and Autodiscover.')],
    ip: [t('Point to an IP'), t('Your domain and www to a server address.')], verify: [t('Verification TXT'), t('Prove ownership to Google, Microsoft, Meta and others.')],
  };
  return `<div class="ac-dns__tpl" role="list">${TEMPLATES.map((tp) => {
    const open = o.tpl === tp.key || (o.err?.scope === 'tpl' && o.err.id === tp.key);
    const input = tp.input === 'ip'
      ? `<div class="ac-field"><label for="tpl-ip">${esc(t('Server IP address'))}</label><input class="ac-input ac-mono" id="tpl-ip" name="ip" required placeholder="203.0.113.10" inputmode="decimal" autocomplete="off" value="${esc(o.err?.scope === 'tpl' && o.err.id === 'ip' ? o.err.form?.value || '' : '')}"></div>`
      : tp.input === 'txt'
        ? `<div class="ac-field"><label for="tpl-txt">${esc(t('Verification value'))}</label><input class="ac-input ac-mono" id="tpl-txt" name="txt" required placeholder="google-site-verification=…" autocomplete="off" spellcheck="false" value="${esc(o.err?.scope === 'tpl' && o.err.id === 'verify' ? o.err.form?.value || '' : '')}"></div>
           <div class="ac-field"><label for="tpl-txtn">${esc(t('Name'))} <span class="ac-muted">${esc(t('(optional)'))}</span></label><div class="ac-dns__suffix"><input class="ac-input ac-mono" id="tpl-txtn" name="name" placeholder="@" autocomplete="off" spellcheck="false" autocapitalize="none" value="${esc(o.err?.scope === 'tpl' && o.err.id === 'verify' ? o.err.form?.name || '' : '')}"><span aria-hidden="true">.${esc(zone)}</span></div></div>`
        : '';
    return `<details class="ac-tpl" role="listitem"${open ? ' open' : ''}><summary>${hexIcon(tp.ic)}<span><b>${esc(TPL[tp.key]?.[0] || tp.label)}</b><small>${esc(TPL[tp.key]?.[1] || tp.desc)}</small></span>${icon('chev')}</summary>
      <div class="ac-tpl__body">${o.err?.scope === 'tpl' && o.err.id === tp.key ? alert('err', esc(o.err.msg)) : ''}
      ${formOpen(o, 'template', hidden('template', tp.key))}${input}<p class="ac-help">${esc(note[tp.key])}</p>
      <button class="hp-btn hp-btn--dark ac-sm" type="submit">${esc(t('Apply {x}', { x: TPL[tp.key]?.[0] || tp.label }))}</button></form></div></details>`;
  }).join('')}</div>`;
}

function nsSwitch(o: DnsView, label: string, cls = 'hp-btn--brand') {
  const target = o.st?.target || [];
  return `<details class="ac-dns__sw"><summary class="hp-btn ${cls} ac-sm">${icon('refresh')}${esc(label)}</summary>
    <div class="ac-dns__swb">${formOpen(o, 'use_ns')}
      <p>${t('We point <b>{d}</b> to {ns}. Records kept by your current DNS host (for example email MX) are not copied, so check you have what you need below first.', { d: esc(o.d.domainname), ns: target.map((n) => `<span class="ac-mono ac-chip">${esc(n)}</span>`).join(' ') })}</p>
      <div class="ac-dns__btns"><button class="hp-btn hp-btn--brand ac-sm" type="submit">${esc(t('Switch nameservers'))}</button></div></form></div></details>`;
}

function zoneHead(plan: ZonePlan, o: DnsView) {
  if (plan.kind === 'hosting') return `<span class="ac-dns__src">${icon('server')}<span>${esc(t('On your hosting plan'))}</span><a href="/account/services/${esc(plan.serviceId)}">${esc(t('View'))}</a></span>`;
  if (plan.kind === 'dnsonly') return `<span class="ac-dns__src">${icon('globe')}<span>GlobalHostia DNS</span></span>`;
  return '';
}

export function dnsSection(o: DnsView): string {
  const st = o.st;
  const zone = String(o.d.domainname || '').toLowerCase();
  if (!st) return '';
  const plan = st.plan;
  const ok = o.ok && DNS_OK[o.ok] ? alert('ok', esc(okText(o.ok))) : '';
  const zerr = o.err?.scope === 'zone' ? alert('err', esc(o.err.msg)) : '';
  const wrap = (body: string, flush = false) => `<div id="dns" class="ac-dns">${card(t('DNS records'), body, { id: 'ac-dns-h', flush, action: zoneHead(plan, o), cls: 'ac-dns__card' })}</div>`;

  if (plan.kind === 'inactive') return wrap(`<p class="ac-muted">${esc(t('DNS records can be managed once the domain is active.'))}</p>`);
  if (plan.kind === 'error') return wrap(`${zerr}<div class="ac-dns__state">${hexIcon('alert')}<div><h3>${esc(t('DNS settings are unavailable right now'))}</h3><p>${esc(t(plan.message))} ${esc(t('Your domain keeps working.'))}</p></div><a class="hp-btn hp-btn--ghost ac-sm" href="?#dns">${icon('refresh')}${esc(t('Try again'))}</a></div>`);
  if (plan.kind === 'taken') return wrap(`<div class="ac-dns__state">${hexIcon('lock')}<div><h3>${esc(t('DNS for this domain is linked to another account'))}</h3><p>${esc(t('This can happen after a domain moves between accounts. Our team can move it to you.'))}</p></div><a class="hp-btn hp-btn--dark ac-sm" href="/account/support/new">${esc(t('Contact support'))}</a></div>`);

  if (plan.kind === 'external') {
    const who = dnsHostName(plan.ns);
    return wrap(`${ok}${zerr}<div class="ac-dns__ext">
      <div class="ac-dns__exth">${hexIcon('globe')}<div><h3>${esc(t('Your DNS is managed by {w}', { w: who === 'another provider' ? t('another provider') : who }))}</h3><p>${esc(t('Records for {z} are edited there. These are the nameservers it uses today:', { z: zone }))}</p></div></div>
      <ul class="ac-dns__nsl">${plan.ns.map((n) => `<li class="ac-mono">${esc(n)}</li>`).join('')}</ul>
      <div class="ac-dns__extf">${plan.canSwitch
        ? `<p>${esc(t('Prefer to manage DNS here? We create your zone with standard records first, then switch the nameservers in one step.'))}</p>${nsSwitch(o, t('Use GlobalHostia DNS'))}`
        : `<p>${esc(t('To manage DNS here, our team needs to prepare your zone first.'))}</p><a class="hp-btn hp-btn--dark ac-sm" href="/account/support/new">${esc(t('Ask support'))}</a>`}</div></div>`);
  }

  if (plan.kind === 'off') {
    const warn = plan.deleg === 'mixed' ? alert('warn', esc(t('Some of this domain’s nameservers are not ours. Set only GlobalHostia nameservers above so every visitor gets the same records.')))
      : plan.deleg === 'unknown' ? alert('info', esc(t('We could not read this domain’s nameservers from the registry just now.'))) : '';
    return wrap(`${ok}${zerr}${warn}<div class="ac-dns__on">${hexIcon('database')}<div><h3>${esc(t('Turn on DNS management'))}</h3>
      <p>${esc(t('{z} uses GlobalHostia nameservers but has no DNS zone yet, so it does not resolve. Turning it on creates the zone with our standard records (website, www and mail), then you can edit every record here.', { z: zone }))}</p></div>
      ${plan.canCreate ? `${formOpen(o, 'enable')}<button class="hp-btn hp-btn--brand" type="submit">${icon('bolt')}${esc(t('Turn on DNS management'))}</button></form>`
        : `<a class="hp-btn hp-btn--dark ac-sm" href="/account/support/new">${esc(t('Ask support to turn it on'))}</a>`}</div>`);
  }

  // hosting / dnsonly: the editor
  const recs = [...(st.records || [])].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || (a.name === '@' ? -1 : b.name === '@' ? 1 : a.name.localeCompare(b.name)));
  const deleg = plan.deleg;
  const live = deleg === 'external' || deleg === 'mixed'
    ? `<div class="ac-dns__warn">${icon('alert')}<div><b>${esc(t('These records are not live yet.'))}</b><span>${esc(deleg === 'mixed' ? t('{z} uses some nameservers at another provider, so the internet still reads its DNS there.', { z: zone }) : t('{z} uses nameservers at another provider, so the internet still reads its DNS there.', { z: zone }))}</span></div>${nsSwitch(o, t('Use GlobalHostia DNS'), 'hp-btn--dark')}</div>` : '';
  if (st.listError) return wrap(`${ok}${zerr}${live}<div class="ac-dns__state">${hexIcon('alert')}<div><h3>${esc(t('We could not read your DNS records'))}</h3><p>${esc(t(st.listError))}</p></div><a class="hp-btn hp-btn--ghost ac-sm" href="?#dns">${icon('refresh')}${esc(t('Try again'))}</a></div>`);

  const counts = ORDER.map((t) => [t, recs.filter((r) => r.type === t).length] as [string, number]).filter(([, n]) => n);
  const filter = `<div class="ac-dns__filter" role="group" aria-label="${esc(t('Show record types'))}" hidden data-dns-filter>
    <button type="button" class="is-on" data-t="" aria-pressed="true">${esc(t('All'))}<span class="num">${recs.length}</span></button>
    ${counts.map(([t, n]) => `<button type="button" data-t="${t}" aria-pressed="false">${t}<span class="num">${n}</span></button>`).join('')}</div>`;
  const addOpen = !!o.add || o.err?.scope === 'add' || recs.filter((r) => !r.readonly).length === 0;
  const addForm = `<details class="ac-dns__add" id="dns-add"${addOpen ? ' open' : ''}><summary><span class="ac-dns__addh">${icon('plus')}<b>${esc(t('Add a record'))}</b></span><small>${esc(t('A, AAAA, CNAME, MX, TXT and SRV'))}</small>${icon('chev')}</summary>
    <div class="ac-dns__addb">${o.err?.scope === 'add' ? alert('err', esc(o.err.msg)) : ''}
    ${formOpen(o, 'add', '', ` data-type="${esc(o.err?.form?.type || 'all')}"`)}<div class="ac-dns__grid">${fields('add', zone, o.err?.scope === 'add' ? o.err.form || {} : {})}</div>
      <div class="ac-dns__btns"><button class="hp-btn hp-btn--brand" type="submit">${icon('plus')}${esc(t('Add record'))}</button><p class="ac-muted">${esc(t('New records are usually visible within minutes.'))}</p></div></form></div></details>`;

  const table = recs.length ? `<div class="ac-dns__tw"><table class="ac-table ac-dns__t"><thead><tr><th scope="col">${esc(t('Type'))}</th><th scope="col">${esc(t('Name'))}</th><th scope="col">${esc(t('Value'))}</th><th scope="col">${esc(t('Priority'))}</th><th scope="col">${esc(t('TTL'))}</th><th scope="col"><span class="sr-only">${esc(t('Actions'))}</span></th></tr></thead>
    <tbody>${recordRows(o, zone, recs)}</tbody></table></div>`
    : `<div class="ac-dns__none">${icon('info')}<span>${esc(t('This zone has no records yet. Add one above or apply a template.'))}</span></div>`;

  return wrap(`<div class="ac-dns__top">${ok}${zerr}${live}
    <div class="ac-dns__bar"><div><b>${esc(tn(recs.length, '{n} record', '{n} records'))}</b><span class="ac-muted">${esc(deleg === 'ours' ? t('Live on {ns}', { ns: st.target.join(', ') }) : t('Zone for {z}', { z: zone }))}</span></div>${filter}</div>
    <h3 class="ac-dns__sub">${esc(t('Quick setup'))}</h3>${templates(o, zone, recs)}${addForm}</div>${table}
    <p class="ac-dns__foot">${icon('lock')}<span>${esc(t('Nameserver (NS) and SOA records are managed by GlobalHostia and cannot be changed here.'))}</span></p>`, true);
}
