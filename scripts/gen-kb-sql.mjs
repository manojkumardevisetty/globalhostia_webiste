// Writes docs/whmcs/kb-help-videos.sql: the 20 Help centre topics (lib/help/topics.ts) as WHMCS knowledgebase articles
// in a "How-to videos" category, each with an Arabic translation. The WHMCS API has no command to add or edit
// knowledgebase articles, so the owner imports this file in phpMyAdmin (database ofgizflz_whmcs).
// Run: node --experimental-strip-types scripts/gen-kb-sql.mjs   (re-run after topics, steps or videos change)
//
// Idempotent: articles are found again by an HTML comment marker in their body (<!-- gh-help:<slug> -->), so a
// re-import updates them in place (same ids, views and votes kept). Topics removed from topics.ts are deleted;
// no other knowledgebase content is touched.
import { writeFileSync, existsSync } from 'node:fs';
import { HELP_TOPICS, HELP_GROUPS, helpMedia, frameUrl, helpPath } from '../lib/help/topics.ts';
import { HELP_MEDIA } from '../lib/help/media.ts';

const SITE = 'https://globalhostia.com';
const CLIENT = 'https://my.globalhostia.com';
const DB = 'ofgizflz_whmcs';
const CAT = { name: 'How-to videos', desc: 'Short videos and step-by-step guides for the most common tasks: billing, domains, email, hosting and more.' };
const CAT_AR = { name: 'فيديوهات إرشادية', desc: 'فيديوهات قصيرة وأدلة خطوة بخطوة لأكثر المهام شيوعاً: الفواتير والنطاقات والبريد والاستضافة وغيرها.' };
const AR_LANG = 'arabic'; // WHMCS language name (lang/arabic.php)
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const BAK = `_bak_kb_${today}`;
const root = new URL('../', import.meta.url);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
const abs = (p) => (/^https?:/.test(p) ? p : SITE + p);
const secs = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;

// Brand: monochrome, like the branded emails (gh-email v2-mono). Inline styles only (the WHMCS skin may restyle).
const S = {
  wrap: 'max-width:820px',
  lead: 'font-size:1.05em;line-height:1.6;margin:0 0 16px',
  meta: 'font-size:.9em;opacity:.75;margin:0 0 14px',
  media: 'display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)',
  cap: 'font-size:.85em;opacity:.7;margin:6px 0 20px',
  h: 'font-size:1.15em;font-weight:700;margin:22px 0 10px',
  ol: 'margin:0 0 18px;padding-inline-start:22px;line-height:1.6',
  li: 'margin:0 0 8px',
  fig: 'margin:0 0 18px',
  figcap: 'font-size:.92em;margin:8px 0 0;line-height:1.5',
  note: 'margin:0 0 18px;padding:12px 16px;border-inline-start:3px solid #111;background:rgba(0,0,0,.04);border-radius:8px',
  box: 'margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7',
  btn: 'font-weight:600;text-decoration:underline',
};

