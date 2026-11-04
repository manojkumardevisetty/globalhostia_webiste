import { requireSession } from '@/lib/session';
import { PageHeader, Card, LinkBtn } from '@/components/ui';
import { readCodesCookie } from '@/lib/security/admin-cookies';
import { codesSaved } from '../security-actions';

export const metadata = { title: 'Recovery codes' };
export const dynamic = 'force-dynamic';

export default async function Codes() {
  const s = await requireSession('content');
  const codes = await readCodesCookie(s.uid);
  return (
    <>
      <PageHeader title="Your recovery codes" desc="Each code signs you in once when your phone is not at hand." />
      <Card className="max-w-lg">
        {codes ? (
          <>
            <p className="text-sm text-slate-600">Save these 10 codes somewhere safe (a password manager, or printed). <b>They are shown only once.</b> Making new codes cancels these.</p>
            <ul className="my-5 grid grid-cols-2 gap-2 font-mono text-[15px] text-slate-900">{codes.map((c) => <li key={c} className="rounded-lg bg-slate-100 px-3 py-2 text-center">{c}</li>)}</ul>
            <form action={codesSaved}><button className="btn btn-primary">I have saved them</button></form>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">These codes were already shown (or 15 minutes have passed). If you did not save them, make new ones in My account.</p>
            <div className="mt-4"><LinkBtn href="/admin/account">Back to My account</LinkBtn></div>
          </>
        )}
      </Card>
    </>
  );
}
