// SEO content engine: quality checks, link validation, slug/meta limits, workflow states, calendar slots, cron selection
// and the draft pipeline with a mocked AI client. Run: node --test --experimental-strip-types tests/content-engine.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canMove, assertMove, StateError, reconcileState, normalizeContent, DEFAULT_CONTENT, makeSlug, clampText, metaTitle, metaDescription,
  monthSlots, nextFreeSlot, quotaUse, monthKey, parseDubaiLocal, toDubaiLocal, selectForDrafting, selectDuePublished, selectAutoSchedule,
  estimateArticleCost, closestExisting, overlapLevel, replaceSection, splitSections, seasonalHints,
} from '../lib/content/core.ts';
import { runQualityChecks, hasKeyword, brokenInternalLinks, internalPath, extractLinks, countWords, unknownPrices, unsourcedPercentages, faqCount, mostSimilar, summarize } from '../lib/content/quality.ts';
import { parseIdeas, parseDraft, assembleMarkdown, parseJson, draftArticle, generateIdeasWith, reviewWith, callJson, parseArabic } from '../lib/content/prompts.ts';
import { SEED_IDEAS } from '../lib/content/seed-ideas.mjs';

/* ------------------------------------------------------------------ fixtures */
const KNOWN = ['/', '/web-hosting', '/vps-hosting', '/ae-domains', '/guides/register-ae-domain', '/blog/spf-dkim-dmarc-explained', '/wordpress-hosting', '/contact', '/free-migration'];
const para = (n: number, w = 'Hosting keeps your website online and fast for visitors.') => Array.from({ length: n }, () => w).join(' ');
function goodArticle() {
  const sections = [
    ['What VPS hosting means for a small business', `${para(30)} See our [VPS plans](/vps-hosting) for details.`],
    ['When shared hosting is enough', `${para(30)} Start with [web hosting](/web-hosting).`],
    ['How to plan the move', `1. Back up files.\n2. Copy the database.\n3. Switch DNS.\n\n${para(30)} We offer [free migration](/free-migration).`],
    ['Checklist before you upgrade', `| Item | Why |\n|---|---|\n| Backups | Restore if needed |\n\n${para(30)}`],
  ];
  const faq = Array.from({ length: 4 }, (_, i) => ({ q: `Question number ${i + 1} about VPS hosting?`, a: para(3) }));
  const intro = `VPS hosting gives your site reserved resources. ${para(4)}`;
  return assembleMarkdown({ intro, sections: sections.map(([heading, body]) => ({ heading, body })), faq, cta: 'Compare [VPS hosting plans](/vps-hosting) when you are ready.' });
}
const base = (body: string, over: Record<string, unknown> = {}) => ({
  body, h1: 'VPS hosting for small business: when to upgrade', metaTitle: 'VPS hosting for small business: when to upgrade',
  metaDescription: 'Learn when VPS hosting makes sense for a small business, how it differs from shared hosting, and how to plan the move without downtime today.',
  slug: 'vps-hosting-small-business', primaryKeyword: 'vps hosting', knownPaths: KNOWN, minWords: 300, maxWords: 3000, ...over,
});
const status = (checks: { id: string; status: string }[], id: string) => checks.find((c) => c.id === id)?.status;

/* ------------------------------------------------------------------ quality */
test('a clean article passes the core checks', () => {
  const checks = runQualityChecks(base(goodArticle()));
  for (const id of ['meta-title', 'meta-desc', 'slug', 'keyword', 'dup-headings', 'links-broken', 'links-internal', 'competitors', 'claims', 'prices', 'faq', 'structure'])
    assert.equal(status(checks, id), 'pass', `${id}: ${JSON.stringify(checks.find((c) => c.id === id))}`);
  assert.equal(summarize(checks).fail, 0);
});

test('word count range: warn outside, fail far below', () => {
  const body = goodArticle();
  const wc = countWords(body);
  assert.equal(status(runQualityChecks(base(body, { minWords: wc + 50, maxWords: wc + 500 })), 'words'), 'warn');
  assert.equal(status(runQualityChecks(base(body, { minWords: wc * 3, maxWords: wc * 4 })), 'words'), 'fail');
  assert.equal(status(runQualityChecks(base(body, { minWords: 100, maxWords: wc - 10 })), 'words'), 'warn', 'too long is a warning');
});