function articleHtml(t, ar) {
  const L = (en, a) => (ar ? a : en);
  const m = helpMedia(t.slug);
  const info = HELP_MEDIA[t.slug];
  const title = ar ? t.titleAr : t.title;
  const steps = t.steps.map((x) => (ar ? x.ar || x.en : x.en));
  const out = [`<!-- gh-help:${t.slug}${ar ? ':ar' : ''} -->`, `<div class="gh-kb"${ar ? ' dir="rtl" lang="ar"' : ''} style="${S.wrap}">`];
  out.push(`<p style="${S.lead}">${esc(ar ? t.summaryAr : t.summary)}</p>`);
  const where = `${L('Where', 'المكان')}: ${esc(ar ? t.whereAr : t.where)} &middot; <a href="${esc(abs(t.start.href))}" style="${S.btn}">${esc(ar ? t.start.labelAr : t.start.label)}</a>`;
  out.push(`<p style="${S.meta}">${where}</p>`);

  if (t.kind === 'video') {
    if (!existsSync(new URL(`public${m.mp4}`, root))) throw new Error(`missing video file public${m.mp4}`);
    // crossorigin: the captions (.vtt) are on globalhostia.com, which sends CORS headers for /help/* (next.config.mjs)
    out.push(`<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="${esc(abs(m.poster))}" style="${S.media}" aria-label="${esc(title)}">`
      + `<source src="${esc(abs(m.mp4))}" type="video/mp4">`
      + `<track kind="captions" srclang="en" label="English" src="${esc(abs(m.vttEn))}">`
      + `<track kind="captions" srclang="ar" label="العربية" src="${esc(abs(m.vttAr))}"${ar ? ' default' : ''}>`
      + `<a href="${esc(abs(m.mp4))}">${L('Download the video', 'تنزيل الفيديو')}</a></video>`);
    const len = info?.duration ? `${L('Video', 'فيديو')} ${secs(info.duration)} &middot; ` : '';
    out.push(`<p style="${S.cap}">${len}${L('Captions in English and Arabic (CC button).', 'ترجمة مكتوبة بالعربية والإنجليزية (زر CC).')}</p>`);
    out.push(`<h3 style="${S.h}">${L('Steps', 'الخطوات')}</h3>`);
    out.push(`<ol style="${S.ol}">${steps.map((x) => `<li style="${S.li}">${esc(x)}</li>`).join('')}</ol>`);
  } else {
    const fr = t.frames || [];
    if (fr.length !== t.steps.length) throw new Error(`${t.slug}: ${fr.length} frames for ${t.steps.length} steps`);
    out.push(`<h3 style="${S.h}">${L('Step by step', 'خطوة بخطوة')}</h3>`);
    fr.forEach((f, i) => {
      const src = frameUrl(f.src);
      if (!existsSync(new URL(`public${src}`, root))) throw new Error(`missing frame public${src}`);
      out.push(`<figure style="${S.fig}"><img src="${esc(abs(src))}" alt="${esc(`${L('Step', 'الخطوة')} ${i + 1}: ${steps[i]}`)}" width="1280" height="720" loading="lazy" style="${S.media}">`
        + `<figcaption style="${S.figcap}"><b>${i + 1}.</b> ${esc(steps[i])}</figcaption></figure>`);
    });
  }
  if (t.note) out.push(`<p style="${S.note}">${esc(ar ? t.note.ar || t.note.en : t.note.en)}</p>`);

  const rel = (t.related || []).filter(([, href]) => href.startsWith('/'));
  const links = [
    `<a href="${esc(SITE + helpPath(t.slug))}" style="${S.btn}">${L('Watch the full guide on globalhostia.com/help/', 'شاهد الدليل الكامل على globalhostia.com/help/')}${esc(t.slug)}</a>`,
    `${L('Still stuck?', 'ما زلت بحاجة إلى مساعدة؟')} <a href="${CLIENT}/submitticket.php" style="${S.btn}">${L('Open a ticket', 'افتح تذكرة دعم')}</a>`,
  ];
  if (!ar && rel.length) links.push(`${L('Related', 'ذات صلة')}: ${rel.map(([label, href]) => `<a href="${esc(SITE + href)}">${esc(label)}</a>`).join(' &middot; ')}`);
  out.push(`<div style="${S.box}">${links.join('<br>')}</div>`, '</div>');
  return out.join('\n');
}

/** up to 6 tags: the group plus the first keywords (WHMCS tags cannot contain spaces) */
function tags(t) {
  const g = HELP_GROUPS[t.group].en.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const kw = t.keywords.toLowerCase().split(/\s+/).filter((w) => /^[a-z0-9.+-]{3,30}$/.test(w));
  return [...new Set(['how-to', t.kind === 'video' ? 'video' : 'walkthrough', ...g, ...kw])].slice(0, 8);
}

