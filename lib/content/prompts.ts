// SEO content engine: prompts, JSON schemas and output parsing (pure; type imports only, so tests load it directly).
import type { Track, Intent } from './core';

export type LinkTarget = { path: string; title: string; kind: 'category' | 'product' | 'guide' | 'page' | 'post' };
export type TargetOption = { ref: string; label: string; path: string };

/* ------------------------------------------------------------------ shared rules */
export const RULES = `Editorial rules (strict):
- Be factual and practical. Explain what to do and why, with steps, checklists and tables where they help.
- Never invent statistics, percentages, studies, surveys, quotes, testimonials, customer names, case studies, awards or rankings. If a number is not common technical knowledge, leave it out.
- Never name competitors or other hosting companies, registrars or website builders. Say "many providers", "another host", "your current registrar".
- Never claim "#1", "best", "cheapest", "guaranteed", "100% uptime" or similar superlatives.
- Do not write prices, discounts or plan specifications. Live prices are shown automatically in a plan block next to the article.
- Only link to internal pages from the ALLOWED LINKS list, using the exact path (e.g. [web hosting](/web-hosting)). Never invent a URL.
- UAE legal, tax, licensing and regulatory points must stay general, and the article must say to confirm the current rules with the relevant authority or an accountant/legal adviser. Rules change: avoid exact fees, deadlines and penalties.
- External references: only official sources (for example u.ae, tax.gov.ae, tdra.gov.ae, aeda.ae, icann.org, developer documentation), written as plain Markdown links. The owner verifies each one before publishing. Use at most 3.
- Voice: GlobalHostia is a Dubai-based hosting company (web hosting, WordPress hosting, VPS, dedicated servers, domains including .ae, business email, SSL). Friendly, clear, British/International English, no hype, no emojis.`;

/* ------------------------------------------------------------------ ideas (Haiku) */
export const IDEAS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['ideas'],
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'primaryKeyword', 'secondaryKeywords', 'intent', 'audienceCountry', 'target', 'slug', 'priority', 'rationale', 'cluster', 'angle'],
        properties: {
          title: { type: 'string' }, primaryKeyword: { type: 'string' }, cluster: { type: 'string' }, angle: { type: 'string' }, secondaryKeywords: { type: 'array', items: { type: 'string' } },
          intent: { type: 'string', enum: ['informational', 'commercial', 'transactional'] }, audienceCountry: { type: 'string' },
          target: { type: 'string' }, slug: { type: 'string' }, priority: { type: 'integer' }, rationale: { type: 'string' },
        },
      },
    },
  },
} as const;

export const TRACK_BRIEF: Record<Track, string> = {
  uae: 'UAE / GCC track: readers are business owners and marketers in the UAE, Saudi Arabia and the wider GCC. Typical themes: trade licence and website setup, .ae domains and eligibility, UAE VAT on hosting and digital services (general information only), Arabic and right-to-left websites, hosting close to GCC customers and latency, WhatsApp Business on websites, UAE payment gateways for online shops (gateway names such as Telr, Network International and Tabby may be mentioned as examples, without claims about their fees), data residency basics, Ramadan / DSF / White Friday e-commerce preparation.',
  global: 'Global track: readers are small businesses, freelancers and developers anywhere. Typical themes: WordPress hosting, VPS vs shared hosting, choosing a domain name, email deliverability (SPF, DKIM, DMARC), SSL/HTTPS, website migration, site speed, backups, small-business website checklists, and comparisons of our own plan types (never other companies).',
};

