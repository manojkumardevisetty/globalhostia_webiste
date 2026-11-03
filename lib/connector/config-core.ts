// AI connector settings (settings.connector, edited in Admin → AI connectors). Pure: defaults + normalisation, tested.

export type FaqItem = { q: string; a: string };
export interface ConnectorConfig {
  /** Kill switch. Off: no new sign-ins, no token refresh, account tools refuse (public tools keep working). */
  enabled: boolean;
  /** Refuse clients whose redirect URIs are not Claude, ChatGPT or loopback (instead of allowing them with a warning). */
  blockUnknownRedirects: boolean;
  /** Plan search, cart and renewal links on /mcp/chatgpt. Off by default: ChatGPT's app rules do not allow digital-goods commerce. */
  chatgptCommerce: boolean;
  /** Domain-verification token from the OpenAI platform, served as plain text at /.well-known/openai-apps-challenge. */
  openaiChallenge: string;
  /** Reviewer mode: these WHMCS client ids may only change things on the sandbox domain. */
  reviewer: { clientIds: number[]; sandboxDomain: string };
  /** Public /connectors and /docs/mcp copy. */
  pages: { headline: string; intro: string; examples: string[]; faq: FaqItem[]; supportEmail: string };
}

export const DEFAULT_EXAMPLES = [
  'Add an MX record for mybrand.com pointing to mail.mybrand.com with priority 10',
  'Which of my domains expire in the next 60 days, and is auto-renew on?',
  'Why is email from my domain going to spam? Check the health of mybrand.com',
  'Show my unpaid invoices',
  'Create the mailbox sales@mybrand.com',
  'Open a ticket: my website shows a 500 error since this morning',
];

export const DEFAULT_FAQ: FaqItem[] = [
  { q: 'Can the assistant buy or pay for anything?', a: 'No. It can prepare a renewal or order link, but you always review and pay on globalhostia.com yourself. It cannot see card details, change your password or delete your account.' },
  { q: 'Will it change things without asking?', a: 'Claude and ChatGPT ask you before every change. Deleting DNS records or mailboxes and changing nameservers also need an explicit confirmation, and every change is recorded in your account activity.' },
  { q: 'Does GlobalHostia see my conversations?', a: 'No. We only receive the individual requests the assistant makes, such as "list DNS records for mybrand.com". We never store or train on your conversations.' },
  { q: 'How do I disconnect?', a: 'In your account, open App & notifications, then Connected apps, and choose Disconnect. You can also remove the connector in Claude or ChatGPT. Disconnecting revokes access immediately.' },
  { q: 'My account uses two-factor authentication. Can I connect?', a: 'Sign-in for connectors uses your GlobalHostia account password. Accounts with two-factor authentication enabled cannot sign in on the connector consent page yet; contact support and we will help you.' },
];

export const DEFAULT_CONNECTOR: ConnectorConfig = {
  enabled: true, blockUnknownRedirects: false, chatgptCommerce: false, openaiChallenge: '',
  reviewer: { clientIds: [], sandboxDomain: '' },
  pages: {
    headline: 'Manage your hosting from Claude and ChatGPT',
    intro: 'Connect your GlobalHostia account to your AI assistant and manage services, domains, DNS, email, SSL, invoices and support in plain language. You approve exactly what it can do, and you can disconnect at any time.',
    examples: DEFAULT_EXAMPLES, faq: DEFAULT_FAQ, supportEmail: 'support@globalhostia.com',
  },
};

const s = (v: unknown, max: number, d = '') => (typeof v === 'string' ? v.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim().slice(0, max) : d);
const DOMAIN = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;

export function normalizeConnector(raw: unknown): ConnectorConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const d = DEFAULT_CONNECTOR;
  const rv = r.reviewer && typeof r.reviewer === 'object' ? r.reviewer : {};
  const pg = r.pages && typeof r.pages === 'object' ? r.pages : {};
  const sandbox = s(rv.sandboxDomain, 253).toLowerCase().replace(/\.$/, '');
  const examples = Array.isArray(pg.examples) ? pg.examples.map((x: unknown) => s(x, 200)).filter(Boolean).slice(0, 12) : d.pages.examples;
  const faq = Array.isArray(pg.faq) ? pg.faq.map((x: any) => ({ q: s(x?.q, 200), a: s(x?.a, 1000) })).filter((x: FaqItem) => x.q && x.a).slice(0, 12) : d.pages.faq;
  return {
    enabled: r.enabled !== false,
    blockUnknownRedirects: r.blockUnknownRedirects === true,
    chatgptCommerce: r.chatgptCommerce === true,
    openaiChallenge: /^[A-Za-z0-9._~+/=-]{1,256}$/.test(s(r.openaiChallenge, 256)) ? s(r.openaiChallenge, 256) : '',
    reviewer: {
      clientIds: (Array.isArray(rv.clientIds) ? rv.clientIds : []).map(Number).filter((n: number) => Number.isSafeInteger(n) && n > 0).slice(0, 20),
      sandboxDomain: DOMAIN.test(sandbox) ? sandbox : '',
    },
    pages: {
      headline: s(pg.headline, 120) || d.pages.headline, intro: s(pg.intro, 600) || d.pages.intro,
      examples: examples.length ? examples : d.pages.examples, faq: faq.length ? faq : d.pages.faq,
      supportEmail: /^[^\s@<>"]{1,64}@[^\s@<>"]{1,200}$/.test(s(pg.supportEmail, 254)) ? s(pg.supportEmail, 254) : d.pages.supportEmail,
    },
  };
}