// Order: as in topics.ts (grouped by billing, domains, email, hosting, websites, account, ordering, AI).
const sql = [];
const P = (s = '') => sql.push(s);
P(`-- =====================================================================
-- GlobalHostia: Help centre how-to videos -> WHMCS knowledgebase
-- Database: ${DB}   (generated ${today} by scripts/gen-kb-sql.mjs from lib/help/topics.ts)
--
-- HOW TO RUN: cPanel -> phpMyAdmin -> click database ${DB} -> Import ->
--             choose this file (character set utf-8) -> Go.
--             (or SQL tab -> paste everything -> Go)
-- Then open ${CLIENT}/knowledgebase -> "${CAT.name}".
--
-- WHAT IT DOES
--  * Category "${CAT.name}" (+ Arabic translation) with ${HELP_TOPICS.length} articles, one per
--    topic on globalhostia.com/help, each with an Arabic translation (language '${AR_LANG}').
--  * Videos, posters, captions and walkthrough images are loaded from
--    globalhostia.com/help/... (nothing is uploaded to WHMCS).
--
-- SAFE TO RE-RUN
--  * Our articles carry an invisible marker (<!-- gh-help:<slug> -->). A re-run
--    updates them in place (ids, views and votes are kept) and never creates
--    duplicates. Marker articles whose topic no longer exists are removed.
--  * No other knowledgebase category, article, tag or translation is changed.
--  * Backups of the 4 knowledgebase tables are made first (*${BAK}), once
--    per day (CREATE TABLE IF NOT EXISTS: a re-run the same day keeps the
--    first backup).
--
-- UNDO
--  Remove only what this script added (keeps every other KB article):
--    DELETE l FROM tblknowledgebaselinks l JOIN tblknowledgebase k ON k.id = l.articleid
--      WHERE k.article LIKE '%<!-- gh-help:%';
--    DELETE g FROM tblknowledgebasetags g JOIN tblknowledgebase k ON k.id = g.articleid
--      WHERE k.article LIKE '%<!-- gh-help:%';
--    DELETE FROM tblknowledgebase WHERE article LIKE '%<!-- gh-help:%';
--    DELETE FROM tblknowledgebasecats WHERE catid IN
--      (SELECT id FROM (SELECT id FROM tblknowledgebasecats WHERE name = '${CAT.name}' AND catid = 0) x);
--    DELETE FROM tblknowledgebasecats WHERE name = '${CAT.name}' AND catid = 0;
--  Or restore the whole knowledgebase from today's backups:
--    DELETE FROM tblknowledgebase;      INSERT INTO tblknowledgebase      SELECT * FROM tblknowledgebase${BAK};
--    DELETE FROM tblknowledgebasecats;  INSERT INTO tblknowledgebasecats  SELECT * FROM tblknowledgebasecats${BAK};
--    DELETE FROM tblknowledgebaselinks; INSERT INTO tblknowledgebaselinks SELECT * FROM tblknowledgebaselinks${BAK};
--    DELETE FROM tblknowledgebasetags;  INSERT INTO tblknowledgebasetags  SELECT * FROM tblknowledgebasetags${BAK};
--
-- NOTE: do not open these articles in the WHMCS rich text editor and save:
-- TinyMCE may strip the <video>/<track> tags. Edit topics in globalhostia.com
-- Admin -> Help videos / lib/help/topics.ts and re-run the generator instead.
-- =====================================================================

USE ${DB};
SET NAMES utf8mb4;

-- 1. Backups (once per day; CREATE TABLE commits implicitly, so they come before the transaction)
CREATE TABLE IF NOT EXISTS tblknowledgebase${BAK} AS SELECT * FROM tblknowledgebase;
CREATE TABLE IF NOT EXISTS tblknowledgebasecats${BAK} AS SELECT * FROM tblknowledgebasecats;
CREATE TABLE IF NOT EXISTS tblknowledgebaselinks${BAK} AS SELECT * FROM tblknowledgebaselinks;
CREATE TABLE IF NOT EXISTS tblknowledgebasetags${BAK} AS SELECT * FROM tblknowledgebasetags;

DROP TEMPORARY TABLE IF EXISTS gh_kb_keep;
CREATE TEMPORARY TABLE gh_kb_keep (id INT NOT NULL PRIMARY KEY);

START TRANSACTION;

-- 2. Category "${CAT.name}" (found again by name; created if missing) + Arabic translation (catid = category id)
SET @cat := (SELECT id FROM tblknowledgebasecats WHERE name = ${q(CAT.name)} AND parentid = 0 AND catid = 0 AND (language = '' OR language IS NULL) ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebasecats (parentid, name, description, hidden, catid, language)
  SELECT 0, ${q(CAT.name)}, ${q(CAT.desc)}, '', 0, '' FROM DUAL WHERE @cat IS NULL;
SET @cat := IFNULL(@cat, LAST_INSERT_ID());
UPDATE tblknowledgebasecats SET description = ${q(CAT.desc)}, hidden = '' WHERE id = @cat;
SET @catar := (SELECT id FROM tblknowledgebasecats WHERE catid = @cat AND language = '${AR_LANG}' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebasecats (parentid, name, description, hidden, catid, language)
  SELECT 0, ${q(CAT_AR.name)}, ${q(CAT_AR.desc)}, '', @cat, '${AR_LANG}' FROM DUAL WHERE @catar IS NULL;
UPDATE tblknowledgebasecats SET name = ${q(CAT_AR.name)}, description = ${q(CAT_AR.desc)} WHERE catid = @cat AND language = '${AR_LANG}';
`);

