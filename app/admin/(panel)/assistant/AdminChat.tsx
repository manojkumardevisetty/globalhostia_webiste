'use client';
import { useRef, useState } from 'react';

type M = { role: 'user' | 'assistant'; content: string; tools?: string[] };
const SUGGEST = ['How much did we earn this month?', 'Which renewals are due in the next 14 days?', 'List overdue invoices', 'How are support tickets looking?', 'Are all hosting servers healthy?'];

function render(t: string) {
  const esc = t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  return esc.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/^\s*[-*]\s+(.*)$/gm, '&bull; $1').replace(/\n/g, '<br>');
}

export default function AdminChat({ offline }: { offline: string | null }) {
  const [msgs, setMsgs] = useState<M[]>([]);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const scroll = () => setTimeout(() => logRef.current?.scrollTo({ top: 1e9 }), 10);

  async function ask(q: string) {
    q = q.trim();
    if (!q || busy) return;
    const hist: M[] = [...msgs, { role: 'user', content: q }];
    setMsgs([...hist, { role: 'assistant', content: '', tools: [] }]); setText(''); setBusy(true); scroll();
    const upd = (f: (m: M) => M) => setMsgs((l) => [...l.slice(0, -1), f(l[l.length - 1])]);
    try {
      const r = await fetch('/api/ai/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: hist.map(({ role, content }) => ({ role, content: content || '(no answer)' })) }) });
      if (!(r.headers.get('content-type') || '').includes('text/event-stream')) { const j = await r.json().catch(() => ({})); upd((m) => ({ ...m, content: j.message || 'Not available.' })); return; }
      const rd = r.body!.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const x = await rd.read(); if (x.done) break;
        buf += dec.decode(x.value, { stream: true }); const parts = buf.split('\n\n'); buf = parts.pop()!;
        for (const p of parts) {
          const ev = p.match(/^event: (.*)$/m)?.[1], data = p.match(/^data: (.*)$/m)?.[1]; if (!ev || !data) continue;
          const o = JSON.parse(data);
          if (ev === 'text') upd((m) => ({ ...m, content: m.content + o.t }));
          else if (ev === 'tool') upd((m) => ({ ...m, tools: [...(m.tools || []), o.name] }));
          else if (ev === 'error') upd((m) => ({ ...m, content: m.content + '\n' + o.message }));
          scroll();
        }
      }
    } catch { upd((m) => ({ ...m, content: 'Connection problem.' })); }
    finally { setBusy(false); scroll(); }
  }

  return (
    <div className="card flex h-[min(720px,calc(100vh-220px))] min-h-[460px] flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-[13px] text-amber-900" role="note">
        <span><b>Read-only.</b> The assistant reads WHMCS, hosting servers and site status. It cannot change, send or refund anything.</span>
      </div>
      <div ref={logRef} className="flex-1 space-y-4 overflow-y-auto bg-slate-50/60 p-5" role="log" aria-live="polite">
        {offline && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">{offline}</p>}
        {!msgs.length && (
          <div>
            <p className="mb-3 text-sm text-slate-500">Ask about revenue, renewals, unpaid invoices, orders, tickets or server health.</p>
            <div className="flex flex-wrap gap-2">{SUGGEST.map((s) => <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-medium text-slate-700 transition hover:border-brand-500 hover:text-brand-600">{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex'}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[14.5px] leading-relaxed ${m.role === 'user' ? 'bg-slate-900 text-white' : 'bg-white ring-1 ring-slate-200'}`}>
              {m.tools && m.tools.length > 0 && <div className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-slate-400">Looked at: {[...new Set(m.tools)].join(', ').replace(/_/g, ' ')}</div>}
              {m.content ? <div dir="auto" dangerouslySetInnerHTML={{ __html: render(m.content) }} /> : <span className="text-slate-400">Working…</span>}
            </div>
          </div>
        ))}
      </div>
      <form className="flex gap-2 border-t border-slate-100 p-3" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} className="input flex-1" placeholder="Ask about your business…" aria-label="Question" maxLength={4000} />
        <button className="btn btn-primary" disabled={busy || !text.trim()}>{busy ? 'Thinking…' : 'Ask'}</button>
      </form>
    </div>
  );
}
