// Email setup helper: the IMAP / POP3 / SMTP settings for a mailbox and an Apple configuration profile
// (.mobileconfig, unsigned, no password: iOS / macOS ask for it while installing). Pure, unit-tested in
// tests/health.test.mts. Ports are the DirectAdmin (Dovecot + Exim) defaults.
import { createHash } from 'node:crypto';

export interface MailSettings {
  domain: string; email?: string; username: string;
  incoming: { imap: { host: string; port: number; security: 'SSL/TLS' }; pop3: { host: string; port: number; security: 'SSL/TLS' } };
  outgoing: { host: string; port: number; security: 'SSL/TLS'; alt: { port: number; security: 'STARTTLS' } };
  /** Server host name with a certificate that is always valid; use it if a mail app warns about mail.<domain>. */
  altHost?: string;
  webmail: string;
}

const isIp = (h: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':');

/** `serverHost` is the panel host name (from the server's API URL), used for webmail and as the fallback mail host. */
export function mailSettings(domain: string, serverHost: string, email?: string): MailSettings {
  const mail = `mail.${domain}`;
  const named = !!serverHost && !isIp(serverHost);
  return {
    domain, email, username: email || `you@${domain}`,
    incoming: { imap: { host: mail, port: 993, security: 'SSL/TLS' }, pop3: { host: mail, port: 995, security: 'SSL/TLS' } },
    outgoing: { host: mail, port: 465, security: 'SSL/TLS', alt: { port: 587, security: 'STARTTLS' } },
    altHost: named ? serverHost : undefined,
    // DirectAdmin serves Roundcube at /roundcube on every vhost, including the server host name (valid certificate).
    webmail: named ? `https://${serverHost}/roundcube` : `https://${mail}/roundcube`,
  };
}

/** Plain-text summary used for the Android QR code. */
export function settingsText(s: MailSettings): string {
  return [`Email: ${s.username}`, `IMAP: ${s.incoming.imap.host} port ${s.incoming.imap.port} SSL/TLS`, `SMTP: ${s.outgoing.host} port ${s.outgoing.port} SSL/TLS`, `Username: ${s.username}`].join('\n');
}

const x = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
/** Stable UUID from a seed, so reinstalling the profile replaces the old one instead of adding a duplicate. */
export function stableUuid(seed: string): string {
  const h = createHash('sha256').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`.toUpperCase();
}

/** Apple configuration profile with one IMAP account. No password is included, so the device prompts for it. */
export function mobileconfig(s: MailSettings, org = 'GlobalHostia'): string {
  if (!s.email) throw new Error('mobileconfig needs a mailbox address');
  const email = s.email, rev = email.split('@').reverse().join('.').replace(/[^a-z0-9.-]/gi, '-');
  const k = (key: string, v: string | number | boolean) => `\t\t\t<key>${key}</key>\n\t\t\t${typeof v === 'boolean' ? (v ? '<true/>' : '<false/>') : typeof v === 'number' ? `<integer>${v}</integer>` : `<string>${x(v)}</string>`}`;
  const acct = [
    k('EmailAccountDescription', email), k('EmailAccountName', email), k('EmailAccountType', 'EmailTypeIMAP'), k('EmailAddress', email),
    k('IncomingMailServerAuthentication', 'EmailAuthPassword'), k('IncomingMailServerHostName', s.incoming.imap.host), k('IncomingMailServerPortNumber', s.incoming.imap.port),
    k('IncomingMailServerUseSSL', true), k('IncomingMailServerUsername', s.username),
    k('OutgoingMailServerAuthentication', 'EmailAuthPassword'), k('OutgoingMailServerHostName', s.outgoing.host), k('OutgoingMailServerPortNumber', s.outgoing.port),
    k('OutgoingMailServerUseSSL', true), k('OutgoingMailServerUsername', s.username), k('OutgoingPasswordSameAsIncomingPassword', true),
    k('PayloadDescription', `Email account ${email}`), k('PayloadDisplayName', email), k('PayloadIdentifier', `com.globalhostia.mail.${rev}.account`),
    k('PayloadType', 'com.apple.mail.managed'), k('PayloadUUID', stableUuid('acct:' + email)), k('PayloadVersion', 1),
    k('PreventAppSheet', false), k('PreventMove', false), k('SMIMEEnabled', false),
  ].join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>PayloadContent</key>
\t<array>
\t\t<dict>
${acct}
\t\t</dict>
\t</array>
\t<key>PayloadDescription</key>
\t<string>Sets up ${x(email)} in Mail. You will be asked for the mailbox password while installing.</string>
\t<key>PayloadDisplayName</key>
\t<string>${x(email)}</string>
\t<key>PayloadIdentifier</key>
\t<string>com.globalhostia.mail.${x(rev)}</string>
\t<key>PayloadOrganization</key>
\t<string>${x(org)}</string>
\t<key>PayloadRemovalDisallowed</key>
\t<false/>
\t<key>PayloadType</key>
\t<string>Configuration</string>
\t<key>PayloadUUID</key>
\t<string>${stableUuid('profile:' + email)}</string>
\t<key>PayloadVersion</key>
\t<integer>1</integer>
</dict>
</plist>
`;
}
