// Derive structured specs from WHMCS feature lines when the admin hasn't entered attributes,
// e.g. "4 cores", "16GB RAM", "2x2TB SSD", "5 IPs", "Unmetered 1Gbps", "USA datacenter".
export type Specs = Record<string, string>;

const RULES: [string, RegExp][] = [
  ['cpu', /(\d+\s*(?:v?cpu|v?cores?|c\/\d+t|threads?)|\bE[35]-\d{4}\w*|Xeon[^,]*|Ryzen[^,]*|EPYC[^,]*)/i],
  ['ram', /(\d+(?:\.\d+)?\s*[GT]B\s*(?:DDR\d)?\s*(?:RAM|memory)|\d+\s*GB\s*DDR\d|RAM[:\s]+\d+\s*GB)/i],
  ['storage', /(\d+\s*x\s*)?\d+(?:\.\d+)?\s*[GT]B\s*(?:NVMe|SSD|HDD|storage|disk|space|of space)/i],
  ['bandwidth', /(unmetered|unlimited)\s*(bandwidth|traffic)?|\d+\s*(?:TB|GB)\s*(?:bandwidth|traffic)|\d+\s*Gbps/i],
  ['ips', /\d+\s*(?:dedicated\s*)?IPv?4?\s*(?:address(?:es)?|s)\b|\d+\s*IPs?\b/i],
  ['websites', /(unlimited|\d+)\s*websites?/i],
  ['email', /(unlimited|\d+)\s*email/i],
  ['location', /\b(UAE|Dubai|USA|United States|Singapore|India|Germany|UK|Netherlands|Brazil|South Africa|Russia|Algeria)\b/i],
];

export function deriveSpecs(features: string[], attributes: Record<string, string> = {}): Specs {
  const out: Specs = {};
  for (const [k, v] of Object.entries(attributes || {})) out[k.toLowerCase()] = v;
  const text = features.filter((f) => !f.startsWith('-'));
  for (const [key, re] of RULES) {
    if (out[key]) continue;
    for (const f of text) { const m = f.match(re); if (m) { out[key] = key === 'location' ? m[1] : f.trim(); break; } }
  }
  return out;
}

export const SPEC_LABEL: Record<string, string> = {
  cpu: 'Processor', ram: 'Memory', storage: 'Storage', bandwidth: 'Bandwidth', ips: 'IP addresses',
  websites: 'Websites', email: 'Email accounts', location: 'Location', os: 'Operating system',
};
