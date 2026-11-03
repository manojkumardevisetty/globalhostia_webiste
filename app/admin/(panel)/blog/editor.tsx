'use client';
import { useActionState, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { savePost, previewMarkdown, checkSlug, type SaveState } from './actions';
import { autoExcerpt, readingMinutes, wordCount } from '@/lib/markdown-text';
import { Icon } from '@/components/icons';

export type EditorPost = {
  id: string; title: string; slug: string; excerpt: string; body: string; coverImage: string; coverAlt: string; category: string; tags: string;
  author: string; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; publishAt: string; featured: boolean; seoTitle: string; seoDescription: string;
  ogImage: string; canonical: string; updatedAt: string;
  coverStyle: 'branded' | 'plain' | 'hex'; takeaways: string; relatedProducts: string[]; focusKeyword: string; secondaryKeywords: string;
  /** content engine: '' | uae | global (blog collections) and the article language (Arabic renders right-to-left) */
  track: '' | 'uae' | 'global'; lang: 'en' | 'ar';
};
export type EditorCatalog = { categories: { slug: string; name: string; count: number }[]; products: { slug: string; name: string; category: string }[] };

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90).replace(/-+$/, '');
const pad = (n: number) => String(n).padStart(2, '0');
/** ISO → value for <input type="datetime-local"> in the browser's time zone */
const toLocal = (iso: string) => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : '');
const isImg = (u: string) => /^(https?:\/\/|\/)\S+$/i.test(u);

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="card">
      <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <h2 className="text-[14px] font-semibold text-slate-900">{title}</h2>{aside}
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}
function Label({ htmlFor, children, hint, counter }: { htmlFor: string; children: ReactNode; hint?: ReactNode; counter?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-end justify-between gap-2">
      <label htmlFor={htmlFor} className="field-label mb-0">{children}{hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}</label>
      {counter}
    </div>
  );
}
function Count({ n, ideal, max }: { n: number; ideal: [number, number]; max: number }) {
  const tone = n === 0 ? 'text-slate-400' : n > max ? 'text-red-600' : n < ideal[0] || n > ideal[1] ? 'text-amber-600' : 'text-emerald-600';
  return <span className={`text-[11.5px] font-medium tabular-nums ${tone}`} aria-live="polite">{n} / {ideal[1]}</span>;
}

