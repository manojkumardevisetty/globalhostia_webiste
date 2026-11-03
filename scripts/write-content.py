"""Replace theme placeholder text (lorem ipsum / dummy text) with real GlobalHostia copy.
Reads sections from the local DB export (/tmp/ph.csv), writes legacy/content-005.json
({slug: {section_name: new_html}}) which db-setup patch 005 applies to production."""
import csv, json, re, sys

PH = re.compile(r'(lorem|ipsum|dummy text|type specimen|five centuries|typesetting|since the 1500s|galley of type|consectetuer|adipiscing|nonummy|Kemu)', re.I)

COPY = {  # heading keyword -> paragraphs (first match wins)
    'what we do': [
        'GlobalHostia is a Dubai-based web hosting and domain company based in Dubai, UAE. We provide shared and WordPress hosting, VPS, dedicated and AI/LLM servers, SSL certificates and domains for businesses, developers and agencies.',
        'Every plan runs on fast NVMe storage with free SSL and is backed by real 24/7 support from our own team — so you can focus on growing your business while we take care of the technology.',
    ],
    'algeria server': ['Host in our Algeria location (EU region) to serve visitors across North Africa and southern Europe with low latency and reliable connectivity.'],
    'closest server': ['Choose the data centre closest to your customers when you order — your service is deployed in the region you select for the fastest page loads.'],
    'how can i order': ['Choose a plan on this page, pick your billing cycle and click Order Now. You will be taken to our secure client area to create your account and pay — most services are activated automatically within minutes.'],
    'resellers hosting': ['Reseller hosting lets you sell web hosting under your own brand. You get a WHM reseller account to create and manage separate cPanel accounts for your clients, while we look after the servers, network and maintenance.'],
    'easiest websites transfer': ['Moving from another provider? Our support team helps you migrate your cPanel accounts and websites to GlobalHostia.'],
    'easiest domain transfer': ['Bring your domain to GlobalHostia in a few clicks — enter it in the transfer form and we take care of the rest, without any downtime for your website or email.'],
    'get your token': ['Request the EPP / authorisation code from your current registrar and make sure the domain is unlocked — that is all we need to start the transfer.'],
    'install all of': ['Connect your domain to your hosting and install WordPress and other popular applications with one click from cPanel.'],
    'and just use your': ['When everything is set up, manage your websites, domains, DNS and renewals from one GlobalHostia client area.'],
    'choose a plan': ['Compare our plans and choose the one that fits your project. You can upgrade at any time as you grow.'],
    'pay your invoices': ['Check out securely in our client area with a card or another supported payment method. Invoices and renewals are always available in your account.'],
    'and just start': ['Your service is set up automatically and your login details arrive by email, so you can go live straight away.'],
    'all starts with a domain': ['Register the domain for your business — your website and professional email address start here.'],
    'every budget': ['From a single website to hundreds of client sites, there is a GlobalHostia plan that fits your project and your budget.'],
    'complete hosting solutions': ['Hosting, domain, SSL and business email together — managed from one client area with one invoice.'],
    'people choose us': ['Fast NVMe servers, free SSL, easy one-click WordPress and friendly 24/7 support from a team based in Dubai — everything you need to run your website without the hassle.'],
    'scalable by design': ['Start small and add CPU, RAM and storage as you grow — upgrades take just a few clicks from your client area.'],
    'tier 1 global network': ['Your traffic runs over premium carrier networks for stable, low-latency connections to visitors around the world.'],
    'nvme + ssd': ['Enterprise NVMe and SSD storage delivers fast read and write speeds for websites, databases, applications and VPN workloads.'],
}
FACTS = ['Websites and services hosted', 'Network uptime', 'Average customer rating', 'Support satisfaction score']
HEADING_FIX = {'how can i order new host ?': 'How can I order a new hosting plan?', 'what is resellers hosting ?': 'What is reseller hosting?', 'Coodiv team': 'GlobalHostia team', 'Coodiv-Cache': 'GlobalHostia Cache'}

def text(s): return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', s)).replace('&amp;', '&').strip()

def rewrite(slug, name, html):
    out, pos, used = [], 0, {}
    facts_i = 0
    for m in re.finditer(r'>([^<>]+)<', html):
        t = m.group(1)
        if not PH.search(t) or len(t.strip()) < 4:
            continue
        before = html[:m.start()]
        heads = re.findall(r'<h[1-6][^>]*>([\s\S]*?)</h[1-6]>', before)
        head = text(heads[-1]).lower() if heads else ''
        # facts counters: "+ 9,533" style blocks have the number in a heading
        if 'fact' in name:
            rep = FACTS[facts_i % len(FACTS)]; facts_i += 1
        elif slug == 'incident-post' and 'breadcrumb' in name:
            rep = 'Incident report'
        else:
            key = next((k for k in COPY if k in head), None)
            if not key:
                print(f'  ! no copy for {slug} / {name} / heading="{head[:50]}"', file=sys.stderr); continue
            i = used.get((key, head), 0); used[(key, head)] = i + 1
            paras = COPY[key]
            rep = paras[i] if i < len(paras) else ''
        out.append(html[pos:m.start(1)]); out.append(rep); pos = m.end(1)
    out.append(html[pos:])
    new = ''.join(out)
    for a, b in HEADING_FIX.items():
        new = new.replace('>' + a + '<', '>' + b + '<').replace('> ' + a + ' <', '> ' + b + ' <')
    new = re.sub(r'>(\s*)Coodiv team(\s*)<', r'>\1GlobalHostia team\2<', new)
    new = new.replace('Coodiv-Cache', 'GlobalHostia Cache')
    return new

rows = list(csv.reader(open('/tmp/ph.csv')))
result, left = {}, 0
for slug, name, html in rows:
    if slug.startswith('blog') or slug.startswith('test-'):
        continue
    new = rewrite(slug, name, html)
    remaining = len(re.findall(r'lorem ipsum|dummy text', new, re.I))
    left += remaining
    result.setdefault(slug, {})[name] = new
    print(f'{slug:24} {name:28} replaced, remaining placeholders: {remaining}')
json.dump(result, open('legacy/content-005.json', 'w'))
print('sections:', sum(len(v) for v in result.values()), 'remaining placeholders total:', left)
