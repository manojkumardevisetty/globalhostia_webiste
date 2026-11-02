// Visitor currency: cookie choice → country (Vercel geo header, set by middleware as x-gh-cur) → site default.
export const CUR_COOKIE = 'gh_cur';
const EU = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' ');
export const COUNTRY_CURRENCY: Record<string, string> = {
  AE: 'AED', OM: 'AED', QA: 'AED', BH: 'AED', KW: 'AED', SA: 'AED',
  IN: 'INR', GB: 'GBP', ...Object.fromEntries(EU.map((c) => [c, 'EUR'])),
};
export const CURRENCY_LABEL: Record<string, string> = { USD: 'US Dollar', AED: 'UAE Dirham', INR: 'Indian Rupee', GBP: 'British Pound', EUR: 'Euro' };
export const isCode = (v?: string | null) => !!v && /^[A-Z]{3}$/.test(v);
