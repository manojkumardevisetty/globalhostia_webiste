// "Connect my domain": which DNS provider a domain uses (from its nameserver host names) and the provider-specific
// steps to either switch nameservers to GlobalHostia or keep the current DNS and add records. Pure data + logic so the
// instructions are easy to edit and the detection is unit-tested (tests/health.test.mts).

const nsIsOurs = (ns: string[], ours: string[]) => ns.length > 0 && ns.map((n) => n.toLowerCase().replace(/\.$/, '')).every((n) => ours.includes(n));

export interface DnsProvider {
  id: string; name: string;
  /** Where the customer changes nameservers / edits DNS records (provider's own dashboard). */
  url: string;
  ns: string[]; // numbered steps: change nameservers
  dns: string[]; // numbered steps: add A / CNAME records
}

/** Edit freely. `match` is tested against every nameserver host name (lower case, no trailing dot). */
export const PROVIDERS: (DnsProvider & { match: RegExp })[] = [
  { id: 'cloudflare', name: 'Cloudflare', match: /\.ns\.cloudflare\.com$/, url: 'https://dash.cloudflare.com/',
    ns: ['Cloudflare is only your DNS host. Nameservers are changed at the registrar where you bought the domain (shown below, if we could find it).', 'At that registrar, replace the two Cloudflare nameservers with the GlobalHostia ones.', 'Optionally remove the site from Cloudflare afterwards.'],
    dns: ['Sign in to Cloudflare and open the domain.', 'Go to DNS, then Records.', 'Edit the A record for @ (or add one) and set it to the server IP. Set Proxy status to "DNS only" until the SSL certificate is issued.', 'Add or edit a CNAME record: name www, target your domain.', 'Save. Cloudflare usually applies changes within minutes.'] },
  { id: 'godaddy', name: 'GoDaddy', match: /\.domaincontrol\.com$/, url: 'https://dcc.godaddy.com/control/portfolio',
    ns: ['Sign in to GoDaddy and open My Products, then Domains.', 'Choose the domain, then DNS, then Nameservers.', 'Click Change Nameservers and choose "I\'ll use my own nameservers".', 'Enter the two GlobalHostia nameservers and save.'],
    dns: ['Sign in to GoDaddy and open the domain\'s DNS page (Domain Portfolio, then DNS).', 'Edit the A record named @ and set its value to the server IP. Delete any "Parked" A record.', 'Edit the CNAME named www so it points to @ (or your domain).', 'Save.'] },
  { id: 'namecheap', name: 'Namecheap', match: /\.registrar-servers\.com$/, url: 'https://ap.www.namecheap.com/domains/list/',
    ns: ['Sign in to Namecheap and open Domain List.', 'Click Manage next to the domain.', 'Under Nameservers choose "Custom DNS".', 'Enter the two GlobalHostia nameservers and click the green tick to save.'],
    dns: ['Sign in to Namecheap, open Domain List and click Manage.', 'Open the Advanced DNS tab.', 'Add or edit an A Record: Host @, Value the server IP. Remove the "URL Redirect" or parking records.', 'Add a CNAME Record: Host www, Value your domain.', 'Save all changes.'] },
  { id: 'squarespace', name: 'Squarespace (formerly Google Domains)', match: /googledomains\.com$|squarespacedns\.com$|\.squarespace\.com$/, url: 'https://account.squarespace.com/domains',
    ns: ['Sign in to Squarespace Domains and open the domain.', 'Go to DNS, then Domain Nameservers.', 'Choose "Use custom nameservers" and enter the two GlobalHostia nameservers.', 'Save.'],
    dns: ['Sign in to Squarespace Domains and open the domain.', 'Go to DNS, then DNS Settings, and remove any Squarespace or Google default records you do not use.', 'Add a custom record: Host @, Type A, Data the server IP.', 'Add a custom record: Host www, Type CNAME, Data your domain.', 'Save.'] },
  { id: 'hostinger', name: 'Hostinger', match: /dns-parking\.com$|hostinger\./, url: 'https://hpanel.hostinger.com/domains',
    ns: ['Sign in to hPanel and open Domains.', 'Click Manage next to the domain, then DNS / Nameservers.', 'Click Change Nameservers, choose "Change nameservers" and enter the two GlobalHostia nameservers.', 'Save.'],
    dns: ['Sign in to hPanel, open Domains and click Manage.', 'Open DNS / Nameservers, then DNS records.', 'Edit the A record for @ to the server IP.', 'Edit the CNAME for www so it points to your domain.', 'Save.'] },
  { id: 'porkbun', name: 'Porkbun', match: /porkbun\.com$/, url: 'https://porkbun.com/account/domainsSpeedy',
    ns: ['Sign in to Porkbun and open Domain Management.', 'Click Details next to the domain, then the edit icon next to Authoritative Nameservers.', 'Replace the list with the two GlobalHostia nameservers.', 'Submit.'],
    dns: ['Sign in to Porkbun, open Domain Management and click DNS next to the domain.', 'Delete the default ALIAS / CNAME parking records.', 'Add an A record: Host blank, Answer the server IP.', 'Add a CNAME record: Host www, Answer your domain.'] },
  { id: 'namecom', name: 'Name.com', match: /\.name\.com$/, url: 'https://www.name.com/account/domain',
    ns: ['Sign in to Name.com and open My Domains.', 'Choose the domain, then Manage Nameservers.', 'Delete the current nameservers and add the two GlobalHostia nameservers.', 'Save.'],
    dns: ['Sign in to Name.com, open My Domains and choose the domain.', 'Open Manage DNS Records.', 'Add an A record: Host blank, Answer the server IP.', 'Add a CNAME record: Host www, Answer your domain.'] },
  { id: 'ionos', name: 'IONOS', match: /\.ui-dns\.(com|de|org|biz)$/, url: 'https://my.ionos.com/domains',
    ns: ['Sign in to IONOS and open Domains & SSL.', 'Click the gear icon next to the domain and choose Adjust Name Servers.', 'Select "Use custom name servers" and enter the two GlobalHostia nameservers.', 'Save.'],
    dns: ['Sign in to IONOS, open Domains & SSL and click the gear icon, then DNS.', 'Edit the A record for @ to the server IP (switch off any IONOS website that uses it).', 'Add a CNAME record: Host www, Points to your domain.', 'Save.'] },
  { id: 'route53', name: 'Amazon Route 53', match: /awsdns-\d+\.(com|net|org|co\.uk)$/, url: 'https://console.aws.amazon.com/route53/',
    ns: ['If the domain is registered with Route 53: open Route 53, then Registered domains, choose the domain and click "Edit name servers".', 'Replace the four AWS nameservers with the two GlobalHostia nameservers and save.', 'If it is registered elsewhere, change the nameservers at that registrar instead.'],
    dns: ['Open Route 53, then Hosted zones, and choose the domain.', 'Create or edit an A record: name blank, value the server IP.', 'Create a CNAME record: name www, value your domain.', 'Save each record.'] },
  { id: 'wix', name: 'Wix', match: /wixdns\.net$/, url: 'https://manage.wix.com/account/domains',
    ns: ['Sign in to Wix and open Domains.', 'Click the three dots next to the domain, then Advanced, then Change nameservers (only possible for domains bought at Wix).', 'Enter the two GlobalHostia nameservers and save.'],
    dns: ['Sign in to Wix, open Domains and click the three dots, then Manage DNS records.', 'Edit the A record (Host Name @) to the server IP. Disconnect the domain from your Wix site first if Wix asks.', 'Edit the CNAME for www to point to your domain.', 'Save.'] },
];
export const GENERIC: DnsProvider = { id: 'generic', name: 'your domain provider', url: '',
  ns: ['Sign in where you bought the domain (your registrar).', 'Find the domain\'s Nameservers (sometimes called DNS servers or Name servers).', 'Choose custom nameservers and enter the two GlobalHostia nameservers.', 'Save. Remove any extra nameservers so only the two GlobalHostia ones remain.'],
  dns: ['Sign in to the service that hosts your DNS (where the nameservers point).', 'Open the DNS records or DNS zone for the domain.', 'Set the A record for @ (the domain itself) to the server IP. Remove other A records for @.', 'Set a CNAME record for www pointing to your domain.', 'Save.'] };

