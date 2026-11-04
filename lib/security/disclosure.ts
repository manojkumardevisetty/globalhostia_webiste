// RFC 9116 security.txt (served at /.well-known/security.txt and /security.txt). Pure builder (tests/security.test.mts).
export function securityTxt(o: { contact: string; site: string; policyUrl?: string; now?: number }): string {
  const site = o.site.replace(/\/$/, '');
  const c = o.contact.trim();
  const contact = /^(mailto:|https:\/\/)/i.test(c) ? c : `mailto:${c}`;
  // one year ahead, at midnight UTC (RFC 9116 asks for less than a year; the file is generated, so it never goes stale)
  const d = new Date((o.now ?? Date.now()) + 364 * 86400_000); d.setUTCHours(0, 0, 0, 0);
  return [
    `Contact: ${contact}`,
    `Expires: ${d.toISOString().replace('.000Z', 'Z')}`,
    `Policy: ${o.policyUrl || `${site}/security`}`,
    'Preferred-Languages: en, ar',
    `Canonical: ${site}/.well-known/security.txt`,
    '',
  ].join('\n');
}
