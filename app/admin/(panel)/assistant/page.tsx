import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHeader, Stat } from '@/components/ui';
import { aiKeyPresent, aiSettings, spend, usageTablesExist } from '@/lib/ai/server';
import AdminChat from './AdminChat';

export const metadata = { title: 'AI assistant' };
export const dynamic = 'force-dynamic';

export default async function AssistantPage() {
  await requireSession('commerce');
  const [s, sp, tables] = await Promise.all([aiSettings(true), spend(), usageTablesExist()]);
  const key = aiKeyPresent() || process.env.AI_MOCK === '1';
  const offline = !key ? 'Assistant offline: ANTHROPIC_API_KEY is not set.' : !s.surfaces.admin ? 'The admin assistant is switched off in AI settings.' : null;
  return (
    <>
      <PageHeader title="AI assistant" desc="Ask about your business in plain words. Powered by Claude; answers come from WHMCS and your servers, read-only."
        actions={<><Link href="/admin/assistant/usage" className="btn btn-secondary">Usage &amp; costs</Link><Link href="/admin/assistant/settings" className="btn btn-secondary">Settings</Link></>} />
      {!key && (
        <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm leading-relaxed text-amber-900">
          <b>Add ANTHROPIC_API_KEY.</b> In Vercel open the project, then Settings &gt; Environment Variables, add <code>ANTHROPIC_API_KEY</code> (Production and Preview) and redeploy.
          Until then the website chat, customer assistant and ticket automation show &ldquo;assistant offline, contact support&rdquo;.
        </div>
      )}
      {!tables && <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">The AI usage tables are created on the next deploy (db-setup patch 030-ai). Usage and budgets are tracked in memory until then.</div>}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Spend this month" value={`$${sp.month.toFixed(2)}`} sub={`of $${s.monthlyBudgetUsd.toFixed(0)} monthly budget`} icon="dollar" tone="brand" href="/admin/assistant/usage" />
        <Stat label="Spend today" value={`$${sp.today.toFixed(2)}`} sub={`daily cap $${s.dailyBudgetUsd.toFixed(0)}`} icon="activity" tone="sky" href="/admin/assistant/usage" />
        <Stat label="Surfaces on" value={`${Object.values(s.surfaces).filter(Boolean).length} / 4`} sub={Object.entries(s.surfaces).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'} icon="settings" tone="green" href="/admin/assistant/settings" />
      </div>
      <AdminChat offline={offline} />
    </>
  );
}
