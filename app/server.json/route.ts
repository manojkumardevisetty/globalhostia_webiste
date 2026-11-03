// /server.json — the MCP Registry manifest (repository root server.json), served so the owner can download it.
import manifest from '@/server.json';
import { json, preflight } from '@/lib/agents/http';

export const dynamic = 'force-static';

export function GET() {
  return json(manifest, { cache: 'public, max-age=3600, s-maxage=86400' });
}

export const OPTIONS = preflight;
