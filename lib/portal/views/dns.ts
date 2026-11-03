// DNS records section of /account/domains/<id> (anchor #dns). Server-rendered; public/hp/pages/account.js adds
// in-place edit/delete toggles, per-type fields and the type filter. Every action is a CSRF-protected POST to
// /account/domains/<id>/dns, so the page works without JavaScript too (?edit= / ?del= / ?add= open the same panels).
import type { DnsRecord } from '../../hosting/types';
import { TEMPLATES, dnsHostName, type ZonePlan } from '../../hosting/dns-plan';
import type { DnsState } from '../dns';
import { card, esc, hexIcon, icon } from './kit';

export const DNS_OK: Record<string, string> = {
  dns_added: 'Record added. Most resolvers see the change within the record’s TTL.',
  dns_updated: 'Record updated.',
  dns_deleted: 'Record deleted.',
  dns_template: 'Template applied. Your records are updated below.',
  dns_on: 'DNS management is on. Your zone was created with our standard records.',
  dns_ns: 'Nameservers switched to GlobalHostia DNS. The change can take a few hours to reach every network.',
};

export interface DnsForm { type?: string; name?: string; value?: string; ttl?: string; priority?: string; weight?: string; port?: string }
export interface DnsView {
  csrf: string; d: any; st?: DnsState; ok?: string;
  /** record id whose edit / delete panel is open (no-JS links), or 'add' */
  edit?: string; del?: string; add?: boolean; tpl?: string;
  err?: { msg: string; scope: 'add' | 'edit' | 'tpl' | 'zone'; id?: string; form?: DnsForm };
}

const TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV'] as const;
const ORDER = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS'];
const TTLS: [number, string][] = [[300, '5 minutes'], [1800, '30 minutes'], [3600, '1 hour'], [14400, '4 hours'], [86400, '1 day']];
const HINT: Record<string, [string, string]> = {
  A: ['203.0.113.10', 'IPv4 address of your server.'],
  AAAA: ['2001:db8::10', 'IPv6 address of your server.'],
  CNAME: ['target.example.com', 'Host name this name is an alias of. Not allowed on @.'],
  MX: ['mail.example.com', 'Mail server host name. Lower priority is tried first.'],
  TXT: ['v=spf1 include:_spf.example.com ~all', 'Text value, without surrounding quotes.'],
  SRV: ['sip.example.com', 'Target host. Name must look like _service._tcp.'],
};

const rid = (r: DnsRecord) => r.id.replace(/[^A-Za-z0-9_-]/g, '').slice(-16) || 'x';
const ttlLabel = (n: number) => TTLS.find(([v]) => v === n)?.[1] || (n % 86400 === 0 ? `${n / 86400} d` : n % 3600 === 0 ? `${n / 3600} h` : n % 60 === 0 ? `${n / 60} min` : `${n} s`);
const typePill = (t: string) => `<span class="ac-rt ac-rt--${esc(t.toLowerCase())}">${esc(t)}</span>`;
const nameCell = (n: string, zone: string) => n === '@'
  ? `<span class="ac-dns__n"><b>@</b><small>${esc(zone)}</small></span>`
  : `<span class="ac-dns__n"><b>${esc(n)}</b><small>.${esc(zone)}</small></span>`;
const hidden = (k: string, v: string) => `<input type="hidden" name="${k}" value="${esc(v)}">`;
const alert = (tone: 'ok' | 'err' | 'warn' | 'info', text: string, ic = tone === 'ok' ? 'check' : tone === 'info' ? 'info' : 'alert') =>
  `<div class="ac-alert ac-alert--${tone}" role="${tone === 'ok' || tone === 'info' ? 'status' : 'alert'}">${icon(ic)}<span>${text}</span></div>`;