export type IdeaCategory = { id: string; label: string; brief: string; needsSources?: boolean };
export function ideasPrompt(o: {
  track: Track; count: number; targets: TargetOption[]; existing: { title: string; path: string }[]; seasonal: { month: string; hints: string[] }[]; seeds: string[]; today: string;
  /** autopilot: one broad category for this batch, every previous title (compact) and the topic clusters used recently */
  category?: IdeaCategory | null; previousTitles?: string[]; recentClusters?: string[];
}) {
  const cat = o.category ? `
CATEGORY for this batch: ${o.category.label} — ${o.category.brief}. Every idea must belong to this category (it does not have to be about hosting; link it to the closest TARGET).${o.category.needsSources ? ' Only propose topics that can be supported by official sources (government portals, standards bodies, the vendor\'s own announcement or documentation). No rumours, predictions or unverified news.' : ''}
Each idea must stand on its own: unrelated to the previous articles, with a distinct reader problem and a unique angle (a specific situation, audience or task), never a rewrite of an earlier topic.` : '';
  const system = `You plan SEO articles for GlobalHostia's blog. ${TRACK_BRIEF[o.track]}${cat}
Return ${o.count} distinct article ideas as JSON. Each idea:
- title: a specific working title (max 70 characters) that answers a real search query.
- primaryKeyword: the main search phrase (2-6 words, lowercase), plus secondaryKeywords: 3-6 related phrases.
- intent: informational (learn/how-to), commercial (compare/choose) or transactional (ready to buy).
- audienceCountry: ISO country code (AE, SA, QA, KW, OM, BH), "GCC" or "Global".
- target: exactly one ref from TARGETS (the product category the article should lead readers to).
- slug: short lowercase URL slug with hyphens (max 60 characters).
- priority: 1-100, higher = publish sooner (fit with our products, buying intent, seasonal timing).
- rationale: one sentence on why this topic and which reader question it answers.
- cluster: the narrow topic cluster in 2-4 lowercase words (e.g. "email authentication", "domain transfers", "ai meeting notes").
- angle: one sentence on the specific, useful angle that makes this article different from generic articles on the subject.
Do NOT propose topics that duplicate or compete with EXISTING PAGES; pick a different angle or a narrower question instead.
Do NOT include search volumes or any numbers you do not know: there is no keyword data, only estimated intent.
No competitor names. No topics about other companies.`;
  const user = [
    `Today: ${o.today}`,
    `TARGETS (use the ref):\n${o.targets.map((t) => `- ${t.ref} — ${t.label}`).join('\n')}`,
    `EXISTING PAGES (avoid overlap):\n${o.existing.slice(0, 120).map((e) => `- ${e.title} (${e.path})`).join('\n') || '- none'}`,
    `SEASONAL CALENDAR (next months):\n${o.seasonal.map((s) => `- ${s.month}: ${s.hints.join('; ') || '—'}`).join('\n')}`,
    o.previousTitles?.length ? `PREVIOUS ARTICLES AND QUEUED TOPICS (do not repeat or closely relate to any of these):\n${o.previousTitles.slice(0, 250).map((t) => `- ${t.slice(0, 90)}`).join('\n')}` : '',
    o.recentClusters?.length ? `TOPIC CLUSTERS USED RECENTLY (pick different clusters): ${o.recentClusters.slice(0, 60).join('; ')}` : '',
    o.seeds.length ? `OWNER SEED KEYWORDS (use where they fit the track):\n${o.seeds.map((s) => `- ${s}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
  return { system, user };
}

export type RawIdea = { title: string; primaryKeyword: string; secondaryKeywords: string[]; intent: Intent; audienceCountry: string; target: string; slug: string; priority: number; rationale: string; cluster: string; angle: string };

/** Parse model text into ideas: tolerant of code fences / extra prose; drops malformed rows; target must be one of the allowed refs. */
export function parseIdeas(text: string, allowedTargets: string[]): RawIdea[] {
  const obj = parseJson(text);
  const arr = Array.isArray(obj) ? obj : Array.isArray(obj?.ideas) ? obj.ideas : [];
  const allowed = new Set(allowedTargets);
  const out: RawIdea[] = [];
  for (const r of arr) {
    if (!r || typeof r !== 'object') continue;
    const title = String(r.title || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const kw = String(r.primaryKeyword || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80);
    if (title.length < 10 || kw.length < 3) continue;
    const intent = (['informational', 'commercial', 'transactional'].includes(r.intent) ? r.intent : 'informational') as Intent;
    const target = allowed.has(String(r.target)) ? String(r.target) : '';
    out.push({
      title, primaryKeyword: kw,
      secondaryKeywords: (Array.isArray(r.secondaryKeywords) ? r.secondaryKeywords : []).map((s: unknown) => String(s).trim().toLowerCase()).filter((s: string) => s.length >= 3 && s.length <= 80 && s !== kw).slice(0, 6),
      intent, audienceCountry: String(r.audienceCountry || '').trim().slice(0, 12) || 'Global', target,
      slug: String(r.slug || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 75),
      priority: Math.max(1, Math.min(100, Math.round(Number(r.priority) || 50))), rationale: String(r.rationale || '').trim().slice(0, 300),
      cluster: String(r.cluster || '').toLowerCase().replace(/[^a-z0-9 .-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60),
      angle: String(r.angle || '').replace(/\s+/g, ' ').trim().slice(0, 240),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ draft (Sonnet) */
export const DRAFT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['h1', 'metaTitle', 'metaDescription', 'slug', 'excerpt', 'intro', 'sections', 'faq', 'takeaways', 'cta'],
  properties: {
    h1: { type: 'string' }, metaTitle: { type: 'string' }, metaDescription: { type: 'string' }, slug: { type: 'string' }, excerpt: { type: 'string' },
    intro: { type: 'string' },
    sections: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['heading', 'body'], properties: { heading: { type: 'string' }, body: { type: 'string' } } } },
    faq: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['q', 'a'], properties: { q: { type: 'string' }, a: { type: 'string' } } } },
    takeaways: { type: 'array', items: { type: 'string' } },
    cta: { type: 'string' },
  },
} as const;

export type DraftIdea = { title: string; primaryKeyword: string; secondaryKeywords: string[]; intent: string; track: Track; country: string; slug: string; angle?: string; category?: IdeaCategory | null };
export function draftPrompt(o: { idea: DraftIdea; target: TargetOption | null; links: LinkTarget[]; minWords: number; maxWords: number; today: string; notes?: string }) {
  const system = `You write SEO articles for the GlobalHostia blog. ${TRACK_BRIEF[o.idea.track]}

${RULES}

Output JSON with:
- h1: the article title, containing the primary keyword naturally.
- metaTitle: max 55 characters (the site adds " | GlobalHostia" when it fits), containing the primary keyword.
- metaDescription: 130-155 characters, containing the primary keyword, no quotes.
- slug: lowercase-hyphenated, max 60 characters, built from the primary keyword.
- excerpt: one or two sentences (max 220 characters) for the article card.
- intro: 2-3 sentences that directly answer the search query, using the primary keyword in the first sentence. Plain Markdown, no heading.
- sections: 5-8 H2 sections (heading text only, no "##"), one heading containing the primary keyword. Each body is Markdown: paragraphs, "###" sub-headings, numbered steps, bullet checklists and at least one table in the article. No H1/H2 inside bodies. Each heading must be unique.
- faq: 4-6 questions real readers ask, each answered in 2-4 sentences.
- takeaways: 3-5 short key takeaways (one sentence each).
- cta: one or two friendly sentences inviting the reader to look at the TARGET page, with one Markdown link to it. No prices, no pressure.
Total length: ${o.minWords}-${o.maxWords} words across intro, sections and FAQ, all of it substance (no filler, no restating the question, no generic padding). Include 3-6 internal links to ALLOWED LINKS where they genuinely help.
Helpful-content rules: write for the reader, not for search engines. Give first-hand-style practical detail (exact settings, steps, decision criteria, pitfalls), a clear point of view and the unique ANGLE below. Use the primary keyword naturally (a handful of times, never stuffed) and vary the wording; do not repeat sentences or stock phrases. Facts that are not common knowledge must cite an official source as a Markdown link (1-3 links, see the rules). Do not write anything you cannot stand behind.${o.idea.category?.needsSources ? ' This topic REQUIRES at least one official source link (government portal, standards body or the vendor\'s own documentation) for its factual statements.' : ''}`;
  const user = [
    `Today: ${o.today} (write "last updated" content as of this date; avoid year-specific claims you cannot verify)`,
    `Working title: ${o.idea.title}`,
    `Primary keyword: ${o.idea.primaryKeyword}`,
    `Secondary keywords: ${o.idea.secondaryKeywords.join(', ') || '—'}`,
    `Search intent: ${o.idea.intent}`,
    o.idea.category ? `Category: ${o.idea.category.label} — ${o.idea.category.brief}` : '',
    o.idea.angle ? `ANGLE (what makes this article different): ${o.idea.angle}` : '',
    `Audience: ${o.idea.country || (o.idea.track === 'uae' ? 'UAE / GCC' : 'Global')}`,
    `Suggested slug: ${o.idea.slug || '—'}`,
    `TARGET: ${o.target ? `${o.target.label} — ${o.target.path}` : 'web hosting — /web-hosting'}`,
    `ALLOWED LINKS (path — page):\n${o.links.map((l) => `- ${l.path} — ${l.title}`).join('\n')}`,
    o.notes ? `Owner notes: ${o.notes}` : '',
  ].filter(Boolean).join('\n\n');
  return { system, user };
}

export type Draft = { h1: string; metaTitle: string; metaDescription: string; slug: string; excerpt: string; intro: string; sections: { heading: string; body: string }[]; faq: { q: string; a: string }[]; takeaways: string[]; cta: string };

export function parseDraft(text: string): Draft | null {
  const o = parseJson(text);
  if (!o || typeof o !== 'object') return null;
  const s = (v: unknown, max = 100_000) => String(v ?? '').trim().slice(0, max);
  const sections = (Array.isArray(o.sections) ? o.sections : []).map((x: any) => ({ heading: s(x?.heading, 140).replace(/^#+\s*/, ''), body: s(x?.body).replace(/^#\s+.*$/gm, '').replace(/^##\s+/gm, '### ') }))
    .filter((x: any) => x.heading && x.body);
  if (!sections.length || !s(o.h1)) return null;
  return {
    h1: s(o.h1, 200), metaTitle: s(o.metaTitle, 120), metaDescription: s(o.metaDescription, 320), slug: s(o.slug, 100), excerpt: s(o.excerpt, 500), intro: s(o.intro, 3000),
    sections,
    faq: (Array.isArray(o.faq) ? o.faq : []).map((x: any) => ({ q: s(x?.q, 200).replace(/^#+\s*/, ''), a: s(x?.a, 2000) })).filter((x: any) => x.q && x.a).slice(0, 8),
    takeaways: (Array.isArray(o.takeaways) ? o.takeaways : []).map((t: unknown) => s(t, 200).replace(/^[-*•]\s*/, '')).filter(Boolean).slice(0, 6),
    cta: s(o.cta, 600),
  };
}

export const FAQ_HEADING = { en: 'Frequently asked questions', ar: 'الأسئلة الشائعة' } as const;
/** Draft → the Markdown body stored in the blog post (the H1 is the post title; takeaways go to the post's key-takeaways box). */
export function assembleMarkdown(d: Pick<Draft, 'intro' | 'sections' | 'faq' | 'cta'>, lang: 'en' | 'ar' = 'en') {
  const parts = [d.intro.trim()];
  for (const sec of d.sections) parts.push(`## ${sec.heading.trim()}\n\n${sec.body.trim()}`);
  if (d.cta.trim()) parts.push(`> ${d.cta.trim().replace(/\n+/g, ' ')}`);
  if (d.faq.length) parts.push(`## ${FAQ_HEADING[lang]}\n\n${d.faq.map((f) => `### ${f.q.trim()}\n\n${f.a.trim()}`).join('\n\n')}`);
  return parts.filter(Boolean).join('\n\n') + '\n';
}

/* ------------------------------------------------------------------ section rewrite (Sonnet) */
export function sectionPrompt(o: { title: string; primaryKeyword: string; heading: string; current: string; instruction: string; links: LinkTarget[]; track: Track; lang: 'en' | 'ar' }) {
  const system = `You rewrite one section of a GlobalHostia blog article. ${TRACK_BRIEF[o.track]}

${RULES}
${o.lang === 'ar' ? 'Write in Modern Standard Arabic.' : ''}
Return only the new Markdown body of the section: no "##" heading line, no commentary. You may use "###" sub-headings, lists and tables.`;
  const user = `Article: ${o.title}\nPrimary keyword: ${o.primaryKeyword}\nSection heading: ${o.heading}\nOwner instruction: ${o.instruction || 'Improve clarity and practical detail; keep the same scope.'}\n\nCurrent section:\n${o.current}\n\nALLOWED LINKS:\n${o.links.map((l) => `- ${l.path} — ${l.title}`).join('\n')}`;
  return { system, user };
}

/* ------------------------------------------------------------------ Arabic version (Sonnet) */
export function arabicPrompt(o: { title: string; excerpt: string; metaTitle: string; metaDescription: string; body: string; takeaways: string[] }) {
  const system = `You localise a GlobalHostia blog article from English into Modern Standard Arabic for readers in the UAE and the GCC.
${RULES}
Localisation rules:
- Natural, professional Modern Standard Arabic (not a word-for-word translation). Keep the structure: same H2/H3 headings in the same order, lists, tables and links.
- Keep every Markdown link target exactly as it is (paths like /web-hosting stay unchanged); translate only the link text.
- Keep product names, brand names and technical terms readers search in English (WordPress, VPS, DNS, SSL, cPanel, SPF, DKIM, DMARC, .ae) in Latin script, with an Arabic explanation where useful.
- Use Western digits (0-9).
- The FAQ heading must be "## الأسئلة الشائعة" with each question as "### ".
Output JSON: { "title", "metaTitle" (max 60 characters), "metaDescription" (max 155 characters), "excerpt", "body" (Markdown), "takeaways" (array) }.`;
  const user = `Title: ${o.title}\nMeta title: ${o.metaTitle}\nMeta description: ${o.metaDescription}\nExcerpt: ${o.excerpt}\nKey takeaways:\n${o.takeaways.map((t) => `- ${t}`).join('\n')}\n\nBody (Markdown):\n${o.body}`;
  return { system, user };
}
export const ARABIC_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'metaTitle', 'metaDescription', 'excerpt', 'body', 'takeaways'],
  properties: { title: { type: 'string' }, metaTitle: { type: 'string' }, metaDescription: { type: 'string' }, excerpt: { type: 'string' }, body: { type: 'string' }, takeaways: { type: 'array', items: { type: 'string' } } },
} as const;
export function parseArabic(text: string) {
  const o = parseJson(text);
  if (!o || typeof o.body !== 'string' || !o.body.trim() || !String(o.title || '').trim()) return null;
  return {
    title: String(o.title).trim().slice(0, 200), metaTitle: String(o.metaTitle || '').trim().slice(0, 120), metaDescription: String(o.metaDescription || '').trim().slice(0, 320),
    excerpt: String(o.excerpt || '').trim().slice(0, 500), body: String(o.body).trim() + '\n',
    takeaways: (Array.isArray(o.takeaways) ? o.takeaways : []).map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 6),
  };
}

/* ------------------------------------------------------------------ AI review (Haiku) */
export const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['issues'],
  properties: { issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['severity', 'type', 'quote', 'note'],
    properties: { severity: { type: 'string', enum: ['warn', 'fail'] }, type: { type: 'string' }, quote: { type: 'string' }, note: { type: 'string' } } } } },
} as const;
export const REVIEW_SYSTEM = `You are a strict fact-and-compliance reviewer for a hosting company's blog. Find problems only; do not rewrite.
Report (max 8) issues of these types:
- fabricated: statistics, percentages, studies, quotes, testimonials, customer names or awards that look invented or unsourced (fail)
- legal: UAE legal/tax/licensing statements that are too specific (exact fees, deadlines, penalties) or lack "check with the authority/accountant" (warn; fail if likely wrong)
- competitor: names another hosting company, registrar or builder (fail)
- claim: superlatives or guarantees ("best", "#1", "guaranteed", "100%") (fail)
- accuracy: technical statements that are wrong or misleading (warn)
- price: any price or plan specification in the text (warn)
Quote the exact words (max 120 characters). Reply with JSON {"issues": [...]} and an empty array when the article is clean.`;
export function parseReview(text: string): { severity: 'warn' | 'fail'; type: string; quote: string; note: string }[] {
  const o = parseJson(text);
  const arr = Array.isArray(o?.issues) ? o.issues : [];
  return arr.filter((x: any) => x && typeof x === 'object').map((x: any) => ({
    severity: x.severity === 'fail' ? 'fail' as const : 'warn' as const, type: String(x.type || 'issue').slice(0, 30), quote: String(x.quote || '').slice(0, 160), note: String(x.note || '').slice(0, 300),
  })).slice(0, 8);
}

/* ------------------------------------------------------------------ JSON helper */
/** First JSON object/array in model text (handles ```json fences and leading prose). */
export function parseJson(text: string): any {
  const t = String(text || '').replace(/^﻿/, '').trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* fall through */ } }
  const i = t.search(/[{[]/);
  if (i < 0) return null;
  const close = t[i] === '{' ? '}' : ']';
  const j = t.lastIndexOf(close);
  if (j <= i) return null;
  try { return JSON.parse(t.slice(i, j + 1)); } catch { return null; }
}

/* ------------------------------------------------------------------ model calls (client injected: tests pass a mock) */
export type ModelClient = { messages: { create(params: any, opts?: any): Promise<any> } };
export type CallUsage = { model: string; input: number; output: number; cacheRead: number; cacheWrite: number; ms: number };
export type CallOut = { text: string; usage: CallUsage; stop: string };

/** One model call that should answer JSON. Uses structured output (json_schema) and retries once without it when the
 *  API rejects the parameter (400), with the schema spelled out in the system prompt instead. */
export async function callJson(client: ModelClient, o: { model: string; system: string; user: string; schema: object; maxTokens: number; timeoutMs: number }): Promise<CallOut> {
  const t0 = Date.now();
  const base = { model: o.model, max_tokens: o.maxTokens, thinking: { type: 'disabled' }, system: [{ type: 'text', text: o.system }], messages: [{ role: 'user', content: o.user }] };
  let m: any;
  try {
    m = await client.messages.create({ ...base, output_config: { format: { type: 'json_schema', schema: o.schema } } }, { timeout: o.timeoutMs, maxRetries: 1 });
  } catch (e: any) {
    if (Number(e?.status) !== 400) throw e;
    m = await client.messages.create({ ...base, system: [{ type: 'text', text: `${o.system}\n\nReply with one JSON object only, matching this JSON schema:\n${JSON.stringify(o.schema)}` }] }, { timeout: o.timeoutMs, maxRetries: 1 });
  }
  return { text: textOf(m), stop: String(m?.stop_reason || ''), usage: usageOf(o.model, m, t0) };
}
/** Plain-text model call (section rewrites). */
export async function callText(client: ModelClient, o: { model: string; system: string; user: string; maxTokens: number; timeoutMs: number }): Promise<CallOut> {
  const t0 = Date.now();
  const m = await client.messages.create({ model: o.model, max_tokens: o.maxTokens, thinking: { type: 'disabled' }, system: [{ type: 'text', text: o.system }], messages: [{ role: 'user', content: o.user }] }, { timeout: o.timeoutMs, maxRetries: 1 });
  return { text: textOf(m).trim(), stop: String(m?.stop_reason || ''), usage: usageOf(o.model, m, t0) };
}
const textOf = (m: any) => (m?.content || []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('');
const usageOf = (model: string, m: any, t0: number): CallUsage => ({
  model, input: Number(m?.usage?.input_tokens) || 0, output: Number(m?.usage?.output_tokens) || 0,
  cacheRead: Number(m?.usage?.cache_read_input_tokens) || 0, cacheWrite: Number(m?.usage?.cache_creation_input_tokens) || 0, ms: Date.now() - t0,
});

/** Full draft for an idea: prompt → model → parsed draft → Markdown body. Throws a readable error on unusable output. */
export async function draftArticle(client: ModelClient, model: string, args: Parameters<typeof draftPrompt>[0]) {
  const p = draftPrompt(args);
  const out = await callJson(client, { model, system: p.system, user: p.user, schema: DRAFT_SCHEMA, maxTokens: 9000, timeoutMs: 150_000 });
  const d = parseDraft(out.text);
  if (!d) throw new Error(out.stop === 'max_tokens' ? 'The draft was cut off (too long). Try again.' : 'The model did not return a usable draft. Try again.');
  return { draft: d, body: assembleMarkdown(d, 'en'), usage: out.usage };
}

export async function generateIdeasWith(client: ModelClient, model: string, args: Parameters<typeof ideasPrompt>[0]) {
  const p = ideasPrompt(args);
  const out = await callJson(client, { model, system: p.system, user: p.user, schema: IDEAS_SCHEMA, maxTokens: 6000, timeoutMs: 90_000 });
  return { ideas: parseIdeas(out.text, args.targets.map((t) => t.ref)), usage: out.usage };
}

export async function reviewWith(client: ModelClient, model: string, article: { title: string; body: string; track: string }) {
  const out = await callJson(client, { model, system: REVIEW_SYSTEM, user: `Track: ${article.track}\nTitle: ${article.title}\n\n${article.body.slice(0, 30_000)}`, schema: REVIEW_SCHEMA, maxTokens: 1200, timeoutMs: 60_000 });
  return { issues: parseReview(out.text), usage: out.usage };
}

export async function arabicWith(client: ModelClient, model: string, args: Parameters<typeof arabicPrompt>[0]) {
  const p = arabicPrompt(args);
  const out = await callJson(client, { model, system: p.system, user: p.user, schema: ARABIC_SCHEMA, maxTokens: 14000, timeoutMs: 280_000 });
  const a = parseArabic(out.text);
  if (!a) throw new Error(out.stop === 'max_tokens' ? 'The Arabic version was cut off. Try again.' : 'The model did not return a usable Arabic version. Try again.');
  return { ar: a, usage: out.usage };
}

export async function rewriteSectionWith(client: ModelClient, model: string, args: Parameters<typeof sectionPrompt>[0]) {
  const p = sectionPrompt(args);
  const out = await callText(client, { model, system: p.system, user: p.user, maxTokens: 2500, timeoutMs: 120_000 });
  const body = out.text.replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/, '').replace(/^##\s+.*\n+/, '').trim();
  if (body.length < 40) throw new Error('The rewrite came back empty. Try again with a clearer instruction.');
  return { body, usage: out.usage };
}
