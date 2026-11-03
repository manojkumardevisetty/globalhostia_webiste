import { getSession } from '@/lib/session';
import { can } from '@/lib/auth';
import { buildSql } from '@/lib/email-brand';

export const dynamic = 'force-dynamic';

// Download of the phpMyAdmin SQL (admin only). Contains no credentials.
export async function GET() {
  const s = await getSession();
  if (!s || !can(s, 'integration')) return new Response('Forbidden', { status: 403 });
  const sql = buildSql();
  const ymd = sql.match(/generated (\d{8})/)?.[1] ?? 'today';
  return new Response(sql, {
    headers: {
      'content-type': 'application/sql; charset=utf-8',
      'content-disposition': `attachment; filename="globalhostia-whmcs-emails-${ymd}.sql"`,
      'cache-control': 'no-store',
    },
  });
}
