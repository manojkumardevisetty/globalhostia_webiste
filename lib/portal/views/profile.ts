// Profile: view and edit contact details. Email and password changes open in the secure client area.
import { card, dl, esc, icon, ssoButton, fieldErr, invalid } from './kit';

let COUNTRIES: [string, string][] | null = null;
export function countries(): [string, string][] {
  if (COUNTRIES) return COUNTRIES;
  const dn = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' } as any);
  const skip = new Set(['EU', 'EZ', 'UN', 'QO', 'ZZ', 'XA', 'XB', 'XK', 'AN', 'CP', 'DG', 'EA', 'IC', 'TA', 'AC', 'CQ']);
  const out: [string, string][] = [];
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
    const c = String.fromCharCode(a, b);
    if (skip.has(c)) continue;
    const n = dn.of(c);
    if (n && n !== c) out.push([c, n]);
  }
  return (COUNTRIES = out.sort((x, y) => x[1].localeCompare(y[1])));
}

export type ProfileForm = Record<'firstname' | 'lastname' | 'companyname' | 'phonenumber' | 'address1' | 'city' | 'state' | 'postcode' | 'country', string>;

export function validateProfile(f: Partial<ProfileForm>) {
  const v: ProfileForm = { firstname: '', lastname: '', companyname: '', phonenumber: '', address1: '', city: '', state: '', postcode: '', country: '' };
  for (const k of Object.keys(v) as (keyof ProfileForm)[]) v[k] = String(f[k] ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
  v.country = v.country.toUpperCase();
  const errs: Record<string, string> = {};
  if (!v.firstname) errs.firstname = 'Enter your first name.';
  if (!v.lastname) errs.lastname = 'Enter your last name.';
  if (v.phonenumber && !/^\+?[\d\s().-]{6,25}$/.test(v.phonenumber)) errs.phonenumber = 'Use digits, spaces and an optional + country code.';
  if (!v.address1) errs.address1 = 'Enter your street address.';
  if (!v.city) errs.city = 'Enter your city.';
  if (v.postcode && !/^[A-Za-z0-9 -]{2,12}$/.test(v.postcode)) errs.postcode = 'Use letters, digits, spaces or hyphens.';
  if (!countries().some(([c]) => c === v.country)) errs.country = 'Choose your country.';
  return { v, errs, ok: !Object.keys(errs).length };
}

export function profileView(o: { csrf: string; c: any; v?: ProfileForm; errs?: Record<string, string> }) {
  const c = o.c, e = o.errs;
  const v: ProfileForm = o.v || { firstname: c.firstname || '', lastname: c.lastname || '', companyname: c.companyname || '', phonenumber: c.phonenumber || '', address1: c.address1 || '', city: c.city || '', state: c.state || '', postcode: c.postcode || '', country: c.countrycode || c.country || '' };
  const f = (k: keyof ProfileForm, label: string, o2: { ac?: string; req?: boolean; type?: string; opt?: boolean } = {}) =>
    `<div class="ac-field"><label for="ac-${k}">${label}${o2.opt ? ' <span class="ac-muted">(optional)</span>' : ''}</label><input class="ac-input" id="ac-${k}" name="${k}" type="${o2.type || 'text'}" value="${esc(v[k])}" maxlength="120"${o2.ac ? ` autocomplete="${o2.ac}"` : ''}${o2.req ? ' required' : ''}${invalid(e, k)}>${fieldErr(e, k)}</div>`;
  const form = `${e && Object.keys(e).length ? `<div class="ac-alert ac-alert--err" role="alert">${icon('alert')}<span>${esc(e.form || 'Check the highlighted fields and try again.')}</span></div>` : ''}
  <form method="post" action="/account/profile" class="ac-form" novalidate data-ac-busy>
    <input type="hidden" name="csrf" value="${esc(o.csrf)}">
    <fieldset><legend>Contact</legend>
      <div class="ac-form__row">${f('firstname', 'First name', { ac: 'given-name', req: true })}${f('lastname', 'Last name', { ac: 'family-name', req: true })}</div>
      <div class="ac-form__row">${f('companyname', 'Company', { ac: 'organization', opt: true })}${f('phonenumber', 'Phone', { ac: 'tel', type: 'tel', opt: true })}</div>
    </fieldset>
    <fieldset><legend>Billing address</legend>
      ${f('address1', 'Street address', { ac: 'address-line1', req: true })}
      <div class="ac-form__row">${f('city', 'City', { ac: 'address-level2', req: true })}${f('state', 'State / emirate', { ac: 'address-level1', opt: true })}</div>
      <div class="ac-form__row">${f('postcode', 'Postcode', { ac: 'postal-code', opt: true })}
        <div class="ac-field"><label for="ac-country">Country</label><select class="ac-input" id="ac-country" name="country" autocomplete="country" required${invalid(e, 'country')}>${countries().map(([code, n]) => `<option value="${code}"${code === v.country ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>${fieldErr(e, 'country')}</div></div>
    </fieldset>
    <div class="ac-form__foot"><button class="hp-btn hp-btn--brand" type="submit">Save changes</button><p class="ac-muted">Your address appears on future invoices.</p></div>
  </form>`;
  const side = card('Sign-in and security', dl([
    ['Email address', `<span class="ac-strong">${esc(c.email || '')}</span>`],
    ['Password', '<span class="ac-muted">Set</span>'],
    ['Two-step verification', c.twofaenabled && c.twofaenabled !== '0' && c.twofaenabled !== false ? `<span class="ac-on">${icon('check')}On</span>` : '<span class="ac-off">Off</span>'],
  ]) + `<div class="ac-card__foot ac-card__foot--stack">${ssoButton(o.csrf, 'email', undefined, 'Change email', { ic: 'mail', block: true })}${ssoButton(o.csrf, 'password', undefined, 'Change password', { ic: 'key', block: true })}${ssoButton(o.csrf, 'security', undefined, 'Two-step verification', { ic: 'shield', block: true })}</div>
  <p class="ac-muted ac-small">These open in your secure client area, where you confirm the change.</p>`, { id: 'ac-sec-h' });
  return `<div class="ac-grid ac-grid--detail"><div class="ac-col">${card('Your details', form, { id: 'ac-pf-h' })}</div><div class="ac-col">${side}</div></div>`;
}
