// Portal helpers shared by /account/reports and its print page.
import 'server-only';
import type { NextRequest } from 'next/server';
import { parseLang, parseDigits, LANG_COOKIE, DIGITS_COOKIE } from '../portal/i18n';
import { storedMonths, firstHistoryMonth } from './report-engine';
import { pickableMonths, monthOf } from './report-core';

export const localeOf = (req: NextRequest) => ({ lang: parseLang(req.cookies.get(LANG_COOKIE)?.value), digits: parseDigits(req.cookies.get(DIGITS_COOKIE)?.value) });

/** Months offered: this month so far, every emailed month, and full months since our history for this customer began. */
export async function monthsFor(clientId: number) {
  const now = Date.now();
  const [stored, first] = await Promise.all([storedMonths(clientId).catch(() => []), firstHistoryMonth(clientId).catch(() => null)]);
  const since = [first, ...stored].filter(Boolean).sort()[0] || monthOf(now);
  return { current: monthOf(now), months: [...new Set([...stored, ...pickableMonths(now, 12, since as string)])].sort().reverse() };
}
