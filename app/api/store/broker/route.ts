// Public broker fee for the client-area "Domain taken" card (whmcs.js). ?currency=AED → fee in that currency via our catalog ratio.
import { NextRequest, NextResponse } from 'next/server';
import { getCatalog } from '@/lib/theme/data';
import { brokerConfig, catalogRate } from '@/lib/broker';

export const revalidate = 3600;

export async function GET(req: NextRequest) {
  const cur = (req.nextUrl.searchParams.get('currency') || 'USD').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'USD';
  const cat = await getCatalog();
  const cfg = brokerConfig(cat.settings);
  const rate = cur === 'USD' ? 1 : catalogRate(cat.products, cur);
  const conv = (n: number) => (rate === null ? null : Math.round(n * rate));
  return NextResponse.json(
    { team: (String(cat.settings.broker_team || '').trim() ? null : Array.from({ length: 10 }, (_, i) => ({ name: 'GlobalHostia broker desk', title: null, photo: `https://globalhostia.com/hp/img/brokers/b${i + 1}.jpg` }))) || String(cat.settings.broker_team || '').split(/\r?\n/).map((l) => l.split('|').map((x) => x.trim())).filter((x) => x[0]).map(([name, title, photo]) => ({ name, title: title || null, photo: photo ? (photo.startsWith('/') ? 'https://globalhostia.com' + photo : photo) : null })).slice(0, 20), name: String(cat.settings.broker_name || '').trim() || null, title: String(cat.settings.broker_title || '').trim() || null, photo: (() => { const u = String(cat.settings.broker_photo || '').trim(); return u ? (u.startsWith('/') ? 'https://globalhostia.com' + u : u) : null; })(), currency: rate === null ? 'USD' : cur, fee: conv(cfg.feeUsd) ?? cfg.feeUsd, pct: cfg.pct, minCommission: conv(cfg.minUsd) ?? cfg.minUsd, pid: cfg.pid || null },
    { headers: { 'access-control-allow-origin': '*', 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
  );
}
