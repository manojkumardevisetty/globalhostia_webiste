// Admin-only CSV export of broker requests (?status= optional). Formula-injection safe.
import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { COOKIE, can } from '@/lib/auth';
import { liveSession } from '@/lib/security/sessions';
import { db, schema } from '@/lib/db';
import { isBrokerStatus } from '@/lib/broker';

export const dynamic = 'force-dynamic';

const cell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: NextRequest) {
  const s = await liveSession(req.cookies.get(COOKIE)?.value);
  if (!s || !can(s, 'commerce')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const st = req.nextUrl.searchParams.get('status');
  const rows = await db.select().from(schema.brokerRequests).where(isBrokerStatus(st) ? eq(schema.brokerRequests.status, st) : undefined).orderBy(desc(schema.brokerRequests.createdAt));
  const cols: [string, keyof (typeof rows)[number]][] = [
    ['ref', 'ref'], ['domain', 'domain'], ['status', 'status'], ['budget_min', 'budgetMin'], ['budget_max', 'budgetMax'], ['currency', 'currency'],
    ['name', 'name'], ['email', 'email'], ['phone', 'phone'], ['use', 'use'], ['notes', 'notes'], ['assigned', 'assigned'],
    ['owner_contacted_at', 'ownerContactedAt'], ['agreed_price', 'agreedPrice'], ['commission', 'commission'], ['outcome_notes', 'outcomeNotes'],
    ['ticket', 'ticketNum'], ['utm_source', 'utmSource'], ['utm_medium', 'utmMedium'], ['utm_campaign', 'utmCampaign'], ['referrer', 'referrer'],
    ['created_at', 'createdAt'], ['updated_at', 'updatedAt'],
  ];
  const csv = [cols.map(([h]) => h).join(','), ...rows.map((r) => cols.map(([, k]) => cell(r[k])).join(','))].join('\r\n');
  await db.insert(schema.auditLogs).values({ userEmail: s.email, action: 'export', entity: 'broker_requests', entityId: null, detail: { count: rows.length, status: st || 'all' } as any }).catch(() => {});
  return new NextResponse('﻿' + csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="broker-requests-${new Date().toISOString().slice(0, 10)}.csv"`, 'cache-control': 'no-store' } });
}
