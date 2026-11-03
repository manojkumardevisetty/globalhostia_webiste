import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { can } from '@/lib/auth';
import { PageHeader, Card, Badge, Flash, Field, fmtDate } from '@/components/ui';
import { Icon } from '@/components/icons';
import { whmcs, whmcsConfigured } from '@/lib/whmcs';
import { KINDS, WA_KINDS, cartStages, type Kind, type Lang } from '@/lib/reminders/core';
import { loadConfig, state, stats, logPage, waView, hookSecret } from '@/lib/reminders/store';
import { previewData } from '@/lib/reminders/engine';
import { composeFull, transportReady } from '@/lib/reminders/send';
import { smtpFromEnv } from '@/lib/reminders/smtp';
import { WA_TEMPLATES } from '@/lib/reminders/email';
import { supportSettings } from '@/lib/support-notify';
import { setMaster, saveFlows, saveCopy, saveWhatsapp, testSend, runNow } from './actions';
import CopyButton from '../emails/CopyButton';

export const metadata = { title: 'Reminders' };
export const dynamic = 'force-dynamic';

const NAMES: Record<Kind, string> = { cart: 'Abandoned cart', renewal: 'Renewal digest', overdue: 'Overdue invoice', domain: 'Domain at risk' };
const arr = (v: any): any[] => (Array.isArray(v) ? v : v ? [v] : []);
const h = (min: number) => String(Math.round((min / 60) * 10) / 10);
const toneOf = (s: string) => (s === 'sent' ? 'green' : s === 'failed' ? 'red' : s === 'claimed' ? 'yellow' : 'gray');

