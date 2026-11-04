// Kick the content engine tick (/api/content/tick) from frequent server events: the WHMCS cron webhook and page requests
// that reach the function. Each server instance kicks at most every 10 minutes; the tick itself skips when another run
// happened in the last 8 minutes and holds a database lock, so overlapping kicks are harmless. Call it from after().
let next = 0;
export async function kickContent(origin: string, from = 'page') {
  if (Date.now() < next) return;
  next = Date.now() + 10 * 60_000;
  const secret = process.env.CRON_SECRET;
  if (!secret || process.env.VERCEL_ENV !== 'production' || !/^https:\/\//.test(origin)) return;
  try {
    await fetch(`${origin.replace(/\/$/, '')}/api/content/tick?from=${encodeURIComponent(from)}`, {
      method: 'POST', headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(8000), cache: 'no-store',
    });
  } catch { /* the next kick or the daily cron picks it up */ }
}
