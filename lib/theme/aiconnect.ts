// AI connector promotion pieces for the theme (copy and switches: settings.ai_promo, Admin → AI connectors → Website
// promotion). Styles: public/hp/theme.css ("AI connector promotion" block, nav/drawer/pill) and public/hp/pages/aic.css
// (homepage section and chat visual, also loaded by /connectors). Product names are plain text: no third-party logos.
import { esc } from '../render/util';
import { icon } from './ui';
import type { MenuItem } from './menu';
import { normalizeAiPromo, CONNECTORS_PATH, DOCS_PATH, type AiPromo, type PromoItem } from '../connector/promo';
export { withAiMenu } from '../connector/promo';

export const aiPromo = (settings: Record<string, any>): AiPromo => normalizeAiPromo(settings?.ai_promo);

const MARK = (size = 20) => `<img class="aic-mark" src="/icon-192.png" alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`;
const badge = (t: string) => (t ? `<em class="aic-new">${esc(t)}</em>` : '');
/** Desktop top-level link after the mega-menu buttons. */
export const navLink = (p: AiPromo, path = '') => !p.nav.enabled ? '' :
  `<a class="hp-nav__btn hp-nav__ai" href="${CONNECTORS_PATH}"${path === CONNECTORS_PATH ? ' aria-current="page"' : ''}>${icon('spark')}<span>${esc(p.nav.label)}</span>${badge(p.nav.badge)}</a>`;

/** Highlighted row at the top of the phone / tablet menu. */
export const drawerRow = (p: AiPromo) => !p.nav.enabled ? '' :
  `<a class="hp-dai" href="${CONNECTORS_PATH}">${MARK(32)}<span><b>${esc(p.nav.label)}${badge(p.nav.badge)}</b><small>Manage your hosting from Claude and ChatGPT</small></span>${icon('right')}</a>`;

/** Top-bar pill (desktop and tablet). */
export const utilPill = (p: AiPromo) => !p.pill.enabled ? '' :
  `<a class="hp-aipill" href="${CONNECTORS_PATH}">${icon('spark')}<span>${esc(p.pill.text)}</span>${icon('arrow')}</a>`;

/** Homepage phones: the same pill under the domain search. */
export const mobilePill = (p: AiPromo) => !p.pill.enabled ? '' :
  `<div class="aic-mpill-wrap"><a class="aic-mpill" href="${CONNECTORS_PATH}">${MARK(22)}<span>${esc(p.pill.text)}</span>${icon('arrow')}</a></div>`;

/** Mega-menu / drawer label suffix for a PromoItem. */
export const itemBadge = (i: MenuItem) => badge((i as PromoItem).badge || '');

/** The chat visual: a conversation with a GlobalHostia tool result, drawn in HTML and CSS. */
export function chatDemo(o: { tone?: 'light' | 'dark' } = {}) {
  return `<figure class="aic-chat${o.tone === 'dark' ? ' aic-chat--on-dark' : ''}" aria-label="Example conversation: an AI assistant adds a DNS record through the GlobalHostia connector">
  <div class="aic-chat__bar" aria-hidden="true"><span class="aic-dots"><i></i><i></i><i></i></span><span class="aic-chat__app">Claude <span>or</span> ChatGPT</span><span class="aic-chat__conn">${MARK(16)}GlobalHostia</span></div>
  <div class="aic-chat__body">
    <p class="aic-msg aic-msg--you"><span class="sr-only">You: </span>Add an MX record for mybrand.com pointing to mail.mybrand.com, priority 10</p>
    <div class="aic-msg aic-msg--ai"><span class="sr-only">Assistant: </span>
      <p>I'll add this record to the DNS zone of mybrand.com.</p>
      <div class="aic-tool">
        <div class="aic-tool__h">${MARK(18)}<b>GlobalHostia</b><code>add_dns_record</code><span class="aic-ok">${icon('check')}Added</span></div>
        <dl class="aic-rec"><div><dt>Type</dt><dd>MX</dd></div><div><dt>Host</dt><dd>mybrand.com</dd></div><div><dt>Points to</dt><dd>mail.mybrand.com</dd></div><div><dt>Priority</dt><dd>10</dd></div></dl>
        <p class="aic-tool__f">${icon('lock')}Allowed by you: Manage DNS</p>
      </div>
      <p>Done. The record is live; most networks see it within the hour. Want me to check SPF and DKIM too?</p>
    </div>
  </div>
  <div class="aic-chat__in" aria-hidden="true"><span>Ask about your domains, email or invoices…</span><i>${icon('arrow')}</i></div>
</figure>`;
}

/** Homepage section (its place in the page: AiPromo.home.position). */
export function homeSection(p: AiPromo) {
  const h = p.home;
  return `<section class="hp-section aic-home" id="ai-connectors" aria-labelledby="aic-h"><div class="hp-container aic-grid">
  <div class="aic-copy" data-reveal>
    <span class="aic-eyebrow">${icon('spark')}${esc(h.eyebrow)}${badge(p.nav.badge)}</span>
    <h2 id="aic-h" class="hp-h2">${esc(h.title)}</h2>
    <p class="hp-lead">${esc(h.lead)}</p>
    <ul class="aic-prompts" aria-label="Things you can ask">${h.prompts.map((t) => `<li>${icon('chat')}${esc(t)}</li>`).join('')}</ul>
    <ul class="aic-trust">${h.trust.map((t) => `<li>${icon('check')}${esc(t)}</li>`).join('')}</ul>
    <div class="hp-actions">
      <a class="hp-btn hp-btn--brand" href="${CONNECTORS_PATH}#claude">Connect in Claude</a>
      <a class="hp-btn hp-btn--ghost" href="${CONNECTORS_PATH}#chatgpt">Connect in ChatGPT</a>
      <a class="hp-link" href="${DOCS_PATH}">How it works${icon('arrow')}</a>
    </div>
  </div>
  <div class="aic-visual" data-reveal style="--i:1">${chatDemo()}</div>
</div></section>`;
}
