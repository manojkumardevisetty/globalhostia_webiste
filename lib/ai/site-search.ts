// Full-text search over the whole public site (the same text the /llms-full.txt file is built from), cached for an hour.
import 'server-only';
import { buildLlms } from '../agents/llms';

type Chunk = { title: string; text: string; terms: Map<string, number>; len: number };
let cache: { at: number; chunks: Chunk[]; df: Map<string, number> } | null = null;
const tok = (s: string) => s.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}][\p{L}\p{N}.-]*/gu) || [];

async function index() {
  if (cache && Date.now() - cache.at < 3600_000) return cache;
  const full = String(await buildLlms(true));
  const chunks: Chunk[] = [];
  let title = 'GlobalHostia';
  for (const sec of full.split(/\n(?=#{1,3} )/)) {
    const h = sec.match(/^#{1,3} (.+)/); if (h) title = h[1].trim();
    for (let i = 0; i < sec.length; i += 1400) {
      const text = sec.slice(i, i + 1600).trim(); if (text.length < 40) continue;
      const terms = new Map<string, number>(); const t = tok(text);
      for (const w of t) terms.set(w, (terms.get(w) || 0) + 1);
      chunks.push({ title, text, terms, len: t.length });
    }
  }
  const df = new Map<string, number>();
  for (const c of chunks) for (const w of c.terms.keys()) df.set(w, (df.get(w) || 0) + 1);
  cache = { at: Date.now(), chunks, df };
  return cache;
}

/** BM25 top hits for a query (max 4 chunks, ~6k chars). */
export async function searchSite(q: string, k = 4) {
  const { chunks, df } = await index();
  const qs = [...new Set(tok(q))].filter((w) => w.length > 1);
  if (!qs.length) return [];
  const N = chunks.length, avg = chunks.reduce((a, c) => a + c.len, 0) / Math.max(1, N);
  return chunks.map((c) => {
    let s = 0;
    for (const w of qs) { const f = c.terms.get(w) || 0; if (!f) continue; const idf = Math.log(1 + (N - (df.get(w) || 0) + 0.5) / ((df.get(w) || 0) + 0.5)); s += idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * c.len / avg)); }
    return { c, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, k).map(({ c }) => ({ title: c.title, text: c.text }));
}
