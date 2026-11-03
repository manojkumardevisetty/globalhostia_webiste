// Support: ticket list, new ticket form, ticket thread with reply. Messages render as escaped plain text.
import { hexIcon, card, empty, esc, fmtDate, fmtDateTime, icon, initials, pill, plainText, btn, fieldErr, invalid, t } from './kit';

export function ticketsView(o: { tickets: any[]; filter: string }) {
  const seg = `<nav class="hp-seg ac-seg" aria-label="${esc(t('Filter tickets'))}">${[['open', t('Open')], ['all', t('All')]].map(([k, l]) =>
    `<a href="/account/support${k === 'all' ? '?status=all' : ''}"${k === o.filter ? ' aria-current="true" class="is-on"' : ''}>${esc(l)}</a>`).join('')}</nav>`;
  const body = o.tickets.length ? `<ul class="ac-tlist">${o.tickets.map((tk) => `<li>
      ${hexIcon('chat')}
      <div class="ac-tlist__m"><a class="ac-strong" href="/account/support/${esc(tk.id)}">${esc(tk.subject || t('Ticket'))}</a>
        <small>#${esc(tk.tid)}${tk.deptname ? ` · ${esc(tk.deptname)}` : ''} · ${esc(t('opened {d}', { d: fmtDate(tk.date) }))}</small></div>
      <div class="ac-tlist__s">${pill(tk.status)}<small>${esc(t('Last update {d}', { d: fmtDate(tk.lastreply || tk.date) }))}</small></div>
    </li>`).join('')}</ul>`
    : empty(o.filter === 'all' ? t('No tickets yet') : t('No open tickets'), t('Questions about a service, a bill or anything technical? Our engineers reply around the clock.'), btn(t('Open a ticket'), '/account/support/new', { variant: 'brand', ic: 'plus' }), 'headset');
  return `${seg}${card(t('Tickets'), body, { id: 'ac-tk-h', flush: true })}`;
}

export type TicketForm = { deptid?: string; subject?: string; message?: string; priority?: string; service?: string };