export default async function Reminders({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireSession('commerce');
  const sp = await searchParams;
  const edit = can(s, 'settings');
  const tab = ['flows', 'copy', 'whatsapp', 'log', 'setup'].includes(sp.tab) ? sp.tab : 'flows';
  const pv = (KINDS as string[]).includes(sp.pv) ? (sp.pv as Kind) : 'cart';
  const pl: Lang = sp.pl === 'ar' ? 'ar' : 'en';
  const cfg = await loadConfig();
  const [st, stat, log, wa, secret, owner, preview, promoCheck] = await Promise.all([
    state(), stats(30).catch(() => ({ rows: [], carts: {} as Record<string, number> })), logPage({ kind: sp.kind || undefined, status: sp.status || undefined, limit: 100 }).catch(() => []), waView(), hookSecret(),
    supportSettings().catch(() => null), previewData(pv, pl, cfg).catch((e: any) => ({ subject: 'Preview unavailable', html: `<p style="padding:24px;font-family:sans-serif">Preview needs WHMCS + database: ${String(e?.message || e)}</p>`, text: '' })),
    cfg.cart.promoCode && whmcsConfigured() ? whmcs('GetPromotions', { code: cfg.cart.promoCode }).then((r) => arr(r.promotions?.promotion).some((p) => String(p.code).toLowerCase() === cfg.cart.promoCode.toLowerCase())).catch(() => null) : Promise.resolve(null),
  ]);
  const smtp = smtpFromEnv();
  const ready = transportReady(cfg);
  const light = composeFull(preview.html, { lang: pl }), dark = composeFull(preview.html, { forceDark: true, lang: pl });
  const totals = (k: Kind) => stat.rows.filter((r) => r.kind === k).reduce((a, r) => ({ sent: a.sent + r.sent, failed: a.failed + r.failed, converted: a.converted + r.converted }), { sent: 0, failed: 0, converted: 0 });
  const tabLink = (k: string, label: string) => <Link href={`/admin/reminders?tab=${k}`} className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{label}</Link>;
  const chk = (name: string, on: boolean, label: string, hint?: string) => (
    <label className="flex items-start gap-2.5 text-sm text-slate-700"><input type="checkbox" name={name} defaultChecked={on} className="mt-0.5 h-4 w-4 accent-slate-900" disabled={!edit} /><span><b className="font-semibold">{label}</b>{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span></label>
  );

  return (
    <>
      <PageHeader title="Reminders" desc="Abandoned-cart emails and a GlobalHostia renewal digest, overdue nudges and domain-at-risk warnings. Only to the customer's own email (WhatsApp only after opt-in, never for carts), with unsubscribe links, quiet hours and frequency caps. WHMCS keeps sending its own invoice emails."
        actions={<>
          <form action={runNow}><input type="hidden" name="dry" value="1" /><button className="btn btn-secondary" disabled={!cfg.enabled}><Icon name="search" /> Dry run</button></form>
          <form action={runNow}><button className="btn btn-secondary" disabled={!cfg.enabled}><Icon name="refresh" /> Run now</button></form>
        </>} />
      <Flash sp={sp} />

      {/* master switch / kill switch */}
      <section className={`mb-6 flex flex-wrap items-center gap-4 rounded-2xl border p-5 ${cfg.enabled ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}>
        <span className={`grid h-11 w-11 place-items-center rounded-full ${cfg.enabled ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}><Icon name={cfg.enabled ? 'check' : 'alert'} className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-slate-900">{cfg.enabled ? 'Reminders are ON' : 'Reminders are OFF: nothing is sent'}</p>
          <p className="text-sm text-slate-500">Email via <b>{cfg.transport === 'smtp' ? 'SMTP' : 'WHMCS SendEmail'}</b> {ready ? <Badge tone="green">ready</Badge> : <Badge tone="red">not configured</Badge>}
            {' · '}Hook secret {secret ? <Badge tone="green">set</Badge> : <Badge tone="red">missing</Badge>}
            {' · '}Last run {st.lastRun ? fmtDate(st.lastRun) : 'never'} · Last WHMCS hook {st.lastHook ? `${fmtDate(st.lastHook)} (${st.lastHookEvent})` : 'never'}</p>
        </div>
        {edit && <form action={setMaster}><input type="hidden" name="on" value={cfg.enabled ? '0' : '1'} />
          <button className={`btn ${cfg.enabled ? 'bg-red-600 text-white hover:bg-red-700' : 'btn-primary'}`}>{cfg.enabled ? 'Kill switch: stop all reminders' : 'Switch reminders on'}</button></form>}
      </section>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {KINDS.map((k) => { const t = totals(k); const on = cfg[k].enabled; return (
          <div key={k} className="card p-4">
            <div className="flex items-center justify-between"><span className="text-[13px] font-semibold text-slate-700">{NAMES[k]}</span><Badge tone={on ? 'green' : 'gray'}>{on ? 'on' : 'off'}</Badge></div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{t.sent}<span className="ml-1 text-sm font-medium text-slate-500">sent · 30 days</span></p>
            <p className="text-xs text-slate-500">{t.converted} converted{t.sent ? ` (${Math.round((t.converted / t.sent) * 100)}%)` : ''}{t.failed ? ` · ${t.failed} failed` : ''}{k === 'cart' ? ` · carts: ${stat.carts.open || 0} open, ${stat.carts.ordered || 0} ordered` : ''}</p>
          </div>); })}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">{tabLink('flows', 'Flows & delivery')}{tabLink('copy', 'Email texts')}{tabLink('whatsapp', 'WhatsApp')}{tabLink('log', 'Sent log')}{tabLink('setup', 'Setup steps')}</div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
        <div className="min-w-0 space-y-6">
          {tab === 'flows' && (
            <form action={saveFlows} className="space-y-6">
              <Card title="Abandoned cart (email only)">
                <div className="space-y-4">
                  {chk('cart_on', cfg.cart.enabled, 'Send cart reminders', 'Signed-in clients on the WHMCS cart pages; stops the moment an order is placed or the cart is emptied.')}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Reminder 1 after (hours)"><input name="cart_first" defaultValue={h(cfg.cart.first)} className="input" inputMode="decimal" disabled={!edit} /></Field>
                    <Field label="Reminder 2 after (hours)"><input name="cart_second" defaultValue={h(cfg.cart.second)} className="input" inputMode="decimal" disabled={!edit} /></Field>
                    <Field label="Reminder 3 after (hours)"><input name="cart_third" defaultValue={h(cfg.cart.third)} className="input" inputMode="decimal" disabled={!edit} /></Field>
                  </div>
                  {chk('cart_third_on', cfg.cart.thirdEnabled, 'Send reminder 3 with a promo code', 'Only when you enter a code that exists in WHMCS. We never invent a discount.')}
                  <Field label="Promo code for reminder 3" hint={cfg.cart.promoCode ? (promoCheck === true ? 'Found in WHMCS → Promotions.' : promoCheck === false ? <span className="text-red-600">Not found in WHMCS → Promotions. Create it there first.</span> : 'Could not check WHMCS right now.') : 'Leave empty: no third reminder.'}>
                    <input name="cart_promo" defaultValue={cfg.cart.promoCode} className="input font-mono" placeholder="e.g. COMEBACK10" autoComplete="off" disabled={!edit} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Consent for clients" hint="Soft: existing clients get cart reminders unless they switch them off (unsubscribe link in every email). Explicit: only after ticking the box at checkout.">
                      <select name="cart_consent" defaultValue={cfg.cart.consent} className="input" disabled={!edit}><option value="soft">Existing clients (soft opt-in)</option><option value="explicit">Only with the checkout box ticked</option></select>
                    </Field>
                    <Field label="Close carts after (days)"><input name="cart_expire" defaultValue={cfg.cart.expireDays} className="input" inputMode="numeric" disabled={!edit} /></Field>
                  </div>
                  {chk('cart_guests', cfg.cart.guests, 'Also guests who tick “Email me a reminder” at checkout', smtp ? 'The guest types the email and ticks the unticked box. Sent over SMTP.' : 'Needs the SMTP transport: WHMCS can only email existing clients.')}
                  <p className="text-xs text-slate-500">Active stages: {cartStages(cfg).map((x) => `${x.stage} after ${h(x.after)}h`).join(' · ')}</p>
                </div>
              </Card>

              {(['renewal', 'overdue', 'domain'] as const).map((k) => (
                <Card key={k} title={NAMES[k]}>
                  <div className="space-y-4">
                    {chk(`${k}_on`, cfg[k].enabled, k === 'renewal' ? 'Send the renewal digest' : k === 'overdue' ? 'Send overdue nudges' : 'Send domain-at-risk warnings',
                      k === 'renewal' ? 'One email per client listing what renews soon, with prices on record, auto-renew and a one-click link to the renewal centre. Domains with auto-renew off go to the domain warning when that is on.'
                        : k === 'overdue' ? 'Per unpaid invoice, after the due date. WHMCS also sends overdue notices (Setup → Automation Settings → Invoice reminders): switch one of them off to avoid doubling.'
                          : 'Domains with auto-renew OFF before expiry, and domains in the grace / redemption period.')}
                    <Field label={k === 'overdue' ? 'Days after the due date' : 'Days before the due / expiry date'} hint="Comma separated, e.g. 30, 14, 7, 1. Each stage is sent once per billing cycle; a missed run catches up within 3 days.">
                      <input name={`${k}_days`} defaultValue={cfg[k].days.join(', ')} className="input" disabled={!edit} />
                    </Field>
                    {k === 'domain' && chk('domain_grace', cfg.domain.grace, 'Warn once when a domain is in the grace period')}
                    <div className="flex flex-wrap gap-5">{chk(`${k}_email`, cfg[k].channels.email, 'Email')}{chk(`${k}_wa`, cfg[k].channels.whatsapp, 'WhatsApp (opted-in clients)', cfg.whatsapp.enabled ? 'Uses the template set on the WhatsApp tab.' : 'WhatsApp is off (WhatsApp tab).')}</div>
                  </div>
                </Card>
              ))}

              <Card title="Delivery, quiet hours and caps">
                <div className="space-y-4">
                  <Field label="Email transport" hint={cfg.transport === 'smtp' ? (smtp ? `SMTP ${smtp.host}:${smtp.port} as ${smtp.from}` : 'Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM in Vercel.') : 'WHMCS SendEmail: your existing WHMCS mail setup and branded header/footer; logged in the client’s email history. No List-Unsubscribe header (WHMCS API limit); the unsubscribe link is in every email.'}>
                    <select name="transport" defaultValue={cfg.transport} className="input" disabled={!edit}><option value="whmcs">WHMCS SendEmail (recommended)</option><option value="smtp">SMTP (your own mailbox; adds one-click unsubscribe headers, reaches guests)</option></select>
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Quiet from (hour)"><input name="quiet_start" defaultValue={cfg.quiet.start} className="input" inputMode="numeric" disabled={!edit} /></Field>
                    <Field label="Quiet until (hour)"><input name="quiet_end" defaultValue={cfg.quiet.end} className="input" inputMode="numeric" disabled={!edit} /></Field>
                    <Field label="Default time zone" hint="Used when the client's country is unknown."><input name="quiet_tz" defaultValue={cfg.quiet.tz} className="input" disabled={!edit} /></Field>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Max per client per day"><input name="cap_day" defaultValue={cfg.caps.perDay} className="input" inputMode="numeric" disabled={!edit} /></Field>
                    <Field label="Max per client per week"><input name="cap_week" defaultValue={cfg.caps.perWeek} className="input" inputMode="numeric" disabled={!edit} /></Field>
                    <Field label="Max emails per run"><input name="cap_run" defaultValue={cfg.caps.perRun} className="input" inputMode="numeric" disabled={!edit} /></Field>
                  </div>
                  <p className="text-xs text-slate-500">Quiet hours are checked in every time zone of the client’s country (e.g. all four US zones). Two reminders to the same person are always at least 4 hours apart.</p>
                </div>
              </Card>
              {edit ? <button className="btn btn-primary">Save settings</button> : <p className="text-xs text-slate-400">Only owners and admins with Settings access can change these.</p>}
            </form>
          )}

          {tab === 'copy' && (
            <form action={saveCopy} className="space-y-6">
              {KINDS.map((k) => (
                <Card key={k} title={NAMES[k]}>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {(['en', 'ar'] as Lang[]).map((l) => (
                      <div key={l} dir={l === 'ar' ? 'rtl' : 'ltr'} className="space-y-3">
                        <Field label={l === 'en' ? 'Subject (English)' : 'Subject (Arabic)'}><input name={`${k}_${l}_subject`} defaultValue={cfg.copy[k][l].subject} className="input" maxLength={150} disabled={!edit} /></Field>
                        <Field label={l === 'en' ? 'Intro (English)' : 'Intro (Arabic)'}><textarea name={`${k}_${l}_intro`} defaultValue={cfg.copy[k][l].intro} className="input min-h-[96px]" maxLength={1200} disabled={!edit} /></Field>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-slate-500">Items, prices, dates and links are filled in from WHMCS. The client’s WHMCS language picks English or Arabic.</p>
                </Card>
              ))}
              {edit && <button className="btn btn-primary">Save texts</button>}
            </form>
          )}

          {tab === 'whatsapp' && (
            <>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <b>Off until you set it up.</b> WhatsApp Business Cloud API (Meta): Meta charges per delivered template message (utility rates by country). You decide whether to switch it on.
                Only clients who ticked the WhatsApp opt-in (account settings or checkout) get messages, at the E.164 number from their WHMCS profile. Abandoned-cart reminders never use WhatsApp.
              </div>
              <form action={saveWhatsapp} className="space-y-6">
                <Card title="Connection">
                  <div className="space-y-4">
                    {chk('wa_on', cfg.whatsapp.enabled, 'Use WhatsApp for renewal, overdue and domain reminders')}
                    {wa.source === 'env' ? <p className="text-sm text-slate-600">Credentials come from Vercel: <b>WHATSAPP_PHONE_ID</b> {wa.phoneId} and <b>WHATSAPP_TOKEN</b>.</p> : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Phone Number ID" hint="Meta → WhatsApp → API setup."><input name="wa_phone_id" defaultValue={wa.phoneId} className="input font-mono" inputMode="numeric" autoComplete="off" disabled={!edit} /></Field>
                        <Field label="Permanent access token" hint={wa.token ? `${wa.token}. Leave empty to keep it.` : 'System-user token with whatsapp_business_messaging. Stored encrypted; never shown again.'}><input name="wa_token" type="password" className="input font-mono" autoComplete="new-password" disabled={!edit} /></Field>
                        {wa.token && chk('wa_clear', false, 'Delete the stored token')}
                      </div>)}
                  </div>
                </Card>
                <Card title="Approved templates">
                  <div className="space-y-5">
                    {WA_KINDS.map((k) => { const t = WA_TEMPLATES[k]; return (
                      <div key={k} className="rounded-xl border border-slate-200 p-4">
                        <div className="mb-2 flex flex-wrap items-center gap-2"><b className="text-sm">{NAMES[k]}</b><Badge tone="blue">{t.category}</Badge><span className="text-xs text-slate-500">Suggested name <code>{t.name}</code> · parameters: {t.params.map((p, i) => `{{${i + 1}}} ${p}`).join(', ')}</span></div>
                        <Field label="Template name in Meta (approved)"><input name={`wa_tpl_${k}`} defaultValue={cfg.whatsapp.templates[k]} placeholder={t.name} className="input font-mono" disabled={!edit} /></Field>
                        <div className="mt-3 grid gap-3 lg:grid-cols-2">
                          {(['en', 'ar'] as const).map((l) => <div key={l} dir={l === 'ar' ? 'rtl' : 'ltr'} className="rounded-lg bg-slate-50 p-3 text-[13px] leading-relaxed text-slate-700"><div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500">{l === 'en' ? 'English (en)' : 'Arabic (ar)'}<CopyButton target={`wa-${k}-${l}`} label="Copy" /></div><pre className="whitespace-pre-wrap font-sans">{t[l]}</pre><textarea id={`wa-${k}-${l}`} readOnly defaultValue={t[l]} className="sr-only" aria-hidden tabIndex={-1} /></div>)}
                        </div>
                      </div>); })}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Language code for English"><input name="wa_lang_en" defaultValue={cfg.whatsapp.langs.en} className="input font-mono" disabled={!edit} /></Field>
                      <Field label="Language code for Arabic"><input name="wa_lang_ar" defaultValue={cfg.whatsapp.langs.ar} className="input font-mono" disabled={!edit} /></Field>
                    </div>
                  </div>
                </Card>
                {edit && <button className="btn btn-primary">Save WhatsApp settings</button>}
              </form>
            </>
          )}

          {tab === 'log' && (
            <Card title="Sent reminders (latest 100)" actions={<span className="text-xs text-slate-500">filter: <Link className="text-brand-600" href="/admin/reminders?tab=log">all</Link> · {KINDS.map((k) => <Link key={k} className="ml-1 text-brand-600" href={`/admin/reminders?tab=log&kind=${k}`}>{k}</Link>)} · <Link className="text-brand-600" href="/admin/reminders?tab=log&status=failed">failed</Link></span>}>
              {!log.length ? <p className="text-sm text-slate-500">Nothing sent yet.</p> : (
                <div className="-mx-5 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-2">When</th><th>Reminder</th><th>Client</th><th>Item</th><th>Channel</th><th>Status</th><th className="pr-5">Converted</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{log.map((r) => (
                      <tr key={r.id}><td className="whitespace-nowrap px-5 py-2 text-slate-500">{fmtDate(r.sentAt || r.createdAt)}</td><td>{NAMES[r.kind as Kind] || r.kind} <span className="text-xs text-slate-400">{r.stage}</span></td>
                        <td>{r.clientId ? <Link className="text-brand-600" href={`/admin/customers/${r.clientId}`}>#{r.clientId}</Link> : 'guest'}<span className="block max-w-[180px] truncate text-xs text-slate-400">{r.email}</span></td>
                        <td className="text-xs text-slate-600">{r.item}{r.cycle ? ` · ${r.cycle}` : ''}</td><td>{r.channel}</td>
                        <td><Badge tone={toneOf(r.status)}>{r.status}</Badge>{r.error && <span className="block max-w-[220px] truncate text-xs text-red-600" title={r.error}>{r.error}</span>}</td>
                        <td className="pr-5">{r.convertedAt ? <Badge tone="green">{fmtDate(r.convertedAt)}</Badge> : <span className="text-slate-300">—</span>}</td></tr>))}</tbody>
                  </table>
                </div>)}
            </Card>
          )}

          {tab === 'setup' && (
            <Card title="One-time setup (owner)">
              <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-slate-700">
                <li>Upload <code>docs/whmcs/globalhostia_reminders_hook.php</code> to <code>&lt;whmcs&gt;/includes/hooks/</code>. It reuses <code>GH_HOSTING_SECRET</code> from the hosting hook {secret ? <Badge tone="green">secret available here</Badge> : <Badge tone="red">set the hook secret in Admin → Hosting panels first</Badge>}.</li>
                <li>Bump the <code>?v=</code> on the existing hook that loads <code>/hp/whmcs.js</code> and <code>/hp/whmcs.css</code>, so browsers fetch the new cart / checkout code.</li>
                <li>Email: keep <b>WHMCS SendEmail</b> (nothing to install; uses the branded Email Global Header/Footer from WHMCS Emails). For one-click unsubscribe headers or guest reminders, set <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code>, <code>SMTP_FROM</code> in Vercel and pick SMTP above.</li>
                <li>Runs: Vercel Cron calls <code>/api/cron/reminders</code> daily at 10:00 Dubai; the hook’s WHMCS cron tick runs it up to every 10 minutes (needed for the 1-hour cart reminder).</li>
                <li>Test: use “Send test” on the preview (goes to WHMCS client #{owner?.clientId ?? 1}, the Support notify client), then switch flows on and the master switch on. Use “Dry run” to see what would be sent.</li>
                <li>WhatsApp (optional): Meta Business → WhatsApp → create the templates from the WhatsApp tab, wait for approval, then enter the Phone Number ID + token and the template names.</li>
              </ol>
            </Card>
          )}
        </div>

        {/* preview */}
        <aside className="min-w-0 space-y-4">
          <Card title="Preview" actions={<span className="flex flex-wrap gap-1 text-xs">{KINDS.map((k) => <Link key={k} href={`/admin/reminders?tab=${tab}&pv=${k}&pl=${pl}`} className={`rounded-full px-2 py-1 ${pv === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{k}</Link>)}
            <Link href={`/admin/reminders?tab=${tab}&pv=${pv}&pl=${pl === 'en' ? 'ar' : 'en'}`} className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{pl === 'en' ? 'العربية' : 'English'}</Link></span>}>
            <p className="mb-2 text-xs text-slate-500">Subject: <b className="text-slate-700">{preview.subject}</b>. Real catalog prices and your own WHMCS client’s data where it exists; example rows (yourbrand.com) are marked by their name.</p>
            <div className="space-y-3">
              <iframe title="Reminder preview (light)" srcDoc={light} sandbox="" className="h-[900px] w-full rounded-lg border border-slate-200" />
              <div className="grid grid-cols-[390px] justify-center overflow-x-auto"><iframe title="Reminder preview (dark, phone width)" srcDoc={dark} sandbox="" className="h-[900px] w-[390px] rounded-lg border border-slate-200" /></div>
            </div>
            <form action={testSend} className="mt-3 flex flex-wrap items-center gap-2"><input type="hidden" name="kind" value={pv} /><input type="hidden" name="lang" value={pl} />
              <button className="btn btn-secondary"><Icon name="mail" /> Send test to me</button><span className="text-xs text-slate-500">WHMCS client #{owner?.clientId ?? 1}</span></form>
          </Card>
        </aside>
      </div>
    </>
  );
}
