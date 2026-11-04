-- =====================================================================
-- GlobalHostia: Help centre how-to videos -> WHMCS knowledgebase
-- Database: ofgizflz_whmcs   (generated 20261104 by scripts/gen-kb-sql.mjs from lib/help/topics.ts)
--
-- HOW TO RUN: cPanel -> phpMyAdmin -> click database ofgizflz_whmcs -> Import ->
--             choose this file (character set utf-8) -> Go.
--             (or SQL tab -> paste everything -> Go)
-- Then open https://my.globalhostia.com/knowledgebase -> "How-to videos".
--
-- WHAT IT DOES
--  * Category "How-to videos" (+ Arabic translation) with 20 articles, one per
--    topic on globalhostia.com/help, each with an Arabic translation (language 'arabic').
--  * Videos, posters, captions and walkthrough images are loaded from
--    globalhostia.com/help/... (nothing is uploaded to WHMCS).
--
-- SAFE TO RE-RUN
--  * Our articles carry an invisible marker (<!-- gh-help:<slug> -->). A re-run
--    updates them in place (ids, views and votes are kept) and never creates
--    duplicates. Marker articles whose topic no longer exists are removed.
--  * No other knowledgebase category, article, tag or translation is changed.
--  * Backups of the 4 knowledgebase tables are made first (*_bak_kb_20261104), once
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
--      (SELECT id FROM (SELECT id FROM tblknowledgebasecats WHERE name = 'How-to videos' AND catid = 0) x);
--    DELETE FROM tblknowledgebasecats WHERE name = 'How-to videos' AND catid = 0;
--  Or restore the whole knowledgebase from today's backups:
--    DELETE FROM tblknowledgebase;      INSERT INTO tblknowledgebase      SELECT * FROM tblknowledgebase_bak_kb_20261104;
--    DELETE FROM tblknowledgebasecats;  INSERT INTO tblknowledgebasecats  SELECT * FROM tblknowledgebasecats_bak_kb_20261104;
--    DELETE FROM tblknowledgebaselinks; INSERT INTO tblknowledgebaselinks SELECT * FROM tblknowledgebaselinks_bak_kb_20261104;
--    DELETE FROM tblknowledgebasetags;  INSERT INTO tblknowledgebasetags  SELECT * FROM tblknowledgebasetags_bak_kb_20261104;
--
-- NOTE: do not open these articles in the WHMCS rich text editor and save:
-- TinyMCE may strip the <video>/<track> tags. Edit topics in globalhostia.com
-- Admin -> Help videos / lib/help/topics.ts and re-run the generator instead.
-- =====================================================================

USE ofgizflz_whmcs;
SET NAMES utf8mb4;

-- 1. Backups (once per day; CREATE TABLE commits implicitly, so they come before the transaction)
CREATE TABLE IF NOT EXISTS tblknowledgebase_bak_kb_20261104 AS SELECT * FROM tblknowledgebase;
CREATE TABLE IF NOT EXISTS tblknowledgebasecats_bak_kb_20261104 AS SELECT * FROM tblknowledgebasecats;
CREATE TABLE IF NOT EXISTS tblknowledgebaselinks_bak_kb_20261104 AS SELECT * FROM tblknowledgebaselinks;
CREATE TABLE IF NOT EXISTS tblknowledgebasetags_bak_kb_20261104 AS SELECT * FROM tblknowledgebasetags;

DROP TEMPORARY TABLE IF EXISTS gh_kb_keep;
CREATE TEMPORARY TABLE gh_kb_keep (id INT NOT NULL PRIMARY KEY);

START TRANSACTION;

