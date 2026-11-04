import { PageHeader, Flash, Card, Field, Badge, Stat } from '@/components/ui';
import { getSettings } from '@/lib/settings';
import { HELP_GROUPS, helpPath, helpMedia } from '@/lib/help/topics';
import { helpTopics, readHelpOverrides, clock } from '@/lib/help/view';
import { saveHelpTopic, setHelpHidden, resetHelpTopic } from './actions';

export const metadata = { title: 'Help videos' };
export const dynamic = 'force-dynamic';

const A = ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href} target="_blank" rel="noopener" className="text-brand-600 hover:underline">{children}</a>;
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

export default async function HelpVideos({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  const list = helpTopics(settings, { includeHidden: true });
  const ov = readHelpOverrides(settings);
  const videos = list.filter((t) => t.kind === 'video');
  const total = videos.reduce((a, t) => a + t.media.bytes, 0);

  return (
    <>
      <PageHeader title="Help videos" desc={<>The &ldquo;Watch how&rdquo; topics on the <A href="/help-center#watch-how">Help Center</A>: short captioned videos recorded from the account portal and Manage hosting panel with fictional demo data, and illustrated walkthroughs for checkout and AI connectors. Edit the texts and steps, or swap a video by pointing to a new file. Changes go live straight away.</>} />
      <Flash sp={sp} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Live topics" value={list.filter((t) => !t.hidden).length} sub={`${list.filter((t) => t.hidden).length} hidden`} icon="file" />
        <Stat label="Videos" value={videos.length} sub={`${list.length - videos.length} walkthroughs`} icon="activity" />
        <Stat label="Edited in admin" value={Object.keys(ov).length} sub="on top of the defaults" icon="pen" />
        <Stat label="Video files" value={total ? kb(total) : '—'} sub="MP4 in /public/help/videos" icon="box" />
      </div>

      <Card title="Topics" className="mb-6">
        <div className="overflow-x-auto"><table className="table text-sm"><thead><tr><th>Topic</th><th>Group</th><th>Type</th><th>Length</th><th>Status</th><th></th></tr></thead><tbody>{list.map((t) => (
          <tr key={t.slug}><td><b>{t.title}</b><div className="text-xs text-slate-400">{t.hidden ? helpPath(t.slug) : <A href={helpPath(t.slug)}>{helpPath(t.slug)}</A>}</div></td>
            <td className="text-xs">{HELP_GROUPS[t.group].en}</td>
            <td className="text-xs">{t.kind === 'video' ? 'Video' : 'Walkthrough'}</td>
            <td className="text-xs">{t.kind === 'video' ? `${t.media.duration ? clock(t.media.duration) : '—'}${t.media.bytes ? ` · ${kb(t.media.bytes)}` : ''}` : `${t.frames?.length || 0} frames`}</td>
            <td className="space-x-1">{t.hidden ? <Badge>Hidden</Badge> : <Badge tone="green">Live</Badge>}{t.edited ? <Badge tone="yellow">Edited</Badge> : null}{ov[t.slug]?.mp4 ? <Badge tone="blue">Custom video</Badge> : null}</td>
            <td className="whitespace-nowrap text-right">
              <form action={setHelpHidden} className="inline"><input type="hidden" name="slug" value={t.slug} /><input type="hidden" name="hide" value={t.hidden ? '0' : '1'} /><button className="btn btn-secondary">{t.hidden ? 'Show' : 'Hide'}</button></form>{' '}
              <a href={`#edit-${t.slug}`} className="btn btn-secondary">Edit</a></td></tr>))}</tbody></table></div>
        <p className="mt-2 text-xs text-slate-400">Hidden topics answer 404 and leave the sitemaps, the Help Center grid and the site search. The recorder that re-makes the videos is in scripts/help-videos/.</p>
      </Card>

      <div className="space-y-6">{list.map((t) => {
        const o = ov[t.slug] || {};
        const def = helpMedia(t.slug);
        return (
          <Card key={t.slug} title={<span id={`edit-${t.slug}`}>{t.title}</span>} actions={<span className="flex gap-3"><A href={helpPath(t.slug)}>View page</A>{t.edited ? <form action={resetHelpTopic}><input type="hidden" name="slug" value={t.slug} /><button className="text-xs text-red-600 hover:underline">Reset to default</button></form> : null}</span>}>
            <form action={saveHelpTopic} className="space-y-4">
              <input type="hidden" name="slug" value={t.slug} />
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Title (English)"><input name="title" defaultValue={t.title} maxLength={90} required className="input" /></Field>
                <Field label="Title (Arabic)"><input name="titleAr" defaultValue={t.titleAr} maxLength={90} dir="rtl" lang="ar" className="input" /></Field>
                <Field label="Summary (English)"><textarea name="summary" defaultValue={t.summary} rows={2} maxLength={220} required className="input text-sm" /></Field>
                <Field label="Summary (Arabic)"><textarea name="summaryAr" defaultValue={t.summaryAr} rows={2} maxLength={220} dir="rtl" lang="ar" className="input text-sm" /></Field>
              </div>
              <Field label="Steps" hint={<>One step per line: <code>English | Arabic</code>. They show under the video, in the HowTo search data and the site search. The captions inside a recorded video do not change; swap the video for that.</>}>
                <textarea name="steps" defaultValue={t.steps.map((x) => `${x.en} | ${x.ar}`).join('\n')} rows={Math.max(4, t.steps.length + 1)} className="input font-mono text-xs" />
              </Field>
              {t.kind === 'video' ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Video file (MP4)" hint={<>Default <code>{def.mp4}</code></>}><input name="mp4" defaultValue={o.mp4 || ''} placeholder={def.mp4} className="input text-xs" /></Field>
                  <Field label="WebM fallback (optional)"><input name="webm" defaultValue={o.webm || ''} placeholder={def.webm} className="input text-xs" /></Field>
                  <Field label="Poster image"><input name="poster" defaultValue={o.poster || ''} placeholder={def.poster} className="input text-xs" /></Field>
                  <Field label="Captions, English (.vtt)"><input name="vttEn" defaultValue={o.vttEn || ''} placeholder={def.vttEn} className="input text-xs" /></Field>
                  <Field label="Captions, Arabic (.vtt)"><input name="vttAr" defaultValue={o.vttAr || ''} placeholder={def.vttAr} className="input text-xs" /></Field>
                  <Field label="Length in seconds" hint="Only needed with a new video file."><input name="duration" type="number" min={1} max={600} defaultValue={o.duration || ''} placeholder={String(t.media.duration || '')} className="input text-xs" /></Field>
                </div>
              ) : <p className="text-xs text-slate-500">Walkthrough frames are screenshots of our own pages in /public/help/frames.</p>}
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="hidden" defaultChecked={t.hidden} /> Hide this topic</label>
                <button className="btn btn-primary">Save {t.title}</button>
              </div>
            </form>
          </Card>);
      })}</div>
    </>
  );
}
