// One smart template for informational pages (about, help center, status, network, legal, …).
// It loads the original page from the CMS (`pages` + visible `sections`), extracts the meaningful
// content from the legacy HTML with parse5 (headings, paragraphs, lists, tables, real images, buttons),
// drops template junk and unverifiable claims, and re-lays it out in the theme. Per-slug touches add
// search, status cards, maps and stats built from live data only.
import type { PageCtx } from '../index';
import { parseFragment } from 'parse5';
import { and, asc, eq } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { db, schema } from '../../db';
import { esc, tokens } from '../../render/util';
import { getCatalog, whmcsLinks, productsFor, deriveSpecs, minFrom, pricedTlds, fmt, type Catalog } from '../data';
import { page } from '../shell';
import {
  pageHero, sectionHead, splitHead, featureGrid, statRow, faq, faqJsonLd, ctaBand, dcMap, planCards, breadcrumbJsonLd,
  icon, hexIcon, button, link, ld, type IconName, type FeatureItem,
} from '../ui';

/* ================================================================== extraction */
type Item = { html: string; text: string };
export type Block =
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; html: string; text: string }
  | { t: 'list'; items: Item[]; ordered: boolean }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'img'; src: string; alt: string }
  | { t: 'btn'; label: string; href: string };
type N = { nodeName: string; tagName?: string; value?: string; attrs?: { name: string; value: string }[]; childNodes?: N[] };

const escH = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = (n: N, k: string) => n.attrs?.find((a) => a.name === k)?.value || '';
const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
const tidy = (h: string) => h.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();

const SKIP = new Set(['script', 'style', 'svg', 'form', 'noscript', 'iframe', 'nav', 'header', 'footer', 'input', 'select', 'textarea', 'button', 'template', 'video', 'canvas', 'label', 'option', 'map']);
const SKIP_CLS = /(^|[\s-])(shape|wave|particles|underlay|hero-backgrounds|modal|breadcrumb|pagination|search-form|share|social|rating|stars?|tooltip|dropdown|navbar|countdown|lightbox|footer)([\s-]|$)/i;
const BLOCK = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'img', 'div', 'section', 'article', 'aside', 'figure', 'blockquote', 'dl', 'main', 'li']);
const BAD_IMG = /\/(header|payment|logos?|comparison|customers|svg|team|icons?|5g-pack|server-pack)\/|logo|award|five-star|shape|helf-circle|\/demo\/|bg\.|placeholder|avatar/i;
/** Template / theme-demo leftovers. */
const JUNK = /lorem|ipsum|coodiv|envato|themeforest|codecanyon|android development|theme products|user-friendliness|dolor sit|consectetur|eiusmod|incididunt|viverra|aliquet|tellus|faucibus|pharetra|john doe|jane doe|example\.com|your (name|email)\b|\d(\.\d+)?\s*\/\s*5(\.0)?\b|out of 5|customers visit|average customer rating|happy clients|technologists|friends and colleagues|airslate|collect signatures|rental income|supersite|http api|social media|helped amazing companies|ohh no|server informations|opened on|static:|\bIP:\s*\d|made with|copyright|all rights? reserved|lots of coffee|departement|these values collectively|shared values keep us|business (starter|standard|plus)|videomeetings|log forwarding|monitoring dashboard|head to head|best hosting ever|get inspired|graphic design|shared space in your town|customer automation|proven automated|globalhostia cache|uncached|algeria server|let's encrypt integration|optimizer automatically|google workspace safe|join the businesses|can be reached in less than|value-added areas|digital transformation is a journey|seamless business|\+971-52-123|\{\{/i;
/** Unverifiable marketing claims and prices in legacy copy (sentence level, non-legal pages). */
const CLAIM = /\d+(\.\d+)?\s?%|%\s?\d|guarantee|within \d+([–-]\d+)?\s*(hours?|minutes?|mins?|seconds?)|number one|#1\b|award|largest|fastest|one of the (best|fastest|largest)|\d+\s*(ms|tbps|gbps)\b|\bpops?\b|\d+\+?\s*(enterprise[- ]class\s+)?(data ?cent(er|re)s|countries|continents|points of presence|access points)|\d+(\.\d+)?\s?[kKmM]\+|\d[\d,]*\+|free trial|no credit card|zero downtime|money[- ]back|smartedge|gmail’s|gmail's|machine learning|requests per second|uplink|instantly|[$€£]\s?\d|\d\s?(usd|aed|eur)\b|\b1\.4m|countet|indea|morroco/i;
const NAVJUNK = /^(web hosting|vps servers|cloud hosting|cms hosting|domain checker|domain transfer|free domain|ssl certificate|free ssl certificate|whois checker|about us|our technology|privacy policy|terms & conditions|contact us)$/i;
const CTAISH = /^(start|get|order|explore|see|view|open|try|learn|read|buy|sign|join|contact|plan features|overview|live chat|start now|get started)\b/i;

