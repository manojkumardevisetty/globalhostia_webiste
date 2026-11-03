// Index of every product feed in every synced currency.
import { feedIndex } from '@/lib/agents/feeds';
import { json, preflight } from '@/lib/agents/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  return json(await feedIndex());
}

export const OPTIONS = preflight;
