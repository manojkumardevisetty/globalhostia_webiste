// Admin → Leads → Export CSV (same filters as the list). Requires the "commerce" permission; every export is audited.
import { NextRequest, NextResponse } from 'next/server';
import { getSession, audit } from '@/lib/session';
import { can } from '@/lib/auth';
import { csvCell } from '@/lib/leads';
import { readFilter, listLeads } from '../query';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.redirect(new URL('/admin/login', req.url));
  if (!can(s, 'commerce')) return new NextResponse('Forbidden', { status: 403 });
  const f = readFilter(Object.fromEntries(req.nextUrl.searchParams));
  const rows = await listLeads(f, 50_000);
  const head = ['created_at', 'email', 'name', 'phone', 'status', 'source', 'page', 'interest', 'country', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'consent', 'notes', 'id'];
  const lines = rows.map((l) => [l.createdAt, l.email, l.name, l.phone, l.status, l.source, l.page, l.interest, l.country, l.utmSource, l.utmMedium, l.utmCampaign, l.utmTerm, l.utmContent, l.consent ? 'yes' : 'no', l.notes, l.id].map(csvCell).join(','));
  await audit(s, 'export', 'lead', null, { rows: rows.length, filter: f });
  const body = '﻿' + [head.join(','), ...lines].join('\r\n') + '\r\n';
  return new NextResponse(body, { headers: {
    'content-type': 'text/csv; charset=utf-8', 'cache-control': 'private, no-store',
    'content-disposition': `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
  } });
}
