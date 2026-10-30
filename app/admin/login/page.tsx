import { login } from './actions';

export const metadata = { title: 'Sign in' };

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <main className="grid min-h-full place-items-center bg-gradient-to-br from-brand-50 to-white px-4">
      <form action={login} className="card w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <img src="/image/logo-main-black.png" alt="GlobalHostia" className="mx-auto mb-3 h-9" />
          <h1 className="text-xl font-bold">GlobalHostia Admin</h1>
          <p className="text-sm text-slate-500">Sign in to manage your website</p>
        </div>
        {sp.err && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{sp.err}</p>}
        <input type="hidden" name="next" value={sp.next || '/admin'} />
        <label className="mb-4 block"><span className="field-label">Email</span><input name="email" type="email" required autoComplete="username" className="input" /></label>
        <label className="mb-6 block"><span className="field-label">Password</span><input name="password" type="password" required autoComplete="current-password" className="input" /></label>
        <button className="btn btn-primary w-full">Sign in</button>
      </form>
    </main>
  );
}
