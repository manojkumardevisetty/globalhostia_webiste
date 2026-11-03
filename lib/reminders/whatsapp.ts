// WhatsApp Business Cloud API adapter (Meta Graph API): POST /{phone-number-id}/messages with an approved TEMPLATE
// message. Used only for renewal / overdue / domain-expiry reminders, only for customers who opted in, and only once the
// owner has entered the Phone Number ID + access token (env WHATSAPP_PHONE_ID / WHATSAPP_TOKEN, or the sealed setting)
// and a template name per reminder. Abandoned-cart reminders never use WhatsApp.
// Meta charges per delivered template message / conversation: the owner decides whether to switch this on.
// Pure (fetch is injectable) so tests can check the request shape.

export const GRAPH_VERSION = 'v21.0';
export type WaCreds = { phoneId: string; token: string };
export type WaResult = { ok: true; id: string } | { ok: false; error: string; status?: number };

export const PHONE_ID_RE = /^\d{6,25}$/;
export const credsOk = (c: Partial<WaCreds> | null | undefined): c is WaCreds =>
  !!c && typeof c.phoneId === 'string' && PHONE_ID_RE.test(c.phoneId) && typeof c.token === 'string' && c.token.length >= 20 && c.token.length < 2000 && !/\s/.test(c.token);

/** Body parameters may not contain newlines, tabs or more than 4 consecutive spaces (Meta rule), max 1024 chars. */
export const waParam = (s: unknown) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, 1024) || '-';

export function templateRequest(to: string, name: string, lang: string, params: string[]) {
  return {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: to.replace(/^\+/, ''), type: 'template',
    template: { name, language: { code: lang }, components: params.length ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: waParam(p) })) }] : [] },
  };
}

export async function sendTemplate(creds: WaCreds, to: string, name: string, lang: string, params: string[], f: typeof fetch = fetch): Promise<WaResult> {
  if (!credsOk(creds)) return { ok: false, error: 'not-configured' };
  if (!/^\+[1-9]\d{7,14}$/.test(to)) return { ok: false, error: 'bad-number' };
  try {
    const res = await f(`https://graph.facebook.com/${GRAPH_VERSION}/${creds.phoneId}/messages`, {
      method: 'POST', headers: { authorization: `Bearer ${creds.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(templateRequest(to, name, lang, params)), signal: AbortSignal.timeout(15000),
    });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: String(j?.error?.message || `HTTP ${res.status}`).slice(0, 300) };
    const id = String(j?.messages?.[0]?.id || '');
    return id ? { ok: true, id } : { ok: false, error: 'no message id' };
  } catch (e: any) { return { ok: false, error: String(e?.message || e).slice(0, 200) }; }
}
