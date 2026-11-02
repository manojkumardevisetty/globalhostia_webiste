/* Blog article behaviours: copy-link button and table-of-contents highlight (no layout animation). */
(function () {
  'use strict';
  // copy link
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var url = b.getAttribute('data-copy');
      var box = b.closest('.bl-share');
      var msg = box && box.querySelector('.bl-share__ok');
      var done = function (ok) { if (msg) { msg.textContent = ok ? 'Link copied' : 'Copy failed'; setTimeout(function () { msg.textContent = ''; }, 2500); } };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { done(true); }, function () { done(false); });
      else {
        try { var t = document.createElement('textarea'); t.value = url; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); done(document.execCommand('copy')); t.remove(); } catch (e) { done(false); }
      }
    });
  });

  // reading progress across the article
  var bar = document.querySelector('.bl-readbar span'), art = document.querySelector('.bl-article');
  if (bar && art) {
    var ticking = false;
    var upd = function () {
      ticking = false;
      var r = art.getBoundingClientRect(), total = r.height - window.innerHeight;
      var p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 1;
      bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    };
    var req = function () { if (!ticking) { ticking = true; requestAnimationFrame(upd); } };
    window.addEventListener('scroll', req, { passive: true });
    window.addEventListener('resize', req);
    upd();
  }

  // image lightbox (in-article figures)
  var lb = null;
  document.querySelectorAll('[data-zoom]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var src = btn.getAttribute('data-zoom'), img = btn.querySelector('img');
      var cap = btn.parentNode.querySelector('figcaption');
      if (!src) return;
      if (!lb || typeof lb.showModal !== 'function') {
        lb = document.createElement('dialog');
        lb.className = 'bl-lb';
        lb.setAttribute('aria-label', 'Image viewer');
        lb.innerHTML = '<button type="button" class="bl-lb__close" aria-label="Close image"><svg class="hp-ico" aria-hidden="true"><use href="#i-close"/></svg></button><img alt=""><p></p>';
        document.body.appendChild(lb);
        if (typeof lb.showModal !== 'function') { window.open(src, '_blank', 'noopener'); return; }
        lb.querySelector('.bl-lb__close').addEventListener('click', function () { lb.close(); });
        lb.addEventListener('click', function (e) { if (e.target === lb) lb.close(); });
      }
      var big = lb.querySelector('img'); big.src = src; big.alt = img ? img.alt : '';
      var p = lb.querySelector('p'); p.textContent = cap ? cap.textContent : ''; p.hidden = !cap;
      lb.showModal();
      lb.querySelector('.bl-lb__close').focus();
    });
  });

  // TOC: mark the section currently being read
  var links = Array.prototype.slice.call(document.querySelectorAll('.bl-toc:not(.bl-toc--m) a[href^="#"]'));
  if (!links.length || !('IntersectionObserver' in window)) return;
  var byId = {};
  links.forEach(function (a) { byId[decodeURIComponent(a.getAttribute('href').slice(1))] = a; });
  var heads = Object.keys(byId).map(function (id) { return document.getElementById(id); }).filter(Boolean);
  var visible = new Set();
  var set = function (id) { links.forEach(function (a) { a.classList.toggle('is-on', a === byId[id]); if (a === byId[id]) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); }); };
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target); });
    var cur = null;
    if (visible.size) cur = heads.filter(function (h) { return visible.has(h); })[0];
    else { // between headings: last heading above the viewport
      for (var i = 0; i < heads.length; i++) if (heads[i].getBoundingClientRect().top < 120) cur = heads[i];
    }
    if (cur) set(cur.id);
  }, { rootMargin: '-90px 0px -55% 0px' });
  heads.forEach(function (h) { io.observe(h); });

  // the mobile TOC closes after a jump
  document.querySelectorAll('.bl-toc--m a').forEach(function (a) { a.addEventListener('click', function () { var d = a.closest('details'); if (d) d.open = false; }); });
})();