/* ---------- SEO checklist (runs in the browser on every keystroke) ---------- */
const norm = (t: string) => ' ' + t.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ').trim() + ' ';
const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'and', 'or', 'for', 'in', 'on', 'vs', 'your', 'my', 'is', 'how', 'what']);
type Check = { ok: boolean; label: string; hint: string; kw?: boolean };
function seoChecks(f: EditorPost, autoEx: string, words: number): Check[] {
  const kw = f.focusKeyword.trim();
  const has = (t: string) => !!kw && norm(t).includes(norm(kw));
  const body = f.body;
  const first = body.split(/\n\s*\n/).map((b) => b.trim()).find((b) => b && !/^(#|!\[|\||>|```|[-*]\s|\d+\.\s)/.test(b)) || '';
  const h2s = body.split('\n').filter((l) => /^##\s+/.test(l));
  const imgs = [...body.matchAll(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g)];
  const links = [...body.matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)].map((m) => m[1]);
  const internal = links.filter((u) => u.startsWith('/') || /^https?:\/\/(www\.)?globalhostia\.com/i.test(u)).length;
  const external = links.filter((u) => /^https?:\/\//i.test(u) && !/^https?:\/\/(www\.)?globalhostia\.com/i.test(u)).length;
  const alts = [...imgs.map((m) => m[1].trim()), ...(f.coverImage ? [f.coverAlt.trim()] : [])];
  const kwWords = norm(kw).trim().split(' ').filter((w) => w && !STOP.has(w));
  const slugWords = new Set(f.slug.split('-'));
  const title = (f.seoTitle || f.title).trim();
  const desc = (f.seoDescription || f.excerpt || autoEx).trim();
  return [
    { kw: true, ok: has(f.seoTitle || f.title) || has(f.title), label: 'Focus keyword in the title', hint: 'Use the exact phrase in the title or SEO title.' },
    { kw: true, ok: !!kw && kwWords.length > 0 && kwWords.every((w) => slugWords.has(w)), label: 'Focus keyword in the URL', hint: 'Every main word of the keyword should be in the URL.' },
    { kw: true, ok: has(first), label: 'Focus keyword in the first paragraph', hint: 'Mention it naturally in the opening paragraph.' },
    { kw: true, ok: h2s.some((h) => has(h)), label: 'Focus keyword in a section heading', hint: 'Use it in at least one ## heading.' },
    { kw: true, ok: has(desc), label: 'Focus keyword in the meta description', hint: 'Include it in the meta description (or summary).' },
    { kw: true, ok: alts.some((a) => has(a)), label: 'Focus keyword in an image description', hint: 'Describe one image using the keyword, where it fits.' },
    { ok: words >= 900, label: `At least 900 words (${words.toLocaleString()})`, hint: 'In-depth guides tend to rank better.' },
    { ok: internal >= 3, label: `3+ links to our own pages (${internal})`, hint: 'Link to related plans, guides and posts, e.g. [web hosting](/web-hosting).' },
    { ok: external >= 2, label: `2+ links to trusted sources (${external})`, hint: 'Cite official documentation, e.g. Google, Microsoft, Cloudflare, ICANN.' },
    { ok: alts.length > 0 && alts.every(Boolean), label: alts.length ? `Every image has a description (${alts.filter(Boolean).length}/${alts.length})` : 'Add at least one image', hint: 'Write alt text for the cover and every image: ![description](url).' },
    { ok: title.length >= 50 && title.length <= 60, label: `SEO title 50–60 characters (${title.length})`, hint: 'Shorter titles waste space, longer ones get cut off.' },
    { ok: desc.length >= 140 && desc.length <= 160, label: `Meta description 140–160 characters (${desc.length})`, hint: 'Long enough to persuade, short enough not to be cut off.' },
  ];
}

type Tool = { key: string; label: string; icon: ReactNode; run: () => void; kbd?: string };

export default function PostEditor({ post, catalog, categories, authors, siteUrl, siteName }: { post: EditorPost; catalog: EditorCatalog; categories: string[]; authors: string[]; siteUrl: string; siteName: string }) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(savePost, {});
  const [f, setF] = useState(post);
  const [slugTouched, setSlugTouched] = useState(!!post.id);
  const [publishLocal, setPublishLocal] = useState('');
  const [tz, setTz] = useState('');
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<'write' | 'preview' | 'split'>('split');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [slugMsg, setSlugMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [coverErr, setCoverErr] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const [pq, setPq] = useState('');
  const toggleRel = (ref: string) => set('relatedProducts', f.relatedProducts.includes(ref) ? f.relatedProducts.filter((x) => x !== ref) : [...f.relatedProducts, ref]);
  const relLabel = (ref: string) => { const [k, sl] = ref.split(':'); return k === 'cat' ? `${catalog.categories.find((c) => c.slug === sl)?.name || sl} (all plans)` : catalog.products.find((x) => x.slug === sl)?.name || sl; };
  const prodMatches = pq.trim() ? catalog.products.filter((x) => `${x.name} ${x.category}`.toLowerCase().includes(pq.trim().toLowerCase())).slice(0, 40) : [];

  // browser-only values (time zone) after mount, to avoid hydration mismatches
  useEffect(() => {
    setPublishLocal(toLocal(post.publishAt));
    const off = -new Date().getTimezoneOffset() / 60;
    setTz(`${Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time'} (UTC${off >= 0 ? '+' : ''}${off})`);
    if (window.matchMedia('(max-width: 1279px)').matches) setView('write');
  }, [post.publishAt]);

  const set = <K extends keyof EditorPost>(k: K, v: EditorPost[K]) => { setF((o) => ({ ...o, [k]: v })); setDirty(true); };
  const setTitle = (v: string) => { setF((o) => ({ ...o, title: v, slug: slugTouched ? o.slug : slugify(v) })); setDirty(true); };

  // warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty || pending) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty, pending]);

  // live preview (server renders with the same sanitizer as the website)
  useEffect(() => {
    if (view === 'write') return;
    let alive = true;
    setPreviewBusy(true);
    const t = setTimeout(() => {
      previewMarkdown(f.body).then((h) => { if (alive) { setPreviewHtml(h); setPreviewBusy(false); } }).catch(() => { if (alive) setPreviewBusy(false); });
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [f.body, view]);

  // slug availability
  useEffect(() => {
    if (!f.slug) { setSlugMsg(null); return; }
    if (f.slug === post.slug && post.id) { setSlugMsg(null); return; }
    let alive = true;
    const t = setTimeout(() => { checkSlug(f.slug, post.id).then((r) => alive && setSlugMsg(r)).catch(() => {}); }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [f.slug, post.id, post.slug]);

  useEffect(() => { setCoverErr(false); }, [f.coverImage]);

  const words = useMemo(() => wordCount(f.body), [f.body]);
  const minutes = useMemo(() => readingMinutes(f.body), [f.body]);
  const autoEx = useMemo(() => autoExcerpt(f.body), [f.body]);
  const checks = useMemo(() => seoChecks(f, autoEx, words), [f, autoEx, words]);
  const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
  const scoreTone = score >= 80 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : 'text-red-600';

  const publishIso = fromLocal(publishLocal);
  const future = !!publishIso && Date.parse(publishIso) > Date.now();
  const wasLive = post.status === 'PUBLISHED' && (!post.publishAt || Date.parse(post.publishAt) <= Date.now());
  const saveLabel = f.status === 'PUBLISHED' ? (future ? 'Schedule post' : wasLive ? 'Update live post' : 'Publish now') : f.status === 'ARCHIVED' ? 'Save (archived)' : 'Save draft';
  const stateText = f.status === 'PUBLISHED' ? (future ? `Goes live on ${new Date(publishIso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Visible to everyone after saving') : f.status === 'ARCHIVED' ? 'Hidden from the website' : 'Only admins can see it';

  /* ---------- markdown toolbar ---------- */
  const edit = (fn: (v: string, a: number, b: number) => { v: string; a: number; b: number }) => {
    const el = ta.current; if (!el) return;
    const r = fn(f.body, el.selectionStart, el.selectionEnd);
    set('body', r.v);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(r.a, r.b); });
  };
  const wrap = (pre: string, post2 = pre, placeholder = 'text') => edit((v, a, b) => {
    const sel = v.slice(a, b) || placeholder;
    return { v: v.slice(0, a) + pre + sel + post2 + v.slice(b), a: a + pre.length, b: a + pre.length + sel.length };
  });
  const linePrefix = (prefix: string | ((i: number) => string)) => edit((v, a, b) => {
    const start = v.lastIndexOf('\n', a - 1) + 1;
    const endIdx = v.indexOf('\n', b); const end = endIdx === -1 ? v.length : endIdx;
    const lines = v.slice(start, end).split('\n');
    const out = lines.map((l, i) => { const p = typeof prefix === 'function' ? prefix(i) : prefix; const clean = l.replace(/^(#{1,6}\s|>\s|[-*]\s|\d+\.\s)/, ''); return l.startsWith(p) ? clean : p + clean; }).join('\n');
    // no selection: keep typing at the end of the line; selection: keep the block selected
    return { v: v.slice(0, start) + out + v.slice(end), a: a === b ? start + out.length : start, b: start + out.length };
  });
  const insertBlock = (text: string, selFrom: number, selLen: number) => edit((v, a) => {
    const before = v.slice(0, a); const nl = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
    const ins = nl + text + '\n';
    return { v: before + ins + v.slice(a), a: a + nl.length + selFrom, b: a + nl.length + selFrom + selLen };
  });
  const tools: Tool[] = [
    { key: 'h2', label: 'Section heading (H2)', icon: <b className="text-[12px]">H2</b>, run: () => linePrefix('## ') },
    { key: 'h3', label: 'Sub-heading (H3)', icon: <b className="text-[12px]">H3</b>, run: () => linePrefix('### ') },
    { key: 'b', label: 'Bold (Ctrl+B)', icon: <b className="text-[14px]">B</b>, run: () => wrap('**', '**', 'bold text'), kbd: 'b' },
    { key: 'i', label: 'Italic (Ctrl+I)', icon: <i className="font-serif text-[15px]">I</i>, run: () => wrap('_', '_', 'italic text'), kbd: 'i' },
    { key: 'link', label: 'Link (Ctrl+K)', icon: <Icon name="external" />, kbd: 'k', run: () => edit((v, a, b) => {
      const sel = v.slice(a, b) || 'link text'; const ins = `[${sel}](https://)`;
      return { v: v.slice(0, a) + ins + v.slice(b), a: a + sel.length + 3, b: a + sel.length + 11 };
    }) },
    { key: 'ul', label: 'Bulleted list', icon: <span className="text-[13px] font-bold">• —</span>, run: () => linePrefix('- ') },
    { key: 'ol', label: 'Numbered list', icon: <span className="text-[12px] font-bold">1.</span>, run: () => linePrefix((i) => `${i + 1}. `) },
    { key: 'quote', label: 'Quote / tip box', icon: <span className="font-serif text-[18px] leading-none">“</span>, run: () => linePrefix('> ') },
    { key: 'code', label: 'Code', icon: <span className="font-mono text-[12px]">{'</>'}</span>, run: () => edit((v, a, b) => {
      const sel = v.slice(a, b);
      if (sel.includes('\n')) { const ins = '```\n' + sel + '\n```'; return { v: v.slice(0, a) + ins + v.slice(b), a: a + 4, b: a + 4 + sel.length }; }
      const s2 = sel || 'code'; return { v: v.slice(0, a) + '`' + s2 + '`' + v.slice(b), a: a + 1, b: a + 1 + s2.length };
    }) },
    { key: 'img', label: 'Image', icon: <Icon name="eye" />, run: () => insertBlock('![Describe the image](https://)', 2, 18) },
    { key: 'table', label: 'Table', icon: <Icon name="layout" />, run: () => insertBlock('| Column 1 | Column 2 |\n|---|---|\n| Value | Value |', 2, 8) },
  ];
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const t = tools.find((x) => x.kbd === e.key.toLowerCase());
    if (t) { e.preventDefault(); t.run(); }
  };

  /* ---------- SEO snippet ---------- */
  const snippetTitle = (f.seoTitle || f.title || 'Post title').trim();
  const fullTitle = snippetTitle.includes(siteName) ? snippetTitle : `${snippetTitle} | ${siteName}`;
  const snippetDesc = (f.seoDescription || f.excerpt || autoEx || 'Add a summary so Google can show what this article is about.').trim();
  const host = siteUrl.replace(/^https?:\/\//, '');
  const err = (k: string) => state.field === k;
  const inputCls = (k: string) => `input ${err(k) ? 'border-red-400 ring-2 ring-red-100' : ''}`;

  return (
    <form action={formAction} onSubmit={() => setDirty(false)} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      {/* fields sent to the server */}
      <input type="hidden" name="id" value={f.id} />
      <input type="hidden" name="publishAt" value={publishIso} />
      <input type="hidden" name="body" value={f.body} />
      <input type="hidden" name="relatedProducts" value={f.relatedProducts.join(',')} />

      {state.error && (
        <div className="xl:col-span-2 flex items-start gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200" role="alert">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" /><span>{state.error}. Nothing was lost: fix it and save again.</span>
        </div>
      )}

      <div className="min-w-0 space-y-6">
        <Section title="Article">
          <div>
            <Label htmlFor="pe-title">Title</Label>
            <input id="pe-title" name="title" dir={f.lang === 'ar' ? 'rtl' : undefined} value={f.title} onChange={(e) => setTitle(e.target.value)} required maxLength={200}
              placeholder="e.g. How to choose between shared hosting and a VPS" className={`${inputCls('title')} h-12 text-[17px] font-semibold`} />
          </div>
          <div>
            <Label htmlFor="pe-slug" hint="(the web address of this article)">URL</Label>
            <div className={`flex items-stretch overflow-hidden rounded-lg border ${err('slug') || (slugMsg && !slugMsg.ok) ? 'border-red-400' : 'border-slate-300'} bg-white focus-within:ring-2 focus-within:ring-brand-200`}>
              <span className="hidden items-center whitespace-nowrap bg-slate-50 px-3 text-xs text-slate-500 sm:flex">{host}/blog/</span>
              <input id="pe-slug" name="slug" value={f.slug} onChange={(e) => { setSlugTouched(true); set('slug', slugify(e.target.value.replace(/\s/g, '-')) + (e.target.value.endsWith('-') ? '-' : '')); }}
                onBlur={() => set('slug', slugify(f.slug))} required className="min-w-0 flex-1 border-0 px-3 py-2 font-mono text-sm outline-none" aria-describedby="pe-slug-msg" />
              {slugTouched && f.title && <button type="button" className="whitespace-nowrap px-3 text-xs font-medium text-brand-600 hover:bg-slate-50" onClick={() => { setSlugTouched(false); set('slug', slugify(f.title)); }}>From title</button>}
            </div>
            <p id="pe-slug-msg" className={`mt-1.5 text-xs ${slugMsg ? (slugMsg.ok ? 'text-emerald-600' : 'text-red-600') : 'text-slate-400'}`} aria-live="polite">
              {slugMsg ? slugMsg.message : post.id && post.status === 'PUBLISHED' ? 'Changing the URL of a live post adds a redirect from the old address automatically.' : 'Created from the title. Short URLs with the main keyword work best.'}
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="field-label mb-0" id="pe-body-l">Content</span>
              <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium" role="tablist" aria-label="Editor view">
                {(['write', 'split', 'preview'] as const).map((v) => (
                  <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
                    className={`rounded-md px-3 py-1.5 capitalize ${v === 'split' ? 'hidden xl:block' : ''} ${view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{v === 'split' ? 'Side by side' : v}</button>
                ))}
              </div>
            </div>
            <div className={`overflow-hidden rounded-xl border ${err('body') ? 'border-red-400' : 'border-slate-300'}`}>
              {view !== 'preview' && (
                <div className="flex flex-wrap gap-0.5 border-b border-slate-200 bg-slate-50 p-1.5" role="toolbar" aria-label="Formatting">
                  {tools.map((t) => (
                    <button key={t.key} type="button" onClick={t.run} title={t.label} aria-label={t.label}
                      className="grid h-9 min-w-9 place-items-center rounded-md px-2 text-slate-600 transition hover:bg-white hover:text-slate-900 hover:shadow-sm">{t.icon}</button>
                  ))}
                </div>
              )}
              <div className={view === 'split' ? 'grid grid-cols-2 divide-x divide-slate-200' : ''}>
                {view !== 'preview' && (
                  <textarea ref={ta} dir={f.lang === 'ar' ? 'rtl' : undefined} value={f.body} onChange={(e) => set('body', e.target.value)} onKeyDown={onKey} aria-labelledby="pe-body-l" spellCheck
                    placeholder={'Start writing…\n\n## A section heading\n\nA paragraph. **Bold**, _italic_ and [links](https://globalhostia.com).\n\n- A list item\n- Another item'}
                    className="block min-h-[560px] w-full resize-y border-0 bg-white p-4 font-mono text-[14px] leading-[1.7] text-slate-800 outline-none" />
                )}
                {view !== 'write' && (
                  <div className="relative max-h-[760px] min-h-[560px] overflow-y-auto bg-white p-5" aria-live="polite" aria-busy={previewBusy}>
                    {previewBusy && <span className="absolute right-3 top-3 text-[11px] text-slate-400">Updating…</span>}
                    {f.body.trim() ? <div className="gh-prose" dir={f.lang === 'ar' ? 'rtl' : undefined} dangerouslySetInnerHTML={{ __html: previewHtml }} /> : <p className="text-sm text-slate-400">The preview appears here as you write.</p>}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
                <span><b className="tabular-nums text-slate-700">{words.toLocaleString()}</b> words</span>
                <span><b className="tabular-nums text-slate-700">{minutes}</b> min read</span>
                <span className={words && words < 300 ? 'text-amber-600' : ''}>{words && words < 300 ? 'Tip: articles of 600+ words tend to rank better' : 'Use ## for section headings: they build the table of contents'}</span>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="pe-excerpt" hint="(shown on cards and under the title)" counter={<Count n={f.excerpt.length} ideal={[80, 200]} max={500} />}>Summary</Label>
            <textarea id="pe-excerpt" name="excerpt" rows={3} value={f.excerpt} onChange={(e) => set('excerpt', e.target.value)} maxLength={500}
              placeholder={autoEx ? `Leave empty to use: “${autoEx}”` : 'One or two sentences that tell readers what they will learn.'} className={inputCls('excerpt')} />
          </div>
          <div>
            <Label htmlFor="pe-take" hint="(optional, one per line, shown in the box next to the title)" counter={<span className="text-[11.5px] text-slate-400 tabular-nums">{f.takeaways.split('\n').filter((x) => x.trim()).length} / 8</span>}>Key takeaways</Label>
            <textarea id="pe-take" name="takeaways" rows={4} value={f.takeaways} onChange={(e) => set('takeaways', e.target.value)}
              placeholder={'Shared hosting suits most business websites\nMove to a VPS when you hit resource limits\nPick a datacenter close to your visitors'} className={inputCls('takeaways')} />
          </div>
        </Section>

        <Section title="Products to recommend" aside={<span className="text-xs text-slate-400">{f.relatedProducts.length ? `${f.relatedProducts.length} selected` : 'Automatic'}</span>}>
          <p className="text-xs leading-relaxed text-slate-500">Shown as <b>Recommended for this topic</b> after the second section heading and as <b>Plans that fit</b> at the end, with live prices in each visitor&apos;s currency. Leave empty to pick plans automatically from the category, tags and title.</p>
          {f.relatedProducts.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Selected">
              {f.relatedProducts.map((r) => (
                <li key={r}><button type="button" onClick={() => toggleRel(r)} className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-xs text-white hover:bg-slate-700" aria-label={`Remove ${relLabel(r)}`}>{relLabel(r)} <span aria-hidden>×</span></button></li>
              ))}
            </ul>
          )}
          <fieldset>
            <legend className="field-label">Whole categories</legend>
            <div className="flex flex-wrap gap-1.5">
              {catalog.categories.map((c) => { const ref = `cat:${c.slug}`, on = f.relatedProducts.includes(ref); return (
                <button key={c.slug} type="button" aria-pressed={on} onClick={() => toggleRel(ref)} className={`rounded-full px-3 py-1.5 text-xs ring-1 ring-inset transition ${on ? 'bg-brand-500 text-white ring-brand-500' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-400'}`}>
                  {c.name} <span className={on ? 'text-white/70' : 'text-slate-400'}>{c.count}</span></button>); })}
              {!catalog.categories.length && <p className="text-xs text-slate-400">No published products yet.</p>}
            </div>
          </fieldset>
          <div>
            <Label htmlFor="pe-pq">Or specific plans</Label>
            <input id="pe-pq" value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Search plans, e.g. Ultra, VPS, RDP" className="input" />
            {pq.trim() && (
              <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {prodMatches.map((x) => { const ref = `p:${x.slug}`, on = f.relatedProducts.includes(ref); return (
                  <li key={x.slug}><label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50">
                    <input type="checkbox" checked={on} onChange={() => toggleRel(ref)} /> <span className="font-medium text-slate-800">{x.name}</span> <span className="ml-auto text-xs text-slate-400">{x.category}</span></label></li>); })}
                {!prodMatches.length && <li className="px-3 py-2 text-xs text-slate-400">No plans match.</li>}
              </ul>
            )}
          </div>
        </Section>

        <Section title="Search engines and sharing" aside={<span className="text-xs text-slate-400">Optional: sensible defaults are used</span>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="pe-kw" hint="(the search phrase this article should rank for)">Focus keyword</Label>
              <input id="pe-kw" name="focusKeyword" value={f.focusKeyword} onChange={(e) => set('focusKeyword', e.target.value)} maxLength={80} placeholder="e.g. shared hosting vs VPS" className={inputCls('focusKeyword')} /></div>
            <div><Label htmlFor="pe-kw2" hint="(optional, comma separated)">Secondary keywords</Label>
              <input id="pe-kw2" name="secondaryKeywords" value={f.secondaryKeywords} onChange={(e) => set('secondaryKeywords', e.target.value)} maxLength={300} placeholder="vps hosting, when to upgrade" className={inputCls('secondaryKeywords')} /></div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Google search result preview">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Google preview</p>
            <div className="flex items-center gap-2 text-[12.5px] text-slate-600"><span className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">{siteName.slice(0, 1)}</span>
              <span className="min-w-0"><span className="block leading-tight text-slate-800">{siteName}</span><span className="block truncate leading-tight">{host} › blog › {f.slug || 'post-url'}</span></span></div>
            <p className="mt-1.5 line-clamp-1 text-[19px] leading-snug text-[#1a0dab]">{fullTitle.length > 65 ? fullTitle.slice(0, 62) + '…' : fullTitle}</p>
            <p className="mt-0.5 line-clamp-2 text-[13.5px] leading-snug text-[#4d5156]">{snippetDesc.length > 160 ? snippetDesc.slice(0, 157) + '…' : snippetDesc}</p>
          </div>
          <div>
            <Label htmlFor="pe-seot" hint="(defaults to the title)" counter={<Count n={(f.seoTitle || f.title).length} ideal={[30, 60]} max={120} />}>SEO title</Label>
            <input id="pe-seot" name="seoTitle" value={f.seoTitle} onChange={(e) => set('seoTitle', e.target.value)} maxLength={120} placeholder={f.title} className={inputCls('seoTitle')} />
          </div>
          <div>
            <Label htmlFor="pe-seod" hint="(defaults to the summary)" counter={<Count n={(f.seoDescription || f.excerpt || autoEx).length} ideal={[120, 160]} max={320} />}>Meta description</Label>
            <textarea id="pe-seod" name="seoDescription" rows={2} value={f.seoDescription} onChange={(e) => set('seoDescription', e.target.value)} maxLength={320} placeholder={f.excerpt || autoEx} className={inputCls('seoDescription')} />
          </div>
          <details className="group rounded-lg border border-slate-200 px-4 py-3 open:pb-4">
            <summary className="cursor-pointer list-none text-sm font-medium text-slate-700">Advanced <span className="text-xs font-normal text-slate-400">(social image, canonical URL)</span></summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div><Label htmlFor="pe-og" hint="(defaults to the cover image)">Social share image URL</Label><input id="pe-og" name="ogImage" value={f.ogImage} onChange={(e) => set('ogImage', e.target.value)} placeholder="https://… (1200×630 works best)" className={inputCls('ogImage')} /></div>
              <div><Label htmlFor="pe-can" hint="(only if first published elsewhere)">Canonical URL</Label><input id="pe-can" name="canonical" value={f.canonical} onChange={(e) => set('canonical', e.target.value)} placeholder={`${siteUrl}/blog/${f.slug || '…'}`} className={inputCls('canonical')} /></div>
            </div>
          </details>
        </Section>
      </div>

      <div className="space-y-6">
        <div className="space-y-6">
          <Section title="Publishing">
            <fieldset>
              <legend className="field-label">Status</legend>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 text-[13px] font-medium">
                {([['DRAFT', 'Draft'], ['PUBLISHED', 'Published'], ['ARCHIVED', 'Archived']] as const).map(([v, l]) => (
                  <label key={v} className={`cursor-pointer rounded-md px-2 py-2 text-center transition ${f.status === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'} has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-300`}>
                    <input type="radio" name="status" value={v} checked={f.status === v} onChange={() => set('status', v)} className="sr-only" />{l}
                  </label>
                ))}
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><span className={`h-2 w-2 rounded-full ${f.status === 'PUBLISHED' ? (future ? 'bg-brand-500' : 'bg-emerald-500') : f.status === 'ARCHIVED' ? 'bg-slate-400' : 'bg-amber-500'}`} aria-hidden />{stateText}</p>
            </fieldset>
            <div>
              <Label htmlFor="pe-date" hint="(optional)">Publish date and time</Label>
              <div className="flex gap-2">
                <input id="pe-date" type="datetime-local" value={publishLocal} onChange={(e) => { setPublishLocal(e.target.value); setDirty(true); }} className={`${inputCls('publishAt')} min-w-0`} />
                {publishLocal && <button type="button" className="btn btn-ghost px-2 text-xs" onClick={() => { setPublishLocal(''); setDirty(true); }}>Clear</button>}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">Empty = publish now. A future date with status Published schedules the post. {tz && <>Times are in {tz}.</>}</p>
            </div>
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="featured" checked={f.featured} onChange={(e) => set('featured', e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>Feature this post<span className="block text-xs text-slate-400">Shown large at the top of the blog</span></span>
            </label>
            <button type="submit" disabled={pending} className="btn btn-primary h-11 w-full">{pending ? 'Saving…' : saveLabel}</button>
            {post.id ? (
              <a href={`/blog/${post.slug}${wasLive ? '' : '?preview'}`} target="_blank" className="btn btn-secondary w-full"><Icon name={wasLive ? 'external' : 'eye'} /> {wasLive ? 'View on website' : 'Preview on website'}</a>
            ) : <p className="text-center text-xs text-slate-400">Save once to preview the full page on the website.</p>}
            {dirty && post.id && <p className="text-center text-xs text-amber-600" role="status">Unsaved changes: save to see them on the website.</p>}
          </Section>

          <Section title="SEO checklist" aside={<span className={`text-sm font-bold tabular-nums ${scoreTone}`} aria-label={`SEO score ${score} out of 100`}>{score}/100</span>}>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden><div className={`h-full rounded-full transition-[width] ${score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${score}%` }} /></div>
            {!f.focusKeyword.trim() && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Add a focus keyword (in Search engines below) to check keyword placement.</p>}
            <ul className="space-y-2">
              {checks.map((c) => (
                <li key={c.label} className="flex items-start gap-2 text-[13px] leading-snug">
                  <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${c.ok ? 'bg-emerald-500' : c.kw && !f.focusKeyword.trim() ? 'bg-slate-300' : 'bg-red-400'}`} aria-hidden>{c.ok ? '✓' : '!'}</span>
                  <span><span className={c.ok ? 'text-slate-700' : 'text-slate-900'}><span className="sr-only">{c.ok ? 'Done: ' : 'To do: '}</span>{c.label}</span>{!c.ok && <span className="block text-xs text-slate-400">{c.hint}</span>}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Cover image">
            {f.coverImage && isImg(f.coverImage) && !coverErr ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={f.coverImage} alt={f.coverAlt || 'Cover preview'} onError={() => setCoverErr(true)} className="aspect-video w-full rounded-lg border border-slate-200 object-cover" />
            ) : (
              <div className={`grid aspect-video w-full place-items-center rounded-lg border border-dashed px-4 text-center text-xs ${coverErr ? 'border-red-300 bg-red-50 text-red-600' : 'border-slate-300 bg-slate-50 text-slate-400'}`}>
                {coverErr ? 'This image could not be loaded. Check the address.' : 'No cover image. A branded placeholder is used.'}
              </div>
            )}
            <div><Label htmlFor="pe-cover">Image URL</Label><input id="pe-cover" name="coverImage" value={f.coverImage} onChange={(e) => set('coverImage', e.target.value.trim())} placeholder="https://… or /hp/img/…" className={inputCls('coverImage')} />
              <p className="mt-1.5 text-xs text-slate-400">Landscape, about 1600×900. Paste a link to an image hosted online.</p></div>
            <fieldset>
              <legend className="field-label">Cover style</legend>
              <div className="grid grid-cols-3 gap-2">
                {([['branded', 'Branded', 'Brand colours and hexagon accent'], ['plain', 'Plain', 'Photo as it is, rounded frame'], ['hex', 'Hexagon', 'Branded, cut to a hexagon shape']] as const).map(([v, l, d]) => (
                  <label key={v} title={d} className={`cursor-pointer rounded-lg p-1.5 text-center text-xs font-medium ring-1 ring-inset transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-300 ${f.coverStyle === v ? 'bg-brand-50 text-brand-700 ring-brand-400' : 'text-slate-600 ring-slate-200 hover:ring-slate-400'}`}>
                    <input type="radio" name="coverStyle" value={v} checked={f.coverStyle === v} onChange={() => set('coverStyle', v)} className="sr-only" />
                    <span className={`relative mb-1.5 block aspect-video overflow-hidden bg-slate-700 ${v === 'hex' ? '[clip-path:polygon(8%_0,92%_0,100%_50%,92%_100%,8%_100%,0_50%)]' : 'rounded-md'}`} aria-hidden>
                      {f.coverImage && isImg(f.coverImage) && !coverErr && <img src={f.coverImage} alt="" className="h-full w-full object-cover" />}
                      {v !== 'plain' && <span className="absolute inset-0 bg-gradient-to-br from-[#16212b]/60 via-transparent to-[#c5386f]/50 mix-blend-multiply" />}
                      <span className="absolute left-1 top-1 h-1.5 w-5 rounded-full bg-[#fdd700]" />
                    </span>{l}
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-slate-400">Every style adds a rounded frame and a gold category label.</p>
            </fieldset>
            <div><Label htmlFor="pe-alt" hint="(describe the image for screen readers and Google)">Image description</Label><input id="pe-alt" name="coverAlt" value={f.coverAlt} onChange={(e) => set('coverAlt', e.target.value)} maxLength={200} className={inputCls('coverAlt')} /></div>
          </Section>

          <Section title="Organise">
            <div>
              <Label htmlFor="pe-cat">Category</Label>
              <input id="pe-cat" name="category" list="pe-cats" value={f.category} onChange={(e) => set('category', e.target.value)} maxLength={60} placeholder="e.g. Hosting guides" className={inputCls('category')} />
              <datalist id="pe-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              {categories.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{categories.map((c) => (
                <button key={c} type="button" onClick={() => set('category', c)} className={`rounded-full px-2.5 py-1 text-xs ring-1 ring-inset ${f.category === c ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-400'}`}>{c}</button>))}</div>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pe-track">Guide collection</Label>
                <select id="pe-track" name="track" value={f.track} onChange={(e) => set('track', e.target.value as EditorPost['track'])} className="input">
                  <option value="">None</option><option value="uae">UAE guides</option><option value="global">Global guides</option>
                </select>
              </div>
              <div>
                <Label htmlFor="pe-lang">Language</Label>
                <select id="pe-lang" name="lang" value={f.lang} onChange={(e) => set('lang', e.target.value as EditorPost['lang'])} className="input">
                  <option value="en">English</option><option value="ar">Arabic (right to left)</option>
                </select>
              </div>
            </div>
            <div>
              <Label htmlFor="pe-tags" hint="(comma separated)">Tags</Label>
              <input id="pe-tags" name="tags" value={f.tags} onChange={(e) => set('tags', e.target.value)} placeholder="vps, dns, wordpress" className={inputCls('tags')} />
            </div>
            <div>
              <Label htmlFor="pe-author">Author</Label>
              <input id="pe-author" name="author" list="pe-authors" value={f.author} onChange={(e) => set('author', e.target.value)} maxLength={80} placeholder="Globalhostia Team" className={inputCls('author')} />
              <datalist id="pe-authors">{authors.map((a) => <option key={a} value={a} />)}</datalist>
            </div>
          </Section>
        </div>
      </div>

      <details className="card px-5 py-4 text-sm text-slate-600 xl:col-span-2">
        <summary className="cursor-pointer font-medium text-slate-800">Formatting cheat sheet</summary>
        <div className="mt-3 grid gap-x-8 gap-y-1.5 font-mono text-[12.5px] sm:grid-cols-2 lg:grid-cols-3">
          {[['## Heading', 'section heading (in table of contents)'], ['### Sub-heading', 'smaller heading'], ['**bold**', 'bold'], ['_italic_', 'italic'], ['[text](https://…)', 'link'], ['- item', 'bulleted list'], ['1. item', 'numbered list'], ['> text', 'highlighted tip box'], ['`code`', 'inline code'], ['![alt](https://…)', 'image'], ['---', 'divider line'], ['| a | b |', 'table']].map(([a, b]) => (
            <div key={a}><span className="text-slate-900">{a}</span> <span className="font-sans text-slate-400">{b}</span></div>))}
        </div>
      </details>
    </form>
  );
}
