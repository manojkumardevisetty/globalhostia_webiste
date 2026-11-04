// Admin two-factor (TOTP, RFC 6238) state per admin: enrol, verify, recovery codes, per-admin requirement.
// The TOTP secret is sealed with AES-256-GCM (key: MFA_ENC_KEY, else AUTH_SECRET). Rotating that key makes stored secrets
// unreadable: then sign in with ADMIN_2FA_DISABLED=1, reset two-factor in Users & Roles, and enrol again.
import 'server-only';
import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import qrcode from 'qrcode-generator';
import { db, schema } from '../db';
import { seal, unseal } from '../hosting/crypto';
import { consumeRecovery, generateRecoveryCodes, generateSecret, hashRecovery, otpauthUri, verifyTotp } from './totp';
import { env2faDisabled, securityConfig } from './config';

type Row = typeof schema.adminMfa.$inferSelect;

const rawKey = () => {
  const raw = process.env.MFA_ENC_KEY || process.env.AUTH_SECRET || '';
  if (raw.length < 32) throw new Error('AUTH_SECRET (min 32 chars) must be set');
  return raw;
};
const encKey = () => createHash('sha256').update(`gh-mfa:v1:${rawKey()}`).digest();
const pepper = () => createHash('sha256').update(`gh-mfa-rc:v1:${rawKey()}`).digest('hex');

/** The admin's two-factor row; undefined when the table is not available (patch 040 not applied / database down). */
export async function getMfa(uid: string): Promise<Row | null | undefined> {
  try {
    const [r] = await db.select().from(schema.adminMfa).where(eq(schema.adminMfa.userId, uid)).limit(1);
    return r ?? null;
  } catch { return undefined; }
}

async function upsert(uid: string, set: Partial<typeof schema.adminMfa.$inferInsert>) {
  await db.insert(schema.adminMfa).values({ userId: uid, ...set, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.adminMfa.userId, set: { ...set, updatedAt: new Date() } });
}

/** What sign-in must do for this admin. */
export async function mfaPolicy(uid: string): Promise<{ need: 'none' | 'verify' | 'enrol'; row: Row | null | undefined; disabledByEnv: boolean }> {
  if (env2faDisabled()) return { need: 'none', row: undefined, disabledByEnv: true };
  const row = await getMfa(uid);
  if (row === undefined) return { need: 'none', row, disabledByEnv: false }; // not available: never lock anyone out
  if (row?.enabled && row.secret) return { need: 'verify', row, disabledByEnv: false };
  const cfg = await securityConfig();
  return { need: row?.required || cfg.mfa.requireAll ? 'enrol' : 'none', row, disabledByEnv: false };
}

/** New pending secret (replaces any earlier unfinished enrolment). */
export async function startEnrol(uid: string, email: string) {
  const secret = generateSecret();
  await upsert(uid, { pendingSecret: seal(secret, encKey()) });
  const uri = otpauthUri(secret, email);
  return { secret, uri, qrSvg: qrSvg(uri) };
}

/** Current pending secret (to show the same QR again after a wrong code). */
export async function pendingEnrol(uid: string, email: string) {
  const r = await getMfa(uid);
  if (!r?.pendingSecret) return null;
  try { const secret = unseal(r.pendingSecret, encKey()); const uri = otpauthUri(secret, email); return { secret, uri, qrSvg: qrSvg(uri) }; } catch { return null; }
}

/** Confirms the first code; turns two-factor on and returns the 10 recovery codes (shown once). */
export async function confirmEnrol(uid: string, code: string): Promise<string[] | null> {
  const r = await getMfa(uid);
  if (!r?.pendingSecret) return null;
  let secret: string;
  try { secret = unseal(r.pendingSecret, encKey()); } catch { return null; }
  const step = verifyTotp(secret, code);
  if (step == null) return null;
  const codes = generateRecoveryCodes(10);
  const p = pepper();
  await upsert(uid, { secret: r.pendingSecret, pendingSecret: '', enabled: true, lastStep: step, recovery: codes.map((c) => hashRecovery(c, p)), enabledAt: new Date(), epoch: (r.epoch || 0) + 1 });
  return codes;
}

/** Checks a TOTP code (replay-protected) or a one-time recovery code. */
export async function verifySecondFactor(uid: string, code: string): Promise<'totp' | 'recovery' | null> {
  const r = await getMfa(uid);
  if (!r?.enabled || !r.secret) return null;
  const c = String(code || '').trim();
  if (/^\d{3}\s?\d{3}$/.test(c)) {
    let secret: string;
    try { secret = unseal(r.secret, encKey()); } catch { return null; }
    const step = verifyTotp(secret, c, { lastStep: r.lastStep });
    if (step == null) return null;
    // conditional update: two parallel requests with the same code cannot both pass
    const ok = await db.execute(sql`update admin_mfa set last_step = ${step}, updated_at = now() where user_id = ${uid} and last_step < ${step} returning user_id`);
    return (ok as unknown as unknown[]).length ? 'totp' : null;
  }
  const hashes = Array.isArray(r.recovery) ? (r.recovery as string[]) : [];
  const left = consumeRecovery(hashes, c, pepper());
  if (!left) return null;
  const ok = await db.execute(sql`update admin_mfa set recovery = ${JSON.stringify(left)}::jsonb, updated_at = now() where user_id = ${uid} and jsonb_array_length(recovery) = ${hashes.length} returning user_id`);
  return (ok as unknown as unknown[]).length ? 'recovery' : null;
}

export async function regenerateRecovery(uid: string): Promise<string[] | null> {
  const r = await getMfa(uid);
  if (!r?.enabled) return null;
  const codes = generateRecoveryCodes(10), p = pepper();
  await upsert(uid, { recovery: codes.map((c) => hashRecovery(c, p)) });
  return codes;
}

/** Turns two-factor off for an admin (own choice, or an OWNER reset). Remembered devices stop working (epoch +1). */
export async function disableMfa(uid: string) {
  const r = await getMfa(uid);
  await upsert(uid, { secret: '', pendingSecret: '', enabled: false, recovery: [], lastStep: 0, epoch: (r?.epoch || 0) + 1, enabledAt: null });
}

export async function setMfaRequired(uid: string, required: boolean) { await upsert(uid, { required }); }

/** Forget every remembered device of this admin. */
export async function forgetDevices(uid: string) {
  const r = await getMfa(uid);
  if (r) await upsert(uid, { epoch: (r.epoch || 0) + 1 });
}

export const recoveryLeft = (r: Row | null | undefined) => (Array.isArray(r?.recovery) ? (r!.recovery as unknown[]).length : 0);

/** QR code as an inline SVG (rendered locally: the secret never leaves the server). */
export function qrSvg(text: string, scale = 5, margin = 4): string {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount(), size = (n + margin * 2) * scale;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${(x + margin) * scale} ${(y + margin) * scale}h${scale}v${scale}h-${scale}z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="QR code for your authenticator app"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#0b1020"/></svg>`;
}