test('meta limits: title > 60 and description > 155 fail', () => {
  const c = runQualityChecks(base(goodArticle(), { metaTitle: 'x'.repeat(61), metaDescription: 'y '.repeat(80) }));
  assert.equal(status(c, 'meta-title'), 'fail');
  assert.equal(status(c, 'meta-desc'), 'fail');
  assert.equal(status(runQualityChecks(base(goodArticle(), { slug: 'Bad Slug!' })), 'slug'), 'fail');
});

test('keyword placement: missing from H1/intro/H2 is flagged', () => {
  const c = runQualityChecks(base(goodArticle(), { primaryKeyword: 'dedicated server', h1: 'Something else', metaTitle: 'Something else entirely here' }));
  assert.equal(status(c, 'keyword'), 'fail');
  const one = runQualityChecks(base(goodArticle().replace('VPS hosting gives', 'A server gives')));
  assert.equal(status(one, 'keyword'), 'warn', 'only the intro is missing');
});

test('keyword match tolerates punctuation and filler words, not missing words', () => {
  assert.ok(hasKeyword('SPF, DKIM and DMARC explained', 'spf dkim dmarc'));
  assert.ok(hasKeyword('How to choose a domain name', 'how to choose a domain name'));
  assert.ok(hasKeyword('Hosting websites for agencies', 'website hosting'), 'plural forms');
  assert.ok(!hasKeyword('SPF and DKIM explained', 'spf dkim dmarc'));
  assert.ok(!hasKeyword('anything', ''));
});

test('duplicate H2s fail', () => {
  const body = goodArticle() + '\n## When shared hosting is enough\n\nAgain.\n';
  assert.equal(status(runQualityChecks(base(body)), 'dup-headings'), 'fail');
});

