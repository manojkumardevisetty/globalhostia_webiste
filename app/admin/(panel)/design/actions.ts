'use server';
import { requireSession, audit } from '@/lib/session';
import { done, str } from '@/lib/admin';
import { setSetting, getSettings } from '@/lib/settings';
import { DEFAULT_TOKENS } from '@/lib/design';

export async function saveDesign(fd: FormData) {
  const s = await requireSession('settings');
  const old = await getSettings();
  if (fd.get('reset')) {
    await setSetting('design', {});
    await audit(s, 'reset', 'design', null, { previous: old.design });
    done('/admin/design', 'Design reset to the original theme');
  }
  const design: Record<string, any> = {};
  for (const k of Object.keys(DEFAULT_TOKENS)) {
    const hex = str(fd, `${k}_hex`), pick = str(fd, k);
    const v = (/^#[0-9a-f]{6}$/i.test(hex) ? hex : pick).toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(v) && v !== DEFAULT_TOKENS[k]) design[k] = v;
  }
  for (const k of ['bodyFont', 'headingFont', 'radius', 'buttonRadius']) { const v = str(fd, k); if (v && v !== 'Inter') design[k] = v; }
  { const a = str(fd, 'ambient'); if (a && a !== 'auto') (design as any).ambient = a; }
  if (fd.get('polish') !== 'on') (design as any).polish = false;
  await setSetting('design', design);
  await setSetting('custom_css', String(fd.get('custom_css') ?? '').replace(/<\/style/gi, ''));
  await audit(s, 'update', 'design', null, design);
  done('/admin/design', 'Design saved — the website is updated');
}