export function newTicketView(o: { csrf: string; depts: { id: number; name: string }[]; services: any[]; v: TicketForm; errs?: Record<string, string> }) {
  const v = o.v, e = o.errs;
  return `<div class="ac-grid ac-grid--detail"><div class="ac-col">${card(t('Tell us what you need'), `
    ${e?.form ? `<div class="ac-alert ac-alert--err" role="alert">${icon('alert')}<span>${esc(e.form)}</span></div>` : ''}
    <form method="post" action="/account/support/new" class="ac-form" novalidate data-ac-busy>
      <input type="hidden" name="csrf" value="${esc(o.csrf)}">
      <div class="ac-form__row">
        <div class="ac-field"><label for="ac-dept">${esc(t('Department'))}</label>
          <select class="ac-input" id="ac-dept" name="deptid" required${invalid(e, 'deptid')}>${o.depts.length > 1 ? `<option value="">${esc(t('Choose a department'))}</option>` : ''}${o.depts.map((d) => `<option value="${d.id}"${String(d.id) === v.deptid ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select>${fieldErr(e, 'deptid')}</div>
        <div class="ac-field"><label for="ac-pri">${esc(t('Priority'))}</label>
          <select class="ac-input" id="ac-pri" name="priority">${['Low', 'Medium', 'High'].map((p) => `<option value="${p}"${(v.priority || 'Medium') === p ? ' selected' : ''}>${esc(t(p))}</option>`).join('')}</select></div>
      </div>
      ${o.services.length ? `<div class="ac-field"><label for="ac-svc">${esc(t('Related service'))} <span class="ac-muted">${esc(t('(optional)'))}</span></label>
        <select class="ac-input" id="ac-svc" name="service"><option value="">${esc(t('None'))}</option>${o.services.map((s) => `<option value="${esc(s.id)}"${String(s.id) === v.service ? ' selected' : ''}>${esc(s.name)}${s.domain ? ` — ${esc(s.domain)}` : ''}</option>`).join('')}</select></div>` : ''}
      <div class="ac-field"><label for="ac-sub">${esc(t('Subject'))}</label>
        <input class="ac-input" id="ac-sub" name="subject" maxlength="150" required value="${esc(v.subject || '')}"${invalid(e, 'subject')}>${fieldErr(e, 'subject')}</div>
      <div class="ac-field"><label for="ac-msg">${esc(t('Message'))}</label>
        <textarea class="ac-input ac-textarea" id="ac-msg" name="message" rows="9" maxlength="20000" required${invalid(e, 'message')}>${esc(v.message || '')}</textarea>${fieldErr(e, 'message')}
        <p class="ac-help">${esc(t('Include the domain or IP address, what you expected and what happened. Never share passwords in a ticket.'))}</p></div>
      <div class="ac-form__foot"><button class="hp-btn hp-btn--brand" type="submit">${icon('chat')}${esc(t('Open ticket'))}</button><a class="hp-btn hp-btn--ghost" href="/account/support">${esc(t('Cancel'))}</a></div>
    </form>`, { id: 'ac-nt-h' })}</div>
    <div class="ac-col">${card(t('Faster answers'), `<ul class="ac-tips">
      <li>${icon('server')}<span><b>${esc(t('Server not responding?'))}</b>${esc(t('Choose the related service so our engineers can check it straight away.'))}</span></li>
      <li>${icon('card')}<span><b>${esc(t('Billing questions'))}</b>${esc(t('Pick the billing department and include the invoice number.'))}</span></li>
      <li>${icon('clock')}<span><b>${esc(t('Urgent outage'))}</b>${esc(t('Set priority to High. We monitor tickets around the clock.'))}</span></li>
    </ul>`, { id: 'ac-tips-h' })}</div></div>`;
}

export function ticketView(o: { csrf: string; t: any; viewerName: string; reply?: string; errs?: Record<string, string> }) {
  const tk = o.t;
  const closed = /closed/i.test(tk.status);
  const msgs = tk.replies.map((r: any) => {
    const staff = !!(r.admin && String(r.admin).trim());
    const who = staff ? String(r.admin) : String(r.name || r.requestor_name || o.viewerName || t('You'));
    return `<li class="ac-msg${staff ? ' ac-msg--staff' : ''}">
      <span class="ac-avatar ac-avatar--sm${staff ? ' ac-avatar--staff' : ''}" aria-hidden="true">${staff ? icon('headset') : esc(initials(who))}</span>
      <div class="ac-msg__b"><header><b>${esc(who)}</b>${staff ? `<span class="ac-msg__tag">${esc(t('Globalhostia support'))}</span>` : ''}<time datetime="${esc(String(r.date || '').replace(' ', 'T'))}">${esc(fmtDateTime(r.date))}</time></header>
      <div class="ac-msg__t">${plainText(r.message)}</div></div></li>`;
  }).join('');
  const form = closed
    ? `<div class="ac-alert ac-alert--info">${icon('info')}<span>${esc(t('This ticket is closed. Replying here reopens it.'))}</span></div>`
    : '';
  return `<div class="ac-grid ac-grid--detail"><div class="ac-col">
    <ol class="ac-thread" aria-label="${esc(t('Conversation'))}">${msgs || `<li class="ac-muted">${esc(t('No messages.'))}</li>`}</ol>
    ${card(closed ? t('Reopen with a reply') : t('Reply'), `${form}${o.errs?.form ? `<div class="ac-alert ac-alert--err" role="alert">${icon('alert')}<span>${esc(o.errs.form)}</span></div>` : ''}
      <form method="post" action="/account/support/${esc(tk.ticketid ?? tk.id)}" class="ac-form" novalidate data-ac-busy>
        <input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="action" value="reply">
        <div class="ac-field"><label for="ac-reply" class="sr-only">${esc(t('Your reply'))}</label>
          <textarea class="ac-input ac-textarea" id="ac-reply" name="message" rows="6" maxlength="20000" required placeholder="${esc(t('Write your reply'))}"${invalid(o.errs, 'message')}>${esc(o.reply || '')}</textarea>${fieldErr(o.errs, 'message')}</div>
        <div class="ac-form__foot"><button class="hp-btn hp-btn--brand" type="submit">${icon('chat')}${esc(t('Send reply'))}</button></div>
      </form>`, { id: 'ac-rp-h' })}
  </div><div class="ac-col">${card(t('Ticket details'), `<dl class="ac-dl"><div><dt>${esc(t('Ticket'))}</dt><dd class="num">#${esc(tk.tid)}</dd></div><div><dt>${esc(t('Status'))}</dt><dd>${pill(tk.status)}</dd></div>${tk.deptname ? `<div><dt>${esc(t('Department'))}</dt><dd>${esc(tk.deptname)}</dd></div>` : ''}<div><dt>${esc(t('Priority'))}</dt><dd>${esc(t(tk.priority || '—'))}</dd></div><div><dt>${esc(t('Opened'))}</dt><dd class="num">${esc(fmtDateTime(tk.date))}</dd></div><div><dt>${esc(t('Last update'))}</dt><dd class="num">${esc(fmtDateTime(tk.lastreply || tk.date))}</dd></div></dl>`, { id: 'ac-td-h' })}</div></div>`;
}
