import { login } from './actions';

export const metadata = { title: 'Sign in' };

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <main className="grid min-h-full lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-[#0b1020] p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-500/40 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 right-0 h-[28rem] w-[28rem] rounded-full bg-violet-500/25 blur-3xl" aria-hidden />
        <img src="/image/logo-main-white.png" alt="GlobalHostia" className="relative h-8 w-fit" />
        <div className="relative mt-auto max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight">Run your whole hosting business from one place.</h2>
          <p className="mt-4 text-slate-300">Products, pricing, pages, design and WHMCS — every change goes live instantly.</p>
          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            {['Live WHMCS product & price sync', 'Drag-and-drop page sections with preview', 'Orders, customers & domain search in one dashboard'].map((t) => (
              <li key={t} className="flex items-center gap-3"><span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-400/20 text-[11px] text-emerald-300">✓</span>{t}</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="grid place-items-center bg-white px-6 py-12">
        <form action={login} className="w-full max-w-sm">
          <img src="/image/logo-main-black.png" alt="GlobalHostia" className="mb-10 h-8 lg:hidden" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to the GlobalHostia admin.</p>
          {sp.err && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200" role="alert">{sp.err}</p>}
          <input type="hidden" name="next" value={sp.next || '/admin'} />
          <label className="mt-6 block"><span className="field-label">Email</span><input name="email" type="email" required autoComplete="username" className="input h-11" /></label>
          <label className="mt-4 block"><span className="field-label">Password</span><input name="password" type="password" required autoComplete="current-password" className="input h-11" /></label>
          <button className="btn btn-primary mt-6 h-11 w-full">Sign in</button>
          <p className="mt-6 text-center text-xs text-slate-400">Protected area · activity is logged</p>
        </form>
      </section>
    </main>
  );
}
