// Pure parsers for DirectAdmin responses (legacy url-encoded, json=yes, and raw zone text). Unit-tested.

/** Parse a CMD_API_* body: JSON (json=yes) or url-encoded key=value&list[]=… */
export function parseDa(text: string): Record<string, any> {
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) { try { const j = JSON.parse(t); return Array.isArray(j) ? { list: j } : j; } catch { /* fall through */ } }
  const out: Record<string, any> = {};
  const sp = new URLSearchParams(t);
  for (const [k, v] of sp) {
    if (k.endsWith('[]')) (out[k.slice(0, -2)] ||= []).push(v);
    else out[k] = v;
  }
  return out;
}

export const isHtml = (text: string) => /^\s*<(!doctype|html|head|body)/i.test(text);

/** DA error convention: error=1 + text/details. */
export function daError(o: Record<string, any>): string | null {
  const e = o?.error;
  if (e === undefined || e === 0 || e === '0' || e === false) return null;
  const msg = [o.text, o.details, o.result].filter((x) => typeof x === 'string' && x.trim()).join(': ');
  return (msg || (typeof e === 'string' && e !== '1' ? e : 'The hosting panel reported an error')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** A list from any of: {list:[…]}, […], {0:'a',1:'b'}, {a:'',b:''} (legacy keys-as-items). */
export function toList(o: any): string[] {
  if (Array.isArray(o)) return o.map(String);
  if (!o || typeof o !== 'object') return [];
  if (Array.isArray(o.list)) return o.list.map(String);
  const ks = Object.keys(o).filter((k) => !['error', 'text', 'details', 'success'].includes(k));
  if (ks.length && ks.every((k) => /^\d+$/.test(k))) return ks.map((k) => String(o[k]));
  return ks;
}

/** A value that may be a nested object (json=yes) or a url-encoded string (legacy). */
export const attrs = (v: any): Record<string, string> => (v && typeof v === 'object' ? v : Object.fromEntries(new URLSearchParams(String(v ?? ''))));

export interface RawRecord { type: string; name: string; value: string; ttl: number }

/** Records from CMD_API_DNS_CONTROL: json=yes {records:[{type,name,value,ttl}]} or a raw zone file. */
export function parseDaZone(text: string, zone: string): RawRecord[] {
  const t = text.trim();
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      const recs = Array.isArray(j.records) ? j.records : Array.isArray(j) ? j : [];
      return recs.map((r: any) => ({ type: String(r.type || '').toUpperCase(), name: String(r.name ?? ''), value: String(r.value ?? ''), ttl: Number(r.ttl) || 0 }));
    } catch { /* fall through */ }
  }
  const out: RawRecord[] = []; let origin = zone + '.', last = origin, defTtl = 0;
  for (let line of t.split(/\r?\n/)) {
    line = line.replace(/;(?=(?:[^"]*"[^"]*")*[^"]*$).*/, '').trimEnd();
    if (!line.trim()) continue;
    if (/^\$ORIGIN\s+/i.test(line)) { origin = line.split(/\s+/)[1]; continue; }
    if (/^\$TTL\s+/i.test(line)) { defTtl = Number(line.split(/\s+/)[1]) || 0; continue; }
    const m = /^(\S+)?\s+(?:(\d+)\s+)?(?:IN\s+)?([A-Z]+)\s+(.+)$/i.exec(line.startsWith(' ') || line.startsWith('\t') ? ' ' + line.trim() : line.replace(/^(\S+)\s+/, '$1 '));
    if (!m) continue;
    const name = m[1] ? (m[1] === '@' ? origin : m[1]) : last;
    last = name;
    out.push({ type: m[3].toUpperCase(), name, value: m[4].trim(), ttl: Number(m[2]) || defTtl });
  }
  return out;
}
