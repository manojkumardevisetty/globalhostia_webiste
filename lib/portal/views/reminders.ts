// Reminder choices in the portal (/account/settings, card "Email and WhatsApp reminders") and the unsubscribe page
// (/account/unsubscribe, opened from the link in every reminder email; works signed out).
import { card, esc, icon, okMark, errMark, t } from './kit';
import { split } from './guest';

export type ReminderPrefsView = { csrf: string; cartEmail: boolean; renewalEmail: boolean; whatsapp: boolean; whatsappAt: string | null; phone: string | null; waOffered: boolean; saved?: boolean;
  /** domain health alert emails (lib/health); undefined = row not shown */
  health?: boolean;
  /** monthly site report email (lib/cx); undefined = row not shown */
  report?: boolean };

export function remindersCard(o: ReminderPrefsView) {
  const box = (name: string, on: boolean, title: string, hint: string, disabled = false) =>
    `<label class="ac-st__cat"><input type="checkbox" name="${name}" value="1"${on ? ' checked' : ''}${disabled ? ' disabled' : ''}><span><b>${esc(title)}</b><small>${esc(hint)}</small></span></label>`;
  const wa = !o.waOffered ? '' : o.phone
    ? '<input type="hidden" name="wa_shown" value="1">' + box('whatsapp', o.whatsapp, t('Renewal and payment reminders on WhatsApp'), t('Sent to {p}. Optional: you can turn this off at any time.', { p: o.phone }))
    : `${box('whatsapp', false, t('Renewal and payment reminders on WhatsApp'), t('Add a mobile number to your profile first.'), true)}<p class="ac-help"><a href="/account/profile">${esc(t('Add a mobile number'))}</a></p>`;
  return card(t('Email and WhatsApp reminders'), `<form method="post" action="/account/settings" class="ac-form ac-st__cats" id="reminders">
      <input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="op" value="reminder_prefs">
      ${o.saved ? `<p class="ac-alert ac-alert--ok" role="status">${okMark()}<span>${esc(t('Your reminder choices are saved.'))}</span></p>` : ''}
      <fieldset><legend>${esc(t('Remind me about'))}</legend>
        ${box('cart', o.cartEmail, t('Unfinished orders (email)'), t('Up to two emails if you leave items in your cart.'))}
        ${box('renewal', o.renewalEmail, t('Renewals, unpaid invoices and expiring domains (email)'), t('A summary before services and domains renew, and a nudge if an invoice is overdue.'))}
        ${o.health === undefined ? '' : `<input type="hidden" name="health_shown" value="1">${box('health', o.health, t('Website and domain health alerts (email)'), t('When an SSL certificate expires, your site goes down or DNS or email settings break. Only new or worse problems.'))}`}
        ${o.report === undefined ? '' : `<input type="hidden" name="report_shown" value="1">${box('report', o.report, t('Monthly site report (email)'), t('On the 1st of each month: checks, SSL, email settings, backups, usage and upcoming renewals for your sites.'))}`}
        ${wa}
      </fieldset>
      <p class="ac-help">${esc(t('We never send reminders between 10 pm and 8 am, and never more than a few a week. Invoices, receipts and ticket replies are always emailed.'))}</p>
      <div class="ac-form__foot"><button class="hp-btn hp-btn--dark ac-sm" type="submit">${icon('check')}${esc(t('Save choices'))}</button></div>
    </form>`, { id: 'ac-st-rem-h' });
}

export type UnsubState = { state: 'confirm' | 'done' | 'invalid' | 'error'; token?: string; scope?: 'cart' | 'renewal' | 'health' | 'report' | 'rating' | 'all'; email?: string };

/** a***@example.com: enough to recognise the address, not enough to read it off a shared screen. */
export const maskEmail = (e: string) => { const [u, d] = String(e).split('@'); return d ? `${u.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(6, u.length - 1)))}@${d}` : ''; };

export function unsubscribeView(s: UnsubState) {
  const what = s.scope === 'cart' ? t('unfinished-order reminders') : s.scope === 'renewal' ? t('renewal and payment reminders') : s.scope === 'health' ? t('website and domain health alerts')
    : s.scope === 'report' ? t('the monthly site report') : s.scope === 'rating' ? t('requests to rate closed tickets') : t('all reminder emails');
  let body = '';
  if (s.state === 'invalid' || s.state === 'error') {
    body = `<h1 class="au-h1" id="au-h1">${esc(t('This link does not work'))}</h1>
      <div class="ac-gap"><div class="ac-alert ac-alert--err" role="alert">${errMark()}<span>${esc(s.state === 'error' ? t('Something went wrong. Please try again in a moment.') : t('The unsubscribe link is incomplete or was changed. Sign in to choose which reminders you get.'))}</span></div></div>
      <a class="hp-btn hp-btn--brand hp-btn--block hp-btn--lg" href="/account/settings#reminders">${esc(t('Choose reminders in my account'))}</a>`;
  } else if (s.state === 'done') {
    body = `<h1 class="au-h1" id="au-h1">${esc(t('You are unsubscribed'))}</h1>
      <div class="ac-gap"><div class="ac-alert ac-alert--ok ac-alert--fx" role="status">${okMark()}<span>${t('We will not send <b>{w}</b> to <b>{e}</b> any more.', { w: esc(what), e: esc(maskEmail(s.email || '')) })}</span></div></div>
      <p class="au-sub">${esc(t('Invoices, receipts and replies to your support tickets are still emailed, because they are part of your account.'))}</p>
      <a class="hp-btn hp-btn--dark hp-btn--block hp-btn--lg" href="/account/settings#reminders">${esc(t('Change my choices'))}</a>`;
  } else {
    const radio = (v: string, label: string) => `<label class="ac-st__opt"><input type="radio" name="scope" value="${v}"${v === s.scope ? ' checked' : ''}><span>${esc(label)}</span></label>`;
    body = `<h1 class="au-h1" id="au-h1">${esc(t('Unsubscribe from reminders'))}</h1>
      <p class="au-sub">${t('For <b>{e}</b>.', { e: esc(maskEmail(s.email || '')) })}</p>
      <form class="au-form" method="post" action="/account/unsubscribe" data-ac-busy>
        <input type="hidden" name="t" value="${esc(s.token || '')}">
        <fieldset><legend class="au-label">${esc(t('Stop sending me'))}</legend>
          <div class="ac-st__opts ac-st__opts--col">${radio('cart', t('Unfinished-order reminders'))}${radio('renewal', t('Renewal and payment reminders'))}${radio('health', t('Website and domain health alerts'))}${radio('report', t('Monthly site report'))}${radio('rating', t('Requests to rate closed tickets'))}${radio('all', t('All reminder emails'))}</div></fieldset>
        <button class="hp-btn hp-btn--brand hp-btn--block hp-btn--lg" type="submit">${icon('check')}${esc(t('Unsubscribe'))}</button>
      </form>
      <div class="au-links"><a href="/account/settings#reminders">${esc(t('Manage all choices in my account'))}</a></div>`;
  }
  return split({
    path: '/account/unsubscribe', crumb: t('Email preferences'), statement: t('Only the emails you want.'), lead: t('Reminders help you keep your websites online. You decide which ones you get.'),
    items: [['mail', t('One click'), t('Unsubscribing takes effect right away.')], ['shield', t('Account emails stay'), t('Invoices and ticket replies are still sent.')], ['settings', t('Change any time'), t('Turn reminders back on in your account settings.')]],
    card: body,
  });
}
