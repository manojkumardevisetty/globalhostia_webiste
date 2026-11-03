/* GlobalHostia growth: first-touch UTM cookie, lead forms, cookie consent, analytics loader and event dispatcher.
   Loaded (defer) by the Hostpen shell and the /lp/ landing pages.
   - Trackers come from <script type="application/json" id="gh-track"> (Admin → Marketing & SEO → Analytics). None configured =
     no banner, no third-party requests.
   - Google tags (GA4 / Ads / GTM) load with Consent Mode v2 defaults "denied" (set inline in <head>) and are upgraded when the
     visitor accepts. Meta Pixel, TikTok Pixel and Microsoft Clarity load only after the visitor accepts.
   - Reduced data (Save-Data or prefers-reduced-data): Google tags wait for the first interaction and Clarity (session replay) is skipped.
   - Events: GH.track(name, params) → gtag / dataLayer (GTM) / fbq / ttq / clarity, whichever is present.
   Debug: add ?gh_debug=1 to log every event to the console. */
(function () {
  'use strict';
  if (window.GH && window.GH.__v) return;
  var W = window, D = document;
  var GH = W.GH = W.GH || {}; GH.__v = 1;
  var DAY = 864e5;
  var debug = /[?&]gh_debug=1/.test(location.search);

  function cookie(name) { var m = D.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)')); return m ? m[1] : null; }
  function setCookie(name, val, days) { D.cookie = name + '=' + val + '; Max-Age=' + Math.round(days * 86400) + '; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : ''); }
  function onReady(fn) { if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', fn); else fn(); }

  /* ---------- first-touch UTM (30 days, first party) ---------- */
  var UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  (function () {
    if (cookie('gh_utm')) return;
    var q = new URLSearchParams(location.search), o = {}, any = false;
    UTM.forEach(function (k) { var v = (q.get(k) || '').slice(0, 120); if (v) { o[k] = v; any = true; } });
    if (!any) return;
    o.landing = location.pathname.slice(0, 200); o.at = new Date().toISOString().slice(0, 10);
    try { setCookie('gh_utm', encodeURIComponent(JSON.stringify(o)), 30); } catch (e) { /* cookies blocked */ }
  })();
  GH.utm = function () { try { return JSON.parse(decodeURIComponent(cookie('gh_utm') || '')) || {}; } catch (e) { return {}; } };

  /* ---------- config ---------- */
  var cfg = {};
  try { var c = D.getElementById('gh-track'); if (c) cfg = JSON.parse(c.textContent || '{}') || {}; } catch (e) { cfg = {}; }
  var google = !!(cfg.ga4 || cfg.ads || cfg.gtm);
  var any = google || !!(cfg.meta || cfg.tiktok || cfg.clarity);
  var conn = navigator.connection || {};
  var lowData = !!conn.saveData || (W.matchMedia && matchMedia('(prefers-reduced-data: reduce)').matches);

  /* ---------- event dispatcher ---------- */
  var FB = { view_item: 'ViewContent', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout', generate_lead: 'Lead' };
  var TT = { view_item: 'ViewContent', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout', generate_lead: 'SubmitForm' };
  GH.track = function (name, params) {
    params = params || {};
    try {
      if ((cfg.ga4 || cfg.ads) && typeof W.gtag === 'function') {
        W.gtag('event', name, params);
        if (cfg.ads && cfg.adsLabel && name === (cfg.adsEvent || 'generate_lead')) W.gtag('event', 'conversion', { send_to: cfg.ads + '/' + cfg.adsLabel, value: params.value, currency: params.currency });
      }
      if (cfg.gtm && W.dataLayer) W.dataLayer.push({ event: name, gh: params });
      if (typeof W.fbq === 'function') { if (FB[name]) W.fbq('track', FB[name], params); else W.fbq('trackCustom', name, params); }
      if (W.ttq && typeof W.ttq.track === 'function') W.ttq.track(TT[name] || name, params);
      if (typeof W.clarity === 'function') W.clarity('event', name);
    } catch (e) { /* a tracker failing must never break the page */ }
    if (debug && W.console) console.info('[gh-track]', name, JSON.stringify(params));
  };

  /* ---------- loaders ---------- */
  function script(src) { var s = D.createElement('script'); s.async = true; s.src = src; D.head.appendChild(s); return s; }
  var loaded = {};
  function loadGoogle() {
    if (loaded.g || !google) return; loaded.g = 1;
    W.dataLayer = W.dataLayer || []; if (typeof W.gtag !== 'function') W.gtag = function () { W.dataLayer.push(arguments); };
    if (cfg.gtm) { W.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' }); script('https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(cfg.gtm)); }
    var first = cfg.ga4 || cfg.ads;
    if (first) {
      script('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(first));
      W.gtag('js', new Date());
      if (cfg.ga4) W.gtag('config', cfg.ga4);
      if (cfg.ads) W.gtag('config', cfg.ads);
    }
  }
  function loadConsented() {
    if (cfg.meta && !loaded.m) {
      loaded.m = 1;
      /* Meta Pixel base code */
      (function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); })(W, D, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      W.fbq('init', cfg.meta); W.fbq('track', 'PageView');
    }
    if (cfg.tiktok && !loaded.t) {
      loaded.t = 1;
      /* TikTok Pixel base code */
      (function (w, d, t) { w.TiktokAnalyticsObject = t; var ttq = w[t] = w[t] || []; ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent']; ttq.setAndDefer = function (t, e) { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); }; }; for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]); ttq.instance = function (t) { for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]); return e; }; ttq.load = function (e, n) { var r = 'https://analytics.tiktok.com/i18n/pixel/events.js'; ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = r; ttq._t = ttq._t || {}; ttq._t[e] = +new Date(); ttq._o = ttq._o || {}; ttq._o[e] = n || {}; var o = d.createElement('script'); o.type = 'text/javascript'; o.async = !0; o.src = r + '?sdkid=' + e + '&lib=' + t; var a = d.getElementsByTagName('script')[0]; a.parentNode.insertBefore(o, a); }; })(W, D, 'ttq');
      W.ttq.load(cfg.tiktok); W.ttq.page();
    }
    if (cfg.clarity && !loaded.c && !lowData) {
      loaded.c = 1;
      /* Microsoft Clarity */
      (function (c, l, a, r, i, t, y) { c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); }; t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i; y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y); })(W, D, 'clarity', 'script', cfg.clarity);
      W.clarity('consent');
    }
  }

  /* ---------- consent ---------- */
  function consentState() { var v = cookie('gh_consent'); return v === 'granted' || v === 'denied' ? v : ''; }
  function applyConsent(v) {
    if (google && typeof W.gtag === 'function') {
      var g = v === 'granted' ? 'granted' : 'denied';
      W.gtag('consent', 'update', { ad_storage: g, ad_user_data: g, ad_personalization: g, analytics_storage: g });
    }
    if (v === 'granted') loadConsented();
  }
  GH.consent = function (v) {
    setCookie('gh_consent', v === 'granted' ? 'granted' : 'denied', v === 'granted' ? 180 : 180);
    applyConsent(v);
    GH.track('consent_' + (v === 'granted' ? 'granted' : 'denied'));
  };

  var banner = null;
  function showBanner(focus) {
    if (banner) { banner.hidden = false; if (focus) banner.querySelector('button').focus(); return; }
    banner = D.createElement('section');
    banner.className = 'gh-consent'; banner.id = 'gh-consent';
    banner.setAttribute('aria-labelledby', 'gh-consent-t'); banner.setAttribute('aria-describedby', 'gh-consent-d');
    banner.innerHTML = '<div class="gh-consent__in"><div class="gh-consent__txt"><h2 id="gh-consent-t">Cookies and analytics</h2>' +
      '<p id="gh-consent-d">We would like to use cookies to measure visits and the success of our ads. Nothing is set until you accept. ' +
      '<a href="/privacy-policy">Privacy policy</a></p></div><div class="gh-consent__btns">' +
      '<button type="button" class="hp-btn hp-btn--ghost" data-c="denied">Reject</button>' +
      '<button type="button" class="hp-btn hp-btn--dark" data-c="granted">Accept</button></div></div>';
    banner.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-c]'); if (!b) return;
      GH.consent(b.getAttribute('data-c')); banner.hidden = true;
      var m = D.querySelector('#main, main'); if (m && D.activeElement === b && m.focus) { if (!m.hasAttribute('tabindex')) m.setAttribute('tabindex', '-1'); m.focus({ preventScroll: true }); }
    });
    banner.addEventListener('keydown', function (e) { if (e.key === 'Escape') { banner.hidden = true; } });
    D.body.appendChild(banner);
    if (focus) banner.querySelector('button').focus();
  }

  if (any) {
    var st = consentState();
    var startGoogle = function () { loadGoogle(); };
    if (google) {
      if (lowData) { var once = function () { ['pointerdown', 'keydown', 'scroll'].forEach(function (ev) { W.removeEventListener(ev, once, true); }); startGoogle(); }; ['pointerdown', 'keydown', 'scroll'].forEach(function (ev) { W.addEventListener(ev, once, { capture: true, passive: true }); }); }
      else if (D.readyState === 'complete') startGoogle(); else W.addEventListener('load', startGoogle);
    }
    if (st === 'granted') loadConsented();
    onReady(function () {
      if (!consentState()) showBanner(false);
      D.addEventListener('click', function (e) { var o = e.target.closest && e.target.closest('[data-gh-consent-open]'); if (o) { e.preventDefault(); showBanner(true); } });
    });
  }

  /* ---------- automatic events ---------- */
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : undefined; }
  onReady(function () {
    // view_item: product pages carry Product JSON-LD
    if (/^\/p\//.test(location.pathname)) {
      Array.prototype.some.call(D.querySelectorAll('script[type="application/ld+json"]'), function (s) {
        var j; try { j = JSON.parse(s.textContent || ''); } catch (e) { return false; }
        if (!j || j['@type'] !== 'Product') return false;
        var off = j.offers || {}, price = num(off.lowPrice || off.price);
        GH.track('view_item', { currency: off.priceCurrency, value: price, items: [{ item_id: String(j.sku || ''), item_name: j.name, item_category: j.category, price: price }] });
        return true;
      });
    }
    // plan finder: result shown
    var pf = D.querySelector('[data-pf-res]');
    if (pf && W.MutationObserver) {
      var sent = '';
      new MutationObserver(function () {
        if (pf.hidden) return;
        var names = Array.prototype.map.call(pf.querySelectorAll('.pf-card h3'), function (h) { return h.textContent.trim(); });
        var key = location.hash + '|' + names.join(',');
        if (key === sent) return; sent = key;
        GH.track('plan_finder_complete', { recommendation: names[0] || 'none', answers: (location.hash.match(/#a=([^&]+)/) || [])[1] || '' });
      }).observe(pf, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
    }
  });

  // clicks: order links, WhatsApp, currency picker
  D.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    var h = a.href || '';
    if (/wa\.me\/|api\.whatsapp\.com|web\.whatsapp\.com/i.test(h)) { GH.track('whatsapp_click', { link_url: h.split('?')[0], page: location.pathname }); return; }
    if (a.closest('.hp-cur__menu') || /[?&]currency=[A-Z]{3}\b/.test(h)) { var m = h.match(/currency=([A-Z]{3})/); GH.track('currency_change', { currency: m ? m[1] : '' }); return; }
    if (/\/cart\.php\?[^#]*\ba=add\b/i.test(h) || /\/store\/[^?#]+/.test(h) || /\/cart\.php\?[^#]*\bpid=/.test(h)) {
      var label = (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100);
      var pid = (h.match(/[?&]pid=(\d+)/) || [])[1];
      var domain = /[?&]domain=(register|transfer)/.test(h);
      GH.track(domain ? 'add_to_cart' : 'begin_checkout', { link_url: h.split('#')[0].slice(0, 300), item_name: label, items: [{ item_id: pid || '', item_name: label }] });
    }
  }, true);

  /* ---------- lead forms (form[data-gh-lead]) ---------- */
  var EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
  function interestOf(form) {
    if (form.getAttribute('data-interest-from') === 'plan-finder') {
      var names = Array.prototype.map.call(D.querySelectorAll('[data-pf-cards] .pf-card h3'), function (h) { return h.textContent.trim(); });
      var ans = (location.hash.match(/#a=([^&]+)/) || [])[1] || '';
      return ('Plan finder: ' + (names.join(', ') || 'no match') + (ans ? ' (answers ' + decodeURIComponent(ans) + ')' : '')).slice(0, 500);
    }
    var i = form.querySelector('input[name="interest"]'); return i ? i.value : '';
  }
  function bindLead(form, opts) {
    if (!form || form.__ghLead) return; form.__ghLead = 1; opts = opts || {};
    var t = form.querySelector('input[name="t"]');
    var stamp = function () { if (t && !t.value) t.value = String(Date.now()); };
    form.addEventListener('focusin', stamp); form.addEventListener('pointerdown', stamp);
    var msg = form.querySelector('[data-gh-lead-msg]'), btn = form.querySelector('button[type="submit"]');
    function setErr(name, text) {
      var e = form.querySelector('[data-err="' + name + '"]'), f = form.querySelector('[name="' + name + '"]');
      if (e) e.textContent = text || ''; if (f) { if (text) f.setAttribute('aria-invalid', 'true'); else f.removeAttribute('aria-invalid'); }
    }
    // what went wrong + what to do (GHFx on the website; plain text where only this file is loaded)
    function leadFail(status, j, er, nFields) {
      if (!msg) return;
      msg.setAttribute('role', 'alert');
      if (W.GHFx) {
        var info = W.GHFx.errInfo(status, j && j.ok === false && !j.error ? null : j, er);
        if (nFields) info.retry = false;
        W.GHFx.showError(msg, info, { retry: function () { if (form.requestSubmit) form.requestSubmit(); else if (btn) btn.click(); } });
      } else msg.textContent = (j && j.error) || (status ? 'Something went wrong on our side. Please try again in a minute.' : 'You seem to be offline. Check your connection and try again.');
    }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (msg) { msg.setAttribute('role', 'status'); msg.classList.remove('ghfx-err'); }
      var fd = new FormData(form), data = {};
      fd.forEach(function (v, k) { data[k] = v; });
      ['email', 'phone', 'consent'].forEach(function (k) { setErr(k, ''); });
      var bad = null;
      if (!EMAIL.test(String(data.email || '').trim())) { setErr('email', 'Please enter a valid email address.'); bad = bad || 'email'; }
      if (data.phone && !/^\+?[\d\s().-]{6,30}$/.test(String(data.phone).trim())) { setErr('phone', 'Use digits with your country code, for example +971 50 000 0000.'); bad = bad || 'phone'; }
      if (!form.querySelector('[name="consent"]').checked) { setErr('consent', 'Please tick the box to agree to hear from us.'); bad = bad || 'consent'; }
      if (bad) { var f = form.querySelector('[name="' + bad + '"]'); if (f) f.focus(); return; }
      data.consent = true; data.interest = interestOf(form); data.page = data.page || location.pathname;
      var u = GH.utm(); UTM.forEach(function (k) { if (u[k]) data[k] = u[k]; });
      if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
      if (msg) msg.textContent = 'Sending…';
      fetch('/api/lead', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data), credentials: 'same-origin' })
        .then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { return { status: r.status, j: j }; }); })
        .then(function (res) {
          if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
          if (res.j && res.j.ok) {
            GH.track('generate_lead', { lead_source: data.source, page: location.pathname });
            try { D.dispatchEvent(new CustomEvent('gh:lead', { detail: { source: data.source } })); } catch (e) { /* old browsers */ }
            var done = D.createElement('p'); done.className = 'gh-lead__done'; done.setAttribute('role', 'status'); done.tabIndex = -1;
            done.innerHTML = (W.GHFx ? '<span class="ghfx-mark ghfx-mark--sm">' + W.GHFx.checkSvg(40) + '</span>' : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.5 20.5 7.4v9.2L12 21.5 3.5 16.6V7.4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m8.5 12.2 2.4 2.4 4.6-4.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>') + '<span><b></b> </span>';
            done.querySelector('b').textContent = opts.thanks || (data.source === 'plan-finder' ? 'Thank you. Our team will email your recommendation shortly.' : 'Thank you, you are on the list.');
            done.querySelector('span').appendChild(D.createTextNode(data.source === 'plan-finder' ? '' : 'We only write when we have something useful.'));
            form.replaceWith(done); done.focus({ preventScroll: true });
            if (W.GHFx) W.GHFx.success(done, { small: true });
            if (opts.onDone) opts.onDone();
            return;
          }
          var fields = (res.j && res.j.fields) || {}, keys = Object.keys(fields);
          keys.forEach(function (k) { setErr(k, fields[k]); });
          if (keys.length) { var ff = form.querySelector('[name="' + keys[0] + '"]'); if (ff) ff.focus(); }
          leadFail(res.status, res.j, null, keys.length);
        }, function (er) {
          if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
          leadFail(0, null, er, 0);
        });
    });
  }
  GH.bindLead = bindLead;
  W.GHLead = { bind: bindLead };
  onReady(function () { Array.prototype.forEach.call(D.querySelectorAll('form[data-gh-lead]'), function (f) { bindLead(f); }); });
})();
