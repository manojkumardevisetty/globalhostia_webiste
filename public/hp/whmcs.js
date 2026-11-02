/* Globalhostia client-area enhancements (loaded by a tiny WHMCS hook, see docs).
   1) Replaces the endless horizontal store-category scroller with 5 grouped menus (Hostpen Modern style).
   2) Adds a promo banner above store listings.
   Pure progressive enhancement: if anything fails the original page stays as it was. */
(function () {
  'use strict';
  function ready(f) { if (document.readyState !== 'loading') f(); else document.addEventListener('DOMContentLoaded', f); }

  var GROUPS = [
    { label: 'Hosting', icon: 'M3 5h18v6H3zM3 13h18v6H3zM7 8h.01M7 16h.01', match: /website|wordpress|shared|hosting/i, prio: 5 },
    { label: 'VPS & Cloud', icon: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01', match: /vps|virtual|^servers$|cloud|\bai\b|llm|forex/i, prio: 4 },
    { label: 'Dedicated', icon: 'M5 3h14v18H5zM9 7h6M9 11h6M9 15h6', match: /dedicated/i, prio: 1 },
    { label: 'Remote Desktop', icon: 'M3 4h18v12H3zM8 20h8M12 16v4', match: /rdp|remote/i, prio: 2 },
    { label: 'Security & Apps', icon: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', match: /ssl|mcp|project|management|n8n|email|workspace/i, prio: 3 },
  ];
  var RENAME = { 'Servers': 'Cloud VPS – Europe & USA', "MCP's": 'MCPs & Automation', 'Ai/llm Hosting': 'AI / LLM Hosting' };
  var svg = function (d) { return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>'; };

  function groupedNav() {
    var scroller = document.querySelector('.order-form-menu-scroller');
    if (!scroller) return;
    var links = Array.prototype.slice.call(scroller.querySelectorAll('a.nav-link[href]'));
    if (links.length < 4) return;
    var buckets = GROUPS.map(function (g) { return { g: g, items: [] }; });
    var other = { g: { label: 'More', icon: 'M5 12h.01M12 12h.01M19 12h.01' }, items: [] };
    links.forEach(function (a) {
      var t = a.textContent.trim(); if (!t) return;
      var item = { text: RENAME[t] || t, href: a.getAttribute('href'), active: a.classList.contains('active') || location.pathname === a.pathname };
      var b = buckets.filter(function (x) { return x.g.match.test(t); }).sort(function (a, c) { return a.g.prio - c.g.prio; })[0] || other;
      b.items.push(item);
    });
    if (other.items.length) buckets.push(other);
    var nav = document.createElement('nav');
    nav.className = 'gh-catnav'; nav.setAttribute('aria-label', 'Product categories');
    nav.innerHTML = buckets.filter(function (b) { return b.items.length; }).map(function (b, i) {
      var act = b.items.some(function (x) { return x.active; });
      return '<div class="gh-catnav__grp' + (act ? ' is-active' : '') + '"><button type="button" class="gh-catnav__btn" aria-expanded="false" aria-controls="gh-cat-' + i + '">' + svg(b.g.icon) + '<span>' + b.g.label + '</span><i aria-hidden="true"></i></button>' +
        '<ul class="gh-catnav__menu" id="gh-cat-' + i + '" role="list">' + b.items.map(function (x) {
          return '<li><a href="' + x.href + '"' + (x.active ? ' aria-current="page"' : '') + '>' + x.text + '</a></li>';
        }).join('') + '</ul></div>';
    }).join('');
    scroller.parentNode.insertBefore(nav, scroller);
    scroller.classList.add('gh-hidden');
    function closeAll(except) { nav.querySelectorAll('.gh-catnav__grp.is-open').forEach(function (g) { if (g !== except) { g.classList.remove('is-open'); g.querySelector('button').setAttribute('aria-expanded', 'false'); } }); }
    nav.addEventListener('click', function (e) {
      var btn = e.target.closest('.gh-catnav__btn'); if (!btn) return;
      var g = btn.parentNode, open = !g.classList.contains('is-open');
      closeAll(g); g.classList.toggle('is-open', open); btn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function (e) { if (!nav.contains(e.target)) closeAll(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });
  }

  function promo() {
    if (!/\/store\/|cart\.php(\?(a=|gid=)|$)/.test(location.pathname + location.search) || /a=(confproduct|confdomains|checkout|view|complete)/.test(location.search)) return;
    var host = document.querySelector('.gh-catnav') || document.querySelector('#order-standard_cart');
    if (!host || document.querySelector('.gh-promo')) return;
    var p = document.createElement('aside');
    p.className = 'gh-promo';
    p.innerHTML = '<div class="gh-promo__txt"><span class="gh-promo__tag">New</span><b>Cloud VPS in Europe &amp; USA</b><span>NVMe, choose your OS, add RAM or vCPU any time. Ready in minutes.</span></div>' +
      '<a class="gh-promo__btn" href="/secure/store/servers">Explore servers</a>';
    host.parentNode.insertBefore(p, host.nextSibling);
  }

  /* ---------- product listing: specs on every card; big categories become a filterable, sortable list ---------- */
  var SPECS_URL = 'https://globalhostiawebiste.vercel.app/api/store/specs';
  function parseCards(row) {
    return Array.prototype.slice.call(row.querySelectorAll('.emyui-ews-plans-group')).map(function (el) {
      var a = el.querySelector('a.btn-order-now, a.emyui-ews-plans-add-cart');
      var href = a ? a.getAttribute('href') : '#';
      var slug = (href.match(/\/store\/[^/]+\/([^/?#]+)/) || [])[1] || '';
      var priceEl = el.querySelector('.emyui-ews-plans-group-price-tag');
      var price = priceEl ? parseFloat(priceEl.textContent.replace(/[^0-9.]/g, '')) : NaN;
      var cycle = ((el.querySelector('.emyui-ews-plans-price-algo small') || {}).textContent || '').trim();
      var cur = ((el.querySelector('.emyui-ews-plans-price-algo span') || {}).textContent || '$').trim();
      var save = ((el.querySelector('.save-tag') || {}).textContent || '').trim();
      var name = ((el.querySelector('h5') || {}).textContent || '').trim();
      var region = /\b(usa|us)\b/i.test(name) ? 'USA' : /europe|france|germany|uk|netherlands/i.test(name) ? 'Europe' : '';
      var tier = /^(swift|velocity|turbo|boost|mega)\b/i.test(name) ? 'High performance' : /^(basic|standard|pro|advanced|elite)\b/i.test(name) ? 'Classic' : /ryzen|xeon|e5-|dedicated/i.test(name) ? 'Dedicated' : '';
      return { el: el, href: href, slug: slug, price: price, cycle: cycle, cur: cur, save: save, name: name, region: region, tier: tier, soldOut: !a || /out of stock/i.test(el.textContent) };
    });
  }
  /* numbers for filtering: RAM (GB), CPU cores/vCPU, storage type, monthly price */
  function numeric(it) {
    var txt = (it.name + ' | ' + it.features.join(' | ')).replace(/,/g, '');
    var ram = 0, m, re = /(\d+(?:\.\d+)?)\s*(GB|TB)\s*(?:RAM|DDR\d|ECC|memory)/gi;
    while ((m = re.exec(txt))) ram = Math.max(ram, parseFloat(m[1]) * (/tb/i.test(m[2]) ? 1024 : 1));
    if (!ram) { m = txt.match(/(\d+)\s*GB\b(?!\s*(?:SSD|NVMe|HDD|SATA|SAS|disk|storage|bandwidth))/i); if (m) ram = +m[1]; }
    var cores = 0; m = txt.match(/(\d+)\s*(?:v?CPU|vCore|Core)s?\b/i) || txt.match(/(\d+)C\/\d+T/i); if (m) cores = +m[1];
    var mult = txt.match(/(\d+)x\s*(?:intel|amd|xeon|e5)/i) || txt.match(/\b(dual)\b/i); if (mult && cores && /c\/\d+t/i.test(txt) === false) cores *= (/dual/i.test(mult[1]) ? 2 : +mult[1]);
    var disk = /nvme/i.test(txt) ? 'NVMe' : /ssd/i.test(txt) ? 'SSD' : /hdd|sata|sas/i.test(txt) ? 'HDD' : '';
    it.ram = ram; it.cores = cores; it.disk = disk;
  }
  function chips(list) { return list.map(function (f) { return '<li>' + f.replace(/</g, '&lt;') + '</li>'; }).join(''); }
  var CAT_INFO = {
    'dedicated-servers': ['Dedicated servers', 'A whole physical machine for you: no neighbours, full hardware, unmetered ports.', 'cpu'],
    'premiumdedicated-servers': ['Premium dedicated servers', 'Dual-Xeon and Ryzen flagships with up to 10Gbps ports for heavy workloads.', 'cpu'],
    'servers': ['Cloud VPS – Europe & USA', 'Classic and high-performance KVM servers with NVMe. Choose your OS, add RAM or vCPU any time.', 'server'],
    'hostiavps': ['Virtual private servers', 'Dedicated vCPU and RAM with full root access, ready in minutes.', 'server'],
    'windows-vps': ['Windows VPS', 'Windows Server with administrator access for apps, RDP and .NET.', 'monitor'],
    'forex-vps': ['Forex VPS', 'Always-on servers close to broker hubs for MetaTrader and EAs.', 'pulse'],
    'windows-rdp': ['Windows RDP', 'A Windows desktop in the cloud you connect to from anywhere.', 'monitor'],
    'ai-llm': ['AI / LLM servers', 'Run open models privately on servers sized for inference.', 'cpu'],
    'hostia-shared': ['Web hosting', 'Fast NVMe hosting with free SSL, email and daily backups.', 'layers'],
    'wordpress': ['WordPress hosting', 'Managed WordPress tuned for speed, with backups and updates.', 'layers'],
    'ssl-certificates': ['SSL certificates', 'DV, OV and wildcard certificates from trusted authorities.', 'shield'],
    'mcps': ['MCPs & automation', 'n8n and MCP engines on your own server.', 'layers'],
    'project-management': ['Project management', 'One workspace for every project, without per-seat fees.', 'invoice']
  };
  function catBanner() {
    var m = location.pathname.match(/\/store\/([^/]+)\/?$/); if (!m || document.querySelector('.gh-catbanner')) return;
    var info = CAT_INFO[m[1]]; if (!info) return;
    var title = document.querySelector('#order-standard_cart h1, .emyui-cart-aws h1, h1.coodiv-text-4');
    if (!title) return;
    var b = document.createElement('div');
    b.className = 'gh-catbanner gh-catbanner--' + m[1];
    b.innerHTML = '<span class="gh-hex">' + svg(IC[info[2]] || IC.server) + '</span><div><h1>' + info[0] + '</h1><p>' + info[1] + '</p></div>';
    var wrapTitle = title.closest('.text-center, .col-12, div') || title;
    title.classList.add('gh-hidden');
    var eyebrow = wrapTitle.querySelector('.pre-title'); if (eyebrow) eyebrow.classList.add('gh-hidden');
    wrapTitle.insertBefore(b, wrapTitle.firstChild);
  }
  function enhanceListing() {
    // the store template prints one row (id="products") per 4 plans, so collect every row
    var rows = Array.prototype.slice.call(document.querySelectorAll('.emyui-ews-plans-row'));
    if (!rows.length) return;
    var row = rows[0];
    var items = [].concat.apply([], rows.map(parseCards));
    if (!items.length) return;
    fetch(SPECS_URL, { mode: 'cors' }).then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (specs) {
      items.forEach(function (it) { var s = specs[it.slug]; it.features = s && s.features && s.features.length ? s.features : []; if (s) { it.region = it.region || s.location || ''; it.tier = it.tier || s.tier || ''; } numeric(it); });
      if (items.length <= 6) {
        items.forEach(function (it) {
          if (!it.features.length) return;
          var ul = it.el.querySelector('.emyui-ews-plans-features');
          if (ul && !ul.children.length) ul.innerHTML = chips(it.features);
        });
        rows.forEach(function (r) { r.classList.add('gh-cards'); });
        return;
      }
      buildList(row, items);
      rows.forEach(function (r) { r.classList.add('gh-hidden'); });
    });
  }
  function buildList(row, items) {
    var regions = uniq(items.map(function (i) { return i.region; }));
    var tiers = uniq(items.map(function (i) { return i.tier; }));
    var wrap = document.createElement('section');
    wrap.className = 'gh-plist';
    wrap.innerHTML =
      '<div class="gh-plist__bar">' +
        '<label class="gh-plist__search"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span class="gh-sr">Search plans</span><input type="search" placeholder="Search ' + items.length + ' plans" data-q></label>' +
        (tiers.length > 1 ? seg('tier', 'Type', tiers) : '') +
        (regions.length > 1 ? seg('region', 'Location', regions) : '') +
        selectFilter('ram', 'RAM', items.map(function (i) { return i.ram; }), function (v) { return v >= 1024 ? (v / 1024) + ' TB+' : v + ' GB+'; }) +
        selectFilter('cores', 'CPU', items.map(function (i) { return i.cores; }), function (v) { return v + '+ cores'; }) +
        (uniq(items.map(function (i) { return i.disk; })).length > 1 ? seg('disk', 'Storage', uniq(items.map(function (i) { return i.disk; }))) : '') +
        priceFilter(items) +
        '<label class="gh-plist__sort"><span>Sort</span><select data-sort><option value="price">Price: low to high</option><option value="-price">Price: high to low</option><option value="name">Name</option></select></label>' +
      '</div>' +
      '<p class="gh-plist__count" aria-live="polite"></p>' +
      '<div class="gh-plist__head" aria-hidden="true"><span>Plan</span><span>Specifications</span><span>Price</span><span></span></div>' +
      '<ol class="gh-plist__rows"></ol>';
    row.parentNode.insertBefore(wrap, row);
    row.classList.add('gh-hidden');
    var ol = wrap.querySelector('.gh-plist__rows'), state = { q: '', tier: '', region: '', disk: '', ram: 0, cores: 0, max: Infinity, sort: 'price' };
    function render() {
      var list = items.filter(function (i) {
        return (!state.tier || i.tier === state.tier) && (!state.region || i.region === state.region) && (!state.disk || i.disk === state.disk) &&
          (!state.ram || i.ram >= state.ram) && (!state.cores || i.cores >= state.cores) && (isNaN(i.price) || i.price <= state.max) &&
          (!state.q || (i.name + ' ' + i.features.join(' ')).toLowerCase().indexOf(state.q) > -1);
      }).sort(function (a, b) {
        if (state.sort === 'name') return a.name.localeCompare(b.name);
        var d = (isNaN(a.price) ? 1e9 : a.price) - (isNaN(b.price) ? 1e9 : b.price);
        return state.sort === '-price' ? -d : d;
      });
      wrap.querySelector('.gh-plist__count').textContent = list.length + ' of ' + items.length + ' plans';
      ol.innerHTML = list.length ? list.map(function (i) {
        return '<li class="gh-prow">' +
          '<div class="gh-prow__name"><b>' + esc(i.name) + '</b><span>' + [i.tier, i.region].filter(Boolean).map(esc).join(' · ') + '</span></div>' +
          '<ul class="gh-prow__specs">' + (i.features.length ? chips(i.features.slice(0, 4)) : '<li>See details</li>') + '</ul>' +
          '<div class="gh-prow__price">' + (isNaN(i.price) ? '' : '<b>' + esc(i.cur) + i.price.toFixed(2) + '</b><span>' + esc(i.cycle) + '</span>') + (i.save ? '<em>' + esc(i.save.replace(/^with an?\s*/i, '')) + '</em>' : '') + '</div>' +
          '<div class="gh-prow__cta">' + (i.soldOut ? '<span class="gh-prow__oos">Out of stock</span>' : '<a class="gh-prow__btn" href="' + i.href + '">Configure</a>') + '</div></li>';
      }).join('') : '<li class="gh-plist__empty">No plans match. <button type="button" data-reset>Clear filters</button></li>';
    }
    wrap.addEventListener('input', function (e) {
      if (e.target.matches('[data-q]')) { state.q = e.target.value.trim().toLowerCase(); render(); }
      if (e.target.matches('[data-max]')) { var v = +e.target.value; state.max = v >= +e.target.max ? Infinity : v; wrap.querySelector('[data-maxlbl]').textContent = state.max === Infinity ? 'Any price' : 'Up to ' + (items[0].cur || '$') + v; render(); }
    });
    wrap.addEventListener('change', function (e) {
      if (e.target.matches('[data-sort]')) { state.sort = e.target.value; render(); }
      if (e.target.matches('[data-num]')) { state[e.target.getAttribute('data-num')] = +e.target.value; render(); }
    });
    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('[data-key]');
      if (b) { var k = b.getAttribute('data-key'); state[k] = b.getAttribute('data-val'); b.parentNode.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); render(); }
      if (e.target.matches('[data-reset]')) { state.q = state.tier = state.region = state.disk = ''; state.ram = state.cores = 0; state.max = Infinity; wrap.querySelectorAll('[data-num]').forEach(function (x) { x.value = '0'; }); var mx = wrap.querySelector('[data-max]'); if (mx) { mx.value = mx.max; wrap.querySelector('[data-maxlbl]').textContent = 'Any price'; } wrap.querySelector('[data-q]').value = ''; wrap.querySelectorAll('[data-key]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-val') === '')); }); render(); }
    });
    render();
  }
  function seg(key, label, vals) {
    return '<div class="gh-plist__seg" role="group" aria-label="' + label + '"><button type="button" data-key="' + key + '" data-val="" aria-pressed="true">All</button>' +
      vals.map(function (v) { return '<button type="button" data-key="' + key + '" data-val="' + esc(v) + '" aria-pressed="false">' + esc(v) + '</button>'; }).join('') + '</div>';
  }
  function selectFilter(key, label, vals, fmt) {
    var steps = [2, 4, 8, 16, 24, 32, 48, 64, 128, 256, 512];
    var max = Math.max.apply(null, vals.filter(Boolean).concat([0]));
    var opts = steps.filter(function (x) { return x <= max && vals.some(function (v) { return v >= x; }) && vals.some(function (v) { return v && v < x; }); });
    if (!opts.length) return '';
    return '<label class="gh-plist__sel"><span>' + label + '</span><select data-num="' + key + '"><option value="0">Any</option>' + opts.map(function (x) { return '<option value="' + x + '">' + fmt(x) + '</option>'; }).join('') + '</select></label>';
  }
  function priceFilter(items) {
    var ps = items.map(function (i) { return i.price; }).filter(function (x) { return !isNaN(x); });
    if (ps.length < 5) return '';
    var lo = Math.floor(Math.min.apply(null, ps)), hi = Math.ceil(Math.max.apply(null, ps));
    if (hi - lo < 10) return '';
    var step = hi > 500 ? 10 : hi > 100 ? 5 : 1;
    return '<label class="gh-plist__price"><span data-maxlbl>Any price</span><input type="range" data-max min="' + lo + '" max="' + hi + '" step="' + step + '" value="' + hi + '" aria-label="Maximum monthly price"></label>';
  }
  function uniq(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- client-area home: replace the long marketing page with a focused customer hub ---------- */
  var IC = {
    cart: 'M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6.2M10 20h.01M17 20h.01',
    globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
    move: 'M7 7h11l-3-3M17 17H6l3 3',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
    chat: 'M4 5h16v11H8l-4 4z',
    book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
    pulse: 'M3 12h4l3-7 4 14 3-7h4',
    server: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01',
    cpu: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
    monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
    layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
    invoice: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6'
  };
  function homepage() {
    var path = location.pathname.replace(/\/+$/, '');
    if (!/\/secure(\/index\.php)?$/.test(path) || /[?&](rp|m)=/.test(location.search)) return;
    var hero = document.querySelector('.hero-area-header-banner-image');
    var body = document.querySelector('#not-main-body, section#main-body');
    if (!hero || !body) return;
    var loggedIn = !!document.querySelector('a[href*="logout"]');
    var nameEl = document.querySelector('.client-name, .dropdown-toggle .username, [class*="hello"]');
    var tlds = Array.prototype.slice.call(document.querySelectorAll('.domain-checker-emyui-aws-homepage *')).map(function (e) { return e.children.length ? '' : e.textContent.trim(); }).join(' ');
    var prices = []; tlds.replace(/\.\s*([a-z]{2,10})\s+(\$[0-9.]+)/gi, function (_, t, p) { if (prices.length < 6) prices.push({ t: '.' + t, p: p }); });
    var tile = function (ic, title, text, href) { return '<a class="gh-tile" href="' + href + '"><span class="gh-hex">' + svg(IC[ic]) + '</span><b>' + title + '</b><span>' + text + '</span></a>'; };
    var cats = [
      ['server', 'Web Hosting', 'NVMe hosting with free SSL', '/secure/store/hostia-shared'],
      ['layers', 'WordPress', 'Managed, fast and secure', '/secure/store/wordpress'],
      ['server', 'Cloud VPS', 'Europe & USA, ready in minutes', '/secure/store/servers'],
      ['cpu', 'Dedicated Servers', 'Bare metal up to 10Gbps', '/secure/store/dedicated-servers'],
      ['monitor', 'Windows RDP', 'Always-on remote desktop', '/secure/store/windows-rdp'],
      ['shield', 'SSL Certificates', 'DV, OV and wildcard', '/secure/store/ssl-certificates']
    ];
    hero.outerHTML =
      '<section class="gh-hub">' +
        '<div class="gh-hub__in">' +
          '<span class="gh-hub__eyebrow">' + (loggedIn ? 'Welcome back' : 'Globalhostia client area') + '</span>' +
          '<h1>' + (loggedIn ? 'What would you like to do today?' : 'Everything for your website, in one place.') + '</h1>' +
          '<p>Find a domain, order hosting or servers, pay invoices and get help from our team.</p>' +
          '<form class="gh-hub__search" action="/secure/cart.php" method="get" role="search">' +
            '<input type="hidden" name="a" value="add"><input type="hidden" name="domain" value="register">' +
            '<label class="gh-sr" for="gh-hub-q">Domain name</label>' +
            '<span class="gh-hub__ic">' + svg(IC.globe) + '</span><input id="gh-hub-q" name="query" placeholder="Find your perfect domain, e.g. yourbrand.com" autocomplete="off" required>' +
            '<button type="submit">Search</button></form>' +
          (prices.length ? '<ul class="gh-hub__tlds">' + prices.map(function (x) { return '<li><b>' + esc(x.t) + '</b> ' + esc(x.p) + '</li>'; }).join('') + '</ul>' : '') +
        '</div></section>';
    var dc = document.querySelector('.domain-checker-emyui-aws-homepage'); if (dc) dc.classList.add('gh-hidden');
    body.innerHTML =
      '<div class="gh-hub-body">' +
        '<div class="gh-tiles">' +
          (loggedIn ? tile('user', 'My services', 'Manage products and servers', '/secure/clientarea.php?action=services') + tile('invoice', 'Billing', 'Invoices and payments', '/secure/clientarea.php?action=invoices')
                    : tile('user', 'Sign in', 'Access your account', '/secure/login.php') + tile('cart', 'Create account', 'Get started in a minute', '/secure/register.php')) +
          tile('globe', 'Register a domain', 'Search hundreds of extensions', '/secure/cart.php?a=add&domain=register') +
          tile('move', 'Transfer a domain', 'Move it to us, keep your site', '/secure/cart.php?a=add&domain=transfer') +
          tile('chat', 'Open a ticket', '24/7 help from engineers', '/secure/submitticket.php') +
          tile('book', 'Knowledgebase', 'Guides and how-tos', '/secure/knowledgebase') +
        '</div>' +
        '<div class="gh-sec-head"><h2>Order new services</h2><a href="/secure/cart.php">Browse all</a></div>' +
        '<div class="gh-cats">' + cats.map(function (c) { return '<a class="gh-cat" href="' + c[3] + '"><span class="gh-hex">' + svg(IC[c[0]]) + '</span><b>' + c[1] + '</b><span>' + c[2] + '</span><i aria-hidden="true">→</i></a>'; }).join('') + '</div>' +
        '<aside class="gh-promo gh-promo--wide"><div class="gh-promo__txt"><span class="gh-promo__tag">New</span><b>Cloud VPS in Europe &amp; USA</b><span>NVMe, your choice of OS, add RAM or vCPU any time. Set up automatically after payment.</span></div><a class="gh-promo__btn" href="/secure/store/servers">See plans</a></aside>' +
        '<div class="gh-help"><div><b>Need a hand?</b><span>Our team is available 24/7 by ticket, phone and WhatsApp.</span></div><div class="gh-help__a"><a href="/secure/submitticket.php">Open a ticket</a><a href="/secure/serverstatus.php">Network status</a><a href="/secure/contact.php">Contact us</a></div></div>' +
      '</div>';
    document.documentElement.classList.add('gh-is-home');
  }

  ready(function () { try { homepage(); } catch (e) {} try { groupedNav(); } catch (e) {} try { promo(); } catch (e) {} try { catBanner(); } catch (e) {} try { enhanceListing(); } catch (e) {} });
})();
