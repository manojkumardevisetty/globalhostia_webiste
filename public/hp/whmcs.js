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
    if (document.getElementById('frmCheckout')) return;
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
      var hd = document.createElement('div'); hd.className = 'gh-avail'; hd.innerHTML = esc(b.getAttribute('data-domain')) + (avail ? '<small>✓ Available — register it before someone else does</small>' : '');
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

  ready(function () { try { setTimeout(clientFixes, 600); setTimeout(clientFixes, 2000); } catch (e) {} try { whatsapp(); } catch (e) {} try { promos(); } catch (e) {} try { domainPage(); } catch (e) {} try { suggestPager(); } catch (e) {} try { compare(); } catch (e) {} try { storeMega(); } catch (e) {} try { domainStep(); } catch (e) {} try { configure(); } catch (e) {} try { cartView(); } catch (e) {} try { checkout(); } catch (e) {} try { homepage(); } catch (e) {} try { blogHub(); } catch (e) {} try { groupedNav(); } catch (e) {} try { promo(); } catch (e) {} try { catBanner(); } catch (e) {} try { enhanceListing(); } catch (e) {} });
})();
