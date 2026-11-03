// Live HTTPS status of a customer's domain: connect to <domain>:443 with SNI and read the served certificate.
// Panel-independent, read-only. Only called for domains already verified to belong to the account.
import 'server-only';
import tls from 'node:tls';
import type { SslStatus } from './types';

export function probeSsl(domain: string, timeoutMs = 6000): Promise<SslStatus> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (s: SslStatus) => { if (!settled) { settled = true; try { sock.destroy(); } catch {} resolve(s); } };
    const sock = tls.connect({ host: domain, port: 443, servername: domain, rejectUnauthorized: false, timeout: timeoutMs }, () => {
      const c = sock.getPeerCertificate();
      if (!c || !c.valid_to) return done({ domain, https: false, error: 'No certificate served' });
      const names = String(c.subjectaltname || '').split(',').map((x) => x.trim().replace(/^DNS:/, '')).filter(Boolean);
      const to = new Date(c.valid_to);
      const trusted = sock.authorized;
      done({ domain, https: trusted, issuer: String((c.issuer as any)?.O || (c.issuer as any)?.CN || ''), subject: String((c.subject as any)?.CN || ''), validTo: to.toISOString(),
        daysLeft: Math.floor((to.getTime() - Date.now()) / 86400000), names: names.slice(0, 20), error: trusted ? undefined : String(sock.authorizationError || 'Certificate not trusted') });
    });
    sock.on('timeout', () => done({ domain, https: false, error: 'Timed out connecting on port 443' }));
    sock.on('error', (e: any) => done({ domain, https: false, error: e?.code === 'ENOTFOUND' ? 'Domain does not resolve' : 'No HTTPS on port 443' }));
  });
}
