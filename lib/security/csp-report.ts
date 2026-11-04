// CSP violation reports: parse both browser formats into one aggregated shape. Pure (tests/security.test.mts).
//  - report-uri:  Content-Type application/csp-report, body {"csp-report": {"document-uri", "violated-directive", ...}}
//  - report-to:   Content-Type application/reports+json, body [{type: "csp-violation", url, body: {documentURL, effectiveDirective, ...}}]
import { createHash } from 'node:crypto';

export type CspViolation = {
  key: string; directive: string; blocked: string; page: string; source: string; disposition: 'enforce' | 'report'; sample: string;
};

const str = (v: unknown, max: number) => (typeof v === 'string' ? v : v == null ? '' : String(v)).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
const NOISE = /^(chrome|moz|safari|safari-web|ms-browser|edge)-extension:|^about:|^webkit-masked-url:/i;

/** Origin of a URL, or the keyword the browser sent (inline, eval, data, blob, wasm-eval, trusted-types-…). */
export function blockedOf(v: string): string {
  const s = v.trim();
  if (!s) return 'inline';
  if (/^(inline|eval|wasm-eval|trusted-types-\w+|self)$/i.test(s)) return s.toLowerCase();
  if (/^(data|blob|filesystem|mediastream):/i.test(s)) return s.split(':')[0].toLowerCase() + ':';
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'wss:' || u.protocol === 'ws:' ? u.origin : u.protocol; } catch { return s.slice(0, 60); }
}
const pathOf = (v: string) => { try { return new URL(v).pathname.slice(0, 200) || '/'; } catch { return v.startsWith('/') ? v.split(/[?#]/)[0].slice(0, 200) : ''; } };
const sourceOf = (v: string) => { try { const u = new URL(v); return (u.origin + u.pathname).slice(0, 200); } catch { return ''; } };

function normalise(r: Record<string, unknown>, disposition: unknown): CspViolation | null {
  const directive = str(r.effectiveDirective ?? r['effective-directive'] ?? r['violated-directive'] ?? r.violatedDirective, 80).trim().split(/\s+/)[0].toLowerCase();
  const blockedRaw = str(r.blockedURL ?? r['blocked-uri'] ?? r.blockedURI, 500);
  const doc = str(r.documentURL ?? r['document-uri'] ?? r.documentURI, 500);
  const src = str(r.sourceFile ?? r['source-file'], 500);
  if (!directive || !/^[a-z-]+$/.test(directive)) return null;
  if (NOISE.test(blockedRaw) || NOISE.test(src) || NOISE.test(doc)) return null;
  const blocked = blockedOf(blockedRaw);
  const page = pathOf(doc);
  const disp = String(disposition ?? r.disposition ?? 'enforce').toLowerCase() === 'report' ? 'report' : 'enforce';
  const sample = str(r.sample ?? r['script-sample'], 80);
  const key = createHash('sha1').update([directive, blocked, page, disp].join('|')).digest('hex').slice(0, 24);
  return { key, directive, blocked, page, source: sourceOf(src), disposition: disp, sample };
}

/** Parses one request body (≤ 64 KB, already read as text). Unknown or malformed input gives []. At most 20 reports. */
export function parseCspReports(body: string, contentType = ''): CspViolation[] {
  if (!body || body.length > 64_000) return [];
  let j: unknown;
  try { j = JSON.parse(body); } catch { return []; }
  const out: CspViolation[] = [];
  const list = Array.isArray(j) ? j : [j];
  for (const item of list.slice(0, 20)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, any>;
    if (o['csp-report'] && typeof o['csp-report'] === 'object') { const v = normalise(o['csp-report'], o['csp-report'].disposition); if (v) out.push(v); continue; }
    if ((o.type === 'csp-violation' || /reports\+json/.test(contentType)) && o.body && typeof o.body === 'object') {
      if (o.type && o.type !== 'csp-violation') continue;
      const v = normalise({ documentURL: o.url, ...o.body }, o.body.disposition); if (v) out.push(v);
    }
  }
  return out;
}
