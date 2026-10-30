import { requireSession } from '@/lib/session';
import { PageHeader, Card, Field, Flash } from '@/components/ui';
import { changeOwnPassword } from '../users/actions';

export const metadata = { title: 'My account' };

export default async function Account({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireSession('content'); const sp = await searchParams;
  return (
    <>
      <PageHeader title="My account" desc={`${s.email} · ${s.role}`} />
      <Flash sp={sp} />
      <Card title="Profile & password" className="max-w-lg">
        <form action={changeOwnPassword} className="space-y-3">
          <Field label="Display name"><input name="name" defaultValue={s.name} className="input" /></Field>
          <Field label="Current password"><input name="current" type="password" required className="input" autoComplete="current-password" /></Field>
          <Field label="New password"><input name="password" type="password" required minLength={10} className="input" autoComplete="new-password" /></Field>
          <Field label="Confirm new password"><input name="confirm" type="password" required minLength={10} className="input" autoComplete="new-password" /></Field>
          <button className="btn btn-primary">Update</button>
        </form>
      </Card>
    </>
  );
}