export function detectProvider(ns: string[]): DnsProvider {
  const hs = ns.map((n) => n.toLowerCase().replace(/\.$/, ''));
  const p = PROVIDERS.find((x) => hs.some((h) => x.match.test(h)));
  if (!p) return GENERIC;
  const { match: _m, ...rest } = p;
  return rest;
}

/** Map a registrar name from RDAP onto a known provider (for links when DNS is hosted somewhere else, e.g. Cloudflare). */
export function providerByName(name: string): DnsProvider | null {
  const n = name.toLowerCase();
  const id = /godaddy|wild west/.test(n) ? 'godaddy' : /namecheap/.test(n) ? 'namecheap' : /squarespace|google/.test(n) ? 'squarespace' : /hostinger/.test(n) ? 'hostinger'
    : /porkbun/.test(n) ? 'porkbun' : /name\.com/.test(n) ? 'namecom' : /ionos|1&1|1and1/.test(n) ? 'ionos' : /amazon/.test(n) ? 'route53' : /wix/.test(n) ? 'wix' : /cloudflare/.test(n) ? 'cloudflare' : '';
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) return null;
  const { match: _m, ...rest } = p;
  return rest;
}

/** Registrar from an RDAP domain answer (entities with role "registrar", vCard "fn"). */
export function rdapRegistrar(j: any): string {
  const ents: any[] = Array.isArray(j?.entities) ? j.entities : [];
  const r = ents.find((e) => Array.isArray(e?.roles) && e.roles.includes('registrar'));
  const card: any[] = r?.vcardArray?.[1] || [];
  const fn = card.find((x) => Array.isArray(x) && x[0] === 'fn');
  return typeof fn?.[3] === 'string' ? fn[3].slice(0, 120) : '';
}

