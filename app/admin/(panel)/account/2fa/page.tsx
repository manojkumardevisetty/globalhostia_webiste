import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { PageHeader, Card, Field, Flash } from '@/components/ui';
import { getMfa, pendingEnrol } from '@/lib/security/mfa';
import { finishEnrol } from '../security-actions';

export const metadata = { title: 'Set up two-factor' };
export const dynamic = 'force-dynamic';

export default async function Enrol({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireSession('content'); const sp = await searchParams;
  const r = await getMfa(s.uid);
  if (r?.enabled) redirect('/admin/account');
  const e = await pendingEnrol(s.uid, s.email);
  if (!e) redirect('/admin/account');
  return (
    <>
      <PageHeader title="Set up two-factor sign-in" desc="Two steps: scan the code, then type the 6 digits the app shows." />
      <Flash sp={sp} />
      <Card className="max-w-lg">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
          <li>Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password, Authy) and add an account by scanning this QR code.</li>
          <li>Type the 6-digit code it shows below. The code changes every 30 seconds.</li>
        </ol>
        <div className="mx-auto my-5 w-fit rounded-xl ring-1 ring-slate-200" dangerouslySetInnerHTML={{ __html: e.qrSvg }} />
        <details className="mb-4 text-xs text-slate-500"><summary className="cursor-pointer">Can’t scan? Enter this key in the app</summary><code className="mt-2 block break-all rounded bg-slate-100 p-2 font-mono text-slate-800">{e.secret.replace(/(.{4})/g, '$1 ').trim()}</code></details>
        <form action={finishEnrol} className="flex flex-wrap items-end gap-2">
          <Field label="6-digit code" className="w-44"><input name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus className="input text-center font-mono tracking-[0.3em]" /></Field>
          <button className="btn btn-primary">Turn on two-factor</button>
        </form>
      </Card>
    </>
  );
}
