// Writes docs/whmcs/email-branding.sql from lib/email-brand.ts (same SQL as /admin/emails).
// Run: node --experimental-strip-types scripts/gen-email-sql.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildSql, emailCss } from '../lib/email-brand.ts';

mkdirSync(new URL('../docs/whmcs/', import.meta.url), { recursive: true });
const sql = buildSql();
writeFileSync(new URL('../docs/whmcs/email-branding.sql', import.meta.url), sql);
// Sanity checks: ASCII only (older WHMCS DBs are utf8, not utf8mb4) and Smarty-safe CSS braces.
const nonAscii = [...sql].filter((c) => c.charCodeAt(0) > 127);
if (nonAscii.length) throw new Error(`SQL contains non-ASCII characters: ${[...new Set(nonAscii)].join(' ')}`);
if (/\{(?=\S)/.test(emailCss())) throw new Error('Email CSS has a "{" not followed by whitespace (Smarty would parse it)');
console.log(`wrote docs/whmcs/email-branding.sql (${(sql.length / 1024).toFixed(1)} KB)`);
