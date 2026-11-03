import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { PageHeader, Card, Badge, Flash, fmtDate } from '@/components/ui';
import { whmcs, whmcsConfigured } from '@/lib/whmcs';
import {
  TEMPLATES, DESIGN_KEYS, BRAND_SETTINGS, EMAIL_DESIGN_VERSION, composeEmail, templateFlags, hasOldBrand, needsBrandFix, buildSql, designValues,
} from '@/lib/email-brand';
import { applyDesign, restoreDesign } from './actions';
import { explainWhmcsError, isPermissionError, ROLE_HINT } from './whmcs-errors';
import CopyButton from './CopyButton';

export const metadata = { title: 'WHMCS Emails' };
export const dynamic = 'force-dynamic';

const TYPES: [string, string][] = [
  ['general', 'Account & general'], ['user', 'Users & login'], ['product', 'Products & services'], ['domain', 'Domains'], ['invoice', 'Invoices & billing'],
  ['support', 'Support'], ['notification', 'Notifications'], ['affiliate', 'Affiliates'], ['invite', 'Invites'], ['admin', 'Admin-only'],
];
type Tpl = { id: number | string; name: string; subject?: string; custom?: number | string | boolean };

const listOf = (r: any): Tpl[] => {
  const e = r?.emailtemplates;
  const arr = Array.isArray(e) ? e : e?.emailtemplate ?? [];
  return Array.isArray(arr) ? arr : [arr];
};

async function loadTemplates() {
  const errors: string[] = [];
  const calls = await Promise.allSettled([...TYPES.map(([t]) => whmcs('GetEmailTemplates', { type: t })), whmcs('GetEmailTemplates')]);
  const groups: { type: string; label: string; items: Tpl[] }[] = [];
  const seen = new Set<string>();
  calls.forEach((c, i) => {
    if (c.status === 'rejected') { const m = explainWhmcsError(c.reason); if (!errors.includes(m)) errors.push(m); return; }
    const items = listOf(c.value).filter((t) => !seen.has(String(t.id)));
    items.forEach((t) => seen.add(String(t.id)));
    if (items.length) groups.push({ type: TYPES[i]?.[0] ?? 'other', label: TYPES[i]?.[1] ?? 'Other', items: items.sort((a, b) => a.name.localeCompare(b.name)) });
  });
  return { groups, errors, total: seen.size };
}

async function loadConfig() {
  const keys = [...DESIGN_KEYS, ...BRAND_SETTINGS.map((b) => b.key)];
  const res = await Promise.allSettled(keys.map((k) => whmcs<{ value?: string }>('GetConfigurationValue', { setting: k })));
  const values: Record<string, string | null> = {};
  const errors: string[] = [];
  res.forEach((r, i) => {
    if (r.status === 'fulfilled') values[keys[i]] = r.value.value ?? '';
    else { values[keys[i]] = null; const m = explainWhmcsError(r.reason); if (!errors.includes(m)) errors.push(m); }
  });
  return { values, errors };
}

