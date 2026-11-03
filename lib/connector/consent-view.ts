// Consent page body (/oauth/authorize) and the error card shown when the request cannot be sent back to the app.
// Rendered inside the account portal frame, so it carries the site's header, footer and language.
import { esc, icon, t } from '../portal/views/kit';
import { SCOPES, PLATFORM_LABEL } from '../oauth/core';

export const CONSENT_CSS = `<style>
.oc{max-width:760px}.oc .ac-card{margin-bottom:18px}
.oc__app{display:flex;gap:16px;align-items:center}.oc__logo{width:56px;height:56px;border-radius:14px;display:grid;place-items:center;background:#16212b;color:#fff;font-weight:800;font-size:1.3rem;flex:none}
.oc__app b{font-size:1.15rem}.oc__host{font-family:ui-monospace,Menlo,monospace;font-size:.95em;background:#f2f4f7;border-radius:6px;padding:1px 6px}
.oc__warn{border-left:4px solid #d97706;background:#fff8eb;padding:12px 14px;border-radius:8px;margin:14px 0 0}
.oc__list{list-style:none;margin:0;padding:0}.oc__list li{border-top:1px solid #eef0f3;padding:12px 0}.oc__list li:first-child{border-top:0}
.oc__list label{display:flex;gap:12px;align-items:flex-start;cursor:pointer}.oc__list input{margin-top:4px;width:18px;height:18px;flex:none;accent-color:#a6225f}
.oc__list small{display:block;color:#5b6573;margin-top:2px}.oc__h{font-size:.8rem;letter-spacing:.06em;text-transform:uppercase;color:#5b6573;margin:4px 0 6px}
.oc__never li{display:flex;gap:8px;align-items:flex-start;margin:6px 0}.oc__never svg{flex:none;margin-top:3px}
.oc__acts{display:flex;gap:12px;flex-wrap:wrap;margin-top:6px}.oc__acts .hp-btn{min-width:160px;justify-content:center}
.oc__who{display:flex;gap:10px;align-items:center;flex-wrap:wrap;color:#3b4552}
@media (max-width:560px){.oc__acts .hp-btn{flex:1 1 100%}}
</style>`;

export type ConsentModel = {
  appName: string; appHost: string; platform: keyof typeof PLATFORM_LABEL; returnHost: string; loopbackOnly: boolean; flagged: boolean;
  scopes: string[]; viewer: { name: string; email: string; clientId: number }; csrf: string; r: string; endpoint: string;
};

export function consentBody(m: ConsentModel) {
  const reads = m.scopes.filter((s) => !SCOPES[s].write), writes = m.scopes.filter((s) => SCOPES[s].write);
  const row = (s: string) => `<li><label><input type="checkbox" name="scope" value="${esc(s)}" checked><span><b>${esc(t(SCOPES[s].label))}</b><small>${esc(t(SCOPES[s].detail))}</small></span></label></li>`;
  const known = m.platform === 'claude' || m.platform === 'chatgpt';
  const warn = m.loopbackOnly
    ? `<p class="oc__warn" role="note">${esc(t('This app runs on your own computer (it returns to {h}). Only continue if you started this connection yourself, for example from Claude Code or MCP Inspector.', { h: m.returnHost }))}</p>`
    : m.flagged || !known
      ? `<p class="oc__warn" role="note">${esc(t('This app is not Claude or ChatGPT. Only continue if you trust it and started this connection yourself.'))}</p>` : '';
  const initial = (m.appName.trim()[0] || '?').toUpperCase();
  return `${CONSENT_CSS}<div class="oc">
  <section class="ac-card" aria-labelledby="oc-app-h"><div class="ac-card__body">
    <div class="oc__app"><span class="oc__logo" aria-hidden="true">${esc(initial)}</span>
      <div><h2 id="oc-app-h" class="ac-card__title" style="margin:0"><b>${esc(m.appName)}</b> ${esc(t('wants to access your GlobalHostia account'))}</h2>
      <p class="ac-muted" style="margin:.3em 0 0">${esc(t(PLATFORM_LABEL[m.platform]))}${m.appHost ? ` · ${esc(t('app identity'))} <span class="oc__host">${esc(m.appHost)}</span>` : ''} · ${esc(t('returns to'))} <span class="oc__host">${esc(m.returnHost)}</span></p></div></div>
    ${warn}
    <p class="oc__who" style="margin-top:14px">${icon('user')}<span>${esc(t('Signed in as {n} ({e})', { n: m.viewer.name || m.viewer.email, e: m.viewer.email }))}</span></p>
  </div></section>
  <form method="post" action="/oauth/authorize" class="ac-form">
    <input type="hidden" name="csrf" value="${esc(m.csrf)}"><input type="hidden" name="r" value="${esc(m.r)}">
    <section class="ac-card" aria-labelledby="oc-scope-h"><div class="ac-card__body">
      <h2 id="oc-scope-h" class="ac-card__title">${esc(t('Choose what it can do'))}</h2>
      <p class="ac-muted">${esc(t('Untick anything you do not want to allow. You can disconnect at any time under App & notifications, Connected apps.'))}</p>
      ${reads.length ? `<p class="oc__h">${esc(t('See'))}</p><ul class="oc__list">${reads.map(row).join('')}</ul>` : ''}
      ${writes.length ? `<p class="oc__h">${esc(t('Change (the assistant asks you before each change)'))}</p><ul class="oc__list">${writes.map(row).join('')}</ul>` : ''}
    </div></section>
    <section class="ac-card" aria-labelledby="oc-never-h"><div class="ac-card__body">
      <h2 id="oc-never-h" class="ac-card__title">${esc(t('It can never'))}</h2>
      <ul class="oc__never">${[t('Pay, place orders or renew anything: payments always happen on globalhostia.com, by you'), t('See card details, service passwords or your account password'), t('Change your password or delete your account'), t('Reach any other customer’s data')].map((x) => `<li>${icon('shield')}<span>${esc(x)}</span></li>`).join('')}</ul>
      <p class="ac-muted">${esc(t('Every change is recorded in your account activity. Data handling is described in our privacy policy.'))} <a href="/privacy-policy">${esc(t('Privacy policy'))}</a></p>
      <div class="oc__acts">
        <button class="hp-btn hp-btn--brand hp-btn--lg" type="submit" name="decision" value="allow">${icon('check')}${esc(t('Allow access'))}</button>
        <button class="hp-btn hp-btn--ghost hp-btn--lg" type="submit" name="decision" value="deny" formnovalidate>${esc(t('Cancel'))}</button>
      </div>
    </div></section>
  </form></div>`;
}

export function consentError(title: string, detail: string) {
  return `${CONSENT_CSS}<div class="oc"><section class="ac-card" role="alert"><div class="ac-card__body">
    <h2 class="ac-card__title">${esc(title)}</h2><p>${esc(detail)}</p>
    <p class="ac-muted">${esc(t('Go back to your assistant and start the connection again. If it keeps failing, contact our support team.'))}</p>
    <div class="oc__acts"><a class="hp-btn hp-btn--dark" href="/connectors">${esc(t('How connecting works'))}</a><a class="hp-btn hp-btn--ghost" href="/account">${esc(t('My account'))}</a></div>
  </div></section></div>`;
}
