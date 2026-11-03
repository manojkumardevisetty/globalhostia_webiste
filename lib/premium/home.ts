// Homepage premium domains row: featured own listings first, then top Dynadot picks (Admin → Premium domains → Homepage row).
// Never throws: any data problem simply hides the row.
import 'server-only';
import { premiumItems, premiumConfig } from './store';
import { marqueePicks } from './core';
import { marquee } from './view';

export async function homePremium(): Promise<{ html: string; position: string }> {
  try {
    const [cfg, items] = await Promise.all([premiumConfig(), premiumItems()]);
    if (!cfg.enabled || cfg.home.position === 'off') return { html: '', position: 'off' };
    const picks = marqueePicks(items, cfg.home.max);
    return { html: picks.length >= 3 ? marquee(picks, { title: cfg.home.title }) : '', position: cfg.home.position };
  } catch { return { html: '', position: 'off' }; }
}