export default async function Emails({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireSession('integration');
  const sp = await searchParams;
  const ok = whmcsConfigured();
  const [tpl, cfg, backups] = await Promise.all([
    ok ? loadTemplates() : Promise.resolve({ groups: [], errors: [], total: 0 }),
    ok ? loadConfig() : Promise.resolve({ values: {} as Record<string, string | null>, errors: [] as string[] }),
    db.select().from(schema.emailDesignBackups).orderBy(desc(schema.emailDesignBackups.createdAt)).limit(8).catch(() => []),
  ]);
  const allErrors = [...cfg.errors, ...tpl.errors.filter((e) => !cfg.errors.includes(e))];
  const permission = allErrors.some(isPermissionError);
  const header = cfg.values.EmailGlobalHeader;
  const design = designValues();
  const active = header == null ? null : header.includes(EMAIL_DESIGN_VERSION) ? (DESIGN_KEYS.every((k) => cfg.values[k] === design[k]) ? 'current' : 'older') : 'none';
  const found = new Set(tpl.groups.flatMap((g) => g.items.map((t) => t.name)));
  const missing = ok && tpl.total ? TEMPLATES.filter((t) => !found.has(t.name)) : [];
  const oldBrandCount = tpl.groups.flatMap((g) => g.items).filter((t) => hasOldBrand(`${t.name} ${t.subject ?? ''}`)).length;

  // preview
  const sel = TEMPLATES.find((t) => t.name === sp.t) ?? TEMPLATES.find((t) => t.name === 'Hosting Account Welcome Email')!;
  const device = sp.device === 'mobile' ? 'mobile' : 'desktop';
  const light = composeEmail(sel.message);
  const dark = composeEmail(sel.message, { forceDark: true });
  const subjectPreview = composeEmail(sel.subject).replace(/<[^>]+>/g, '').trim();
  const sql = buildSql();
  const w = device === 'mobile' ? 375 : 640;

  return (
    <>
      <PageHeader title="WHMCS Emails" desc="One branded design for every email WHMCS sends from my.globalhostia.com: responsive, light and dark mode, real products and services." />
      <Flash sp={sp} />
      {!ok && <div className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">WHMCS API is not configured on this deployment, so the live template list and the Apply button are unavailable. Preview and SQL still work.</div>}
      {allErrors.length > 0 && (
        <div className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200" role="alert">
          <p className="font-semibold">{permission ? 'WHMCS refused some API calls (permissions)' : 'Some WHMCS API calls failed'}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">{allErrors.map((e) => <li key={e} className="break-words">{e}</li>)}</ul>
          {permission && <p className="mt-2 text-red-900">{ROLE_HINT}</p>}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="1 · Branded design (header, footer, CSS)" className="xl:col-span-1">
          <dl className="mb-4 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2"><dt className="text-slate-500">Status in WHMCS</dt><dd>
              {active === 'current' ? <Badge tone="green">Branded design active</Badge> : active === 'older' ? <Badge tone="yellow">Older branded version</Badge> : active === 'none' ? <Badge tone="red">Not branded yet</Badge> : <Badge>Unknown</Badge>}
            </dd></div>
            {BRAND_SETTINGS.map((b) => {
              const v = cfg.values[b.key];
              return (
                <div key={b.key} className="flex items-start justify-between gap-3">
                  <dt className="text-slate-500">{b.key}</dt>
                  <dd className="min-w-0 text-right text-xs">
                    {v == null ? <span className="text-slate-400">—</span> : <span className="break-all">{v.split('\n')[0] || <i className="text-slate-400">empty</i>}</span>}
                    {v != null && needsBrandFix(b.key, v) && <div><Badge tone="red">{hasOldBrand(v) ? 'old name' : 'needs fix'}</Badge></div>}
                  </dd>
                </div>
              );
            })}
          </dl>
          <form action={applyDesign} className="space-y-3">
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" name="fix_brand" defaultChecked className="mt-1" />
              <span>Also fix company name, sender name, signature and logo URL <b>only where</b> they still say BudgetGlobalHosting or are empty.</span>
            </label>
            <button className="btn btn-primary h-12 w-full text-base" disabled={!ok}>Apply branded design</button>
          </form>
          <p className="mt-2 text-xs text-slate-500">Reads the current values first (GetConfigurationValue), saves them here as a backup with an audit-log entry, then sets the new ones (SetConfigurationValue) and reads them back to verify. Template wording is not changed by this button.</p>
          <form action={restoreDesign} className="mt-4">
            <button className="btn btn-secondary w-full" disabled={!ok || !backups.length}>Restore previous</button>
          </form>
          {backups.length > 0 && (
            <details className="mt-3 text-xs text-slate-600">
              <summary className="cursor-pointer">Backups ({backups.length})</summary>
              <ul className="mt-2 space-y-2">{backups.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <span>{fmtDate(b.createdAt)} · {Object.keys(b.values as object).join(', ')}<br /><span className="text-slate-400">{b.note} · {b.userEmail}{b.restoredAt ? ` · restored ${fmtDate(b.restoredAt)}` : ''}</span></span>
                  <form action={restoreDesign}><input type="hidden" name="id" value={b.id} /><button className="btn btn-ghost h-8 px-2 text-xs" disabled={!ok}>Restore</button></form>
                </li>))}</ul>
            </details>
          )}
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <b>API check (developers.whmcs.com):</b> GetConfigurationValue / SetConfigurationValue read and write any system setting by name, including EmailCSS, EmailGlobalHeader and EmailGlobalFooter. WHMCS documents SetConfigurationValue as <i>local API only</i>, so a remote call may be refused; this button then shows the error, and step 2 of the SQL sets the same values. Because of that there is no automatic apply; it runs only when you tap. GetEmailTemplates returns id, name, subject and the custom flag only (no body), and no API action can edit template bodies.
          </p>
        </Card>

        <Card title="Live preview" className="xl:col-span-2" actions={<span className="text-xs text-slate-500">Rendered here with sample data</span>}>
          <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
            <label className="min-w-0 flex-1 text-sm"><span className="mb-1 block text-xs font-medium text-slate-500">Email</span>
              <select name="t" defaultValue={sel.name} className="input h-10 w-full">
                {[...new Set(TEMPLATES.map((t) => t.group))].map((g) => (
                  <optgroup key={g} label={g}>{TEMPLATES.filter((t) => t.group === g).map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}</optgroup>
                ))}
              </select>
            </label>
            <input type="hidden" name="device" value={device} />
            <button className="btn btn-secondary h-10">Show</button>
            <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-300">
              {(['desktop', 'mobile'] as const).map((d) => (
                <Link key={d} href={`/admin/emails?t=${encodeURIComponent(sel.name)}&device=${d}`} className={`px-3 py-2 text-sm ${device === d ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}>{d === 'desktop' ? 'Desktop' : 'Mobile'}</Link>
              ))}
            </div>
          </form>
          <p className="mb-3 truncate text-sm"><span className="text-slate-500">Subject:</span> <b>{subjectPreview}</b> <span className="text-xs text-slate-400">· {sel.purpose}</span></p>
          <div className={`grid gap-4 ${device === 'mobile' ? 'sm:grid-cols-2' : '2xl:grid-cols-2'}`}>
            {([['Light mode', light, 'light'], ['Dark mode', dark, 'dark']] as const).map(([label, html, scheme]) => (
              <figure key={label} className="min-w-0">
                <figcaption className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{label} · {device}</figcaption>
                <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200" style={{ background: scheme === 'dark' ? '#0b1116' : '#f6f7f9' }}>
                  <iframe title={`${sel.name} – ${label}`} srcDoc={html} sandbox="" style={{ width: w, maxWidth: device === 'mobile' ? '100%' : undefined, height: device === 'mobile' ? 1400 : 1250, border: 0, display: 'block', margin: '0 auto', colorScheme: scheme }} />
                </div>
              </figure>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">Dark mode follows the reader&apos;s setting in Apple Mail, iOS Mail, Outlook (Mac, Outlook.com, apps) and Samsung Mail. Gmail apps invert colours themselves; the dark header, brand buttons and blend-mode button text are built to survive that.</p>
        </Card>

        <Card title={`WHMCS templates${tpl.total ? ` (${tpl.total})` : ''}`} className="xl:col-span-3" actions={oldBrandCount > 0 ? <Badge tone="red">{oldBrandCount} still say BudgetGlobalHosting</Badge> : undefined}>
          {!ok ? <p className="text-sm text-slate-500">Connect WHMCS to list templates.</p> : !tpl.groups.length ? <p className="text-sm text-slate-500">No templates returned{tpl.errors.length ? ' (see the error above)' : ''}.</p> : (
            <div className="space-y-6">
              {tpl.groups.map((g) => (
                <section key={g.type}>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">{g.label} <span className="font-normal text-slate-400">({g.items.length})</span></h3>
                  <div className="overflow-x-auto"><table className="table"><thead><tr><th>Template</th><th>Subject</th><th>Flags</th></tr></thead>
                    <tbody>{g.items.map((t) => (
                      <tr key={t.id}>
                        <td className="font-medium">{t.name}{TEMPLATES.some((x) => x.name === t.name) && <Link className="ml-2 text-xs text-brand-600" href={`/admin/emails?t=${encodeURIComponent(t.name)}&device=${device}`}>preview</Link>}</td>
                        <td className="max-w-md break-words text-xs text-slate-600">{t.subject}</td>
                        <td><div className="flex flex-wrap gap-1">{templateFlags(t).filter((f) => g.type !== 'admin' || f.label !== 'Unbranded subject').map((f) => <Badge key={f.label} tone={f.tone}>{f.label}</Badge>)}</div></td>
                      </tr>))}</tbody></table></div>
                </section>
              ))}
              {missing.length > 0 && <p className="text-sm text-amber-700">Not found in WHMCS (the SQL skips these): {missing.map((m) => m.name).join(', ')}.</p>}
            </div>
          )}
        </Card>

        <Card title="2 · Template wording + product welcome emails (SQL, one paste)" className="xl:col-span-3" actions={<a className="text-sm text-brand-600" href="/admin/emails/sql">Download .sql</a>}>
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-slate-700">
            <li>Tap <b>Copy SQL</b>.</li>
            <li>cPanel → <b>phpMyAdmin</b> → click database <code className="text-xs">ofgizflz_whmcs</code> → <b>SQL</b> tab.</li>
            <li>Paste → <b>Go</b>. The two tables at the end show every product&apos;s welcome email and the rewritten templates.</li>
          </ol>
          <div className="mb-3 flex flex-wrap gap-2"><CopyButton target="gh-email-sql" /><a className="btn btn-secondary" href="/admin/emails/sql">Download .sql</a></div>
          <textarea id="gh-email-sql" readOnly value={sql} className="input h-72 w-full font-mono text-[11px] leading-snug" spellCheck={false} aria-label="SQL for phpMyAdmin" />
          <ul className="mt-3 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
            <li>• Backs up <code>tblemailtemplates</code>, <code>tblproducts</code> and the email settings to <code>*_bak_YYYYMMDD</code> first; stops without changes if today&apos;s backup exists.</li>
            <li>• Rewrites {TEMPLATES.length} client-facing templates (default language only; translations untouched) with standard merge fields.</li>
            <li>• Welcome email by product type: hosting, reseller, VPS/dedicated, other (n8n, workspaces, email) and SSL → SSL template.</li>
            <li>• Admin templates are not rewritten; &quot;Support Ticket Created/Response&quot; are switched on if disabled. Undo statements are at the top.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