function textOf(n: N): string {
  if (n.nodeName === '#text') return n.value || '';
  if (n.tagName && SKIP.has(n.tagName)) return '';
  if (n.tagName === 'br') return ' ';
  return (n.childNodes || []).map(textOf).join(' ');
}
const safeHref = (h: string) => {
  h = h.trim();
  if (!h || h.startsWith('#') || /^javascript:/i.test(h)) return '';
  if (/^(https?:|mailto:|tel:|\/)/i.test(h)) return h;
  return '/' + h.replace(/^\.?\//, '').replace(/\.html?$/, '');
};
/** Sanitised inline HTML: text plus a / strong / em / code only. */
function inline(n: N): string {
  if (n.nodeName === '#text') return escH(n.value || '');
  const t = n.tagName;
  if (!t || SKIP.has(t) || t === 'img') return '';
  if (t === 'br') return ' ';
  const inner = (n.childNodes || []).map(inline).join('');
  if (t === 'a') { const h = safeHref(attr(n, 'href')); return h && norm(inner) ? `<a href="${escH(h)}">${inner}</a>` : inner; }
  if (t === 'strong' || t === 'b') return norm(inner) ? `<strong>${inner}</strong>` : inner;
  if (t === 'em') return norm(inner) ? `<em>${inner}</em>` : '';
  if (t === 'code') return `<code>${inner}</code>`;
  return /^(div|span|li|p|small|label|sup|sub|i|u)$/.test(t) ? ' ' + inner + ' ' : inner;
}
const hasBlockDesc = (n: N): boolean => (n.childNodes || []).some((c) => !!c.tagName && !SKIP.has(c.tagName) && (BLOCK.has(c.tagName) || hasBlockDesc(c)));

/** Flatten legacy HTML into content blocks in reading order. */
export function extract(html: string): Block[] {
  const out: Block[] = [];
  const walk = (n: N) => {
    const t = n.tagName;
    if (!t || SKIP.has(t) || SKIP_CLS.test(attr(n, 'class')) || attr(n, 'aria-hidden') === 'true' || n.attrs?.some((a) => a.name === 'hidden')) return;
    if (/^h[1-6]$/.test(t)) { const text = norm(textOf(n)); if (text) out.push({ t: 'h', level: +t[1], text }); return; }
    if (t === 'p' || t === 'blockquote') { const text = norm(textOf(n)); if (text) out.push({ t: 'p', html: tidy(inline(n)), text }); return; }
    if (t === 'ul' || t === 'ol') {
      const lis = (n.childNodes || []).filter((c) => c.tagName === 'li');
      if (lis.some((li) => (li.childNodes || []).some((c) => c.tagName && /^(h\d|p|div|img)$/.test(c.tagName)))) { lis.forEach(walk); return; }
      const items = lis.map((li) => ({ html: tidy(inline(li)), text: norm(textOf(li)) })).filter((i) => i.text);
      if (items.length) out.push({ t: 'list', items, ordered: t === 'ol' });
      return;
    }
    if (t === 'table') {
      const rows: string[][] = []; let head: string[] = [];
      const rowsOf = (x: N) => { for (const c of x.childNodes || []) {
        if (c.tagName === 'tr') {
          const cells = (c.childNodes || []).filter((d) => d.tagName === 'td' || d.tagName === 'th');
          const vals = cells.map((d) => norm(textOf(d)));
          if (!head.length && !rows.length && (x.tagName === 'thead' || cells.every((d) => d.tagName === 'th'))) head = vals; else if (vals.some(Boolean)) rows.push(vals);
        } else if (c.tagName) rowsOf(c);
      } };
      rowsOf(n);
      if (rows.length) out.push({ t: 'table', head, rows });
      return;
    }
    if (t === 'img') {
      const src = attr(n, 'src') || attr(n, 'data-src');
      if (src.startsWith('/image/') && !BAD_IMG.test(src)) out.push({ t: 'img', src, alt: norm(attr(n, 'alt')) });
      return;
    }
    if (t === 'a') {
      const href = safeHref(attr(n, 'href')), label = norm(textOf(n));
      if (/btn|button/i.test(attr(n, 'class')) && href && label && label.length < 40) { out.push({ t: 'btn', label, href }); return; }
    }
    if (!hasBlockDesc(n)) {
      const text = norm(textOf(n));
      if (text && (!/^(span|a|i|small|strong|b)$/.test(t) || text.length > 40)) out.push({ t: 'p', html: tidy(inline(n)), text });
      return;
    }
    for (const c of n.childNodes || []) walk(c);
    const loose = norm((n.childNodes || []).filter((c) => c.nodeName === '#text').map((c) => c.value).join(' '));
    if (loose.length > 30) out.push({ t: 'p', html: escH(loose), text: loose });
  };
  for (const c of (parseFragment(html) as unknown as N).childNodes || []) walk(c);
  return out;
}

/** Remove junk, CTA fragments, duplicates and (optionally) unverifiable claims.
 *  A junk / claim / duplicate heading drops everything up to the next heading. */
function clean(blocks: Block[], legal: boolean): Block[] {
  const seen = new Set<string>();
  const paras: string[] = [];
  const out: Block[] = [];
  const keyOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let dropping = false;
  for (let b of blocks) {
    if (b.t === 'h') {
      const raw = b.text.replace(/\s+\?$/, '?');
      const txt = TITLE_FIX[raw] ?? raw;
      const bad = JUNK.test(txt) || /^[\d\s.,%+/:kKmM]+$/.test(txt) || (!legal && CLAIM.test(txt)) || seen.has('h:' + keyOf(txt));
      dropping = bad;
      if (bad) { out.push({ t: 'h', level: b.level, text: '' }); continue; }
      seen.add('h:' + keyOf(txt));
      out.push({ t: 'h', level: b.level, text: txt.replace(/^(.)/, (m) => m.toUpperCase()) });
      continue;
    }
    if (dropping) continue;
    if (b.t === 'p') {
      if (JUNK.test(b.text) || /^\+?\d[\d.,]*k?\s*read more$/i.test(b.text)) continue;
      if (b.text.split(' ').length < 5 && !legal) continue;
      if (b.text.split(' ').length < 3 && (CTAISH.test(b.text) || b.text.length < 20)) continue;
      if (!legal && CLAIM.test(b.text)) {
        const keep = b.text.split(/(?<=[.!?])\s+/).filter((x) => !CLAIM.test(x) && !JUNK.test(x));
        if (!keep.length || keep.join(' ').split(' ').length < 5) continue;
        const txt = keep.join(' ');
        b = { t: 'p', html: escH(txt), text: txt };
      }
      const k = keyOf(b.text);
      if (k.length > 20 && paras.some((x) => x.includes(k))) continue;
      paras.push(k);
      out.push({ ...b, html: b.html.replace(/\s*\.\.\.$/, '…') });
      continue;
    }
    if (b.t === 'list') {
      const items = b.items.filter((i, n, a) => !JUNK.test(i.text) && (legal || !CLAIM.test(i.text)) && i.text.length > 1 && a.findIndex((x) => x.text === i.text) === n);
      if (items.filter((i) => NAVJUNK.test(i.text)).length >= 2) continue;
      if (items.some((i) => /@|\+\d{3}/.test(i.text)) && items.length <= 3) continue; // contact fragments: the shell already shows real ones
      if (!legal && items.length > 4 && items.every((i) => i.text.split(' ').length <= 2)) continue; // bare location / PoP lists
      if (!legal && items.every((i) => /^[A-Z]{3,}$/.test(i.text))) continue;
      if (!items.length) continue;
      const k = 'l:' + items.map((i) => keyOf(i.text)).join('|');
      if (seen.has(k) || [...seen].some((x) => x.startsWith(k.slice(0, 40)) && x.length > k.length)) continue;
      if ([...seen].some((x) => x.startsWith('l:') && k.startsWith(x))) continue;
      seen.add(k);
      const prev = out[out.length - 1];
      if (prev?.t === 'list' && items.length === 1 && !prev.ordered) { prev.items.push(...items); continue; }
      out.push({ ...b, items });
      continue;
    }
    if (b.t === 'btn') continue; // legacy buttons point at template URLs; each page gets its own CTAs
    const k = b.t + ':' + (b.t === 'table' ? JSON.stringify(b.rows) : b.t === 'img' ? b.src : '');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(b);
  }
  return out;
}

/** Legacy headings that need a light copy-edit. */
const TITLE_FIX: Record<string, string> = { '3 Eeasy steps to start using our services.': 'Three steps to get started', 'GlobalHostia team What we do?': 'What we do', 'Shared values keep us connected & guide us as one team': 'What guides us' };

/* ================================================================== model */
type Chunk = { h?: { level: number; text: string }; body: Block[] };
type Sec =
  | { k: 'prose'; title?: string; level?: number; blocks: Block[]; img?: { src: string; alt: string } }
  | { k: 'cards'; title?: string; lead?: string; items: { title: string; html: string; text: string }[] }
  | { k: 'qa'; title?: string; items: { q: string; a: string }[] };

const words = (bs: Block[]) => bs.reduce((n, b) => n + (b.t === 'p' ? b.text.split(' ').length : b.t === 'list' ? b.items.reduce((m, i) => m + i.text.split(' ').length, 0) : b.t === 'table' ? 40 : 0), 0);
const textBlocks = (bs: Block[]) => bs.filter((b) => b.t === 'p' || b.t === 'list' || b.t === 'table');

function chunk(blocks: Block[]): Chunk[] {
  const out: Chunk[] = [{ body: [] }];
  for (const b of blocks) {
    if (b.t === 'h') { out.push({ h: b.text ? { level: b.level, text: b.text } : undefined, body: [] }); continue; }
    out[out.length - 1].body.push(b);
  }
  return out.filter((c) => c.h || c.body.length);
}

function model(blocks: Block[]): { intro: string; secs: Sec[] } {
  const chunks = chunk(blocks);
  let intro = '';
  // the legacy h1 becomes our hero; keep its first good paragraph as a candidate intro
  const h1 = chunks.findIndex((c) => c.h?.level === 1);
  if (h1 >= 0) { const p = chunks[h1].body.find((b) => b.t === 'p' && b.text.split(' ').length >= 10); if (p && p.t === 'p') intro = p.text; chunks[h1] = { body: chunks[h1].body.filter((b) => b !== p) }; }
  const short = (c: Chunk) => !!c.h && textBlocks(c.body).length >= 1 && words(c.body) <= 60 && !c.body.some((b) => b.t === 'table' || (b.t === 'list' && b.items.length > 4));
  const isQ = (c: Chunk) => !!c.h && /\?$/.test(c.h.text) && textBlocks(c.body).length >= 1;
  const secs: Sec[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    // question runs → Q&A
    if (isQ(c)) {
      let j = i; const items: { q: string; a: string }[] = [];
      while (j < chunks.length && isQ(chunks[j])) { const cc = chunks[j]; items.push({ q: cc.h!.text, a: textBlocks(cc.body).map((b) => (b.t === 'p' ? b.text : b.t === 'list' ? b.items.map((x) => x.text).join('; ') : '')).join(' ') }); j++; }
      if (items.length >= 2) { const prev = secs[secs.length - 1]; const title = prev && prev.k === 'prose' && !textBlocks(prev.blocks).length ? (secs.pop() as { title?: string }).title : undefined; secs.push({ k: 'qa', title, items }); i = j - 1; continue; }
    }
    // runs of short headed chunks at the same level → cards
    if (short(c)) {
      let j = i; while (j < chunks.length && short(chunks[j]) && chunks[j].h!.level === c.h!.level) j++;
      if (j - i >= 2) {
        const items = chunks.slice(i, j).map((cc) => { const tb = textBlocks(cc.body); return { title: cc.h!.text, html: tb.map((b) => (b.t === 'p' ? `<p>${b.html}</p>` : b.t === 'list' ? `<ul>${b.items.map((x) => `<li>${x.html}</li>`).join('')}</ul>` : '')).join(''), text: tb.map((b) => (b.t === 'p' ? b.text : b.t === 'list' ? b.items.map((x) => x.text).join(' ') : '')).join(' ') }; });
        // a preceding heading with little body becomes the group title
        const prev = secs[secs.length - 1];
        let title: string | undefined, lead: string | undefined;
        if (prev && prev.k === 'prose' && prev.title && (prev.level || 9) < c.h!.level && words(prev.blocks) <= 45 && !prev.img) { secs.pop(); title = prev.title; lead = textBlocks(prev.blocks).map((b) => (b.t === 'p' ? b.text : '')).join(' ').trim() || undefined; }
        secs.push({ k: 'cards', title, lead, items });
        i = j - 1; continue;
      }
    }
    const tb = textBlocks(c.body);
    const img = c.body.find((b) => b.t === 'img') as { src: string; alt: string } | undefined;
    if (!c.h && !tb.length) continue;
    secs.push({ k: 'prose', title: c.h?.text, level: c.h?.level, blocks: tb, img });
  }
  // drop empty headed prose (headings whose body was all junk), merging nothing
  return { intro, secs: secs.filter((s) => s.k !== 'prose' || textBlocks(s.blocks).length) };
}

/* ================================================================== loading */
type Legacy = { title: string; html: string; faqs: { q: string; a: string }[] };
async function loadLegacyRaw(slug: string, preview: boolean): Promise<Legacy | null> {
  const [pg] = await db.select().from(schema.pages).where(eq(schema.pages.slug, slug)).limit(1);
  if (!pg) return null;
  if (!preview && (pg.status !== 'PUBLISHED' || (pg.publishAt && pg.publishAt > new Date()))) return null;
  const secs = await db.select().from(schema.sections).where(preview ? eq(schema.sections.pageId, pg.id) : and(eq(schema.sections.pageId, pg.id), eq(schema.sections.visible, true))).orderBy(asc(schema.sections.sortOrder));
  const faqs: { q: string; a: string }[] = [];
  for (const s of secs) if (s.type === 'faq' && Array.isArray(s.data?.items)) for (const it of s.data.items) if (it?.q && it?.a) faqs.push({ q: String(it.q), a: String(it.a) });
  return { title: pg.title, html: secs.filter((s) => s.type === 'html').map((s) => s.html).join('\n'), faqs };
}
const loadLegacy = unstable_cache((slug: string) => loadLegacyRaw(slug, false), ['theme-content', process.env.VERCEL_GIT_COMMIT_SHA || 'dev'], { tags: ['site'], revalidate: 3600 });

/* ================================================================== rendering */
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'section';
const ICON_RULES: [RegExp, IconName][] = [
  [/ticket/i, 'ticket'], [/knowledge|guide|tutorial|docs?\b|article/i, 'book'], [/support|help|expert|team/i, 'headset'], [/backup|restore/i, 'archive'],
  [/secur|protect|ssl|certificate|privacy|encrypt/i, 'shield'], [/vps|server|dedicated|cpu/i, 'server'], [/nvme|ssd|storage|disk/i, 'drive'],
  [/network|tier|carrier|route/i, 'net'], [/cache|speed|fast|performance/i, 'bolt'], [/scal|grow|upgrade/i, 'trend'], [/domain|dns|nameserver/i, 'globe'],
  [/email|mail/i, 'mail'], [/wordpress/i, 'wp'], [/payment|invoice|billing|refund|currenc/i, 'card'], [/account|password|login|user/i, 'user'],
  [/plan|choose|order/i, 'cart'], [/start|launch|go live/i, 'rocket'], [/location|closest|region|algeria|datacent/i, 'pin'], [/install|one-click|app/i, 'plug'],
  [/cpanel|panel|manage/i, 'settings'], [/24\/7|365|time/i, 'clock'],
];
const iconFor = (s: string): IconName => ICON_RULES.find(([re]) => re.test(s))?.[1] || 'check';

function blockHtml(b: Block): string {
  if (b.t === 'p') return `<p>${b.html}</p>`;
  if (b.t === 'list') {
    const tag = b.ordered ? 'ol' : 'ul';
    return `<${tag} class="cn-list">${b.items.map((i) => {
      const m = i.html.match(/^(?:<strong>)?([^:<]{2,60}):(?:<\/strong>)?\s*(.+)$/); // "Label: text" → bold label
      return `<li>${m ? `<strong>${m[1]}:</strong> ${m[2]}` : i.html}</li>`;
    }).join('')}</${tag}>`;
  }
  if (b.t === 'table') return `<div class="cn-table"><table>${b.head.length ? `<thead><tr>${b.head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>` : ''}<tbody>${b.rows.map((r) => `<tr>${r.map((c, i) => (i === 0 && !b.head.length ? `<th scope="row">${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
  return '';
}

function renderSecs(secs: Sec[], o: { topics?: boolean; kb?: string } = {}): string {
  let side = 0;
  return secs.map((s, idx) => {
    const id = s.title ? `cn-${slugify(s.title)}-${idx}` : '';
    const tint = idx % 2 === 1;
    if (s.k === 'cards') {
      const n = s.items.length;
      const cols = n === 2 || n === 4 ? 2 : 3;
      return `<section class="hp-section cn-sec${tint ? ' hp-section--tint' : ''}"${id ? ` aria-labelledby="${id}"` : ' aria-label="Highlights"'}><div class="hp-container">
        ${s.title ? sectionHead({ id, title: s.title, lead: s.lead }) : ''}
        <div class="cn-cards cn-cards--${cols}" data-stagger>${s.items.map((it) => {
          const inner = `${hexIcon(iconFor(it.title + ' ' + it.text))}<h3>${esc(it.title)}</h3>${it.html ? `<div class="cn-card__txt">${it.html}</div>` : ''}`;
          return o.topics
            ? `<a class="cn-card cn-card--link" href="${esc(o.kb || '#')}" data-reveal data-topic data-text="${esc((it.title + ' ' + it.text).toLowerCase())}">${inner}<span class="cn-card__go">Read in the knowledge base${icon('arrow')}</span></a>`
            : `<article class="cn-card" data-reveal>${inner}</article>`;
        }).join('')}</div>
        ${o.topics ? '<p class="cn-nomatch" data-topic-empty hidden>No topics match your search. Try another word or open a support ticket.</p>' : ''}
      </div></section>`;
    }
    if (s.k === 'qa') {
      return `<section class="hp-section cn-sec${tint ? ' hp-section--tint' : ''}" aria-labelledby="${id || `cn-qa-${idx}`}"><div class="hp-container cn-narrow">
        ${sectionHead({ id: id || `cn-qa-${idx}`, title: s.title || 'Common questions', align: 'left' })}
        <div data-topic-group>${faq(s.items.map((x) => ({ q: x.q, a: x.a })), { id: `cn-qa${idx}`, openFirst: true })}</div>
      </div></section>`;
    }
    const body = s.blocks.map(blockHtml).join('');
    if (s.img) {
      const flip = side++ % 2 === 1;
      return `<section class="hp-section cn-sec${tint ? ' hp-section--tint' : ''}"${id ? ` aria-labelledby="${id}"` : ' aria-label="About"'}><div class="hp-container cn-split${flip ? ' is-flip' : ''}">
        <div class="cn-split__txt" data-reveal>${s.title ? `<h2 class="hp-hline" id="${id}">${esc(s.title)}</h2>` : ''}<div class="hp-prose cn-prose">${body}</div></div>
        <figure class="cn-split__img" data-reveal><img src="${esc(s.img.src)}" alt="${esc(s.img.alt)}" loading="lazy" decoding="async"></figure>
      </div></section>`;
    }
    return `<section class="hp-section cn-sec cn-sec--prose${tint ? ' hp-section--tint' : ''}"${id ? ` aria-labelledby="${id}"` : ' aria-label="Overview"'}><div class="hp-container cn-two">
      ${s.title ? `<h2 class="hp-hline cn-two__h" id="${id}" data-reveal>${esc(s.title)}</h2>` : '<span></span>'}
      <div class="hp-prose cn-prose" data-reveal>${body}</div>
    </div></section>`;
  }).join('\n');
}

/** Legal pages: sticky table of contents + long-form prose. */
function legalBody(blocks: Block[]) {
  const toc: { id: string; text: string }[] = [];
  let html = '', meta = '';
  const used = new Set<string>();
  for (const b of blocks) {
    if (b.t === 'h') {
      if (!b.text || b.level === 1) continue;
      const lvl = b.level <= 2 ? 2 : 3;
      let id = slugify(b.text); while (used.has(id)) id += '-x'; used.add(id);
      if (lvl === 2) toc.push({ id, text: b.text });
      html += `<h${lvl} id="${id}">${esc(b.text)}</h${lvl}>`;
      continue;
    }
    if (b.t === 'p' && !meta && /effective date|last updated/i.test(b.text) && b.text.length < 140) { meta = b.text; continue; }
    html += blockHtml(b);
  }
  return { toc, html, meta };
}

/* ================================================================== page */
const UPPER = new Set(['vpn', 'vps', 'ssl', 'dns', 'faq']);
const titleCase = (s: string) => s.split(' ').map((w) => (UPPER.has(w.toLowerCase()) ? w.toUpperCase() : w)).join(' ');

function hostingLocations(cat: Catalog) {
  const hosting = productsFor(cat, ['hosting-usa', 'hostia-shared', 'hosting-singapore']);
  return [...new Set(hosting.map((p) => deriveSpecs(p.features, p.attributes).location).filter(Boolean))];
}

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const s = cat.settings;
  const L = whmcsLinks(cat.base);
  const slug = ctx.slug;
  const site = String(s.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const company = String(s.company || 'Desert Tech Cloud Services LLC');
  const legal = slug === 'privacy-policy' || slug === 'terms-conditions';
  const status = slug === 'status-page' || slug === 'incident-history' || slug === 'incident-post';
  const help = slug === 'help-center' || slug === 'all-topics';

  const legacy = ctx.preview ? await loadLegacyRaw(slug, true) : await loadLegacy(slug);
  const vars: Record<string, string> = { site_name: String(s.site_name || 'Globalhostia'), phone: String(s.phone || ''), email: String(s.email || ''), company, year: String(new Date().getFullYear()), whmcs_url: cat.base, cart_url: L.cart, login_url: L.login, register_url: L.register };
  // status/incident pages in the CMS hold sample template data (fake incidents and uptime), so only live links are shown there
  const blocks = legacy && !status ? clean(extract(tokens(legacy.html, vars)), legal) : [];
  const { intro, secs } = legal ? { intro: '', secs: [] as Sec[] } : model(blocks);
  const dbFaqs = legacy?.faqs || [];

  const parent = help && slug === 'all-topics' ? [{ label: 'Help Center', href: '/help-center' }] : slug === 'incident-history' || slug === 'incident-post' ? [{ label: 'System status', href: '/status-page' }] : [];
  const crumbs = [{ label: 'Home', href: '/' }, ...parent, { label: titleCase(ctx.route.title) }];
  const parts: string[] = [];
  const lds: string[] = [breadcrumbJsonLd(crumbs, site)];
  let faqItems: { q: string; a: string }[] = [];
  const css = ['content'], js = ['content'];

  /* ---------------- hero ---------------- */
  let heroVisual = '', heroImage: string | undefined, heroCtas: { label: string; href: string; variant?: 'ghost'; icon?: IconName; attrs?: string }[] = [], heroExtra = '';
  const introAsLead = !legal && !help && !status && !!intro && (ctx.route.description || '').length < 60;
  const lead = introAsLead ? intro : ctx.route.description || intro;
  if (slug === 'about') {
    heroImage = '/hp/img/content-about-office.jpg';
    const locs = hostingLocations(cat);
    heroVisual = `<div class="cn-facts" aria-label="Globalhostia at a glance">
      <dl>${[
        ['Operated by', company], ['Headquarters', 'Dubai, United Arab Emirates'],
        ['What we offer', 'Web and WordPress hosting, VPS, dedicated servers, domains, SSL and business email'],
        ...(locs.length ? [['Hosting locations to order', locs.join(', ')]] : []),
      ].map(([k, v], i) => `<div style="--i:${i}"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></div>`;
    heroCtas = [{ label: 'See our plans', href: '/web-hosting' }, { label: 'Contact us', href: '/contact', variant: 'ghost' }];
  } else if (help) {
    heroExtra = `<form class="cn-search" role="search" data-topic-search><label class="sr-only" for="cn-q">Search help topics</label>${icon('search')}<input id="cn-q" type="search" class="hp-input" placeholder="Search topics, like DNS or backups" autocomplete="off"><a class="hp-btn hp-btn--brand" href="${esc(L.knowledgebase)}">Knowledge base</a></form>`;
    heroCtas = [];
    heroImage = '/hp/img/content-help.jpg';
  } else if (status) {
    heroCtas = [{ label: 'Open live network status', href: `${cat.base}/serverstatus.php`, icon: 'activity' }, { label: 'Announcements', href: L.announcements, variant: 'ghost' }];
    heroVisual = `<div class="cn-pulse" aria-hidden="true"><svg viewBox="0 0 400 120"><path class="cn-pulse__base" d="M0 60H400"/><path class="cn-pulse__line" pathLength="100" d="M0 60H120L140 60L152 28L166 96L180 44L192 70L204 60H400"/></svg><span class="cn-pulse__lbl">${icon('activity')}Live checks run in our client area</span></div>`;
  } else if (slug === 'network') {
    const locs = hostingLocations(cat);
    heroVisual = `<div class="cn-facts" aria-label="Locations at a glance"><dl>${[
      ...(locs.length ? [['Shared hosting', locs.join(', ')]] : []),
      ['Server datacenters', 'USA, Brazil, Algeria (EU), South Africa, India and Russia'],
      ['Support and operations', 'Dubai, United Arab Emirates'],
    ].map(([k, v], i) => `<div style="--i:${i}"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></div>`;
    heroCtas = [{ label: 'Choose a hosting location', href: '/web-hosting' }, { label: 'Dedicated servers', href: '/dedicated-servers', variant: 'ghost' }];
  } else if (slug === 'start-vpn') {
    heroCtas = [{ label: 'See VPS plans', href: '#plans' }, { label: 'Talk to sales', href: '/contact', variant: 'ghost' }];
  } else if (slug === 'website-builder') {
    heroCtas = [{ label: 'See hosting plans', href: '#plans' }, { label: 'Ask about the builder', href: '/contact', variant: 'ghost' }];
  } else if (!legal) {
    heroCtas = [{ label: 'Contact us', href: '/contact' }];
  }

  let meta = '';
  let legalHtml = '';
  if (legal) {
    const lb = legalBody(blocks);
    meta = lb.meta;
    if (lb.html) {
      legalHtml = `<section class="hp-section cn-legal" aria-label="${esc(ctx.route.title)}"><div class="hp-container cn-legal__grid">
        ${lb.toc.length ? `<nav class="cn-toc" aria-label="On this page"><p class="cn-toc__h">On this page</p><ol>${lb.toc.map((t) => `<li><a href="#${esc(t.id)}">${esc(t.text)}</a></li>`).join('')}</ol></nav>` : '<span></span>'}
        <article class="hp-prose cn-article" data-legal>${lb.html}</article>
      </div></section>`;
    }
  }

  parts.push(pageHero({
    crumbs, eyebrow: legal ? 'Legal' : help ? 'Help Center' : status ? 'Status' : slug === 'about' ? 'About us' : undefined,
    title: titleCase(ctx.route.title), lead: legal ? (meta || lead) : lead, ctas: heroCtas, visualHtml: heroVisual || undefined, image: heroImage,
  }).replace(/(<\/h1>[\s\S]*?<\/p>)/, `$1${heroExtra}`));

  /* ---------------- body by slug ---------------- */
  if (legal) {
    parts.push(legalHtml || `<section class="hp-section"><div class="hp-container cn-narrow"><p class="hp-lead">This page is being updated. For a copy, contact us at ${esc(String(s.email || 'our support team'))}.</p></div></section>`);
    faqItems = [];
  } else if (help) {
    // topic cards: card groups from the legacy page become knowledge-base topics; questions become the FAQ
    const qa = secs.filter((x) => x.k === 'qa') as Extract<Sec, { k: 'qa' }>[];
    const rest = secs.filter((x) => x.k !== 'qa');
    faqItems = qa.flatMap((x) => x.items);
    const channels: FeatureItem[] = [
      { icon: 'ticket', title: 'Open a ticket', text: 'Tickets reach the right team with your services attached, and you can follow every reply.' },
      { icon: 'book', title: 'Knowledge base', text: 'Step-by-step guides for hosting, domains, email and servers, available any time.' },
      { icon: 'chat', title: 'WhatsApp and phone', text: 'Quick questions, quotes and urgent issues, with the same team behind every channel.' },
    ];
    parts.push(`<section class="hp-section hp-section--tight" aria-labelledby="cn-ch-h"><div class="hp-container">${sectionHead({ id: 'cn-ch-h', title: 'Three ways to get help' })}${featureGrid(channels)}<div class="cn-actions">${button({ label: 'Open a support ticket', href: L.ticket, icon: 'ticket' })}${button({ label: 'Browse the knowledge base', href: L.knowledgebase, variant: 'ghost', icon: 'book' })}</div></div></section>`);
    const isTopics = (x: Sec) => x.k === 'cards' && x.items.length >= 3 && !x.items.every((i) => /ticket|knowledge|expert|24\/7/i.test(i.title));
    let topics = rest.filter(isTopics).flatMap((x) => (x as Extract<Sec, { k: 'cards' }>).items);
    if (slug === 'help-center') {
      // the help center shows the most useful topics from the full topic list
      const all = await loadLegacy('all-topics');
      if (all) topics = [...topics, ...model(clean(extract(tokens(all.html, vars)), false)).secs.filter(isTopics).flatMap((x) => (x as Extract<Sec, { k: 'cards' }>).items)];
      topics = topics.slice(0, 9);
    }
    if (topics.length) parts.push(renderSecs([{ k: 'cards', title: slug === 'help-center' ? 'Popular support topics' : 'Browse every support topic', lead: 'Type in the search box above to filter. Each topic opens our knowledge base, where the full guides live.', items: topics }], { topics: true, kb: L.knowledgebase }));
    else parts.push(`<section class="hp-section hp-section--tint"><div class="hp-container">${sectionHead({ title: 'Popular guides', lead: 'Step-by-step guides live in our knowledge base.' })}<div class="cn-actions">${button({ label: 'Open the knowledge base', href: L.knowledgebase, icon: 'book' })}</div></div></section>`);
    if (slug === 'help-center' && topics.length) parts.push(`<div class="hp-container cn-more">${link('See all support topics', '/all-topics')}</div>`);
  } else if (status) {
    const svc: [IconName, string, string][] = [
      ['globe', 'Web hosting', 'Shared and WordPress hosting servers and control panels'],
      ['cloud', 'VPS and cloud', 'Virtual servers and their management panel'],
      ['server', 'Dedicated servers', 'Bare-metal servers and their network'],
      ['mail', 'Email', 'Incoming and outgoing mail for hosted domains'],
      ['at', 'Domains and DNS', 'Registrations, renewals and nameservers'],
      ['card', 'Client area and billing', 'Sign-in, orders, invoices and tickets'],
    ];
    parts.push(`<section class="hp-section" aria-labelledby="cn-svc-h"><div class="hp-container">
      ${sectionHead({ id: 'cn-svc-h', title: slug === 'status-page' ? 'Service status' : slug === 'incident-history' ? 'Where to find incident reports' : 'Incident updates', lead: 'Live status and incident reports are published in our client area, where checks run against our servers. Open it for the current state of each service.' })}
      <ul class="cn-status" data-stagger>${svc.map(([ic, t, d]) => `<li data-reveal><a href="${esc(`${cat.base}/serverstatus.php`)}">${hexIcon(ic)}<span><b>${esc(t)}</b><small>${esc(d)}</small></span><span class="cn-status__st">See live status${icon('external')}</span></a></li>`).join('')}</ul>
      <div class="cn-actions">${button({ label: 'Open live network status', href: `${cat.base}/serverstatus.php`, icon: 'activity' })}${button({ label: 'Read announcements', href: L.announcements, variant: 'ghost' })}${slug !== 'incident-history' ? link('Incident history', '/incident-history') : link('Current status', '/status-page')}</div>
    </div></section>`);
    parts.push(`<section class="hp-section hp-section--tint" aria-labelledby="cn-rep-h"><div class="hp-container cn-two">
      <h2 class="hp-hline cn-two__h" id="cn-rep-h">Reporting a problem</h2>
      <div class="hp-prose cn-prose"><p>If something is not working for you and it is not listed on the live status page, open a support ticket with the domain or server affected and what you see. Our engineers check it and post an update in the ticket.</p><p>Planned maintenance is announced in advance in our client area announcements.</p><p>${link('Open a support ticket', L.ticket)}</p></div>
    </div></section>`);
    parts.push(`<section class="hp-section hp-section--dark hp-on-dark" aria-label="Datacenters"><div class="hp-container">${dcMap({ title: 'Datacenters we monitor' })}</div></section>`);
    faqItems = [
      { q: 'Where can I see the current status of my service?', a: 'Open the live network status page in our client area. It lists every server we monitor and any open incident or maintenance.' },
      { q: 'How will I know about planned maintenance?', a: 'Planned maintenance is posted in the client area announcements before it starts, with the services affected and the expected time.' },
      { q: 'My website is down but the status page shows everything is up.', a: 'The problem may be specific to your account or domain. Open a support ticket with the domain name and what you see, and an engineer will check it.' },
      { q: 'Do I get notified about incidents?', a: 'Updates on incidents that affect your services are posted on the status page and in your support tickets. You can follow them from your client area.' },
    ];
  } else {
    if (slug === 'about') {
      const ranges = new Set(cat.products.map((p) => p.categorySlug)).size;
      const locs = hostingLocations(cat);
      parts.push(`<section class="hp-section hp-section--tight" aria-label="Globalhostia in numbers"><div class="hp-container">${statRow([
        { value: String(cat.products.length), label: 'Plans you can order today, priced live from our billing system' },
        { value: String(ranges), label: 'Product ranges, from shared hosting to dedicated servers' },
        { value: String(pricedTlds(cat).length || 0), label: 'Domain extensions with published prices' },
        { value: '24/7', label: 'Support by phone, email, WhatsApp and ticket' },
      ].filter((x) => x.value !== '0'), { light: true, cols: 4 })}${locs.length ? `<p class="cn-note">Shared hosting is available to order in ${esc(locs.join(', '))}.</p>` : ''}</div></section>`);
    }
    if (slug === 'network') {
      const locs = hostingLocations(cat);
      parts.push(`<section class="hp-section" aria-labelledby="cn-net-h"><div class="hp-container cn-netgrid">
        <div>${splitHead({ id: 'cn-net-h', title: 'Where your services run', lead: 'Pick the location closest to your visitors when you order. Support and operations for every location are run from Dubai.' })}
        ${locs.length ? `<h3 class="cn-loc-h">Shared hosting locations</h3><ul class="cn-locs">${locs.map((l) => `<li>${icon('pin')}${esc(l)}</li>`).join('')}</ul>` : ''}
        <h3 class="cn-loc-h">Server datacenters</h3><ul class="cn-locs">${['USA', 'Brazil', 'Algeria (EU)', 'South Africa', 'India', 'Russia'].map((l) => `<li>${icon('server')}${esc(l)}</li>`).join('')}</ul></div>
        ${dcMap()}
      </div></section>`);
    }
    if (intro && !introAsLead && !secs.some((x) => x.k === 'prose' && x.blocks.some((b) => b.t === 'p' && b.text === intro))) secs.unshift({ k: 'prose', title: undefined, blocks: [{ t: 'p', html: esc(intro), text: intro }] });
    // the first untitled prose section reads as an introduction
    if (slug === 'about') {
      const first = secs.find((x) => x.k === 'prose' && x.title);
      if (first && first.k === 'prose' && !first.img) first.img = { src: '/hp/img/content-about-team.jpg', alt: 'Two engineers working at their desks' };
    }
    parts.push(renderSecs(secs.filter((x) => x.k !== 'qa')));
    faqItems = secs.filter((x) => x.k === 'qa').flatMap((x) => (x as Extract<Sec, { k: 'qa' }>).items);
    if (slug === 'about') {
      parts.push(`<section class="hp-section" aria-labelledby="cn-val-h"><div class="hp-container">${splitHead({ id: 'cn-val-h', title: 'How we work', lead: 'What you can expect from us, whichever plan you choose.' })}${featureGrid([
        { icon: 'coin', title: 'Prices you can check', text: 'Every price on this site comes straight from our billing system, including renewal prices.' },
        { icon: 'headset', title: 'People, not scripts', text: 'Our own engineers answer tickets, calls and WhatsApp messages, at any hour.' },
        { icon: 'pin', title: 'Your choice of location', text: 'Host where your customers are, and know which datacenter your data lives in.' },
        { icon: 'shield', title: 'Secure by default', text: 'Free SSL on hosting plans and HTTPS across our client area.' },
        { icon: 'archive', title: 'Backups included', text: 'Daily and weekly backups on hosting plans, so a mistake is never final.' },
        { icon: 'move', title: 'Help moving in', text: 'We migrate websites, email and databases from your previous host.' },
      ])}</div></section>`);
      parts.push(`<section class="hp-section hp-section--dark hp-on-dark" aria-label="Datacenter network"><div class="hp-container">${dcMap()}</div></section>`);
    }
    if (slug === 'start-vpn' || slug === 'website-builder') {
      const prods = slug === 'start-vpn' ? productsFor(cat, ['hostiavps']) : productsFor(cat, ['hosting-usa', 'hostia-shared', 'hosting-singapore']);
      const from = minFrom(prods, cat.currency);
      parts.push(`<section class="hp-section" id="plans" aria-labelledby="cn-plans-h"><div class="hp-container">
        ${sectionHead({ id: 'cn-plans-h', title: slug === 'start-vpn' ? 'VPS plans to run your VPN' : 'Hosting plans for your new website', lead: slug === 'start-vpn' ? 'Run your own VPN, such as WireGuard or OpenVPN, on a VPS with full root access. Choose Linux or Windows.' : `Every plan includes free SSL and backups${from ? `, from ${fmt(from.price, from.prefix)}` : ''}. Ask our team which website builder tools are available on your plan.` })}
        ${planCards(prods, { currency: cat.currency, base: cat.base, groupBy: slug === 'start-vpn' ? 'os' : 'location', groupLabel: slug === 'start-vpn' ? 'Operating system' : 'Hosting location', id: 'cn-plans' })}
      </div></section>`);
    }
  }

  /* ---------------- FAQ ---------------- */
  if (!faqItems.length) faqItems = dbFaqs.filter((x) => !JUNK.test(x.q + x.a));
  else if (dbFaqs.length) faqItems = [...faqItems, ...dbFaqs.filter((d) => !faqItems.some((f) => f.q === d.q))];
  faqItems = faqItems.filter((x) => x.a.length > 10).map((x) => ({ q: x.q, a: x.a.replace(/\s*\.\.\.$/, '.') })).slice(0, 10);
  if (faqItems.length && !legal) {
    parts.push(`<section class="hp-section${help ? ' hp-section--tint' : ''}" aria-labelledby="cn-faq-h"><div class="hp-container cn-narrow">
      ${sectionHead({ id: 'cn-faq-h', title: help ? 'Quick answers' : 'Frequently asked questions', align: 'left' })}
      <div data-topic-group>${faq(faqItems, { id: 'cn-faq', single: true })}</div>
      ${help ? '<p class="cn-nomatch" data-topic-empty-faq hidden>No answers match your search.</p>' : ''}
    </div></section>`);
    lds.push(faqJsonLd(faqItems));
  }

  /* ---------------- CTA ---------------- */
  const cta = legal
    ? ctaBand({ title: 'Questions about this policy?', text: 'Contact our team and we will answer, or point you to the right document.', primary: { label: 'Contact us', href: '/contact' }, secondary: { label: 'Open a ticket', href: L.ticket } })
    : help || status
      ? ctaBand({ title: 'Still need help?', text: 'Open a ticket and an engineer will pick it up, or call us for anything urgent.', primary: { label: 'Open a support ticket', href: L.ticket }, secondary: { label: 'Contact us', href: '/contact' } })
      : ctaBand({ title: slug === 'about' ? 'Host with a team that answers' : 'Ready to get started?', text: 'Compare plans and order online in minutes, or talk to our team first.', primary: { label: 'Compare hosting plans', href: '/web-hosting' }, secondary: { label: 'Talk to sales', href: '/contact' } });
  parts.push(cta);

  if (slug === 'about') lds.push(ld({ '@context': 'https://schema.org', '@type': 'AboutPage', name: ctx.route.title, url: `${site}/about` }));
  if (legal) lds.push(ld({ '@context': 'https://schema.org', '@type': 'WebPage', name: ctx.route.title, url: `${site}/${slug}`, ...(meta.match(/Last Updated:\s*([A-Za-z]+ \d{1,2}, \d{4})/i) ? { dateModified: new Date(meta.match(/Last Updated:\s*([A-Za-z]+ \d{1,2}, \d{4})/i)![1]).toISOString().slice(0, 10) } : {}) }));

  return page({
    ctx, catalog: cat, path: `/${slug}`, title: ctx.route.title, description: ctx.route.description,
    css, js, jsonLd: lds, preload: heroImage ? [heroImage] : undefined,
    body: parts.join('\n'),
  });
}
