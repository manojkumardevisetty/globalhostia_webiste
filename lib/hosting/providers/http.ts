// Small shared HTTP helpers for panel adapters (server-only callers).
import { PanelError } from '../types';

export const TIMEOUT_MS = 25_000;

export async function call(url: string, init: RequestInit & { timeout?: number } = {}): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(init.timeout ?? TIMEOUT_MS) });
  } catch (e: any) {
    const cause = e?.cause?.code || e?.cause?.message || '';
    if (e?.name === 'TimeoutError') throw new PanelError('The hosting server did not answer in time. Please try again.', 504);
    if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(cause)) throw new PanelError('The hosting server TLS certificate is not trusted (use the panel host name with a valid certificate).', 502);
    throw new PanelError('Could not reach the hosting server.', 502);
  }
}

/** Read a body but stop (and fail) once it exceeds `max` bytes. */
export async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const len = Number(res.headers.get('content-length') || 0);
  if (len > max) throw new PanelError(`File is larger than ${Math.round(max / 1048576)} MB`, 413);
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = []; let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { await reader.cancel().catch(() => {}); throw new PanelError(`File is larger than ${Math.round(max / 1048576)} MB`, 413); }
    chunks.push(value);
  }
  const out = new Uint8Array(n); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}

export const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
export const idOf = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
export const fromId = <T>(id: string): T | null => { try { return JSON.parse(Buffer.from(String(id), 'base64url').toString('utf8')); } catch { return null; } };
