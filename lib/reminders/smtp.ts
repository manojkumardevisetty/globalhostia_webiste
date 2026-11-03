// Minimal SMTP client (no dependency) for the optional "smtp" transport: implicit TLS (port 465) or STARTTLS (587/25),
// AUTH PLAIN/LOGIN, one message per connection. Use the owner's existing mailbox on the hosting server (no new paid
// service). Unlike WHMCS SendEmail it can set List-Unsubscribe / List-Unsubscribe-Post (RFC 8058 one-click) and can
// email guests who are not WHMCS clients yet. Config only from server env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
// SMTP_FROM ("GlobalHostia <billing@globalhostia.com>"), SMTP_SECURE ("tls" | "starttls", default by port).
import net from 'node:net';
import tls from 'node:tls';
import { randomBytes } from 'node:crypto';

export type SmtpConfig = { host: string; port: number; user: string; pass: string; from: string; secure: 'tls' | 'starttls' | 'none'; rejectUnauthorized?: boolean };
export type Mail = { to: string; subject: string; html: string; text: string; headers?: Record<string, string> };

export function smtpFromEnv(env: Record<string, string | undefined> = process.env): SmtpConfig | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE } = env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) return null;
  const port = Number(SMTP_PORT) || 465;
  const secure = SMTP_SECURE === 'starttls' || SMTP_SECURE === 'tls' ? SMTP_SECURE : port === 465 ? 'tls' : 'starttls';
  return { host: SMTP_HOST, port, user: SMTP_USER, pass: SMTP_PASS, from: SMTP_FROM, secure };
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const wrap76 = (s: string) => s.replace(/(.{76})/g, '$1\r\n');
/** RFC 2047 encoded word for non-ASCII header text (subjects in Arabic). */
export const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const addr = (s: string) => /<([^>]+)>/.exec(s)?.[1] || s.trim();
const clean = (s: string) => s.replace(/[\r\n]+/g, ' ');

/** The full RFC 5322 message (multipart/alternative, base64 parts). */
export function buildMessage(from: string, m: Mail, now = new Date()): string {
  const boundary = `gh_${randomBytes(12).toString('hex')}`;
  const domain = addr(from).split('@')[1] || 'globalhostia.com';
  const name = /^(.*)<[^>]+>$/.exec(from)?.[1].trim().replace(/^"|"$/g, '');
  const head: Record<string, string> = {
    From: name ? `${encodeHeader(name)} <${addr(from)}>` : addr(from), To: clean(m.to), Subject: encodeHeader(clean(m.subject)), Date: now.toUTCString(),
    'Message-ID': `<${randomBytes(16).toString('hex')}@${domain}>`, 'MIME-Version': '1.0', 'Content-Type': `multipart/alternative; boundary="${boundary}"`,
    ...Object.fromEntries(Object.entries(m.headers || {}).map(([k, v]) => [clean(k), clean(v)])),
  };
  const part = (type: string, body: string) => `--${boundary}\r\nContent-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64(body))}\r\n`;
  return `${Object.entries(head).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n${part('text/plain', m.text)}${part('text/html', m.html)}--${boundary}--\r\n`;
}

/** Dot-stuffing for DATA (lines starting with "." get another "."). */
export const dotStuff = (s: string) => s.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');

type Sock = net.Socket | tls.TLSSocket;
function reader(sock: Sock) {
  let buf = '';
  const waiting: ((l: string) => void)[] = [];
  const lines: string[] = [];
  const onData = (d: Buffer) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 2); lines.push(l); }
    flush();
  };
  const flush = () => {
    // a reply is complete at a line "NNN text" (no dash after the code)
    const end = lines.findIndex((l) => /^\d{3}(?: |$)/.test(l));
    if (end >= 0 && waiting.length) { const reply = lines.splice(0, end + 1).join('\n'); waiting.shift()!(reply); }
  };
  sock.on('data', onData);
  return { next: () => new Promise<string>((res) => { waiting.push(res); flush(); }), detach: () => sock.off('data', onData) };
}

export async function sendSmtp(cfg: SmtpConfig, m: Mail, timeoutMs = 20000): Promise<void> {
  let sock: Sock = cfg.secure === 'tls'
    ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host, rejectUnauthorized: cfg.rejectUnauthorized !== false })
    : net.connect({ host: cfg.host, port: cfg.port });
  sock.setTimeout(timeoutMs, () => sock.destroy(new Error('SMTP timeout')));
  let failed: Error | null = null;
  sock.on('error', (e) => { failed = e; });
  await new Promise<void>((res, rej) => { sock.once(cfg.secure === 'tls' ? 'secureConnect' : 'connect', () => res()); sock.once('error', rej); });
  let r = reader(sock);
  const expect = async (code: number | number[]) => {
    const reply = await Promise.race([r.next(), new Promise<string>((_, rej) => sock.once('close', () => rej(failed || new Error('SMTP connection closed'))))]);
    const got = Number(reply.slice(0, 3));
    if (!(Array.isArray(code) ? code : [code]).includes(got)) throw new Error(`SMTP ${reply.split('\n').pop()?.slice(0, 200)}`);
    return reply;
  };
  const cmd = async (line: string, code: number | number[]) => { sock.write(line + '\r\n'); return expect(code); };
  try {
    await expect(220);
    const ehloName = 'globalhostia.com';
    let caps = await cmd(`EHLO ${ehloName}`, 250);
    if (cfg.secure === 'starttls') {
      if (!/STARTTLS/i.test(caps)) throw new Error('SMTP server does not offer STARTTLS');
      await cmd('STARTTLS', 220);
      r.detach();
      sock = await new Promise<tls.TLSSocket>((res, rej) => { const t = tls.connect({ socket: sock as net.Socket, servername: cfg.host, rejectUnauthorized: cfg.rejectUnauthorized !== false }, () => res(t)); t.once('error', rej); });
      sock.on('error', (e) => { failed = e; });
      r = reader(sock);
      caps = await cmd(`EHLO ${ehloName}`, 250);
    }
    if (/AUTH[ =][^\n]*PLAIN/i.test(caps)) await cmd(`AUTH PLAIN ${b64(`\0${cfg.user}\0${cfg.pass}`)}`, 235);
    else { await cmd('AUTH LOGIN', 334); await cmd(b64(cfg.user), 334); await cmd(b64(cfg.pass), 235); }
    await cmd(`MAIL FROM:<${addr(cfg.from)}>`, 250);
    await cmd(`RCPT TO:<${addr(m.to)}>`, [250, 251]);
    await cmd('DATA', 354);
    sock.write(dotStuff(buildMessage(cfg.from, m)) + '\r\n.\r\n');
    await expect(250);
    sock.write('QUIT\r\n');
  } finally {
    setTimeout(() => sock.destroy(), 200).unref?.();
  }
}
