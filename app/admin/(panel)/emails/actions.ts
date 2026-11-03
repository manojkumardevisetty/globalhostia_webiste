'use server';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession, audit } from '@/lib/session';
import { done, fail, bool } from '@/lib/admin';
import { whmcs, whmcsConfigured } from '@/lib/whmcs';
import { designValues, DESIGN_KEYS, BRAND_SETTINGS, needsBrandFix, EMAIL_DESIGN_VERSION } from '@/lib/email-brand';
import { explainWhmcsError } from './whmcs-errors';

const PATH = '/admin/emails';

async function readSettings(keys: readonly string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const r = await whmcs<{ value?: string }>('GetConfigurationValue', { setting: k });
    out[k] = r.value ?? '';
  }
  return out;
}

/** Sets each value in order; `written` records progress so a caller can roll back after a partial failure. */
async function writeSettings(values: Record<string, string>, written: string[] = []): Promise<string[]> {
  for (const [setting, value] of Object.entries(values)) {
    await whmcs('SetConfigurationValue', { setting, value });
    written.push(setting);
  }
  return written;
}

/** Back up the current values, then set the branded design (and optional brand-name fixes). */
export async function applyDesign(fd: FormData) {
  const s = await requireSession('integration');
  if (!whmcsConfigured()) fail(PATH, 'WHMCS API is not configured on this deployment.');
  const fixBrand = bool(fd, 'fix_brand');
  const next: Record<string, string> = { ...designValues() };
  const keys = [...DESIGN_KEYS, ...(fixBrand ? BRAND_SETTINGS.map((b) => b.key) : [])];

  let current: Record<string, string>;
  try { current = await readSettings(keys); } catch (e: any) { fail(PATH, `Nothing changed. Could not read the current settings: ${explainWhmcsError(e)}`); }
  if (fixBrand) for (const b of BRAND_SETTINGS) if (needsBrandFix(b.key, current[b.key] ?? '')) next[b.key] = b.fix;

  const changes = Object.fromEntries(Object.entries(next).filter(([k, v]) => current[k] !== v));
  if (!Object.keys(changes).length) done(PATH, 'The branded design is already active in WHMCS. Nothing to change.');

  // Back up only what we are about to change.
  const backup = Object.fromEntries(Object.keys(changes).map((k) => [k, current[k] ?? '']));
  const [row] = await db.insert(schema.emailDesignBackups).values({ values: backup, note: `before ${EMAIL_DESIGN_VERSION}`, userEmail: s.email }).returning({ id: schema.emailDesignBackups.id });
  await audit(s, 'email_design_backup', 'whmcs_email', row.id, { keys: Object.keys(backup) });

  const written: string[] = [];
  try {
    await writeSettings(changes, written);
  } catch (e: any) {
    // Partial write: put back whatever we already changed.
    const done_ = [...written];
    let rolledBack = 'nothing had been changed yet';
    if (done_.length) {
      try { await writeSettings(Object.fromEntries(done_.map((k) => [k, backup[k]]))); rolledBack = `rolled back ${done_.join(', ')}`; }
      catch { rolledBack = `could NOT roll back ${done_.join(', ')} - use "Restore previous"`; }
    }
    await audit(s, 'email_design_apply_failed', 'whmcs_email', row.id, { error: e?.message, written: done_ });
    fail(PATH, `Apply failed (${rolledBack}). ${explainWhmcsError(e)}`);
  }

  // Verify the design keys really changed (some WHMCS builds accept the call but ignore it remotely).
  let verified = true;
  try { const after = await readSettings(DESIGN_KEYS); verified = DESIGN_KEYS.every((k) => after[k] === next[k]); } catch { verified = false; }
  await audit(s, 'email_design_apply', 'whmcs_email', row.id, { keys: written, verified, version: EMAIL_DESIGN_VERSION });
  if (!verified) fail(PATH, 'WHMCS accepted the update but reading it back shows the old design. Your WHMCS limits SetConfigurationValue to its local API - use the SQL below (step 2 sets the same values).');
  done(PATH, `Branded email design applied to WHMCS (${written.join(', ')}). Previous values backed up.`);
}

/** Restore a backup (latest by default). The values being replaced are backed up first, so this is reversible too. */
export async function restoreDesign(fd: FormData) {
  const s = await requireSession('integration');
  if (!whmcsConfigured()) fail(PATH, 'WHMCS API is not configured on this deployment.');
  const id = String(fd.get('id') || '');
  const [b] = id
    ? await db.select().from(schema.emailDesignBackups).where(eq(schema.emailDesignBackups.id, id)).limit(1)
    : await db.select().from(schema.emailDesignBackups).orderBy(desc(schema.emailDesignBackups.createdAt)).limit(1);
  if (!b) fail(PATH, 'No backup found to restore.');
  const values = b.values as Record<string, string>;

  let current: Record<string, string>;
  try { current = await readSettings(Object.keys(values)); } catch (e: any) { fail(PATH, `Nothing changed. Could not read the current settings: ${explainWhmcsError(e)}`); }
  const [pre] = await db.insert(schema.emailDesignBackups).values({ values: current, note: `before restore of ${b.id}`, userEmail: s.email }).returning({ id: schema.emailDesignBackups.id });

  try { await writeSettings(values); } catch (e: any) {
    await audit(s, 'email_design_restore_failed', 'whmcs_email', b.id, { error: e?.message });
    fail(PATH, `Restore failed. ${explainWhmcsError(e)}`);
  }
  await db.update(schema.emailDesignBackups).set({ restoredAt: new Date() }).where(eq(schema.emailDesignBackups.id, b.id));
  await audit(s, 'email_design_restore', 'whmcs_email', b.id, { keys: Object.keys(values), safety_backup: pre.id });
  done(PATH, `Restored ${Object.keys(values).join(', ')} from the backup of ${b.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC.`);
}
