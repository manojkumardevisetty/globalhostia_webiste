import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
if (!url) throw new Error('DATABASE_URL / POSTGRES_URL is not set');

// connect_timeout: an unreachable database fails fast and public reads fall back to the snapshot (lib/lkg.ts).
// Reuse one pool across hot reloads / warm serverless invocations.
const g = globalThis as unknown as { __pg?: ReturnType<typeof postgres> };
const client = g.__pg ?? postgres(url, { max: 5, prepare: false, idle_timeout: 20, connect_timeout: 8 });
if (process.env.NODE_ENV !== 'production') g.__pg = client;

export const db = drizzle(client, { schema });
export { schema };
