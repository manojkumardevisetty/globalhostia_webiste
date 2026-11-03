// Ad landing pages (/lp/<slug>, Admin → Marketing → Landing pages): form parsing + validation. Pure module.

export type LandingInput = {
  slug: string; name: string; headline: string; subheadline: string; target: string; productSlug: string;
  benefits: string[]; faq: { q: string; a: string }[]; ctaLabel: string;
  showLeadForm: boolean; showTrust: boolean; noindex: boolean; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  seoTitle: string; seoDescription: string;
};

const s = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
export const LP_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const TARGET = /^(cat:[a-z0-9-]{1,80}|p:[a-z0-9-]{1,120}|tld:\.[a-z0-9.-]{1,30})$/;

/** "Question?\nAnswer…" blocks separated by an empty line → [{q, a}] */
export function parseFaq(text: string) {
  return String(text || '').replace(/\r\n/g, '\n').split(/\n\s*\n/).map((b) => {
    const [q, ...rest] = b.trim().split('\n');
    return { q: s(q, 200), a: s(rest.join(' '), 1200) };
  }).filter((x) => x.q && x.a).slice(0, 12);
}
export const faqText = (faq: { q: string; a: string }[]) => (faq || []).map((f) => `${f.q}\n${f.a}`).join('\n\n');

export function normLanding(x: Record<string, unknown>): LandingInput {
  const benefits = (Array.isArray(x.benefits) ? x.benefits : String(x.benefits ?? '').split(/\r?\n/)).map((b) => s(b, 140)).filter(Boolean).slice(0, 8);
  const status = (x.status === 'PUBLISHED' || x.status === 'ARCHIVED' ? x.status : 'DRAFT') as LandingInput['status'];
  return {
    slug: s(x.slug, 60).toLowerCase(), name: s(x.name, 120), headline: s(x.headline, 110), subheadline: s(x.subheadline, 260),
    target: s(x.target, 160).toLowerCase(), productSlug: s(x.productSlug, 120).toLowerCase(),
    benefits, faq: Array.isArray(x.faq) ? (x.faq as any[]).map((f) => ({ q: s(f?.q, 200), a: s(f?.a, 1200) })).filter((f) => f.q && f.a) : parseFaq(String(x.faq ?? '')),
    ctaLabel: s(x.ctaLabel, 40), showLeadForm: !!x.showLeadForm, showTrust: !!x.showTrust, noindex: !!x.noindex, status,
    seoTitle: s(x.seoTitle, 70), seoDescription: s(x.seoDescription, 170),
  };
}

export function validateLanding(l: LandingInput): string[] {
  const e: string[] = [];
  if (!LP_SLUG.test(l.slug)) e.push('Address: lowercase letters, numbers and dashes only (for example forex-vps)');
  if (!l.headline) e.push('Headline is required');
  if (!TARGET.test(l.target)) e.push('Choose what the page features (a category, a plan or a domain extension)');
  if (l.productSlug && !l.target.startsWith('cat:')) e.push('A pinned plan only applies when the page features a category');
  if (!l.ctaLabel) e.push('Button label is required');
  return e;
}
