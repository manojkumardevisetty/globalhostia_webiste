export const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Replace {{tokens}} in admin-authored HTML with site settings. Unknown tokens are left untouched. */
export function tokens(html: string, vars: Record<string, string>) {
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}
