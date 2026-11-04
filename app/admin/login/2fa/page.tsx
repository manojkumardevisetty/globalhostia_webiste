import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { verifyPurpose } from '@/lib/auth';
import { PENDING_COOKIE } from '@/lib/security/admin-cookies';
import { pendingEnrol, startEnrol } from '@/lib/security/mfa';
import { securityConfig } from '@/lib/security/config';
import { verify2fa, enrolAtLogin, cancelLogin } from '../actions';

export const metadata = { title: 'Two-factor sign-in' };
export const dynamic = 'force-dynamic';

export default async function TwoFactor({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const t = await verifyPurpose('admin-mfa', (await cookies()).get(PENDING_COOKIE)?.value);
  if (!t) redirect('/admin/login?err=' + encodeURIComponent('Your sign-in step expired. Please sign in again.'));
  const [u] = await db.select({ id: schema.adminUsers.id, email: schema.adminUsers.email }).from(schema.adminUsers).where(eq(schema.adminUsers.id, String(t.uid))).limit(1);
  if (!u) redirect('/admin/login');
  const cfg = await securityConfig();
  const enrol = t.stage === 'enrol';
  const e = enrol ? (await pendingEnrol(u.id, u.email)) || (await startEnrol(u.id, u.email)) : null;
  return (
    <main className="grid min-h-full place-items-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <img src="/image/logo-main-black.png" alt="GlobalHostia" className="mb-8 h-7" />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{enrol ? 'Set up two-factor sign-in' : 'Two-factor sign-in'}</h1>
        <p className="mt-1 text-sm text-slate-500">{u.email}</p>
        {sp.err && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200" role="alert">{sp.err}</p>}
        {enrol && e ? (
          <form action={enrolAtLogin} className="mt-6 space-y-4">
            <p className="text-sm text-slate-600">Your account requires two-factor sign-in. Scan this code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy), then enter the 6-digit code it shows.</p>
            <div className="mx-auto w-fit rounded-xl ring-1 ring-slate-200" dangerouslySetInnerHTML={{ __html: e.qrSvg }} />
            <details className="text-xs text-slate-500"><summary className="cursor-pointer">Can’t scan? Enter this key instead</summary><code className="mt-2 block break-all rounded bg-slate-100 p-2 font-mono text-slate-800">{e.secret.replace(/(.{4})/g, '$1 ').trim()}</code></details>
            <label className="block"><span className="field-label">6-digit code</span><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus className="input h-11 text-center font-mono text-lg tracking-[0.3em]" /></label>
            <button className="btn btn-primary h-11 w-full">Turn on and continue</button>
          </form>
        ) : (
          <form action={verify2fa} className="mt-6 space-y-4">
            <label className="block"><span className="field-label">Code from your authenticator app</span><input name="code" autoComplete="one-time-code" maxLength={16} required autoFocus className="input h-11 text-center font-mono text-lg tracking-[0.2em]" placeholder="123 456" /></label>
            <p className="text-xs text-slate-500">Lost your phone? Enter one of your recovery codes (like <code>abcde-23456</code>) instead. Each works once.</p>
            {cfg.mfa.rememberDays > 0 && <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="remember" /> Remember this browser for {cfg.mfa.rememberDays} days</label>}
            <button className="btn btn-primary h-11 w-full">Verify and sign in</button>
          </form>
        )}
        <form action={cancelLogin}><button className="mt-4 w-full text-center text-sm text-slate-500 hover:text-slate-800">Cancel and sign in as someone else</button></form>
      </div>
    </main>
  );
}