export interface ConnectFacts { domain: string; serverIp?: string; ourNs: string[]; ns: string[]; a: string[]; www: string[]; wwwCname?: string[]; https?: { ok: boolean; error?: string } }
export interface ConnectStep { id: 'ns' | 'a' | 'www' | 'https'; ok: boolean; label: string; detail: string }

/** Per-step progress for the wizard. Connected = the apex A record answers with the server IP (or NS are ours). */
export function connectSteps(f: ConnectFacts): { steps: ConnectStep[]; connected: boolean; nsOurs: boolean } {
  const ours = nsIsOurs(f.ns, f.ourNs);
  const aOk = !!f.serverIp && f.a.includes(f.serverIp);
  const wwwOk = (!!f.serverIp && f.www.includes(f.serverIp)) || !!f.wwwCname?.some((c) => c.toLowerCase().replace(/\.$/, '') === f.domain);
  const steps: ConnectStep[] = [
    { id: 'ns', ok: ours, label: 'Nameservers point to GlobalHostia', detail: ours ? 'ns1 / ns2.globalhostia.com are live.' : f.ns.length ? `Currently ${f.ns.slice(0, 2).join(', ')}.` : 'No nameservers found yet.' },
    { id: 'a', ok: aOk, label: `${f.domain} points to this server`, detail: aOk ? `A record is ${f.serverIp}.` : f.a.length ? `A record is ${f.a.join(', ')}; it should be ${f.serverIp || 'the server IP'}.` : 'No A record yet.' },
    { id: 'www', ok: wwwOk, label: `www.${f.domain} points here`, detail: wwwOk ? 'www opens the same site.' : f.www.length ? `www resolves to ${f.www.join(', ')}.` : 'www does not resolve yet.' },
    { id: 'https', ok: !!f.https?.ok, label: 'HTTPS is ready', detail: f.https?.ok ? 'A trusted certificate is served.' : aOk ? 'Issue a free certificate once the domain points here.' : 'Waits for the domain to point here.' },
  ];
  return { steps, connected: ours || aOk, nsOurs: ours };
}
