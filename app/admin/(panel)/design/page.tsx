import { requireSession } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { PageHeader, Card, Field, Flash } from '@/components/ui';
import { DEFAULT_TOKENS, FONTS } from '@/lib/design';
import { saveDesign } from './actions';

export const metadata = { title: 'Design Manager' };

const LABELS: Record<string, string> = { primary: 'Primary (buttons, links, badges)', secondary: 'Secondary / success (green)', dark: 'Headings & dark text', accent: 'Accent (yellow highlights)', danger: 'Danger / hot deals (red)' };

export default async function Design({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireSession('settings');
  const sp = await searchParams;
  const s = await getSettings();
  const d = s.design || {};
  return (
    <>
      <PageHeader title="Design Manager" desc="Re-style the whole website from here — colours, fonts and corner radius are applied to every page instantly, no code needed." />
      <Flash sp={sp} />
      <form action={saveDesign} className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Brand colours">
            <div className="grid gap-4 sm:grid-cols-2">
              {Object.entries(DEFAULT_TOKENS).map(([k, def]) => (
                <Field key={k} label={LABELS[k] || k} hint={`Original: ${def}`}>
                  <div className="flex gap-2"><input type="color" name={k} defaultValue={d[k] || def} className="h-10 w-14 cursor-pointer rounded border" aria-label={k} /><input name={`${k}_hex`} placeholder={d[k] || def} className="input font-mono" aria-label={`${k} hex (optional)`} /></div>
                </Field>
              ))}
            </div>
          </Card>
          <Card title="Smooth modern polish">
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="polish" defaultChecked={d.polish !== false} className="mt-0.5" />
              <span><b>On (recommended)</b> — loader disappears fast, smoother hover/scroll animations, frosted sticky header, clearer keyboard focus and bigger mobile tap targets. Your design and colours stay the same.</span></label>
          </Card>
          <Card title="Animated background (product sections & plan pages)">
            <label className="block text-sm"><span className="mb-1.5 block text-slate-600">Very slow, soft colour glow behind your plans — pauses off-screen and for visitors who turn off motion.</span>
              <select name="ambient" defaultValue={d.ambient || 'auto'} className="input max-w-xs">
                <option value="auto">On — different colours per page (recommended)</option>
                <option value="brand">On — Brand blue everywhere</option><option value="ocean">On — Ocean</option><option value="dusk">On — Dusk</option>
                <option value="mint">On — Mint</option><option value="violet">On — Violet</option><option value="sunrise">On — Sunrise</option>
                <option value="off">Off — plain white</option>
              </select></label>
          </Card>
          <Card title="Typography & shape">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Body font"><select name="bodyFont" defaultValue={d.bodyFont || 'Inter'} className="input">{FONTS.map((f) => <option key={f}>{f}</option>)}</select></Field>
              <Field label="Heading font"><select name="headingFont" defaultValue={d.headingFont || 'Inter'} className="input">{FONTS.map((f) => <option key={f}>{f}</option>)}</select></Field>
              <Field label="Card corner radius (px)" hint="Empty = original"><input name="radius" defaultValue={d.radius || ''} className="input" inputMode="numeric" /></Field>
              <Field label="Button corner radius (px)" hint="Empty = original"><input name="buttonRadius" defaultValue={d.buttonRadius || ''} className="input" inputMode="numeric" /></Field>
            </div>
          </Card>
          <Card title="Custom CSS (advanced)">
            <textarea name="custom_css" defaultValue={s.custom_css} rows={10} spellCheck={false} className="input code" placeholder=".hero-area-coodiv { … }" />
          </Card>
          <div className="flex gap-2"><button className="btn btn-primary">Save design</button><button name="reset" value="1" className="btn btn-secondary">Reset to original design</button></div>
        </div>
        <Card title="Preview">
          <p className="mb-3 text-sm text-slate-500">Save, then check the live site:</p>
          <div className="space-y-2 text-sm"><a className="block text-brand-600" href="/" target="_blank">Homepage ↗</a><a className="block text-brand-600" href="/web-hosting" target="_blank">Web hosting ↗</a><a className="block text-brand-600" href="/dedicated-servers" target="_blank">Dedicated servers ↗</a></div>
        </Card>
      </form>
    </>
  );
}
