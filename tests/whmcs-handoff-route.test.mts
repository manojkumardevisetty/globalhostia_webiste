// Exercise the actual Next.js handlers and JWTs, substituting only database and billing/network boundaries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { HANDOFF_AUD, HANDOFF_COOKIE } from '../lib/portal/whmcs-handoff-core.ts';
const require = createRequire(import.meta.url);
const { NextRequest } = require('next/server');
const ROOT = path.resolve(import.meta.dirname, '..');
const secret = 'test-only-handoff-key-'.repeat(3);

test('actual handoff handlers bind the browser, replace the correct client, reject concurrent replays and fail closed', async () => {
  const tmp = fs.mkdtempSync(path.join(ROOT, 'node_modules/.handoff-test-'));
  const prev = process.env.AUTH_SECRET; process.env.AUTH_SECRET = 'test-only-session-key-'.repeat(3);
  const seen = new Set<string>(); let billingDown = false, databaseDown = false;
  const name = '__gh_handoff_test_' + Date.now();
  (globalThis as any)[name] = {
    insert: (table: any) => ({ values: (v: any) => !table.key ? Promise.resolve([]) : ({ onConflictDoNothing: () => ({ returning: async () => {
      assert.ok(v.expiresAt.getTime() > Date.now() + 120000, 'replay markers outlive valid assertions and in-flight requests');
      if (databaseDown) throw new Error('unavailable');
      if (seen.has(v.key)) return []; seen.add(v.key); return [{ key: v.key }];
    } }) }) }),
    delete: () => ({ where: async () => [] }),
    client: async (cid: number) => { if (billingDown) throw new Error('unavailable'); return { id: cid, status: 'Active', email: `client${cid}@example.com`, firstname: 'Client', lastname: String(cid), currency_code: 'AED' }; }
  };
  try {
    const stub = (source: string) => ({ contents: source, loader: 'js' as const });
    await build({ entryPoints: [path.join(ROOT, 'app/account/whmcs/callback/route.ts'), path.join(ROOT, 'app/account/whmcs/start/route.ts')], outdir: tmp, outbase: path.join(ROOT, 'app/account/whmcs'), entryNames: '[dir]', outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'boundaries', setup(b) {
      b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'stub' }));
      b.onResolve({ filter: /^(?:@\/lib\/db|\.\.\/db)$/ }, () => ({ path: 'db', namespace: 'stub' }));
      b.onResolve({ filter: /^@\/lib\/hosting\/servers$/ }, () => ({ path: 'secret', namespace: 'stub' }));
      b.onResolve({ filter: /^@\/lib\/portal\/api$/ }, () => ({ path: 'billing', namespace: 'stub' }));
      b.onResolve({ filter: /^@\/lib\/security\/ratelimit$/ }, () => ({ path: 'limit', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => a.path === 'db' ? stub(`export const db=globalThis[${JSON.stringify(name)}]; export const schema={oauthAssertions:{key:'key',expiresAt:'expires'},auditLogs:{}};`) : a.path === 'secret' ? stub(`export const hmacSecret=async()=>${JSON.stringify(secret)};`) : a.path === 'billing' ? stub(`export const getClientsDetails=globalThis[${JSON.stringify(name)}].client;`) : a.path === 'limit' ? stub('export const limit=async()=>({ok:true});') : stub(''));
    } }] });
    const start = require(path.join(tmp, 'start.cjs'));
    const callback = require(path.join(tmp, 'callback.cjs'));
    const begun = start.GET();
    const state = begun.cookies.get(HANDOFF_COOKIE).value;
    assert.equal(new URL(begun.headers.get('location')).origin, 'https://my.globalhostia.com');
    assert.equal(new URL(begun.headers.get('location')).searchParams.get('gh_portal_state'), state);
    assert.match(begun.headers.get('set-cookie'), /HttpOnly/);
    let serial = 0;
    const assertion = (cid = 123) => {
      const now = Math.floor(Date.now() / 1000);
      const body = Buffer.from(JSON.stringify({ aud: HANDOFF_AUD, cid, admin: 9, state, jti: Buffer.alloc(32, ++serial).toString('base64url'), iat: now, exp: now + 60 })).toString('base64url');
      return body + '.' + createHmac('sha256', secret).update(HANDOFF_AUD + ':' + body).digest('base64url');
    };
    const request = (token: string, origin = 'https://my.globalhostia.com', cookie = state) => new NextRequest('https://globalhostia.com/account/whmcs/callback', { method: 'POST', headers: { origin, cookie: `${HANDOFF_COOKIE}=${cookie}`, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ assertion: token }) });
    const token = assertion();
    const [a, b] = await Promise.all([callback.POST(request(token)), callback.POST(request(token))]);
    assert.deepEqual([a.status, b.status].sort(), [303, 400], 'one successful session across simultaneous replays');
    const success = a.status === 303 ? a : b;
    assert.equal(success.headers.get('location'), 'https://globalhostia.com/account');
    const { jwtVerify } = await import('jose');
    const session = await jwtVerify(success.cookies.get('gh_client').value, new TextEncoder().encode(process.env.AUTH_SECRET), { audience: 'client' });
    assert.equal(session.payload.cid, 123);
    assert.equal(session.payload.email, 'client123@example.com');
    assert.ok(Number(session.payload.exp) - Number(session.payload.iat) <= 900, 'admin handoff session limited to 15 minutes');
    for (const req of [request(assertion(), 'https://attacker.example'), request(assertion(), 'https://my.globalhostia.com', 'x'.repeat(43)), request('forged')]) {
      const r = await callback.POST(req); assert.equal(r.status, 400); assert.equal(r.cookies.get('gh_client'), undefined);
    }
    billingDown = true;
    assert.equal((await callback.POST(request(assertion()))).status, 400);
    billingDown = false; databaseDown = true;
    assert.equal((await callback.POST(request(assertion()))).status, 400);
    assert.equal(callback.GET().status, 400);
  } finally { if (prev === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = prev; delete (globalThis as any)[name]; fs.rmSync(tmp, { recursive: true, force: true }); }
});
