// Fetch a Client ID Metadata Document (the client_id is an https URL) without opening an SSRF hole:
// https on port 443 only, every resolved address must be public (the socket is pinned to the checked address, so a
// DNS rebind between check and connect does not help), no redirects, 5 s timeout, 16 KB body cap, JSON only.
// The same fetcher loads a private_key_jwt client's JWK Set from its jwks_uri.
import 'server-only';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { isPublicIp } from './core';

const MAX_BYTES = 16 * 1024;
const TIMEOUT_MS = 5000;

export class CimdError extends Error {}

/** GET the Client ID Metadata Document as JSON. Throws CimdError with a short reason on any failure. */
export const fetchCimd = (url: string) => fetchPublicJson(url, 'client_id', 'metadata document');

/** GET a client's JWK Set (jwks_uri, for private_key_jwt) with the same SSRF rules. */
export const fetchJwks = (url: string) => fetchPublicJson(url, 'jwks_uri', 'JWK Set');

async function fetchPublicJson(url: string, field: string, label: string): Promise<unknown> {
  let u: URL;
  try { u = new URL(url); } catch { throw new CimdError(`${field} is not a valid URL`); }
  if (u.protocol !== 'https:' || (u.port && u.port !== '443')) throw new CimdError(`${field} must be an https URL on the default port`);
  if (net.isIP(u.hostname.replace(/^\[|\]$/g, ''))) throw new CimdError(`${field} host must be a domain name`);
  const addrs = await dns.promises.lookup(u.hostname, { all: true, verbatim: true }).catch(() => { throw new CimdError(`${field} host does not resolve`); });
  if (!addrs.length || !addrs.every((a) => isPublicIp(a.address))) throw new CimdError(`${field} host resolves to a non-public address`);
  const pinned = addrs[0];
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: u.hostname, servername: u.hostname, path: u.pathname + u.search, method: 'GET', port: 443,
      headers: { accept: 'application/json', 'user-agent': 'GlobalHostia-OAuth/1.0 (+https://globalhostia.com/docs/mcp)' },
      lookup: (_h: string, opts: any, cb: any) => (opts && opts.all ? cb(null, [{ address: pinned.address, family: pinned.family }]) : cb(null, pinned.address, pinned.family)),
      timeout: TIMEOUT_MS,
    }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new CimdError(`${label} returned HTTP ${res.statusCode}`)); return; }
      const type = String(res.headers['content-type'] || '');
      if (type && !/json/i.test(type)) { res.resume(); reject(new CimdError(`${label} is not JSON`)); return; }
      let size = 0; const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => { size += c.length; if (size > MAX_BYTES) { req.destroy(); reject(new CimdError(`${label} is too large`)); } else chunks.push(c); });
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new CimdError(`${label} is not valid JSON`)); } });
    });
    req.on('timeout', () => { req.destroy(); reject(new CimdError(`${label} fetch timed out`)); });
    req.on('error', (e) => reject(e instanceof CimdError ? e : new CimdError(`${label} could not be fetched`)));
    req.end();
  });
}
