// Browser side of Turnstile on public forms: /api/security/turnstile serves this script with the site key and the forms
// switched on (Admin > Security). Forms are matched by their action URL, so every existing form (server-rendered or built
// by promo.js) gets the widget without template changes. The widget renders when someone starts filling the form (no
// Cloudflare request on a plain page view) and writes its token to a hidden cf-turnstile-response field inside the form;
// track.js / promo.js send all form fields, plain posts send it too. After each submit the widget resets for a new token.
import { TOKEN_FIELD, type TsForm } from './turnstile-core';

export const FORM_ACTIONS: Record<TsForm, string> = {
  lead: '/api/lead(?:[?#]|$)',
  migration: '/api/free-migration(?:[?#]|$)',
  broker: '/api/broker-request(?:[?#]|$)',
  premium: '/api/premium-request(?:[?#]|$)',
  quote: '/api/store/quote(?:[?#]|$)',
  forgot: '/account/forgot(?:[?#]|$)',
  login: '/account/login(?:[?#]|$)',
};

export const turnstileScript = (site: string, forms: TsForm[]) => `/* GlobalHostia form check (Cloudflare Turnstile) */
(function(C){if(window.GHTs||!C.forms.length)return;window.GHTs=1;var D=document,L=null,RE=C.forms.map(function(s){return new RegExp(s)});
function load(){if(window.turnstile)return Promise.resolve();if(L)return L;L=new Promise(function(ok,no){var s=D.createElement("script");s.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";s.async=true;s.onload=ok;s.onerror=no;D.head.appendChild(s)});return L}
function match(f){var a=f.getAttribute("action")||"";for(var i=0;i<RE.length;i++)if(RE[i].test(a))return true;return false}
function go(f){if(f.requestSubmit)f.requestSubmit();else f.submit()}
function prep(f){if(f.__ghts)return f.__ghts;var box=D.createElement("div");box.className="gh-ts";box.style.cssText="margin:12px 0;min-height:65px";var msg=D.createElement("p");msg.setAttribute("role","status");msg.style.cssText="margin:4px 0 0;font-size:13px";var b=f.querySelector('[type="submit"],button:not([type="button"])');var at=b&&b.parentNode&&f.contains(b.parentNode)?b:null;if(at)at.parentNode.insertBefore(box,at);else f.appendChild(box);box.after(msg);
var st={id:null,wait:false,failed:false,msg:msg};f.__ghts=st;
load().then(function(){st.id=window.turnstile.render(box,{sitekey:C.site,"response-field-name":${JSON.stringify(TOKEN_FIELD)},language:D.documentElement.lang||"auto",callback:function(){st.msg.textContent="";if(st.wait){st.wait=false;go(f)}},"expired-callback":function(){},"error-callback":function(){st.failed=true}})},function(){st.failed=true});return st}
function tok(f){var i=f.querySelector('[name="${TOKEN_FIELD}"]');return i&&i.value}
D.addEventListener("focusin",function(e){var f=e.target&&e.target.closest&&e.target.closest("form");if(f&&match(f))prep(f)},true);
D.addEventListener("submit",function(e){var f=e.target;if(!f||f.tagName!=="FORM"||!match(f))return;var st=prep(f);if(!tok(f)&&!st.failed){e.preventDefault();e.stopImmediatePropagation();st.wait=true;st.msg.textContent=f.closest("[dir=rtl]")||D.documentElement.dir==="rtl"?"يرجى إكمال التحقق الأمني أعلاه.":"Please complete the security check above; the form sends itself when it is done.";return}
setTimeout(function(){if(window.turnstile&&st.id!=null)try{window.turnstile.reset(st.id)}catch(x){}},0)},true)
})(${JSON.stringify({ site, forms: forms.map((f) => FORM_ACTIONS[f]) }).replace(/</g, '\\u003c')});
`;

/** <script> tag for the page shell, or '' when the check is off (no keys, TURNSTILE_DISABLED, nothing switched on). */
export function turnstileTag(settings: Record<string, any>, version: string): string {
  if (/^(1|true|yes|on)$/i.test(String(process.env.TURNSTILE_DISABLED || ''))) return '';
  if (!process.env.TURNSTILE_SITE_KEY?.trim() || !process.env.TURNSTILE_SECRET_KEY?.trim()) return '';
  const pub = settings.security_public?.turnstile;
  if (pub && pub.enabled === false) return '';
  return `<script src="/api/security/turnstile?v=${encodeURIComponent(version)}" defer></script>`;
}
