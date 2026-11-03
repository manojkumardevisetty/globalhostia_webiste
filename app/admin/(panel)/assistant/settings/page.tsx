import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHeader, Card, Field, Flash, Badge } from '@/components/ui';
import { aiKeyPresent, aiSettings } from '@/lib/ai/server';
import { redactSettings, DEFAULT_KNOWLEDGE } from '@/lib/ai/settings-core';
import { saveAi, killAll } from '../actions';

export const metadata = { title: 'AI settings' };
export const dynamic = 'force-dynamic';

const Num = ({ name, label, value, hint, step = '1', min, max }: { name: string; label: string; value: number; hint?: string; step?: string; min?: number; max?: number }) => (
  <Field label={label} hint={hint}><input className="input" type="number" name={name} defaultValue={value} step={step} min={min} max={max} /></Field>
);
const Check = ({ name, label, checked, hint }: { name: string; label: string; checked: boolean; hint?: string }) => (
  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
    <input type="checkbox" name={name} defaultChecked={checked} className="mt-0.5" />
    <span><span className="block text-sm font-semibold text-slate-800">{label}</span>{hint && <span className="block text-xs leading-relaxed text-slate-500">{hint}</span>}</span>
  </label>
);

export default async function AiSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireSession('settings');
  const [raw, sp] = await Promise.all([aiSettings(true), searchParams]);
  const s = redactSettings(raw);
  const key = aiKeyPresent();
  const models = [...new Set(['claude-sonnet-5-5', 'claude-haiku-5-5', s.chatModel, s.fastModel])];
  return (
    <>
      <Link href="/admin/assistant" className="mb-4 inline-flex text-sm text-slate-500 hover:text-slate-800">&larr; AI assistant</Link>
      <PageHeader title="AI settings" desc="Models, budgets, limits, the scope filter, ticket automation and what the assistant knows about your business."
        actions={<form action={killAll}><button className="btn btn-danger">Switch off customer-facing AI</button></form>} />
      <Flash sp={sp} />
      <div className={`mb-6 flex flex-wrap items-center gap-3 rounded-2xl border p-4 text-sm ${key ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
        <Badge tone={key ? 'green' : 'yellow'}>{key ? 'API key set' : 'API key missing'}</Badge>
        {key ? <span>ANTHROPIC_API_KEY is set in the environment (never shown here or sent to browsers).</span>
          : <span><b>Add ANTHROPIC_API_KEY</b> in Vercel, Settings &gt; Environment Variables, then redeploy. Until then every AI surface shows &ldquo;assistant offline, contact support&rdquo;.</span>}
      </div>
      <form action={saveAi} className="space-y-6">
        <Card title="On / off">
          <div className="grid gap-3 sm:grid-cols-2">
            <Check name="surfaces.chat" label="Website chat" checked={s.surfaces.chat} hint="Floating assistant on the marketing site (pre-sales, domains, cart)." />
            <Check name="surfaces.assist" label="Customer assistant API" checked={s.surfaces.assist} hint="Account dashboard and hosting panel assistant (/api/ai/assist)." />
            <Check name="surfaces.tickets" label="Ticket automation" checked={s.surfaces.tickets} hint="Classify new tickets and customer replies, draft answers." />
            <Check name="tickets.autoSend" label="Auto-send simple answers" checked={s.tickets.autoSend} hint="Only simple how-to tickets above the confidence threshold; everything else is a draft for you." />
            <Check name="surfaces.admin" label="Admin assistant" checked={s.surfaces.admin} hint="This page's read-only business assistant." />
            <Check name="gate.haiku" label="Small-model scope check" checked={s.gate.haiku} hint="Ambiguous messages get a 5-token ON/OFF check before the main model. Clear off-topic messages never reach a model." />
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="Models and budget">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Main model" hint="Chat answers, drafts, assistant."><input className="input" name="chatModel" defaultValue={s.chatModel} required pattern="claude-[a-z0-9.-]{2,60}" /></Field>
              <Field label="Fast model" hint="Scope check, ticket classification, name ideas."><input className="input" name="fastModel" defaultValue={s.fastModel} required pattern="claude-[a-z0-9.-]{2,60}" /></Field>
              <Field label="Effort" hint="Lower is faster and cheaper."><select className="input" name="effort" defaultValue={s.effort}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
              <Num name="salesDeptId" label="Sales department ID (WHMCS)" value={s.salesDeptId} hint="0 = the department named Sales, else the first." min={0} />
              <Num name="monthlyBudgetUsd" label="Monthly budget (USD)" value={s.monthlyBudgetUsd} step="0.5" min={0} hint="All AI stops at this spend. 0 switches AI off." />
              <Num name="dailyBudgetUsd" label="Daily budget (USD)" value={s.dailyBudgetUsd} step="0.5" min={0} hint="0 = no daily cap." />
            </div>
          </Card>
          <Card title="Ticket automation">
            <div className="grid gap-4 sm:grid-cols-2">
              <Num name="tickets.threshold" label="Auto-send confidence" value={s.tickets.threshold} step="0.01" min={0.5} max={1} hint="Default 0.85." />
              <Num name="tickets.perRun" label="Tickets per run" value={s.tickets.perRun} min={1} max={10} />
              <Num name="tickets.maxAgeHours" label="Only activity newer than (hours)" value={s.tickets.maxAgeHours} min={1} />
              <Field label="VIP client IDs" hint="Never auto-replied. Comma separated."><input className="input" name="tickets.vipClientIds" defaultValue={s.tickets.vipClientIds.join(', ')} /></Field>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">Auto-send also requires: category how-to (or simple technical), no billing / refund / cancellation / abuse / legal / security words, not VIP, no earlier auto-reply on the ticket, and a WHMCS admin username on the Support page. Replies are signed &ldquo;GlobalHostia Assistant&rdquo; with &ldquo;Reply &apos;human&apos; to reach our team&rdquo;. Tickets are never closed.</p>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="Website chat limits">
            <div className="grid gap-4 sm:grid-cols-2">
              <Num name="chat.maxTurns" label="Messages per conversation" value={s.chat.maxTurns} min={1} />
              <Num name="chat.maxChars" label="Characters per message" value={s.chat.maxChars} min={100} />
              <Num name="chat.maxTokens" label="Max answer tokens" value={s.chat.maxTokens} min={150} />
              <Num name="chat.historyTurns" label="History sent (turns)" value={s.chat.historyTurns} min={1} />
              <Num name="chat.ipDailyCalls" label="Model calls per visitor per day" value={s.chat.ipDailyCalls} min={1} />
              <Num name="chat.burstPerMin" label="Messages per minute" value={s.chat.burstPerMin} min={1} />
              <Num name="chat.minTypingMs" label="Minimum typing time (ms)" value={s.chat.minTypingMs} min={0} hint="First message faster than this is treated as a bot." />
              <Num name="chat.nameChecksPerConversation" label="Domain checks per conversation" value={s.chat.nameChecksPerConversation} min={0} />
              <Field label="Cloudflare Turnstile site key" hint="Optional bot check before the first message."><input className="input" name="chat.turnstileSiteKey" defaultValue={s.chat.turnstileSiteKey} /></Field>
              <Field label="Turnstile secret key" hint={s.chat.turnstileSecret ? `Saved (${s.chat.turnstileSecret}). Leave empty to keep.` : 'Stored server-side only.'}><input className="input" name="chat.turnstileSecret" type="password" autoComplete="off" /></Field>
            </div>
            {s.chat.turnstileSecret && <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" name="chat.turnstileClear" /> Remove Turnstile</label>}
          </Card>
          <Card title="Customer assistant limits">
            <div className="grid gap-4 sm:grid-cols-2">
              <Num name="assist.maxTurns" label="Messages per conversation" value={s.assist.maxTurns} min={1} />
              <Num name="assist.maxChars" label="Characters per message" value={s.assist.maxChars} min={100} />
              <Num name="assist.maxTokens" label="Max answer tokens" value={s.assist.maxTokens} min={150} />
              <Num name="assist.historyTurns" label="History sent (turns)" value={s.assist.historyTurns} min={1} />
              <Num name="assist.clientDailyCalls" label="Model calls per customer per day" value={s.assist.clientDailyCalls} min={1} />
              <Num name="assist.burstPerMin" label="Messages per minute" value={s.assist.burstPerMin} min={1} />
            </div>
          </Card>
        </div>

        <Card title="Scope filter (off-topic protection)">
          <div className="grid gap-4 sm:grid-cols-4">
            <Num name="gate.perWindow" label="Off-topic strikes" value={s.gate.perWindow} min={1} hint="in the window below" />
            <Num name="gate.windowMin" label="Window (minutes)" value={s.gate.windowMin} min={1} />
            <Num name="gate.cooldownMin" label="Cooldown (minutes)" value={s.gate.cooldownMin} min={1} />
            <Num name="gate.dailyBlock" label="Blocked for the day after" value={s.gate.dailyBlock} min={1} />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Extra off-topic words" hint="One per line. Messages with these words (and no hosting words) get the fixed line, no model call."><textarea className="input min-h-[120px] font-mono text-[13px]" name="gate.extraOff" defaultValue={s.gate.extraOff.join('\n')} /></Field>
            <Field label="Extra on-topic words" hint="One per line, e.g. product names. These always go to the assistant."><textarea className="input min-h-[120px] font-mono text-[13px]" name="gate.extraOn" defaultValue={s.gate.extraOn.join('\n')} /></Field>
          </div>
          <p className="mt-3 text-xs text-slate-500">Built-in lists cover commodity, crypto and stock prices, other shopping, homework, writing, translation, advice, news, weather, sports and celebrities in English, Arabic and Hindi/Urdu (lib/ai/gate.ts).</p>
        </Card>

        <Card title="What the assistant knows">
          <Field label="AI knowledge (support hours, SLAs, refund notes, escalation rules)" hint="Shown to every assistant. Plans and prices always come from the live catalog; policies from the Terms. Do not put secrets here.">
            <textarea className="input min-h-[180px] text-[14px]" name="knowledge" defaultValue={s.knowledge} placeholder={DEFAULT_KNOWLEDGE} />
          </Field>
        </Card>

        <Card title="Token prices (USD per million tokens)">
          <div className="space-y-3">
            {models.map((m) => { const p = s.prices[m] || { in: 0, out: 0, cacheWrite: 0, cacheRead: 0 }; return (
              <div key={m} className="grid items-end gap-3 sm:grid-cols-[200px_repeat(4,1fr)]">
                <div className="pb-2.5 text-sm font-semibold text-slate-700">{m}</div>
                <Num name={`price.${m}.in`} label="Input" value={p.in} step="0.001" min={0} />
                <Num name={`price.${m}.out`} label="Output" value={p.out} step="0.001" min={0} />
                <Num name={`price.${m}.cacheWrite`} label="Cache write" value={p.cacheWrite} step="0.001" min={0} />
                <Num name={`price.${m}.cacheRead`} label="Cache read" value={p.cacheRead} step="0.001" min={0} />
              </div>
            ); })}
          </div>
          <p className="mt-3 text-xs text-slate-500">Used for the cost log and budget caps. Check them against your Anthropic Console billing; Haiku 5.5 rates are multiplied by 5 above 100K prompt tokens.</p>
        </Card>
        <div className="sticky bottom-4 flex justify-end"><button className="btn btn-primary shadow-lg">Save AI settings</button></div>
      </form>
    </>
  );
}
