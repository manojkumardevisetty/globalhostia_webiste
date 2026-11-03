'use server';
// Admin → AI connectors: settings (kill switch, redirect policy, ChatGPT commerce, OpenAI domain token, reviewer mode,
// public page copy) and revocation (one grant, one app, everything).
import { requireSession, audit } from '@/lib/session';
import { bool, done, fail, lines, str } from '@/lib/admin';
import { connectorConfig, saveConnectorConfig } from '@/lib/connector/config';
import { revokeAll, revokeGrant, setClientDisabled } from '@/lib/oauth/store';
import { setSetting } from '@/lib/settings';
import { normalizeAiPromo, AI_PROMO_KEY } from '@/lib/connector/promo';

const P = '/admin/connectors';

export async function saveConnector(fd: FormData) {
  const s = await requireSession('settings');
  const cur = await connectorConfig(true);
  const ids = str(fd, 'reviewer_ids').split(/[\s,]+/).filter(Boolean);
  if (ids.some((x) => !/^\d{1,9}$/.test(x))) fail(P, 'Reviewer client ids must be WHMCS client numbers, separated by commas.');
  const sandbox = str(fd, 'sandbox_domain').toLowerCase();
  if (sandbox && !/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(sandbox)) fail(P, 'The sandbox domain must be a domain name such as demo-brand.com.');
  if (ids.length && !sandbox) fail(P, 'Set the sandbox domain for reviewer accounts (their changes are limited to it).');
  const challenge = str(fd, 'openai_challenge');
  if (challenge && !/^[A-Za-z0-9._~+/=-]{1,256}$/.test(challenge)) fail(P, 'Paste only the verification token from the OpenAI platform (no spaces or quotes).');
  const faq = lines(str(fd, 'faq')).map((l) => { const i = l.indexOf('|'); return i > 0 ? { q: l.slice(0, i).trim(), a: l.slice(i + 1).trim() } : null; }).filter(Boolean) as { q: string; a: string }[];
  const next = {
    ...cur,
    enabled: bool(fd, 'enabled'), blockUnknownRedirects: bool(fd, 'block_unknown'), chatgptCommerce: bool(fd, 'chatgpt_commerce'), openaiChallenge: challenge,
    reviewer: { clientIds: ids.map(Number), sandboxDomain: sandbox },
    pages: { headline: str(fd, 'headline'), intro: str(fd, 'intro'), examples: lines(str(fd, 'examples')), faq, supportEmail: str(fd, 'support_email') },
  };
  await saveConnectorConfig(next);
  await audit(s, 'update', 'settings', 'connector', { enabled: next.enabled, blockUnknownRedirects: next.blockUnknownRedirects, chatgptCommerce: next.chatgptCommerce, reviewer: next.reviewer, challengeSet: !!challenge });
  done(P, next.enabled ? 'Connector settings saved' : 'Saved. Connectors are switched OFF: no new sign-ins and account tools refuse.');
}

export async function revokeOne(fd: FormData) {
  const s = await requireSession('settings');
  const id = str(fd, 'id');
  if (!/^[a-z0-9]{10,40}$/.test(id)) fail(P, 'Unknown connection');
  const ok = await revokeGrant(id, `admin:${s.email}`);
  await audit(s, 'revoke', 'oauth_grant', id);
  done(P, ok ? 'Connection revoked' : 'That connection was already revoked');
}

export async function toggleClient(fd: FormData) {
  const s = await requireSession('settings');
  const id = str(fd, 'id'), disable = str(fd, 'disable') === '1';
  if (!id || id.length > 512) fail(P, 'Unknown app');
  await setClientDisabled(id, disable);
  await audit(s, disable ? 'disable' : 'enable', 'oauth_client', id.slice(0, 200));
  done(P, disable ? 'App blocked and its connections revoked' : 'App unblocked');
}

export async function revokeEverything(fd: FormData) {
  const s = await requireSession('settings');
  if (str(fd, 'confirm') !== 'REVOKE') fail(P, 'Type REVOKE to confirm.');
  const n = await revokeAll(`admin:${s.email}`);
  await audit(s, 'revoke_all', 'oauth_grant', null, { count: n });
  done(P, `${n} connection(s) revoked. Customers must connect again.`);
}

/** Website promotion (settings.ai_promo): nav link and menu item, footer link, homepage section and "New" pill. */
export async function savePromo(fd: FormData) {
  const s = await requireSession('settings');
  const next = normalizeAiPromo({
    nav: { enabled: bool(fd, 'p_nav'), label: str(fd, 'p_label'), badge: str(fd, 'p_badge'), menu: str(fd, 'p_menu') },
    footer: bool(fd, 'p_footer'),
    home: { position: str(fd, 'p_position'), eyebrow: str(fd, 'p_eyebrow'), title: str(fd, 'p_title'), lead: str(fd, 'p_lead'), prompts: lines(str(fd, 'p_prompts')), trust: lines(str(fd, 'p_trust')) },
    pill: { enabled: bool(fd, 'p_pill'), text: str(fd, 'p_pill_text') },
  });
  await setSetting(AI_PROMO_KEY, next);
  await audit(s, 'update', 'settings', AI_PROMO_KEY, { nav: next.nav.enabled, footer: next.footer, home: next.home.position, pill: next.pill.enabled });
  done(`${P}#promo`, 'Website promotion saved. The site shows the change now.');
}
