// Team access (/account/team): people who can sign in to this account, their permissions, invitations.
// Only the account owner can change anything; everyone else sees the list read-only.
import { card, esc, icon, initials, ssoButton, fieldErr, invalid, t } from './kit';
import { tn } from '../i18n';
import { PERM_GROUPS, PRESETS, PRESET_KEYS, presetFor, type Member, type Perm, type Preset } from '../team-perms';

export const permLabel = (p: Perm) => ({
  profile: t('Account profile'), contacts: t('Contacts'), products: t('View services'), manageproducts: t('Manage services'), productsso: t('Control panel sign-in'),
  domains: t('View domains'), managedomains: t('Manage domains'), invoices: t('Invoices and payments'), quotes: t('Quotes'), tickets: t('Support tickets'),
  affiliates: t('Affiliates'), emails: t('Email history'), orders: t('Place orders'),
})[p];
const groupLabel = (k: string) => ({ Services: t('Services'), Domains: t('Domains'), Billing: t('Billing'), Support: t('Support'), Account: t('Account') } as Record<string, string>)[k] || k;
export const presetLabel = (p: Preset) => ({ developer: t('Developer'), billing: t('Billing'), full: t('Full access'), custom: t('Custom') })[p];
const presetHint = (p: Preset) => ({
  developer: t('Services and domains, control panel sign-in and tickets. No billing.'),
  billing: t('Invoices, payments, quotes and billing emails. No technical access.'),
  full: t('Everything the owner can do, except managing team access.'),
  custom: t('Choose exactly what this person can see and do.'),
})[p];

export type TeamForm = { email?: string; preset?: string; perms?: string[] };

function permFields(px: string, cur: Perm[] | null, sel?: string) {
  const preset: Preset = (sel as Preset) || (cur ? presetFor(cur) : 'developer');
  const checked = new Set<string>(cur || PRESETS.developer);
  const radios = [...PRESET_KEYS, 'custom' as const].map((k) => `<label class="ac-tm__pre"><input type="radio" name="preset" value="${k}"${k === preset ? ' checked' : ''} data-tm-preset>
      <span><b>${esc(presetLabel(k))}</b><small>${esc(presetHint(k))}</small></span></label>`).join('');
  const boxes = PERM_GROUPS.map((g) => `<fieldset class="ac-tm__grp"><legend>${esc(groupLabel(g.key))}</legend>${g.perms.map((p) =>
    `<label class="ac-tm__cb"><input type="checkbox" name="perm" value="${p}"${checked.has(p) ? ' checked' : ''}><span>${esc(permLabel(p))}</span></label>`).join('')}</fieldset>`).join('');
  return `<div class="ac-tm__pres" role="radiogroup" aria-label="${esc(t('Access level'))}">${radios}</div>
    <details class="ac-tm__custom" id="${px}-custom"${preset === 'custom' ? ' open' : ''} data-tm-custom><summary>${esc(t('Custom permissions'))}${icon('chev')}</summary><div class="ac-tm__grps">${boxes}</div>
    <p class="ac-help">${esc(t('Ticked boxes apply when "Custom" is selected.'))}</p></details>`;
}

function chips(m: Member) {
  if (m.owner) return `<span class="ac-tm__chip ac-tm__chip--owner">${icon('key')}${esc(t('Owner'))}</span>`;
  if (!m.perms) return `<span class="ac-tm__chip ac-tm__chip--muted">${esc(t('Permissions not available'))}</span>`;
  if (!m.perms.length) return `<span class="ac-tm__chip ac-tm__chip--muted">${esc(t('No access'))}</span>`;
  const pre = presetFor(m.perms);
  return `<span class="ac-tm__chip ac-tm__chip--pre">${esc(presetLabel(pre))}</span>${m.perms.map((p) => `<span class="ac-tm__chip">${esc(permLabel(p))}</span>`).join('')}`;
}

