'use server';
// Admin → Competitor pages: edits to the "GlobalHostia vs <host>" facts are stored in settings.compare_overrides,
// on top of the researched defaults in lib/compare/competitors.ts. Every save clears the site cache (done → bust)
// and pings IndexNow for the page and the /compare hub (production only).
import { requireSession, audit } from '@/lib/session';
import { done, fail, str, bool, lines } from '@/lib/admin';
import { getSettings, setSetting } from '@/lib/settings';
import { pingChanged } from '@/lib/indexnow';
import { COMPETITORS, FACT_KEYS, FACT_LABEL, readOverrides, isoDay, validDay, validUrl, bannedIn, vsPath, type Fact, type Override, type Strength } from '@/lib/compare/competitors';

const BACK = '/admin/compare';
const cut = (t: string, n: number) => t.trim().slice(0, n);
const same = (a: Fact | null | undefined, b: Fact | null | undefined) => (!a && !b) || (!!a && !!b && a.value === b.value && a.source === b.source && a.checked === b.checked);

function check(text: string, where: string) {
  const r = bannedIn(text);
  if (r) fail(BACK, `${where}: keep the wording neutral and factual (matched ${String(r)}). GoDaddy is not named on the site.`);
}

async function write(slug: string, o: Override | null, by: Awaited<ReturnType<typeof requireSession>>, what: string) {
  const all = readOverrides(await getSettings());
  if (o && Object.keys(o).length) all[slug] = o; else delete all[slug];
  await setSetting('compare_overrides', all);
  await audit(by, 'update', 'settings', 'compare_overrides', { competitor: slug, what });
  await pingChanged([vsPath(slug), '/compare', '/sitemap.xml'], `competitor page ${what}`).catch(() => undefined);
}

/** Save every fact, the strengths, "who it suits" and the hide switch of one competitor. */
export async function saveCompetitor(fd: FormData) {
  const s = await requireSession('content');
  const slug = str(fd, 'slug');
  const base = COMPETITORS.find((c) => c.slug === slug);
  if (!base) fail(BACK, 'Unknown competitor');
  const prev = readOverrides(await getSettings())[slug] || {};
  const next: Override = { ...(prev.verifiedAt && { verifiedAt: prev.verifiedAt }) };
  if (bool(fd, 'hidden')) next.hidden = true;

  const suits = cut(str(fd, 'suits'), 300);
  if (suits) { check(suits, 'Who it suits'); if (suits !== base.suits) next.suits = suits; }

  const facts: NonNullable<Override['facts']> = {};
  for (const k of FACT_KEYS) {
    const value = cut(str(fd, `v_${k}`), 400), source = str(fd, `s_${k}`), checked = str(fd, `d_${k}`);
    let f: Fact | null = null;
    if (value) {
      check(value, FACT_LABEL[k]);
      if (!validUrl(source)) fail(BACK, `${base.name} · ${FACT_LABEL[k]}: the source must be an https:// link to the provider's own page`);
      if (!validDay(checked) || checked > isoDay()) fail(BACK, `${base.name} · ${FACT_LABEL[k]}: the checked date must be a past date (YYYY-MM-DD)`);
      f = { value, source, checked };
    }
    if (!same(f, base.facts[k])) facts[k] = f;
  }
  if (Object.keys(facts).length) next.facts = facts;

  // "text | https://source | YYYY-MM-DD", one per line
  const stronger: Strength[] = [];
  for (const l of lines(String(fd.get('stronger') ?? ''))) {
    const [text = '', source = '', checked = ''] = l.split('|').map((x) => x.trim());
    if (!text || !validUrl(source) || !validDay(checked)) fail(BACK, `${base.name} · Where it is stronger: "${l.slice(0, 60)}" must look like "text | https://source | YYYY-MM-DD"`);
    check(text, 'Where it is stronger');
    stronger.push({ text: cut(text, 300), source, checked });
  }
  if (!stronger.length) fail(BACK, `${base.name}: list at least one point where the provider is stronger (fair comparison)`);
  if (JSON.stringify(stronger) !== JSON.stringify(base.stronger)) next.stronger = stronger;

  await write(slug, next, s, next.hidden ? 'hidden' : 'saved');
  done(BACK, `${base.name} saved${next.hidden ? ' (page hidden)' : ''}`);
}

/** The owner re-checked every fact on the provider's site today: move every checked date to today. */
export async function markVerified(fd: FormData) {
  const s = await requireSession('content');
  const slug = str(fd, 'slug');
  const base = COMPETITORS.find((c) => c.slug === slug);
  if (!base) fail(BACK, 'Unknown competitor');
  const prev = readOverrides(await getSettings())[slug] || {};
  await write(slug, { ...prev, verifiedAt: isoDay() }, s, 're-verified');
  done(BACK, `${base.name} marked re-verified today`);
}

/** Show or hide one page without touching its facts. */
export async function setHidden(fd: FormData) {
  const s = await requireSession('content');
  const slug = str(fd, 'slug');
  const base = COMPETITORS.find((c) => c.slug === slug);
  if (!base) fail(BACK, 'Unknown competitor');
  const hide = str(fd, 'hide') === '1';
  const prev = readOverrides(await getSettings())[slug] || {};
  const { hidden: _h, ...rest } = prev;
  await write(slug, hide ? { ...rest, hidden: true } : rest, s, hide ? 'hidden' : 'shown');
  done(BACK, hide ? `GlobalHostia vs ${base.name} is hidden (404, out of the sitemap)` : `GlobalHostia vs ${base.name} is live`);
}

/** Drop every admin edit for one provider and use the researched defaults again. */
export async function resetCompetitor(fd: FormData) {
  const s = await requireSession('content');
  const slug = str(fd, 'slug');
  const base = COMPETITORS.find((c) => c.slug === slug);
  if (!base) fail(BACK, 'Unknown competitor');
  await write(slug, null, s, 'reset');
  done(BACK, `${base.name} reset to the researched facts`);
}
