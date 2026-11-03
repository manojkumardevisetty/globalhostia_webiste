/* Globalhostia client-area enhancements (loaded by a tiny WHMCS hook, see docs).
   1) Replaces the endless horizontal store-category scroller with 5 grouped menus (Hostpen Modern style).
   2) Adds a promo banner above store listings.
   Pure progressive enhancement: if anything fails the original page stays as it was. */
(function () {
  'use strict';
  // works both at globalhostia.com/secure/... and at my.globalhostia.com/...
  var ORIGIN = (function () { try { return new URL(document.currentScript.src).origin; } catch (e) { return 'https://globalhostia.com'; } })();
  var B = /^\/secure(\/|$)/.test(location.pathname) ? '/secure' : '';
  function ready(f) { if (document.readyState !== 'loading') f(); else document.addEventListener('DOMContentLoaded', f); }

  var GROUPS = [
    { label: 'Hosting', icon: 'M3 5h18v6H3zM3 13h18v6H3zM7 8h.01M7 16h.01', match: /website|wordpress|shared|hosting/i, prio: 5 },
    { label: 'VPS & Cloud', icon: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01', match: /vps|virtual|^servers$|cloud|\bai\b|llm|forex/i, prio: 4 },
    { label: 'Dedicated', icon: 'M5 3h14v18H5zM9 7h6M9 11h6M9 15h6', match: /dedicated/i, prio: 1 },
    { label: 'Remote Desktop', icon: 'M3 4h18v12H3zM8 20h8M12 16v4', match: /\brdp\b|remote/i, prio: 2 },
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
      '<a class="gh-promo__btn" href="' + B + '/store/servers">Explore servers</a>';
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
    var info = CAT_INFO[m[1]];
    if (!info) { // a category without curated copy: use its name and description from the catalog
      storeLinks().then(function (d) {
        var c = (d.categories || []).filter(function (x) { return x.slug === m[1]; })[0];
        if (c && c.desc) { CAT_INFO[m[1]] = [c.name, c.desc, IC_FOR[c.icon] || 'server']; catBanner(); }
      });
      return;
    }
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
    if (!/^(\/secure)?(\/index\.php)?$/.test(path) || /[?&](rp|m)=/.test(location.search)) return;
    var hero = document.querySelector('.hero-area-header-banner-image');
    var body = document.querySelector('#not-main-body, section#main-body');
    if (!hero || !body) return;
    var loggedIn = !!document.querySelector('a[href*="logout"]');
    var nameEl = document.querySelector('.client-name, .dropdown-toggle .username, [class*="hello"]');
    var tlds = Array.prototype.slice.call(document.querySelectorAll('.domain-checker-emyui-aws-homepage *')).map(function (e) { return e.children.length ? '' : e.textContent.trim(); }).join(' ');
    var prices = []; tlds.replace(/\.\s*([a-z]{2,10})\s+(\$[0-9.]+)/gi, function (_, t, p) { if (prices.length < 6) prices.push({ t: '.' + t, p: p }); });
    var tile = function (ic, title, text, href) { return '<a class="gh-tile" href="' + href + '"><span class="gh-hex">' + svg(IC[ic]) + '</span><b>' + title + '</b><span>' + text + '</span></a>'; };
    var cats = [
      ['server', 'Web Hosting', 'NVMe hosting with free SSL', B + '/store/hostia-shared'],
      ['layers', 'WordPress', 'Managed, fast and secure', B + '/store/wordpress'],
      ['server', 'Cloud VPS', 'Europe & USA, ready in minutes', B + '/store/servers'],
      ['cpu', 'Dedicated Servers', 'Bare metal up to 10Gbps', B + '/store/dedicated-servers'],
      ['monitor', 'Windows RDP', 'Always-on remote desktop', B + '/store/windows-rdp'],
      ['shield', 'SSL Certificates', 'DV, OV and wildcard', B + '/store/ssl-certificates']
    ];
    hero.outerHTML =
      '<section class="gh-hub">' +
        '<div class="gh-hub__in">' +
          '<span class="gh-hub__eyebrow">' + (loggedIn ? 'Welcome back' : 'Globalhostia client area') + '</span>' +
          '<h1>' + (loggedIn ? 'What would you like to do today?' : 'Everything for your website, in one place.') + '</h1>' +
          '<p>Find a domain, order hosting or servers, pay invoices and get help from our team.</p>' +
          '<form class="gh-hub__search" action="' + B + '/cart.php" method="get" role="search">' +
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
          (loggedIn ? tile('user', 'My services', 'Manage products and servers', B + '/clientarea.php?action=services') + tile('invoice', 'Billing', 'Invoices and payments', B + '/clientarea.php?action=invoices')
                    : tile('user', 'Sign in', 'Access your account', B + '/login.php') + tile('cart', 'Create account', 'Get started in a minute', B + '/register.php')) +
          tile('globe', 'Register a domain', 'Search hundreds of extensions', B + '/cart.php?a=add&domain=register') +
          tile('move', 'Transfer a domain', 'Move it to us, keep your site', B + '/cart.php?a=add&domain=transfer') +
          tile('chat', 'Open a ticket', '24/7 help from engineers', B + '/submitticket.php') +
          tile('book', 'Knowledgebase', 'Guides and how-tos', B + '/knowledgebase') +
        '</div>' +
        '<div class="gh-sec-head"><h2>Order new services</h2><a href="' + B + '/cart.php">Browse all</a></div>' +
        '<div class="gh-cats">' + cats.map(function (c) { return '<a class="gh-cat" href="' + c[3] + '"><span class="gh-hex">' + svg(IC[c[0]]) + '</span><b>' + c[1] + '</b><span>' + c[2] + '</span><i aria-hidden="true">→</i></a>'; }).join('') + '</div>' +
        '<aside class="gh-promo gh-promo--wide"><div class="gh-promo__txt"><span class="gh-promo__tag">New</span><b>Cloud VPS in Europe &amp; USA</b><span>NVMe, your choice of OS, add RAM or vCPU any time. Set up automatically after payment.</span></div><a class="gh-promo__btn" href="' + B + '/store/servers">See plans</a></aside>' +
        '<div class="gh-help"><div><b>Need a hand?</b><span>Our team is available 24/7 by ticket, phone and WhatsApp.</span></div><div class="gh-help__a"><a href="' + B + '/submitticket.php">Open a ticket</a><a href="' + B + '/serverstatus.php">Network status</a><a href="' + B + '/contact.php">Contact us</a></div></div>' +
      '</div>';
    document.documentElement.classList.add('gh-is-home');
    // order tiles follow the catalog: categories with products, in admin order (the list above is the offline fallback)
    storeLinks().then(function (d) {
      var list = (d.categories || []).slice(0, 6), box = document.querySelector('.gh-cats');
      if (!box || list.length < 3) return;
      box.innerHTML = list.map(function (c) { return '<a class="gh-cat" href="' + B + '/store/' + encodeURIComponent(c.slug) + '"><span class="gh-hex">' + svg(IC[IC_FOR[c.icon]] || IC.server) + '</span><b>' + esc(c.name) + '</b><span>' + esc(c.desc ? c.desc.split(/[.:;]/)[0].slice(0, 48) : c.products + ' plan' + (c.products === 1 ? '' : 's')) + '</span><i aria-hidden="true">→</i></a>'; }).join('');
    });
  }

  /* ---------- order flow ---------- */
  function domainStep() {
    var f = document.getElementById('frmProductDomain'); if (!f) return;
    document.documentElement.classList.add('gh-domstep');
    var h = document.querySelector('.emyui-cart-aws h1'); if (h && /requires a domain/i.test(h.textContent)) h.textContent = 'Pick a domain for your plan';
    var sub = h && h.parentElement.querySelector('p'); if (sub) sub.textContent = 'Register a new name, transfer one you own, or simply point a domain you already have to us.';
    var pre = h && h.parentElement.querySelector('.pre-title, span'); if (pre && /choose a domain/i.test(pre.textContent)) pre.textContent = 'Step 1 · Domain';
    var L = { selregister: ['Register a new domain', 'Search and buy a new name'], seltransfer: ['Transfer a domain', 'Move a domain you own to us'], selowndomain: ['I already have a domain', 'Keep it where it is, update nameservers'] };
    Object.keys(L).forEach(function (id) {
      var r = document.getElementById(id); if (!r) return;
      var card = r.closest('.domain-productconfigiration-options-item'); if (!card) return;
      var t = card.querySelector('.title'), st = card.querySelector('.sub-title');
      if (t) t.textContent = L[id][0]; if (st) st.textContent = L[id][1];
    });
    var sync = function () { f.querySelectorAll('.domain-productconfigiration-options-item').forEach(function (c) { var i = c.querySelector('input[type=radio]'); c.classList.toggle('gh-on', !!(i && i.checked)); }); };
    sync(); f.addEventListener('click', function () { setTimeout(sync, 30); });
    if (window.jQuery) jQuery(f).on('ifChecked change', 'input[type=radio]', sync);
  }

  var MONTHS = { monthly: 1, quarterly: 3, semiannually: 6, annually: 12, biennially: 24, triennially: 36 };
  var CYCLE_NAME = { monthly: 'Monthly', quarterly: '3 months', semiannually: '6 months', annually: '1 year', biennially: '2 years', triennially: '3 years' };
  function cycles(spec) {
    var sel = document.getElementById('inputBillingcycle'); if (!sel || sel.dataset.gh) return;
    sel.dataset.gh = 1;
    var opts = [].slice.call(sel.options); if (opts.length < 2) return;
    var hdr = document.querySelector('.site-header, header'); var hm = hdr && hdr.textContent.match(/\b(USD|AED|INR|GBP|EUR|SAR|CAD|AUD|SGD|MYR)\b/);
    var cur = ((opts[0].text.match(/\b(USD|AED|INR|GBP|EUR|SAR|CAD|AUD|SGD|MYR)\b/) || [])[1]) || (hm && hm[1]) || 'USD';
    var tbl = spec && spec.prices && spec.prices[cur];
    var SYM = { USD: '$', EUR: '€', GBP: '£', INR: '₹' };
    var fmt = function (n) { return SYM[cur] ? SYM[cur] + n.toFixed(2) : cur + ' ' + n.toFixed(2); };
    var parse = function (o) { var m = o.text.match(/^(.*?)\s*-\s*(.+)$/); return { k: o.value, label: CYCLE_NAME[o.value] || (m ? m[1].replace(/\s*Price$/i, '') : o.text), raw: m ? m[2] : '' }; };
    var list = opts.map(parse), mon = tbl && tbl.monthly;
    var host = sel.closest('.form-group') || sel.parentElement;
    var wrap = document.createElement('div'); wrap.className = 'gh-cycles'; wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', 'Billing cycle');
    var bestSave = 0, cards = list.map(function (o) {
      var total = tbl && tbl[o.k], m = MONTHS[o.k] || 0, save = (total && mon && m > 1) ? Math.round((1 - total / (mon * m)) * 100) : 0;
      if (save > bestSave) bestSave = save;
      return { o: o, total: total, m: m, save: save };
    });
    wrap.innerHTML = cards.map(function (c) {
      var body = c.total != null && c.m
        ? '<span>' + esc(fmt(c.total / c.m)) + '<small>/mo</small></span><i>' + (c.m > 1 ? 'Billed ' + esc(fmt(c.total)) + ' every ' + esc(c.o.label) : 'Billed monthly, cancel any time') + '</i>'
        : '<span>' + esc(c.o.raw) + '</span>';
      return '<button type="button" class="gh-cycle" data-k="' + esc(c.o.k) + '" aria-pressed="' + (sel.value === c.o.k) + '"><b>' + esc(c.o.label) + '</b>' + body + (c.save >= 3 ? '<em' + (c.save === bestSave ? ' class="is-best"' : '') + '>Save ' + c.save + '%</em>' : '') + '</button>';
    }).join('');
    var head = document.createElement('div'); head.className = 'gh-cfg-label'; head.innerHTML = '<b>Choose your billing period</b>' + (bestSave ? '<span>Save up to ' + bestSave + '% with a longer term</span>' : '');
    var lbl = host.querySelector('label'); if (lbl) lbl.style.display = 'none';
    host.insertBefore(wrap, host.firstChild); host.insertBefore(head, wrap);
    var nice = host.querySelector('.nice-select'); if (nice) nice.style.display = 'none';
    sel.classList.add('gh-cycle-src');
    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('.gh-cycle'); if (!b) return;
      sel.value = b.dataset.k;
      wrap.querySelectorAll('.gh-cycle').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      if (window.jQuery) jQuery(sel).trigger('change'); else sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function configure() {
    var form = document.getElementById('frmConfigureProduct'); if (!form) return;
    var t = form.querySelector('.product-title'), name = t ? t.textContent.trim() : '';
    fetch(ORIGIN + '/api/store/specs?h=' + Math.floor(Date.now() / 6e5)).then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (all) {
      var spec = null; for (var k in all) if (all[k].name && all[k].name.toLowerCase() === name.toLowerCase()) { spec = all[k]; break; }
      try { cycles(spec); } catch (e) {}
      var info = form.querySelector('.product-info'); if (!info || info.dataset.gh) return; info.dataset.gh = 1;
      var meta = [spec && spec.location && ('Hosted in ' + spec.location), spec && spec.tier].filter(Boolean);
      var top = document.createElement('div'); top.className = 'gh-cfg-top';
      top.innerHTML = (meta.length ? '<div class="gh-cfg-meta">' + meta.map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('') + '</div>' : '') +
        (spec && spec.tagline ? '<p class="gh-cfg-tag">' + esc(spec.tagline) + '</p>' : '');
      if (t) t.after(top);
      var have = (info.textContent || '').toLowerCase(); var specCount = info.querySelectorAll('.list-info, li').length; var feats = specCount >= 3 ? [] : (spec && spec.allFeatures || []).filter(function (f) { return f.length > 3 && have.indexOf(f.toLowerCase()) < 0; });
      if (feats.length) {
        var d = document.createElement('div'); d.className = 'gh-cfg-feats';
        d.innerHTML = '<b>Everything included</b><ul>' + feats.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>';
        info.appendChild(d);
      }
      var trust = document.createElement('ul'); trust.className = 'gh-cfg-trust';
      trust.innerHTML = '<li>Set up automatically after payment</li><li>24/7 support by ticket and WhatsApp</li><li>Upgrade or add resources any time</li>';
      info.appendChild(trust);
    });
  }

  function cartView() {
    if (!/cart\.php/.test(location.pathname) || !/a=view/.test(location.search) || document.getElementById('frmCheckout')) return;
    var f = document.getElementById('frmEstimateTaxes') || (document.querySelector('#inputState, select[name=country]') || {}).form;
    if (f && f.id !== 'frmCheckout' && !f.closest('details')) {
      var box = f.closest('.estimate-taxes, .bg-default-2, .card, .panel') || f, d = document.createElement('details'); d.className = 'gh-taxes';
      d.innerHTML = '<summary>Estimate taxes</summary>'; box.parentNode.insertBefore(d, box); d.appendChild(box);
      var t = box.querySelector('h1,h2,h3,h4,.title'); if (t && /estimate taxes/i.test(t.textContent)) t.style.display = 'none';
    }
  }

  function checkout() {
    var form = document.getElementById('frmCheckout'); if (!form || form.dataset.gh || !/cart\.php/.test(location.pathname) || !/a=checkout/.test(location.search)) return; form.dataset.gh = 1;
    var grid = document.createElement('div'); grid.className = 'gh-co';
    var aside = document.createElement('aside'); aside.className = 'gh-co__aside'; aside.innerHTML = '<div class="gh-co__card"><h3>Your order</h3><div class="gh-co__sum">Loading summary…</div><ul class="gh-co__trust"><li>Secure, encrypted checkout</li><li>Set up automatically after payment</li><li>24/7 support by ticket and WhatsApp</li></ul></div>';
    form.parentNode.insertBefore(grid, form); grid.appendChild(form); grid.appendChild(aside);
    fetch(B + '/cart.php?a=view', { credentials: 'same-origin' }).then(function (r) { return r.text(); }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html'), sum = doc.getElementById('orderSummary'), items = [];
      doc.querySelectorAll('.view-cart-items .item, .secondary-cart-body .item').forEach(function (it) {
        var n = it.querySelector('.item-title, .item-group, strong, h3, h4'); var dmn = it.querySelector('.item-domain'); var p = it.querySelector('.item-price span, .item-price, .price');
        if (n) items.push('<li><b>' + esc(n.textContent.trim()) + '</b>' + (dmn ? '<span>' + esc(dmn.textContent.trim()) + '</span>' : '') + (p ? '<i>' + esc(p.textContent.trim().split('\n')[0]) + '</i>' : '') + '</li>');
      });
      var box = aside.querySelector('.gh-co__sum');
      if (sum) { sum.querySelectorAll('script, .btn, a.btn, #checkout, form').forEach(function (x) { x.remove(); }); var hh = sum.querySelector('h2, .summary-header'); if (hh) hh.remove(); box.innerHTML = (items.length ? '<ul class="gh-co__items">' + items.join('') + '</ul>' : '') + sum.innerHTML; }
      else box.textContent = '';
    }).catch(function () { aside.querySelector('.gh-co__sum').textContent = ''; });
  }

  function storeMega() {
    var li = document.getElementById('Primary_Navbar-Store'); if (!li) return;
    var ul = li.querySelector('ul.dropdown-menu'); if (!ul || ul.dataset.gh) return; ul.dataset.gh = 1;
    var links = [].slice.call(ul.querySelectorAll('a.dropdown-item')).map(function (a) { return { t: a.textContent.trim(), h: a.getAttribute('href') }; });
    var all = links.filter(function (l) { return /browse/i.test(l.t); })[0];
    var cols = [
      { label: 'Hosting', d: 'Websites, WordPress & AI', icon: GROUPS[0].icon, m: /website|wordpress|shared|hosting/i },
      { label: 'VPS & Cloud', d: 'Root access, NVMe, any OS', icon: GROUPS[1].icon, m: /vps|virtual|^servers$|cloud|forex/i },
      { label: 'Dedicated & RDP', d: 'Bare metal and remote desktops', icon: GROUPS[2].icon, m: /dedicated|\brdp\b|remote/i },
      { label: 'Security & Apps', d: 'SSL, MCPs and tools', icon: GROUPS[4].icon, m: /ssl|mcp|project|management|n8n|email|workspace/i },
      { label: 'Domains', d: 'Register or transfer', icon: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18', m: /domain/i }
    ];
    cols.forEach(function (c) { c.items = []; });
    var order = [4, 2, 3, 1, 0];
    links.forEach(function (l) { if (l === all) return; for (var i = 0; i < order.length; i++) { var c = cols[order[i]]; if (c.m.test(l.t)) { c.items.push(l); return; } } cols[3].items.push(l); });
    var nice = function (t) { return RENAME[t] || t.replace(/^Ai\/llm/i, 'AI / LLM').replace(/^AI\/LLM/, 'AI / LLM'); };
    ul.classList.add('gh-mega');
    ul.innerHTML = '<li class="gh-mega__in"><div class="gh-mega__cols">' + cols.filter(function (c) { return c.items.length; }).map(function (c) {
      return '<div class="gh-mega__col"><div class="gh-mega__head"><span class="gh-hex">' + svg(c.icon) + '</span><div><b>' + c.label + '</b><small>' + c.d + '</small></div></div><ul>' +
        c.items.map(function (l) { return '<li><a href="' + esc(l.h) + '">' + esc(nice(l.t)) + '</a></li>'; }).join('') + '</ul></div>';
    }).join('') + '</div><div class="gh-mega__foot"><span>Not sure what you need? Our engineers help you choose, 24/7.</span>' +
      (all ? '<a class="gh-mega__all" href="' + esc(all.h) + '">Browse all products →</a>' : '') + '</div></li>';
  }

  function compare() {
    if (!document.querySelector('#DomainSearchResults, #spotlightTlds, .domain-suggestion')) return;
    var pageCur = ((document.body.innerText.match(/\b(USD|AED|INR|GBP|EUR|SAR|CAD|AUD|SGD|MYR)\b/) || [])[1]) || 'USD';
    var curSel = document.querySelector('.currency-selector, [class*="currency"]'); if (curSel) { var mm = curSel.textContent.match(/\b([A-Z]{3})\b/); if (mm) pageCur = mm[1]; }
    fetch(ORIGIN + '/api/store/tlds?currency=' + pageCur).then(function (r) { return r.json(); }).then(function (d) {
      var items = d.items || {};
      var cc = d.currency || 'USD', sym = { USD: '$', EUR: '€', GBP: '£', INR: '₹' }[cc]; var fmt = function (n) { return sym ? sym + n.toFixed(2) : cc + ' ' + n.toFixed(2); };
      var badge = function (tld) {
        var it = items[tld]; if (!it || !it.ref || !it.renew) return '';
        var save = Math.round((1 - it.renew / it.ref.renew) * 100);
        if (save < 5) return '<span class="gh-cmp gh-cmp--plain">Renews ' + fmt(it.renew) + '/yr</span>';
        return '<span class="gh-cmp" title="Typical renewal price at major registrars, checked ' + esc(d.compareChecked) + '">Renews ' + fmt(it.renew) + '/yr <s>Others ' + fmt(it.ref.renew) + '</s> <b>Save ' + save + '%</b></span>';
      };
      var run = function () {
        document.querySelectorAll('.domain-suggestion').forEach(function (row) {
          if (row.dataset.ghc) return; var ext = row.querySelector('.extension'); if (!ext || !ext.textContent.trim()) return;
          row.dataset.ghc = 1; var b = badge(ext.textContent.trim().toLowerCase()); if (b) { var dm = document.createElement('span'); dm.className = 'gh-cmp-wrap'; dm.innerHTML = b; ext.after(dm); }
        });
        document.querySelectorAll('.spotlight-tld').forEach(function (c) {
          if (c.dataset.ghc) return; var n = c.querySelector('.spotlight-tld-name'); if (!n) return;
          c.dataset.ghc = 1; var b = badge(n.textContent.trim().toLowerCase()); if (b) c.insertAdjacentHTML('beforeend', b.replace('gh-cmp', 'gh-cmp gh-cmp--card'));
        });
      };
      run(); new MutationObserver(function () { clearTimeout(run.t); run.t = setTimeout(run, 150); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    }).catch(function () {});
  }

  function suggestPager() {
    var TOP = ['.com', '.ae', '.net', '.co', '.io', '.ai', '.org', '.online', '.store', '.shop', '.tech', '.app', '.dev', '.cloud', '.site', '.xyz', '.info', '.biz', '.in', '.uk', '.co.uk', '.us', '.eu', '.de', '.live'];
    var STEP = 8;
    var run = function () {
      var box = document.getElementById('domainSuggestions'); if (!box) return;
      var rows = [].slice.call(box.querySelectorAll('.domain-suggestion.clone')).filter(function (r) { return r.querySelector('.extension') && r.querySelector('.extension').textContent.trim(); });
      if (!rows.length) return;
      rows.forEach(function (r) { if (!/block/.test(r.style.display)) r.style.display = 'block'; });
      // drop duplicates: same full domain twice, the searched domain itself, and exact-name TLDs already shown as cards above
      var seen = {}, spot = {}, pq = ((document.querySelector('#primaryIndividualResult [data-domain], #primaryLookupResult [data-domain]') || { getAttribute: function () { return ''; } }).getAttribute('data-domain') || '').toLowerCase();
      document.querySelectorAll('.spotlight-tld-name').forEach(function (n) { spot[n.textContent.trim().toLowerCase()] = 1; });
      var qn = pq.split('.')[0];
      rows = rows.filter(function (r) {
        var d = ((r.querySelector('.domain') || {}).textContent || '').trim().toLowerCase(), e = r.querySelector('.extension').textContent.trim().toLowerCase(), full = d + e;
        var dup = seen[full] || full === pq || (d === qn && spot[e]);
        seen[full] = 1; r.classList.toggle('gh-dup', !!dup); return !dup;
      });
      if (!rows.length) return;
      var sig = rows.length + ':' + (box.dataset.ghshow || STEP); if (box.dataset.ghsig === sig) return; box.dataset.ghsig = sig;
      var q = ((document.querySelector('#primaryIndividualResult [data-domain], #primaryLookupResult [data-domain]') || {}).getAttribute ? document.querySelector('#primaryIndividualResult [data-domain], #primaryLookupResult [data-domain]').getAttribute('data-domain') : '').split('.')[0].toLowerCase();
      var rank = function (r) { var t = r.querySelector('.extension').textContent.trim().toLowerCase(), i = TOP.indexOf(t), d = (r.querySelector('.domain') || {}).textContent; return (i < 0 ? 100 : i) + (q && d && d.trim().toLowerCase() !== q ? 200 : 0); };
      var parent = rows[0].parentNode;
      rows.sort(function (a, b) { return rank(a) - rank(b); }).forEach(function (r) { parent.appendChild(r); });
      var shown = +(box.dataset.ghshow || STEP);
      rows.forEach(function (r, i) { r.classList.toggle('gh-more-hide', i >= shown); r.classList.toggle('gh-rec', i === 0); });
      var first = rows[0];
      if (first && !first.querySelector('.gh-rec-tag')) { box.querySelectorAll('.gh-rec-tag').forEach(function (x) { x.remove(); }); first.insertAdjacentHTML('afterbegin', '<span class="gh-rec-tag">Recommended</span>'); }
      var native = document.querySelector('#btnMoreSuggestions, .more-suggestions, [id*="MoreSuggestions"]');
      if (native) native.classList.add('gh-hidden');
      var btn = box.parentNode.querySelector('.gh-more');
      if (!btn) { btn = document.createElement('button'); btn.type = 'button'; btn.className = 'gh-more'; box.after(btn);
        btn.addEventListener('click', function () {
          box.dataset.ghshow = (+(box.dataset.ghshow || STEP)) + STEP;
          box.dataset.ghsig = ''; setTimeout(run, 60);
        }); }
      var left = rows.length - shown;
      btn.hidden = left <= 0;
      btn.textContent = 'Show ' + Math.min(STEP, left) + ' more extensions (' + left + ' left)';
    };
    new MutationObserver(function () { clearTimeout(run.t); run.t = setTimeout(run, 120); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  }

  function domainPage() {
    var hero = document.querySelector('.domain-registiration-hero'); if (!hero) return;
    var h = hero.querySelector('h1'); if (h && /find your new domain/i.test(h.textContent)) { h.textContent = 'Find the perfect domain'; var p = h.parentElement.querySelector('p'); if (p) p.textContent = 'Search any name and we show what is free, across 300+ extensions, with honest renewal prices.'; }
    if (h && /transfer/i.test(h.textContent) && h.textContent.length > 60) { h.textContent = 'Transfer your domain to us'; }
    document.querySelectorAll('h1,h2,h3').forEach(function (x) { if (/generating suggestions for you/i.test(x.textContent)) x.textContent = 'More extensions for your name'; });
    var fill = function () {
      var r = document.getElementById('primaryIndividualResult'); if (!r || r.dataset.gh) return;
      var b = r.querySelector('[data-domain]'); if (!b) return;
      var avail = r.classList.contains('domain-available');
      var p = r.querySelector('p'); if (p && /click on the link below/i.test(p.textContent)) p.style.display = 'none';
      var hd = document.createElement('div'); hd.className = 'gh-avail'; hd.innerHTML = esc(b.getAttribute('data-domain')) + (avail ? '<small>Available — register it before someone else does</small>' : '');
      r.insertBefore(hd, r.firstChild); r.dataset.gh = 1;
    };
    new MutationObserver(function () { clearTimeout(fill.t); fill.t = setTimeout(fill, 120); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  }

  function promos() {
    if (document.querySelector('script[src*="/hp/promo.js"]')) return;
    var sc = document.createElement('script'); sc.src = ORIGIN + '/hp/promo.js'; sc.defer = true; sc.setAttribute('data-surface', 'clientarea'); document.body.appendChild(sc);
  }
  function blogHub() {
    var body = document.querySelector('.gh-hub-body'); if (!body) return;
    fetch(ORIGIN + '/api/blog/latest?limit=3').then(function (r) { return r.json(); }).then(function (posts) {
      if (!posts || !posts.length) return;
      var html = '<div class="gh-sec-head"><h2>From our blog</h2><a href="' + ORIGIN + '/blog">All articles</a></div><div class="gh-blog">' + posts.map(function (p) {
        return '<a class="gh-post" href="' + esc(p.url) + '">' + (p.coverImage ? '<img src="' + esc(p.coverImage) + '" alt="" loading="lazy">' : '') + '<div><span>' + esc(p.category || 'Guide') + ' · ' + (p.readingMinutes || 3) + ' min read</span><b>' + esc(p.title) + '</b><p>' + esc(p.excerpt || '') + '</p></div></a>';
      }).join('') + '</div>';
      var help = body.querySelector('.gh-help'); var box = document.createElement('section'); box.innerHTML = html;
      body.insertBefore(box, help || null);
    }).catch(function () {});
  }

  function whatsapp() {
    if (document.querySelector('.gh-wa')) return;
    var a = document.createElement('a'); a.className = 'gh-wa'; a.target = '_blank'; a.rel = 'noopener';
    a.href = 'https://wa.me/971507341578?text=' + encodeURIComponent('Hi Globalhostia, I need help with: ' + document.title);
    a.setAttribute('aria-label', 'Chat with us on WhatsApp');
    a.innerHTML = '<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3zm0 23.6c-2 0-4-.6-5.7-1.6l-.4-.2-3.9 1 1-3.8-.3-.4A10.6 10.6 0 1 1 16 26.6zm5.8-7.9c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7.1a8.7 8.7 0 0 1-4.3-3.8c-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.5l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.6 3.6 0 0 0-1.1 2.7 6.3 6.3 0 0 0 1.3 3.3 14.3 14.3 0 0 0 5.5 4.8c2 .9 2.8.9 3.8.8a3.3 3.3 0 0 0 2.1-1.5 2.7 2.7 0 0 0 .2-1.5c-.1-.2-.3-.3-.6-.4z"/></svg><span>WhatsApp</span>';
    document.body.appendChild(a);
  }

  function clientFixes() {
    // domains table: the template labels the auto-renew column "Next Due Date" twice
    var dt = document.getElementById('tableDomainsList');
    if (dt) { var ths = dt.querySelectorAll('thead th'), seen = 0; ths.forEach(function (th) { if (/next due date/i.test(th.textContent)) { seen++; if (seen === 2) th.textContent = 'Auto renew'; } }); }
    // friendly empty states
    document.querySelectorAll('.dataTables_empty').forEach(function (td) {
      if (td.dataset.gh) return; td.dataset.gh = 1;
      var tickets = /supporttickets/.test(location.pathname);
      var services = /action=services/.test(location.search), domains = /action=domains/.test(location.search), inv = /action=invoices/.test(location.search);
      var cta = tickets ? ['Open a ticket', B + '/submitticket.php', 'No tickets yet. Our engineers reply 24/7 by ticket and WhatsApp.']
        : services ? ['Browse plans', B + '/cart.php', 'You have no services yet.']
        : domains ? ['Find a domain', B + '/cart.php?a=add&domain=register', 'You have no domains yet.']
        : inv ? ['', '', 'No invoices here.'] : null;
      if (cta) td.innerHTML = '<div class="gh-empty"><b>' + esc(cta[2]) + '</b>' + (cta[0] ? '<a class="btn btn-primary" href="' + cta[1] + '">' + esc(cta[0]) + '</a>' : '') + '</div>';
    });
  }

  function connectLinks() {
    var SITE = 'https://globalhostia.com';
    var path = location.pathname, q = location.search;
    var loggedIn = !!document.querySelector('a[href*="logout"]');
    // standalone sign-in page → the new account portal (the cart's own "Already registered?" login stays)
    if (!loggedIn && /^(\/secure)?\/(login(\.php)?|clientarea\.php)$/.test(path) && !/cart/.test(document.referrer || '') && !/[?&](goto|redirect)=/.test(q)) {
      location.replace(SITE + '/account/login'); return;
    }
    var MAP = [
      [/clientarea\.php$/, '', SITE + '/account'],
      [/clientarea\.php$/, 'action=services', SITE + '/account/services'],
      [/clientarea\.php$/, 'action=domains', SITE + '/account/domains'],
      [/clientarea\.php$/, 'action=invoices', SITE + '/account/invoices'],
      [/supporttickets\.php$/, '', SITE + '/account/support'],
      [/clientarea\.php$/, 'action=details', SITE + '/account/profile'],
    ];
    document.querySelectorAll('header a[href], .site-header a[href], .footer-emyui-aws a[href]').forEach(function (a) {
      var h = a.getAttribute('href') || ''; if (!h || h.charAt(0) === '#' || /^javascript/i.test(h)) return;
      var u; try { u = new URL(h, location.href); } catch (e) { return; }
      if (u.host !== location.host) return;
      var txt = a.textContent.trim().toLowerCase();
      if (/^(\/secure)?\/(index\.php)?$/.test(u.pathname) && (txt === 'home' || a.closest('.brand-logo, .site-brand, .navbar-brand, [class*="logo"]'))) { a.href = loggedIn ? SITE + '/account' : SITE + '/'; return; }
      if (/contact\.php$/.test(u.pathname)) { a.href = SITE + '/contact'; return; }
      if (/(\/login(\.php)?)$/.test(u.pathname)) { a.href = SITE + '/account/login'; return; }
      for (var i = 0; i < MAP.length; i++) {
        var m = MAP[i]; if (m[0].test(u.pathname) && (u.search.replace(/^\?/, '') === m[1])) { a.href = m[2]; return; }
      }
    });
    // logged-in WHMCS dashboard → the new dashboard
    if (loggedIn && /clientarea\.php$/.test(path) && !q) {
      var bar = document.createElement('div'); bar.className = 'gh-newportal';
      bar.innerHTML = '<span>Your account has a new home.</span><a href="' + SITE + '/account">Open the new dashboard →</a>';
      document.body.insertBefore(bar, document.body.firstChild);
    }
  }

  /* live store data (offers + categories) from the catalog, fetched once per page */
  var linksP;
  function storeLinks() {
    if (!linksP) linksP = fetch(ORIGIN + '/api/store/links?h=' + Math.floor(Date.now() / 6e5)).then(function (r) { return r.json(); }).catch(function () { return { offers: {}, categories: [] }; });
    return linksP;
  }
  var IC_FOR = { globe: 'globe', wp: 'layers', users: 'user', server: 'server', cpu: 'cpu', monitor: 'monitor', chart: 'pulse', flow: 'layers', spark: 'cpu', lock: 'shield', mail: 'chat', at: 'globe', grid: 'invoice', box: 'layers' };

  function cartOffers() {
    if (!/cart\.php/.test(location.pathname) || !/a=view/.test(location.search)) return;
    var items = [].slice.call(document.querySelectorAll('.secondary-cart-body .item, .view-cart-items .item, .emyui-cart-aws .row'));
    var text = (document.querySelector('.secondary-cart-body') || document.body).innerText.toLowerCase();
    var hdr = document.querySelector('.site-header, header'); var hm = hdr && hdr.textContent.match(/\b(USD|AED|INR|GBP|EUR|SAR|CAD|AUD|SGD|MYR)\b/); var cur = hm ? hm[1] : 'USD';
    var SYM = { USD: '$', EUR: '€', GBP: '£', INR: '₹' }; var fmt = function (n) { return SYM[cur] ? SYM[cur] + n.toFixed(2) : cur + ' ' + n.toFixed(2); };
    var hasHosting = /hostia|hosting|wordpress|vps|server|rdp/.test(text), hasDomain = /domain registration|domain transfer/.test(text), hasSsl = /ssl/.test(text);
    // offers come from the catalog (Admin → Site links → cart offers, else the cheapest SSL / hosting plan): no pids here
    storeLinks().then(function (d) {
      var pick = function (p) { return p && p.pid && p.prices && p.prices[cur] ? p : null; };
      var price = function (p) { var t = p.prices[cur]; return t.monthly != null ? fmt(t.monthly) + '/mo' : t.annually != null ? fmt(t.annually) + '/yr' : ''; };
      var offers = [];
      var ssl = pick(d.offers && d.offers.ssl);
      if (hasHosting && !hasSsl && ssl) offers.push({ t: 'Add a trusted SSL certificate', d: 'Green padlock and the business trust boost for checkout pages.', p: price(ssl), h: B + '/cart.php?a=add&pid=' + ssl.pid, tag: 'Security' });
      var lite = pick(d.offers && d.offers.hosting);
      if (hasDomain && !hasHosting && lite) offers.push({ t: 'Add website hosting', d: 'Put your new domain online today: NVMe hosting, free SSL and email included.', p: price(lite), h: B + '/cart.php?a=add&pid=' + lite.pid, tag: 'Bundle' });
      if (hasHosting && !hasDomain) offers.push({ t: 'Add a matching domain', d: 'Register your name alongside the plan, we connect everything automatically.', p: '', h: B + '/cart.php?a=add&domain=register', tag: 'Bundle' });
      if (/monthly/.test(text)) offers.push({ t: 'Switch to yearly and save', d: 'Longer terms cost less per month and lock your price. Edit the item and pick 1, 2 or 3 years.', p: '', h: '', tag: 'Save', edit: true });
      if (!offers.length) return;
      var box = document.createElement('section'); box.className = 'gh-offers';
      box.innerHTML = '<h3>Complete your setup</h3><div class="gh-offers__grid">' + offers.map(function (o) {
        return '<div class="gh-offer"><span class="gh-offer__tag">' + esc(o.tag) + '</span><b>' + esc(o.t) + '</b><p>' + esc(o.d) + '</p><div class="gh-offer__foot">' + (o.p ? '<span>' + esc(o.p) + '</span>' : '<span></span>') +
          (o.edit ? '<a class="gh-offer__btn" href="#" data-edit>Edit billing</a>' : '<a class="gh-offer__btn" href="' + esc(o.h) + '">Add' + (o.p ? ' for ' + esc(o.p) : '') + '</a>') + '</div></div>';
      }).join('') + '</div>';
      var anchor = document.querySelector('.secondary-cart-body .empty-cart, #btnEmptyCart, .secondary-cart-body > .row:last-child') || document.querySelector('.secondary-cart-body');
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor.nextSibling);
      var ed = box.querySelector('[data-edit]'); if (ed) ed.addEventListener('click', function (e) { e.preventDefault(); var a = document.querySelector('a[href*="a=confproduct"]'); if (a) location.href = a.href; });
    }).catch(function () {});
  }

  function cartIcons() {
    document.querySelectorAll('.item-in-cart').forEach(function (it) {
      var t = (it.textContent || '').toLowerCase();
      it.classList.toggle('gh-item-domain', /domain (registration|transfer|renewal)/.test(t));
      it.classList.toggle('gh-item-ssl', /ssl/.test(t));
    });
  }

  function brokerCta() {
    var SYM = { USD: '$', EUR: '€', GBP: '£', INR: '₹', AED: 'AED ', SAR: 'SAR ', CAD: 'C$', AUD: 'A$', SGD: 'S$', MYR: 'RM ' };
    var pageCur = function () { var m = document.body.innerText.match(/\d[\d,.]*\s(USD|AED|EUR|GBP|INR|SAR|CAD|AUD|SGD|MYR)\b/); return m ? m[1] : 'USD'; };
    var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var fee = null;
    var loadFee = function (cb) { if (fee) return cb(fee); fetch(ORIGIN + '/api/store/broker?currency=' + pageCur()).then(function (r) { return r.json(); }).then(function (d) { fee = d; cb(d); }).catch(function () { cb(null); }); };
    var money = function (cur, n) { var sy = SYM[cur] || cur + ' '; return sy + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }); };
    // best available alternative = first visible suggestion row with an add button
    var alt = function () {
      var rows = [].slice.call(document.querySelectorAll('.domain-suggestion, #domainSuggestions li, .suggested-domains .row, [class*="suggestion"]'));
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i]; if (r.offsetParent === null) continue;
        var btn = r.querySelector('button.btn-add-to-cart, .btn-add-to-cart, button[data-domain], .btn:not([disabled])'); if (!btn || btn.offsetParent === null) continue;
        var d = (btn.getAttribute('data-domain') || (r.textContent.match(/[a-z0-9-]+\.[a-z.]{2,}/i) || [])[0] || '').toLowerCase(); if (!d) continue;
        var pr = r.querySelector('.price, [class*="price"]'); var price = pr ? pr.textContent.replace(/\s+/g, ' ').trim() : '';
        return { dom: d, price: price, btn: btn };
      }
      return null;
    };
    var run = function () {
      document.querySelectorAll('.domain-unavailable, .domain-checker-unavailable').forEach(function (el) {
        if (el.dataset.ghb || !/block|flex/.test(getComputedStyle(el).display) || el.offsetParent === null) return;
        var res = el.closest('.domain-lookup-primary-results, #primaryLookupResult, #DomainSearchResults') || el.parentNode;
        var b = res && res.querySelector('[data-domain]'); var txt = (el.textContent.match(/[a-z0-9-]+\.[a-z.]{2,}/i) || [])[0];
        var dom = ((b && b.getAttribute('data-domain')) || txt || ((document.querySelector('#inputDomain, input[name=domain], #registersld') || {}).value || '')).toLowerCase().trim();
        el.dataset.ghb = 1;
        // the searched name is taken: the .com/.net/.org bundle would mislead, hide it
        var bun = document.getElementById('domainBundle'); if (bun) bun.style.display = 'none';
        var wrap = document.createElement('div'); wrap.className = 'gh-tk';
        var href = ORIGIN + '/domain-broker' + (dom ? '?domain=' + encodeURIComponent(dom) : '');
        var AV = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="#fbe8ef"/><circle cx="32" cy="25" r="11" fill="#c5386f"/><path d="M12 54c3-10 11-15 20-15s17 5 20 15" fill="#c5386f"/><path d="M26 41l6 7 6-7" fill="#fdd700"/></svg>';
        wrap.innerHTML = '<div class="gh-tk__card gh-tk__taken">' +
          '<div class="gh-tk__top"><span class="gh-tk__tag">Domain taken</span><span class="gh-tk__anon">Owner never learns who you are</span></div>' +
          '<div class="gh-tk__dom"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M5.6 18.4 18.4 5.6"/></svg>' + esc(dom || 'This domain') + '</div>' +
          '<p class="gh-tk__lead">We might be able to get it for you. <a href="#" data-gh-how>See how it works</a></p>' +
          '<div class="gh-tk__fee"><span class="gh-tk__ph" data-gh-ph>' + AV + '</span><div class="gh-tk__feetx"><small data-gh-who>Your broker · GlobalHostia broker desk</small><b><span data-gh-fee>…</span> <i>broker service fee</i></b><em data-gh-fee-note></em></div></div>' +
          '<ul class="gh-tk__ticks"><li>Anonymous approach</li><li>Payment held in escrow</li><li>No deal, no commission</li></ul>' +
          '<ol class="gh-tk__steps" hidden><li><b>Tell us your budget</b> for the domain</li><li><b>We contact the owner</b> anonymously</li><li><b>We negotiate</b> and hold payment in escrow</li><li><b>The domain moves</b> to your account</li></ol>' +
          '<div class="gh-tk__act"><a class="gh-tk__buy" href="' + href + '">Buy it now</a><button type="button" class="gh-tk__more" data-gh-more aria-expanded="false">See more <span aria-hidden="true">▾</span></button></div></div>' +
          '<div class="gh-tk__card gh-tk__alt" hidden><span class="gh-tk__tag gh-tk__tag--alt">Great alternative</span><div class="gh-tk__altdom" data-gh-alt></div><div class="gh-tk__altprice"><b data-gh-altp></b> <span>first year</span></div><div class="gh-tk__altren" data-gh-altr></div><button type="button" class="gh-tk__add">Make it yours</button><div class="gh-tk__more2" data-gh-more2></div></div>';
        res.insertBefore(wrap, res.firstChild);
        res.classList.add('gh-tk-on');
        var steps = wrap.querySelector('.gh-tk__steps'), moreBtn = wrap.querySelector('[data-gh-more]');
        var toggle = function (e) { if (e) e.preventDefault(); var open = steps.hidden; steps.hidden = !open; moreBtn.setAttribute('aria-expanded', String(open)); moreBtn.firstChild.nodeValue = open ? 'See less ' : 'See more '; };
        moreBtn.onclick = toggle; wrap.querySelector('[data-gh-how]').onclick = function (e) { e.preventDefault(); if (steps.hidden) toggle(); };
        loadFee(function (d) {
          var f = wrap.querySelector('[data-gh-fee]'), n = wrap.querySelector('[data-gh-fee-note]');
          if (!d) { f.textContent = 'From $79'; return; }
          f.textContent = money(d.currency, d.fee);
          n.textContent = '+ ' + d.pct + '% only if we buy it for you (minimum ' + money(d.currency, d.minCommission) + ')';
          if (d.team && d.team.length) { var pick = d.team[Math.floor(Math.random() * d.team.length)]; d.name = pick.name; d.title = pick.title; d.photo = pick.photo; }
          if (d.name) wrap.querySelector('[data-gh-who]').textContent = d.name + (d.title ? ', ' + d.title : '');
          if (d.photo && /^https:\/\//.test(d.photo)) { var im = new Image(); im.alt = ''; im.src = d.photo; im.onload = function () { var ph = wrap.querySelector('[data-gh-ph]'); ph.innerHTML = ''; ph.appendChild(im); }; }
        });
        var renewOf = function (row) { var m = row && row.textContent.match(/Renews\s+([^\s/]+)\s*\/\s*yr/i); return m ? m[1] : ''; };
        var tries = 0, fill = function () {
          var a = alt(); var card = wrap.querySelector('.gh-tk__alt');
          if (!a) { if (++tries < 20) setTimeout(fill, 600); return; }
          var parts = a.dom.split('.'); var sld = parts.shift();
          card.querySelector('[data-gh-alt]').innerHTML = esc(sld) + '<span>.' + esc(parts.join('.')) + '</span>';
          card.querySelector('[data-gh-altp]').textContent = a.price.replace(/\s*[A-Z]{3}$/, '');
          var row = a.btn.closest('.domain-suggestion'); var rn = renewOf(row);
          card.querySelector('[data-gh-altr]').textContent = rn ? 'Renews at ' + rn + ' / year' : '';
          card.querySelector('.gh-tk__add').onclick = function () { a.btn.click(); this.textContent = 'Added'; this.disabled = true; };
          // two more available alternatives
          var more = [].slice.call(document.querySelectorAll('.domain-suggestion')).filter(function (r) { var b2 = r.querySelector('.btn-add-to-cart'); return r.offsetParent !== null && b2 && b2 !== a.btn && b2.offsetParent !== null; }).slice(0, 2);
          var box = card.querySelector('[data-gh-more2]');
          more.forEach(function (r) {
            var b2 = r.querySelector('.btn-add-to-cart'); var d2 = (b2.getAttribute('data-domain') || '').toLowerCase(); var p2 = r.querySelector('.price'); if (!d2) return;
            var it = document.createElement('div'); it.className = 'gh-tk__mini';
            it.innerHTML = '<span><b>' + esc(d2) + '</b><small>' + esc(p2 ? p2.textContent.replace(/\s+/g, ' ').trim() : '') + '</small></span><button type="button">Add</button>';
            it.querySelector('button').onclick = function () { b2.click(); this.textContent = 'Added'; this.disabled = true; };
            box.appendChild(it);
          });
          card.hidden = false;
        };
        fill();
      });
    };
    run(); new MutationObserver(function () { clearTimeout(run.t); run.t = setTimeout(run, 200); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  }

  // spotlight cards with no result after lookup (taken) get a clear label + broker link; header "001" currency id → code
  function spotTaken() {
    var q = ((document.querySelector('#inputDomain, input[name=domain], input[name=query]') || {}).value || new URLSearchParams(location.search).get('query') || '').trim().toLowerCase();
    var sld = q.replace(/^https?:\/\//, '').replace(/^www\./, '').split('.')[0];
    var vis = function (e) { return e && e.offsetParent !== null && getComputedStyle(e).display !== 'none'; };
    var run = function () {
      document.querySelectorAll('.spotlight-tld').forEach(function (c) {
        var nm0 = c.querySelector('.spotlight-tld-name'); var t0 = nm0 ? nm0.textContent.trim().toLowerCase() : '';
        var qtld = (q.match(/\.[a-z.]{2,}$/) || [''])[0];
        var primaryTaken = !!document.querySelector('.gh-tk') || [].some.call(document.querySelectorAll('.domain-unavailable, .domain-checker-unavailable'), vis);
        if (qtld && t0 === qtld && primaryTaken) {
          c.classList.add('gh-force-taken');
          if (!c.dataset.ght && sld) { c.dataset.ght = 1; c.insertAdjacentHTML('beforeend', '<span class="gh-taken">Taken</span><a class="gh-taken-link" href="' + ORIGIN + '/domain-broker?domain=' + encodeURIComponent(sld + qtld) + '">Try our broker →</a>'); }
          return;
        }
        var add = [].some.call(c.querySelectorAll('.btn-add-to-cart, button.btn:not(.unavailable):not(.invalid):not([disabled]), .price'), function (e) { return vis(e) && e.textContent.trim() && !/unavailable|taken/i.test(e.className + e.textContent); });
        var old = c.querySelectorAll('.gh-taken, .gh-taken-link');
        if (add) { [].forEach.call(old, function (e) { e.remove(); }); delete c.dataset.ght; return; }
        var un = [].some.call(c.querySelectorAll('.unavailable, [class*="unavailable"], .btn[disabled]'), vis);
        if (!un || c.dataset.ght) return;
        var nm = c.querySelector('.spotlight-tld-name'); var tld = ((nm && nm.textContent) || c.textContent).match(/\.[a-z.]{2,}/i); if (!tld || !sld) return;
        c.dataset.ght = 1; var dom = sld + tld[0].toLowerCase();
        c.insertAdjacentHTML('beforeend', '<span class="gh-taken">Taken</span><a class="gh-taken-link" href="' + ORIGIN + '/domain-broker?domain=' + encodeURIComponent(dom) + '">Try our broker →</a>');
      });
    };
    [1500, 4000, 7000, 10000, 15000, 22000].forEach(function (t) { setTimeout(run, t); });
  }

  // WHMCS untranslated keys + "001 - USD" currency label + domain pricing rows on mobile
  function textFixes() {
    var tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n, kill = [];
    while ((n = tw.nextNode())) {
      var v = n.nodeValue;
      if (/\bdomainavailable2\b/.test(v)) { n.nodeValue = v.replace(/\s*\bdomainavailable2\b\s*/g, ' '); continue; }
      if (/^\s*0\d{2}(\s*-\s*[A-Z]{3})?\s*$/.test(v)) {
        var pe = n.parentElement; if (!pe || (pe.getBoundingClientRect().top > 300 && !/-\s*[A-Z]{3}/.test(v) && !(pe.closest('footer, [class*="footer"]')))) continue;
        var m = v.match(/[A-Z]{3}/); var code = m ? m[0] : ((document.body.innerHTML.match(/\d[\d,.]*\s(USD|AED|EUR|GBP|INR|SAR|CAD|AUD|SGD|MYR)\b/) || [])[1] || '');
        n.nodeValue = v.replace(/0\d{2}(\s*-\s*[A-Z]{3})?/, code || 'Currency');
      }
    }
  }
  function footerCredit() {
    [].forEach.call(document.querySelectorAll('footer p, footer div, [class*="footer"] p, [class*="footer"] .col, [class*="footer"] [class*="col-"]'), function (el) {
      if (el.children.length > 4 || !/coodiv|lots? of coffee/i.test(el.textContent) || el.dataset.ghc) return;
      el.dataset.ghc = 1; el.textContent = '© ' + new Date().getFullYear() + ' GlobalHostia. All rights reserved.';
    });
  }
  // Compact footer: replace the 6-column WHMCS footer with a 2-row GlobalHostia footer
  function footerCompact() {
    var f = document.querySelector('.footer-emyui-aws'); if (!f || f.querySelector('.gh-foot')) return;
    var sec = f.querySelector('.footer-section'); if (!sec) return;
    var logo = f.querySelector('.left-side-footer-logo img'), phone = (f.querySelector('.footer-top-section span') || {}).textContent || '';
    var legal = [].filter.call(f.querySelectorAll('.left-side-footer-logo a'), function (a) { return /legal|privacy|cookie|terms/i.test(a.textContent); });
    var seen = {}, groups = [].map.call(f.querySelectorAll('.footer-top > .row:first-child > div'), function (col) {
      var h = col.querySelector('h1,h2,h3,h4,h5,h6,.footer-title, strong'); var links = [];
      [].forEach.call(col.querySelectorAll('a[href]'), function (a) { var t = a.textContent.trim(), k = t.toLowerCase(); if (!t || seen[k]) return; seen[k] = 1; links.push([t, a.getAttribute('href')]); });
      return { t: h ? h.textContent.trim() : '', l: links };
    }).filter(function (g) { return g.l.length; });
    var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var tel = phone.replace(/[^\d+]/g, ''), wa = tel.replace(/\D/g, '');
    var d = document.createElement('div'); d.className = 'gh-foot';
    d.innerHTML = '<div class="gh-foot__help"><span class="gh-foot__q">Need help? We’re here 24/7.</span>' +
      (tel ? '<a href="tel:' + esc(tel) + '">' + esc(phone.trim()) + '</a>' : '') +
      (wa ? '<a href="https://wa.me/' + wa + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
      '<a href="submitticket.php">Open a ticket</a></div>' +
      '<div class="gh-foot__main"><a class="gh-foot__logo" href="https://globalhostia.com/">' + (logo ? '<img src="' + esc(logo.getAttribute('src')) + '" alt="GlobalHostia">' : 'GlobalHostia') + '</a>' +
      '</div><nav class="gh-foot__groups" aria-label="Footer">' + groups.map(function (g) { return '<div><b>' + esc(g.t) + '</b>' + g.l.map(function (n) { return '<a href="' + esc(n[1]) + '">' + esc(n[0]) + '</a>'; }).join('') + '</div>'; }).join('') + '</nav>' +
      '<div class="gh-foot__base"><span>© ' + new Date().getFullYear() + ' GlobalHostia. All rights reserved.</span><span class="gh-foot__legal">' +
      legal.map(function (a) { return '<a href="' + esc(a.getAttribute('href')) + '">' + esc(a.textContent.trim()) + '</a>'; }).join('') + '</span></div>';
    sec.style.display = 'none'; sec.parentNode.insertBefore(d, sec);
  }
  // Gravatar avatars: our logo as the default instead of Gravatar's blue icon; a "Change photo" link in the account menu
  function avatars() {
    var def = encodeURIComponent('https://globalhostia.com/icon-192.png');
    [].forEach.call(document.querySelectorAll('img[src*="gravatar.com/avatar/"]'), function (im) {
      if (im.dataset.gha) return; im.dataset.gha = 1;
      var base = im.getAttribute('src').split('?')[0];
      im.src = base + '?s=160&d=' + def; im.classList.add('gh-avatar');
    });
    var menu = document.querySelector('.client-avatar') && [].find.call(document.querySelectorAll('.dropdown-menu'), function (m) { return /Logout/i.test(m.textContent) && /Account Details|Your Profile/i.test(m.textContent); });
    if (menu && !menu.querySelector('.gh-photo-link')) {
      var head = [].find.call(menu.querySelectorAll('*'), function (e) { return e.querySelector && e.querySelector('img.gh-avatar, .client-avatar img') && e.textContent.trim().length < 60; });
      var a = document.createElement('a'); a.className = 'gh-photo-link'; a.href = 'https://gravatar.com/profile'; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = 'Change photo';
      if (head) head.appendChild(a);
    }
  }
  function tldRows() {
    var tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n;
    while ((n = tw.nextNode())) {
      if (!/New Price/i.test(n.nodeValue)) continue;
      var el = n.parentElement, guard = 0;
      while (el && guard++ < 6 && !(/Transfer/i.test(el.textContent) && /Ren/i.test(el.textContent))) el = el.parentElement;
      if (el && el.children.length >= 3 && el.children.length <= 6 && !el.classList.contains('gh-tldrow')) el.classList.add('gh-tldrow');
    }
  }
  // results showing: make the dark search banner compact so the results sit higher (less scrolling)
  function compactHero() {
    var inp = document.querySelector('#inputDomain'); if (!inp) return;
    var hasResults = /[?&]query=/.test(location.search) || document.querySelector('#DomainSearchResults, #primaryLookupResult');
    if (!hasResults) return;
    var el = inp.parentNode, hero = null;
    for (var i = 0; el && el !== document.body && i < 10; i++, el = el.parentNode) {
      var cs = getComputedStyle(el), m = cs.backgroundColor.match(/\d+/g), dark = m && (m[3] === undefined || +m[3] > 0) && (+m[0] + +m[1] + +m[2]) < 200;
      if ((dark || cs.backgroundImage !== 'none') && el.offsetHeight > 260) { hero = el; break; }
    }
    if (!hero) return;
    hero.classList.add('gh-hero-compact');
  }
  function searchBox() {
    document.querySelectorAll('#inputDomain, input[name="domain"][type="text"], input[name="query"][type="text"]').forEach(function (inp) {
      var g = inp.parentNode, n = 0; while (g && n < 3 && !g.querySelector('button, .btn, [type=submit]')) { g = g.parentNode; n++; }
      if (!g || g.tagName === 'FORM' && g.querySelectorAll('input[type=text]').length > 1) return;
      if (g.querySelectorAll('button, .btn, [type=submit]').length > 2) return; g.classList.add('gh-searchbox');
    });
  }
  function bundleGlass() {
    var run = function () { document.querySelectorAll('#domainBundle, .domain-bundle-card').forEach(function (card) {
      card.querySelectorAll('*').forEach(function (el) {
        if (/^(A|BUTTON)$/.test(el.tagName) || el.closest('a,button')) return;
        var m = getComputedStyle(el).backgroundColor.match(/\d+/g); if (!m || (m[3] !== undefined && +m[3] === 0)) return;
        if (+m[0] >= 248 && +m[1] >= 248 && +m[2] >= 248) { el.style.setProperty('background', 'rgba(255,255,255,.07)', 'important'); el.style.setProperty('border', '1px solid rgba(255,255,255,.14)', 'important'); el.style.setProperty('box-shadow', 'none', 'important'); }
      }); }); };
    run(); setTimeout(run, 1200); setTimeout(run, 4000);
  }
  function curLabel() {
    var code = ''; var m = document.body.innerHTML.match(/\d[\d,.]*\s(USD|AED|EUR|GBP|INR|SAR|CAD|AUD|SGD|MYR)\b/); if (m) code = m[1];
    var map = { USD: '$ USD', AED: 'AED', EUR: '€ EUR', GBP: '£ GBP', INR: '₹ INR', SAR: 'SAR', CAD: 'C$ CAD', AUD: 'A$ AUD', SGD: 'S$ SGD', MYR: 'RM MYR' };
    document.querySelectorAll('a, button, span, div, li').forEach(function (el) {
      if (el.children.length > 3) return; var r = el.getBoundingClientRect(); if (r.top > 260 || r.width > 260) return;
      var t = el.textContent.trim(); if (!/^0\d{2}$/.test(t)) return;
      var tn = [].find.call(el.childNodes, function (n) { return n.nodeType === 3 && /0\d{2}/.test(n.nodeValue); }) || el;
      var lbl = map[code] || code || 'Currency';
      if (tn.nodeType === 3) tn.nodeValue = tn.nodeValue.replace(/0\d{2}/, lbl); else el.textContent = lbl;
    });
  }

  ready(function () { try { footerCredit(); footerCompact(); } catch (e) {} try { avatars(); setTimeout(avatars, 1200); } catch (e) {} try { curLabel(); setTimeout(curLabel, 1500); textFixes(); setTimeout(textFixes, 1500); setTimeout(textFixes, 4000); tldRows(); setTimeout(tldRows, 2500); } catch (e) {} try { bundleGlass(); } catch (e) {} try { searchBox(); } catch (e) {} try { compactHero(); setTimeout(compactHero, 800); } catch (e) {} try { if (document.querySelector('.spotlight-tld')) spotTaken(); } catch (e) {} try { if (document.querySelector('#DomainSearchResults, #primaryLookupResult, .domain-checker-container')) brokerCta(); } catch (e) {} try { cartIcons(); } catch (e) {} try { cartOffers(); } catch (e) {} try { connectLinks(); } catch (e) {} try { setTimeout(clientFixes, 600); setTimeout(clientFixes, 2000); } catch (e) {} try { whatsapp(); } catch (e) {} try { promos(); } catch (e) {} try { domainPage(); } catch (e) {} try { suggestPager(); } catch (e) {} try { compare(); } catch (e) {} try { storeMega(); } catch (e) {} try { domainStep(); } catch (e) {} try { configure(); } catch (e) {} try { cartView(); } catch (e) {} try { checkout(); } catch (e) {} try { homepage(); } catch (e) {} try { blogHub(); } catch (e) {} try { groupedNav(); } catch (e) {} try { promo(); } catch (e) {} try { catBanner(); } catch (e) {} try { enhanceListing(); } catch (e) {} });
})();

// Support alerts: nudge the site to email the owner after a ticket is opened or replied to.
// Self-contained (append-only); the server rate-limits and de-duplicates, the beacon carries no data.
(function () {
  try {
    if (!/(submitticket|viewticket)\.php/i.test(location.pathname)) return;
    var origin = (function () { try { return new URL(document.currentScript.src).origin; } catch (e) { return 'https://globalhostia.com'; } })();
    var ping = function () { try { if (navigator.sendBeacon) navigator.sendBeacon(origin + '/api/support/ping'); else fetch(origin + '/api/support/ping', { method: 'POST', keepalive: true, mode: 'no-cors' }); } catch (e) {} };
    if (/viewticket\.php/i.test(location.pathname) || /[?&]step=3\b/.test(location.search)) ping();
    document.addEventListener('submit', function (e) { if (e.target && e.target.querySelector && e.target.querySelector('textarea')) ping(); }, true);
  } catch (e) {}
})();

// Manage hosting: Overview + grouped tools (Domains, Email, Files, Databases, Advanced) on the service details page.
// Shown only when the WHMCS hook (docs/whmcs/globalhostia_hosting_hook.php) printed window.GH_HOSTING for an Active
// DirectAdmin / cPanel / Plesk service owned by the signed-in client. Talks to ORIGIN/api/hosting/* with that token in
// the Authorization header (no cookies). The panel's own "Login to DirectAdmin" button is left in place as a fallback.
(function () {
  'use strict';
  var ORIGIN = (function () { try { return new URL(document.currentScript.src).origin; } catch (e) { return 'https://globalhostia.com'; } })();
  var API = ORIGIN + '/api/hosting/';
  function ready(f) { if (document.readyState !== 'loading') f(); else document.addEventListener('DOMContentLoaded', f); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var I = {
    dns: 'M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20M12 2c2.8 3 4 6.5 4 10s-1.2 7-4 10c-2.8-3-4-6.5-4-10s1.2-7 4-10z',
    email: 'M3 5h18v14H3zM3 6l9 7 9-7',
    files: 'M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z',
    databases: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    ssl: 'M6 11h12v10H6zM8 11V7a4 4 0 018 0v4',
    backups: 'M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8M3 3v5h5M12 7v5l3 3',
    plus: 'M12 5v14M5 12h14', edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    key: 'M15 7a4 4 0 11-3.9 5H3v3h3v3h3v-3h2.1A4 4 0 0115 7z', down: 'M12 4v12M6 10l6 6 6-6M4 20h16', up: 'M12 20V8M6 14l6-6 6 6M4 4h16',
    folder: 'M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z', file: 'M6 3h8l4 4v14H6zM14 3v4h4',
    refresh: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7', fwd: 'M4 12h14M13 6l6 6-6 6', user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', alert: 'M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
    x: 'M6 6l12 12M18 6L6 18', overview: 'M4 18a8 8 0 1116 0M12 18l4-6', subdomains: 'M6 3v12a3 3 0 003 3h9M14 14l4 4-4 4',
    aliases: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1', redirects: 'M4 12h14M13 6l6 6-6 6',
    php: 'M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14', forwarders: 'M4 6h11M4 12h7M4 18h11M15 9l4 3-4 3', autoresponders: 'M9 7L4 12l5 5M4 12h11a5 5 0 015 5v2',
    spam: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l6 0', ftp: 'M4 8h16v12H4zM8 4h8M12 11v6M9 14l3 3 3-3', protect: 'M6 11h12v10H6zM8 11V7a4 4 0 018 0v4M12 15v2',
    cron: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2', wordpress: 'M12 3a9 9 0 100 18 9 9 0 000-18zM6 8l3.5 10L12 11l2.5 7L18 8', rename: 'M9 4h6M9 20h6M12 4v16M4 9l-2 3 2 3M20 9l2 3-2 3', ext: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6', gauge: 'M4 18a8 8 0 1116 0M12 18l4-6'
  };
  function ic(n, sz) { return '<svg viewBox="0 0 24 24" width="' + (sz || 16) + '" height="' + (sz || 16) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="' + I[n] + '"/></svg>'; }
  // [group label, [[view, label, capability section, sub-cap]]]
  var NAV = [
    ['', [['overview', 'Overview', 'overview']]],
    ['Domains', [['dns', 'DNS', 'dns'], ['subdomains', 'Subdomains', 'subdomains'], ['aliases', 'Aliases', 'aliases'], ['redirects', 'Redirects', 'redirects'], ['ssl', 'SSL', 'ssl'], ['php', 'PHP version', 'php']]],
    ['Email', [['email', 'Mailboxes', 'email', 'list'], ['forwarders', 'Forwarders', 'email', 'forwarders'], ['autoresponders', 'Autoresponders', 'autoresponders'], ['spam', 'Spam filter', 'spam']]],
    ['Files', [['files', 'File manager', 'files'], ['ftp', 'FTP accounts', 'ftp'], ['protect', 'Protected folders', 'protect']]],
    ['Data', [['databases', 'Databases', 'databases']]],
    ['Advanced', [['cron', 'Cron jobs', 'cron'], ['backups', 'Backups', 'backups'], ['wordpress', 'WordPress', 'wordpress']]]
  ];
  var DOMAIN_VIEWS = { dns: 1, subdomains: 1, aliases: 1, redirects: 1, php: 1, email: 1, forwarders: 1, autoresponders: 1, spam: 1, ftp: 1, protect: 1 };
  var bytes = function (n) { n = +n || 0; return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB'; };
  var when = function (s) { if (!s) return ''; var d = new Date(s); return isNaN(d) ? esc(s) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); };
  function genPass() {
    var a = 'abcdefghijkmnpqrstuvwxyz', A = 'ABCDEFGHJKLMNPQRSTUVWXYZ', d = '23456789', s = '!#%+=_-', all = a + A + d + s, out = [], r = new Uint32Array(16);
    (window.crypto || window.msCrypto).getRandomValues(r);
    out.push(a[r[0] % a.length], A[r[1] % A.length], d[r[2] % d.length], s[r[3] % s.length]);
    for (var i = 4; i < 16; i++) out.push(all[r[i] % all.length]);
    for (var j = out.length - 1; j > 0; j--) { var k = r[j] % (j + 1), t = out[j]; out[j] = out[k]; out[k] = t; }
    return out.join('');
  }

  function mount(G) {
    if (document.querySelector('.ghh')) return;
    var anchor = null;
    // after the card that holds the panel's own login button, else before the tabbed service details, else top of content
    var btn = [].slice.call(document.querySelectorAll('a, button, input[type=submit]')).filter(function (b) { return /login to (directadmin|cpanel|plesk|control panel)|log in to (directadmin|cpanel|plesk)/i.test(b.textContent || b.value || ''); })[0];
    if (btn) { anchor = btn.closest('.card, .panel, .module-client-area, .product-details, section') || btn.parentNode; }
    var host = document.createElement('section');
    host.className = 'ghh'; host.setAttribute('aria-labelledby', 'ghh-title');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(host, anchor.nextSibling);
    else {
      var t = document.querySelector('.product-details-tab-container, #tabOverview, .tab-content, .product-details, #main-body .container, #main-body, main');
      if (!t) return;
      if (t.matches('#main-body .container, #main-body, main')) t.insertBefore(host, t.firstChild); else t.parentNode.insertBefore(host, t);
    }
    app(host, G);
  }

  function app(root, G) {
    var S = { tab: null, session: null, domain: '', path: '/', cache: {} };
    root.innerHTML =
      '<header class="ghh__head"><span class="ghh__mark" aria-hidden="true">' + ic('gauge', 20) + '</span><div class="ghh__ttl"><h2 id="ghh-title">Manage hosting</h2><p class="ghh__sub" data-sub>Connecting to your hosting account</p></div>' +
      '<div class="ghh__dom" data-dom hidden><label for="ghh-dom">Domain</label><select id="ghh-dom" data-domsel></select></div></header>' +
      '<div class="ghh__wrap"><nav class="ghh__nav" aria-label="Hosting tools" data-tabs></nav>' +
      '<div class="ghh__body" id="ghh-panel" tabindex="-1" data-body aria-live="polite"></div></div>' +
      '<div class="ghh__toasts" aria-live="polite" aria-atomic="false" data-toasts></div>';
    var $ = function (s) { return root.querySelector(s); };
    var body = $('[data-body]');
    body.innerHTML = skel(4);

    function api(section, q, opts) {
      opts = opts || {};
      var url = API + section + (q ? '?' + new URLSearchParams(q) : '');
      var init = { method: opts.method || 'GET', headers: { authorization: 'Bearer ' + G.token }, credentials: 'omit', mode: 'cors', cache: 'no-store' };
      if (opts.json) { init.method = 'POST'; init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(opts.json); }
      if (opts.form) { init.method = 'POST'; init.body = opts.form; }
      return fetch(url, init).then(function (r) {
        if (opts.raw && r.ok) return r;
        return r.json().catch(function () { return { error: 'server', message: 'Unexpected answer from the server (' + r.status + ')' }; }).then(function (d) {
          if (!r.ok) { var e = new Error(d.message || 'Request failed'); e.code = d.error; e.status = r.status; throw e; }
          return d;
        });
      }, function () { var e = new Error('Network problem. Check your connection and try again.'); e.code = 'network'; throw e; });
    }
    function toast(msg, kind) {
      var box = $('[data-toasts]'), el = document.createElement('div');
      el.className = 'ghh-toast ghh-toast--' + (kind || 'ok'); el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
      el.innerHTML = '<span class="ghh-toast__mk" aria-hidden="true"></span><span>' + esc(msg) + '</span><button type="button" aria-label="Dismiss">' + ic('x', 14) + '</button>';
      el.querySelector('button').onclick = function () { el.remove(); };
      box.appendChild(el); setTimeout(function () { el.classList.add('is-out'); setTimeout(function () { el.remove(); }, 300); }, kind === 'err' ? 7000 : 4200);
    }
    function fail(e, where) {
      if (e && e.code === 'expired') return expired();
      if (where) where.innerHTML = errBox(e && e.message);
      else toast(e && e.message || 'Something went wrong', 'err');
    }
    function expired() {
      body.innerHTML = '<div class="ghh-state"><span class="ghh-state__hex">' + ic('refresh', 22) + '</span><h3>Your session timed out</h3><p>For your security the hosting tools sign out after 10 minutes. Reload the page to continue where you left off.</p><button type="button" class="ghh-btn ghh-btn--pri" data-reload>Reload page</button></div>';
      body.querySelector('[data-reload]').onclick = function () { location.reload(); };
    }
    function errBox(m) { return '<div class="ghh-state ghh-state--err" role="alert"><span class="ghh-state__hex">' + ic('alert', 22) + '</span><h3>That did not work</h3><p>' + esc(m || 'Please try again in a moment.') + '</p><button type="button" class="ghh-btn" data-retry>' + ic('refresh') + ' Try again</button></div>'; }
    function empty(icon, title, text, cta) { return '<div class="ghh-state"><span class="ghh-state__hex">' + ic(icon, 22) + '</span><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p>' + (cta || '') + '</div>'; }
    function skel(n) { var s = '<div class="ghh-skel" aria-busy="true" aria-label="Loading">'; for (var i = 0; i < n; i++) s += '<div class="ghh-skel__row"><i></i><i></i><i></i></div>'; return s + '</div>'; }
    function can(sec, f) { var c = S.session && S.session.caps[sec]; return !!(c && c.indexOf(f) >= 0); }
    function bar(title, sub, actions) { return '<div class="ghh-bar"><div><h3>' + esc(title) + '</h3>' + (sub ? '<p>' + sub + '</p>' : '') + '</div><div class="ghh-bar__act">' + (actions || '') + '</div></div>'; }
    function busy(b, on) { if (!b) return; b.disabled = on; b.classList.toggle('is-busy', on); }
    function retryOn(el, fn) { var r = el.querySelector('[data-retry]'); if (r) r.onclick = fn; }

    /* inline confirm: replaces the action cell until confirmed or cancelled */
    function confirmIn(cell, text, label, run, rebind) {
      var keep = cell.innerHTML, re = function () { cell.innerHTML = keep; (rebind || bindAll)(); };
      cell.innerHTML = '<div class="ghh-confirm" role="group" aria-label="Confirm"><span>' + esc(text) + '</span><button type="button" class="ghh-btn ghh-btn--sm" data-no>Cancel</button><button type="button" class="ghh-btn ghh-btn--sm ghh-btn--danger" data-yes>' + esc(label) + '</button></div>';
      var no = cell.querySelector('[data-no]'), yes = cell.querySelector('[data-yes]');
      yes.focus();
      no.onclick = re;
      yes.onclick = function () { busy(yes, true); no.disabled = true; run(re); };
      cell.onkeydown = function (e) { if (e.key === 'Escape') no.click(); };
    }
    var bindAll = function () {};

    /* inline form panel above a list */
    function formPanel(slot, title, fields, submitLabel, onSubmit) {
      slot.innerHTML = '<form class="ghh-form" novalidate><div class="ghh-form__head"><h4>' + esc(title) + '</h4><button type="button" class="ghh-icon" data-close aria-label="Close">' + ic('x') + '</button></div><div class="ghh-form__grid">' + fields + '</div>' +
        '<p class="ghh-form__err" role="alert" hidden></p><div class="ghh-form__foot"><button type="button" class="ghh-btn" data-close>Cancel</button><button class="ghh-btn ghh-btn--pri" type="submit">' + esc(submitLabel) + '</button></div></form>';
      var f = slot.querySelector('form'), err = f.querySelector('.ghh-form__err');
      [].forEach.call(f.querySelectorAll('[data-close]'), function (b) { b.onclick = function () { slot.innerHTML = ''; }; });
      [].forEach.call(f.querySelectorAll('[data-gen]'), function (b) { b.onclick = function () { var i = f.querySelector('[name="' + b.getAttribute('data-gen') + '"]'); i.value = genPass(); i.type = 'text'; i.select(); }; });
      f.onkeydown = function (e) { if (e.key === 'Escape') slot.innerHTML = ''; };
      f.onsubmit = function (e) {
        e.preventDefault(); err.hidden = true;
        var sb = f.querySelector('[type=submit]'); busy(sb, true);
        var data = {}; [].forEach.call(f.elements, function (el) { if (el.name) data[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
        onSubmit(data).then(function () { slot.innerHTML = ''; }, function (e2) { busy(sb, false); if (e2 && e2.code === 'expired') return expired(); err.textContent = e2 && e2.message || 'Failed'; err.hidden = false; });
      };
      var first = f.querySelector('input:not([type=hidden]), select, textarea'); if (first) first.focus();
      slot.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    function fld(name, label, o) {
      o = o || {};
      var id = 'ghh-f-' + name + '-' + Math.random().toString(36).slice(2, 7);
      var input = o.options ? '<select id="' + id + '" name="' + name + '">' + o.options.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (x[0] === o.value ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>'
        : o.area ? '<textarea id="' + id + '" name="' + name + '" rows="3"' + (o.required ? ' required' : '') + '>' + esc(o.value || '') + '</textarea>'
        : '<input id="' + id + '" name="' + name + '" type="' + (o.type || 'text') + '" value="' + esc(o.value == null ? '' : o.value) + '"' + (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') + (o.required ? ' required' : '') + (o.min != null ? ' min="' + o.min + '"' : '') + ' autocomplete="' + (o.type === 'password' ? 'new-password' : 'off') + '" spellcheck="false">';
      var addon = o.suffix ? '<span class="ghh-addon">' + esc(o.suffix) + '</span>' : o.prefix ? '<span class="ghh-addon ghh-addon--pre">' + esc(o.prefix) + '</span>' : '';
      var gen = o.type === 'password' ? '<button type="button" class="ghh-btn ghh-btn--sm" data-gen="' + name + '">Generate</button>' : '';
      return '<div class="ghh-fld' + (o.wide ? ' ghh-fld--wide' : '') + '" data-f="' + name + '"' + (o.hidden ? ' hidden' : '') + '><label for="' + id + '">' + esc(label) + '</label><div class="ghh-in' + (o.prefix ? ' has-pre' : '') + '">' + (o.prefix ? addon : '') + input + (o.suffix ? addon : '') + gen + '</div>' + (o.hint ? '<small>' + esc(o.hint) + '</small>' : '') + '</div>';
    }

    /* ------------------------------------------------------------ boot */
    api('session').then(function (s) {
      S.session = s;
      S.domain = s.domains.indexOf(s.domain) >= 0 ? s.domain : s.domains[0] || '';
      $('[data-sub]').innerHTML = esc(s.domain || s.username) + ' <span aria-hidden="true">·</span> ' + esc(s.panelLabel) + (s.server ? ' <span aria-hidden="true">·</span> ' + esc(s.server) : '');
      var sel = $('[data-domsel]');
      [].forEach.call(document.querySelectorAll('.ghh .nice-select'), function (n) { n.remove(); });
      sel.innerHTML = s.domains.map(function (d) { return '<option' + (d === S.domain ? ' selected' : '') + '>' + esc(d) + '</option>'; }).join('');
      sel.onchange = function () { S.domain = sel.value; S.cache = {}; show(S.tab); };
      var vis = function (it) { var c = s.caps[it[2]]; return !!(c && c.length && (!it[3] || c.indexOf(it[3]) >= 0)); };
      var groups = NAV.map(function (g) { return [g[0], g[1].filter(vis)]; }).filter(function (g) { return g[1].length; });
      var tabs = [].concat.apply([], groups.map(function (g) { return g[1]; }));
      var tl = $('[data-tabs]');
      tl.innerHTML = groups.map(function (g) {
        return '<div class="ghh-nav__grp"' + (g[0] ? ' role="group" aria-label="' + esc(g[0]) + '"' : '') + '>' + (g[0] ? '<span class="ghh-nav__h" aria-hidden="true">' + esc(g[0]) + '</span>' : '') +
          g[1].map(function (t) { return '<button type="button" class="ghh-nav__it" id="ghh-tab-' + t[0] + '" aria-controls="ghh-panel" aria-current="false" data-tab="' + t[0] + '">' + ic(t[0], 16) + '<span>' + esc(t[1]) + '</span></button>'; }).join('') + '</div>';
      }).join('');
      tl.onclick = function (e) { var b = e.target.closest('[data-tab]'); if (b) show(b.getAttribute('data-tab')); };
      tl.onkeydown = function (e) {
        var bs = [].slice.call(tl.querySelectorAll('[data-tab]')), i = bs.indexOf(document.activeElement);
        if (i < 0) return;
        var n = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? bs.length - 1 : null;
        if (n === null) return; e.preventDefault(); n = (n + bs.length) % bs.length; bs[n].focus();
      };
      var want = (location.hash.match(/^#hosting-(\w+)/) || [])[1];
      show(tabs.some(function (t) { return t[0] === want; }) ? want : tabs[0] ? tabs[0][0] : null);
    }, function (e) {
      if (e && e.code === 'expired') return expired();
      body.innerHTML = errBox(e && e.message); retryOn(body, function () { root.remove(); mount(G); });
    });

    function show(tab, focus) {
      if (!tab) { body.innerHTML = empty('shield', 'No tools available', 'This hosting panel does not offer any self-service tools here yet. Use the control panel button instead.'); return; }
      S.tab = tab;
      [].forEach.call(root.querySelectorAll('[data-tab]'), function (b) { var on = b.getAttribute('data-tab') === tab; b.setAttribute('aria-current', on ? 'page' : 'false'); if (on && b.scrollIntoView && b.parentNode.parentNode.scrollWidth > b.parentNode.parentNode.clientWidth) b.scrollIntoView({ block: 'nearest', inline: 'center' }); });
      body.setAttribute('aria-labelledby', 'ghh-tab-' + tab);
      $('[data-dom]').hidden = !DOMAIN_VIEWS[tab] || S.session.domains.length < 2;
      try { history.replaceState(null, '', '#hosting-' + tab); } catch (e) {}
      bindAll = function () {};
      ({ overview: overview, dns: dns, subdomains: subdomains, aliases: aliases, redirects: redirects, php: php, email: email, forwarders: email, autoresponders: autoresponders, spam: spam,
        files: files, ftp: ftp, protect: protect, databases: databases, cron: cron, ssl: ssl, backups: backups, wordpress: wordpress })[tab]();
      if (focus) body.focus({ preventScroll: true });
    }

    /* ------------------------------------------------------------ DNS */
    function dns() {
      var d = S.domain;
      body.innerHTML = bar('DNS records', 'Records for <b>' + esc(d) + '</b>. Changes usually spread worldwide within an hour.', can('dns', 'add') ? '<button type="button" class="ghh-btn ghh-btn--pri" data-add>' + ic('plus') + ' Add record</button>' : '') + '<div data-slot></div><div data-list>' + skel(5) + '</div>';
      var list = body.querySelector('[data-list]'), slot = body.querySelector('[data-slot]'), recs = [];
      var load = function () {
        list.innerHTML = skel(5);
        api('dns', { domain: d }).then(function (r) { recs = r.records; render(); }, function (e) { fail(e, list); retryOn(list, load); });
      };
      var recForm = function (rec) {
        var t = rec ? rec.type : 'A';
        var flds = fld('type', 'Type', { options: [['A', 'A (IPv4 address)'], ['AAAA', 'AAAA (IPv6 address)'], ['CNAME', 'CNAME (alias)'], ['MX', 'MX (mail server)'], ['TXT', 'TXT (text, SPF, verification)'], ['SRV', 'SRV (service)']], value: t }) +
          fld('name', 'Name', { value: rec ? rec.name : '', placeholder: '@ for ' + d, suffix: '.' + d, hint: 'Use @ for the domain itself, or e.g. www, mail, _sip._tcp' }) +
          fld('value', 'Value', { value: rec ? rec.value : '', required: true, wide: true }) +
          fld('priority', 'Priority', { type: 'number', min: 0, value: rec && rec.priority != null ? rec.priority : 10, hidden: true }) +
          fld('weight', 'Weight', { type: 'number', min: 0, value: rec && rec.weight != null ? rec.weight : 0, hidden: true }) +
          fld('port', 'Port', { type: 'number', min: 1, value: rec && rec.port != null ? rec.port : '', hidden: true }) +
          fld('ttl', 'TTL (seconds)', { type: 'number', min: 60, value: rec ? rec.ttl : 3600 });
        formPanel(slot, rec ? 'Edit ' + rec.type + ' record' : 'Add a DNS record', flds, rec ? 'Save record' : 'Add record', function (v) {
          var payload = { op: rec ? 'edit' : 'add', domain: d, record: v }; if (rec) payload.id = rec.id;
          return api('dns', null, { json: payload }).then(function (r) { toast(r.message); load(); });
        });
        var f = slot.querySelector('form'), ty = f.querySelector('[name=type]');
        var hints = { A: '203.0.113.10', AAAA: '2001:db8::10', CNAME: 'target.example.com', MX: 'mail.' + d, TXT: 'v=spf1 include:_spf.example.com ~all', SRV: 'sip.' + d };
        var sync = function () {
          var x = ty.value;
          f.querySelector('[data-f=priority]').hidden = !(x === 'MX' || x === 'SRV');
          f.querySelector('[data-f=weight]').hidden = f.querySelector('[data-f=port]').hidden = x !== 'SRV';
          var vl = f.querySelector('[data-f=value] label'); vl.textContent = { A: 'IPv4 address', AAAA: 'IPv6 address', CNAME: 'Points to', MX: 'Mail server', TXT: 'Text', SRV: 'Target host' }[x];
          f.querySelector('[name=value]').placeholder = hints[x];
        };
        ty.onchange = sync; sync();
      };
      var render = function () {
        if (!recs.length) { list.innerHTML = empty('dns', 'No records yet', 'Add an A record to point ' + d + ' at a server, or an MX record for email.', can('dns', 'add') ? '<button type="button" class="ghh-btn ghh-btn--pri" data-add2>' + ic('plus') + ' Add record</button>' : ''); var a2 = list.querySelector('[data-add2]'); if (a2) a2.onclick = function () { recForm(null); }; return; }
        var order = { A: 1, AAAA: 2, CNAME: 3, MX: 4, TXT: 5, SRV: 6, NS: 7 };
        recs.sort(function (a, b) { return (order[a.type] - order[b.type]) || a.name.localeCompare(b.name); });
        list.innerHTML = '<div class="ghh-tw"><table class="ghh-t"><thead><tr><th scope="col">Type</th><th scope="col">Name</th><th scope="col">Value</th><th scope="col">TTL</th><th scope="col"><span class="ghh-sr">Actions</span></th></tr></thead><tbody>' +
          recs.map(function (r, i) {
            var val = (r.type === 'MX' ? '<span class="ghh-pill ghh-pill--muted">' + esc(r.priority) + '</span> ' : r.type === 'SRV' ? '<span class="ghh-pill ghh-pill--muted">' + esc(r.priority + ' ' + r.weight + ' ' + r.port) + '</span> ' : '') + '<code>' + esc(r.value) + '</code>';
            return '<tr><td data-l="Type"><span class="ghh-type ghh-type--' + esc(r.type.toLowerCase()) + '">' + esc(r.type) + '</span></td><td data-l="Name"><code>' + esc(r.name === '@' ? d : r.name + '.' + d) + '</code></td><td data-l="Value" class="ghh-wrap">' + val + '</td><td data-l="TTL">' + esc(r.ttl) + '</td>' +
              '<td class="ghh-act" data-i="' + i + '">' + (r.readonly ? '<span class="ghh-muted">Managed</span>' : (can('dns', 'edit') ? '<button type="button" class="ghh-icon" data-edit aria-label="Edit ' + esc(r.type + ' ' + r.name) + '">' + ic('edit') + '</button>' : '') + (can('dns', 'delete') ? '<button type="button" class="ghh-icon ghh-icon--danger" data-del aria-label="Delete ' + esc(r.type + ' ' + r.name) + '">' + ic('trash') + '</button>' : '')) + '</td></tr>';
          }).join('') + '</tbody></table></div>';
        bindAll();
      };
      bindAll = function () {
        [].forEach.call(list.querySelectorAll('[data-edit]'), function (b) { b.onclick = function () { recForm(recs[+b.closest('[data-i]').getAttribute('data-i')]); }; });
        [].forEach.call(list.querySelectorAll('[data-del]'), function (b) {
          b.onclick = function () {
            var cell = b.closest('[data-i]'), r = recs[+cell.getAttribute('data-i')];
            confirmIn(cell, 'Delete this ' + r.type + ' record?', 'Delete', function (back) { api('dns', null, { json: { op: 'delete', domain: d, id: r.id } }).then(function (x) { toast(x.message); load(); }, function (e) { fail(e); back(); }); });
          };
        });
      };
      var add = body.querySelector('[data-add]'); if (add) add.onclick = function () { recForm(null); };
      load();
    }

    /* ------------------------------------------------------------ Email */
    // domain chips: every domain on the account, one tap to switch (keeps the header picker in sync)
    function domChips(cur, label) {
      var ds = (S.session && S.session.domains) || []; if (ds.length < 2) return '';
      return '<div class="ghh-chips" role="group" aria-label="' + esc(label) + '"><span>' + esc(label) + '</span>' + ds.map(function (x) { return '<button type="button" data-dom="' + esc(x) + '"' + (x === cur ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + '>' + esc(x) + '</button>'; }).join('') + '</div>';
    }
    function bindChips(el, pick) {
      [].forEach.call(el.querySelectorAll('[data-dom]'), function (b) { b.onclick = function () { pick(b.getAttribute('data-dom')); }; });
    }
    function setDomain(d) { S.domain = d; S.cache = {}; var sel = $('[data-domsel]'); if (sel) sel.value = d; }
    function email() {
      var d = S.domain, fw = S.tab === 'forwarders';
      body.innerHTML = fw ? bar('Forwarders', 'Send mail for an address on <b>' + esc(d) + '</b> on to another inbox.', '<button type="button" class="ghh-btn ghh-btn--pri" data-addf>' + ic('plus') + ' New forwarder</button>') + domChips(d, 'Domain') + '<div data-fslot></div><div data-flist>' + skel(2) + '</div>'
        : bar('Mailboxes', 'Email accounts on <b>' + esc(d) + '</b>.', can('email', 'create') ? '<button type="button" class="ghh-btn ghh-btn--pri" data-add>' + ic('plus') + ' New mailbox</button>' : '') + domChips(d, 'Domain') + '<div data-slot></div><div data-list>' + skel(3) + '</div>';
      var list = body.querySelector('[data-list]'), slot = body.querySelector('[data-slot]'), boxes = [], fwds = [];
      var flist = body.querySelector('[data-flist]'), fslot = body.querySelector('[data-fslot]');
      bindChips(body, function (x) { setDomain(x); show(S.tab); });
      var load = function () {
        if (!list) { /* forwarders view */ }
        else if (!can('email', 'list')) { list.innerHTML = empty('email', 'Create and manage mailboxes', 'Your panel does not list mailboxes here; you can still create them, change passwords and quotas.'); }
        else api('email', { domain: d }).then(function (r) { boxes = r.mailboxes; render(); }, function (e) { fail(e, list); retryOn(list, load); });
        if (flist) api('email', { domain: d, op: 'forwarders' }).then(function (r) { fwds = r.forwarders; renderF(); }, function (e) { fail(e, flist); retryOn(flist, load); });
      };
      var newBox = function () {
        formPanel(slot, 'New mailbox', fld('user', 'Address', { required: true, suffix: '@' + d, placeholder: 'info' }) + fld('password', 'Password', { type: 'password', required: true, hint: '8+ characters with upper and lower case and a digit' }) + fld('quota', 'Quota', { type: 'number', min: 0, value: 1024, suffix: 'MB', hint: '0 = unlimited' }), 'Create mailbox', function (v) {
          return api('email', null, { json: { op: 'create', domain: d, user: v.user, password: v.password, quota: +v.quota || 0 } }).then(function (r) { toast(r.message); load(); });
        });
      };
      var render = function () {
        if (!boxes.length) { list.innerHTML = empty('email', 'No mailboxes yet', 'Create an address like info@' + d + ' and read it in any mail app.', can('email', 'create') ? '<button type="button" class="ghh-btn ghh-btn--pri" data-add2>' + ic('plus') + ' New mailbox</button>' : ''); var a2 = list.querySelector('[data-add2]'); if (a2) a2.onclick = newBox; return; }
        list.innerHTML = '<div class="ghh-tw"><table class="ghh-t"><thead><tr><th scope="col">Address</th><th scope="col">Usage</th><th scope="col"><span class="ghh-sr">Actions</span></th></tr></thead><tbody>' + boxes.map(function (m, i) {
          var pct = m.quotaMb ? Math.min(100, Math.round(m.usedMb / m.quotaMb * 100)) : 0;
          return '<tr><td data-l="Address"><b class="ghh-strong">' + esc(m.email) + '</b>' + (m.suspended ? ' <span class="ghh-pill ghh-pill--warn">Suspended</span>' : '') + '</td>' +
            '<td data-l="Usage"><div class="ghh-use"><div class="ghh-meter' + (pct > 85 ? ' is-high' : '') + '" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Mailbox usage"><i style="width:' + (m.quotaMb ? pct : 4) + '%"></i></div><span>' + esc(m.usedMb) + ' MB of ' + (m.quotaMb ? esc(m.quotaMb) + ' MB' : 'unlimited') + '</span></div></td>' +
            '<td class="ghh-act" data-i="' + i + '">' + (can('email', 'password') ? '<button type="button" class="ghh-btn ghh-btn--sm" data-pw>' + ic('key', 14) + ' Password</button>' : '') + (can('email', 'quota') ? '<button type="button" class="ghh-btn ghh-btn--sm" data-q>Quota</button>' : '') + (can('email', 'delete') ? '<button type="button" class="ghh-icon ghh-icon--danger" data-del aria-label="Delete ' + esc(m.email) + '">' + ic('trash') + '</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
        bindAll();
      };
      var renderF = function () {
        if (!fwds.length) { flist.innerHTML = empty('forwarders', 'No forwarders yet', 'Forward sales@' + d + ' to your personal inbox, or to several people at once.'); return; }
        flist.innerHTML = '<ul class="ghh-fwd">' + fwds.map(function (f, i) {
          return '<li><b>' + esc(f.email) + '</b><span class="ghh-arrow" aria-hidden="true">' + ic('fwd', 14) + '</span><span class="ghh-chips">' + f.to.map(function (t, j) { return '<span class="ghh-chip">' + esc(t) + '<button type="button" data-fi="' + i + '" data-fj="' + j + '" aria-label="Remove forwarding to ' + esc(t) + '">' + ic('x', 12) + '</button></span>'; }).join('') + '</span></li>';
        }).join('') + '</ul>';
        [].forEach.call(flist.querySelectorAll('[data-fi]'), function (b) {
          b.onclick = function () {
            var f = fwds[+b.getAttribute('data-fi')], to = f.to[+b.getAttribute('data-fj')], li = b.closest('li');
            confirmIn(li, 'Stop forwarding ' + f.email + ' to ' + to + '?', 'Remove', function (back) { api('email', null, { json: { op: 'removeForwarder', domain: d, user: f.user, to: to } }).then(function (r) { toast(r.message); load(); }, function (e) { fail(e); back(); }); }, renderF);
          };
        });
      };
      bindAll = function () {
        [].forEach.call(list.querySelectorAll('[data-i]'), function (cell) {
          var m = boxes[+cell.getAttribute('data-i')], pw = cell.querySelector('[data-pw]'), q = cell.querySelector('[data-q]'), del = cell.querySelector('[data-del]');
          if (pw) pw.onclick = function () { formPanel(slot, 'New password for ' + m.email, fld('password', 'New password', { type: 'password', required: true }), 'Change password', function (v) { return api('email', null, { json: { op: 'password', domain: d, user: m.user, password: v.password } }).then(function (r) { toast(r.message); }); }); };
          if (q) q.onclick = function () { formPanel(slot, 'Quota for ' + m.email, fld('quota', 'Quota', { type: 'number', min: 0, value: m.quotaMb, suffix: 'MB', hint: '0 = unlimited' }), 'Save quota', function (v) { return api('email', null, { json: { op: 'quota', domain: d, user: m.user, quota: +v.quota || 0 } }).then(function (r) { toast(r.message); load(); }); }); };
          if (del) del.onclick = function () { confirmIn(cell, 'Delete ' + m.email + ' and all its mail?', 'Delete', function (back) { api('email', null, { json: { op: 'delete', domain: d, user: m.user } }).then(function (r) { toast(r.message); load(); }, function (e) { fail(e); back(); }); }); };
        });
      };
      var add = body.querySelector('[data-add]'); if (add) add.onclick = newBox;
      var addf = body.querySelector('[data-addf]');
      if (addf) addf.onclick = function () { formPanel(fslot, 'New forwarder', fld('user', 'Forward mail for', { required: true, suffix: '@' + d, placeholder: 'sales' }) + fld('to', 'To address', { type: 'email', required: true, placeholder: 'you@gmail.com' }), 'Add forwarder', function (v) { return api('email', null, { json: { op: 'addForwarder', domain: d, user: v.user, to: v.to } }).then(function (r) { toast(r.message); load(); }); }); };
      load();
    }

    /* ------------------------------------------------------------ Files */
    var EDIT = /\.(txt|html?|css|js|mjs|json|xml|php\d?|phtml|md|ini|conf|htaccess|env|ya?ml|csv|svg|py|rb|pl|sh|log|sql|tpl|twig|vue|ts|tsx|jsx)$|^\.(htaccess|user\.ini|htpasswd)$/i;
    function files() {
      var lim = S.session.limits || { transferBytes: 4194304, editBytes: 1048576 };
      var acts = (can('files', 'upload') ? '<label class="ghh-btn ghh-btn--pri ghh-upload">' + ic('up') + ' Upload<input type="file" data-up multiple></label>' : '') + (can('files', 'mkdir') ? '<button type="button" class="ghh-btn" data-mk>' + ic('folder') + ' New folder</button>' : '');
      if (!S.pathSet) { S.pathSet = 1; if (S.domain) S.path = '/domains/' + S.domain + '/public_html'; }
      var webs = ((S.session && S.session.domains) || []);
      body.innerHTML = bar('File manager', 'Browse and edit the files in your hosting account. Uploads up to ' + bytes(lim.transferBytes) + '; use FTP for larger files.', acts) + (webs.length ? '<div class="ghh-chips" role="group" aria-label="Websites"><span>Websites</span>' + webs.map(function (x) { return '<button type="button" data-web="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '<button type="button" data-web="">All files</button></div>' : '') + '<nav class="ghh-crumbs" aria-label="Folder path" data-crumbs></nav><div data-slot></div><div data-list>' + skel(6) + '</div>';
      var list = body.querySelector('[data-list]'), slot = body.querySelector('[data-slot]'), ents = [];
      var crumbs = function () {
        var parts = S.path.split('/').filter(Boolean), acc = '';
        body.querySelector('[data-crumbs]').innerHTML = '<button type="button" data-go="/">' + ic('folder', 14) + ' Home</button>' + parts.map(function (p, i) { acc += '/' + p; return '<span aria-hidden="true">/</span>' + (i === parts.length - 1 ? '<b aria-current="page">' + esc(p) + '</b>' : '<button type="button" data-go="' + esc(acc) + '">' + esc(p) + '</button>'); }).join('');
        [].forEach.call(body.querySelectorAll('[data-go]'), function (b) { b.onclick = function () { S.path = b.getAttribute('data-go'); load(); }; });
      };
      var load = function () {
        crumbs(); slot.innerHTML = ''; list.innerHTML = skel(6);
        [].forEach.call(body.querySelectorAll('[data-web]'), function (b) { var w = b.getAttribute('data-web'), tgt = w ? '/domains/' + w + '/public_html' : '/'; b.classList.toggle('on', S.path === tgt || (w && S.path.indexOf('/domains/' + w + '/') === 0)); b.onclick = function () { if (w) setDomain(w); S.path = tgt; load(); }; });
        api('files', { op: 'list', path: S.path }).then(function (r) { ents = S.path === '/' ? r.entries.filter(function (e) { return !/^\.(cagefs|cl\.|clwpos|jb-|php|softaculous|spamassassin|trash|cpanel|cache|config|local|npm|bash_|wp-cli)/.test(e.name); }) : r.entries; render(); }, function (e) { fail(e, list); retryOn(list, load); });
      };
      var render = function () {
        var up = S.path !== '/' ? '<tr class="ghh-up"><td colspan="4"><button type="button" class="ghh-link" data-parent>' + ic('up', 14) + ' Up one level</button></td></tr>' : '';
        if (!ents.length) { list.innerHTML = (up ? '<div class="ghh-tw"><table class="ghh-t"><tbody>' + up + '</tbody></table></div>' : '') + empty('files', 'This folder is empty', 'Upload files or create a folder to get started.'); }
        else list.innerHTML = '<div class="ghh-tw"><table class="ghh-t ghh-t--files"><thead><tr><th scope="col">Name</th><th scope="col">Size</th><th scope="col">Modified</th><th scope="col"><span class="ghh-sr">Actions</span></th></tr></thead><tbody>' + up +
          ents.map(function (f, i) {
            var isDir = f.type === 'dir' || f.type === 'link', canEdit = !isDir && EDIT.test(f.name) && f.size <= lim.editBytes && can('files', 'read');
            return '<tr><td data-l="Name">' + (isDir ? '<button type="button" class="ghh-fname" data-open="' + i + '"><span class="ghh-ficon ghh-ficon--dir">' + ic('folder', 16) + '</span>' + esc(f.name) + '</button>' : '<span class="ghh-fname"><span class="ghh-ficon">' + ic('file', 16) + '</span>' + esc(f.name) + '</span>') + '</td>' +
              '<td data-l="Size">' + (isDir ? '<span class="ghh-muted">' + (f.type === 'link' ? 'Link' : 'Folder') + '</span>' : bytes(f.size)) + '</td><td data-l="Modified">' + when(f.modified) + '</td>' +
              '<td class="ghh-act" data-i="' + i + '">' + (canEdit && can('files', 'write') ? '<button type="button" class="ghh-btn ghh-btn--sm" data-ed>' + ic('edit', 14) + ' Edit</button>' : '') + (!isDir && can('files', 'download') && f.size <= lim.transferBytes ? '<button type="button" class="ghh-icon" data-dl aria-label="Download ' + esc(f.name) + '">' + ic('down') + '</button>' : '') +
              (can('files', 'rename') ? '<button type="button" class="ghh-icon" data-rn aria-label="Rename ' + esc(f.name) + '" title="Rename">' + ic('rename') + '</button>' : '') + (can('files', 'delete') ? '<button type="button" class="ghh-icon ghh-icon--danger" data-del aria-label="Delete ' + esc(f.name) + '">' + ic('trash') + '</button>' : '') + '</td></tr>';
          }).join('') + '</tbody></table></div>';
        var pb = list.querySelector('[data-parent]'); if (pb) pb.onclick = function () { S.path = S.path.replace(/\/[^\/]+$/, '') || '/'; load(); };
        bindAll();
      };
      var full = function (n) { return (S.path === '/' ? '' : S.path) + '/' + n; };
      var editor = function (f) {
        slot.innerHTML = '<div class="ghh-editor">' + skel(3) + '</div>';
        api('files', { op: 'read', path: full(f.name) }).then(function (r) {
          slot.innerHTML = '<form class="ghh-editor"><div class="ghh-form__head"><h4>' + ic('file', 16) + ' ' + esc(full(f.name)) + '</h4><button type="button" class="ghh-icon" data-close aria-label="Close editor">' + ic('x') + '</button></div>' +
            '<label class="ghh-sr" for="ghh-code">File contents</label><textarea id="ghh-code" spellcheck="false" wrap="off"></textarea><p class="ghh-form__err" role="alert" hidden></p>' +
            '<div class="ghh-form__foot"><span class="ghh-muted" data-sz></span><button type="button" class="ghh-btn" data-close>Close</button><button type="submit" class="ghh-btn ghh-btn--pri">Save file</button></div></form>';
          var fm = slot.querySelector('form'), ta = fm.querySelector('textarea'), dirty = false;
          ta.value = r.content; fm.querySelector('[data-sz]').textContent = bytes(r.size);
          ta.oninput = function () { dirty = true; };
          ta.onkeydown = function (e) { if (e.key === 'Tab' && !e.shiftKey && !e.altKey) { e.preventDefault(); var s0 = ta.selectionStart; ta.setRangeText('  ', s0, ta.selectionEnd, 'end'); dirty = true; } if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); fm.requestSubmit ? fm.requestSubmit() : fm.onsubmit(e); } };
          [].forEach.call(fm.querySelectorAll('[data-close]'), function (b) { b.onclick = function () { if (dirty && !b._sure) { b._sure = 1; b.textContent = 'Discard changes?'; return; } slot.innerHTML = ''; }; });
          fm.onsubmit = function (e) {
            e.preventDefault(); var sb = fm.querySelector('[type=submit]'), er = fm.querySelector('.ghh-form__err'); busy(sb, true); er.hidden = true;
            api('files', null, { json: { op: 'write', path: full(f.name), content: ta.value } }).then(function (x) { busy(sb, false); dirty = false; toast(x.message); }, function (e2) { busy(sb, false); if (e2.code === 'expired') return expired(); er.textContent = e2.message; er.hidden = false; });
          };
          ta.focus(); slot.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, function (e) { slot.innerHTML = ''; fail(e); });
      };
      bindAll = function () {
        [].forEach.call(list.querySelectorAll('[data-open]'), function (b) { b.onclick = function () { S.path = full(ents[+b.getAttribute('data-open')].name); load(); }; });
        [].forEach.call(list.querySelectorAll('[data-i]'), function (cell) {
          var f = ents[+cell.getAttribute('data-i')], q = function (s) { return cell.querySelector(s); };
          if (q('[data-ed]')) q('[data-ed]').onclick = function () { editor(f); };
          if (q('[data-dl]')) q('[data-dl]').onclick = function () {
            var b = q('[data-dl]'); busy(b, true);
            api('files', { op: 'download', path: full(f.name) }, { raw: true }).then(function (r) { return r.blob(); }).then(function (blob) {
              busy(b, false); var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = f.name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
            }, function (e) { busy(b, false); fail(e); });
          };
          if (q('[data-rn]')) q('[data-rn]').onclick = function () { formPanel(slot, 'Rename ' + f.name, fld('to', 'New name', { value: f.name, required: true }), 'Rename', function (v) { return api('files', null, { json: { op: 'rename', path: S.path, from: f.name, to: v.to } }).then(function (r) { toast(r.message); load(); }); }); };
          if (q('[data-del]')) q('[data-del]').onclick = function () { confirmIn(cell, 'Delete ' + (f.type === 'dir' ? 'folder ' + f.name + ' and everything in it' : f.name) + '?', 'Delete', function (back) { api('files', null, { json: { op: 'delete', path: S.path, names: [f.name] } }).then(function (r) { toast(r.message); load(); }, function (e) { fail(e); back(); }); }); };
        });
      };
      var mk = body.querySelector('[data-mk]');
      if (mk) mk.onclick = function () { formPanel(slot, 'New folder in ' + S.path, fld('name', 'Folder name', { required: true }), 'Create folder', function (v) { return api('files', null, { json: { op: 'mkdir', path: S.path, name: v.name } }).then(function (r) { toast(r.message); load(); }); }); };
      var upIn = body.querySelector('[data-up]');
      if (upIn) upIn.onchange = function () {
        var fl = [].slice.call(upIn.files || []); upIn.value = '';
        var big = fl.filter(function (x) { return x.size > lim.transferBytes; });
        if (big.length) toast(big.map(function (x) { return x.name; }).join(', ') + ': larger than ' + bytes(lim.transferBytes) + '. Use FTP for big files.', 'err');
        fl = fl.filter(function (x) { return x.size <= lim.transferBytes; });
        var lbl = body.querySelector('.ghh-upload'); lbl.classList.add('is-busy');
        (function next() {
          var x = fl.shift();
          if (!x) { lbl.classList.remove('is-busy'); return load(); }
          var fd = new FormData(); fd.append('op', 'upload'); fd.append('path', S.path); fd.append('file', x, x.name);
          api('files', null, { form: fd }).then(function (r) { toast(r.message); next(); }, function (e) { fail(e); next(); });
        })();
      };
      load();
    }

    /* ------------------------------------------------------------ Databases */
    function databases() {
      body.innerHTML = bar('MySQL databases', 'Databases for your websites and apps. Connect with host <code>localhost</code>.', can('databases', 'create') ? '<button type="button" class="ghh-btn ghh-btn--pri" data-add>' + ic('plus') + ' New database</button>' : '') + '<div data-slot></div><div data-list>' + skel(3) + '</div>';
      var list = body.querySelector('[data-list]'), slot = body.querySelector('[data-slot]'), dbs = [], prefix = '';
      var load = function () { list.innerHTML = skel(3); api('databases').then(function (r) { dbs = r.databases; prefix = r.prefix; render(); }, function (e) { fail(e, list); retryOn(list, load); }); };
      var create = function () {
        formPanel(slot, 'New database', fld('name', 'Database name', { required: true, prefix: prefix, placeholder: 'shop' }) + fld('user', 'Database user', { required: true, prefix: prefix, placeholder: 'shop' }) + fld('password', 'Password', { type: 'password', required: true, wide: true, hint: 'Save it now: it cannot be shown again.' }), 'Create database', function (v) {
          return api('databases', null, { json: { op: 'create', name: v.name, user: v.user, password: v.password } }).then(function (r) { toast(r.message); load(); });
        });
      };
      var render = function () {
        if (!dbs.length) { list.innerHTML = empty('databases', 'No databases yet', 'WordPress and most web apps need one MySQL database and a user.', can('databases', 'create') ? '<button type="button" class="ghh-btn ghh-btn--pri" data-add2>' + ic('plus') + ' New database</button>' : ''); var a2 = list.querySelector('[data-add2]'); if (a2) a2.onclick = create; return; }
        list.innerHTML = '<div class="ghh-cards">' + dbs.map(function (db, i) {
          return '<article class="ghh-card" data-db="' + i + '"><header><span class="ghh-ficon ghh-ficon--db">' + ic('databases', 16) + '</span><h4>' + esc(db.name) + '</h4>' + (db.sizeMb != null ? '<span class="ghh-muted">' + esc(db.sizeMb) + ' MB</span>' : '') +
            '<div class="ghh-act" data-dbact>' + (can('databases', 'delete') ? '<button type="button" class="ghh-icon ghh-icon--danger" data-deldb aria-label="Delete database ' + esc(db.name) + '">' + ic('trash') + '</button>' : '') + '</div></header>' +
            '<ul class="ghh-users">' + (db.users.length ? db.users.map(function (u, j) {
              return '<li data-u="' + j + '"><span>' + ic('user', 14) + ' <code>' + esc(u) + '</code></span><span class="ghh-act">' + (can('databases', 'password') ? '<button type="button" class="ghh-btn ghh-btn--sm" data-upw>' + ic('key', 14) + ' Password</button>' : '') + (can('databases', 'users') ? '<button type="button" class="ghh-icon ghh-icon--danger" data-udel aria-label="Remove user ' + esc(u) + '">' + ic('x') + '</button>' : '') + '</span></li>';
            }).join('') : '<li class="ghh-muted">No users can reach this database yet.</li>') + '</ul>' +
            (can('databases', 'users') ? '<button type="button" class="ghh-link" data-uadd>' + ic('plus', 14) + ' Add user</button>' : '') + '</article>';
        }).join('') + '</div>';
        bindAll();
      };
      bindAll = function () {
        [].forEach.call(list.querySelectorAll('[data-db]'), function (card) {
          var db = dbs[+card.getAttribute('data-db')], q = function (s) { return card.querySelector(s); };
          if (q('[data-deldb]')) q('[data-deldb]').onclick = function () { confirmIn(q('[data-dbact]'), 'Delete ' + db.name + ' and all its tables?', 'Delete', function (back) { api('databases', null, { json: { op: 'delete', name: db.name } }).then(function (r) { toast(r.message); load(); }, function (e) { fail(e); back(); }); }); };
          if (q('[data-uadd]')) q('[data-uadd]').onclick = function () { formPanel(slot, 'Add a user to ' + db.name, fld('user', 'User name', { required: true, prefix: prefix }) + fld('password', 'Password', { type: 'password', required: true }), 'Add user', function (v) { return api('databases', null, { json: { op: 'addUser', db: db.name, user: v.user, password: v.password } }).then(function (r) { toast(r.message); load(); }); }); };
          [].forEach.call(card.querySelectorAll('[data-u]'), function (li) {
            var u = db.users[+li.getAttribute('data-u')], pw = li.querySelector('[data-upw]'), del = li.querySelector('[data-udel]');
            if (pw) pw.onclick = function () { formPanel(slot, 'New password for ' + u, fld('password', 'New password', { type: 'password', required: true }), 'Change password', function (v) { return api('databases', null, { json: { op: 'password', db: db.name, user: u, password: v.password } }).then(function (r) { toast(r.message); }); }); };
            if (del) del.onclick = function () { confirmIn(li, 'Remove ' + u + ' from ' + db.name + '?', 'Remove', function (back) { api('databases', null, { json: { op: 'removeUser', db: db.name, user: u } }).then(function (r) { toast(r.message); load(); }, function (e) { fail(e); back(); }); }); };
          });
        });
      };
      var add = body.querySelector('[data-add]'); if (add) add.onclick = create;
      load();
    }

    /* ------------------------------------------------------------ shared: simple list views */
    function addBtn(label, attr) { return '<button type="button" class="ghh-btn ghh-btn--pri" ' + (attr || 'data-add') + '>' + ic('plus') + ' ' + esc(label) + '</button>'; }
    function table(cols, rows) {
      return '<div class="ghh-tw"><table class="ghh-t"><thead><tr>' + cols.map(function (c) { return '<th scope="col">' + (c ? esc(c) : '<span class="ghh-sr">Actions</span>') + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
    }
    function delCell(i, label) { return '<td class="ghh-act" data-i="' + i + '"><button type="button" class="ghh-icon ghh-icon--danger" data-del aria-label="' + esc(label) + '">' + ic('trash') + '</button></td>'; }
    /** Generic list view: cfg = { section, title, sub, addLabel, emptyIcon, emptyTitle, emptyText, query, pick(r), render(items) -> rows[], cols, form() -> [title, fields, submit], submit(v) -> json, del(item) -> [question, json], canAdd, canDel } */
    function listView(cfg) {
      body.innerHTML = bar(cfg.title, cfg.sub, cfg.canAdd ? addBtn(cfg.addLabel) : '') + (cfg.extraTop || '') + '<div data-slot></div><div data-list>' + skel(3) + '</div>' + (cfg.after || '');
      var list = body.querySelector('[data-list]'), slot = body.querySelector('[data-slot]'), items = [];
      var load = function () {
        list.innerHTML = skel(3);
        api(cfg.section, cfg.query || null).then(function (r) { items = cfg.pick(r); render(); }, function (e) { if (cfg.onError) return cfg.onError(e, list, open); fail(e, list); retryOn(list, load); });
      };
      var open = function () { var f = cfg.form(); formPanel(slot, f[0], f[1], f[2], function (v) { return api(cfg.section, null, { json: cfg.submit(v) }).then(function (r) { toast(r.message); load(); }); }); if (cfg.afterForm) cfg.afterForm(slot.querySelector('form')); };
      var render = function () {
        if (!items.length) { list.innerHTML = empty(cfg.emptyIcon, cfg.emptyTitle, cfg.emptyText, cfg.canAdd ? addBtn(cfg.addLabel, 'data-add2') : ''); var a2 = list.querySelector('[data-add2]'); if (a2) a2.onclick = open; return; }
        list.innerHTML = table(cfg.cols, cfg.render(items));
        bindAll();
      };
      bindAll = function () {
        [].forEach.call(list.querySelectorAll('[data-del]'), function (b) {
          b.onclick = function () {
            var cell = b.closest('[data-i]'), it = items[+cell.getAttribute('data-i')], q = cfg.del(it);
            confirmIn(cell, q[0], q[2] || 'Delete', function (back) { api(cfg.section, null, { json: q[1] }).then(function (r) { toast(r.message); load(); }, function (e) { fail(e); back(); }); });
          };
        });
        if (cfg.bind) cfg.bind(list, items, slot, load);
      };
      var add = body.querySelector('[data-add]'); if (add) add.onclick = open;
      load();
      return { load: load };
    }
    var mb = function (n) { return n >= 1024 ? (n / 1024).toFixed(n >= 10240 ? 0 : 1) + ' GB' : (Math.round(n * 10) / 10) + ' MB'; };

    /* ------------------------------------------------------------ Overview */
    function overview() {
      body.innerHTML = bar('Overview', 'Your hosting plan usage at a glance.', '<button type="button" class="ghh-btn" data-re>' + ic('refresh') + ' Refresh</button>') + '<div data-list>' + skel(4) + '</div>';
      var list = body.querySelector('[data-list]');
      var load = function () {
        list.innerHTML = skel(4);
        api('overview').then(function (r) {
          var meta = [r.plan ? ['Plan', r.plan] : null, r.ip ? ['IP address', r.ip] : null, ['Username', S.session.username], S.session.server ? ['Server', S.session.server] : null].filter(Boolean);
          var big = r.items.filter(function (x) { return x.unit === 'MB' || x.key === 'inode'; }), small = r.items.filter(function (x) { return !(x.unit === 'MB' || x.key === 'inode'); });
          var card = function (x, lg) {
            var pct = x.limit ? Math.min(100, Math.round(x.used / x.limit * 100)) : 0, fmt = x.unit === 'MB' ? mb : function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
            return '<div class="ghh-stat' + (lg ? ' ghh-stat--lg' : '') + (pct >= 90 ? ' is-high' : '') + '"><span class="ghh-stat__l">' + esc(x.label) + '</span><b>' + esc(fmt(x.used)) + '</b><span class="ghh-stat__of">' + (x.limit ? 'of ' + esc(fmt(x.limit)) : 'Unlimited') + '</span>' +
              '<div class="ghh-meter" role="meter" aria-label="' + esc(x.label) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + (x.limit ? Math.max(pct, 2) : 2) + '%"></i></div>' + (x.limit ? '<span class="ghh-stat__pct">' + pct + '% used</span>' : '') + '</div>';
          };
          var quick = [['email', 'Create a mailbox'], ['dns', 'Edit DNS records'], ['files', 'Open file manager'], ['backups', 'Make a backup']].filter(function (q) { return root.querySelector('[data-tab=' + q[0] + ']'); });
          list.innerHTML = (r.suspended ? '<div class="ghh-alert" role="alert">' + ic('alert', 18) + '<span>This hosting account is suspended. Contact support to restore it.</span></div>' : '') +
            '<dl class="ghh-meta">' + meta.map(function (m) { return '<div><dt>' + esc(m[0]) + '</dt><dd>' + esc(m[1]) + '</dd></div>'; }).join('') + '</dl>' +
            (big.length ? '<div class="ghh-stats ghh-stats--lg">' + big.map(function (x) { return card(x, true); }).join('') + '</div>' : '') +
            (small.length ? '<div class="ghh-stats">' + small.map(function (x) { return card(x); }).join('') + '</div>' : '') +
            (quick.length ? '<h4 class="ghh-h4">Quick actions</h4><div class="ghh-quick">' + quick.map(function (q) { return '<button type="button" class="ghh-quick__it" data-go-tab="' + q[0] + '"><span class="ghh-ficon ghh-ficon--db">' + ic(q[0], 16) + '</span>' + esc(q[1]) + '<i aria-hidden="true">' + ic('redirects', 14) + '</i></button>'; }).join('') + '</div>' : '');
          [].forEach.call(list.querySelectorAll('[data-go-tab]'), function (b) { b.onclick = function () { show(b.getAttribute('data-go-tab'), true); }; });
        }, function (e) { fail(e, list); retryOn(list, load); });
      };
      body.querySelector('[data-re]').onclick = load;
      load();
    }

    /* ------------------------------------------------------------ Subdomains, aliases, redirects */
    function subdomains() {
      var d = S.domain;
      listView({ section: 'subdomains', query: { domain: d }, title: 'Subdomains', sub: 'Extra sites like <b>shop.' + esc(d) + '</b>, each with its own folder.', addLabel: 'New subdomain', canAdd: can('subdomains', 'add'),
        emptyIcon: 'subdomains', emptyTitle: 'No subdomains yet', emptyText: 'Create blog.' + d + ' or shop.' + d + ' for a separate site.', cols: ['Subdomain', 'Folder', ''],
        pick: function (r) { return r.subdomains; },
        render: function (xs) { return xs.map(function (x, i) { return '<tr><td data-l="Subdomain"><b class="ghh-strong">' + esc(x + '.' + d) + '</b></td><td data-l="Folder"><code>domains/' + esc(d) + '/public_html/' + esc(x) + '</code></td>' + (can('subdomains', 'delete') ? delCell(i, 'Delete ' + x + '.' + d) : '<td></td>') + '</tr>'; }); },
        form: function () { return ['New subdomain', fld('label', 'Subdomain', { required: true, suffix: '.' + d, placeholder: 'shop', wide: true }), 'Create subdomain']; },
        submit: function (v) { return { op: 'add', domain: d, label: v.label }; },
        del: function (x) { return ['Delete ' + x + '.' + d + '? Its files stay in your account.', { op: 'delete', domain: d, label: x, contents: false }]; } });
    }
    function aliases() {
      var d = S.domain;
      listView({ section: 'aliases', query: { domain: d }, title: 'Domain aliases', sub: 'Other domains that show the same website as <b>' + esc(d) + '</b>. Point the alias domain\'s DNS to this server first.', addLabel: 'Add alias', canAdd: can('aliases', 'add'),
        emptyIcon: 'aliases', emptyTitle: 'No aliases yet', emptyText: 'Make ' + d.replace(/\.[^.]+$/, '') + '.net open the same site as ' + d + '.', cols: ['Domain', 'Type', ''],
        pick: function (r) { return r.aliases; },
        render: function (xs) { return xs.map(function (x, i) { return '<tr><td data-l="Domain"><b class="ghh-strong">' + esc(x.name) + '</b></td><td data-l="Type">' + (x.type === 'alias' ? '<span class="ghh-pill ghh-pill--ok">Alias (same site)</span>' : '<span class="ghh-pill ghh-pill--muted">Redirect to ' + esc(d) + '</span>') + '</td>' + (can('aliases', 'delete') ? delCell(i, 'Remove ' + x.name) : '<td></td>') + '</tr>'; }); },
        form: function () { return ['Add a domain alias', fld('name', 'Alias domain', { required: true, placeholder: 'example.net' }) + fld('alias', 'Behaviour', { options: [['yes', 'Show the same website'], ['no', 'Redirect visitors to ' + d]], value: 'yes' }), 'Add alias']; },
        submit: function (v) { return { op: 'add', domain: d, name: v.name, alias: v.alias !== 'no' }; },
        del: function (x) { return ['Remove alias ' + x.name + '?', { op: 'delete', domain: d, name: x.name }, 'Remove']; } });
    }
    function redirects() {
      var d = S.domain;
      listView({ section: 'redirects', query: { domain: d }, title: 'Redirects', sub: 'Send visitors from an old address on <b>' + esc(d) + '</b> to a new one.', addLabel: 'New redirect', canAdd: can('redirects', 'add'),
        emptyIcon: 'redirects', emptyTitle: 'No redirects yet', emptyText: 'Moved a page? Redirect /old-page to its new address so links and search rankings keep working.', cols: ['From', 'To', 'Type', ''],
        pick: function (r) { return r.redirects; },
        render: function (xs) { return xs.map(function (x, i) { return '<tr><td data-l="From"><code>' + esc(d + x.path) + '</code></td><td data-l="To" class="ghh-wrap"><code>' + esc(x.to) + '</code></td><td data-l="Type"><span class="ghh-pill ghh-pill--muted">' + esc(x.type) + (x.type === '301' ? ' permanent' : ' temporary') + '</span></td>' + (can('redirects', 'delete') ? delCell(i, 'Delete redirect ' + x.path) : '<td></td>') + '</tr>'; }); },
        form: function () { return ['New redirect', fld('path', 'From path', { required: true, prefix: d, placeholder: '/old-page' }) + fld('to', 'To address', { required: true, type: 'url', placeholder: 'https://' + d + '/new-page' }) + fld('type', 'Type', { options: [['301', '301 Permanent (best for SEO)'], ['302', '302 Temporary'], ['303', '303 See other']], value: '301', wide: true }), 'Add redirect']; },
        submit: function (v) { return { op: 'add', domain: d, path: v.path.charAt(0) === '/' ? v.path : '/' + v.path, to: v.to, type: v.type }; },
        del: function (x) { return ['Delete the redirect from ' + x.path + '?', { op: 'delete', domain: d, path: x.path }]; } });
    }

    /* ------------------------------------------------------------ PHP */
    function php() {
      var d = S.domain;
      body.innerHTML = bar('PHP version', 'Choose the PHP version <b>' + esc(d) + '</b> runs on. Check your site after switching.', '') + '<div data-list>' + skel(2) + '</div>';
      var list = body.querySelector('[data-list]');
      var load = function () {
        list.innerHTML = skel(2);
        api('php', { domain: d }).then(function (r) {
          if (!r.options.length) { list.innerHTML = empty('php', 'Only one PHP version', 'This server offers a single PHP version for ' + d + '.'); return; }
          list.innerHTML = '<form class="ghh-php" data-f><fieldset><legend class="ghh-sr">PHP version for ' + esc(d) + '</legend><div class="ghh-choices">' + r.options.map(function (o) {
            var on = o.id === r.current;
            return '<label class="ghh-choice' + (on ? ' is-on' : '') + '"><input type="radio" name="php" value="' + esc(o.id) + '"' + (on ? ' checked' : '') + (can('php', 'set') ? '' : ' disabled') + '><span class="ghh-choice__mk" aria-hidden="true"></span><span class="ghh-choice__tx"><b>' + esc(o.label) + '</b>' + (on ? '<em>Current</em>' : '') + '</span></label>';
          }).join('') + '</div></fieldset>' + (can('php', 'set') ? '<div class="ghh-form__foot"><button type="submit" class="ghh-btn ghh-btn--pri" disabled>Switch version</button></div>' : '') + '</form>';
          var f = list.querySelector('form'), sb = f.querySelector('[type=submit]');
          f.onchange = function () { [].forEach.call(f.querySelectorAll('.ghh-choice'), function (l) { l.classList.toggle('is-on', l.querySelector('input').checked); }); if (sb) sb.disabled = (f.php.value || '') === r.current; };
          f.onsubmit = function (e) { e.preventDefault(); busy(sb, true); api('php', null, { json: { op: 'set', domain: d, id: f.php.value } }).then(function (x) { toast(x.message); load(); }, function (er) { busy(sb, false); fail(er); }); };
        }, function (e) { fail(e, list); retryOn(list, load); });
      };
      load();
    }

    /* ------------------------------------------------------------ Autoresponders + vacation */
    function autoresponders() {
      var d = S.domain, vac = can('autoresponders', 'vacation');
      body.innerHTML = bar('Autoresponders', 'Automatic replies for addresses on <b>' + esc(d) + '</b>.', can('autoresponders', 'create') ? addBtn('New autoresponder') : '') + '<div data-slot></div><div data-list>' + skel(2) + '</div>' +
        (vac ? '<div class="ghh-sep"></div>' + bar('Vacation messages', 'Replies that run only between two dates, then switch off by themselves.', addBtn('New vacation message', 'data-addv')) + '<div data-vslot></div><div data-vlist>' + skel(2) + '</div>' : '');
      var list = body.querySelector('[data-list]'), slot = body.querySelector('[data-slot]'), vlist = body.querySelector('[data-vlist]'), vslot = body.querySelector('[data-vslot]'), A = [], V = [];
      var load = function () {
        api('autoresponders', { domain: d }).then(function (r) { A = r.autoresponders; V = r.vacations || []; render(); }, function (e) { fail(e, list); retryOn(list, load); if (vlist) vlist.innerHTML = ''; });
      };
      var newA = function () { formPanel(slot, 'New autoresponder', fld('user', 'For address', { required: true, suffix: '@' + d, placeholder: 'info' }) + fld('cc', 'Send a copy to (optional)', { type: 'email', placeholder: 'you@example.com' }) + fld('text', 'Reply message', { area: true, required: true, wide: true }), 'Save autoresponder', function (v) { return api('autoresponders', null, { json: { op: 'create', domain: d, user: v.user, cc: v.cc, text: v.text } }).then(function (r) { toast(r.message); load(); }); }); };
      var today = new Date().toISOString().slice(0, 10), week = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
      var newV = function () { formPanel(vslot, 'New vacation message', fld('user', 'For address', { required: true, suffix: '@' + d, placeholder: 'info', wide: true }) + fld('start', 'From', { type: 'date', value: today, required: true }) + fld('end', 'Until', { type: 'date', value: week, required: true }) + fld('text', 'Message', { area: true, required: true, wide: true, value: 'Thanks for your email. I am away and will reply when I am back.' }), 'Save vacation message', function (v) { return api('autoresponders', null, { json: { op: 'vacation', domain: d, user: v.user, start: v.start, end: v.end, text: v.text } }).then(function (r) { toast(r.message); load(); }); }); };
      var render = function () {
        list.innerHTML = A.length ? table(['Address', 'Copy sent to', ''], A.map(function (x, i) { return '<tr><td data-l="Address"><b class="ghh-strong">' + esc(x.email) + '</b></td><td data-l="Copy to">' + (x.cc ? esc(x.cc) : '<span class="ghh-muted">No copy</span>') + '</td>' + (can('autoresponders', 'delete') ? '<td class="ghh-act" data-i="' + i + '" data-k="a"><button type="button" class="ghh-icon ghh-icon--danger" data-del aria-label="Delete autoresponder ' + esc(x.email) + '">' + ic('trash') + '</button></td>' : '<td></td>') + '</tr>'; }))
          : empty('autoresponders', 'No autoresponders', 'Reply instantly to everyone who writes to support@' + d + ', for example with your opening hours.', can('autoresponders', 'create') ? addBtn('New autoresponder', 'data-add2') : '');
        var a2 = list.querySelector('[data-add2]'); if (a2) a2.onclick = newA;
        if (vlist) vlist.innerHTML = V.length ? table(['Address', 'Active', ''], V.map(function (x, i) { return '<tr><td data-l="Address"><b class="ghh-strong">' + esc(x.email) + '</b></td><td data-l="Active">' + (x.start ? esc(x.start) + ' to ' + esc(x.end || '') : '<span class="ghh-muted">Scheduled</span>') + '</td><td class="ghh-act" data-i="' + i + '" data-k="v"><button type="button" class="ghh-icon ghh-icon--danger" data-del aria-label="Delete vacation message ' + esc(x.email) + '">' + ic('trash') + '</button></td></tr>'; }))
          : '<p class="ghh-note">No vacation messages scheduled.</p>';
        bindAll();
      };
      bindAll = function () {
        [].forEach.call(body.querySelectorAll('[data-del]'), function (b) {
          b.onclick = function () {
            var cell = b.closest('[data-i]'), isV = cell.getAttribute('data-k') === 'v', x = (isV ? V : A)[+cell.getAttribute('data-i')];
            confirmIn(cell, 'Delete the ' + (isV ? 'vacation message' : 'autoresponder') + ' for ' + x.email + '?', 'Delete', function (back) { api('autoresponders', null, { json: { op: isV ? 'removeVacation' : 'delete', domain: d, user: x.user } }).then(function (r) { toast(r.message); load(); }, function (e) { fail(e); back(); }); });
          };
        });
      };
      var add = body.querySelector('[data-add]'); if (add) add.onclick = newA;
      var addv = body.querySelector('[data-addv]'); if (addv) addv.onclick = newV;
      load();
    }

    /* ------------------------------------------------------------ Spam */
    function spam() {
      var d = S.domain;
      body.innerHTML = bar('Spam filter', 'SpamAssassin settings for mail to <b>' + esc(d) + '</b>.', '') + '<div data-list>' + skel(3) + '</div>';
      var list = body.querySelector('[data-list]');
      var load = function () {
        list.innerHTML = skel(3);
        api('spam', { domain: d }).then(function (r) {
          if (!r.available) { list.innerHTML = empty('spam', 'Spam filter not available', 'SpamAssassin is not enabled for this account. Ask support to switch it on.'); return; }
          var where = [['inbox', 'Deliver to the inbox, marked as spam'], ['spamfolder', 'Move to a shared spam folder'], ['userspamfolder', 'Move to each mailbox\'s Junk folder'], ['delete', 'Delete it']];
          list.innerHTML = '<form class="ghh-panel" data-f novalidate>' +
            '<label class="ghh-switch"><input type="checkbox" name="enabled"' + (r.enabled ? ' checked' : '') + '><span class="ghh-switch__t" aria-hidden="true"></span><span><b>Filter spam</b><small>Score every incoming message and act on likely spam.</small></span></label>' +
            '<div class="ghh-form__grid" data-opts>' +
            fld('threshold', 'Spam score threshold', { type: 'number', min: 1, value: r.threshold, hint: 'Lower catches more spam but risks real mail. 5 is a good default.' }) +
            fld('where', 'When a message is spam', { options: where, value: r.where }) +
            fld('highScore', 'Very high score', { type: 'number', min: 1, value: r.highScore, hint: 'Messages above this score can be deleted outright.' }) +
            '<div class="ghh-fld"><span class="ghh-lbl">&nbsp;</span><label class="ghh-check"><input type="checkbox" name="highScoreBlock"' + (r.highScoreBlock ? ' checked' : '') + '> Delete mail above the very high score</label></div>' +
            '</div><p class="ghh-form__err" role="alert" hidden></p>' + (can('spam', 'set') ? '<div class="ghh-form__foot"><button type="submit" class="ghh-btn ghh-btn--pri">Save settings</button></div>' : '') + '</form>';
          var f = list.querySelector('form'), opts = f.querySelector('[data-opts]'), err = f.querySelector('.ghh-form__err');
          var sync = function () { opts.classList.toggle('is-off', !f.enabled.checked); [].forEach.call(opts.querySelectorAll('input,select'), function (x) { x.disabled = !f.enabled.checked; }); };
          f.enabled.onchange = sync; sync();
          var thr = f.querySelector('[name=threshold]'); if (thr) thr.step = '0.5';
          f.onsubmit = function (e) {
            e.preventDefault(); var sb = f.querySelector('[type=submit]'); busy(sb, true); err.hidden = true;
            api('spam', null, { json: { op: 'set', domain: d, settings: { enabled: f.enabled.checked, threshold: +thr.value, where: f.querySelector('[name=where]').value, highScore: +f.querySelector('[name=highScore]').value, highScoreBlock: f.highScoreBlock.checked } } })
              .then(function (x) { busy(sb, false); toast(x.message); }, function (er) { busy(sb, false); if (er.code === 'expired') return expired(); err.textContent = er.message; err.hidden = false; });
          };
        }, function (e) { fail(e, list); retryOn(list, load); });
      };
      load();
    }

    /* ------------------------------------------------------------ FTP */
    function ftp() {
      var d = S.domain;
      listView({ section: 'ftp', query: { domain: d }, title: 'FTP accounts', sub: 'Logins for FileZilla and other FTP apps. Server: <code>ftp.' + esc(d) + '</code>, port 21.', addLabel: 'New FTP account', canAdd: can('ftp', 'create'),
        emptyIcon: 'ftp', emptyTitle: 'No extra FTP accounts', emptyText: 'Give a designer or developer access to just one folder of your site.', cols: ['Login', 'Folder', ''],
        pick: function (r) { return r.accounts; },
        render: function (xs) { return xs.map(function (x, i) { return '<tr><td data-l="Login"><b class="ghh-strong">' + esc(x.login) + '</b></td><td data-l="Folder"><code>' + esc(x.path || '/') + '</code></td><td class="ghh-act" data-i="' + i + '">' + (can('ftp', 'password') ? '<button type="button" class="ghh-btn ghh-btn--sm" data-pw>' + ic('key', 14) + ' Password</button>' : '') + (can('ftp', 'delete') ? '<button type="button" class="ghh-icon ghh-icon--danger" data-del aria-label="Delete ' + esc(x.login) + '">' + ic('trash') + '</button>' : '') + '</td></tr>'; }); },
        form: function () { return ['New FTP account', fld('user', 'User name', { required: true, suffix: '@' + d, placeholder: 'designer' }) + fld('password', 'Password', { type: 'password', required: true }) + fld('dirType', 'Access to', { options: [['@domain', 'The website folder (public_html)'], ['@ftp', 'The public FTP folder'], ['custom', 'A specific folder']], value: '@domain' }) + fld('dir', 'Folder', { prefix: '~', placeholder: '/domains/' + d + '/public_html/uploads', hidden: true }), 'Create account']; },
        afterForm: function (f) { var t = f.querySelector('[name=dirType]'), box = f.querySelector('[data-f=dir]'); t.onchange = function () { box.hidden = t.value !== 'custom'; }; },
        submit: function (v) { return { op: 'create', domain: d, user: v.user, password: v.password, dir: v.dirType === 'custom' ? v.dir || '/' : v.dirType }; },
        del: function (x) { return ['Delete FTP login ' + x.login + '? Files stay.', { op: 'delete', domain: d, user: x.user }]; },
        bind: function (list, items, slot) { [].forEach.call(list.querySelectorAll('[data-pw]'), function (b) { b.onclick = function () { var x = items[+b.closest('[data-i]').getAttribute('data-i')]; formPanel(slot, 'New password for ' + x.login, fld('password', 'New password', { type: 'password', required: true, wide: true }), 'Change password', function (v) { return api('ftp', null, { json: { op: 'password', domain: d, user: x.user, password: v.password } }).then(function (r) { toast(r.message); }); }); }; }); } });
    }

    /* ------------------------------------------------------------ Protected folders */
    function protect() {
      var d = S.domain, base = '/domains/' + d + '/public_html';
      listView({ section: 'protect', title: 'Protected folders', sub: 'Ask for a user name and password before anyone can open a folder of your website.', addLabel: 'Protect a folder', canAdd: can('protect', 'add'),
        emptyIcon: 'protect', emptyTitle: 'No protected folders', emptyText: 'Lock a staging site or an admin area with a password.', cols: ['Folder', 'Login prompt', 'Users', ''],
        pick: function (r) { return r.folders; },
        onError: function (e, list) { list.innerHTML = '<div class="ghh-alert ghh-alert--soft">' + ic('alert', 18) + '<span>Existing protected folders could not be listed (' + esc(e.message) + '). You can still protect a folder.</span></div>'; },
        render: function (xs) { return xs.map(function (x, i) { return '<tr><td data-l="Folder"><code>' + esc(x.path) + '</code></td><td data-l="Prompt">' + esc(x.realm || '') + '</td><td data-l="Users">' + (x.users.length ? esc(x.users.join(', ')) : '<span class="ghh-muted">None</span>') + '</td>' + (can('protect', 'delete') ? delCell(i, 'Remove protection from ' + x.path) : '<td></td>') + '</tr>'; }); },
        form: function () { return ['Protect a folder on ' + d, fld('sub', 'Folder', { prefix: 'public_html/', placeholder: 'admin', required: true, wide: true, hint: 'The folder must already exist. Use / for the whole site.' }) + fld('realm', 'Login prompt', { value: 'Members only', required: true }) + fld('user', 'User name', { required: true }) + fld('password', 'Password', { type: 'password', required: true, wide: true }), 'Protect folder']; },
        submit: function (v) { var sub = String(v.sub || '').replace(/^\/+|\/+$/g, ''); return { op: 'add', path: base + (sub ? '/' + sub : ''), realm: v.realm, user: v.user, password: v.password }; },
        del: function (x) { return ['Remove password protection from ' + x.path + '?', { op: 'delete', path: x.path }, 'Remove']; } });
    }

    /* ------------------------------------------------------------ Cron */
    var PRESETS = [['', 'Choose a common schedule'], ['*/5 * * * *', 'Every 5 minutes'], ['*/15 * * * *', 'Every 15 minutes'], ['0 * * * *', 'Every hour'], ['0 3 * * *', 'Every day at 03:00'], ['0 3 * * 1', 'Every Monday at 03:00'], ['0 3 1 * *', 'First day of each month at 03:00']];
    function cronText(j) {
      var k = [j.minute, j.hour, j.dayofmonth, j.month, j.dayofweek].join(' ');
      var p = PRESETS.filter(function (x) { return x[0] === k; })[0];
      return p ? p[1] : '';
    }
    function cron() {
      var FIELDS = [['minute', 'Minute', '0-59'], ['hour', 'Hour', '0-23'], ['dayofmonth', 'Day', '1-31'], ['month', 'Month', '1-12'], ['dayofweek', 'Weekday', '0-7, 0 = Sun']];
      listView({ section: 'cron', title: 'Cron jobs', sub: 'Run a script on a schedule (server time), for example WordPress tasks or backups. Commands run as your hosting user.', addLabel: 'New cron job', canAdd: can('cron', 'add'),
        emptyIcon: 'cron', emptyTitle: 'No cron jobs', emptyText: 'Schedule a PHP script, e.g. /usr/local/bin/php ~/domains/site/public_html/cron.php', cols: ['Schedule', 'Command', ''],
        pick: function (r) { return r.jobs; },
        render: function (xs) { return xs.map(function (j, i) { var t = cronText(j); return '<tr><td data-l="Schedule"><code class="ghh-cron">' + esc([j.minute, j.hour, j.dayofmonth, j.month, j.dayofweek].join(' ')) + '</code>' + (t ? '<small class="ghh-muted ghh-block">' + esc(t) + '</small>' : '') + '</td><td data-l="Command" class="ghh-wrap"><code>' + esc(j.command) + '</code></td>' + (can('cron', 'delete') ? delCell(i, 'Delete cron job') : '<td></td>') + '</tr>'; }); },
        form: function () {
          return ['New cron job', fld('preset', 'Schedule', { options: PRESETS, value: '', wide: true }) + '<div class="ghh-cronf ghh-fld--wide">' + FIELDS.map(function (f) { return fld(f[0], f[1], { value: '*', required: true, hint: f[2] }); }).join('') + '</div>' + fld('command', 'Command', { required: true, wide: true, placeholder: '/usr/local/bin/php /home/' + S.session.username + '/domains/' + S.domain + '/public_html/cron.php' }), 'Add cron job'];
        },
        afterForm: function (f) { var pr = f.querySelector('[name=preset]'); pr.onchange = function () { if (!pr.value) return; pr.value.split(' ').forEach(function (v, i) { f.querySelector('[name=' + FIELDS[i][0] + ']').value = v; }); }; },
        submit: function (v) { return { op: 'add', minute: v.minute, hour: v.hour, dayofmonth: v.dayofmonth, month: v.month, dayofweek: v.dayofweek, command: v.command }; },
        del: function (j) { return ['Delete this cron job?', { op: 'delete', id: j.id }]; } });
    }

    /* ------------------------------------------------------------ WordPress */
    function wordpress() {
      listView({ section: 'wordpress', title: 'WordPress sites', sub: 'WordPress installations found on this account.', canAdd: false,
        emptyIcon: 'wordpress', emptyTitle: 'No WordPress sites found', emptyText: 'Install WordPress from the WordPress manager in your control panel, then it appears here.', cols: ['Site', 'Version', 'Folder'],
        pick: function (r) { return r.sites; },
        render: function (xs) { return xs.map(function (w) { return '<tr><td data-l="Site">' + (/^https?:\/\//.test(w.url) ? '<a class="ghh-strong" href="' + esc(w.url) + '" target="_blank" rel="noopener">' + esc(w.url.replace(/^https?:\/\//, '')) + ' ' + ic('ext', 13) + '</a>' : esc(w.url)) + '</td><td data-l="Version">' + (w.version ? '<span class="ghh-pill ghh-pill--muted">' + esc(w.version) + '</span>' : '') + '</td><td data-l="Folder"><code>' + esc(w.path) + '</code></td></tr>'; }); },
        form: function () { return ['', '', '']; }, submit: function () { return {}; }, del: function () { return ['', {}]; } });
    }

    /* ------------------------------------------------------------ SSL */
    function ssl() {
      body.innerHTML = bar('SSL certificates', 'Live HTTPS check of each domain on this account.', '<button type="button" class="ghh-btn" data-re>' + ic('refresh') + ' Check again</button>') + '<div data-list>' + skel(3) + '</div>';
      var list = body.querySelector('[data-list]'), rows = [], canIssue = false;
      var load = function () { list.innerHTML = skel(3); api('ssl').then(function (r) { rows = r.status; canIssue = r.canIssue; render(); }, function (e) { fail(e, list); retryOn(list, load); }); };
      var render = function () {
        if (!rows.length) { list.innerHTML = empty('ssl', 'No domains found', 'Add a domain to your hosting account first.'); return; }
        list.innerHTML = '<div class="ghh-cards">' + rows.map(function (s, i) {
          var ok = s.https && s.daysLeft > 14, warn = s.https && s.daysLeft <= 14;
          var badge = ok ? '<span class="ghh-pill ghh-pill--ok"><i class="ghh-hexdot"></i>Secure</span>' : warn ? '<span class="ghh-pill ghh-pill--warn">Expires soon</span>' : '<span class="ghh-pill ghh-pill--bad">Not secure</span>';
          return '<article class="ghh-card ghh-ssl" data-i="' + i + '"><header><span class="ghh-ficon ' + (ok ? 'ghh-ficon--ok' : 'ghh-ficon--bad') + '">' + ic('ssl', 16) + '</span><h4>' + esc(s.domain) + '</h4>' + badge + '</header>' +
            '<dl>' + (s.issuer ? '<div><dt>Issuer</dt><dd>' + esc(s.issuer) + '</dd></div>' : '') + (s.validTo ? '<div><dt>Valid until</dt><dd>' + new Date(s.validTo).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) + (s.daysLeft != null ? ' <span class="ghh-muted">(' + esc(s.daysLeft) + ' days)</span>' : '') + '</dd></div>' : '') + (s.error ? '<div><dt>Status</dt><dd>' + esc(s.error) + '</dd></div>' : '') + '</dl>' +
            (canIssue ? '<div class="ghh-ssl__go" data-go><label class="ghh-check"><input type="checkbox" data-www checked> Include www.' + esc(s.domain) + '</label><button type="button" class="ghh-btn ' + (ok ? '' : 'ghh-btn--pri') + '" data-issue>' + ic('shield', 15) + (s.https ? ' Renew now' : ' Issue free SSL') + '</button></div>' : '') + '</article>';
        }).join('') + '</div>';
        [].forEach.call(list.querySelectorAll('[data-issue]'), function (b) {
          b.onclick = function () {
            var card = b.closest('[data-i]'), s = rows[+card.getAttribute('data-i')];
            busy(b, true);
            api('ssl', null, { json: { op: 'issue', domain: s.domain, www: card.querySelector('[data-www]').checked } }).then(function (r) { busy(b, false); toast(r.message); setTimeout(load, 8000); }, function (e) { busy(b, false); fail(e); });
          };
        });
      };
      body.querySelector('[data-re]').onclick = load;
      load();
    }

    /* ------------------------------------------------------------ Backups */
    function backups() {
      body.innerHTML = bar('Backups', 'Copies of your websites, email and databases stored in your account.', can('backups', 'create') ? '<button type="button" class="ghh-btn ghh-btn--pri" data-new>' + ic('backups') + ' Create backup</button>' : '') + '<div data-list>' + skel(3) + '</div>';
      var list = body.querySelector('[data-list]'), items = [];
      var load = function () { list.innerHTML = skel(3); api('backups').then(function (r) { items = r.backups; render(); }, function (e) { fail(e, list); retryOn(list, load); }); };
      var render = function () {
        if (!items.length) { list.innerHTML = empty('backups', 'No backups yet', 'Create one before big changes such as a theme switch or plugin update.'); return; }
        list.innerHTML = '<div class="ghh-tw"><table class="ghh-t"><thead><tr><th scope="col">Backup</th><th scope="col">Size</th><th scope="col">Created</th><th scope="col"><span class="ghh-sr">Actions</span></th></tr></thead><tbody>' + items.map(function (b, i) {
          return '<tr><td data-l="Backup"><span class="ghh-fname"><span class="ghh-ficon">' + ic('backups', 16) + '</span><code>' + esc(b.name) + '</code></span></td><td data-l="Size">' + (b.size ? bytes(b.size) : '') + '</td><td data-l="Created">' + when(b.created) + '</td>' +
            '<td class="ghh-act" data-i="' + i + '">' + (can('backups', 'restore') ? '<button type="button" class="ghh-btn ghh-btn--sm" data-rs>Restore</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
        bindAll();
      };
      bindAll = function () {
        [].forEach.call(list.querySelectorAll('[data-rs]'), function (b) {
          b.onclick = function () { var cell = b.closest('[data-i]'), it = items[+cell.getAttribute('data-i')]; confirmIn(cell, 'Restore ' + it.name + '? Current files, email and databases are replaced.', 'Restore', function (back) { api('backups', null, { json: { op: 'restore', name: it.name } }).then(function (r) { toast(r.message); back(); }, function (e) { fail(e); back(); }); }); };
        });
      };
      var nb = body.querySelector('[data-new]');
      if (nb) nb.onclick = function () { busy(nb, true); api('backups', null, { json: { op: 'create' } }).then(function (r) { busy(nb, false); toast(r.message); setTimeout(load, 15000); }, function (e) { busy(nb, false); fail(e); }); };
      load();
    }
  }

  ready(function () {
    try {
      if (!/productdetails/.test(location.search) && !/\/services\/\d+/.test(location.pathname)) return;
      var tries = 0;
      (function wait() { if (window.GH_HOSTING && window.GH_HOSTING.token) mount(window.GH_HOSTING); else if (++tries < 10) setTimeout(wait, 300); })();
    } catch (e) {}
  });
})();
