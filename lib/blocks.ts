// Editable HTML blocks by key (theme menu/footer partials): cached 6h, tag `site`; snapshot-backed (lib/lkg.ts).
import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { cachedRead } from './lkg';

export const blockHtml = cachedRead('block', async (key: string): Promise<string | null> =>
  (await db.select({ html: schema.blocks.html }).from(schema.blocks).where(eq(schema.blocks.key, key)).limit(1))[0]?.html ?? null);
