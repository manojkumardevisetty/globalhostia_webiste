// Analytics & conversion tracking (Admin → Marketing & SEO → Analytics & conversion tracking).
// Stored as one JSON value in settings under key `tracking`. Only configured trackers are loaded, by /hp/track.js,
// with Google Consent Mode v2 defaults set to "denied" until the visitor accepts the cookie banner.
// Pure module (server + client): IDs are validated against strict patterns, so nothing user-typed reaches a <script> unescaped.

export type Tracking = {
  ga4: string; adsId: string; adsLabel: string; adsEvent: AdsEvent; gtm: string; metaPixel: string; clarity: string; tiktok: string;
};
export const ADS_EVENTS = ['generate_lead', 'begin_checkout', 'add_to_cart'] as const;
export type AdsEvent = (typeof ADS_EVENTS)[number];

export const TRACKING_FIELDS: { key: keyof Tracking; label: string; placeholder: string; re: RegExp; hint: string }[] = [
  { key: 'ga4', label: 'Google Analytics 4 measurement ID', placeholder: 'G-XXXXXXXXXX', re: /^G-[A-Z0-9]{4,16}$/, hint: 'GA4 → Admin → Data streams → your web stream.' },
  { key: 'gtm', label: 'Google Tag Manager container ID', placeholder: 'GTM-XXXXXXX', re: /^GTM-[A-Z0-9]{4,12}$/, hint: 'Optional. If GA4 is also configured inside GTM, leave the GA4 field empty to avoid double counting.' },
  { key: 'adsId', label: 'Google Ads conversion ID', placeholder: 'AW-123456789', re: /^AW-\d{6,14}$/, hint: 'Google Ads → Goals → Conversions → your action → Tag setup → "Install the tag yourself".' },
  { key: 'adsLabel', label: 'Google Ads conversion label', placeholder: 'AbC-D_efG-h12_34-567', re: /^[A-Za-z0-9_-]{4,48}$/, hint: 'The part after the slash in send_to "AW-…/label".' },
  { key: 'metaPixel', label: 'Meta (Facebook) Pixel ID', placeholder: '123456789012345', re: /^\d{8,20}$/, hint: 'Meta Events Manager → Data sources → your pixel.' },
  { key: 'clarity', label: 'Microsoft Clarity project ID', placeholder: 'abcd1234ef', re: /^[a-z0-9]{6,20}$/, hint: 'Clarity → Settings → Overview → Project ID.' },
  { key: 'tiktok', label: 'TikTok Pixel ID', placeholder: 'C1A2B3C4D5E6F7G8H9I0', re: /^[A-Z0-9]{10,32}$/, hint: 'TikTok Ads Manager → Assets → Events → Web events.' },
];

export const DEFAULT_TRACKING: Tracking = { ga4: '', adsId: '', adsLabel: '', adsEvent: 'generate_lead', gtm: '', metaPixel: '', clarity: '', tiktok: '' };

/** Normalised settings; invalid IDs are dropped (never injected). */
export function normTracking(raw: unknown): Tracking {
  let x: any = raw;
  if (typeof x === 'string') { try { x = JSON.parse(x); } catch { x = {}; } }
  x = x && typeof x === 'object' ? x : {};
  const out: Tracking = { ...DEFAULT_TRACKING };
  for (const f of TRACKING_FIELDS) {
    let v = String(x[f.key] ?? '').trim();
    if (f.key === 'ga4' || f.key === 'gtm' || f.key === 'adsId' || f.key === 'tiktok') v = v.toUpperCase();
    if (f.key === 'clarity') v = v.toLowerCase();
    (out as any)[f.key] = f.re.test(v) ? v : '';
  }
  out.adsEvent = (ADS_EVENTS as readonly string[]).includes(x.adsEvent) ? x.adsEvent : 'generate_lead';
  return out;
}

/** Field errors for the admin form (raw input). */
export function trackingErrors(raw: Record<string, string>): string[] {
  const e: string[] = [];
  for (const f of TRACKING_FIELDS) {
    const v = String(raw[f.key] ?? '').trim();
    if (!v) continue;
    const n = normTracking({ [f.key]: v });
    if (!n[f.key]) e.push(`${f.label}: "${v.slice(0, 40)}" does not look right (expected ${f.placeholder})`);
  }
  if (!!raw.adsId?.trim() !== !!raw.adsLabel?.trim()) e.push('Google Ads: fill in both the conversion ID and the label (or neither)');
  return e;
}

export const anyTracker = (t: Tracking) => !!(t.ga4 || t.gtm || t.adsId || t.metaPixel || t.clarity || t.tiktok);

/** Client config for /hp/track.js (only configured IDs). */
export function publicTracking(t: Tracking) {
  const o: Record<string, string> = {};
  if (t.ga4) o.ga4 = t.ga4;
  if (t.gtm) o.gtm = t.gtm;
  if (t.adsId && t.adsLabel) { o.ads = t.adsId; o.adsLabel = t.adsLabel; o.adsEvent = t.adsEvent; }
  if (t.metaPixel) o.meta = t.metaPixel;
  if (t.clarity) o.clarity = t.clarity;
  if (t.tiktok) o.tiktok = t.tiktok;
  return o;
}

/**
 * <head> markup: Consent Mode v2 defaults (denied) + the visitor's earlier choice, before any Google tag loads,
 * and the inline config for /hp/track.js. '' when no tracker is configured.
 */
export function trackingHead(raw: unknown): string {
  const t = normTracking(raw);
  if (!anyTracker(t)) return '';
  const cfg = JSON.stringify(publicTracking(t)).replace(/</g, '\\u003c');
  const google = t.ga4 || t.gtm || t.adsId;
  const consent = google ? `<script>window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){dataLayer.push(arguments)};gtag("consent","default",{ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied",analytics_storage:"denied",functionality_storage:"granted",security_storage:"granted",wait_for_update:500});gtag("set","ads_data_redaction",true);try{if(/(?:^|; )gh_consent=granted(?:;|$)/.test(document.cookie))gtag("consent","update",{ad_storage:"granted",ad_user_data:"granted",ad_personalization:"granted",analytics_storage:"granted"})}catch(e){}</script>` : '';
  return `${consent}<script type="application/json" id="gh-track">${cfg}</script>`;
}

/** Footer "Cookie settings" button (re-opens the consent banner). '' when no tracker is configured. */
export const consentLink = (raw: unknown) => (anyTracker(normTracking(raw)) ? ' · <button type="button" class="gh-consent-open" data-gh-consent-open>Cookie settings</button>' : '');
