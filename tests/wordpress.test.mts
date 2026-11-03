// WordPress (Softaculous) for the Manage hosting panel: validation, password generator, answer parsers, error wording,
// and the Softaculous client end to end against the mock in tests/mock-da.mjs (plain HTTP, random port).
// Run: node --test --experimental-strip-types tests/wordpress.test.mts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';

// lib/hosting/* uses extensionless relative imports (Next resolves them); add ".ts" for node here
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, n) {
  if (/^\\.\\.?\\//.test(s) && !/\\.[cm]?[jt]s$/.test(s) && c.parentURL && c.parentURL.includes('/lib/')) { try { return await n(s + '.ts', c); } catch {} }
  return n(s, c);
}`));
const W = await import('../lib/hosting/wordpress.ts');
const { softaculous } = await import('../lib/hosting/providers/softaculous.ts');
const { PanelError } = await import('../lib/hosting/types.ts');
const { InputError } = await import('../lib/hosting/validate.ts');

test('validation: folders, titles, admin user, email, language, ids', () => {
  assert.equal(W.wpDirectory(''), ''); assert.equal(W.wpDirectory(' /blog/ '), 'blog'); assert.equal(W.wpDirectory('shop/en'), 'shop/en');
  for (const bad of ['../x', 'a/../b', 'a b', 'wp-admin', 'a/b/c/d', 'x'.repeat(70), 'blog?x', 'é']) assert.throws(() => W.wpDirectory(bad), InputError, bad);
  assert.equal(W.wpTitle('  My   Shop '), 'My Shop');
  for (const bad of ['', '<script>', 'x'.repeat(81), 'a\u0000b']) assert.throws(() => W.wpTitle(bad), InputError, bad);
  assert.equal(W.wpAdminUser('maria.k'), 'maria.k');
  for (const bad of ['admin', 'Administrator', 'ab', 'a b', 'x'.repeat(40), '-lead', 'root']) assert.throws(() => W.wpAdminUser(bad), InputError, bad);
  assert.equal(W.wpEmail(' Owner@Shop.COM '), 'owner@shop.com');
  for (const bad of ['', 'a@b', 'a b@c.com', 'x@y.c"m']) assert.throws(() => W.wpEmail(bad), InputError, bad);
  assert.equal(W.wpLanguage(''), 'en'); assert.equal(W.wpLanguage('ar'), 'ar');
  assert.throws(() => W.wpLanguage('xx_YY'), InputError);
  assert.equal(W.wpInsid('26_12345'), '26_12345');
  for (const bad of ['26', '26_', 'abc', '26_1;drop', '../26_1']) assert.throws(() => W.wpInsid(bad), InputError, bad);
  assert.equal(W.wpTaskKey('a'.repeat(32)), 'a'.repeat(32)); assert.throws(() => W.wpTaskKey('../../etc'), InputError);
  assert.equal(W.wpLabel('Staging'), 'staging');
  for (const bad of ['www', 'mail', '-x', 'a.b', '']) assert.throws(() => W.wpLabel(bad), InputError, bad);
});

test('password: 20 characters, all four classes, never repeats', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 300; i++) {
    const p = W.wpPassword();
    assert.equal(p.length, 20);
    assert.match(p, /[a-z]/); assert.match(p, /[A-Z]/); assert.match(p, /[2-9]/); assert.match(p, /[!#%+=_\-@]/);
    assert.doesNotMatch(p, /[O0Il1]/);
    seen.add(p);
  }
  assert.equal(seen.size, 300);
  assert.match(W.wpAutoId(), /^[0-9a-f]{32}$/);
});

test('installations: WordPress only, staging links, update available, no database secrets', () => {
  const sites = W.parseInstallations({
    installations: {
      26: {
        '26_1': { insid: '26_1', sid: '26', ver: '6.7.1', softurl: 'https://a.com/', softpath: '/home/u/domains/a.com/public_html', softdomain: 'A.com', softdirectory: '', site_name: 'A &amp; B', softdbpass: 'SECRET', itime: 1767225600 },
        '26_2': { insid: '26_2', sid: '26', ver: '6.7.1', softurl: 'https://a.com/staging', softdomain: 'a.com', softdirectory: '/staging/', is_staging: 1, staging_parent: '26_1' },
      },
      72: { '72_9': { insid: '72_9', sid: '72', ver: '4.1', softurl: 'https://a.com/forum' } },
    },
    scripts: { 26: { ver: '6.8.3' } },
  });
  assert.equal(sites.length, 2);
  const [live, stg] = sites;
  assert.deepEqual([live.id, live.url, live.adminUrl, live.domain, live.directory, live.siteName, live.newVersion, live.staging], ['26_1', 'https://a.com', 'https://a.com/wp-admin/', 'a.com', '', 'A & B', '6.8.3', false]);
  assert.equal(live.created, '2026-01-01T00:00:00.000Z');
  assert.deepEqual([stg.staging, stg.parentId, stg.directory], [true, '26_1', 'staging']);
  assert.ok(!JSON.stringify(sites).includes('SECRET'));
  // flat map variant + an outdated map
  const flat = W.parseInstallations({ installations: { '26_5': { softurl: 'http://b.com', ver: '6.0' } }, outdated: { '26_5': { ver: '6.1' } } });
  assert.deepEqual([flat[0].id, flat[0].newVersion, flat[0].domain], ['26_5', '6.1', 'b.com']);
  assert.deepEqual(W.parseInstallations({ installations: [] }), []);
  assert.deepEqual(W.parseInstallations(null), []);
});

test('merge: DirectAdmin-only installs are listed but not managed', () => {
  const m = W.mergeSites([{ id: '26_1', url: 'https://a.com', path: '/home/u/domains/a.com/public_html', managed: true }],
    [{ url: 'https://a.com', path: '/home/u/domains/a.com/public_html' }, { url: 'https://a.com/old', path: '/home/u/domains/a.com/public_html/old', version: '5.9' }]);
  assert.equal(m.length, 2);
  assert.deepEqual([m[1].managed, m[1].domain, m[1].version], [false, 'a.com', '5.9']);
});

test('errors: plain language, markup stripped, password never echoed', () => {
  assert.match(W.softError({ softdirectory: 'The installation path has some <b>files</b> already.' }), /already has a website/);
  assert.match(W.softError({ softdomain: 'The path of the domain you selected could not be found.' }), /not set up on this hosting account/);
  assert.match(W.softError({ db: 'You have reached the maximum number of MySQL databases allowed.' }), /no free databases/);
  assert.match(W.softError(['Not enough disk space']), /disk space/);
  assert.match(W.softError('This installation is already at the latest version'), /already up to date/);
  assert.equal(W.softError({ x: '<p>Some <i>odd</i> thing &amp; more</p>' }), 'Some odd thing & more');
  assert.equal(W.softError({ x: 'Weird pass Xy7!abc in text' }, 'Xy7!abc'), 'Weird pass ••• in text');
  assert.match(W.softError({}), /could not finish/);
});

test('tasks: progress, finished, failed', () => {
  assert.deepEqual(W.parseTask({ status: { current_status: 'Copying files', progress: '40' } }), { progress: 40, text: 'Copying files', done: false, failed: undefined, url: undefined });
  const fin = W.parseTask({ status: { completed: 'Staging Completed', progress: 100, softurl: 'https://x.com/staging' } });
  assert.deepEqual([fin.done, fin.text, fin.url], [true, 'Staging Completed', 'https://x.com/staging']);
  const bad = W.parseTask({ error: { ssk: 'Task not found' } });
  assert.deepEqual([bad.done, bad.failed], [true, true]);
  assert.equal(W.taskKeyOf('a'.repeat(32)), 'a'.repeat(32)); assert.equal(W.taskKeyOf(true), ''); assert.equal(W.taskKeyOf('1'), '');
});

/* ------------------------------------------------------------------ client against the mock */
let mock: ChildProcess; let base = '';
const PORT = 47000 + Math.floor(Math.random() * 2000);
const auth = (user: string, key = 'mock-key') => 'Basic ' + Buffer.from(`admin|${user}:${key}`).toString('base64');
before(async () => {
  mock = spawn(process.execPath, [fileURLToPath(new URL('./mock-da.mjs', import.meta.url))], { env: { ...process.env, DA_PORT: String(PORT), DA_CERT: '', DA_KEY: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise<void>((res, rej) => { mock.stdout!.on('data', (d) => { if (/mock DirectAdmin/.test(String(d))) res(); }); mock.on('exit', () => rej(new Error('mock exited'))); });
  base = `http://localhost:${PORT}`;
});
after(() => { mock?.kill(); });

