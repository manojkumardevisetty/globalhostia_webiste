// HTML -> Markdown for the agent-readable version of every public page (<url>.md, or Accept: text/markdown).
// Small dependency-free converter for our own server-rendered markup: takes <main>, drops scripts, styles, SVG,
// forms, buttons and aria-hidden decoration, and keeps headings, paragraphs, lists, links, tables and code.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const SKIP = new Set(['script', 'style', 'svg', 'noscript', 'template', 'form', 'button', 'select', 'textarea', 'iframe', 'video', 'audio', 'canvas', 'dialog', 'nav']);
const BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'aside', 'main', 'figure', 'figcaption', 'blockquote', 'details', 'summary', 'dl', 'dt', 'dd', 'address', 'fieldset']);

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', mdash: '—', ndash: '–', hellip: '…', copy: '©', reg: '®', trade: '™', rarr: '→', larr: '←', times: '×', check: '✓' };
export const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
  return ENT[e.toLowerCase()] ?? m;
});
const attr = (tag: string, name: string) => { const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')); return m ? decode(m[2] ?? m[3] ?? m[4] ?? '') : null; };

export function htmlToMarkdown(html: string, site: string) {
  const m = html.match(/<main\b[^>]*>([\s\S]*)<\/main>/i);
  const src = m ? m[1] : (html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html);
  const abs = (u: string) => { try { return new URL(u, site + '/').toString(); } catch { return u; } };
  const out: string[] = [];
  const links: { at: number; href: string }[] = [];
  const lists: { ordered: boolean; n: number }[] = [];
  let skip: { tag: string; depth: number } | null = null;
  let pre = 0, row = 0, cells = 0, firstRow = true;
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>|([^<]+)/g;
  let t: RegExpExecArray | null;
  while ((t = re.exec(src))) {
    if (t[0].startsWith('<!--')) continue;
    const text = t[4];
    if (text !== undefined) {
      if (skip) continue;
      const s = decode(text);
      out.push(pre ? s : s.replace(/\s+/g, ' '));
      continue;
    }
    const close = t[1] === '/', tag = t[2].toLowerCase(), rest = t[3] || '';
    if (skip) {
      if (tag === skip.tag && !VOID.has(tag) && !rest.endsWith('/')) skip.depth += close ? -1 : 1;
      if (skip.depth === 0) skip = null;
      continue;
    }
    if (!close && (SKIP.has(tag) || /\saria-hidden\s*=\s*["']?true/i.test(rest) || /\shidden(\s|=|$)/i.test(rest) || /class\s*=\s*["'][^"']*\b(hp-progress|hp-skip|sr-skip)\b/.test(rest))) {
      if (!VOID.has(tag) && !rest.endsWith('/')) skip = { tag, depth: 1 };
      continue;
    }
    switch (tag) {
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        out.push(close ? '\n\n' : `\n\n${'#'.repeat(+tag[1])} `); break;
      case 'br': out.push(pre ? '\n' : '  \n'); break;
      case 'hr': out.push('\n\n---\n\n'); break;
      case 'ul': case 'ol':
        if (close) { lists.pop(); out.push('\n\n'); } else { lists.push({ ordered: tag === 'ol', n: 0 }); out.push('\n'); }
        break;
      case 'li':
        if (!close) { const l = lists[lists.length - 1]; const ind = '  '.repeat(Math.max(lists.length - 1, 0)); out.push(`\n${ind}${l?.ordered ? `${++l.n}.` : '-'} `); }
        break;
      case 'a':
        if (!close) links.push({ at: out.length, href: attr(t[0], 'href') || '' });
        else {
          const l = links.pop();
          if (l) {
            const inner = out.splice(l.at).join('').replace(/\s+/g, ' ').trim();
            const href = l.href && !/^(javascript:|#$)/i.test(l.href) ? (l.href.startsWith('#') || /^(mailto|tel):/i.test(l.href) ? l.href : abs(l.href)) : '';
            out.push(inner ? (href ? `[${inner.replace(/[[\]]/g, '')}](${href})` : inner) : '');
          }
        }
        break;
      case 'strong': case 'b': out.push('**'); break;
      case 'em': out.push('_'); break;
      case 'code': if (!pre) out.push('`'); break;
      case 'pre': if (close) { pre--; out.push('\n```\n\n'); } else { pre++; out.push('\n\n```\n'); } break;
      case 'img': { const alt = attr(t[0], 'alt'); const s = attr(t[0], 'src'); if (alt && s && !close) out.push(`![${alt.replace(/[[\]]/g, '')}](${abs(s)})`); break; }
      case 'table': if (!close) { firstRow = true; out.push('\n\n'); } else out.push('\n\n'); break;
      case 'tr':
        if (!close) { row++; cells = 0; out.push('\n|'); }
        else { if (firstRow && cells) { out.push('\n|' + ' --- |'.repeat(cells)); firstRow = false; } }
        break;
      case 'td': case 'th': if (close) { out.push(' |'); cells++; } else out.push(' '); break;
      default:
        if (BLOCK.has(tag)) out.push(tag === 'div' ? '\n' : '\n\n');
    }
  }
  void row;
  return out.join('')
    .replace(/\*\*\s*\*\*/g, '').replace(/(^|\s)_\s*_(?=\s|$)/g, '$1').replace(/``/g, '')
    .replace(/\[\]\([^)]*\)/g, '')
    .split('\n').map((l) => (l.startsWith('    ') && !/^\s*([-*]|\d+\.)\s/.test(l) ? l.trim() : l.replace(/[ \t]+$/g, '').replace(/^[ \t]+(?![-*]|\d+\.)/, ''))).join('\n')
    .replace(/^(#{1,6}) +\n/gm, '').replace(/^\s*[-*]\s*$/gm, '').replace(/^\|\s*\|$/gm, '')
    .replace(/\n{3,}/g, '\n\n').trim();
}

/** Front matter + body for one page. */
export function pageMarkdown(html: string, url: string, site: string) {
  const title = decode(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '').trim();
  const desc = decode(html.match(/<meta name="description" content="([^"]*)"/i)?.[1] || '').trim();
  const y = (s: string) => JSON.stringify(s);
  return `---\ntitle: ${y(title)}\nurl: ${y(url)}\n${desc ? `description: ${y(desc)}\n` : ''}source: "GlobalHostia; prices are synced from the billing system and exclude any taxes shown at checkout"\n---\n\n${htmlToMarkdown(html, site)}\n`;
}

/** Does the Accept header prefer Markdown over HTML? (q-values honoured; ties go to Markdown) */
export function wantsMarkdown(accept: string | null) {
  if (!accept || !/text\/markdown/i.test(accept)) return false;
  const q = (type: string) => {
    let best = -1;
    for (const part of accept.split(',')) {
      const [t, ...ps] = part.trim().split(';');
      if (t.trim().toLowerCase() !== type) continue;
      const qp = ps.map((p) => p.trim()).find((p) => p.startsWith('q='));
      best = Math.max(best, qp ? parseFloat(qp.slice(2)) || 0 : 1);
    }
    return best;
  };
  return q('text/markdown') > 0 && q('text/markdown') >= q('text/html');
}

/** Markdown URL for a page path: "/" -> "/index.md", "/web-hosting" -> "/web-hosting.md". */
export const mdPath = (path: string) => (!path || path === '/' ? '/index.md' : path.replace(/\/+$/, '') + '.md');
