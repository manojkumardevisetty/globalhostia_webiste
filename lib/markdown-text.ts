// Dependency-free Markdown text helpers (safe to import in client components).

/** Plain text of a Markdown body (for excerpts, word counts and search). */
export function markdownText(md: string) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/^\|?\s*:?-{3,}.*$/gm, ' ')
    .replace(/[|*_`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const wordCount = (md: string) => { const t = markdownText(md); return t ? t.split(' ').length : 0; };
/** Reading time at ~220 words per minute, at least 1 minute. */
export const readingMinutes = (md: string) => Math.max(1, Math.round(wordCount(md) / 220));

/** First ~160 characters of the body, cut on a word boundary. */
export function autoExcerpt(md: string, max = 160) {
  const t = markdownText(md);
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).replace(/[\s,;:.-]+$/, '') + '…';
}