test('forbidden claims, competitors, unsourced stats and invented prices', () => {
  const bad = goodArticle() + `\n\nWe are the #1 host with guaranteed uptime. Studies show 73% of shoppers leave slow sites. Unlike GoDaddy, our plan costs $3.49 a month.\n`;
  const c = runQualityChecks(base(bad, { catalogPrices: [4.99] }));
  assert.equal(status(c, 'competitors'), 'fail');
  assert.equal(status(c, 'prices'), 'fail');
  assert.equal(status(c, 'percentages'), 'warn');
  const ids = c.filter((x) => x.id.startsWith('claim-') && x.status === 'fail').map((x) => x.label).join(' | ');
  assert.match(ids, /#1/); assert.match(ids, /guaranteed/); assert.match(ids, /unnamed study/);
  assert.ok(!c.some((x) => x.id === 'claims'), 'no "all clear" row when a claim was found');
  assert.deepEqual(unknownPrices('Plans from $4.99 or AED 25.', [4.99]), ['AED 25']);
  assert.deepEqual(unsourcedPercentages('UAE VAT is 5% on most services. About 40% of sites are slow.'), ['About 40% of sites are slow.']);
  assert.deepEqual(unsourcedPercentages('Per [the FTA](https://tax.gov.ae), 5% applies.'), []);
});

test('UAE legal/tax statements need a "check with the authority/accountant" line', () => {
  const body = goodArticle() + '\n\nVAT registration depends on your turnover.\n';
  assert.equal(status(runQualityChecks(base(body, { track: 'uae' })), 'uae-caveat'), 'warn');
  assert.equal(status(runQualityChecks(base(body + 'Confirm the current rules with the FTA or your accountant.\n', { track: 'uae' })), 'uae-caveat'), 'pass');
  assert.equal(status(runQualityChecks(base(body, { track: 'global' })), 'uae-caveat'), undefined);
});

test('similarity vs existing posts (shingle Jaccard)', () => {
  const body = goodArticle();
  const c = runQualityChecks(base(body, { existing: [{ slug: 'copy', title: 'Copy', body }] }));
  assert.equal(status(c, 'similarity'), 'fail');
  const d = runQualityChecks(base(body, { existing: [{ slug: 'other', title: 'Other', body: 'Completely different words about email security and spam filters for teams.' }] }));
  assert.equal(status(d, 'similarity'), 'pass');
  assert.equal(mostSimilar(body, [])?.score ?? null, null);
});

test('FAQ count reads English and Arabic headings', () => {
  assert.equal(faqCount('## Frequently asked questions\n\n### A?\n\nx\n\n### B?\n\ny\n\n## Next\n'), 2);
  assert.equal(faqCount('## الأسئلة الشائعة\n\n### سؤال؟\n\nجواب\n'), 1);
});

/* ------------------------------------------------------------------ links */
test('internal link validation', () => {
  assert.equal(internalPath('/web-hosting/'), '/web-hosting');
  assert.equal(internalPath('https://www.globalhostia.com/vps-hosting?x=1#a'), '/vps-hosting');
  assert.equal(internalPath('https://tax.gov.ae/en'), null);
  assert.equal(internalPath('mailto:a@b.c'), null);
  assert.equal(internalPath('#faq'), null);
  const md = '[ok](/web-hosting) [bad](/web-hostin) [abs](https://globalhostia.com/nope) [ext](https://u.ae) ![img](/x.png)';
  assert.deepEqual(extractLinks(md).map((l) => l.href), ['/web-hosting', '/web-hostin', 'https://globalhostia.com/nope', 'https://u.ae']);
  assert.deepEqual(brokenInternalLinks(md, KNOWN).map((b) => b.path), ['/web-hostin', '/nope']);
  const c = runQualityChecks(base(goodArticle() + '\n[pricing](/pricing-page)\n'));
  assert.equal(status(c, 'links-broken'), 'fail');
  assert.equal(status(runQualityChecks(base(goodArticle() + '\n[see](https://example.com/x)\n')), 'links-external'), 'warn');
  assert.equal(status(runQualityChecks(base(goodArticle() + '\n[FTA](https://tax.gov.ae/en)\n')), 'links-external'), 'pass');
});

/* ------------------------------------------------------------------ slugs and meta */
test('slug and meta helpers respect limits', () => {
  assert.equal(makeSlug('How to Register a .ae Domain in the UAE?'), 'how-register-ae-domain-uae');
  assert.match(makeSlug('SPF, DKIM & DMARC explained'), /^spf-dkim-and-dmarc-explained$/);
  assert.ok(makeSlug('word '.repeat(60)).length <= 75);
  assert.equal(makeSlug('Ramadan e-commerce checklist'), 'ramadan-e-commerce-checklist');
  const t = metaTitle('A very long article title about web hosting in the United Arab Emirates for small businesses');
  assert.ok(t.length <= 60 && !t.endsWith(' ')); assert.ok(!/[,:\-]$/.test(t));
  assert.ok(metaDescription('word '.repeat(60)).length <= 155);
  assert.equal(clampText('short', 60), 'short');
});

/* ------------------------------------------------------------------ workflow */
test('state machine allows only the documented moves', () => {
  assert.ok(canMove('idea', 'approved')); assert.ok(canMove('approved', 'drafting')); assert.ok(canMove('drafting', 'draft_ready'));
  assert.ok(canMove('draft_ready', 'in_review')); assert.ok(canMove('in_review', 'scheduled')); assert.ok(canMove('scheduled', 'published'));
  assert.ok(canMove('idea', 'rejected')); assert.ok(canMove('rejected', 'idea'));
  assert.ok(!canMove('idea', 'published'), 'an idea can never jump to published');
  assert.ok(!canMove('approved', 'scheduled'), 'no scheduling without a draft');
  assert.ok(!canMove('drafting', 'published'));
  assert.throws(() => assertMove('idea', 'scheduled'), StateError);
  assert.doesNotThrow(() => assertMove('in_review', 'published'));
});

test('reconcile with the linked blog post', () => {
  const now = Date.parse('2026-11-10T00:00:00Z');
  assert.equal(reconcileState('in_review', { status: 'PUBLISHED', publishAt: '2026-11-09T00:00:00Z' }, now), 'published');
  assert.equal(reconcileState('in_review', { status: 'PUBLISHED', publishAt: '2026-11-20T00:00:00Z' }, now), 'scheduled');
  assert.equal(reconcileState('published', { status: 'DRAFT', publishAt: null }, now), 'in_review');
  assert.equal(reconcileState('draft_ready', { status: 'DRAFT', publishAt: null }, now), 'draft_ready');
  assert.equal(reconcileState('idea', { status: 'PUBLISHED', publishAt: null }, now), 'idea');
});

test('settings normalisation and defaults (autopilot on)', () => {
  assert.equal(DEFAULT_CONTENT.autoPublish, true);
  assert.deepEqual(DEFAULT_CONTENT.perMonth, { uae: 4, global: 4 });
  const s = normalizeContent({ perMonth: { uae: '6', global: 99 }, minWords: 2000, maxWords: 1000, autoPublish: 'on', seedKeywords: 'a, ab\nvps uae' });
  assert.deepEqual(s.perMonth, { uae: 6, global: 31 });
  assert.ok(s.maxWords > s.minWords);
  assert.equal(s.autoPublish, true);
  assert.deepEqual(s.seedKeywords, ['ab', 'vps uae']);
});

/* ------------------------------------------------------------------ calendar */
test('monthly slots spread across the month at 09:00 Dubai', () => {
  const s = monthSlots('2026-11', 4, 'uae', 9);
  assert.equal(s.length, 4);
  assert.deepEqual(s.map((d) => toDubaiLocal(d)), ['2026-11-03T09:00', '2026-11-10T09:00', '2026-11-18T09:00', '2026-11-25T09:00']);
  assert.equal(s[0].toISOString(), '2026-11-03T05:00:00.000Z', 'Dubai is UTC+4');
  assert.deepEqual(monthSlots('2026-11', 4, 'global').map((d) => toDubaiLocal(d).slice(8, 10)), ['05', '12', '20', '27']);
  assert.equal(monthSlots('2026-11', 0, 'uae').length, 0);
  assert.equal(parseDubaiLocal('2026-11-20T09:30')!.toISOString(), '2026-11-20T05:30:00.000Z');
  assert.equal(parseDubaiLocal('nope'), null);
  assert.equal(monthKey(new Date('2026-11-30T21:00:00Z')), '2026-12', 'late evening UTC is already December in Dubai');
});

test('next free slot skips taken days, past slots and full months', () => {
  const now = new Date('2026-11-04T00:00:00Z');
  const a = nextFreeSlot({ track: 'uae', perMonth: 4, taken: [], now });
  assert.equal(toDubaiLocal(a), '2026-11-10T09:00', 'the 3 November slot has passed');
  const b = nextFreeSlot({ track: 'uae', perMonth: 4, taken: [a!], now });
  assert.equal(toDubaiLocal(b), '2026-11-18T09:00');
  const full = monthSlots('2026-11', 4, 'uae');
  const c = nextFreeSlot({ track: 'uae', perMonth: 4, taken: full, now });
  assert.equal(toDubaiLocal(c).slice(0, 7), '2026-12', 'a full month rolls over');
  assert.equal(nextFreeSlot({ track: 'uae', perMonth: 0, taken: [], now }), null);
  const use = quotaUse([{ track: 'uae', state: 'approved', plannedFor: full[1] }, { track: 'uae', state: 'idea', plannedFor: full[2] }, { track: 'global', state: 'published', plannedFor: full[0] }], '2026-11');
  assert.deepEqual(use, { uae: 1, global: 1 });
  assert.equal(seasonalHints('uae', '2026-11', 2)[0].hints.some((h) => /White Friday/.test(h)), true);
});

/* ------------------------------------------------------------------ cron selection */
test('cron picks approved items due within the lead time, soonest first, capped', () => {
  const now = new Date('2026-11-04T00:00:00Z');
  const d = (days: number) => new Date(now.getTime() + days * 86_400_000);
  const ideas = [
    { id: 'late', state: 'approved', plannedFor: d(10), postId: null, priority: 99 },
    { id: 'soon', state: 'approved', plannedFor: d(2), postId: null, priority: 10 },
    { id: 'overdue', state: 'approved', plannedFor: d(-1), postId: null, priority: 10 },
    { id: 'hasPost', state: 'approved', plannedFor: d(1), postId: 'p1', priority: 50 },
    { id: 'idea', state: 'idea', plannedFor: d(1), postId: null, priority: 50 },
    { id: 'noslot', state: 'approved', plannedFor: null, postId: null, priority: 50 },
    { id: 'soon-hi', state: 'approved', plannedFor: d(2), postId: null, priority: 80 },
  ];
  assert.deepEqual(selectForDrafting(ideas, now, 7, 10).map((i) => i.id), ['overdue', 'soon-hi', 'soon']);
  assert.deepEqual(selectForDrafting(ideas, now, 7, 2).map((i) => i.id), ['overdue', 'soon-hi']);
  const pub = [
    { id: 'due', state: 'scheduled', plannedFor: d(-0.1), postId: 'p', priority: 1 },
    { id: 'future', state: 'scheduled', plannedFor: d(1), postId: 'p', priority: 1 },
    { id: 'ready', state: 'draft_ready', plannedFor: d(-1), postId: 'p', priority: 1 },
  ];
  assert.deepEqual(selectDuePublished(pub, now).map((i) => i.id), ['due']);
  const fresh = [
    { id: 'clean', state: 'draft_ready', plannedFor: d(3), postId: 'p', priority: 1, checks: [{ status: 'pass' }, { status: 'warn' }] },
    { id: 'failing', state: 'draft_ready', plannedFor: d(3), postId: 'p', priority: 1, checks: [{ status: 'fail' }] },
    { id: 'unchecked', state: 'draft_ready', plannedFor: d(3), postId: 'p', priority: 1, checks: [] },
  ];
  assert.deepEqual(selectAutoSchedule(fresh, false), [], 'auto-publish off by default: nothing is scheduled without the owner');
  assert.deepEqual(selectAutoSchedule(fresh, true).map((i) => i.id), ['clean']);
});

/* ------------------------------------------------------------------ cost, overlap, sections */
test('cost estimate stays in the expected range', () => {
  const prices = { 'claude-sonnet-5-5': { in: 2, out: 10 }, 'claude-haiku-5-5': { in: 0.1, out: 0.5 } };
  const en = estimateArticleCost(prices, { chat: 'claude-sonnet-5-5', fast: 'claude-haiku-5-5' });
  const ar = estimateArticleCost(prices, { chat: 'claude-sonnet-5-5', fast: 'claude-haiku-5-5' }, true);
  assert.ok(en >= 0.04 && en <= 0.15, `en ${en}`); assert.ok(ar > en && ar <= 0.2, `ar ${ar}`);
});

test('overlap detection against existing pages', () => {
  const existing = [{ path: '/guides/register-ae-domain', title: 'How to register a .ae domain', slug: 'register-ae-domain' }, { path: '/compare/ae-vs-com', title: '.ae vs .com for UAE businesses', slug: 'ae-vs-com' }];
  const same = closestExisting({ title: 'How to register a .ae domain name', primaryKeyword: 'register ae domain' }, existing)!;
  assert.equal(same.page.path, '/guides/register-ae-domain'); assert.equal(overlapLevel(same.score), 'drop');
  const other = closestExisting({ title: 'SPF, DKIM and DMARC explained', primaryKeyword: 'spf dkim dmarc' }, existing)!;
  assert.equal(overlapLevel(other.score), 'ok');
  for (const s of SEED_IDEAS) {
    const hit = closestExisting(s, existing)!;
    assert.notEqual(overlapLevel(hit.score), 'drop', `seed "${s.title}" duplicates ${hit.page.path}`);
  }
});

test('seed backlog: 12 + 12 ideas with valid fields and unique slugs', () => {
  assert.equal(SEED_IDEAS.filter((i) => i.track === 'uae').length, 12);
  assert.equal(SEED_IDEAS.filter((i) => i.track === 'global').length, 12);
  assert.equal(new Set(SEED_IDEAS.map((i) => i.slug)).size, 24);
  for (const i of SEED_IDEAS) {
    assert.match(i.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/); assert.ok(i.slug.length <= 75);
    assert.ok(i.secondaryKeywords.length >= 3 && i.secondaryKeywords.length <= 6, i.title);
    assert.match(i.target, /^(cat:[a-z0-9-]+|\/[a-z0-9-/]+)$/);
    assert.ok(!/\d{2,}[,.]?\d*\s*(searches|monthly|volume)/i.test(JSON.stringify(i)), 'no invented search volumes');
  }
});

test('section replacement keeps the rest of the article', () => {
  const md = goodArticle();
  const out = replaceSection(md, 'when shared hosting is enough', '## stray heading\nNew body text here.')!;
  const p = splitSections(out);
  assert.equal(p.sections.find((s) => s.heading === 'When shared hosting is enough')!.body, 'New body text here.');
  assert.equal(p.sections.length, splitSections(md).sections.length);
  assert.ok(out.startsWith('VPS hosting gives'));
  assert.equal(replaceSection(md, 'No such heading', 'x'), null);
  assert.equal(splitSections('```\n## not a heading\n```\n\n## Real\n\nx').sections.length, 1, 'headings inside code fences are ignored');
});

/* ------------------------------------------------------------------ parsing + mocked AI client */
test('parse model output tolerantly', () => {
  assert.deepEqual(parseJson('Here you go:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.equal(parseJson('nothing'), null);
  const ideas = parseIdeas(JSON.stringify({ ideas: [
    { title: 'SPF DKIM DMARC for small business', primaryKeyword: 'SPF DKIM DMARC', secondaryKeywords: ['email deliverability', 'spf dkim dmarc', 'x'], intent: 'weird', audienceCountry: 'Global', target: 'cat:business-email', slug: 'SPF dkim!!', priority: 400, rationale: 'r' },
    { title: 'short', primaryKeyword: 'k' },
    { title: 'Invented target idea for testing', primaryKeyword: 'some keyword', target: 'cat:not-allowed', secondaryKeywords: [] },
  ] }), ['cat:business-email']);
  assert.equal(ideas.length, 2);
  assert.equal(ideas[0].intent, 'informational'); assert.equal(ideas[0].priority, 100); assert.equal(ideas[0].slug, 'spf-dkim');
  assert.deepEqual(ideas[0].secondaryKeywords, ['email deliverability'], 'primary keyword and too-short phrases removed');
  assert.equal(ideas[1].target, '', 'unknown targets are dropped, never invented');
  assert.equal(parseDraft('{"h1":"x","sections":[]}'), null);
  assert.equal(parseArabic('{"title":"t"}'), null);
});

const DRAFT = {
  h1: 'SPF, DKIM and DMARC explained', metaTitle: 'SPF, DKIM and DMARC explained', metaDescription: 'What SPF, DKIM and DMARC do and how to set them up.', slug: 'spf-dkim-dmarc-explained',
  excerpt: 'e', intro: 'SPF DKIM DMARC records tell mail servers your email is genuine.',
  sections: [{ heading: 'What SPF does', body: '## Wrong level\nBody one.' }, { heading: 'What DKIM does', body: 'Body two. [email](/google-workspace)' }],
  faq: [{ q: 'Do I need all three?', a: 'Yes, usually.' }], takeaways: ['- Set SPF'], cta: 'See [business email](/google-workspace).',
};
function mockClient(replies: any[], opts: { reject400?: boolean } = {}) {
  const calls: any[] = [];
  return {
    calls,
    messages: {
      async create(params: any) {
        calls.push(params);
        if (opts.reject400 && params.output_config) { const e: any = new Error('output_config not supported'); e.status = 400; throw e; }
        const r = replies.shift();
        return { content: [{ type: 'text', text: typeof r === 'string' ? r : JSON.stringify(r) }], stop_reason: 'end_turn', usage: { input_tokens: 7000, output_tokens: 4000 } };
      },
    },
  };
}

test('draft pipeline with a mocked client: structured output, Markdown assembly, usage', async () => {
  const c = mockClient([DRAFT]);
  const out = await draftArticle(c, 'claude-sonnet-5-5', {
    idea: { title: 'SPF DKIM DMARC', primaryKeyword: 'spf dkim dmarc', secondaryKeywords: [], intent: 'informational', track: 'global', country: 'Global', slug: 'spf' },
    target: { ref: 'cat:business-email', label: 'Business email', path: '/google-workspace' }, links: [{ path: '/google-workspace', title: 'Business email', kind: 'category' }],
    minWords: 1200, maxWords: 2000, today: '2026-11-03',
  });
  const p = c.calls[0];
  assert.equal(p.model, 'claude-sonnet-5-5');
  assert.equal(p.output_config.format.type, 'json_schema');
  assert.match(p.system[0].text, /Never invent statistics/); assert.match(p.system[0].text, /Never name competitors/); assert.match(p.system[0].text, /Do not write prices/);
  assert.match(p.messages[0].content, /ALLOWED LINKS/); assert.match(p.messages[0].content, /\/google-workspace/);
  assert.match(out.body, /^SPF DKIM DMARC records/);
  assert.match(out.body, /## What SPF does\n\n### Wrong level/, 'H2 inside a section body is demoted to H3');
  assert.match(out.body, /## Frequently asked questions\n\n### Do I need all three\?/);
  assert.match(out.body, /> See \[business email\]/);
  assert.deepEqual(out.draft.takeaways, ['Set SPF']);
  assert.equal(out.usage.input, 7000); assert.equal(out.usage.output, 4000);
});

test('callJson falls back to a prompt-only schema when the API rejects structured output', async () => {
  const c = mockClient([{ ok: true }], { reject400: true });
  const out = await callJson(c, { model: 'm', system: 'S', user: 'U', schema: { type: 'object' }, maxTokens: 10, timeoutMs: 1000 });
  assert.equal(c.calls.length, 2); assert.ok(!c.calls[1].output_config); assert.match(c.calls[1].system[0].text, /JSON schema/);
  assert.deepEqual(JSON.parse(out.text), { ok: true });
  const bad = mockClient(['not json']);
  await assert.rejects(draftArticle(bad, 'm', { idea: { title: 't', primaryKeyword: 'k', secondaryKeywords: [], intent: 'informational', track: 'uae', country: 'AE', slug: '' }, target: null, links: [], minWords: 1, maxWords: 2, today: 'x' }), /usable draft/);
});

test('ideas and review calls with a mocked client', async () => {
  const c = mockClient([{ ideas: [{ title: 'Arabic RTL website checklist for GCC shops', primaryKeyword: 'arabic rtl website', secondaryKeywords: ['rtl css', 'bilingual site', 'hreflang'], intent: 'informational', audienceCountry: 'GCC', target: 'cat:wordpress-hosting', slug: 'arabic-rtl-website', priority: 70, rationale: 'r' }] },
    { issues: [{ severity: 'fail', type: 'fabricated', quote: '73% of shoppers', note: 'no source' }, { severity: 'odd', type: 'claim', quote: 'best', note: '' }] }]);
  const ideas = await generateIdeasWith(c, 'claude-haiku-5-5', { track: 'uae', count: 12, targets: [{ ref: 'cat:wordpress-hosting', label: 'WordPress', path: '/wordpress-hosting' }], existing: [{ title: 'How to register a .ae domain', path: '/guides/register-ae-domain' }], seasonal: seasonalHints('uae', '2026-11'), seeds: ['arabic website'], today: '2026-11-03' });
  assert.equal(ideas.ideas.length, 1);
  assert.match(c.calls[0].system[0].text, /no keyword data, only estimated intent/);
  assert.match(c.calls[0].messages[0].content, /EXISTING PAGES[\s\S]*register-ae-domain/);
  assert.match(c.calls[0].messages[0].content, /OWNER SEED KEYWORDS[\s\S]*arabic website/);
  const r = await reviewWith(c, 'claude-haiku-5-5', { title: 't', body: 'b', track: 'global' });
  assert.deepEqual(r.issues.map((i) => i.severity), ['fail', 'warn']);
});