-- 2. Category "How-to videos" (found again by name; created if missing) + Arabic translation (catid = category id)
SET @cat := (SELECT id FROM tblknowledgebasecats WHERE name = 'How-to videos' AND parentid = 0 AND catid = 0 AND (language = '' OR language IS NULL) ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebasecats (parentid, name, description, hidden, catid, language)
  SELECT 0, 'How-to videos', 'Short videos and step-by-step guides for the most common tasks: billing, domains, email, hosting and more.', '', 0, '' FROM DUAL WHERE @cat IS NULL;
SET @cat := IFNULL(@cat, LAST_INSERT_ID());
UPDATE tblknowledgebasecats SET description = 'Short videos and step-by-step guides for the most common tasks: billing, domains, email, hosting and more.', hidden = '' WHERE id = @cat;
SET @catar := (SELECT id FROM tblknowledgebasecats WHERE catid = @cat AND language = 'arabic' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebasecats (parentid, name, description, hidden, catid, language)
  SELECT 0, 'فيديوهات إرشادية', 'فيديوهات قصيرة وأدلة خطوة بخطوة لأكثر المهام شيوعاً: الفواتير والنطاقات والبريد والاستضافة وغيرها.', '', @cat, 'arabic' FROM DUAL WHERE @catar IS NULL;
UPDATE tblknowledgebasecats SET name = 'فيديوهات إرشادية', description = 'فيديوهات قصيرة وأدلة خطوة بخطوة لأكثر المهام شيوعاً: الفواتير والنطاقات والبريد والاستضافة وغيرها.' WHERE catid = @cat AND language = 'arabic';

-- 3.1 pay-an-invoice (video)
SET @a := (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE '%<!-- gh-help:pay-an-invoice -->%' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'Pay an invoice', '', 0, 0, 0, '', 1, 0, '' FROM DUAL WHERE @a IS NULL;
SET @a := IFNULL(@a, LAST_INSERT_ID());
UPDATE tblknowledgebase SET title = 'Pay an invoice', `order` = 1, article = '<!-- gh-help:pay-an-invoice -->
<div class="gh-kb" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">Find an unpaid invoice in Billing and pay it on the secure invoice page.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">Where: Account portal &middot; <a href="https://globalhostia.com/account/invoices" style="font-weight:600;text-decoration:underline">Open Billing</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/pay-an-invoice.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="Pay an invoice"><source src="https://globalhostia.com/help/videos/pay-an-invoice.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/pay-an-invoice.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/pay-an-invoice.ar.vtt"><a href="https://globalhostia.com/help/videos/pay-an-invoice.mp4">Download the video</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">Video 0:33 &middot; Captions in English and Arabic (CC button).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">Steps</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">Open Billing from the menu in your account.</li><li style="margin:0 0 8px">Choose Unpaid to see only the invoices that are due.</li><li style="margin:0 0 8px">Click Pay next to the invoice you want to pay.</li><li style="margin:0 0 8px">The invoice opens in our secure client area. Choose a payment method and confirm.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/pay-an-invoice" style="font-weight:600;text-decoration:underline">Watch the full guide on globalhostia.com/help/pay-an-invoice</a><br>Still stuck? <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">Open a ticket</a><br>Related: <a href="https://globalhostia.com/help/renew-services">Renew your services</a> &middot; <a href="https://globalhostia.com/account/invoices">Billing in your account</a></div>
</div>' WHERE id = @a;
INSERT INTO gh_kb_keep (id) VALUES (@a);
DELETE FROM tblknowledgebaselinks WHERE articleid = @a AND categoryid = @cat;
INSERT INTO tblknowledgebaselinks (categoryid, articleid) VALUES (@cat, @a);
DELETE FROM tblknowledgebasetags WHERE articleid = @a;
INSERT INTO tblknowledgebasetags (articleid, tag) VALUES (@a, 'how-to'), (@a, 'video'), (@a, 'billing'), (@a, 'renewals'), (@a, 'pay'), (@a, 'invoice'), (@a, 'bill'), (@a, 'payment');
SET @t := (SELECT id FROM tblknowledgebase WHERE parentid = @a AND language = 'arabic' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'دفع فاتورة', '', 0, 0, 0, '', 1, @a, 'arabic' FROM DUAL WHERE @t IS NULL;
UPDATE tblknowledgebase SET title = 'دفع فاتورة', `order` = 1, article = '<!-- gh-help:pay-an-invoice:ar -->
<div class="gh-kb" dir="rtl" lang="ar" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">اعثر على الفاتورة غير المدفوعة في قسم الفواتير وادفعها من صفحة الفاتورة الآمنة.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">المكان: بوابة الحساب &middot; <a href="https://globalhostia.com/account/invoices" style="font-weight:600;text-decoration:underline">افتح الفواتير</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/pay-an-invoice.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="دفع فاتورة"><source src="https://globalhostia.com/help/videos/pay-an-invoice.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/pay-an-invoice.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/pay-an-invoice.ar.vtt" default><a href="https://globalhostia.com/help/videos/pay-an-invoice.mp4">تنزيل الفيديو</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">فيديو 0:33 &middot; ترجمة مكتوبة بالعربية والإنجليزية (زر CC).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">الخطوات</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">افتح «الفواتير» من قائمة حسابك.</li><li style="margin:0 0 8px">اختر «غير مدفوعة» لعرض الفواتير المستحقة فقط.</li><li style="margin:0 0 8px">اضغط «ادفع» بجانب الفاتورة التي تريد دفعها.</li><li style="margin:0 0 8px">تُفتح الفاتورة في منطقة العملاء الآمنة. اختر طريقة الدفع وأكّد.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/pay-an-invoice" style="font-weight:600;text-decoration:underline">شاهد الدليل الكامل على globalhostia.com/help/pay-an-invoice</a><br>ما زلت بحاجة إلى مساعدة؟ <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">افتح تذكرة دعم</a></div>
</div>' WHERE parentid = @a AND language = 'arabic';

-- 3.2 renew-services (video)
SET @a := (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE '%<!-- gh-help:renew-services -->%' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'Renew services and domains', '', 0, 0, 0, '', 2, 0, '' FROM DUAL WHERE @a IS NULL;
SET @a := IFNULL(@a, LAST_INSERT_ID());
UPDATE tblknowledgebase SET title = 'Renew services and domains', `order` = 2, article = '<!-- gh-help:renew-services -->
<div class="gh-kb" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">Use the Renewals centre to renew overdue and upcoming services and domains on one invoice.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">Where: Account portal &middot; <a href="https://globalhostia.com/account/renewals" style="font-weight:600;text-decoration:underline">Open Renewals</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/renew-services.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="Renew services and domains"><source src="https://globalhostia.com/help/videos/renew-services.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/renew-services.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/renew-services.ar.vtt"><a href="https://globalhostia.com/help/videos/renew-services.mp4">Download the video</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">Video 0:33 &middot; Captions in English and Arabic (CC button).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">Steps</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">Open Renewals in your account.</li><li style="margin:0 0 8px">Check what is overdue and what renews in the next 30 and 90 days.</li><li style="margin:0 0 8px">Tick the services and domains you want to renew.</li><li style="margin:0 0 8px">Click Renew in the bar at the bottom, then pay everything you ticked on one invoice.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/renew-services" style="font-weight:600;text-decoration:underline">Watch the full guide on globalhostia.com/help/renew-services</a><br>Still stuck? <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">Open a ticket</a><br>Related: <a href="https://globalhostia.com/help/pay-an-invoice">Pay an invoice</a> &middot; <a href="https://globalhostia.com/help/change-nameservers">Change nameservers</a></div>
</div>' WHERE id = @a;
INSERT INTO gh_kb_keep (id) VALUES (@a);
DELETE FROM tblknowledgebaselinks WHERE articleid = @a AND categoryid = @cat;
INSERT INTO tblknowledgebaselinks (categoryid, articleid) VALUES (@cat, @a);
DELETE FROM tblknowledgebasetags WHERE articleid = @a;
INSERT INTO tblknowledgebasetags (articleid, tag) VALUES (@a, 'how-to'), (@a, 'video'), (@a, 'billing'), (@a, 'renewals'), (@a, 'renew'), (@a, 'renewal'), (@a, 'expiring'), (@a, 'overdue');
SET @t := (SELECT id FROM tblknowledgebase WHERE parentid = @a AND language = 'arabic' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'تجديد الخدمات والنطاقات', '', 0, 0, 0, '', 2, @a, 'arabic' FROM DUAL WHERE @t IS NULL;
UPDATE tblknowledgebase SET title = 'تجديد الخدمات والنطاقات', `order` = 2, article = '<!-- gh-help:renew-services:ar -->
<div class="gh-kb" dir="rtl" lang="ar" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">استخدم مركز التجديد لتجديد الخدمات والنطاقات المتأخرة والقادمة في فاتورة واحدة.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">المكان: بوابة الحساب &middot; <a href="https://globalhostia.com/account/renewals" style="font-weight:600;text-decoration:underline">افتح التجديدات</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/renew-services.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="تجديد الخدمات والنطاقات"><source src="https://globalhostia.com/help/videos/renew-services.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/renew-services.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/renew-services.ar.vtt" default><a href="https://globalhostia.com/help/videos/renew-services.mp4">تنزيل الفيديو</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">فيديو 0:33 &middot; ترجمة مكتوبة بالعربية والإنجليزية (زر CC).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">الخطوات</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">افتح «التجديدات» في حسابك.</li><li style="margin:0 0 8px">راجع ما هو متأخر وما يتجدد خلال 30 و90 يوماً.</li><li style="margin:0 0 8px">حدّد الخدمات والنطاقات التي تريد تجديدها.</li><li style="margin:0 0 8px">اضغط «تجديد» في الشريط أسفل الصفحة، ثم ادفع كل ما حدّدته في فاتورة واحدة.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/renew-services" style="font-weight:600;text-decoration:underline">شاهد الدليل الكامل على globalhostia.com/help/renew-services</a><br>ما زلت بحاجة إلى مساعدة؟ <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">افتح تذكرة دعم</a></div>
</div>' WHERE parentid = @a AND language = 'arabic';

-- 3.3 add-a-dns-record (video)
SET @a := (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE '%<!-- gh-help:add-a-dns-record -->%' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'Add a DNS record', '', 0, 0, 0, '', 3, 0, '' FROM DUAL WHERE @a IS NULL;
SET @a := IFNULL(@a, LAST_INSERT_ID());
UPDATE tblknowledgebase SET title = 'Add a DNS record', `order` = 3, article = '<!-- gh-help:add-a-dns-record -->
<div class="gh-kb" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">Add an A, CNAME, MX, TXT or SRV record to a domain from your account.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">Where: Account portal &middot; <a href="https://globalhostia.com/account/domains" style="font-weight:600;text-decoration:underline">Open Domains</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/add-a-dns-record.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="Add a DNS record"><source src="https://globalhostia.com/help/videos/add-a-dns-record.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/add-a-dns-record.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/add-a-dns-record.ar.vtt"><a href="https://globalhostia.com/help/videos/add-a-dns-record.mp4">Download the video</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">Video 0:33 &middot; Captions in English and Arabic (CC button).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">Steps</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">Open Domains and choose the domain.</li><li style="margin:0 0 8px">Scroll to DNS records and open Add a record.</li><li style="margin:0 0 8px">Choose the record type, then enter the name and the value.</li><li style="margin:0 0 8px">Click Add record. It appears in the list and is usually live within minutes.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/add-a-dns-record" style="font-weight:600;text-decoration:underline">Watch the full guide on globalhostia.com/help/add-a-dns-record</a><br>Still stuck? <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">Open a ticket</a><br>Related: <a href="https://globalhostia.com/help/change-nameservers">Change nameservers</a> &middot; <a href="https://globalhostia.com/help/connect-a-domain">Connect a domain to hosting</a></div>
</div>' WHERE id = @a;
INSERT INTO gh_kb_keep (id) VALUES (@a);
DELETE FROM tblknowledgebaselinks WHERE articleid = @a AND categoryid = @cat;
INSERT INTO tblknowledgebaselinks (categoryid, articleid) VALUES (@cat, @a);
DELETE FROM tblknowledgebasetags WHERE articleid = @a;
INSERT INTO tblknowledgebasetags (articleid, tag) VALUES (@a, 'how-to'), (@a, 'video'), (@a, 'domains'), (@a, 'dns'), (@a, 'record'), (@a, 'txt'), (@a, 'cname'), (@a, 'verification');
SET @t := (SELECT id FROM tblknowledgebase WHERE parentid = @a AND language = 'arabic' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'إضافة سجل DNS', '', 0, 0, 0, '', 3, @a, 'arabic' FROM DUAL WHERE @t IS NULL;
UPDATE tblknowledgebase SET title = 'إضافة سجل DNS', `order` = 3, article = '<!-- gh-help:add-a-dns-record:ar -->
<div class="gh-kb" dir="rtl" lang="ar" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">أضف سجل A أو CNAME أو MX أو TXT أو SRV إلى نطاقك من حسابك.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">المكان: بوابة الحساب &middot; <a href="https://globalhostia.com/account/domains" style="font-weight:600;text-decoration:underline">افتح النطاقات</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/add-a-dns-record.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="إضافة سجل DNS"><source src="https://globalhostia.com/help/videos/add-a-dns-record.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/add-a-dns-record.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/add-a-dns-record.ar.vtt" default><a href="https://globalhostia.com/help/videos/add-a-dns-record.mp4">تنزيل الفيديو</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">فيديو 0:33 &middot; ترجمة مكتوبة بالعربية والإنجليزية (زر CC).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">الخطوات</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">افتح «النطاقات» واختر النطاق.</li><li style="margin:0 0 8px">انتقل إلى سجلات DNS وافتح «إضافة سجل».</li><li style="margin:0 0 8px">اختر نوع السجل، ثم أدخل الاسم والقيمة.</li><li style="margin:0 0 8px">اضغط «إضافة سجل». يظهر في القائمة ويعمل عادة خلال دقائق.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/add-a-dns-record" style="font-weight:600;text-decoration:underline">شاهد الدليل الكامل على globalhostia.com/help/add-a-dns-record</a><br>ما زلت بحاجة إلى مساعدة؟ <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">افتح تذكرة دعم</a></div>
</div>' WHERE parentid = @a AND language = 'arabic';

-- 3.4 change-nameservers (video)
SET @a := (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE '%<!-- gh-help:change-nameservers -->%' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'Change nameservers', '', 0, 0, 0, '', 4, 0, '' FROM DUAL WHERE @a IS NULL;
SET @a := IFNULL(@a, LAST_INSERT_ID());
UPDATE tblknowledgebase SET title = 'Change nameservers', `order` = 4, article = '<!-- gh-help:change-nameservers -->
<div class="gh-kb" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">Point a domain to GlobalHostia or another DNS provider by changing its nameservers.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">Where: Account portal &middot; <a href="https://globalhostia.com/account/domains" style="font-weight:600;text-decoration:underline">Open Domains</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/change-nameservers.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="Change nameservers"><source src="https://globalhostia.com/help/videos/change-nameservers.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/change-nameservers.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/change-nameservers.ar.vtt"><a href="https://globalhostia.com/help/videos/change-nameservers.mp4">Download the video</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">Video 0:31 &middot; Captions in English and Arabic (CC button).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">Steps</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">Open Domains and choose the domain.</li><li style="margin:0 0 8px">Replace the nameservers with the ones you were given.</li><li style="margin:0 0 8px">Click Save nameservers.</li><li style="margin:0 0 8px">Changes usually take effect within a few hours, and up to 24 hours worldwide.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/change-nameservers" style="font-weight:600;text-decoration:underline">Watch the full guide on globalhostia.com/help/change-nameservers</a><br>Still stuck? <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">Open a ticket</a><br>Related: <a href="https://globalhostia.com/help/connect-a-domain">Connect a domain to hosting</a> &middot; <a href="https://globalhostia.com/help/add-a-dns-record">Add a DNS record</a> &middot; <a href="https://globalhostia.com/guides/change-nameservers">Nameserver guide</a></div>
</div>' WHERE id = @a;
INSERT INTO gh_kb_keep (id) VALUES (@a);
DELETE FROM tblknowledgebaselinks WHERE articleid = @a AND categoryid = @cat;
INSERT INTO tblknowledgebaselinks (categoryid, articleid) VALUES (@cat, @a);
DELETE FROM tblknowledgebasetags WHERE articleid = @a;
INSERT INTO tblknowledgebasetags (articleid, tag) VALUES (@a, 'how-to'), (@a, 'video'), (@a, 'domains'), (@a, 'dns'), (@a, 'nameservers'), (@a, 'ns1'), (@a, 'ns2'), (@a, 'point');
SET @t := (SELECT id FROM tblknowledgebase WHERE parentid = @a AND language = 'arabic' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'تغيير خوادم الأسماء', '', 0, 0, 0, '', 4, @a, 'arabic' FROM DUAL WHERE @t IS NULL;
UPDATE tblknowledgebase SET title = 'تغيير خوادم الأسماء', `order` = 4, article = '<!-- gh-help:change-nameservers:ar -->
<div class="gh-kb" dir="rtl" lang="ar" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">وجّه نطاقك إلى GlobalHostia أو مزوّد DNS آخر بتغيير خوادم الأسماء.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">المكان: بوابة الحساب &middot; <a href="https://globalhostia.com/account/domains" style="font-weight:600;text-decoration:underline">افتح النطاقات</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/change-nameservers.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="تغيير خوادم الأسماء"><source src="https://globalhostia.com/help/videos/change-nameservers.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/change-nameservers.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/change-nameservers.ar.vtt" default><a href="https://globalhostia.com/help/videos/change-nameservers.mp4">تنزيل الفيديو</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">فيديو 0:31 &middot; ترجمة مكتوبة بالعربية والإنجليزية (زر CC).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">الخطوات</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">افتح «النطاقات» واختر النطاق.</li><li style="margin:0 0 8px">استبدل خوادم الأسماء بالخوادم التي حصلت عليها.</li><li style="margin:0 0 8px">اضغط «حفظ خوادم الأسماء».</li><li style="margin:0 0 8px">تسري التغييرات عادة خلال ساعات قليلة، وقد تستغرق حتى 24 ساعة حول العالم.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/change-nameservers" style="font-weight:600;text-decoration:underline">شاهد الدليل الكامل على globalhostia.com/help/change-nameservers</a><br>ما زلت بحاجة إلى مساعدة؟ <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">افتح تذكرة دعم</a></div>
</div>' WHERE parentid = @a AND language = 'arabic';

-- 3.5 connect-a-domain (video)
SET @a := (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE '%<!-- gh-help:connect-a-domain -->%' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'Connect a domain to your hosting', '', 0, 0, 0, '', 5, 0, '' FROM DUAL WHERE @a IS NULL;
SET @a := IFNULL(@a, LAST_INSERT_ID());
UPDATE tblknowledgebase SET title = 'Connect a domain to your hosting', `order` = 5, article = '<!-- gh-help:connect-a-domain -->
<div class="gh-kb" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">Use the Connect helper in Manage hosting to point a domain at your hosting and watch it go live.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">Where: Manage hosting panel &middot; <a href="https://globalhostia.com/account/services" style="font-weight:600;text-decoration:underline">Open your services</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/connect-a-domain.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="Connect a domain to your hosting"><source src="https://globalhostia.com/help/videos/connect-a-domain.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/connect-a-domain.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/connect-a-domain.ar.vtt"><a href="https://globalhostia.com/help/videos/connect-a-domain.mp4">Download the video</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">Video 0:26 &middot; Captions in English and Arabic (CC button).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">Steps</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">Open Manage hosting. The overview lists domains that are not connected yet.</li><li style="margin:0 0 8px">Click Connect next to the domain.</li><li style="margin:0 0 8px">Follow the steps: switch the nameservers, or add the A and www records shown.</li><li style="margin:0 0 8px">The helper checks again every 30 seconds and ticks each step when it is live.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/connect-a-domain" style="font-weight:600;text-decoration:underline">Watch the full guide on globalhostia.com/help/connect-a-domain</a><br>Still stuck? <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">Open a ticket</a><br>Related: <a href="https://globalhostia.com/help/change-nameservers">Change nameservers</a> &middot; <a href="https://globalhostia.com/help/issue-ssl-certificate">Issue a free SSL certificate</a></div>
</div>' WHERE id = @a;
INSERT INTO gh_kb_keep (id) VALUES (@a);
DELETE FROM tblknowledgebaselinks WHERE articleid = @a AND categoryid = @cat;
INSERT INTO tblknowledgebaselinks (categoryid, articleid) VALUES (@cat, @a);
DELETE FROM tblknowledgebasetags WHERE articleid = @a;
INSERT INTO tblknowledgebasetags (articleid, tag) VALUES (@a, 'how-to'), (@a, 'video'), (@a, 'domains'), (@a, 'dns'), (@a, 'connect'), (@a, 'domain'), (@a, 'point'), (@a, 'hosting');
SET @t := (SELECT id FROM tblknowledgebase WHERE parentid = @a AND language = 'arabic' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'ربط نطاق باستضافتك', '', 0, 0, 0, '', 5, @a, 'arabic' FROM DUAL WHERE @t IS NULL;
UPDATE tblknowledgebase SET title = 'ربط نطاق باستضافتك', `order` = 5, article = '<!-- gh-help:connect-a-domain:ar -->
<div class="gh-kb" dir="rtl" lang="ar" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">استخدم أداة الربط في إدارة الاستضافة لتوجيه نطاقك إلى استضافتك ومتابعة تفعيله.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">المكان: لوحة إدارة الاستضافة &middot; <a href="https://globalhostia.com/account/services" style="font-weight:600;text-decoration:underline">افتح خدماتك</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/connect-a-domain.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="ربط نطاق باستضافتك"><source src="https://globalhostia.com/help/videos/connect-a-domain.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/connect-a-domain.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/connect-a-domain.ar.vtt" default><a href="https://globalhostia.com/help/videos/connect-a-domain.mp4">تنزيل الفيديو</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">فيديو 0:26 &middot; ترجمة مكتوبة بالعربية والإنجليزية (زر CC).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">الخطوات</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">افتح «إدارة الاستضافة». تعرض النظرة العامة النطاقات غير المربوطة بعد.</li><li style="margin:0 0 8px">اضغط «ربط» بجانب النطاق.</li><li style="margin:0 0 8px">اتبع الخطوات: غيّر خوادم الأسماء أو أضف سجلي A وwww الظاهرين.</li><li style="margin:0 0 8px">تعيد الأداة الفحص كل 30 ثانية وتؤشّر على كل خطوة عند تفعيلها.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/connect-a-domain" style="font-weight:600;text-decoration:underline">شاهد الدليل الكامل على globalhostia.com/help/connect-a-domain</a><br>ما زلت بحاجة إلى مساعدة؟ <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">افتح تذكرة دعم</a></div>
</div>' WHERE parentid = @a AND language = 'arabic';

-- 3.6 sell-a-domain (video)
SET @a := (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE '%<!-- gh-help:sell-a-domain -->%' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'List a domain for sale', '', 0, 0, 0, '', 6, 0, '' FROM DUAL WHERE @a IS NULL;
SET @a := IFNULL(@a, LAST_INSERT_ID());
UPDATE tblknowledgebase SET title = 'List a domain for sale', `order` = 6, article = '<!-- gh-help:sell-a-domain -->
<div class="gh-kb" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">List a domain from your account in our premium domains marketplace and set your price.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">Where: Account portal &middot; <a href="https://globalhostia.com/account/sell" style="font-weight:600;text-decoration:underline">Open Sell domains</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/sell-a-domain.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="List a domain for sale"><source src="https://globalhostia.com/help/videos/sell-a-domain.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/sell-a-domain.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/sell-a-domain.ar.vtt"><a href="https://globalhostia.com/help/videos/sell-a-domain.mp4">Download the video</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">Video 0:39 &middot; Captions in English and Arabic (CC button).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">Steps</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">Open Sell domains and click List a domain.</li><li style="margin:0 0 8px">Choose the domain from your account.</li><li style="margin:0 0 8px">Set the price, the lowest offer you accept and a short description.</li><li style="margin:0 0 8px">Accept the terms and continue. The listing goes live after review and the listing fee.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/sell-a-domain" style="font-weight:600;text-decoration:underline">Watch the full guide on globalhostia.com/help/sell-a-domain</a><br>Still stuck? <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">Open a ticket</a><br>Related: <a href="https://globalhostia.com/sell-domains">Sell your domain</a> &middot; <a href="https://globalhostia.com/premium-domains">Premium domains</a></div>
</div>' WHERE id = @a;
INSERT INTO gh_kb_keep (id) VALUES (@a);
DELETE FROM tblknowledgebaselinks WHERE articleid = @a AND categoryid = @cat;
INSERT INTO tblknowledgebaselinks (categoryid, articleid) VALUES (@cat, @a);
DELETE FROM tblknowledgebasetags WHERE articleid = @a;
INSERT INTO tblknowledgebasetags (articleid, tag) VALUES (@a, 'how-to'), (@a, 'video'), (@a, 'domains'), (@a, 'dns'), (@a, 'sell'), (@a, 'domain'), (@a, 'list'), (@a, 'for');
SET @t := (SELECT id FROM tblknowledgebase WHERE parentid = @a AND language = 'arabic' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'عرض نطاق للبيع', '', 0, 0, 0, '', 6, @a, 'arabic' FROM DUAL WHERE @t IS NULL;
UPDATE tblknowledgebase SET title = 'عرض نطاق للبيع', `order` = 6, article = '<!-- gh-help:sell-a-domain:ar -->
<div class="gh-kb" dir="rtl" lang="ar" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">اعرض نطاقاً من حسابك في سوق النطاقات المميزة وحدّد سعرك.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">المكان: بوابة الحساب &middot; <a href="https://globalhostia.com/account/sell" style="font-weight:600;text-decoration:underline">افتح بيع النطاقات</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/sell-a-domain.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="عرض نطاق للبيع"><source src="https://globalhostia.com/help/videos/sell-a-domain.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/sell-a-domain.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/sell-a-domain.ar.vtt" default><a href="https://globalhostia.com/help/videos/sell-a-domain.mp4">تنزيل الفيديو</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">فيديو 0:39 &middot; ترجمة مكتوبة بالعربية والإنجليزية (زر CC).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">الخطوات</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">افتح «بيع النطاقات» واضغط «اعرض نطاقاً».</li><li style="margin:0 0 8px">اختر النطاق من حسابك.</li><li style="margin:0 0 8px">حدّد السعر وأقل عرض تقبله ووصفاً قصيراً.</li><li style="margin:0 0 8px">وافق على الشروط وتابع. يظهر العرض بعد المراجعة ودفع رسوم الإدراج.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/sell-a-domain" style="font-weight:600;text-decoration:underline">شاهد الدليل الكامل على globalhostia.com/help/sell-a-domain</a><br>ما زلت بحاجة إلى مساعدة؟ <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">افتح تذكرة دعم</a></div>
</div>' WHERE parentid = @a AND language = 'arabic';

-- 3.7 set-up-email (video)
SET @a := (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE '%<!-- gh-help:set-up-email -->%' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'Create a mailbox and set it up on your phone or Outlook', '', 0, 0, 0, '', 7, 0, '' FROM DUAL WHERE @a IS NULL;
SET @a := IFNULL(@a, LAST_INSERT_ID());
UPDATE tblknowledgebase SET title = 'Create a mailbox and set it up on your phone or Outlook', `order` = 7, article = '<!-- gh-help:set-up-email -->
<div class="gh-kb" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">Create an email address on your domain, then follow the setup helper for iPhone, Android, Outlook or Thunderbird.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">Where: Manage hosting panel &middot; <a href="https://globalhostia.com/account/services" style="font-weight:600;text-decoration:underline">Open your services</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/set-up-email.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="Create a mailbox and set it up on your phone or Outlook"><source src="https://globalhostia.com/help/videos/set-up-email.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/set-up-email.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/set-up-email.ar.vtt"><a href="https://globalhostia.com/help/videos/set-up-email.mp4">Download the video</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">Video 0:37 &middot; Captions in English and Arabic (CC button).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">Steps</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">In Manage hosting, open Mailboxes and click New mailbox.</li><li style="margin:0 0 8px">Enter the name and a strong password, then click Create.</li><li style="margin:0 0 8px">Click Set up on device next to the new mailbox.</li><li style="margin:0 0 8px">Pick your app: iPhone gets a one-tap profile, Android and Outlook get exact server settings.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/set-up-email" style="font-weight:600;text-decoration:underline">Watch the full guide on globalhostia.com/help/set-up-email</a><br>Still stuck? <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">Open a ticket</a><br>Related: <a href="https://globalhostia.com/guides/business-email-setup">Business email setup guide</a> &middot; <a href="https://globalhostia.com/help/add-a-dns-record">Add a DNS record</a></div>
</div>' WHERE id = @a;
INSERT INTO gh_kb_keep (id) VALUES (@a);
DELETE FROM tblknowledgebaselinks WHERE articleid = @a AND categoryid = @cat;
INSERT INTO tblknowledgebaselinks (categoryid, articleid) VALUES (@cat, @a);
DELETE FROM tblknowledgebasetags WHERE articleid = @a;
INSERT INTO tblknowledgebasetags (articleid, tag) VALUES (@a, 'how-to'), (@a, 'video'), (@a, 'email'), (@a, 'mailbox'), (@a, 'create'), (@a, 'outlook'), (@a, 'iphone'), (@a, 'android');
SET @t := (SELECT id FROM tblknowledgebase WHERE parentid = @a AND language = 'arabic' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'إنشاء بريد وإعداده على الهاتف أو Outlook', '', 0, 0, 0, '', 7, @a, 'arabic' FROM DUAL WHERE @t IS NULL;
UPDATE tblknowledgebase SET title = 'إنشاء بريد وإعداده على الهاتف أو Outlook', `order` = 7, article = '<!-- gh-help:set-up-email:ar -->
<div class="gh-kb" dir="rtl" lang="ar" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">أنشئ عنوان بريد على نطاقك ثم اتبع مساعد الإعداد لأجهزة iPhone وAndroid وOutlook وThunderbird.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">المكان: لوحة إدارة الاستضافة &middot; <a href="https://globalhostia.com/account/services" style="font-weight:600;text-decoration:underline">افتح خدماتك</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/set-up-email.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="إنشاء بريد وإعداده على الهاتف أو Outlook"><source src="https://globalhostia.com/help/videos/set-up-email.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/set-up-email.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/set-up-email.ar.vtt" default><a href="https://globalhostia.com/help/videos/set-up-email.mp4">تنزيل الفيديو</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">فيديو 0:37 &middot; ترجمة مكتوبة بالعربية والإنجليزية (زر CC).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">الخطوات</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">في «إدارة الاستضافة» افتح «صناديق البريد» واضغط «صندوق بريد جديد».</li><li style="margin:0 0 8px">أدخل الاسم وكلمة مرور قوية ثم اضغط «إنشاء».</li><li style="margin:0 0 8px">اضغط «إعداد على جهاز» بجانب صندوق البريد الجديد.</li><li style="margin:0 0 8px">اختر تطبيقك: يحصل iPhone على ملف إعداد بلمسة واحدة، ويحصل Android وOutlook على إعدادات الخوادم بدقة.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/set-up-email" style="font-weight:600;text-decoration:underline">شاهد الدليل الكامل على globalhostia.com/help/set-up-email</a><br>ما زلت بحاجة إلى مساعدة؟ <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">افتح تذكرة دعم</a></div>
</div>' WHERE parentid = @a AND language = 'arabic';

-- 3.8 issue-ssl-certificate (video)
SET @a := (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE '%<!-- gh-help:issue-ssl-certificate -->%' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'Issue a free SSL certificate', '', 0, 0, 0, '', 8, 0, '' FROM DUAL WHERE @a IS NULL;
SET @a := IFNULL(@a, LAST_INSERT_ID());
UPDATE tblknowledgebase SET title = 'Issue a free SSL certificate', `order` = 8, article = '<!-- gh-help:issue-ssl-certificate -->
<div class="gh-kb" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">Turn on HTTPS for a domain with a free Let’s Encrypt certificate.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">Where: Manage hosting panel &middot; <a href="https://globalhostia.com/account/services" style="font-weight:600;text-decoration:underline">Open your services</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/issue-ssl-certificate.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="Issue a free SSL certificate"><source src="https://globalhostia.com/help/videos/issue-ssl-certificate.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/issue-ssl-certificate.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/issue-ssl-certificate.ar.vtt"><a href="https://globalhostia.com/help/videos/issue-ssl-certificate.mp4">Download the video</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">Video 0:25 &middot; Captions in English and Arabic (CC button).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">Steps</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">In Manage hosting, open SSL.</li><li style="margin:0 0 8px">Find the domain marked Not secure. Keep Include www ticked.</li><li style="margin:0 0 8px">Click Issue free SSL and wait a few seconds.</li><li style="margin:0 0 8px">The domain now shows Secure, with the expiry date. It renews automatically.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/issue-ssl-certificate" style="font-weight:600;text-decoration:underline">Watch the full guide on globalhostia.com/help/issue-ssl-certificate</a><br>Still stuck? <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">Open a ticket</a><br>Related: <a href="https://globalhostia.com/ssl-certificate">SSL certificates</a> &middot; <a href="https://globalhostia.com/guides/install-ssl">Install SSL guide</a></div>
</div>' WHERE id = @a;
INSERT INTO gh_kb_keep (id) VALUES (@a);
DELETE FROM tblknowledgebaselinks WHERE articleid = @a AND categoryid = @cat;
INSERT INTO tblknowledgebaselinks (categoryid, articleid) VALUES (@cat, @a);
DELETE FROM tblknowledgebasetags WHERE articleid = @a;
INSERT INTO tblknowledgebasetags (articleid, tag) VALUES (@a, 'how-to'), (@a, 'video'), (@a, 'hosting'), (@a, 'panel'), (@a, 'ssl'), (@a, 'https'), (@a, 'certificate'), (@a, 'lets');
SET @t := (SELECT id FROM tblknowledgebase WHERE parentid = @a AND language = 'arabic' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'إصدار شهادة SSL مجانية', '', 0, 0, 0, '', 8, @a, 'arabic' FROM DUAL WHERE @t IS NULL;
UPDATE tblknowledgebase SET title = 'إصدار شهادة SSL مجانية', `order` = 8, article = '<!-- gh-help:issue-ssl-certificate:ar -->
<div class="gh-kb" dir="rtl" lang="ar" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">فعّل HTTPS لنطاقك بشهادة Let’s Encrypt مجانية.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">المكان: لوحة إدارة الاستضافة &middot; <a href="https://globalhostia.com/account/services" style="font-weight:600;text-decoration:underline">افتح خدماتك</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/issue-ssl-certificate.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="إصدار شهادة SSL مجانية"><source src="https://globalhostia.com/help/videos/issue-ssl-certificate.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/issue-ssl-certificate.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/issue-ssl-certificate.ar.vtt" default><a href="https://globalhostia.com/help/videos/issue-ssl-certificate.mp4">تنزيل الفيديو</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">فيديو 0:25 &middot; ترجمة مكتوبة بالعربية والإنجليزية (زر CC).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">الخطوات</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">في «إدارة الاستضافة» افتح «SSL».</li><li style="margin:0 0 8px">ابحث عن النطاق المعلَّم «غير آمن». أبقِ خيار تضمين www محدداً.</li><li style="margin:0 0 8px">اضغط «إصدار SSL مجاني» وانتظر بضع ثوانٍ.</li><li style="margin:0 0 8px">يظهر النطاق الآن «آمن» مع تاريخ الانتهاء، ويتجدد تلقائياً.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/issue-ssl-certificate" style="font-weight:600;text-decoration:underline">شاهد الدليل الكامل على globalhostia.com/help/issue-ssl-certificate</a><br>ما زلت بحاجة إلى مساعدة؟ <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">افتح تذكرة دعم</a></div>
</div>' WHERE parentid = @a AND language = 'arabic';

-- 3.9 upload-files (video)
SET @a := (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE '%<!-- gh-help:upload-files -->%' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'Upload files with the file manager', '', 0, 0, 0, '', 9, 0, '' FROM DUAL WHERE @a IS NULL;
SET @a := IFNULL(@a, LAST_INSERT_ID());
UPDATE tblknowledgebase SET title = 'Upload files with the file manager', `order` = 9, article = '<!-- gh-help:upload-files -->
<div class="gh-kb" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">Open the file manager, go to your website folder and upload a file.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">Where: Manage hosting panel &middot; <a href="https://globalhostia.com/account/services" style="font-weight:600;text-decoration:underline">Open your services</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/upload-files.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="Upload files with the file manager"><source src="https://globalhostia.com/help/videos/upload-files.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/upload-files.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/upload-files.ar.vtt"><a href="https://globalhostia.com/help/videos/upload-files.mp4">Download the video</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">Video 0:23 &middot; Captions in English and Arabic (CC button).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">Steps</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">In Manage hosting, open File manager.</li><li style="margin:0 0 8px">Pick the website. Its public_html folder opens.</li><li style="margin:0 0 8px">Click Upload and choose the file (up to 4 MB; use FTP for bigger files).</li><li style="margin:0 0 8px">The file appears in the list when the upload finishes.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/upload-files" style="font-weight:600;text-decoration:underline">Watch the full guide on globalhostia.com/help/upload-files</a><br>Still stuck? <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">Open a ticket</a><br>Related: <a href="https://globalhostia.com/guides/move-website-to-hostia">Move a website to Globalhostia</a> &middot; <a href="https://globalhostia.com/free-migration">Free migration</a></div>
</div>' WHERE id = @a;
INSERT INTO gh_kb_keep (id) VALUES (@a);
DELETE FROM tblknowledgebaselinks WHERE articleid = @a AND categoryid = @cat;
INSERT INTO tblknowledgebaselinks (categoryid, articleid) VALUES (@cat, @a);
DELETE FROM tblknowledgebasetags WHERE articleid = @a;
INSERT INTO tblknowledgebasetags (articleid, tag) VALUES (@a, 'how-to'), (@a, 'video'), (@a, 'hosting'), (@a, 'panel'), (@a, 'file'), (@a, 'manager'), (@a, 'upload'), (@a, 'files');
SET @t := (SELECT id FROM tblknowledgebase WHERE parentid = @a AND language = 'arabic' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'رفع الملفات بمدير الملفات', '', 0, 0, 0, '', 9, @a, 'arabic' FROM DUAL WHERE @t IS NULL;
UPDATE tblknowledgebase SET title = 'رفع الملفات بمدير الملفات', `order` = 9, article = '<!-- gh-help:upload-files:ar -->
<div class="gh-kb" dir="rtl" lang="ar" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">افتح مدير الملفات وانتقل إلى مجلد موقعك وارفع ملفاً.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">المكان: لوحة إدارة الاستضافة &middot; <a href="https://globalhostia.com/account/services" style="font-weight:600;text-decoration:underline">افتح خدماتك</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/upload-files.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="رفع الملفات بمدير الملفات"><source src="https://globalhostia.com/help/videos/upload-files.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/upload-files.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/upload-files.ar.vtt" default><a href="https://globalhostia.com/help/videos/upload-files.mp4">تنزيل الفيديو</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">فيديو 0:23 &middot; ترجمة مكتوبة بالعربية والإنجليزية (زر CC).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">الخطوات</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">في «إدارة الاستضافة» افتح «مدير الملفات».</li><li style="margin:0 0 8px">اختر الموقع، فيُفتح مجلد public_html الخاص به.</li><li style="margin:0 0 8px">اضغط «رفع» واختر الملف (حتى 4 ميغابايت، واستخدم FTP للملفات الأكبر).</li><li style="margin:0 0 8px">يظهر الملف في القائمة عند انتهاء الرفع.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/upload-files" style="font-weight:600;text-decoration:underline">شاهد الدليل الكامل على globalhostia.com/help/upload-files</a><br>ما زلت بحاجة إلى مساعدة؟ <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">افتح تذكرة دعم</a></div>
</div>' WHERE parentid = @a AND language = 'arabic';

-- 3.10 create-a-database (video)
SET @a := (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE '%<!-- gh-help:create-a-database -->%' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'Create a MySQL database', '', 0, 0, 0, '', 10, 0, '' FROM DUAL WHERE @a IS NULL;
SET @a := IFNULL(@a, LAST_INSERT_ID());
UPDATE tblknowledgebase SET title = 'Create a MySQL database', `order` = 10, article = '<!-- gh-help:create-a-database -->
<div class="gh-kb" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">Create a database and its user for a website or app.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">Where: Manage hosting panel &middot; <a href="https://globalhostia.com/account/services" style="font-weight:600;text-decoration:underline">Open your services</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/create-a-database.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="Create a MySQL database"><source src="https://globalhostia.com/help/videos/create-a-database.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/create-a-database.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/create-a-database.ar.vtt"><a href="https://globalhostia.com/help/videos/create-a-database.mp4">Download the video</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">Video 0:28 &middot; Captions in English and Arabic (CC button).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">Steps</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">In Manage hosting, open Databases and click New database.</li><li style="margin:0 0 8px">Enter the database name and the user name. The account prefix is added for you.</li><li style="margin:0 0 8px">Click Generate for a strong password (save it), then Create database.</li><li style="margin:0 0 8px">Connect your app with host localhost and the new name, user and password.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/create-a-database" style="font-weight:600;text-decoration:underline">Watch the full guide on globalhostia.com/help/create-a-database</a><br>Still stuck? <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">Open a ticket</a><br>Related: <a href="https://globalhostia.com/help/install-wordpress">Install WordPress</a> &middot; <a href="https://globalhostia.com/help/upload-files">Upload files</a></div>
</div>' WHERE id = @a;
INSERT INTO gh_kb_keep (id) VALUES (@a);
DELETE FROM tblknowledgebaselinks WHERE articleid = @a AND categoryid = @cat;
INSERT INTO tblknowledgebaselinks (categoryid, articleid) VALUES (@cat, @a);
DELETE FROM tblknowledgebasetags WHERE articleid = @a;
INSERT INTO tblknowledgebasetags (articleid, tag) VALUES (@a, 'how-to'), (@a, 'video'), (@a, 'hosting'), (@a, 'panel'), (@a, 'mysql'), (@a, 'database'), (@a, 'create'), (@a, 'user');
SET @t := (SELECT id FROM tblknowledgebase WHERE parentid = @a AND language = 'arabic' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'إنشاء قاعدة بيانات MySQL', '', 0, 0, 0, '', 10, @a, 'arabic' FROM DUAL WHERE @t IS NULL;
UPDATE tblknowledgebase SET title = 'إنشاء قاعدة بيانات MySQL', `order` = 10, article = '<!-- gh-help:create-a-database:ar -->
<div class="gh-kb" dir="rtl" lang="ar" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">أنشئ قاعدة بيانات ومستخدماً لها لموقعك أو تطبيقك.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">المكان: لوحة إدارة الاستضافة &middot; <a href="https://globalhostia.com/account/services" style="font-weight:600;text-decoration:underline">افتح خدماتك</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/create-a-database.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="إنشاء قاعدة بيانات MySQL"><source src="https://globalhostia.com/help/videos/create-a-database.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/create-a-database.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/create-a-database.ar.vtt" default><a href="https://globalhostia.com/help/videos/create-a-database.mp4">تنزيل الفيديو</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">فيديو 0:28 &middot; ترجمة مكتوبة بالعربية والإنجليزية (زر CC).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">الخطوات</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">في «إدارة الاستضافة» افتح «قواعد البيانات» واضغط «قاعدة بيانات جديدة».</li><li style="margin:0 0 8px">أدخل اسم قاعدة البيانات واسم المستخدم. تُضاف بادئة الحساب تلقائياً.</li><li style="margin:0 0 8px">اضغط «توليد» للحصول على كلمة مرور قوية (احفظها)، ثم «إنشاء قاعدة البيانات».</li><li style="margin:0 0 8px">اربط تطبيقك بالمضيف localhost والاسم والمستخدم وكلمة المرور الجديدة.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/create-a-database" style="font-weight:600;text-decoration:underline">شاهد الدليل الكامل على globalhostia.com/help/create-a-database</a><br>ما زلت بحاجة إلى مساعدة؟ <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">افتح تذكرة دعم</a></div>
</div>' WHERE parentid = @a AND language = 'arabic';

-- 3.11 change-php-version (video)
SET @a := (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE '%<!-- gh-help:change-php-version -->%' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'Change the PHP version', '', 0, 0, 0, '', 11, 0, '' FROM DUAL WHERE @a IS NULL;
SET @a := IFNULL(@a, LAST_INSERT_ID());
UPDATE tblknowledgebase SET title = 'Change the PHP version', `order` = 11, article = '<!-- gh-help:change-php-version -->
<div class="gh-kb" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">Switch the PHP version a website runs on.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">Where: Manage hosting panel &middot; <a href="https://globalhostia.com/account/services" style="font-weight:600;text-decoration:underline">Open your services</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/change-php-version.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="Change the PHP version"><source src="https://globalhostia.com/help/videos/change-php-version.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/change-php-version.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/change-php-version.ar.vtt"><a href="https://globalhostia.com/help/videos/change-php-version.mp4">Download the video</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">Video 0:21 &middot; Captions in English and Arabic (CC button).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">Steps</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">In Manage hosting, open PHP version.</li><li style="margin:0 0 8px">Choose the domain, then the version you need.</li><li style="margin:0 0 8px">Click Switch version.</li><li style="margin:0 0 8px">Open your website and check that it still works.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/change-php-version" style="font-weight:600;text-decoration:underline">Watch the full guide on globalhostia.com/help/change-php-version</a><br>Still stuck? <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">Open a ticket</a><br>Related: <a href="https://globalhostia.com/help/install-wordpress">Install WordPress</a> &middot; <a href="https://globalhostia.com/help/restore-a-backup">Restore a backup</a></div>
</div>' WHERE id = @a;
INSERT INTO gh_kb_keep (id) VALUES (@a);
DELETE FROM tblknowledgebaselinks WHERE articleid = @a AND categoryid = @cat;
INSERT INTO tblknowledgebaselinks (categoryid, articleid) VALUES (@cat, @a);
DELETE FROM tblknowledgebasetags WHERE articleid = @a;
INSERT INTO tblknowledgebasetags (articleid, tag) VALUES (@a, 'how-to'), (@a, 'video'), (@a, 'hosting'), (@a, 'panel'), (@a, 'php'), (@a, 'version'), (@a, '8.3'), (@a, '8.2');
SET @t := (SELECT id FROM tblknowledgebase WHERE parentid = @a AND language = 'arabic' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'تغيير إصدار PHP', '', 0, 0, 0, '', 11, @a, 'arabic' FROM DUAL WHERE @t IS NULL;
UPDATE tblknowledgebase SET title = 'تغيير إصدار PHP', `order` = 11, article = '<!-- gh-help:change-php-version:ar -->
<div class="gh-kb" dir="rtl" lang="ar" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">غيّر إصدار PHP الذي يعمل عليه موقعك.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">المكان: لوحة إدارة الاستضافة &middot; <a href="https://globalhostia.com/account/services" style="font-weight:600;text-decoration:underline">افتح خدماتك</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/change-php-version.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="تغيير إصدار PHP"><source src="https://globalhostia.com/help/videos/change-php-version.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/change-php-version.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/change-php-version.ar.vtt" default><a href="https://globalhostia.com/help/videos/change-php-version.mp4">تنزيل الفيديو</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">فيديو 0:21 &middot; ترجمة مكتوبة بالعربية والإنجليزية (زر CC).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">الخطوات</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">في «إدارة الاستضافة» افتح «إصدار PHP».</li><li style="margin:0 0 8px">اختر النطاق ثم الإصدار الذي تحتاجه.</li><li style="margin:0 0 8px">اضغط «تبديل الإصدار».</li><li style="margin:0 0 8px">افتح موقعك وتأكد من أنه يعمل بشكل سليم.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/change-php-version" style="font-weight:600;text-decoration:underline">شاهد الدليل الكامل على globalhostia.com/help/change-php-version</a><br>ما زلت بحاجة إلى مساعدة؟ <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">افتح تذكرة دعم</a></div>
</div>' WHERE parentid = @a AND language = 'arabic';

-- 3.12 restore-a-backup (video)
SET @a := (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE '%<!-- gh-help:restore-a-backup -->%' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'Restore a backup', '', 0, 0, 0, '', 12, 0, '' FROM DUAL WHERE @a IS NULL;
SET @a := IFNULL(@a, LAST_INSERT_ID());
UPDATE tblknowledgebase SET title = 'Restore a backup', `order` = 12, article = '<!-- gh-help:restore-a-backup -->
<div class="gh-kb" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">Restore your websites, email and databases from one of the daily backups.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">Where: Manage hosting panel &middot; <a href="https://globalhostia.com/account/services" style="font-weight:600;text-decoration:underline">Open your services</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/restore-a-backup.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="Restore a backup"><source src="https://globalhostia.com/help/videos/restore-a-backup.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/restore-a-backup.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/restore-a-backup.ar.vtt"><a href="https://globalhostia.com/help/videos/restore-a-backup.mp4">Download the video</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">Video 0:25 &middot; Captions in English and Arabic (CC button).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">Steps</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">In Manage hosting, open Backups.</li><li style="margin:0 0 8px">Find the backup from before the problem started.</li><li style="margin:0 0 8px">Click Restore and confirm. Files changed since then are replaced.</li><li style="margin:0 0 8px">You get an email when the restore finishes. Use Create backup first if you want a copy of today.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/restore-a-backup" style="font-weight:600;text-decoration:underline">Watch the full guide on globalhostia.com/help/restore-a-backup</a><br>Still stuck? <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">Open a ticket</a><br>Related: <a href="https://globalhostia.com/help/upload-files">Upload files</a> &middot; <a href="https://globalhostia.com/help/open-a-support-ticket">Open a support ticket</a></div>
</div>' WHERE id = @a;
INSERT INTO gh_kb_keep (id) VALUES (@a);
DELETE FROM tblknowledgebaselinks WHERE articleid = @a AND categoryid = @cat;
INSERT INTO tblknowledgebaselinks (categoryid, articleid) VALUES (@cat, @a);
DELETE FROM tblknowledgebasetags WHERE articleid = @a;
INSERT INTO tblknowledgebasetags (articleid, tag) VALUES (@a, 'how-to'), (@a, 'video'), (@a, 'hosting'), (@a, 'panel'), (@a, 'backup'), (@a, 'restore'), (@a, 'undo'), (@a, 'deleted');
SET @t := (SELECT id FROM tblknowledgebase WHERE parentid = @a AND language = 'arabic' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'استعادة نسخة احتياطية', '', 0, 0, 0, '', 12, @a, 'arabic' FROM DUAL WHERE @t IS NULL;
UPDATE tblknowledgebase SET title = 'استعادة نسخة احتياطية', `order` = 12, article = '<!-- gh-help:restore-a-backup:ar -->
<div class="gh-kb" dir="rtl" lang="ar" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">استعد مواقعك وبريدك وقواعد بياناتك من إحدى النسخ الاحتياطية اليومية.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">المكان: لوحة إدارة الاستضافة &middot; <a href="https://globalhostia.com/account/services" style="font-weight:600;text-decoration:underline">افتح خدماتك</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/restore-a-backup.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="استعادة نسخة احتياطية"><source src="https://globalhostia.com/help/videos/restore-a-backup.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/restore-a-backup.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/restore-a-backup.ar.vtt" default><a href="https://globalhostia.com/help/videos/restore-a-backup.mp4">تنزيل الفيديو</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">فيديو 0:25 &middot; ترجمة مكتوبة بالعربية والإنجليزية (زر CC).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">الخطوات</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">في «إدارة الاستضافة» افتح «النسخ الاحتياطية».</li><li style="margin:0 0 8px">ابحث عن النسخة السابقة لبدء المشكلة.</li><li style="margin:0 0 8px">اضغط «استعادة» وأكّد. تُستبدل الملفات التي تغيّرت منذ ذلك الحين.</li><li style="margin:0 0 8px">ستصلك رسالة عند انتهاء الاستعادة. أنشئ نسخة احتياطية أولاً إن أردت حفظ نسخة اليوم.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/restore-a-backup" style="font-weight:600;text-decoration:underline">شاهد الدليل الكامل على globalhostia.com/help/restore-a-backup</a><br>ما زلت بحاجة إلى مساعدة؟ <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">افتح تذكرة دعم</a></div>
</div>' WHERE parentid = @a AND language = 'arabic';

-- 3.13 install-wordpress (video)
SET @a := (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE '%<!-- gh-help:install-wordpress -->%' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'Install WordPress and make a staging copy', '', 0, 0, 0, '', 13, 0, '' FROM DUAL WHERE @a IS NULL;
SET @a := IFNULL(@a, LAST_INSERT_ID());
UPDATE tblknowledgebase SET title = 'Install WordPress and make a staging copy', `order` = 13, article = '<!-- gh-help:install-wordpress -->
<div class="gh-kb" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">Install WordPress in one click, then make a staging copy to test changes safely.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">Where: Manage hosting panel &middot; <a href="https://globalhostia.com/account/services" style="font-weight:600;text-decoration:underline">Open your services</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/install-wordpress.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="Install WordPress and make a staging copy"><source src="https://globalhostia.com/help/videos/install-wordpress.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/install-wordpress.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/install-wordpress.ar.vtt"><a href="https://globalhostia.com/help/videos/install-wordpress.mp4">Download the video</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">Video 0:51 &middot; Captions in English and Arabic (CC button).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">Steps</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">In Manage hosting, open WordPress and click Install WordPress.</li><li style="margin:0 0 8px">Choose the domain, enter the site title and admin email, then install.</li><li style="margin:0 0 8px">When it is ready, use Log in to WP admin. No password needed.</li><li style="margin:0 0 8px">To test changes, open the site menu and choose Create staging copy.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/install-wordpress" style="font-weight:600;text-decoration:underline">Watch the full guide on globalhostia.com/help/install-wordpress</a><br>Still stuck? <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">Open a ticket</a><br>Related: <a href="https://globalhostia.com/wordpress-hosting">WordPress hosting</a> &middot; <a href="https://globalhostia.com/guides/install-wordpress">Install WordPress guide</a></div>
</div>' WHERE id = @a;
INSERT INTO gh_kb_keep (id) VALUES (@a);
DELETE FROM tblknowledgebaselinks WHERE articleid = @a AND categoryid = @cat;
INSERT INTO tblknowledgebaselinks (categoryid, articleid) VALUES (@cat, @a);
DELETE FROM tblknowledgebasetags WHERE articleid = @a;
INSERT INTO tblknowledgebasetags (articleid, tag) VALUES (@a, 'how-to'), (@a, 'video'), (@a, 'websites'), (@a, 'wordpress'), (@a, 'install'), (@a, 'one'), (@a, 'click'), (@a, 'staging');
SET @t := (SELECT id FROM tblknowledgebase WHERE parentid = @a AND language = 'arabic' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'تثبيت ووردبريس وإنشاء نسخة تجريبية', '', 0, 0, 0, '', 13, @a, 'arabic' FROM DUAL WHERE @t IS NULL;
UPDATE tblknowledgebase SET title = 'تثبيت ووردبريس وإنشاء نسخة تجريبية', `order` = 13, article = '<!-- gh-help:install-wordpress:ar -->
<div class="gh-kb" dir="rtl" lang="ar" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">ثبّت ووردبريس بنقرة واحدة، ثم أنشئ نسخة تجريبية لاختبار التغييرات بأمان.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">المكان: لوحة إدارة الاستضافة &middot; <a href="https://globalhostia.com/account/services" style="font-weight:600;text-decoration:underline">افتح خدماتك</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/install-wordpress.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="تثبيت ووردبريس وإنشاء نسخة تجريبية"><source src="https://globalhostia.com/help/videos/install-wordpress.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/install-wordpress.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/install-wordpress.ar.vtt" default><a href="https://globalhostia.com/help/videos/install-wordpress.mp4">تنزيل الفيديو</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">فيديو 0:51 &middot; ترجمة مكتوبة بالعربية والإنجليزية (زر CC).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">الخطوات</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">في «إدارة الاستضافة» افتح «ووردبريس» واضغط «تثبيت ووردبريس».</li><li style="margin:0 0 8px">اختر النطاق وأدخل عنوان الموقع وبريد المدير، ثم ثبّت.</li><li style="margin:0 0 8px">عند الجاهزية استخدم «الدخول إلى لوحة ووردبريس» دون كلمة مرور.</li><li style="margin:0 0 8px">لاختبار التغييرات افتح قائمة الموقع واختر «إنشاء نسخة تجريبية».</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/install-wordpress" style="font-weight:600;text-decoration:underline">شاهد الدليل الكامل على globalhostia.com/help/install-wordpress</a><br>ما زلت بحاجة إلى مساعدة؟ <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">افتح تذكرة دعم</a></div>
</div>' WHERE parentid = @a AND language = 'arabic';

-- 3.14 open-a-support-ticket (video)
SET @a := (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE '%<!-- gh-help:open-a-support-ticket -->%' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'Open and reply to a support ticket', '', 0, 0, 0, '', 14, 0, '' FROM DUAL WHERE @a IS NULL;
SET @a := IFNULL(@a, LAST_INSERT_ID());
UPDATE tblknowledgebase SET title = 'Open and reply to a support ticket', `order` = 14, article = '<!-- gh-help:open-a-support-ticket -->
<div class="gh-kb" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">Open a ticket with the right service attached, then follow and reply to it.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">Where: Account portal &middot; <a href="https://globalhostia.com/account/support" style="font-weight:600;text-decoration:underline">Open Support</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/open-a-support-ticket.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="Open and reply to a support ticket"><source src="https://globalhostia.com/help/videos/open-a-support-ticket.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/open-a-support-ticket.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/open-a-support-ticket.ar.vtt"><a href="https://globalhostia.com/help/videos/open-a-support-ticket.mp4">Download the video</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">Video 0:42 &middot; Captions in English and Arabic (CC button).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">Steps</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">Open Support and click New ticket.</li><li style="margin:0 0 8px">Choose the department and the service it is about.</li><li style="margin:0 0 8px">Write a short subject and what you see, then submit.</li><li style="margin:0 0 8px">Open the ticket any time to read replies and answer in the reply box.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/open-a-support-ticket" style="font-weight:600;text-decoration:underline">Watch the full guide on globalhostia.com/help/open-a-support-ticket</a><br>Still stuck? <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">Open a ticket</a><br>Related: <a href="https://globalhostia.com/contact">Contact us</a> &middot; <a href="https://globalhostia.com/status-page">System status</a></div>
</div>' WHERE id = @a;
INSERT INTO gh_kb_keep (id) VALUES (@a);
DELETE FROM tblknowledgebaselinks WHERE articleid = @a AND categoryid = @cat;
INSERT INTO tblknowledgebaselinks (categoryid, articleid) VALUES (@cat, @a);
DELETE FROM tblknowledgebasetags WHERE articleid = @a;
INSERT INTO tblknowledgebasetags (articleid, tag) VALUES (@a, 'how-to'), (@a, 'video'), (@a, 'account'), (@a, 'team'), (@a, 'support'), (@a, 'ticket'), (@a, 'help'), (@a, 'open');
SET @t := (SELECT id FROM tblknowledgebase WHERE parentid = @a AND language = 'arabic' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'فتح تذكرة دعم والرد عليها', '', 0, 0, 0, '', 14, @a, 'arabic' FROM DUAL WHERE @t IS NULL;
UPDATE tblknowledgebase SET title = 'فتح تذكرة دعم والرد عليها', `order` = 14, article = '<!-- gh-help:open-a-support-ticket:ar -->
<div class="gh-kb" dir="rtl" lang="ar" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">افتح تذكرة مع إرفاق الخدمة المعنية، ثم تابعها وردّ عليها.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">المكان: بوابة الحساب &middot; <a href="https://globalhostia.com/account/support" style="font-weight:600;text-decoration:underline">افتح الدعم</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/open-a-support-ticket.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="فتح تذكرة دعم والرد عليها"><source src="https://globalhostia.com/help/videos/open-a-support-ticket.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/open-a-support-ticket.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/open-a-support-ticket.ar.vtt" default><a href="https://globalhostia.com/help/videos/open-a-support-ticket.mp4">تنزيل الفيديو</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">فيديو 0:42 &middot; ترجمة مكتوبة بالعربية والإنجليزية (زر CC).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">الخطوات</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">افتح «الدعم» واضغط «تذكرة جديدة».</li><li style="margin:0 0 8px">اختر القسم والخدمة المعنية.</li><li style="margin:0 0 8px">اكتب عنواناً قصيراً ووصفاً لما تراه، ثم أرسل.</li><li style="margin:0 0 8px">افتح التذكرة في أي وقت لقراءة الردود والإجابة في مربع الرد.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/open-a-support-ticket" style="font-weight:600;text-decoration:underline">شاهد الدليل الكامل على globalhostia.com/help/open-a-support-ticket</a><br>ما زلت بحاجة إلى مساعدة؟ <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">افتح تذكرة دعم</a></div>
</div>' WHERE parentid = @a AND language = 'arabic';

-- 3.15 give-team-access (video)
SET @a := (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE '%<!-- gh-help:give-team-access -->%' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'Give a teammate access', '', 0, 0, 0, '', 15, 0, '' FROM DUAL WHERE @a IS NULL;
SET @a := IFNULL(@a, LAST_INSERT_ID());
UPDATE tblknowledgebase SET title = 'Give a teammate access', `order` = 15, article = '<!-- gh-help:give-team-access -->
<div class="gh-kb" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">Invite a developer or accountant to your account with only the access they need.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">Where: Account portal &middot; <a href="https://globalhostia.com/account/team" style="font-weight:600;text-decoration:underline">Open Team access</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/give-team-access.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="Give a teammate access"><source src="https://globalhostia.com/help/videos/give-team-access.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/give-team-access.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/give-team-access.ar.vtt"><a href="https://globalhostia.com/help/videos/give-team-access.mp4">Download the video</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">Video 0:27 &middot; Captions in English and Arabic (CC button).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">Steps</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">Open Team access from your account menu.</li><li style="margin:0 0 8px">Enter your teammate’s email address.</li><li style="margin:0 0 8px">Choose an access level, such as Developer or Billing only.</li><li style="margin:0 0 8px">Send the invite. You can change or remove their access at any time.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/give-team-access" style="font-weight:600;text-decoration:underline">Watch the full guide on globalhostia.com/help/give-team-access</a><br>Still stuck? <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">Open a ticket</a><br>Related: <a href="https://globalhostia.com/help/open-a-support-ticket">Open a support ticket</a> &middot; <a href="https://globalhostia.com/help/switch-language">Switch to Arabic</a></div>
</div>' WHERE id = @a;
INSERT INTO gh_kb_keep (id) VALUES (@a);
DELETE FROM tblknowledgebaselinks WHERE articleid = @a AND categoryid = @cat;
INSERT INTO tblknowledgebaselinks (categoryid, articleid) VALUES (@cat, @a);
DELETE FROM tblknowledgebasetags WHERE articleid = @a;
INSERT INTO tblknowledgebasetags (articleid, tag) VALUES (@a, 'how-to'), (@a, 'video'), (@a, 'account'), (@a, 'team'), (@a, 'access'), (@a, 'invite'), (@a, 'user'), (@a, 'developer');
SET @t := (SELECT id FROM tblknowledgebase WHERE parentid = @a AND language = 'arabic' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'منح زميل صلاحية الوصول', '', 0, 0, 0, '', 15, @a, 'arabic' FROM DUAL WHERE @t IS NULL;
UPDATE tblknowledgebase SET title = 'منح زميل صلاحية الوصول', `order` = 15, article = '<!-- gh-help:give-team-access:ar -->
<div class="gh-kb" dir="rtl" lang="ar" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">ادعُ مطوراً أو محاسباً إلى حسابك بالصلاحيات التي يحتاجها فقط.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">المكان: بوابة الحساب &middot; <a href="https://globalhostia.com/account/team" style="font-weight:600;text-decoration:underline">افتح صلاحيات الفريق</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/give-team-access.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="منح زميل صلاحية الوصول"><source src="https://globalhostia.com/help/videos/give-team-access.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/give-team-access.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/give-team-access.ar.vtt" default><a href="https://globalhostia.com/help/videos/give-team-access.mp4">تنزيل الفيديو</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">فيديو 0:27 &middot; ترجمة مكتوبة بالعربية والإنجليزية (زر CC).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">الخطوات</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">افتح «صلاحيات الفريق» من قائمة حسابك.</li><li style="margin:0 0 8px">أدخل البريد الإلكتروني لزميلك.</li><li style="margin:0 0 8px">اختر مستوى الصلاحية مثل «مطوّر» أو «الفواتير فقط».</li><li style="margin:0 0 8px">أرسل الدعوة. يمكنك تعديل صلاحياته أو إزالتها في أي وقت.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/give-team-access" style="font-weight:600;text-decoration:underline">شاهد الدليل الكامل على globalhostia.com/help/give-team-access</a><br>ما زلت بحاجة إلى مساعدة؟ <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">افتح تذكرة دعم</a></div>
</div>' WHERE parentid = @a AND language = 'arabic';

-- 3.16 switch-language (video)
SET @a := (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE '%<!-- gh-help:switch-language -->%' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'Switch your account to Arabic', '', 0, 0, 0, '', 16, 0, '' FROM DUAL WHERE @a IS NULL;
SET @a := IFNULL(@a, LAST_INSERT_ID());
UPDATE tblknowledgebase SET title = 'Switch your account to Arabic', `order` = 16, article = '<!-- gh-help:switch-language -->
<div class="gh-kb" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">Use your account in Arabic (right to left) or English, and switch back at any time.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">Where: Account portal &middot; <a href="https://globalhostia.com/account" style="font-weight:600;text-decoration:underline">Open your account</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/switch-language.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="Switch your account to Arabic"><source src="https://globalhostia.com/help/videos/switch-language.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/switch-language.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/switch-language.ar.vtt"><a href="https://globalhostia.com/help/videos/switch-language.mp4">Download the video</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">Video 0:29 &middot; Captions in English and Arabic (CC button).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">Steps</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">Open the account menu at the top right.</li><li style="margin:0 0 8px">Choose العربية. Your account switches to Arabic, right to left.</li><li style="margin:0 0 8px">Your choice is remembered on this device.</li><li style="margin:0 0 8px">To switch back, open the same menu and choose English.</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/switch-language" style="font-weight:600;text-decoration:underline">Watch the full guide on globalhostia.com/help/switch-language</a><br>Still stuck? <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">Open a ticket</a><br>Related: <a href="https://globalhostia.com/help/give-team-access">Give a teammate access</a></div>
</div>' WHERE id = @a;
INSERT INTO gh_kb_keep (id) VALUES (@a);
DELETE FROM tblknowledgebaselinks WHERE articleid = @a AND categoryid = @cat;
INSERT INTO tblknowledgebaselinks (categoryid, articleid) VALUES (@cat, @a);
DELETE FROM tblknowledgebasetags WHERE articleid = @a;
INSERT INTO tblknowledgebasetags (articleid, tag) VALUES (@a, 'how-to'), (@a, 'video'), (@a, 'account'), (@a, 'team'), (@a, 'language'), (@a, 'arabic'), (@a, 'english'), (@a, 'rtl');
SET @t := (SELECT id FROM tblknowledgebase WHERE parentid = @a AND language = 'arabic' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'تحويل حسابك إلى العربية', '', 0, 0, 0, '', 16, @a, 'arabic' FROM DUAL WHERE @t IS NULL;
UPDATE tblknowledgebase SET title = 'تحويل حسابك إلى العربية', `order` = 16, article = '<!-- gh-help:switch-language:ar -->
<div class="gh-kb" dir="rtl" lang="ar" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">استخدم حسابك بالعربية (من اليمين إلى اليسار) أو بالإنجليزية، وبدّل متى شئت.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">المكان: بوابة الحساب &middot; <a href="https://globalhostia.com/account" style="font-weight:600;text-decoration:underline">افتح حسابك</a></p>
<video controls preload="none" playsinline crossorigin="anonymous" width="100%" poster="https://globalhostia.com/help/videos/switch-language.jpg" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)" aria-label="تحويل حسابك إلى العربية"><source src="https://globalhostia.com/help/videos/switch-language.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="https://globalhostia.com/help/videos/switch-language.en.vtt"><track kind="captions" srclang="ar" label="العربية" src="https://globalhostia.com/help/videos/switch-language.ar.vtt" default><a href="https://globalhostia.com/help/videos/switch-language.mp4">تنزيل الفيديو</a></video>
<p style="font-size:.85em;opacity:.7;margin:6px 0 20px">فيديو 0:29 &middot; ترجمة مكتوبة بالعربية والإنجليزية (زر CC).</p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">الخطوات</h3>
<ol style="margin:0 0 18px;padding-inline-start:22px;line-height:1.6"><li style="margin:0 0 8px">افتح قائمة الحساب أعلى الصفحة.</li><li style="margin:0 0 8px">اختر «العربية». يتحول حسابك إلى العربية من اليمين إلى اليسار.</li><li style="margin:0 0 8px">يُحفظ اختيارك على هذا الجهاز.</li><li style="margin:0 0 8px">للعودة افتح القائمة نفسها واختر «English».</li></ol>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/switch-language" style="font-weight:600;text-decoration:underline">شاهد الدليل الكامل على globalhostia.com/help/switch-language</a><br>ما زلت بحاجة إلى مساعدة؟ <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">افتح تذكرة دعم</a></div>
</div>' WHERE parentid = @a AND language = 'arabic';

-- 3.17 register-a-domain (walkthrough)
SET @a := (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE '%<!-- gh-help:register-a-domain -->%' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'Register a domain', '', 0, 0, 0, '', 17, 0, '' FROM DUAL WHERE @a IS NULL;
SET @a := IFNULL(@a, LAST_INSERT_ID());
UPDATE tblknowledgebase SET title = 'Register a domain', `order` = 17, article = '<!-- gh-help:register-a-domain -->
<div class="gh-kb" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">Search for a name, add it to your cart and check out. The renewal price is shown before you pay.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">Where: Website and checkout &middot; <a href="https://globalhostia.com/domains-registration" style="font-weight:600;text-decoration:underline">Search for a domain</a></p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">Step by step</h3>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/register-a-domain-1.jpg" alt="Step 1: Open Domain registration and type the name you want." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>1.</b> Open Domain registration and type the name you want.</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/register-a-domain-2.jpg" alt="Step 2: Check the results: the first-year and renewal prices are shown for each extension." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>2.</b> Check the results: the first-year and renewal prices are shown for each extension.</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/register-a-domain-3.jpg" alt="Step 3: Add the domain to your cart and review it. Add hosting or email if you need them." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>3.</b> Add the domain to your cart and review it. Add hosting or email if you need them.</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/register-a-domain-4.jpg" alt="Step 4: Check out and pay. The domain appears under Domains in your account." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>4.</b> Check out and pay. The domain appears under Domains in your account.</figcaption></figure>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/register-a-domain" style="font-weight:600;text-decoration:underline">Watch the full guide on globalhostia.com/help/register-a-domain</a><br>Still stuck? <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">Open a ticket</a><br>Related: <a href="https://globalhostia.com/domains-registration">Domain registration</a> &middot; <a href="https://globalhostia.com/domains-pricing">Domain prices</a> &middot; <a href="https://globalhostia.com/help/transfer-a-domain">Transfer a domain</a></div>
</div>' WHERE id = @a;
INSERT INTO gh_kb_keep (id) VALUES (@a);
DELETE FROM tblknowledgebaselinks WHERE articleid = @a AND categoryid = @cat;
INSERT INTO tblknowledgebaselinks (categoryid, articleid) VALUES (@cat, @a);
DELETE FROM tblknowledgebasetags WHERE articleid = @a;
INSERT INTO tblknowledgebasetags (articleid, tag) VALUES (@a, 'how-to'), (@a, 'walkthrough'), (@a, 'ordering'), (@a, 'register'), (@a, 'domain'), (@a, 'buy'), (@a, 'search'), (@a, 'name');
SET @t := (SELECT id FROM tblknowledgebase WHERE parentid = @a AND language = 'arabic' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'تسجيل نطاق', '', 0, 0, 0, '', 17, @a, 'arabic' FROM DUAL WHERE @t IS NULL;
UPDATE tblknowledgebase SET title = 'تسجيل نطاق', `order` = 17, article = '<!-- gh-help:register-a-domain:ar -->
<div class="gh-kb" dir="rtl" lang="ar" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">ابحث عن اسم وأضفه إلى السلة وأكمل الدفع. يظهر سعر التجديد قبل الدفع.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">المكان: الموقع وصفحة الدفع &middot; <a href="https://globalhostia.com/domains-registration" style="font-weight:600;text-decoration:underline">ابحث عن نطاق</a></p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">خطوة بخطوة</h3>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/register-a-domain-1.jpg" alt="الخطوة 1: افتح «تسجيل النطاقات» واكتب الاسم الذي تريده." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>1.</b> افتح «تسجيل النطاقات» واكتب الاسم الذي تريده.</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/register-a-domain-2.jpg" alt="الخطوة 2: راجع النتائج: يظهر سعر السنة الأولى وسعر التجديد لكل امتداد." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>2.</b> راجع النتائج: يظهر سعر السنة الأولى وسعر التجديد لكل امتداد.</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/register-a-domain-3.jpg" alt="الخطوة 3: أضف النطاق إلى السلة وراجعه. أضف الاستضافة أو البريد إن احتجت." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>3.</b> أضف النطاق إلى السلة وراجعه. أضف الاستضافة أو البريد إن احتجت.</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/register-a-domain-4.jpg" alt="الخطوة 4: أكمل الطلب وادفع. يظهر النطاق ضمن «النطاقات» في حسابك." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>4.</b> أكمل الطلب وادفع. يظهر النطاق ضمن «النطاقات» في حسابك.</figcaption></figure>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/register-a-domain" style="font-weight:600;text-decoration:underline">شاهد الدليل الكامل على globalhostia.com/help/register-a-domain</a><br>ما زلت بحاجة إلى مساعدة؟ <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">افتح تذكرة دعم</a></div>
</div>' WHERE parentid = @a AND language = 'arabic';

-- 3.18 buy-hosting (walkthrough)
SET @a := (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE '%<!-- gh-help:buy-hosting -->%' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'Buy a hosting plan', '', 0, 0, 0, '', 18, 0, '' FROM DUAL WHERE @a IS NULL;
SET @a := IFNULL(@a, LAST_INSERT_ID());
UPDATE tblknowledgebase SET title = 'Buy a hosting plan', `order` = 18, article = '<!-- gh-help:buy-hosting -->
<div class="gh-kb" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">Compare plans, choose a billing period, attach a domain and check out.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">Where: Website and checkout &middot; <a href="https://globalhostia.com/web-hosting" style="font-weight:600;text-decoration:underline">Compare hosting plans</a></p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">Step by step</h3>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/buy-hosting-1.jpg" alt="Step 1: Open Web hosting and compare the plans. Renewal prices are shown upfront." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>1.</b> Open Web hosting and compare the plans. Renewal prices are shown upfront.</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/buy-hosting-2.jpg" alt="Step 2: Choose a plan and click its order button." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>2.</b> Choose a plan and click its order button.</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/buy-hosting-3.jpg" alt="Step 3: Pick a billing period and register, transfer or use a domain you already own." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>3.</b> Pick a billing period and register, transfer or use a domain you already own.</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/buy-hosting-4.jpg" alt="Step 4: Review the cart and check out. Your hosting is set up automatically after payment." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>4.</b> Review the cart and check out. Your hosting is set up automatically after payment.</figcaption></figure>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/buy-hosting" style="font-weight:600;text-decoration:underline">Watch the full guide on globalhostia.com/help/buy-hosting</a><br>Still stuck? <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">Open a ticket</a><br>Related: <a href="https://globalhostia.com/web-hosting">Web hosting</a> &middot; <a href="https://globalhostia.com/plan-finder">Plan finder</a> &middot; <a href="https://globalhostia.com/free-migration">Free migration</a></div>
</div>' WHERE id = @a;
INSERT INTO gh_kb_keep (id) VALUES (@a);
DELETE FROM tblknowledgebaselinks WHERE articleid = @a AND categoryid = @cat;
INSERT INTO tblknowledgebaselinks (categoryid, articleid) VALUES (@cat, @a);
DELETE FROM tblknowledgebasetags WHERE articleid = @a;
INSERT INTO tblknowledgebasetags (articleid, tag) VALUES (@a, 'how-to'), (@a, 'walkthrough'), (@a, 'ordering'), (@a, 'buy'), (@a, 'hosting'), (@a, 'order'), (@a, 'plan'), (@a, 'shared');
SET @t := (SELECT id FROM tblknowledgebase WHERE parentid = @a AND language = 'arabic' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'شراء خطة استضافة', '', 0, 0, 0, '', 18, @a, 'arabic' FROM DUAL WHERE @t IS NULL;
UPDATE tblknowledgebase SET title = 'شراء خطة استضافة', `order` = 18, article = '<!-- gh-help:buy-hosting:ar -->
<div class="gh-kb" dir="rtl" lang="ar" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">قارن الخطط واختر مدة الفوترة واربط نطاقاً ثم أكمل الطلب.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">المكان: الموقع وصفحة الدفع &middot; <a href="https://globalhostia.com/web-hosting" style="font-weight:600;text-decoration:underline">قارن خطط الاستضافة</a></p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">خطوة بخطوة</h3>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/buy-hosting-1.jpg" alt="الخطوة 1: افتح «استضافة المواقع» وقارن الخطط. تظهر أسعار التجديد مسبقاً." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>1.</b> افتح «استضافة المواقع» وقارن الخطط. تظهر أسعار التجديد مسبقاً.</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/buy-hosting-2.jpg" alt="الخطوة 2: اختر خطة واضغط زر الطلب الخاص بها." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>2.</b> اختر خطة واضغط زر الطلب الخاص بها.</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/buy-hosting-3.jpg" alt="الخطوة 3: اختر مدة الفوترة وسجّل نطاقاً أو انقله أو استخدم نطاقاً تملكه." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>3.</b> اختر مدة الفوترة وسجّل نطاقاً أو انقله أو استخدم نطاقاً تملكه.</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/buy-hosting-4.jpg" alt="الخطوة 4: راجع السلة وأكمل الطلب. تُجهَّز استضافتك تلقائياً بعد الدفع." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>4.</b> راجع السلة وأكمل الطلب. تُجهَّز استضافتك تلقائياً بعد الدفع.</figcaption></figure>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/buy-hosting" style="font-weight:600;text-decoration:underline">شاهد الدليل الكامل على globalhostia.com/help/buy-hosting</a><br>ما زلت بحاجة إلى مساعدة؟ <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">افتح تذكرة دعم</a></div>
</div>' WHERE parentid = @a AND language = 'arabic';

-- 3.19 transfer-a-domain (walkthrough)
SET @a := (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE '%<!-- gh-help:transfer-a-domain -->%' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'Transfer a domain to GlobalHostia', '', 0, 0, 0, '', 19, 0, '' FROM DUAL WHERE @a IS NULL;
SET @a := IFNULL(@a, LAST_INSERT_ID());
UPDATE tblknowledgebase SET title = 'Transfer a domain to GlobalHostia', `order` = 19, article = '<!-- gh-help:transfer-a-domain -->
<div class="gh-kb" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">Unlock the domain at your current registrar, get the EPP code and start the transfer.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">Where: Website and checkout &middot; <a href="https://globalhostia.com/domains-registration" style="font-weight:600;text-decoration:underline">Start a transfer</a></p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">Step by step</h3>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/transfer-a-domain-1.jpg" alt="Step 1: At your current registrar, unlock the domain and copy its EPP (authorisation) code." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>1.</b> At your current registrar, unlock the domain and copy its EPP (authorisation) code.</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/transfer-a-domain-2.jpg" alt="Step 2: On our domain page, choose Transfer and enter the domain name." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>2.</b> On our domain page, choose Transfer and enter the domain name.</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/transfer-a-domain-3.jpg" alt="Step 3: Add it to your cart, enter the EPP code and check out. The transfer price includes a year of renewal." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>3.</b> Add it to your cart, enter the EPP code and check out. The transfer price includes a year of renewal.</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/transfer-a-domain-4.jpg" alt="Step 4: Approve the transfer email. Most transfers finish within 5 to 7 days." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>4.</b> Approve the transfer email. Most transfers finish within 5 to 7 days.</figcaption></figure>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/transfer-a-domain" style="font-weight:600;text-decoration:underline">Watch the full guide on globalhostia.com/help/transfer-a-domain</a><br>Still stuck? <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">Open a ticket</a><br>Related: <a href="https://globalhostia.com/domains-registration">Domain registration</a> &middot; <a href="https://globalhostia.com/help/change-nameservers">Change nameservers</a></div>
</div>' WHERE id = @a;
INSERT INTO gh_kb_keep (id) VALUES (@a);
DELETE FROM tblknowledgebaselinks WHERE articleid = @a AND categoryid = @cat;
INSERT INTO tblknowledgebaselinks (categoryid, articleid) VALUES (@cat, @a);
DELETE FROM tblknowledgebasetags WHERE articleid = @a;
INSERT INTO tblknowledgebasetags (articleid, tag) VALUES (@a, 'how-to'), (@a, 'walkthrough'), (@a, 'ordering'), (@a, 'transfer'), (@a, 'domain'), (@a, 'epp'), (@a, 'auth'), (@a, 'code');
SET @t := (SELECT id FROM tblknowledgebase WHERE parentid = @a AND language = 'arabic' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'نقل نطاق إلى GlobalHostia', '', 0, 0, 0, '', 19, @a, 'arabic' FROM DUAL WHERE @t IS NULL;
UPDATE tblknowledgebase SET title = 'نقل نطاق إلى GlobalHostia', `order` = 19, article = '<!-- gh-help:transfer-a-domain:ar -->
<div class="gh-kb" dir="rtl" lang="ar" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">افتح قفل النطاق لدى المسجّل الحالي واحصل على رمز EPP ثم ابدأ النقل.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">المكان: الموقع وصفحة الدفع &middot; <a href="https://globalhostia.com/domains-registration" style="font-weight:600;text-decoration:underline">ابدأ النقل</a></p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">خطوة بخطوة</h3>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/transfer-a-domain-1.jpg" alt="الخطوة 1: لدى المسجّل الحالي افتح قفل النطاق وانسخ رمز EPP (رمز التفويض)." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>1.</b> لدى المسجّل الحالي افتح قفل النطاق وانسخ رمز EPP (رمز التفويض).</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/transfer-a-domain-2.jpg" alt="الخطوة 2: في صفحة النطاقات لدينا اختر «نقل» وأدخل اسم النطاق." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>2.</b> في صفحة النطاقات لدينا اختر «نقل» وأدخل اسم النطاق.</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/transfer-a-domain-3.jpg" alt="الخطوة 3: أضفه إلى السلة وأدخل رمز EPP وأكمل الطلب. يشمل سعر النقل تجديد سنة." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>3.</b> أضفه إلى السلة وأدخل رمز EPP وأكمل الطلب. يشمل سعر النقل تجديد سنة.</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/transfer-a-domain-4.jpg" alt="الخطوة 4: وافق على رسالة النقل. تكتمل معظم عمليات النقل خلال 5 إلى 7 أيام." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>4.</b> وافق على رسالة النقل. تكتمل معظم عمليات النقل خلال 5 إلى 7 أيام.</figcaption></figure>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/transfer-a-domain" style="font-weight:600;text-decoration:underline">شاهد الدليل الكامل على globalhostia.com/help/transfer-a-domain</a><br>ما زلت بحاجة إلى مساعدة؟ <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">افتح تذكرة دعم</a></div>
</div>' WHERE parentid = @a AND language = 'arabic';

-- 3.20 connect-ai-assistant (walkthrough)
SET @a := (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE '%<!-- gh-help:connect-ai-assistant -->%' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'Manage your hosting from Claude or ChatGPT', '', 0, 0, 0, '', 20, 0, '' FROM DUAL WHERE @a IS NULL;
SET @a := IFNULL(@a, LAST_INSERT_ID());
UPDATE tblknowledgebase SET title = 'Manage your hosting from Claude or ChatGPT', `order` = 20, article = '<!-- gh-help:connect-ai-assistant -->
<div class="gh-kb" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">Add the GlobalHostia connector to your AI assistant, approve it once, and manage or disconnect it from your account.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">Where: Claude or ChatGPT, and your account &middot; <a href="https://globalhostia.com/connectors" style="font-weight:600;text-decoration:underline">Open AI connectors</a></p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">Step by step</h3>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/connect-ai-assistant-1.jpg" alt="Step 1: Open AI connectors on our site and copy the connector address." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>1.</b> Open AI connectors on our site and copy the connector address.</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/connect-ai-assistant-2.jpg" alt="Step 2: In Claude or ChatGPT, add a custom connector and paste the address (see the steps on the connectors page)." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>2.</b> In Claude or ChatGPT, add a custom connector and paste the address (see the steps on the connectors page).</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/connect-ai-assistant-3.jpg" alt="Step 3: Sign in to GlobalHostia when asked and approve the access on our page." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>3.</b> Sign in to GlobalHostia when asked and approve the access on our page.</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/connect-ai-assistant-4.jpg" alt="Step 4: See or disconnect connected apps any time under Connected apps in your account." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>4.</b> See or disconnect connected apps any time under Connected apps in your account.</figcaption></figure>
<p style="margin:0 0 18px;padding:12px 16px;border-inline-start:3px solid #111;background:rgba(0,0,0,.04);border-radius:8px">We only show our own pages here. Claude and ChatGPT change their menus from time to time, so follow their current help for adding a custom connector.</p>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/connect-ai-assistant" style="font-weight:600;text-decoration:underline">Watch the full guide on globalhostia.com/help/connect-ai-assistant</a><br>Still stuck? <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">Open a ticket</a><br>Related: <a href="https://globalhostia.com/connectors">AI connectors</a> &middot; <a href="https://globalhostia.com/account/apps">Connected apps</a> &middot; <a href="https://globalhostia.com/docs/mcp">MCP documentation</a></div>
</div>' WHERE id = @a;
INSERT INTO gh_kb_keep (id) VALUES (@a);
DELETE FROM tblknowledgebaselinks WHERE articleid = @a AND categoryid = @cat;
INSERT INTO tblknowledgebaselinks (categoryid, articleid) VALUES (@cat, @a);
DELETE FROM tblknowledgebasetags WHERE articleid = @a;
INSERT INTO tblknowledgebasetags (articleid, tag) VALUES (@a, 'how-to'), (@a, 'walkthrough'), (@a, 'assistants'), (@a, 'claude'), (@a, 'chatgpt'), (@a, 'connector'), (@a, 'mcp'), (@a, 'assistant');
SET @t := (SELECT id FROM tblknowledgebase WHERE parentid = @a AND language = 'arabic' ORDER BY id LIMIT 1);
INSERT INTO tblknowledgebase (title, article, views, useful, votes, private, `order`, parentid, language)
  SELECT 'إدارة استضافتك من Claude أو ChatGPT', '', 0, 0, 0, '', 20, @a, 'arabic' FROM DUAL WHERE @t IS NULL;
UPDATE tblknowledgebase SET title = 'إدارة استضافتك من Claude أو ChatGPT', `order` = 20, article = '<!-- gh-help:connect-ai-assistant:ar -->
<div class="gh-kb" dir="rtl" lang="ar" style="max-width:820px">
<p style="font-size:1.05em;line-height:1.6;margin:0 0 16px">أضف موصل GlobalHostia إلى مساعدك الذكي ووافق عليه مرة واحدة، ثم أدره أو افصله من حسابك.</p>
<p style="font-size:.9em;opacity:.75;margin:0 0 14px">المكان: Claude أو ChatGPT وحسابك &middot; <a href="https://globalhostia.com/connectors" style="font-weight:600;text-decoration:underline">افتح موصلات الذكاء الاصطناعي</a></p>
<h3 style="font-size:1.15em;font-weight:700;margin:22px 0 10px">خطوة بخطوة</h3>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/connect-ai-assistant-1.jpg" alt="الخطوة 1: افتح صفحة «موصلات الذكاء الاصطناعي» في موقعنا وانسخ عنوان الموصل." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>1.</b> افتح صفحة «موصلات الذكاء الاصطناعي» في موقعنا وانسخ عنوان الموصل.</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/connect-ai-assistant-2.jpg" alt="الخطوة 2: في Claude أو ChatGPT أضف موصلاً مخصصاً والصق العنوان (راجع الخطوات في صفحة الموصلات)." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>2.</b> في Claude أو ChatGPT أضف موصلاً مخصصاً والصق العنوان (راجع الخطوات في صفحة الموصلات).</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/connect-ai-assistant-3.jpg" alt="الخطوة 3: سجّل الدخول إلى GlobalHostia عند الطلب ووافق على الصلاحية في صفحتنا." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>3.</b> سجّل الدخول إلى GlobalHostia عند الطلب ووافق على الصلاحية في صفحتنا.</figcaption></figure>
<figure style="margin:0 0 18px"><img src="https://globalhostia.com/help/frames/connect-ai-assistant-4.jpg" alt="الخطوة 4: اعرض التطبيقات المتصلة أو افصلها في أي وقت من «التطبيقات المتصلة» في حسابك." width="1280" height="720" loading="lazy" style="display:block;width:100%;height:auto;border-radius:12px;background:#111;border:1px solid rgba(0,0,0,.08)"><figcaption style="font-size:.92em;margin:8px 0 0;line-height:1.5"><b>4.</b> اعرض التطبيقات المتصلة أو افصلها في أي وقت من «التطبيقات المتصلة» في حسابك.</figcaption></figure>
<p style="margin:0 0 18px;padding:12px 16px;border-inline-start:3px solid #111;background:rgba(0,0,0,.04);border-radius:8px">نعرض هنا صفحاتنا فقط. تغيّر Claude وChatGPT قوائمها من حين لآخر، لذا اتبع تعليماتها الحالية لإضافة موصل مخصص.</p>
<div style="margin:22px 0 0;padding:14px 16px;border:1px solid rgba(0,0,0,.12);border-radius:12px;line-height:1.7"><a href="https://globalhostia.com/help/connect-ai-assistant" style="font-weight:600;text-decoration:underline">شاهد الدليل الكامل على globalhostia.com/help/connect-ai-assistant</a><br>ما زلت بحاجة إلى مساعدة؟ <a href="https://my.globalhostia.com/submitticket.php" style="font-weight:600;text-decoration:underline">افتح تذكرة دعم</a></div>
</div>' WHERE parentid = @a AND language = 'arabic';

-- 4. Remove our marker articles whose topic was dropped from lib/help/topics.ts (and their translations, links, tags)
DELETE FROM tblknowledgebase WHERE parentid > 0 AND parentid IN (SELECT id FROM (SELECT id FROM tblknowledgebase WHERE parentid = 0 AND article LIKE '%<!-- gh-help:%') x) AND parentid NOT IN (SELECT id FROM gh_kb_keep);
DELETE l FROM tblknowledgebaselinks l JOIN tblknowledgebase k ON k.id = l.articleid LEFT JOIN gh_kb_keep g ON g.id = k.id
  WHERE k.parentid = 0 AND k.article LIKE '%<!-- gh-help:%' AND g.id IS NULL;
DELETE t FROM tblknowledgebasetags t JOIN tblknowledgebase k ON k.id = t.articleid LEFT JOIN gh_kb_keep g ON g.id = k.id
  WHERE k.parentid = 0 AND k.article LIKE '%<!-- gh-help:%' AND g.id IS NULL;
DELETE k FROM tblknowledgebase k LEFT JOIN gh_kb_keep g ON g.id = k.id
  WHERE k.parentid = 0 AND k.article LIKE '%<!-- gh-help:%' AND g.id IS NULL;

COMMIT;
DROP TEMPORARY TABLE IF EXISTS gh_kb_keep;

-- 5. Check: should list 20 articles, each with 1 Arabic translation
SELECT k.id, k.`order`, k.title, (SELECT COUNT(*) FROM tblknowledgebase x WHERE x.parentid = k.id AND x.language = 'arabic') AS arabic,
  (SELECT COUNT(*) FROM tblknowledgebasetags g WHERE g.articleid = k.id) AS tags
  FROM tblknowledgebase k JOIN tblknowledgebaselinks l ON l.articleid = k.id AND l.categoryid = @cat ORDER BY k.`order`;