HELP_TOPICS.forEach((t, i) => {
  const en = articleHtml(t, false), ar = articleHtml(t, true);
  const marker = `%<!-- gh-help:${t.slug} -->%`;
  P(`-- 3.${i + 1} ${t.slug} (${t.kind})`);
  P(`SET @a := (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE ${q(marker)} ORDER BY id LIMIT 1);`);
  P(`INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, \`order\`, parentid, language)
  SELECT ${q(t.title)}, '', 0, 0, 0, '', ${i + 1}, 0, '' FROM DUAL WHERE @a IS NULL;`);
  P(`SET @a := IFNULL(@a, LAST_INSERT_ID());`);
  P(`UPDATE tblknowledgebase SET title = ${q(t.title)}, \`order\` = ${i + 1}, article = ${q(en)} WHERE id = @a;`);
  P(`INSERT INTO gh_kb_keep (id) VALUES (@a);`);
  P(`DELETE FROM tblknowledgebaselinks WHERE articleid = @a AND categoryid = @cat;`);
  P(`INSERT INTO tblknowledgebaselinks (categoryid, articleid) VALUES (@cat, @a);`);
  P(`DELETE FROM tblknowledgebasetags WHERE articleid = @a;`);
  P(`INSERT INTO tblknowledgebasetags (articleid, tag) VALUES ${tags(t).map((g) => `(@a, ${q(g)})`).join(', ')};`);
  P(`SET @t := (SELECT id FROM tblknowledgebase WHERE parentid = @a AND language = '${AR_LANG}' ORDER BY id LIMIT 1);`);
  P(`INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, \`order\`, parentid, language)
  SELECT ${q(t.titleAr)}, '', 0, 0, 0, '', ${i + 1}, @a, '${AR_LANG}' FROM DUAL WHERE @t IS NULL;`);
  P(`UPDATE tblknowledgebase SET title = ${q(t.titleAr)}, \`order\` = ${i + 1}, article = ${q(ar)} WHERE parentid = @a AND language = '${AR_LANG}';`);
  P();
});

P(`-- 4. Remove our marker articles whose topic was dropped from lib/help/topics.ts (and their translations, links, tags)
DELETE FROM tblknowledgebase WHERE parentid > 0 AND parentid IN (SELECT id FROM (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE '%<!-- gh-help:%') x) AND parentid NOT IN (SELECT id FROM gh_kb_keep);
DELETE l FROM tblknowledgebaselinks l JOIN tblknowledgebase k ON k.id = l.articleid LEFT JOIN gh_kb_keep g ON g.id = k.id
  WHERE k.parentid = 0 AND k.article LIKE '%<!-- gh-help:%' AND g.id IS NULL;
DELETE t FROM tblknowledgebasetags t JOIN tblknowledgebase k ON k.id = t.articleid LEFT JOIN gh_kb_keep g ON g.id = k.id
  WHERE k.parentid = 0 AND k.article LIKE '%<!-- gh-help:%' AND g.id IS NULL;
DELETE k FROM tblknowledgebase k LEFT JOIN gh_kb_keep g ON g.id = k.id
  WHERE k.parentid = 0 AND k.article LIKE '%<!-- gh-help:%' AND g.id IS NULL;

COMMIT;
DROP TEMPORARY TABLE IF EXISTS gh_kb_keep;

-- 5. Check: should list ${HELP_TOPICS.length} articles, each with 1 Arabic translation
SELECT k.id, k.\`order\`, k.title, (SELECT COUNT(*) FROM tblknowledgebase x WHERE x.parentid = k.id AND x.language = '${AR_LANG}') AS arabic,
  (SELECT COUNT(*) FROM tblknowledgebasetags g WHERE g.articleid = k.id) AS tags
  FROM tblknowledgebase k JOIN tblknowledgebaselinks l ON l.articleid = k.id AND l.categoryid = @cat ORDER BY k.\`order\`;
`);

const out = sql.join('\n');
// Sanity: no 4-byte characters (older WHMCS tables are utf8mb3), no smarty-ish braces, sizes within TEXT (64 KB).
if ([...out].some((c) => c.codePointAt(0) > 0xffff)) throw new Error('SQL contains 4-byte characters (emoji?)');
for (const t of HELP_TOPICS) for (const ar of [false, true]) {
  const n = Buffer.byteLength(articleHtml(t, ar));
  if (n > 60000) throw new Error(`${t.slug}${ar ? ' (ar)' : ''}: article is ${n} bytes, over the TEXT limit`);
}
if (HELP_TOPICS.length !== 20) console.warn(`note: ${HELP_TOPICS.length} topics (expected 20)`);
writeFileSync(new URL('docs/whmcs/kb-help-videos.sql', root), out);
console.log(`wrote docs/whmcs/kb-help-videos.sql (${(out.length / 1024).toFixed(1)} KB, ${HELP_TOPICS.length} topics, ${HELP_TOPICS.filter((t) => t.kind === 'video').length} videos)`);
