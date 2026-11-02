// Markdown → safe HTML for blog posts (server side: theme pages, admin live preview).
// marked renders, sanitize-html whitelists the output, so raw HTML pasted into a post can't inject scripts.
import { Marked, type Tokens } from 'marked';
import sanitizeHtml from 'sanitize-html';

export type TocItem = { id: string; text: string };
export type Rendered = { html: string; toc: TocItem[] };

const SITE_HOSTS = /^(https?:)?\/\/(www\.)?globalhostia\.com(\/|$)/i;

const plain = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const anchor = (s: string) => plain(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'section';

/** Render Markdown to sanitized HTML plus a table of contents built from the H2 headings. */
export function renderMarkdown(md: string): Rendered {
  const toc: TocItem[] = [];
  const used = new Map<string, number>();
  const uniq = (base: string) => { const n = used.get(base) || 0; used.set(base, n + 1); return n ? `${base}-${n + 1}` : base; };
  const m = new Marked({ gfm: true, breaks: false });
  m.use({
    renderer: {
      heading(this: any, t: Tokens.Heading) {
        const inner = this.parser.parseInline(t.tokens);
        // the page title is the only <h1>: body headings start at h2
        const depth = Math.min(Math.max(t.depth, 2), 4);
        const id = uniq(anchor(inner));
        if (depth === 2) toc.push({ id, text: plain(inner) });
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
      },
    },
  });
  const raw = m.parse(String(md || ''), { async: false }) as string;
  const html = sanitizeHtml(raw, {
    allowedTags: ['h2', 'h3', 'h4', 'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'del', 's', 'u', 'mark', 'sub', 'sup', 'small', 'a', 'img', 'figure', 'figcaption',
      'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'kbd', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'details', 'summary', 'abbr', 'span'],
    allowedAttributes: {
      h2: ['id'], h3: ['id'], h4: ['id'], a: ['href', 'title', 'rel', 'target'], img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
      code: ['class'], th: ['align', 'scope'], td: ['align'], ol: ['start'], abbr: ['title'],
    },
    allowedClasses: { code: [/^language-[a-z0-9+#-]+$/i] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tag, attribs) => {
        const href = attribs.href || '';
        const external = /^https?:\/\//i.test(href) && !SITE_HOSTS.test(href);
        return { tagName: 'a', attribs: external ? { ...attribs, rel: 'noopener noreferrer', target: '_blank' } : { href, ...(attribs.title ? { title: attribs.title } : {}) } };
      },
      img: (tag, attribs) => ({ tagName: 'img', attribs: { ...attribs, alt: attribs.alt || '', loading: 'lazy', decoding: 'async' } }),
      th: (tag, attribs) => ({ tagName: 'th', attribs: { ...attribs, scope: 'col' } }),
    },
  });
  // wide tables scroll inside their own box instead of widening the page
  return { html: html.replace(/<table>/g, '<div class="bl-table" tabindex="0" role="region" aria-label="Table"><table>').replace(/<\/table>/g, '</table></div>'), toc };
}

export { markdownText, wordCount, readingMinutes, autoExcerpt } from './markdown-text';