test('client: list, install, sign-on, staging + task, push, backup, upgrade, delete', async () => {
  const s = softaculous(base, auth('demobran'));
  const list = await s.installations();
  assert.deepEqual(list.map((x) => x.id), ['26_11001', '26_11002', '26_11003']);
  assert.equal(list[0].newVersion, '6.8.3'); assert.equal(list[2].newVersion, undefined);

  const pass = W.wpPassword();
  const r = await s.install({ domain: 'demo-brand.com', directory: 'blog', title: 'Blog', adminUser: 'maria', adminEmail: 'm@demo-brand.com', language: 'ar', password: pass, https: true, autoUpdate: { core: true, plugins: true, themes: false } });
  assert.equal(r.url, 'https://demo-brand.com/blog'); assert.equal(r.task, undefined);
  const after1 = await s.installations();
  const blog = after1.find((x) => x.directory === 'blog')!;
  assert.ok(blog && blog.managed && !blog.staging);
  assert.ok(!JSON.stringify(after1).includes(pass));

  assert.match(await s.signOn(blog.id!), /^https:\/\/demo-brand\.com\/blog\/wp-admin\/\?softaculous_auto=[0-9a-f]{32}$/);

  const st = await s.staging(blog.id!, 'demo-brand.com', 'blog-staging', true);
  assert.match(st.task || '', /^[0-9a-f]{32}$/);
  const t1 = await s.task(st.task!); assert.deepEqual([t1.done, t1.progress], [false, 50]);
  const t2 = await s.task(st.task!); assert.deepEqual([t2.done, t2.progress, t2.url], [true, 100, 'https://demo-brand.com/blog-staging']);
  const stg = (await s.installations()).find((x) => x.directory === 'blog-staging')!;
  assert.deepEqual([stg.staging, stg.parentId], [true, blog.id]);

  const push = await s.pushLive(stg.id!); assert.ok(push.task);
  await s.task(push.task!); assert.equal((await s.task(push.task!)).done, true);
  await assert.rejects(s.pushLive(blog.id!), (e: any) => e instanceof PanelError && e.status === 400);

  assert.match((await s.backup(blog.id!)).message, /Backup finished/);
  assert.match((await s.upgrade('26_11001')).message, /updated/);
  await assert.rejects(s.upgrade('26_11001'), (e: any) => e instanceof PanelError && /already up to date/.test(e.message));
  await s.remove(stg.id!); await s.remove(blog.id!);
  assert.deepEqual((await s.installations()).map((x) => x.id), ['26_11001', '26_11002', '26_11003']);
});

