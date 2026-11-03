/*
 * GlobalHostia x YouPI: opens the YouPI checkout for a WHMCS invoice.
 * No secrets live here; the server already created the YouPI payment and only the
 * checkout URL reaches the browser. Browser events never mark an invoice paid; only the
 * signed webhook (or staff) does. This script just updates the page.
 */
(function () {
  'use strict';
  if (window.__ghyLoaded) return;
  window.__ghyLoaded = true;

  var CLOSE_EVENTS = ['youpi.modal_close', 'youpi.close', 'youpi.cancel', 'youpi.payment_cancelled', 'youpi.payment_blocked_exit'];

  function isPhone() {
    try {
      return window.matchMedia('(max-width: 640px)').matches || window.matchMedia('(pointer: coarse)').matches;
    } catch (e) { return false; }
  }

  function setStatus(card, text) {
    var el = card && card.querySelector('[data-ghy-status]');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
  }

  function withParams(url) {
    var o = window.location.origin;
    var sep = url.indexOf('?') === -1 ? '?' : '&';
    return url + sep + 'embedded=1&youpiParentOrigin=' + encodeURIComponent(o) + '&origin=' + encodeURIComponent(o);
  }

  function openModal(btn) {
    var url = btn.getAttribute('data-checkout-url') || '';
    var origin = btn.getAttribute('data-checkout-origin') || '';
    var card = btn.closest('.ghy');
    if (!/^https:\/\//.test(url) || !origin) return;

    var lastFocus = document.activeElement;
    var overlay = document.createElement('div');
    overlay.className = 'ghy-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'UPI payment');
    var box = document.createElement('div');
    box.className = 'ghy-modal__box';
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'ghy-modal__close';
    close.setAttribute('aria-label', 'Close payment window');
    close.textContent = '×';
    var frame = document.createElement('iframe');
    frame.title = 'UPI payment';
    frame.allow = 'payment';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.src = withParams(url);
    box.appendChild(close);
    box.appendChild(frame);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    close.focus();

    function shut() {
      window.removeEventListener('message', onMessage);
      document.removeEventListener('keydown', onKey);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.body.style.overflow = prevOverflow;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    function onKey(e) { if (e.key === 'Escape') shut(); }
    function onMessage(e) {
      // Only trust messages from this exact iframe and the checkout origin.
      if (e.source !== frame.contentWindow || e.origin !== origin) return;
      var data = e.data;
      if (!data || typeof data !== 'object') return;
      var ev = String(data.event || '');
      if (ev === 'youpi.payment_success') {
        shut();
        btn.disabled = true;
        setStatus(card, 'Payment sent. We are confirming it with your bank; this page refreshes automatically. Please do not pay again.');
        setTimeout(function () { window.location.reload(); }, 20000);
      } else if (ev === 'youpi.payment_failed') {
        shut();
        setStatus(card, 'The payment was not completed. If money left your account, it will be matched automatically; otherwise you can try again.');
      } else if (ev === 'youpi.payment_blocked') {
        shut();
        setStatus(card, 'UPI payment is not available for this account. Please choose another payment method or contact billing support.');
      } else if (CLOSE_EVENTS.indexOf(ev) !== -1) {
        shut();
      }
    }
    close.addEventListener('click', shut);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) shut(); });
    document.addEventListener('keydown', onKey);
    window.addEventListener('message', onMessage);
  }

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-ghy-pay]') : null;
    if (!btn) return;
    e.preventDefault();
    var url = btn.getAttribute('data-checkout-url') || '';
    if (!/^https:\/\//.test(url)) return;
    if (btn.getAttribute('data-mode') === 'redirect' || isPhone()) {
      btn.disabled = true;
      window.location.assign(url);
      return;
    }
    openModal(btn);
  });
})();
