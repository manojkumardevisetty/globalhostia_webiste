// Builds legacy/theme-rules.json: every CSS rule of the original theme that uses one of the
// brand colours, so the Design Manager can re-colour the whole site without editing CSS files.
import postcss from 'postcss';
import fs from 'node:fs';

export const TOKENS = { primary: '#473bf0', secondary: '#68d585', dark: '#161c2d', accent: '#f7e36d', danger: '#f64b4b' };
const files = ['public/css/bootstrap.css', 'public/css/main.css', 'public/css/custom.css'];
const out = [];
for (const f of files) {
  const root = postcss.parse(fs.readFileSync(f, 'utf8'));
  root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes/i.test(rule.parent.name)) return;
    const decls = [];
    rule.walkDecls((d) => { const v = d.value.toLowerCase(); if (Object.values(TOKENS).some((h) => v.includes(h))) decls.push(`${d.prop}:${d.value}${d.important ? '!important' : ''}`); });
    if (!decls.length) return;
    const media = rule.parent?.type === 'atrule' && rule.parent.name === 'media' ? rule.parent.params : '';
    out.push({ s: rule.selector, d: decls.join(';'), m: media });
  });
}
fs.writeFileSync('legacy/theme-rules.json', JSON.stringify({ tokens: TOKENS, rules: out }));
console.log('theme rules:', out.length);