test('client: installer errors in plain words, password scrubbed, missing Softaculous and bad key', async () => {
  const s = softaculous(base, auth('demobran'));
  const pass = W.wpPassword();
  const inp = { domain: 'demo-brand.com', directory: 'taken', title: 'X', adminUser: 'maria', adminEmail: 'm@x.com', language: 'en', password: pass, https: false, autoUpdate: { core: true, plugins: false, themes: false } };
  await assert.rejects(s.install(inp), (e: any) => e instanceof PanelError && e.status === 400 && /already has a website/.test(e.message) && !e.message.includes(pass));
  await assert.rejects(s.install({ ...inp, directory: 'ok', title: 'FAIL DB' }), (e: any) => /no free databases/.test(e.message));
  await assert.rejects(s.install({ ...inp, domain: 'evil.com', directory: '' }), (e: any) => /not set up/.test(e.message));
  await assert.rejects(s.signOn('26_99999'), (e: any) => /no longer exists/.test(e.message));
  await assert.rejects(softaculous(base, auth('nosoft')).installations(), (e: any) => e instanceof PanelError && e.status === 501);
  await assert.rejects(softaculous(base, auth('demobran', 'wrong')).installations(), (e: any) => e instanceof PanelError && e.status === 502 && /CMD_PLUGINS/.test(e.message));
});
