// Connector settings from the database (settings.connector), read fresh every 15 s: the kill switch must act quickly,
// so this does not go through the 6 h site cache.
import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { normalizeConnector, type ConnectorConfig } from './config-core';

export const CONNECTOR_KEY = 'connector';
let memo: { at: number; v: ConnectorConfig } | null = null;

export async function connectorConfig(fresh = false): Promise<ConnectorConfig> {
  if (!fresh && memo && Date.now() - memo.at < 15_000) return memo.v;
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, CONNECTOR_KEY)).catch(() => []);
  const v = normalizeConnector(row?.value);
  memo = { at: Date.now(), v };
  return v;
}

export async function saveConnectorConfig(v: ConnectorConfig) {
  const value = normalizeConnector(v);
  await db.insert(schema.settings).values({ key: CONNECTOR_KEY, value: value as any }).onConflictDoUpdate({ target: schema.settings.key, set: { value: value as any } });
  memo = { at: Date.now(), v: value };
}