function ttlSelect(id: string, val?: string | number) {
  const v = Number(val) || 3600;
  const opts = TTLS.some(([n]) => n === v) ? TTLS : [...TTLS, [v, ttlLabel(v)] as [number, string]];
  return `<select class="ac-input" id="${id}" name="ttl">${opts.map(([n, l]) => `<option value="${n}"${n === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
}

/** Fields shared by the add and edit forms. `fixedType` = edit (type cannot change). */
function fields(px: string, zone: string, f: DnsForm, fixedType?: string) {
  const t = fixedType || f.type || 'A';
  const [ph, help] = HINT[t] || HINT.A;
  const typeField = fixedType
    ? `<div class="ac-field ac-dns__ft"><span class="ac-dns__lbl">Type</span>${typePill(fixedType)}${hidden('type', fixedType)}</div>`
    : `<div class="ac-field ac-dns__ft"><label for="${px}-type">Type</label><select class="ac-input" id="${px}-type" name="type" data-dns-type>${TYPES.map((x) => `<option${x === t ? ' selected' : ''}>${x}</option>`).join('')}</select></div>`;
  return `${typeField}
    <div class="ac-field ac-dns__fn"><label for="${px}-name">Name</label>
      <div class="ac-dns__suffix"><input class="ac-input ac-mono" id="${px}-name" name="name" value="${esc(f.name ?? '')}" placeholder="@" autocomplete="off" spellcheck="false" autocapitalize="none"><span aria-hidden="true">.${esc(zone)}</span></div>
      <small class="ac-help">Use @ for ${esc(zone)} itself, or a name like www.</small></div>
    <div class="ac-field ac-dns__fv"><label for="${px}-value">Value</label>
      <input class="ac-input ac-mono" id="${px}-value" name="value" value="${esc(f.value ?? '')}" placeholder="${esc(ph)}" required autocomplete="off" spellcheck="false" autocapitalize="none" data-dns-value>
      <small class="ac-help" data-dns-help>${esc(help)}</small></div>
    <div class="ac-field ac-dns__fp" data-for="MX SRV"><label for="${px}-prio">Priority</label><input class="ac-input" id="${px}-prio" name="priority" inputmode="numeric" value="${esc(f.priority ?? (t === 'SRV' ? '0' : '10'))}"></div>
    <div class="ac-field ac-dns__fp" data-for="SRV"><label for="${px}-weight">Weight</label><input class="ac-input" id="${px}-weight" name="weight" inputmode="numeric" value="${esc(f.weight ?? '0')}"></div>
    <div class="ac-field ac-dns__fp" data-for="SRV"><label for="${px}-port">Port</label><input class="ac-input" id="${px}-port" name="port" inputmode="numeric" value="${esc(f.port ?? '')}" placeholder="443"></div>
    <div class="ac-field ac-dns__fttl"><label for="${px}-ttl">TTL</label>${ttlSelect(`${px}-ttl`, f.ttl)}</div>`;
}

const formOpen = (o: DnsView, op: string, extra = '', attrs = '') =>
  `<form method="post" action="/account/domains/${esc(o.d.id)}/dns" class="ac-dns-form" novalidate${attrs}>${hidden('csrf', o.csrf)}${hidden('op', op)}${extra}`;

function recordRows(o: DnsView, zone: string, recs: DnsRecord[]) {
  return recs.map((r) => {
    const k = rid(r);
    const editOpen = o.edit === r.id || (o.err?.scope === 'edit' && o.err.id === r.id);
    const delOpen = o.del === r.id;
    const val = r.type === 'SRV' ? `${r.weight ?? 0} ${r.port ?? ''} ${r.value}` : r.value;
    const act = r.readonly
      ? `<span class="ac-dns__lock" title="Managed by GlobalHostia">${icon('lock')}<span>Protected</span></span>`
      : `<a class="ac-dns__ib" href="?edit=${esc(encodeURIComponent(r.id))}#rec-${k}" data-dns-open="ed-${k}" aria-controls="ed-${k}" aria-expanded="${editOpen}">${icon('pen')}<span>Edit</span></a>
         <a class="ac-dns__ib ac-dns__ib--del" href="?del=${esc(encodeURIComponent(r.id))}#rec-${k}" data-dns-open="del-${k}" aria-controls="del-${k}" aria-expanded="${delOpen}">${icon('x')}<span>Delete</span></a>`;
    const f: DnsForm = o.err?.scope === 'edit' && o.err.id === r.id && o.err.form ? o.err.form
      : { name: r.name, value: r.value, ttl: String(r.ttl), priority: r.priority !== undefined ? String(r.priority) : undefined, weight: r.weight !== undefined ? String(r.weight) : undefined, port: r.port !== undefined ? String(r.port) : undefined };
    const edit = r.readonly ? '' : `<tr class="ac-dns__panel" id="ed-${k}" data-type="${esc(r.type)}"${editOpen ? '' : ' hidden'}><td colspan="6">
      ${o.err?.scope === 'edit' && o.err.id === r.id ? alert('err', esc(o.err.msg)) : ''}
      ${formOpen(o, 'edit', hidden('id', r.id), ` data-type="${esc(r.type)}"`)}<div class="ac-dns__grid">${fields(`ed-${k}`, zone, f, r.type)}</div>
        <div class="ac-dns__btns"><button class="hp-btn hp-btn--brand ac-sm" type="submit">Save changes</button><a class="hp-btn hp-btn--ghost ac-sm" href="#rec-${k}" data-dns-close="ed-${k}">Cancel</a></div></form></td></tr>`;
    const del = r.readonly ? '' : `<tr class="ac-dns__panel ac-dns__panel--del" id="del-${k}"${delOpen ? '' : ' hidden'}><td colspan="6">
      ${formOpen(o, 'delete', hidden('id', r.id) + hidden('confirm', 'yes'))}<p>${icon('alert')}<span>Delete the <b>${esc(r.type)}</b> record for <b class="ac-mono">${esc(r.name === '@' ? zone : `${r.name}.${zone}`)}</b>? Services using it stop resolving once caches expire.</span></p>
        <div class="ac-dns__btns"><button class="hp-btn hp-btn--danger ac-sm" type="submit">Delete record</button><a class="hp-btn hp-btn--ghost ac-sm" href="#rec-${k}" data-dns-close="del-${k}">Keep it</a></div></form></td></tr>`;
    return `<tr class="ac-dns__rec${r.readonly ? ' is-ro' : ''}" id="rec-${k}" data-rt="${esc(r.type)}">
      <td data-l="Type">${typePill(r.type)}</td>
      <th scope="row" data-l="Name">${nameCell(r.name, zone)}</th>
      <td data-l="Value" class="ac-dns__v"><span class="ac-mono" title="${esc(val)}">${esc(val)}</span>${r.type === 'TXT' && val.length > 40 ? `<button type="button" class="ac-copy" data-copy="${esc(val)}" aria-label="Copy value">${icon('copy')}<span>Copy</span></button>` : ''}</td>
      <td data-l="Priority" class="num">${r.priority !== undefined && (r.type === 'MX' || r.type === 'SRV') ? esc(r.priority) : '<span class="ac-muted">—</span>'}</td>
      <td data-l="TTL" class="num">${esc(ttlLabel(r.ttl))}</td>
      <td class="ac-dns__act">${act}</td></tr>${edit}${del}`;
  }).join('');
}

function templates(o: DnsView, zone: string, recs: DnsRecord[]) {
  const mx = recs.filter((r) => r.type === 'MX' && r.name === '@').length;
  const note: Record<string, string> = {
    google: mx ? `Replaces ${mx} existing MX record${mx === 1 ? '' : 's'} on ${zone} and its SPF record.` : `Adds MX smtp.google.com and an SPF record.`,
    microsoft: `MX ${zone.replace(/\./g, '-')}.mail.protection.outlook.com${mx ? `, replacing ${mx} MX record${mx === 1 ? '' : 's'}` : ''}. Check the exact value in your Microsoft 365 admin center.`,
    ip: `Sets A records for ${zone} and www.${zone}, replacing the current ones.`,
    verify: 'Adds a TXT record. Existing records are kept.',
  };
  return `<div class="ac-dns__tpl" role="list">${TEMPLATES.map((t) => {
    const open = o.tpl === t.key || (o.err?.scope === 'tpl' && o.err.id === t.key);
    const input = t.input === 'ip'
      ? `<div class="ac-field"><label for="tpl-ip">Server IP address</label><input class="ac-input ac-mono" id="tpl-ip" name="ip" required placeholder="203.0.113.10" inputmode="decimal" autocomplete="off" value="${esc(o.err?.scope === 'tpl' && o.err.id === 'ip' ? o.err.form?.value || '' : '')}"></div>`
      : t.input === 'txt'
        ? `<div class="ac-field"><label for="tpl-txt">Verification value</label><input class="ac-input ac-mono" id="tpl-txt" name="txt" required placeholder="google-site-verification=…" autocomplete="off" spellcheck="false" value="${esc(o.err?.scope === 'tpl' && o.err.id === 'verify' ? o.err.form?.value || '' : '')}"></div>
           <div class="ac-field"><label for="tpl-txtn">Name <span class="ac-muted">(optional)</span></label><div class="ac-dns__suffix"><input class="ac-input ac-mono" id="tpl-txtn" name="name" placeholder="@" autocomplete="off" spellcheck="false" autocapitalize="none" value="${esc(o.err?.scope === 'tpl' && o.err.id === 'verify' ? o.err.form?.name || '' : '')}"><span aria-hidden="true">.${esc(zone)}</span></div></div>`
        : '';
    return `<details class="ac-tpl" role="listitem"${open ? ' open' : ''}><summary>${hexIcon(t.ic)}<span><b>${esc(t.label)}</b><small>${esc(t.desc)}</small></span>${icon('chev')}</summary>
      <div class="ac-tpl__body">${o.err?.scope === 'tpl' && o.err.id === t.key ? alert('err', esc(o.err.msg)) : ''}
      ${formOpen(o, 'template', hidden('template', t.key))}${input}<p class="ac-help">${esc(note[t.key])}</p>
      <button class="hp-btn hp-btn--dark ac-sm" type="submit">Apply ${esc(t.label)}</button></form></div></details>`;
  }).join('')}</div>`;
}

function nsSwitch(o: DnsView, label: string, cls = 'hp-btn--brand') {
  const target = o.st?.target || [];
  return `<details class="ac-dns__sw"><summary class="hp-btn ${cls} ac-sm">${icon('refresh')}${esc(label)}</summary>
    <div class="ac-dns__swb">${formOpen(o, 'use_ns')}
      <p>We point <b>${esc(o.d.domainname)}</b> to ${target.map((n) => `<span class="ac-mono ac-chip">${esc(n)}</span>`).join(' ')}. Records kept by your current DNS host (for example email MX) are not copied, so check you have what you need below first.</p>
      <div class="ac-dns__btns"><button class="hp-btn hp-btn--brand ac-sm" type="submit">Switch nameservers</button></div></form></div></details>`;
}

function zoneHead(plan: ZonePlan, o: DnsView) {
  if (plan.kind === 'hosting') return `<span class="ac-dns__src">${icon('server')}<span>On your hosting plan</span><a href="/account/services/${esc(plan.serviceId)}">View</a></span>`;
  if (plan.kind === 'dnsonly') return `<span class="ac-dns__src">${icon('globe')}<span>GlobalHostia DNS</span></span>`;
  return '';
}

export function dnsSection(o: DnsView): string {
  const st = o.st;
  const zone = String(o.d.domainname || '').toLowerCase();
  if (!st) return '';
  const plan = st.plan;
  const ok = o.ok && DNS_OK[o.ok] ? alert('ok', esc(DNS_OK[o.ok])) : '';
  const zerr = o.err?.scope === 'zone' ? alert('err', esc(o.err.msg)) : '';
  const wrap = (body: string, flush = false) => `<div id="dns" class="ac-dns">${card('DNS records', body, { id: 'ac-dns-h', flush, action: zoneHead(plan, o), cls: 'ac-dns__card' })}</div>`;

  if (plan.kind === 'inactive') return wrap(`<p class="ac-muted">DNS records can be managed once the domain is active.</p>`);
  if (plan.kind === 'error') return wrap(`${zerr}<div class="ac-dns__state">${hexIcon('alert')}<div><h3>DNS settings are unavailable right now</h3><p>${esc(plan.message)} Your domain keeps working.</p></div><a class="hp-btn hp-btn--ghost ac-sm" href="?#dns">${icon('refresh')}Try again</a></div>`);
  if (plan.kind === 'taken') return wrap(`<div class="ac-dns__state">${hexIcon('lock')}<div><h3>DNS for this domain is linked to another account</h3><p>This can happen after a domain moves between accounts. Our team can move it to you.</p></div><a class="hp-btn hp-btn--dark ac-sm" href="/account/support/new">Contact support</a></div>`);

  if (plan.kind === 'external') {
    const who = dnsHostName(plan.ns);
    return wrap(`${ok}${zerr}<div class="ac-dns__ext">
      <div class="ac-dns__exth">${hexIcon('globe')}<div><h3>Your DNS is managed by ${esc(who)}</h3><p>Records for ${esc(zone)} are edited there. These are the nameservers it uses today:</p></div></div>
      <ul class="ac-dns__nsl">${plan.ns.map((n) => `<li class="ac-mono">${esc(n)}</li>`).join('')}</ul>
      <div class="ac-dns__extf">${plan.canSwitch
        ? `<p>Prefer to manage DNS here? We create your zone with standard records first, then switch the nameservers in one step.</p>${nsSwitch(o, 'Use GlobalHostia DNS')}`
        : `<p>To manage DNS here, our team needs to prepare your zone first.</p><a class="hp-btn hp-btn--dark ac-sm" href="/account/support/new">Ask support</a>`}</div></div>`);
  }

  if (plan.kind === 'off') {
    const warn = plan.deleg === 'mixed' ? alert('warn', 'Some of this domain’s nameservers are not ours. Set only GlobalHostia nameservers above so every visitor gets the same records.')
      : plan.deleg === 'unknown' ? alert('info', 'We could not read this domain’s nameservers from the registry just now.') : '';
    return wrap(`${ok}${zerr}${warn}<div class="ac-dns__on">${hexIcon('database')}<div><h3>Turn on DNS management</h3>
      <p>${esc(zone)} uses GlobalHostia nameservers but has no DNS zone yet, so it does not resolve. Turning it on creates the zone with our standard records (website, www and mail), then you can edit every record here.</p></div>
      ${plan.canCreate ? `${formOpen(o, 'enable')}<button class="hp-btn hp-btn--brand" type="submit">${icon('bolt')}Turn on DNS management</button></form>`
        : `<a class="hp-btn hp-btn--dark ac-sm" href="/account/support/new">Ask support to turn it on</a>`}</div>`);
  }

  // hosting / dnsonly: the editor
  const recs = [...(st.records || [])].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || (a.name === '@' ? -1 : b.name === '@' ? 1 : a.name.localeCompare(b.name)));
  const deleg = plan.deleg;
  const live = deleg === 'external' || deleg === 'mixed'
    ? `<div class="ac-dns__warn">${icon('alert')}<div><b>These records are not live yet.</b><span>${esc(zone)} uses ${deleg === 'mixed' ? 'some ' : ''}nameservers at another provider, so the internet still reads its DNS there.</span></div>${nsSwitch(o, 'Use GlobalHostia DNS', 'hp-btn--dark')}</div>` : '';
  if (st.listError) return wrap(`${ok}${zerr}${live}<div class="ac-dns__state">${hexIcon('alert')}<div><h3>We could not read your DNS records</h3><p>${esc(st.listError)}</p></div><a class="hp-btn hp-btn--ghost ac-sm" href="?#dns">${icon('refresh')}Try again</a></div>`);

  const counts = ORDER.map((t) => [t, recs.filter((r) => r.type === t).length] as [string, number]).filter(([, n]) => n);
  const filter = `<div class="ac-dns__filter" role="group" aria-label="Show record types" hidden data-dns-filter>
    <button type="button" class="is-on" data-t="" aria-pressed="true">All<span class="num">${recs.length}</span></button>
    ${counts.map(([t, n]) => `<button type="button" data-t="${t}" aria-pressed="false">${t}<span class="num">${n}</span></button>`).join('')}</div>`;
  const addOpen = !!o.add || o.err?.scope === 'add' || recs.filter((r) => !r.readonly).length === 0;
  const addForm = `<details class="ac-dns__add" id="dns-add"${addOpen ? ' open' : ''}><summary><span class="ac-dns__addh">${icon('plus')}<b>Add a record</b></span><small>A, AAAA, CNAME, MX, TXT and SRV</small>${icon('chev')}</summary>
    <div class="ac-dns__addb">${o.err?.scope === 'add' ? alert('err', esc(o.err.msg)) : ''}
    ${formOpen(o, 'add', '', ` data-type="${esc(o.err?.form?.type || 'all')}"`)}<div class="ac-dns__grid">${fields('add', zone, o.err?.scope === 'add' ? o.err.form || {} : {})}</div>
      <div class="ac-dns__btns"><button class="hp-btn hp-btn--brand" type="submit">${icon('plus')}Add record</button><p class="ac-muted">New records are usually visible within minutes.</p></div></form></div></details>`;

  const table = recs.length ? `<div class="ac-dns__tw"><table class="ac-table ac-dns__t"><thead><tr><th scope="col">Type</th><th scope="col">Name</th><th scope="col">Value</th><th scope="col">Priority</th><th scope="col">TTL</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>${recordRows(o, zone, recs)}</tbody></table></div>`
    : `<div class="ac-dns__none">${icon('info')}<span>This zone has no records yet. Add one above or apply a template.</span></div>`;

  return wrap(`<div class="ac-dns__top">${ok}${zerr}${live}
    <div class="ac-dns__bar"><div><b>${recs.length} record${recs.length === 1 ? '' : 's'}</b><span class="ac-muted">${deleg === 'ours' ? `Live on ${esc(st.target.join(', '))}` : `Zone for ${esc(zone)}`}</span></div>${filter}</div>
    <h3 class="ac-dns__sub">Quick setup</h3>${templates(o, zone, recs)}${addForm}</div>${table}
    <p class="ac-dns__foot">${icon('lock')}<span>Nameserver (NS) and SOA records are managed by GlobalHostia and cannot be changed here.</span></p>`, true);
}
