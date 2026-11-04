'use server';
import { requireSession, audit, saveRevision } from '@/lib/session';
import { done, fail, str } from '@/lib/admin';
import { getSettings, setSetting } from '@/lib/settings';
import { normExperiment, validateExperiment, targetOf, EXP_ID_RE, type Experiment } from '@/lib/abtest/core';
import { normCopy } from '@/lib/abtest/apply';
import { listExperiments, saveExperiments, resetCounts, COPY_KEY } from '@/lib/abtest/store';
import { fromDubaiLocal } from '@/lib/promo';

const PATH = '/admin/experiments';
const now = () => new Date().toISOString();
async function load(id: string) {
  const list = await listExperiments();
  const e = list.find((x) => x.id === id);
  if (!e) fail(PATH, 'Experiment not found');
  return { list, e: e! };
}
const put = (list: Experiment[], e: Experiment) => list.map((x) => (x.id === e.id ? e : x));

/** Create or edit (JSON in `data`). Running experiments cannot be edited: stop them first so results stay comparable. */
export async function saveExperiment(fd: FormData) {
  const s = await requireSession('content');
  let raw: any;
  try { raw = JSON.parse(str(fd, 'data')); } catch { fail(PATH, 'Could not read the form, please try again'); }
  const isNew = !raw?.existing;
  const list = await listExperiments();
  const prev = list.find((x) => x.id === String(raw?.id || '').toLowerCase());
  const back = isNew ? `${PATH}?new=1` : `${PATH}?edit=${encodeURIComponent(String(raw?.id || ''))}`;
  if (isNew && prev) fail(back, 'An experiment with this id already exists: choose another id');
  if (!isNew && !prev) fail(PATH, 'Experiment not found');
  if (prev?.status === 'running') fail(PATH, 'Stop the experiment before editing it (changing a running test mixes two tests in one result)');
  if (!EXP_ID_RE.test(String(raw?.id || '').toLowerCase())) fail(back, 'Id: 2 to 40 lowercase letters, digits or dashes');
  const e = normExperiment({
    ...raw, startAt: fromDubaiLocal(String(raw?.startAt || '')), endAt: fromDubaiLocal(String(raw?.endAt || '')),
    status: prev?.status || 'draft', createdAt: prev?.createdAt || now(), startedAt: prev?.startedAt || '', stoppedAt: prev?.stoppedAt || '', winner: prev?.winner || '',
  });
  if (!e || !targetOf(e.target)) fail(back, 'Choose the page to test');
  const errors = validateExperiment(e!, list);
  if (errors.length) fail(back, errors.join(' · '));
  await saveExperiments(isNew ? [...list, e!] : put(list, e!));
  if (prev) await saveRevision(s, 'experiment', e!.id, prev);
  await audit(s, isNew ? 'create' : 'update', 'experiment', e!.id, { after: e });
  done(PATH, `Experiment "${e!.name}" saved as ${e!.status === 'stopped' ? 'stopped' : 'draft'}. Preview the variants, then press Start.`);
}

export async function startExperiment(fd: FormData) {
  const s = await requireSession('content');
  const { list, e } = await load(str(fd, 'id'));
  const next: Experiment = { ...e, status: 'running', startedAt: e.startedAt || now(), stoppedAt: '' };
  const errors = validateExperiment(next, list, true);
  if (errors.length) fail(PATH, `Cannot start yet: ${errors.join(' · ')}`);
  await saveExperiments(put(list, next));
  await audit(s, 'start', 'experiment', e.id, { variants: e.variants.map((v) => ({ key: v.key, weight: v.weight })) });
  done(PATH, `"${e.name}" is running. Visitors are split within about a minute; new page copies build as they are requested.`);
}

export async function stopExperiment(fd: FormData) {
  const s = await requireSession('content');
  const { list, e } = await load(str(fd, 'id'));
  await saveExperiments(put(list, { ...e, status: 'stopped', stoppedAt: now() }));
  await audit(s, 'stop', 'experiment', e.id);
  done(PATH, `"${e.name}" stopped. Everyone sees the current page again (cached copies refresh within the hour).`);
}

export async function deleteExperiment(fd: FormData) {
  const s = await requireSession('content');
  const { list, e } = await load(str(fd, 'id'));
  if (e.status === 'running') fail(PATH, 'Stop the experiment before deleting it');
  await saveExperiments(list.filter((x) => x.id !== e.id));
  await resetCounts(e.id).catch(() => {});
  await saveRevision(s, 'experiment', e.id, e);
  await audit(s, 'delete', 'experiment', e.id);
  done(PATH, `"${e.name}" deleted`);
}

export async function resetExperiment(fd: FormData) {
  const s = await requireSession('content');
  const { e } = await load(str(fd, 'id'));
  if (e.status === 'running') fail(PATH, 'Stop the experiment before clearing its results');
  await resetCounts(e.id);
  await audit(s, 'reset', 'experiment', e.id);
  done(PATH, `Results of "${e.name}" cleared`);
}

/** Write the chosen variant's texts / layout into the page (settings.page_copy) and stop the test. */
export async function promoteWinner(fd: FormData) {
  const s = await requireSession('content');
  const { list, e } = await load(str(fd, 'id'));
  const v = e.variants.find((x) => x.key === str(fd, 'variant'));
  if (!v) fail(PATH, 'Variant not found');
  const settings = await getSettings();
  const copy = normCopy(settings[COPY_KEY]);
  const before = Object.fromEntries(e.paths.map((p) => [p, { ...(copy[p] || {}) }]));
  // control wins: the page keeps what it showed during the test (nothing to write). A variant: its texts / layout on
  // every page the test ran on (only those: /shared-hosting keeps its own copy when the test ran on /web-hosting only)
  if (v !== e.variants[0]) for (const p of e.paths) copy[p] = { ...(copy[p] || {}), ...v!.set };
  await setSetting(COPY_KEY, copy);
  await saveExperiments(put(list, { ...e, status: 'stopped', stoppedAt: e.status === 'running' ? now() : e.stoppedAt || now(), winner: v!.key }));
  await saveRevision(s, 'page_copy', e.id, before);
  await audit(s, 'promote', 'experiment', e.id, { variant: v!.key, set: v!.set, paths: e.paths });
  done(PATH, v === e.variants[0]
    ? `Control kept for "${e.name}"; the test is stopped`
    : `"${v!.name}" is now the page's copy for everyone. The test is stopped; cached pages refresh within the hour.`);
}

/** Remove one promoted text (the page falls back to its built-in copy). */
export async function clearCopy(fd: FormData) {
  const s = await requireSession('content');
  const path = str(fd, 'path'), slot = str(fd, 'slot');
  const copy = normCopy((await getSettings())[COPY_KEY]);
  if (!copy[path]?.[slot]) fail(PATH, 'Nothing to remove');
  const before = { ...copy[path] };
  delete copy[path][slot];
  if (!Object.keys(copy[path]).length) delete copy[path];
  await setSetting(COPY_KEY, copy);
  await saveRevision(s, 'page_copy', path, before);
  await audit(s, 'clear', 'page_copy', `${path}:${slot}`);
  done(PATH, 'Promoted text removed; the page shows its built-in text again');
}
