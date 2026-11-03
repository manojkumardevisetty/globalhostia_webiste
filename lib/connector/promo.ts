// Website promotion of the AI connector (settings.ai_promo, edited in Admin → AI connectors → Website promotion):
// the "AI connectors" nav link and menu item, the footer link, the homepage section, the "New" pill (the account
// dashboard card is always on: lib/portal/views/dashboard.ts). Pure (defaults + normalisation, tested); a missing setting means everything is on with this copy.
// Unlike settings.connector (private), this key is public, so it is read from the cached site settings (tag `site`).

import type { ThemeMenu, MenuItem } from '../theme/menu';

export const AI_PROMO_KEY = 'ai_promo';
export type PromoItem = MenuItem & { badge?: string };
export const HOME_POSITIONS = ['after-plans', 'after-infra', 'after-features', 'before-blog', 'off'] as const;
export type HomePosition = (typeof HOME_POSITIONS)[number];
export const HOME_POSITION_LABEL: Record<HomePosition, string> = {
  'after-plans': 'After the hosting plans (recommended)', 'after-infra': 'After "Infrastructure you can measure"',
  'after-features': 'After "Everything a hosting plan should include"', 'before-blog': 'Before the blog strip', off: 'Hidden',
};

export interface AiPromo {
  /** Main navigation: a top-level link on desktop, a highlighted row in the phone menu, and an item in one mega menu. */
  nav: { enabled: boolean; label: string; badge: string; menu: string };
  /** Link in the footer column of that menu. */
  footer: boolean;
  /** Homepage section. */
  home: { position: HomePosition; eyebrow: string; title: string; lead: string; prompts: string[]; trust: string[] };
  /** Slim "New" pill: top bar on desktop and tablet, under the domain search on phones (homepage). */
  pill: { enabled: boolean; text: string };
}

export const CONNECTORS_PATH = '/connectors';
export const DOCS_PATH = '/docs/mcp';
export const APPS_PATH = '/account/apps';

export const DEFAULT_AI_PROMO: AiPromo = {
  nav: { enabled: true, label: 'AI connectors', badge: 'New', menu: 'support' },
  footer: true,
  home: {
    position: 'after-plans',
    eyebrow: 'Works with Claude and ChatGPT',
    title: 'Manage your hosting from Claude and ChatGPT',
    lead: 'Connect your GlobalHostia account once, then ask in plain language: DNS, email, SSL, domains, invoices and support tickets, without opening a control panel.',
    prompts: [
      'Add an MX record for mybrand.com',
      'Which domains expire this month?',
      'Why is my email going to spam?',
      'Show my unpaid invoices',
    ],
    trust: [
      'You approve every permission',
      'Disconnect at any time',
      'Deletions and overwrites ask first',
      'No payments in chat',
    ],
  },
  pill: { enabled: true, text: 'New: manage your hosting from Claude & ChatGPT' },
};

const s = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const list = (v: unknown, max: number, n: number, d: string[]) => {
  const a = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\r?\n/) : null;
  if (!a) return d;
  const out = a.map((x) => s(x, max)).filter(Boolean).slice(0, n);
  return out.length ? out : d;
};

export function normalizeAiPromo(raw: unknown): AiPromo {
  let r: any = raw;
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch { r = null; } }
  r = r && typeof r === 'object' ? r : {};
  const d = DEFAULT_AI_PROMO;
  const nav = r.nav && typeof r.nav === 'object' ? r.nav : {};
  const home = r.home && typeof r.home === 'object' ? r.home : {};
  const pill = r.pill && typeof r.pill === 'object' ? r.pill : {};
  const menu = typeof nav.menu === 'string' ? nav.menu.replace(/[^a-z0-9-]/gi, '').slice(0, 40) : d.nav.menu;
  return {
    nav: {
      enabled: nav.enabled !== false, label: s(nav.label, 28) || d.nav.label,
      // an empty badge is allowed (no badge); only a missing one falls back to "New"
      badge: typeof nav.badge === 'string' ? s(nav.badge, 12) : d.nav.badge,
      menu,
    },
    footer: r.footer !== false,
    home: {
      position: (HOME_POSITIONS as readonly string[]).includes(home.position) ? home.position : d.home.position,
      eyebrow: s(home.eyebrow, 60) || d.home.eyebrow, title: s(home.title, 90) || d.home.title, lead: s(home.lead, 320) || d.home.lead,
      prompts: list(home.prompts, 90, 4, d.home.prompts), trust: list(home.trust, 60, 4, d.home.trust),
    },
    pill: { enabled: pill.enabled !== false, text: s(pill.text, 70) || d.pill.text },
  };
}

const linksConnectors = (m: ThemeMenu) => m.groups.some((g) => g.items.some((i) => String(i.href).split('#')[0] === CONNECTORS_PATH));

/** Menus with the connector item added to the chosen menu (first group), unless a menu already links /connectors. */
export function withAiMenu(menus: ThemeMenu[], p: AiPromo): ThemeMenu[] {
  if (!p.nav.enabled || menus.some(linksConnectors)) return menus;
  const target = menus.find((m) => m.id === p.nav.menu) || menus.find((m) => /support/i.test(m.id)) || menus[menus.length - 1];
  if (!target?.groups.length) return menus;
  const item: PromoItem = { label: p.nav.label, href: CONNECTORS_PATH, icon: 'spark', desc: 'Manage hosting, DNS and email from Claude or ChatGPT.', badge: p.nav.badge };
  return menus.map((m) => (m !== target ? m : { ...m, groups: m.groups.map((g, i) => (i === 0 ? { ...g, items: [...g.items, item] } : g)) }));
}
