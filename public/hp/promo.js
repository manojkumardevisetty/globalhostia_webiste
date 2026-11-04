/* GlobalHostia promotions: announcement bar + pop-up (Admin → Marketing → Promotions).
   Website: loaded by the theme shell (config inlined as #ghp-data, bar server-rendered).
   Anywhere else (e.g. WHMCS client area):
     <script src="https://globalhostia.com/hp/promo.js" data-surface="clientarea" defer></script>
   It injects its own stylesheet, fetches /api/promo?surface=… from its own origin and renders the bar + pop-up. */
(function () {
  'use strict';
  if (window.__ghpPromo) return; window.__ghpPromo = 1;
  var me = document.currentScript || document.querySelector('script[src*="/hp/promo.js"]');
  if (!me) return;
  var src = new URL(me.src, location.href), origin = src.origin, ver = src.searchParams.get('v') || '';
  var surface = me.getAttribute('data-surface') === 'clientarea' ? 'clientarea' : 'website';
  var DAY = 864e5, now = Date.now();

  /* ---------- storage (may be blocked: private mode, cookies off, sandboxed iframes) ---------- */
  function store(kind) { try { var s = window[kind], k = '__ghp'; s.setItem(k, '1'); s.removeItem(k); return s; } catch (e) { return null; } }
  var LS = store('localStorage'), SS = store('sessionStorage');
  function get(s, k) { try { return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function set(s, k, v) { try { if (s) s.setItem(k, String(v)); } catch (e) { /* ignore */ } }

  /* first-time visitor = no previous visit recorded on this browser; the whole first session counts as new */
  var isNew = false;
  if (LS) { if (!get(LS, 'ghp:v')) { set(LS, 'ghp:v', now); set(SS, 'ghp:new', '1'); } isNew = get(SS, 'ghp:new') === '1'; }

  /* ---------- helpers ---------- */
  var SVG = { x: '<path d="M18 6 6 18M6 6l12 12"/>', copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', check: '<path d="M20 6 9 17l-5-5"/>' };
  function svg(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + SVG[n] + '</svg>'; }
  function el(tag, cls, attrs) { var e = document.createElement(tag); if (cls) e.className = cls; for (var k in attrs || {}) e.setAttribute(k, attrs[k]); return e; }
  function rich(parent, text) { String(text || '').split(/\*\*([^*]+?)\*\*/).forEach(function (part, i) { if (!part) return; if (i % 2) { var b = el('strong'); b.textContent = part; parent.appendChild(b); } else parent.appendChild(document.createTextNode(part)); }); return parent; }
  function abs(u) { if (!u) return ''; try { var x = new URL(u, origin); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; } }
  function inWindow(o) { return (!o.start || Date.parse(o.start) <= Date.now()) && (!o.end || Date.parse(o.end) > Date.now()); }
  function announce(region, msg) { if (!region) return; region.textContent = ''; setTimeout(function () { region.textContent = msg; }, 30); }
  function copy(text, done) {
    function legacy() { var t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;top:0;left:0;opacity:0'; document.body.appendChild(t); t.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ } t.remove(); done(ok); }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { done(true); }, legacy); else legacy();
  }

  function ensureCss() {
    if (document.querySelector('link[href*="/hp/promo.css"]')) return;
    var l = el('link', '', { rel: 'stylesheet', href: origin + '/hp/promo.css' + (ver ? '?v=' + encodeURIComponent(ver) : '') });
    document.head.appendChild(l);
  }

  /* ---------- announcement bar ---------- */
  function barDismissed(id, days) { var k = 'ghp:bar:' + id, t = +(days > 0 ? get(LS, k) : get(SS, k)); return t > 0 && (days <= 0 || Date.now() - t < days * DAY); }
  function buildBar(b) {
    var bar = el('div', 'ghp-bar ghp-bar--' + (b.style || 'brand'), { id: 'ghp-bar', role: 'region', 'aria-label': 'Announcement', 'data-id': b.id, 'data-days': b.dismissDays });
    var inner = el('div', 'ghp-bar__in');
    inner.appendChild(rich(el('p', 'ghp-bar__msg'), b.message));
    if (b.coupon) { var c = el('button', 'ghp-chip', { type: 'button', 'data-ghp-copy': b.coupon, 'aria-label': 'Copy coupon code ' + b.coupon }); c.innerHTML = '<small>Code</small><span></span>' + svg('copy'); c.querySelector('span').textContent = b.coupon; inner.appendChild(c); }
    var href = abs(b.linkUrl);
    if (href && b.linkLabel) { var a = el('a', 'ghp-bar__link', { href: href }); a.textContent = b.linkLabel; a.insertAdjacentHTML('beforeend', svg('arrow')); inner.appendChild(a); }
    bar.appendChild(inner);
    if (b.dismissible) { bar.setAttribute('data-dismiss', ''); var x = el('button', 'ghp-bar__x', { type: 'button', 'aria-label': 'Dismiss announcement' }); x.innerHTML = svg('x'); bar.appendChild(x); }
    bar.appendChild(el('span', 'ghp-live', { 'aria-live': 'polite' }));
    return bar;
  }
  function wireBar(bar) {
    var id = bar.getAttribute('data-id'), days = +bar.getAttribute('data-days') || 0, live = bar.querySelector('.ghp-live');
    var start = bar.getAttribute('data-start'), end = bar.getAttribute('data-end');
    if (!inWindow({ start: start, end: end }) || (bar.hasAttribute('data-dismiss') && barDismissed(id, days))) { bar.hidden = true; return; }
    bar.hidden = false;
    var x = bar.querySelector('.ghp-bar__x');
    if (x) x.addEventListener('click', function () { set(days > 0 ? LS : SS, 'ghp:bar:' + id, Date.now()); bar.hidden = true; var f = document.querySelector('#main, main, [role="main"]'); if (f && f.focus) { if (!f.hasAttribute('tabindex')) f.setAttribute('tabindex', '-1'); f.focus({ preventScroll: true }); } });
    var chip = bar.querySelector('[data-ghp-copy]');
    if (chip) chip.addEventListener('click', function () {
      var code = chip.getAttribute('data-ghp-copy'), lbl = chip.querySelector('small');
      copy(code, function (ok) { if (lbl) lbl.textContent = ok ? 'Copied' : 'Code'; chip.classList.toggle('is-copied', ok); announce(live, ok ? 'Coupon code ' + code + ' copied' : 'Copy failed, the code is ' + code); setTimeout(function () { if (lbl) lbl.textContent = 'Code'; chip.classList.remove('is-copied'); }, 2200); });
    });
  }

  /* ---------- pop-up ---------- */
  function pathMatch(rules) {
    var p = location.pathname.replace(/\/+$/, '') || '/', full = p + location.search;
    return (rules || []).some(function (r) {
      r = String(r || '').trim(); if (!r) return false;
      if (r.charAt(0) !== '/') return full.toLowerCase().indexOf(r.toLowerCase()) !== -1; // "cart.php" matches anywhere
      if (r.slice(-1) === '*') return full.indexOf(r.slice(0, -1)) === 0;
      var t = r.indexOf('?') !== -1 ? full : p, rr = r.length > 1 ? r.replace(/\/+$/, '') : r;
      return t === rr || (rr !== '/' && t.indexOf(rr + '/') === 0);
    });
  }
  function eligible(p) {
    if (!LS) return false; // no storage = cannot respect frequency, so never nag
    if (!inWindow(p) || pathMatch(p.exclude)) return false;
    if (p.audience === 'new' && !isNew) return false;
    if (get(SS, 'ghp:popsess')) return false; // at most one pop-up per visit
    var k = 'ghp:pop:' + p.id, t = +(p.frequencyDays > 0 ? get(LS, k) : get(SS, k));
    return !(t > 0 && (p.frequencyDays <= 0 || Date.now() - t < p.frequencyDays * DAY));
  }

  /* optional email capture (Admin → Promotions → "Collect email addresses"): posts to /api/lead on this script's origin.
     On the website /hp/track.js handles the submit (validation, generate_lead event); elsewhere a minimal fallback does. */
  var leadN = 0;
  function leadForm(p, onDone) {
    // the website's theme.css already contains these styles; WHMCS pages load /hp/lead.css
    if (!document.querySelector('link[href*="/hp/lead."],link[href*="/hp/theme."]')) document.head.appendChild(el('link', '', { rel: 'stylesheet', href: origin + '/hp/lead.css' + (ver ? '?v=' + encodeURIComponent(ver) : '') }));
    var id = 'ghpl' + (++leadN), wrap = el('div', 'gh-lead gh-lead--light ghp-lead');
    var f = el('form', 'gh-lead__f', { action: origin + '/api/lead', method: 'post', novalidate: '', 'data-gh-lead': '', 'aria-label': 'Sign up for offers' });
    f.innerHTML = '<input type="hidden" name="source" value="popup"><input type="hidden" name="t" value=""><input type="hidden" name="page" value="">' +
      '<input type="hidden" name="interest" value="">' +
      '<div class="gh-lead__hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>' +
      '<div class="gh-lead__row"><div class="gh-lead__fld"><label for="' + id + '-e">Email</label><input id="' + id + '-e" name="email" type="email" autocomplete="email" inputmode="email" required maxlength="160" placeholder="you@company.com" aria-describedby="' + id + '-ee"><span class="gh-lead__err" id="' + id + '-ee" data-err="email"></span></div>' +
      '<div class="gh-lead__fld"><label for="' + id + '-w">WhatsApp number <span class="gh-lead__opt">(optional)</span></label><input id="' + id + '-w" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="30" placeholder="+971 50 000 0000" aria-describedby="' + id + '-we"><span class="gh-lead__err" id="' + id + '-we" data-err="phone"></span></div></div>' +
      '<div class="gh-lead__chk"><input id="' + id + '-c" name="consent" type="checkbox" value="on" required aria-describedby="' + id + '-ce"><label for="' + id + '-c">Send me offers and hosting guides by email or WhatsApp. I can unsubscribe at any time.</label></div>' +
      '<span class="gh-lead__err" id="' + id + '-ce" data-err="consent"></span>' +
      '<button type="submit" class="ghp-cta gh-lead__btn">Get the offers</button><p class="gh-lead__msg" role="status" aria-live="polite" data-gh-lead-msg></p>';
    f.querySelector('[name="page"]').value = location.pathname.slice(0, 300);
    f.querySelector('[name="interest"]').value = String(p.title || '').slice(0, 200);
    wrap.appendChild(f);
    if (window.GHLead && window.GHLead.bind && origin === location.origin) { window.GHLead.bind(f, { onDone: onDone }); return wrap; }
    // off-site (WHMCS client area): load the website's form check, which is empty unless Turnstile is switched on (Admin > Security)
    if (!window.GHTs && !document.querySelector('script[data-gh-ts]')) document.head.appendChild(el('script', '', { src: origin + '/api/security/turnstile', defer: '', 'data-gh-ts': '' }));
    var t = f.querySelector('[name="t"]');
    f.addEventListener('focusin', function () { if (!t.value) t.value = String(Date.now()); });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {}; new FormData(f).forEach(function (v, k) { data[k] = v; });
      data.consent = f.querySelector('[name="consent"]').checked;
      var msg = f.querySelector('[data-gh-lead-msg]');
      if (!/^\S+@\S+\.\S{2,}$/.test(String(data.email || '').trim()) || !data.consent) { msg.textContent = 'Please enter your email and tick the box.'; return; }
      msg.textContent = 'Sending…';
      fetch(origin + '/api/lead', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data), credentials: 'omit', mode: 'cors' })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j && j.ok) { var d = el('p', 'gh-lead__done', { role: 'status' }); d.textContent = 'Thank you, you are on the list.'; f.replaceWith(d); if (onDone) onDone(); } else msg.textContent = (j && j.error) || 'Something went wrong. Please try again.'; },
          function () { msg.textContent = 'Something went wrong. Please try again.'; });
    });
    return wrap;
  }

  var FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';
  function openPopup(p) {
    if (document.querySelector('.ghp-pop')) return;
    var drawer = document.querySelector('.hp-drawer[aria-hidden="false"]');
    if (drawer || document.hidden) { setTimeout(function () { openPopup(p); }, 4000); return; } // wait for menus / tab to come back
    set(p.frequencyDays > 0 ? LS : SS, 'ghp:pop:' + p.id, Date.now()); set(SS, 'ghp:popsess', '1');

    var mq = window.matchMedia ? matchMedia('(max-width: 600px)') : null;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var root = el('div', 'ghp-pop' + (p.imageUrl ? ' ghp-pop--media' : '') + (mq && mq.matches ? ' ghp-pop--sheet' : ''), { 'data-kind': p.kind || 'popup' });
    var scrim = el('div', 'ghp-pop__scrim'); root.appendChild(scrim);
    var dlg = el('div', 'ghp-pop__dlg', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ghp-pop-t', tabindex: '-1' });
    var x = el('button', 'ghp-pop__x', { type: 'button', 'aria-label': 'Close' }); x.innerHTML = svg('x'); dlg.appendChild(x);
    var img = abs(p.imageUrl);
    if (img) { var m = el('div', 'ghp-pop__media'), im = el('img', '', { src: img, alt: p.imageAlt || '', decoding: 'async' }); m.appendChild(im); dlg.appendChild(m); }
    var body = el('div', 'ghp-pop__body'), h = el('h2', 'ghp-pop__title', { id: 'ghp-pop-t' }); h.textContent = p.title; body.appendChild(h);
    if (p.body) { var t = el('div', 'ghp-pop__text', { id: 'ghp-pop-d' }); String(p.body).split(/\n{2,}|\r\n\r\n/).forEach(function (para) { if (para.trim()) t.appendChild(rich(el('p'), para.trim())); }); body.appendChild(t); dlg.setAttribute('aria-describedby', 'ghp-pop-d'); }
    var live = el('span', 'ghp-live', { 'aria-live': 'polite' });
    if (p.coupon) {
      var code = el('div', 'ghp-code'), info = el('div'), lbl = el('span', 'ghp-code__lbl'), val = el('span', 'ghp-code__val'), btn = el('button', 'ghp-code__btn', { type: 'button', 'aria-label': 'Copy coupon code ' + p.coupon });
      lbl.textContent = 'Coupon code'; val.textContent = p.coupon; info.appendChild(lbl); info.appendChild(val); code.appendChild(info);
      btn.innerHTML = svg('copy') + '<span>Copy</span>'; code.appendChild(btn); body.appendChild(code);
      btn.addEventListener('click', function () { copy(p.coupon, function (ok) { btn.innerHTML = svg(ok ? 'check' : 'copy') + '<span>' + (ok ? 'Copied' : 'Copy') + '</span>'; announce(live, ok ? 'Coupon code ' + p.coupon + ' copied' : 'Copy failed, the code is ' + p.coupon); setTimeout(function () { btn.innerHTML = svg('copy') + '<span>Copy</span>'; }, 2200); }); });
    }
    if (p.emailCapture) body.appendChild(leadForm(p, function () { setTimeout(function () { if (!closed) close(); }, 2600); }));
    var actions = el('div', 'ghp-pop__actions'), href = abs(p.ctaUrl);
    if (href && p.ctaLabel) { var cta = el('a', 'ghp-cta', { href: href }); cta.textContent = p.ctaLabel; cta.insertAdjacentHTML('beforeend', svg('arrow')); actions.appendChild(cta); }
    var later = el('button', 'ghp-later', { type: 'button' }); later.textContent = 'No thanks'; actions.appendChild(later);
    body.appendChild(actions); dlg.appendChild(body); dlg.appendChild(live); root.appendChild(dlg);

    var prev = document.activeElement, html = document.documentElement, bodyEl = document.body;
    var sbw = window.innerWidth - html.clientWidth, oldOverflow = html.style.overflow, oldPad = bodyEl.style.paddingRight;
    html.style.overflow = 'hidden';
    if (sbw > 0) bodyEl.style.paddingRight = (parseFloat(getComputedStyle(bodyEl).paddingRight) || 0) + sbw + 'px';
    bodyEl.appendChild(root);
    requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add('is-open'); }); });
    dlg.focus({ preventScroll: true });

    function onMq() { root.classList.toggle('ghp-pop--sheet', mq.matches); }
    if (mq) { if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq); }
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      var f = Array.prototype.filter.call(dlg.querySelectorAll(FOCUSABLE), function (n) { return n.offsetParent !== null || n === document.activeElement; });
      if (!f.length) { e.preventDefault(); return; }
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dlg)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    function onFocusIn(e) { if (!root.contains(e.target)) dlg.focus({ preventScroll: true }); }
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocusIn);
    var closed = false;
    function close() {
      if (closed) return; closed = true;
      document.removeEventListener('keydown', onKey, true); document.removeEventListener('focusin', onFocusIn);
      if (mq) { if (mq.removeEventListener) mq.removeEventListener('change', onMq); else if (mq.removeListener) mq.removeListener(onMq); }
      root.classList.remove('is-open');
      setTimeout(function () { root.remove(); html.style.overflow = oldOverflow; bodyEl.style.paddingRight = oldPad; }, reduce ? 0 : 280);
      if (prev && prev.focus && document.contains(prev)) prev.focus({ preventScroll: true });
    }
    x.addEventListener('click', close); later.addEventListener('click', close); scrim.addEventListener('click', close);
  }

  function arm(p) {
    var fired = false;
    function fire() { if (fired) return; fired = true; cleanup(); openPopup(p); }
    var timers = [], offs = [];
    function on(t, ev, fn, o) { t.addEventListener(ev, fn, o); offs.push(function () { t.removeEventListener(ev, fn, o); }); }
    function cleanup() { timers.forEach(clearTimeout); offs.forEach(function (f) { f(); }); }
    var delay = Math.max(0, +p.delay || 0) * 1000;
    var desktop = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (p.trigger === 'exit' && desktop) {
      timers.push(setTimeout(function () { on(document, 'mouseout', function (e) { if (!e.relatedTarget && e.clientY <= 0) fire(); }); }, 2500));
    } else if (p.trigger === 'scroll') {
      var tick = false;
      var check = function () { tick = false; var d = document.documentElement, max = d.scrollHeight - window.innerHeight; if (max <= 40 || (window.scrollY / max) * 100 >= (+p.scroll || 50)) fire(); };
      on(window, 'scroll', function () { if (!tick) { tick = true; requestAnimationFrame(check); } }, { passive: true });
      timers.push(setTimeout(function () { var d = document.documentElement; if (d.scrollHeight - window.innerHeight <= 40) fire(); }, Math.max(delay, 5000)));
    } else {
      // "delay", and exit-intent on touch devices (no mouse to leave the window): after N seconds
      timers.push(setTimeout(fire, delay));
    }
  }

  /* ---------- boot ---------- */
  function run(data) {
    if (!data) return;
    if (data.bar) {
      var bar = document.getElementById('ghp-bar');
      if (!bar) { bar = buildBar(data.bar); bar.setAttribute('data-start', data.bar.start || ''); bar.setAttribute('data-end', data.bar.end || ''); document.body.insertBefore(bar, document.body.firstChild); }
      wireBar(bar);
    }
    var list = data.popups || [];
    for (var i = 0; i < list.length; i++) { if (eligible(list[i])) { arm(list[i]); break; } }
  }
  function boot() {
    var inline = surface === 'website' && document.getElementById('ghp-data');
    if (inline) { var d = null; try { d = JSON.parse(inline.textContent || 'null'); } catch (e) { /* ignore */ } run(d); return; }
    ensureCss();
    if (!window.fetch) return;
    fetch(origin + '/api/promo?surface=' + surface, { credentials: 'omit', mode: 'cors' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(run, function () { /* offline or blocked: no promotions */ });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
