// Extract rich product details from the original HTML pages, keyed by WHMCS store path (group/slug).
const { chromium } = require('playwright');
const fs = require('fs');
const files = fs.readdirSync('full').filter(f => f.endsWith('.html') && !['index1.html','index111111.html','web-hosting1.html','index.html.moved'].includes(f));
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
  const all = {};
  for (const f of files) {
    await p.goto('http://localhost:8080/' + f, { waitUntil: 'domcontentloaded' }).catch(() => {});
    const items = await p.evaluate((page) => {
      const T = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : '');
      const out = [];
      for (const a of document.querySelectorAll('a[href*="/secure/store/"]')) {
        const m = a.getAttribute('href').match(/\/secure\/store\/([\w-]+)\/([\w-]+)/); if (!m) continue;
        const key = m[1] + '/' + m[2];
        const vps = a.closest('.vps-plan-item');
        if (vps) {
          const g = (c) => T(vps.querySelector(c + ' h3'));
          out.push({ key, page, kind: 'row', model: '', name: '', badge: '', specs: { cpu: g('.cpu-block'), ram: g('.ram-block'), os: g('.storage-block') }, attrs: {} });
          continue;
        }
        const tr = a.closest('tr');
        if (tr) {
          const table = tr.closest('table');
          const heads = [...(table?.querySelectorAll('thead th') || [])].map((th) => T(th).toLowerCase());
          const cells = [...tr.children];
          const specs = {};
          cells.forEach((td, i) => {
            const h = heads[i] || ''; const v = T(td);
            if (!v || /buy|order/i.test(v)) return;
            if (/processor|cpu/.test(h)) specs.cpu = v; else if (/ram|memory/.test(h)) specs.ram = v; else if (/storage|disk/.test(h)) specs.storage = v;
            else if (/ip/.test(h)) specs.ips = v; else if (/bandwidth|port|network/.test(h)) specs.bandwidth = v; else if (/location/.test(h)) specs.location = v;
          });
          const nameCell = cells[0];
          out.push({ key, page, kind: 'row', model: T(nameCell?.querySelector('.package-name')), name: T(nameCell?.querySelector('small')), badge: T(nameCell?.querySelector('.package-badge')), specs,
            attrs: Object.fromEntries([...tr.attributes].filter((x) => x.name.startsWith('data-')).map((x) => [x.name.slice(5), x.value])) });
          continue;
        }
        const card = a.closest('.pricing-plan-two, .pricing-plan, .aws-services-box, .ssl-card, .plan-card, .card, [class*="col-"]');
        if (!card) continue;
        const heading = card.querySelector('h3, h4, h2, .badge');
        const lis = [...card.querySelectorAll('li')].map((li) => ({ t: T(li), off: li.classList.contains('disabled') || !!li.querySelector('.icon-simple-remove, .fa-times, .fa-xmark, s, del') || li.closest('s,del') !== null })).filter((x) => x.t && x.t.length < 140);
        const ps = [...card.querySelectorAll('p')].map(T).filter((x) => x.length > 20 && !/^\$|billed|savings|renews/i.test(x));
        const note = [...card.querySelectorAll('p, small, span, strong')].map(T).find((x) => /savings|term|renews/i.test(x)) || '';
        out.push({ key, page, kind: 'card', name: T(card.querySelector('.badge')) || T(heading), title: T(heading), description: ps.sort((x, y) => y.length - x.length)[0] || '', features: lis.map((x) => (x.off ? '-' : '') + x.t), note });
      }
      return out;
    }, f.replace('.html', ''));
    for (const it of items) { (all[it.key] ||= []).push(it); }
  }
  // merge: prefer the richest record per product
  const merged = {};
  for (const [k, list] of Object.entries(all)) {
    const best = list.sort((a, b) => ((b.features?.length || 0) + Object.keys(b.specs || {}).length * 2 + (b.description ? 3 : 0)) - ((a.features?.length || 0) + Object.keys(a.specs || {}).length * 2 + (a.description ? 3 : 0)))[0];
    merged[k] = { ...best, pages: [...new Set(list.map((x) => x.page))] };
  }
  fs.writeFileSync('/home/claude/globalhostia_webiste/legacy/product-details.json', JSON.stringify(merged, null, 1));
  console.log('products with details:', Object.keys(merged).length);
  for (const [k, v] of Object.entries(merged)) console.log(k.padEnd(52), v.kind, v.kind === 'row' ? JSON.stringify(v.specs).slice(0, 90) + ' | ' + v.model : `${v.features.length} features | ${v.description.slice(0, 50)}`);
  await b.close();
})();
