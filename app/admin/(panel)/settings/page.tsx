import { requireSession } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { PageHeader, Card, Field, Flash } from '@/components/ui';
import { CYCLES, CYCLE_LABEL } from '@/lib/pricing';
import { saveSettings, generatePushKeys } from './actions';
import { vapid } from '@/lib/portal/push';
import { db, schema } from '@/lib/db';
import { count } from 'drizzle-orm';
import { trustPoints } from '@/lib/theme/growth';

export const metadata = { title: 'Settings' };

export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireSession('settings');
  const sp = await searchParams; const s = await getSettings();
  const keys = await vapid();
  const subs = await db.select({ n: count() }).from(schema.pushSubscriptions).then((r) => Number(r[0]?.n || 0)).catch(() => null);
  const t = (k: string, label: string, hint?: string) => <Field label={label} hint={hint}><input name={k} defaultValue={s[k] ?? ''} className="input" /></Field>;
  return (
    <>
      <PageHeader title="System Settings" desc="Business details, catalogue behaviour and site-wide options. Values are available in any HTML as {{tokens}}." />
      <Flash sp={sp} />
      <form action={saveSettings} className="grid gap-6 lg:grid-cols-2">
        <Card title="Business">
          <div className="grid gap-4">
            {t('site_name', 'Site name', '{{site_name}}')}{t('site_url', 'Public URL', 'Used for canonical URLs & sitemap')}
            {t('phone', 'Phone', '{{phone}}')}{t('email', 'Support email', '{{email}}')}{t('company', 'Legal company name', '{{company}}')}
          </div>
        </Card>
        <Card title="Catalogue & ordering">
          <div className="grid gap-4">
            {t('whmcs_base_url', 'WHMCS client area URL', 'Cart, login & checkout links, e.g. https://globalhostia.com/secure')}
            {t('currency', 'Display currency (ISO code)', 'Must exist in WHMCS → Currencies')}
            <Field label="Default billing cycle shown"><select name="default_cycle" defaultValue={s.default_cycle || 'auto'} className="input"><option value="auto">Automatic (monthly first)</option>{CYCLES.map((c) => <option key={c} value={c}>{CYCLE_LABEL[c]}</option>)}</select></Field>
            {t('order_button_label', 'Order button text')}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="publish_new_products" defaultChecked={s.publish_new_products !== false} /> Publish new WHMCS products automatically on sync</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="sync_auto" defaultChecked={s.sync_auto !== false} /> Daily automatic WHMCS sync</label>
          </div>
        </Card>
        <Card title="Site">
          <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" name="maintenance" defaultChecked={!!s.maintenance} /> Maintenance mode (visitors see a “back soon” page; logged-in admins see the site)</label>
          <Field label="Extra <head> HTML on every page" hint="Verification meta tags, extra analytics, pixels…"><textarea name="custom_head" defaultValue={s.custom_head} rows={6} className="input code" /></Field>
        </Card>
        <Card title="Trust & conversion">
          <div className="grid gap-4">
            <p className="text-sm text-slate-600">Trust strip shown on the home, hosting, VPS, domain and product pages, and in the UAE guides. Untick any claim you do not offer; dependent copy (e.g. the price-lock and money-back rows on /best-hosting-uae) hides with it.</p>
            {trustPoints(s).map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <input type="checkbox" name={`trust_on_${p.id}`} defaultChecked={p.on} aria-label={`Show: ${p.text}`} />
                <input name={`trust_text_${p.id}`} defaultValue={p.text} className="input flex-1" aria-label={`Wording for ${p.id}`} maxLength={120} />
              </div>
            ))}
            {t('whatsapp', 'WhatsApp number', 'With country code, e.g. +971 50 734 1578. Empty = use the phone number above.')}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="whatsapp_float" defaultChecked={s.whatsapp_float !== false} /> Floating WhatsApp button on every page (bottom-left, message pre-filled with the page title)</label>
            {t('migration_department_id', 'Free-migration ticket department ID', 'WHMCS → Support → Departments. Empty = first department returned by the API.')}
            <Field label="Data-center latency test URLs" hint="Optional, one per line: “Germany: https://test-host/ping.png”. Only locations listed here get a measured number on /data-centers; others show the location only."><textarea name="dc_test_urls" defaultValue={s.dc_test_urls || ''} rows={3} className="input code" /></Field>
          </div>
        </Card>
        <Card title="Infrastructure">
          <ul className="space-y-1 text-sm text-slate-600">
            <li>Database: Neon Postgres (Vercel integration) — daily backups & point-in-time restore in Neon.</li>
            <li>Hosting: Vercel (auto-deploy on every git push to <code>main</code>).</li>
            <li>Cache: pages cached at the edge 60s and invalidated on every admin save.</li>
            <li>Secrets (WHMCS keys, auth secret) live in Vercel environment variables only.</li>
            <li>Health check: <a className="text-brand-600" href="/api/health" target="_blank">/api/health</a></li>
          </ul>
        </Card>
        <div className="lg:col-span-2"><button className="btn btn-primary">Save settings</button></div>
      </form>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Customer portal notifications (web push)">
          <div className="grid gap-3 text-sm text-slate-600">
            <p>Customers can turn on browser and phone notifications in <code>/account/settings</code> (ticket replies, new and overdue invoices, domains expiring within 7 days, suspended services). Sending needs a VAPID key pair.</p>
            {keys ? (
              <>
                <p><b>Status:</b> ready ({keys.source === 'env' ? 'keys from the VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY environment variables' : 'keys generated here, private key encrypted in the database'}) · {subs === null ? 'subscription table not created yet (runs on the next deploy)' : `${subs} subscribed device${subs === 1 ? '' : 's'}`}</p>
                <p className="break-all"><b>Public key:</b> <code>{keys.publicKey}</code></p>
              </>
            ) : <p><b>Status:</b> not set up. Generate a key pair below (or set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT in Vercel).</p>}
            <p>Notifications are checked by the daily cron and by <code>/api/cron/push</code> (Bearer CRON_SECRET), which you can call more often from an external scheduler. Staff replies from the admin support page are sent at once.</p>
          </div>
          {keys?.source !== 'env' && (
            <form action={generatePushKeys} className="mt-4 grid gap-3">
              <Field label="Contact (VAPID subject)" hint="mailto: address push services can contact about your notifications"><input name="push_subject" defaultValue={keys?.subject || `mailto:${s.email || 'support@globalhostia.com'}`} className="input" /></Field>
              {keys && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" required /> Replace the current keys (every customer must turn notifications on again)</label>}
              <div><button className="btn">{keys ? 'Regenerate keys' : 'Generate keys'}</button></div>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
