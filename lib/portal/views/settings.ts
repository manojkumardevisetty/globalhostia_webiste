// App & notifications (/account/settings): install the portal as an app, web push notifications (this device + the
// categories for every device), and language / digits. account.js drives the install prompt and the push subscription;
// the category, language and test forms are plain CSRF POSTs.
import { card, esc, icon, ssoButton, t } from './kit';
import { tn, type Digits, type Lang } from '../i18n';
import { PUSH_CATEGORIES, type PushCategory } from '../push-crypto';

const catLabel = (c: PushCategory) => ({ tickets: t('Support ticket replies'), invoices: t('New and overdue invoices'), domains: t('Domains expiring within 7 days'), services: t('Service suspended') })[c];
const catHint = (c: PushCategory) => ({
  tickets: t('When our team answers one of your tickets.'), invoices: t('When an invoice is issued, and when one becomes overdue.'),
  domains: t('A reminder a week before a domain expires.'), services: t('If a service is suspended, so you can restore it quickly.'),
})[c];

export function settingsView(o: { csrf: string; publicKey: string | null; devices: number; cats: PushCategory[]; lang: Lang; digits: Digits; available: boolean }) {
  const install = card(t('Install the app'), `<div class="ac-st__app">
      <span class="ac-st__ico" aria-hidden="true"><img src="/icon-192.png" width="56" height="56" alt=""></span>
      <div><b>GlobalHostia</b><p class="ac-muted">${esc(t('Open your account from the home screen or dock, full screen, with notifications. Nothing to download from an app store.'))}</p></div>
    </div>
    <div class="ac-card__foot">
      <button type="button" class="hp-btn hp-btn--brand" data-ac-install hidden>${icon('download')}${esc(t('Install app'))}</button>
      <button type="button" class="hp-btn hp-btn--dark" data-ac-ios hidden>${icon('download')}${esc(t('How to install on iPhone or iPad'))}</button>
      <span class="ac-st__ok" data-ac-installed hidden>${icon('check')}${esc(t('Installed on this device'))}</span>
      <span class="ac-muted" data-ac-noinstall>${esc(t('In Chrome or Edge, use the install icon in the address bar. On iPhone or iPad, use Share → Add to Home Screen in Safari.'))}</span>
    </div>`, { id: 'ac-st-app-h' });

  const cats = PUSH_CATEGORIES.map((c) => `<label class="ac-st__cat"><input type="checkbox" name="cat" value="${c}"${o.cats.includes(c) ? ' checked' : ''}${o.devices ? '' : ' disabled'}><span><b>${esc(catLabel(c))}</b><small>${esc(catHint(c))}</small></span></label>`).join('');
  const push = card(t('Notifications'), !o.available
    ? `<p class="ac-ok-line">${icon('info')}${esc(t('Notifications are not available yet. Please check back soon.'))}</p>`
    : `<div class="ac-st__push" data-ac-push data-key="${esc(o.publicKey || '')}">
      <div class="ac-st__state"><span class="ac-st__dot" data-ac-push-dot aria-hidden="true"></span><div><b data-ac-push-state>${esc(t('Checking this device…'))}</b><small class="ac-muted">${esc(o.devices ? tn(o.devices, 'Notifications are on for {n} device on your account.', 'Notifications are on for {n} devices on your account.') : t('No device receives notifications yet.'))}</small></div>
        <button type="button" class="hp-btn hp-btn--brand ac-sm" data-ac-push-toggle hidden>${icon('bell')}<span>${esc(t('Turn notifications on'))}</span></button></div>
      <p class="ac-alert ac-alert--warn" data-ac-push-msg role="status" hidden></p>
    </div>
    <form method="post" action="/account/settings" class="ac-form ac-st__cats">
      <input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="op" value="push_prefs">
      <fieldset><legend>${esc(t('Notify me about'))}</legend>${cats}</fieldset>
      <div class="ac-form__foot"><button class="hp-btn hp-btn--dark ac-sm" type="submit"${o.devices ? '' : ' disabled'}>${esc(t('Save choices'))}</button>
      ${o.devices ? `<button class="hp-btn hp-btn--ghost ac-sm" type="submit" name="op" value="push_test" formnovalidate>${icon('bell')}${esc(t('Send a test notification'))}</button>` : `<p class="ac-muted">${esc(t('Turn notifications on for this device first.'))}</p>`}</div>
    </form>`, { id: 'ac-st-push-h' });

  const radio = (name: string, v: string, label: string, cur: string, langAttr?: string) =>
    `<label class="ac-st__opt"><input type="radio" name="${name}" value="${v}"${v === cur ? ' checked' : ''}><span${langAttr ? ` lang="${langAttr}"` : ''}>${esc(label)}</span></label>`;
  const lang = card(t('Language and numbers'), `<form method="post" action="/account/lang" class="ac-form">
      <input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="next" value="/account/settings">
      <fieldset><legend>${esc(t('Language'))}</legend><div class="ac-st__opts">${radio('lang', 'en', 'English', o.lang, 'en')}${radio('lang', 'ar', 'العربية', o.lang, 'ar')}</div></fieldset>
      <fieldset><legend>${esc(t('Digits in Arabic'))}</legend><div class="ac-st__opts">${radio('digits', 'latn', t('Latin digits (0123)'), o.digits)}${radio('digits', 'arab', t('Arabic-Indic digits (٠١٢٣)'), o.digits)}</div>
        <p class="ac-help">${esc(t('Amounts keep their currency code. Your choice is also saved to your billing profile, so emails and invoices use the same language.'))}</p></fieldset>
      <div class="ac-form__foot"><button class="hp-btn hp-btn--dark ac-sm" type="submit">${esc(t('Save'))}</button></div>
    </form>`, { id: 'ac-st-lang-h' });

  const help = card(t('Good to know'), `<ul class="ac-tips">
      <li>${icon('lock')}<span><b>${esc(t('Private by design'))}</b>${esc(t('Notifications show a short summary, such as an invoice number or a domain name. Full details open after you sign in.'))}</span></li>
      <li>${icon('bell')}<span><b>${esc(t('Per device'))}</b>${esc(t('Turn notifications on in each browser or phone where you want them.'))}</span></li>
      <li>${icon('settings')}<span><b>${esc(t('Email stays on'))}</b>${esc(t('You still get the usual emails for invoices and tickets.'))}</span></li></ul>
    <div class="ac-card__foot ac-card__foot--stack">${ssoButton(o.csrf, 'email', undefined, t('Email preferences'), { ic: 'mail', block: true })}</div>`, { id: 'ac-st-help-h' });

  const apps = card(t('Connected apps'), `<p class="ac-muted">${esc(t('Manage your account from Claude or ChatGPT. See which AI assistants are connected and disconnect them at any time.'))}</p>
    <div class="ac-card__foot ac-card__foot--stack"><a class="hp-btn hp-btn--dark ac-sm" href="/account/apps">${icon('plug')}${esc(t('Manage connected apps'))}</a><a class="hp-btn hp-btn--ghost ac-sm" href="/connectors">${esc(t('Set up a connector'))}</a></div>`, { id: 'ac-st-apps-h' });

  return `<div class="ac-grid ac-grid--detail ac-st"><div class="ac-col">${push}${install}</div><div class="ac-col">${lang}${apps}${help}</div></div>`;
}
