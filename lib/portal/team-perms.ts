// Team access (/account/team): WHMCS 8 user permissions on a client account, and the presets the portal offers.
// Permission names are the ones GetPermissionsList returns (WHMCS 8): profile, contacts, products, manageproducts,
// productsso, domains, managedomains, invoices, quotes, tickets, affiliates, emails, orders.
// Pure (no imports), so tests/team.test.mts loads it directly.

export const PERMISSIONS = [
  'profile', 'contacts', 'products', 'manageproducts', 'productsso', 'domains', 'managedomains',
  'invoices', 'quotes', 'tickets', 'affiliates', 'emails', 'orders',
] as const;
export type Perm = (typeof PERMISSIONS)[number];

export const PRESET_KEYS = ['developer', 'billing', 'full'] as const;
export type Preset = (typeof PRESET_KEYS)[number] | 'custom';

/** Developer: services and domains (view + manage, control-panel sign-in, tickets), no billing. Billing: invoices, quotes, email history. */
export const PRESETS: Record<(typeof PRESET_KEYS)[number], Perm[]> = {
  developer: ['products', 'manageproducts', 'productsso', 'domains', 'managedomains', 'tickets'],
  billing: ['invoices', 'quotes', 'emails'],
  full: [...PERMISSIONS],
};

/** Grouping for the permission chips and the custom checkboxes. */
export const PERM_GROUPS: { key: string; perms: Perm[] }[] = [
  { key: 'Services', perms: ['products', 'manageproducts', 'productsso'] },
  { key: 'Domains', perms: ['domains', 'managedomains'] },
  { key: 'Billing', perms: ['invoices', 'quotes', 'orders'] },
  { key: 'Support', perms: ['tickets', 'emails'] },
  { key: 'Account', perms: ['profile', 'contacts', 'affiliates'] },
];

const ORDER = new Map(PERMISSIONS.map((p, i) => [p, i]));
const isPerm = (s: string): s is Perm => ORDER.has(s as Perm);

/** Accepts "a,b,c", an array, or WHMCS's response shapes; keeps known names only, de-duplicated, canonical order. */
export function parsePerms(input: unknown): Perm[] {
  let list: string[] = [];
  if (Array.isArray(input)) list = input.map(String);
  else if (typeof input === 'string') list = input.split(/[\s,]+/);
  else if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>;
    if (Array.isArray(o.permission)) list = (o.permission as unknown[]).map(String);
    else if (typeof o.permission === 'string') list = String(o.permission).split(/[\s,]+/);
    else list = Object.entries(o).filter(([, v]) => v === true || v === 1 || v === '1').map(([k]) => k);
  }
  const out = [...new Set(list.map((s) => s.trim().toLowerCase()).filter(isPerm))];
  return out.sort((a, b) => ORDER.get(a)! - ORDER.get(b)!);
}

/** The preset whose permission set equals `perms` exactly, else 'custom'. */
export function presetFor(perms: readonly string[]): Preset {
  const p = parsePerms([...perms]);
  for (const k of PRESET_KEYS) {
    const want = PRESETS[k];
    if (want.length === p.length && want.every((x) => p.includes(x))) return k;
  }
  return 'custom';
}

/** Permissions from the invite / edit form: a preset, or the custom checkboxes. Empty selection is invalid. */
export function permsFromForm(preset: unknown, custom: unknown[]): { ok: true; perms: Perm[]; preset: Preset } | { ok: false; error: 'preset' | 'empty' } {
  const k = String(preset || '');
  if ((PRESET_KEYS as readonly string[]).includes(k)) return { ok: true, perms: [...PRESETS[k as (typeof PRESET_KEYS)[number]]], preset: k as Preset };
  if (k !== 'custom') return { ok: false, error: 'preset' };
  const perms = parsePerms(custom.map(String));
  return perms.length ? { ok: true, perms, preset: presetFor(perms) } : { ok: false, error: 'empty' };
}

export const EMAIL_RE = /^[^\s@<>"(),;:]{1,64}@[^\s@<>"(),;:]{1,253}\.[a-z]{2,63}$/i;
export const normalizeEmail = (s: unknown) => String(s ?? '').trim().toLowerCase().slice(0, 254);

/** The member list WHMCS returns (GetClientsDetails → client.users.user: id, name, email, is_owner), normalised. */
export interface Member { id: number; name: string; email: string; owner: boolean; perms: Perm[] | null }
export function membersFrom(details: any): Member[] {
  const raw = details?.users?.user ?? details?.client?.users?.user ?? details?.users ?? [];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.map((u: any) => ({
    id: Number(u.id), name: String(u.name || `${u.firstname || ''} ${u.lastname || ''}`).trim(), email: String(u.email || '').toLowerCase(),
    owner: u.is_owner === true || u.is_owner === 1 || u.is_owner === '1' || u.isOwner === true || u.owner === true, perms: null,
  })).filter((m: Member) => Number.isInteger(m.id) && m.id > 0);
}

/** Who may manage team access: the account owner only (matched by user id from sign-in, else by email). */
export function viewerIsOwner(members: Member[], viewer: { userId?: number; email: string }, clientEmail?: string) {
  const owner = members.find((m) => m.owner);
  if (owner) return viewer.userId ? owner.id === viewer.userId : owner.email === normalizeEmail(viewer.email);
  // no users list (older WHMCS): the client's own login email is the owner
  return !!clientEmail && normalizeEmail(clientEmail) === normalizeEmail(viewer.email);
}
