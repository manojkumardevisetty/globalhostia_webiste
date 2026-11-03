'use server';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str, bool, lines } from '@/lib/admin';
import { getSettings, setSetting } from '@/lib/settings';
import { siteLinks, FAMILY_IDS, type SiteLinksConfig, type FooterColumn } from '@/lib/theme/sitelinks';
import { USE_CASES } from '@/lib/theme/pseo';
import { validMenu } from '@/lib/theme/menu';

const BACK = '/admin/links';
const cut = (s: string, n: number) => s.trim().slice(0, n);
const splitList = (s: string) => s.split(/[;,]/).map((x) => x.trim()).filter(Boolean);
const tldOf = (s: string) => '.' + s.trim().toLowerCase().replace(/^\.+/, '');

/** "## Title" starts a column; "Label | /href" adds a link. */
function parseFooter(text: string): FooterColumn[] {
  const cols: FooterColumn[] = [];
  for (const l of lines(text)) {
    if (l.startsWith('#')) { cols.push({ title: cut(l.replace(/^#+\s*/, ''), 60), links: [] }); continue; }
    const [label, href] = l.split('|').map((x) => x.trim());
    if (!cols.length) fail(BACK, 'Footer links: start each column with a "## Column title" line');
    if (!label || !href || !/^(\/\S*|https?:\/\/\S+)$/.test(href)) fail(BACK, `Footer link "${l.slice(0, 60)}" must look like "Label | /path"`);
    cols[cols.length - 1].links.push({ label: cut(label, 80), href });
  }
  return cols.filter((c) => c.title && c.links.length);
}

/** Saves settings.site_links (and the optional theme_menu override). Every save clears the site cache (done → bust). */
export async function saveSiteLinks(fd: FormData) {
  const s = await requireSession('content');
  const cur = siteLinks(await getSettings());
  const next: SiteLinksConfig = { ...cur };

  // category families
  const types: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith('type_')) continue;
    const val = String(v);
    if (val && (FAMILY_IDS as readonly string[]).includes(val)) types[k.slice(5)] = val;
  }
  next.categoryTypes = types;
  next.autoMenu = bool(fd, 'autoMenu');
  next.offers = { ssl: str(fd, 'offer_ssl'), hosting: str(fd, 'offer_hosting') };

  // footer extra columns: empty = built-in defaults
  const foot = String(fd.get('footerExtra') ?? '').trim();
  next.footerExtra = foot ? parseFooter(foot) : null;

  // TLD blurbs: ".com | who it suits | fact; fact | .net, .org"
  const tb: SiteLinksConfig['tldBlurbs'] = {};
  for (const l of lines(String(fd.get('tldBlurbs') ?? ''))) {
    const [t, forWho = '', facts = '', related = ''] = l.split('|').map((x) => x.trim());
    if (!/^\.?[a-z0-9-]+(\.[a-z0-9-]+)*$/i.test(t || '')) fail(BACK, `TLD blurb "${l.slice(0, 60)}" must start with the extension, e.g. ".com | …"`);
    tb[tldOf(t)] = { ...(forWho && { forWho: cut(forWho, 300) }), ...(facts && { facts: facts.split(';').map((x) => cut(x, 300)).filter(Boolean).slice(0, 4) }), ...(related && { related: splitList(related).map(tldOf).slice(0, 6) }) };
  }
  next.tldBlurbs = tb;

  // use cases
  const uc: SiteLinksConfig['useCases'] = {};
  for (const u of USE_CASES) {
    const e = { hidden: bool(fd, `uc_hidden_${u.slug}`) || undefined, name: str(fd, `uc_name_${u.slug}`), h1: str(fd, `uc_h1_${u.slug}`), lead: str(fd, `uc_lead_${u.slug}`), meta: str(fd, `uc_meta_${u.slug}`) };
    const clean = Object.fromEntries(Object.entries(e).filter(([k, v]) => v && v !== (u as any)[k]));
    if (Object.keys(clean).length) uc[u.slug] = clean;
  }
  next.useCases = uc;

  // locations: "slug | note | audience, audience"
  const loc: SiteLinksConfig['locations'] = {};
  for (const l of lines(String(fd.get('locations') ?? ''))) {
    const [slug, note = '', near = '', name = ''] = l.split('|').map((x) => x.trim());
    if (!/^[a-z0-9-]+$/.test(slug || '')) fail(BACK, `Location line "${l.slice(0, 60)}" must start with the location slug, e.g. "germany | …"`);
    loc[slug] = { ...(note && { note: cut(note, 600) }), ...(near && { near: splitList(near).slice(0, 6) }), ...(name && { name: cut(name, 60) }) };
  }
  next.locations = loc;

  // optional full menu override (advanced)
  const menuRaw = String(fd.get('theme_menu') ?? '').trim();
  if (menuRaw) {
    let m: unknown; try { m = JSON.parse(menuRaw); } catch { fail(BACK, 'Menu override is not valid JSON'); }
    if (!validMenu(m)) fail(BACK, 'Menu override must be a list of menus: [{ "id", "label", "groups": [{ "title", "items": [{ "label", "href", "icon" }] }] }]');
    await setSetting('theme_menu', m);
  } else await setSetting('theme_menu', '');

  await setSetting('site_links', siteLinks({ site_links: next }));
  await audit(s, 'update', 'settings', 'site_links');
  done(BACK, 'Site links saved. Menus, footer and generated pages are updated.');
}
