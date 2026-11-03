// "GlobalHostia vs <host>" data rules (lib/compare/competitors.ts): sourced, dated, neutral facts, no GoDaddy,
// admin overrides, hide switch and the 90-day review flag. Run: node --test --experimental-strip-types tests/compare.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPETITORS, FACT_KEYS, competitors, visibleCompetitors, mergeCompetitor, readOverrides, staleItems, checkedRange, sourcesOf,
  vsPath, vsSlug, slugFromVs, isHiddenVs, bannedIn, validDay, validUrl, STALE_DAYS, VS_SLUGS,
} from '../lib/compare/competitors.ts';

const host = (u: string) => new URL(u).hostname.replace(/^www\./, '');
const text = (c: (typeof COMPETITORS)[number]) => [c.name, c.blurb, c.suits, ...FACT_KEYS.map((k) => c.facts[k]?.value || ''), ...c.stronger.map((x) => x.text)].join('\n');

test('GoDaddy is never covered or named', () => {
  for (const c of COMPETITORS) {
    assert.ok(!/godaddy/i.test(c.slug + c.site + text(c)), c.slug);
    for (const s of sourcesOf(c)) assert.ok(!/godaddy/i.test(s.url));
  }
});

test('every fact and strength has an https source on the provider’s own site and a valid checked date', () => {
  for (const c of COMPETITORS) {
    const own = host(c.site);
    for (const k of FACT_KEYS) {
      const f = c.facts[k];
      if (!f) continue;
      assert.ok(f.value.trim(), `${c.slug}.${k} value`);
      assert.ok(validUrl(f.source), `${c.slug}.${k} source`);
      assert.ok(host(f.source).endsWith(own), `${c.slug}.${k} source ${f.source} is not on ${own}`);
      assert.ok(validDay(f.checked), `${c.slug}.${k} date`);
    }
    assert.ok(c.stronger.length >= 1, `${c.slug} lists where it is stronger`);
    for (const x of c.stronger) { assert.ok(validUrl(x.source) && host(x.source).endsWith(own) && validDay(x.checked), `${c.slug} strength`); }
    assert.ok(c.facts.plan && c.facts.intro, `${c.slug} has an entry plan and a price`);
  }
});

test('wording is neutral: no disparaging words, ratings or review scores', () => {
  for (const c of COMPETITORS) assert.equal(bannedIn(text(c)), null, c.slug);
  assert.ok(bannedIn('This host is a scam'));
  assert.ok(bannedIn('Rated 4.5/5'));
  assert.ok(bannedIn('Better than GoDaddy'));
  assert.equal(bannedIn('Daily backups on every shared plan.'), null);
});

test('numbers used for computed lines match the stated facts', () => {
  for (const c of COMPETITORS) {
    if (c.num.introMo !== null) assert.ok(c.facts.intro, `${c.slug} intro number without a fact`);
    if (c.num.renewMo !== null) assert.ok(c.facts.renewal, `${c.slug} renewal number without a fact`);
    if (c.num.storageGb !== null) assert.ok(new RegExp(`\\b${c.num.storageGb}\\s*GB`).test(c.facts.storage?.value || ''), `${c.slug} storage`);
  }
});

test('unique slugs and paths', () => {
  assert.equal(new Set(COMPETITORS.map((c) => c.slug)).size, COMPETITORS.length);
  assert.equal(vsPath('hostinger'), '/compare/globalhostia-vs-hostinger');
  assert.equal(vsSlug('hostinger'), 'compare/globalhostia-vs-hostinger');
  assert.equal(slugFromVs('/compare/globalhostia-vs-ionos'), 'ionos');
  assert.equal(slugFromVs('/compare/ae-vs-com'), null);
  assert.equal(VS_SLUGS.length, COMPETITORS.length);
});

test('admin overrides: hide, edit, invalid edits become "not stated", re-verify moves dates', () => {
  const settings = { compare_overrides: JSON.stringify({
    hostinger: { hidden: true },
    namecheap: { verifiedAt: '2027-01-15', facts: { storage: { value: '25 GB SSD', source: 'https://www.namecheap.com/hosting/shared/', checked: '2027-01-10' }, panel: { value: 'x', source: 'ftp://bad', checked: '2027-01-10' } } },
  }) };
  assert.equal(readOverrides({ compare_overrides: 'not json' }).hostinger, undefined);
  const all = competitors(settings);
  assert.equal(all.find((c) => c.slug === 'hostinger')!.hidden, true);
  assert.ok(!visibleCompetitors(settings).some((c) => c.slug === 'hostinger'));
  assert.ok(isHiddenVs('/compare/globalhostia-vs-hostinger', settings));
  assert.ok(!isHiddenVs('/compare/globalhostia-vs-namecheap', settings));
  assert.ok(!isHiddenVs('/compare', settings));
  const nc = all.find((c) => c.slug === 'namecheap')!;
  assert.equal(nc.facts.storage!.value, '25 GB SSD');
  assert.equal(nc.facts.panel, null);
  for (const k of FACT_KEYS) if (nc.facts[k]) assert.equal(nc.facts[k]!.checked, '2027-01-15');
  assert.ok(nc.stronger.every((x) => x.checked === '2027-01-15'));
  assert.deepEqual(checkedRange(nc), { oldest: '2027-01-15', newest: '2027-01-15' });
});

test('facts older than 90 days are flagged; re-verifying clears the flag', () => {
  const c = COMPETITORS[0];
  const day = Date.parse(`${checkedRange(c).newest}T00:00:00Z`);
  assert.equal(staleItems(c, day + 10 * 86_400_000).any, false);
  const later = day + (STALE_DAYS + 1) * 86_400_000;
  const st = staleItems(c, later);
  assert.ok(st.any && st.facts.length > 0);
  const fresh = mergeCompetitor(c, { verifiedAt: new Date(later).toISOString().slice(0, 10) });
  assert.equal(staleItems(fresh, later).any, false);
});

test('sources are listed once each with their latest date', () => {
  for (const c of COMPETITORS) {
    const s = sourcesOf(c);
    assert.equal(new Set(s.map((x) => x.url)).size, s.length);
    assert.ok(s.length >= 1);
  }
});
