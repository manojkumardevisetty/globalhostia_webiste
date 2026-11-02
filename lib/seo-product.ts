// Pure helpers for product-page SEO (no imports, so tests can load this file directly).

const COUNTRY = /^(france|germany|netherlands|uk|united kingdom|usa|united states|canada|brazil|singapore|malaysia|india|uae|dubai|south africa|russia|algeria|europe|poland|finland|spain|italy|japan|australia)$/i;
const CPU = /xeon|ryzen|epyc|core i\d|\bE\d-\d{4}|opteron|threadripper/i;
const THE = /^(usa|uk|uae|netherlands|united states|united kingdom)$/i;

/** "USA" -> "in the USA", "Malaysia" -> "in Malaysia". */
export const inLoc = (l: string) => `in ${THE.test(l) ? 'the ' : ''}${/^(usa|uk|uae)$/i.test(l) ? l.toUpperCase() : l}`;

/** "Dedicated Servers" -> "Dedicated Server"; "Shared Hosting – Malaysia" -> "Shared Hosting". */
export const nounOf = (catName: string) => catName.split(/\s+[–-]\s+/)[0].replace(/\bServers\b/, 'Server').replace(/\bCertificates\b/, 'Certificate').trim();

/**
 * <title> text for a product (the shell adds " | Brand" when the result stays within 60 characters).
 * "Name | Category" when that fits with the brand. Spec-style WHMCS names such as
 * "France - AMD Ryzen 7 3700X - 128GB DDR4 - 1TB NVME" become "Ryzen 7 3700X 128GB Dedicated Server – France".
 * Anything else is kept as long as it fits in 60 characters, then cut at a word boundary.
 */
export function productTitle(name: string, catName: string, brand = 'GlobalHostia') {
  const n = name.replace(/\s+/g, ' ').trim();
  const full = catName && !n.toLowerCase().includes(catName.toLowerCase()) ? `${n} | ${catName}` : n;
  if (`${full} | ${brand}`.length <= 60) return full;
  const parts = n.split(/\s+[-–|]\s+/).map((x) => x.trim()).filter(Boolean);
  const cpuPart = parts.find((x) => CPU.test(x));
  if (parts.length >= 2 && cpuPart) {
    const noun = catName ? nounOf(catName) : '';
    const loc = parts.find((x) => COUNTRY.test(x)) || '';
    const cpu = cpuPart.replace(/^1x\s*/i, '').replace(/\b(AMD|Intel)\s+/gi, '').trim();
    const ram = (parts.find((x) => x !== cpuPart && /^\d+(\.\d+)?\s*[GT]B\b/i.test(x))?.match(/\d+(\.\d+)?\s*[GT]B/i)?.[0] || '').replace(/\s+/g, '');
    const tail = loc ? ` – ${loc}` : '';
    for (const t of [`${cpu} ${ram} ${noun}${tail}`, `${cpu} ${noun}${tail}`, `${cpu} ${ram}${tail}`, `${cpu}${tail}`]) {
      const c = t.replace(/\s+/g, ' ').trim();
      if (c.length <= 60) return c;
    }
  }
  if (full.length <= 60) return full;
  if (n.length <= 60) return n;
  const cut = n.slice(0, 60);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).replace(/[\s,;:|–-]+$/, '');
}