export function teamView(o: {
  csrf: string; members: Member[]; owner: boolean; me: { userId?: number; email: string }; permsReadable: boolean;
  form?: TeamForm; errs?: Record<string, string>; edit?: number; del?: number; failed?: boolean;
}) {
  const e = o.errs || {};
  if (o.failed) {
    return card(t('Team access'), `<div class="ac-error" role="alert"><span class="ac-error__ic">${icon('alert')}</span><div><h3>${esc(t("We couldn't load your team right now"))}</h3><p>${esc(t('You can still manage users in the secure client area.'))}</p></div>${ssoButton(o.csrf, 'users', undefined, t('Open user management'), { sm: true, ic: 'external' })}</div>`, { id: 'ac-tm-h' });
  }
  const isMe = (m: Member) => (o.me.userId ? m.id === o.me.userId : m.email === o.me.email.toLowerCase());
  const rows = o.members.map((m) => {
    const canEdit = o.owner && !m.owner && !isMe(m);
    const editOpen = o.edit === m.id || (e._scope === 'perms' && Number(e._id) === m.id);
    const delOpen = o.del === m.id;
    const edit = canEdit ? `<details class="ac-tm__panel"${editOpen ? ' open' : ''}><summary class="ac-dns__ib">${icon('pen')}<span>${esc(t('Change access'))}</span></summary>
        <form method="post" action="/account/team" class="ac-form ac-tm__form" data-tm-form><input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="op" value="perms"><input type="hidden" name="uid" value="${m.id}">
          ${e._scope === 'perms' && Number(e._id) === m.id && e.perms ? `<div class="ac-alert ac-alert--err" role="alert">${icon('alert')}<span>${esc(e.perms)}</span></div>` : ''}
          ${permFields(`tm-${m.id}`, m.perms)}
          <div class="ac-form__foot"><button class="hp-btn hp-btn--brand ac-sm" type="submit">${esc(t('Save access'))}</button></div></form></details>
      <details class="ac-tm__panel ac-tm__panel--del"${delOpen ? ' open' : ''}><summary class="ac-dns__ib ac-dns__ib--del">${icon('x')}<span>${esc(t('Remove'))}</span></summary>
        <form method="post" action="/account/team" class="ac-tm__form"><input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="op" value="remove"><input type="hidden" name="uid" value="${m.id}"><input type="hidden" name="confirm" value="yes">
          <p>${icon('alert')}<span>${t('Remove <b>{x}</b> from this account? They can no longer sign in to it. Their own login stays, and you can invite them again later.', { x: esc(m.name || m.email) })}</span></p>
          <div class="ac-dns__btns"><button class="hp-btn hp-btn--danger ac-sm" type="submit">${esc(t('Remove access'))}</button></div></form></details>` : '';
    return `<li class="ac-tm__m" id="tm-${m.id}">
      <span class="ac-avatar ac-avatar--sm${m.owner ? '' : ' ac-avatar--staff'}" aria-hidden="true">${esc(initials(m.name, m.email))}</span>
      <div class="ac-tm__who"><b>${esc(m.name || m.email)}${isMe(m) ? ` <small class="ac-muted">(${esc(t('you'))})</small>` : ''}</b><small class="ac-mono">${esc(m.email)}</small><div class="ac-tm__chips">${chips(m)}</div></div>
      <div class="ac-tm__act">${edit}</div></li>`;
  }).join('');
  const members = card(t('People with access'), `${o.members.length ? `<ul class="ac-tm__list">${rows}</ul>` : `<p class="ac-rn__none ac-muted">${esc(t('Only you can sign in to this account.'))}</p>`}
    ${o.owner && !o.permsReadable ? `<p class="ac-tm__note">${icon('info')}<span>${esc(t('Some permissions could not be read here. Open user management to see them.'))}</span></p>` : ''}`,
    { id: 'ac-tm-h', flush: true, action: `<span class="ac-rn__sum"><b class="num">${o.members.length}</b> <small>${esc(tn(o.members.length, 'person', 'people'))}</small></span>` });

  if (!o.owner) {
    return `<div class="ac-grid ac-grid--detail"><div class="ac-col">${members}</div><div class="ac-col">${card(t('Manage team access'), `<p class="ac-ok-line">${icon('lock')}${esc(t('Only the account owner can invite people or change access.'))}</p>`, { id: 'ac-tmo-h' })}</div></div>`;
  }

  const f = o.form || {};
  const invite = card(t('Invite someone'), `${e.form ? `<div class="ac-alert ac-alert--err" role="alert">${icon('alert')}<span>${esc(e.form)}</span></div>` : ''}
    <form method="post" action="/account/team" class="ac-form" novalidate data-tm-form data-ac-busy>
      <input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="op" value="invite">
      <div class="ac-field"><label for="ac-tm-email">${esc(t('Email address'))}</label><input class="ac-input" id="ac-tm-email" name="email" type="email" inputmode="email" autocomplete="off" spellcheck="false" required maxlength="254" value="${esc(f.email || '')}" placeholder="name@company.com"${invalid(e, 'email')}>${fieldErr(e, 'email')}</div>
      <div class="ac-field"><span class="ac-dns__lbl">${esc(t('Access level'))}</span>${permFields('tm-new', f.perms ? (f.perms as Perm[]) : null, f.preset)}${fieldErr(e, 'perms')}</div>
      <div class="ac-form__foot"><button class="hp-btn hp-btn--brand" type="submit">${icon('mail')}${esc(t('Send invitation'))}</button><p class="ac-muted">${esc(t('They get an email to accept. If they have no login yet, they create one.'))}</p></div>
    </form>`, { id: 'ac-tmi-h' });
  const pending = card(t('Pending invitations'), `<p class="ac-muted">${esc(t('Invitations that have not been accepted yet, and resending or cancelling them, are managed in the secure client area.'))}</p>
    <div class="ac-card__foot ac-card__foot--stack">${ssoButton(o.csrf, 'users', undefined, t('Manage invitations'), { ic: 'external', block: true })}</div>`, { id: 'ac-tmp-h' });
  return `<div class="ac-grid ac-grid--detail"><div class="ac-col">${members}${invite}</div><div class="ac-col">${pending}${card(t('How access works'), `<ul class="ac-tips">
      <li>${icon('users')}<span><b>${esc(t('Their own login'))}</b>${esc(t('Each person signs in with their own email and password, never yours.'))}</span></li>
      <li>${icon('shield')}<span><b>${esc(t('Only what you allow'))}</b>${esc(t('Developers see services and domains, not invoices. Billing contacts see invoices, not servers.'))}</span></li>
      <li>${icon('x')}<span><b>${esc(t('Remove at any time'))}</b>${esc(t('Removing access takes effect at their next page load.'))}</span></li></ul>`, { id: 'ac-tmh-h' })}</div></div>`;
}
