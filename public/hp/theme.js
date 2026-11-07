/* Globalhostia "Hostpen Modern" theme behaviours (shared by every page).
   Everything is opt-in via classes / data attributes, so page modules only emit markup.
   Motion: transform/opacity only, rAF loops that stop off-screen and in hidden tabs,
   full prefers-reduced-motion fallback. Page-specific JS registers via window.HP.on(fn). */
(function(){
  "use strict";
  var W = window, D = document, root = D.documentElement;
  var reduce = W.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePtr = W.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var hasIO = "IntersectionObserver" in W;
  var raf = W.requestAnimationFrame.bind(W);
  var $ = function(s,r){return (r||D).querySelector(s)};
  var $$ = function(s,r){return Array.prototype.slice.call((r||D).querySelectorAll(s))};
  var expo = function(t){return t>=1?1:1-Math.pow(2,-10*t)};
  if(!reduce) root.classList.add("hp-mo"); else root.classList.remove("hp-mo");

  var HP = W.HP = W.HP || {};
  HP.reduce = reduce; HP.$ = $; HP.$$ = $$;

  /* ---------- helpers ---------- */
  // run step(dt,t) every frame only while el is on screen and the tab is visible
  function loop(el, step){
    var vis=!D.hidden, inview=false, id=0, last=0;
    function tick(t){ id=0; if(!(vis&&inview)) return; var dt=last?Math.min(48,t-last):16; last=t; step(dt,t); id=raf(tick) }
    function upd(){ if(vis&&inview&&!id){ last=0; id=raf(tick) } }
    if(hasIO) new IntersectionObserver(function(es){inview=es[es.length-1].isIntersecting;upd()}).observe(el); else {inview=true;upd()}
    D.addEventListener("visibilitychange",function(){vis=!D.hidden;upd()});
  }
  // fire fn once when el first enters the viewport
  function once(el, fn, margin){
    if(reduce||!hasIO){fn(el,true);return}
    var o=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){o.unobserve(e.target);fn(e.target,false)}})},{rootMargin:margin||"0px 0px -10% 0px",threshold:0});
    o.observe(el);
  }
  // toggle .is-paused when off-screen or tab hidden (CSS animations)
  function pauseOff(el){
    var inview=true;
    function upd(){ el.classList.toggle("is-paused", !inview || D.hidden || (el.matches && el.matches(":hover") && el.hasAttribute("data-hover-pause"))) }
    if(hasIO) new IntersectionObserver(function(es){inview=es[es.length-1].isIntersecting;upd()}).observe(el);
    D.addEventListener("visibilitychange",upd);
  }
  // run fn when the main thread is idle (after first paint), at the latest after t ms
  var ric = W.requestIdleCallback ? function(fn,t){ W.requestIdleCallback(fn,{timeout:t||2000}) } : function(fn){ setTimeout(fn,200) };
  function idle(fn,t){ ric(function(){ try{fn()}catch(e){ if(W.console) console.error(e) } },t) }
  // idle, but only after the load event (decorative work that must not compete with the page's own requests)
  function afterLoad(fn){ if(D.readyState==="complete") idle(fn); else W.addEventListener("load",function(){idle(fn)}) }
  // fn once el comes within ~1 screen of the viewport (set-up work for below-the-fold widgets)
  function near(el,fn){
    if(!hasIO){idle(fn);return}
    var o=new IntersectionObserver(function(es){ if(es[es.length-1].isIntersecting){o.disconnect();fn()} },{rootMargin:"600px 0px"}); o.observe(el);
  }
  HP.loop=loop; HP.once=once; HP.pauseOff=pauseOff; HP.idle=idle; HP.near=near; HP.afterLoad=afterLoad;

  /* ---------- preview: keep ?theme=hostpen while browsing ---------- */
  (function(){
    var p=new URLSearchParams(location.search).get("theme");
    if(p!=="hostpen") return;
    function fix(scope){
      $$("a[href]",scope).forEach(function(a){
        var h=a.getAttribute("href"); if(!h||h.charAt(0)==="#"||/^(mailto|tel|javascript):/i.test(h)) return;
        var u; try{u=new URL(h,location.href)}catch(e){return}
        if(u.origin!==location.origin||/^\/(admin|api|_next|hp|image|previews)\b/.test(u.pathname)||/\.\w{2,5}$/.test(u.pathname)) return;
        if(u.searchParams.has("theme")) return;
        u.searchParams.set("theme","hostpen"); a.setAttribute("href",u.pathname+u.search+u.hash);
      });
      $$("form",scope).forEach(function(f){
        var act; try{act=new URL(f.getAttribute("action")||location.href,location.href)}catch(e){return}
        if(act.origin!==location.origin||$('input[name="theme"]',f)) return;
        if((f.getAttribute("method")||"get").toLowerCase()==="get"){var i=D.createElement("input");i.type="hidden";i.name="theme";i.value="hostpen";f.appendChild(i)}
        else{act.searchParams.set("theme","hostpen");f.setAttribute("action",act.pathname+act.search)}
      });
    }
    fix(D); HP.keepTheme=fix;
  })();

  /* ---------- header: frosted on scroll ---------- */
  var header=$(".hp-header");
  if(header){
    var onScroll=function(){header.classList.toggle("is-scrolled",W.scrollY>40)};
    W.addEventListener("scroll",onScroll,{passive:true}); raf(onScroll);
  }

  /* ---------- WhatsApp float: step aside while it sits over a button, link or field ---------- */
  var wa=$(".hp-wa");
  if(wa && D.elementsFromPoint){
    var waT=false, HIT="a,button,input,select,textarea,summary,label";
    var dodge=function(){
      waT=false; var r=wa.getBoundingClientRect(); if(!r.width) return;
      var pts=[[r.left+r.width/2,r.top+r.height/2],[r.left+8,r.top+8],[r.right-8,r.top+8],[r.left+8,r.bottom-8],[r.right-8,r.bottom-8]], hit=false;
      for(var i=0;i<pts.length&&!hit;i++){ var els=D.elementsFromPoint(pts[i][0],pts[i][1]);
        for(var j=0;j<els.length;j++){ var e=els[j]; if(e===wa||wa.contains(e)) continue; if(e.closest&&e.closest(HIT)&&!e.closest(".hp-preview-pill")){hit=true;break} } }
      wa.classList.toggle("is-dodge",hit);
    };
    var reqDodge=function(){ if(!waT){waT=true; requestAnimationFrame(dodge)} };
    W.addEventListener("scroll",reqDodge,{passive:true}); W.addEventListener("resize",reqDodge); afterLoad(dodge);
  }

  /* ---------- mega menus (hover intent, click, keyboard) ---------- */
  (function(){
    if(!header) return;
    var btns=$$(".hp-nav__btn[data-menu]",header), openId=null, openT, closeT;
    if(!btns.length) return;
    var panels=$$("[data-panel]",header);
    function openMenu(id){
      clearTimeout(closeT); if(openId===id) return;
      btns.forEach(function(b){b.setAttribute("aria-expanded",b.dataset.menu===id)});
      panels.forEach(function(p){p.classList.toggle("is-open",p.id===id)});
      header.classList.add("is-menu-open"); openId=id;
    }
    function closeMenus(){
      clearTimeout(openT);
      btns.forEach(function(b){b.setAttribute("aria-expanded","false")});
      panels.forEach(function(p){p.classList.remove("is-open")});
      header.classList.remove("is-menu-open"); openId=null;
    }
    function focusFirst(id){var f=$("#"+id+" a");if(f)setTimeout(function(){f.focus()},30)}
    btns.forEach(function(b){
      var id=b.dataset.menu;
      b.addEventListener("mouseenter",function(){clearTimeout(openT);clearTimeout(closeT);openT=setTimeout(function(){openMenu(id)},openId?0:120)});
      b.addEventListener("mouseleave",function(){clearTimeout(openT);closeT=setTimeout(closeMenus,180)});
      b.addEventListener("click",function(){ openId===id?closeMenus():openMenu(id) });
      b.addEventListener("keydown",function(e){
        if(e.key==="Enter"||e.key===" "){e.preventDefault(); if(openId===id) closeMenus(); else {openMenu(id);focusFirst(id)}}
        else if(e.key==="ArrowDown"){e.preventDefault();openMenu(id);focusFirst(id)}
        else if(e.key==="ArrowRight"||e.key==="ArrowLeft"){e.preventDefault();var i=btns.indexOf(b),n=btns[(i+(e.key==="ArrowRight"?1:-1)+btns.length)%btns.length];n.focus();if(openId)openMenu(n.dataset.menu)}
        else if(e.key==="Escape"){closeMenus();b.focus()}
      });
    });
    panels.forEach(function(p){
      p.addEventListener("mouseenter",function(){clearTimeout(closeT)});
      p.addEventListener("mouseleave",function(){closeT=setTimeout(closeMenus,180)});
      p.addEventListener("keydown",function(e){
        if(e.key==="Escape"){var b=$('.hp-nav__btn[data-menu="'+p.id+'"]');closeMenus();if(b)b.focus()}
        if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();var ls=$$("a",p),i=ls.indexOf(D.activeElement);var n=ls[(i+(e.key==="ArrowDown"?1:-1)+ls.length)%ls.length];if(n)n.focus()}
      });
      p.addEventListener("focusout",function(e){if(!header.contains(e.relatedTarget))closeMenus()});
    });
    D.addEventListener("click",function(e){if(openId&&!header.contains(e.target))closeMenus()});
    D.addEventListener("keydown",function(e){if(e.key==="Escape"&&openId){var b=$('.hp-nav__btn[data-menu="'+openId+'"]');closeMenus();if(b)b.focus()}});
    HP.closeMenus=closeMenus;
  })();

  /* ---------- mobile drawer: accordions + focus trap ---------- */
  (function(){
    var drawer=$(".hp-drawer"), burger=$(".hp-burger"); if(!drawer||!burger) return;
    $$(".hp-dacc__btn",drawer).forEach(function(b){b.addEventListener("click",function(){
      var open=b.getAttribute("aria-expanded")==="true";
      b.setAttribute("aria-expanded",!open); var p=$("#"+b.getAttribute("aria-controls")); if(p)p.classList.toggle("is-open",!open);
    })});
    function setDrawer(open){
      drawer.classList.toggle("is-open",open); drawer.setAttribute("aria-hidden",!open);
      if(open) drawer.removeAttribute("inert"); else drawer.setAttribute("inert","");
      burger.setAttribute("aria-expanded",open); D.body.style.overflow=open?"hidden":"";
      if(open) setTimeout(function(){var c=$(".hp-drawer__head [data-close]",drawer);if(c)c.focus()},60); else burger.focus();
    }
    burger.addEventListener("click",function(){setDrawer(true)});
    $$("[data-close]",drawer).forEach(function(c){c.addEventListener("click",function(){setDrawer(false)})});
    $$(".hp-drawer__body a",drawer).forEach(function(a){a.addEventListener("click",function(){setDrawer(false)})});
    drawer.addEventListener("keydown",function(e){
      if(e.key==="Escape") setDrawer(false);
      if(e.key==="Tab"){
        var f=$$("button, a, input",drawer).filter(function(n){return n.offsetParent!==null});
        if(!f.length) return; var first=f[0], last=f[f.length-1];
        if(e.shiftKey&&D.activeElement===first){e.preventDefault();last.focus()}
        else if(!e.shiftKey&&D.activeElement===last){e.preventDefault();first.focus()}
      }
    });
    W.addEventListener("resize",function(){ if(W.innerWidth>=1024 && drawer.classList.contains("is-open")) setDrawer(false) });
  })();

  /* ---------- count-up + price roll ---------- */
  function textNode(el){ for(var n=el.firstChild;n;n=n.nextSibling){ if(n.nodeType===3 && /\d/.test(n.nodeValue)) return n } return null }
  function countUp(el, delay, dur){
    if(!el||reduce) return; var tn=textNode(el); if(!tn) return;
    var m=/^(\D*)([\d,]+(?:\.\d+)?)([\s\S]*)$/.exec(tn.nodeValue); if(!m) return;
    var final=tn.nodeValue, raw=m[2].replace(/,/g,""), target=parseFloat(raw), dec=(raw.split(".")[1]||"").length, comma=m[2].indexOf(",")>-1;
    if(!isFinite(target)||target===0) return;
    var fmt=function(v){var s=v.toFixed(dec);return comma?s.replace(/\B(?=(\d{3})+(?!\d))/g,","):s};
    var w=el.getBoundingClientRect().width; if(getComputedStyle(el).display!=="block") el.style.minWidth=w+"px";
    var t0=null; dur=dur||1200;
    tn.nodeValue=m[1]+fmt(0)+m[3];
    setTimeout(function(){ raf(function f(t){
      if(t0===null)t0=t; var p=Math.min(1,(t-t0)/dur);
      tn.nodeValue = p>=1 ? final : m[1]+fmt(target*expo(p))+m[3];
      if(p<1) raf(f); else el.style.minWidth="";
    })}, delay||0);
  }
  function roll(el,i){ if(reduce||!el) return; el.classList.remove("hp-roll"); void el.offsetWidth; el.style.animationDelay=((i||0)*70)+"ms"; el.classList.add("hp-roll") }
  function rollIn(scope){ $$(".hp-price__amt",scope).filter(function(a){return a.offsetParent!==null}).forEach(function(a,i){roll(a,i)}) }
  HP.countUp=countUp; HP.roll=roll; HP.rollIn=rollIn;

  /* ---------- reveals ---------- */
  function onReveal(el){
    if(el.classList.contains("hp-plan")){
      var amt=$(".hp-price__amt:not([hidden])",el); var vis=$$(".hp-price__amt",el).filter(function(a){return !a.closest("[hidden]")})[0]||amt;
      var i=$$(".hp-plan",el.parentNode).indexOf(el);
      if(vis && !el.hasAttribute("data-rerender")) countUp(vis, i*70+120, 1100); else roll(vis,i);
    }
    $$("[data-count]",el).concat(el.hasAttribute("data-count")?[el]:[]).forEach(function(c){countUp(c,150,1500)});
  }
  var rio = (!reduce && hasIO) ? new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("in");rio.unobserve(e.target);onReveal(e.target)}})},{rootMargin:"0px 0px -8% 0px",threshold:0}) : null;
  function observeReveal(scope){
    $$("[data-reveal]:not(.in),[data-inview]:not(.in)",scope).forEach(function(n){
      if(n.closest("[hidden]")) return; // revealed when its pane is shown
      if(rio) rio.observe(n); else n.classList.add("in");
    });
  }
  HP.observeReveal=observeReveal;
  // stagger helper: [data-stagger] gives children --i
  $$("[data-stagger]").forEach(function(g){ var n=+g.getAttribute("data-stagger")||99; $$(":scope > *",g).forEach(function(c,i){ if(!c.style.getPropertyValue("--i")) c.style.setProperty("--i",i%n) }) });
  // headings with gold underline
  $$(".hp-hline, .hp-col-h").forEach(function(h){ once(h,function(){h.classList.add("in")}) });
  // count-ups outside reveal containers
  $$("[data-count]").forEach(function(c){ if(!c.closest("[data-reveal]")) once(c,function(){countUp(c,150,1500)}) });

  /* ---------- tabs + segmented controls ----------
     <div data-tabs [data-scope="#id"]> with buttons [role=tab|radio]
       - button[aria-controls] → show that pane, hide siblings' panes
       - button[data-v] (no aria-controls) → within scope: [data-cv] shown when value matches,
         a[data-href-<v>] gets href swapped. Indicator: .hp-tabs__ind / .hp-seg__thumb */
  function tabs(box){
    var btns=$$('[role="tab"],[role="radio"]',box), ind=$(".hp-tabs__ind, .hp-seg__thumb",box);
    var isTab=btns.length && btns[0].getAttribute("role")==="tab", attr=isTab?"aria-selected":"aria-checked";
    var scopeSel=box.getAttribute("data-scope"), scope=scopeSel?$(scopeSel):box.parentNode;
    // width snaps, only transform animates (composited). Until the first placement CSS paints the selected button itself (.hp-tabs:not(.is-ready))
    function place(b){
      if(!ind||!b||!b.offsetWidth) return; ind.style.width=b.offsetWidth+"px"; ind.style.transform="translateX("+b.offsetLeft+"px)";
      if(!box.classList.contains("is-ready")) raf(function(){ box.classList.add("is-ready") });
    }
    function select(b,focus,init){
      btns.forEach(function(x){
        var on=x===b; x.setAttribute(attr,on); x.tabIndex=on?0:-1;
        var pid=x.getAttribute("aria-controls"), p=pid&&D.getElementById(pid);
        if(p){ if(on){ var was=p.hidden; p.hidden=false; if(was&&!init){p.classList.remove("is-enter");void p.offsetWidth;p.classList.add("is-enter")} } else p.hidden=true }
      });
      var v=b.getAttribute("data-v");
      if(v!=null && !b.getAttribute("aria-controls") && scope){
        var group=box.getAttribute("data-tabs")||"";
        $$("[data-cv]",scope).forEach(function(n){ if((n.getAttribute("data-cv-group")||"")===group) n.hidden=n.getAttribute("data-cv")!==v });
        var key="data-href-"+v;
        $$("a["+key+"]",scope).forEach(function(a){a.setAttribute("href",a.getAttribute(key))});
        if(!init && HP.keepTheme) HP.keepTheme(scope);
      }
      place(b); if(focus) b.focus();
      if(!init){
        resyncAll(); observeReveal(scope||D);
        var target = (b.getAttribute("aria-controls") && D.getElementById(b.getAttribute("aria-controls"))) || scope;
        if(target){ $$(".hp-plan.in",target).forEach(function(pl){pl.setAttribute("data-rerender","")}); rollIn(target) }
        box.dispatchEvent(new CustomEvent("hp:change",{bubbles:true,detail:{value:v,button:b}}));
      }
    }
    btns.forEach(function(b,i){
      b.addEventListener("click",function(){select(b)});
      b.addEventListener("keydown",function(e){
        var k=e.key, n=null;
        if(k==="ArrowRight"||k==="ArrowDown"&&!isTab) n=btns[(i+1)%btns.length];
        else if(k==="ArrowLeft"||k==="ArrowUp"&&!isTab) n=btns[(i-1+btns.length)%btns.length];
        else if(k==="Home") n=btns[0]; else if(k==="End") n=btns[btns.length-1];
        if(n){e.preventDefault();select(n,true)}
      });
    });
    var cur=btns.filter(function(x){return x.getAttribute(attr)==="true"})[0]||btns[0];
    if(cur) select(cur,false,true);
    box._hpSync=function(){var c=btns.filter(function(x){return x.getAttribute(attr)==="true"})[0]; place(c)};
  }
  function resyncAll(){ $$("[data-tabs]").forEach(function(b){ if(b._hpSync) b._hpSync() }) }
  // the server renders the selected tab/pane, so measuring the indicators (a forced layout) can wait for idle time
  idle(function(){ $$("[data-tabs]").forEach(function(b){ if(!b._hpSync) tabs(b) }) },1500);
  W.addEventListener("resize",resyncAll,{passive:true});
  if(D.fonts&&D.fonts.ready) D.fonts.ready.then(resyncAll);
  W.addEventListener("load",resyncAll);
  HP.tabs=tabs;

  /* ---------- accordions / FAQ: [data-acc] (data-acc="single" closes others) ---------- */
  $$("[data-acc]").forEach(function(box){
    var single=box.getAttribute("data-acc")==="single", qs=$$(".hp-acc__q",box);
    qs.forEach(function(b){b.addEventListener("click",function(){
      var open=b.getAttribute("aria-expanded")==="true";
      if(single) qs.forEach(function(o){ if(o!==b){o.setAttribute("aria-expanded","false");var a=D.getElementById(o.getAttribute("aria-controls"));if(a)a.hidden=true;var it=o.closest(".hp-acc__item");if(it)it.classList.remove("is-open")} });
      b.setAttribute("aria-expanded",!open); var a=D.getElementById(b.getAttribute("aria-controls")); if(a)a.hidden=open;
      var it=b.closest(".hp-acc__item"); if(it) it.classList.toggle("is-open",!open);
    })});
  });

  /* ---------- testimonial / simple carousel: [data-carousel] ---------- */
  $$("[data-carousel]").forEach(function(box){
    var items=$$(".hp-tst__item",box), i=0; if(items.length<2) return;
    $$("[data-step]",box).forEach(function(b){b.addEventListener("click",function(){
      items[i].classList.remove("is-on"); i=(i+Number(b.getAttribute("data-step"))+items.length)%items.length; items[i].classList.add("is-on");
    })});
  });

  /* ---------- sideways-scrolling tables and code blocks: keyboard reachable while they overflow (WCAG 2.1.1) ---------- */
  function scrollables(){
    $$(".hp-table-wrap, main pre, .hp-scroll-x").forEach(function(el){
      var over=el.scrollWidth>el.clientWidth+1, own=el.hasAttribute("data-hp-sx");
      if(over && !el.hasAttribute("tabindex")){
        el.setAttribute("tabindex","0"); el.setAttribute("data-hp-sx","");
        if(!el.getAttribute("role")) el.setAttribute("role","region");
        if(!el.getAttribute("aria-label")){ el.setAttribute("data-hp-sx","l"); var c=el.querySelector("caption"); el.setAttribute("aria-label",c&&c.textContent.trim()?c.textContent.trim():(el.tagName==="PRE"?"Code sample":"Table")+" (scrolls sideways)") }
      } else if(!over && own){ el.removeAttribute("tabindex"); var lab=el.getAttribute("data-hp-sx")==="l"; el.removeAttribute("data-hp-sx"); if(el.getAttribute("role")==="region") el.removeAttribute("role"); if(lab) el.removeAttribute("aria-label") }
    });
  }
  scrollables(); var sxT; W.addEventListener("resize",function(){clearTimeout(sxT);sxT=setTimeout(scrollables,200)});

  /* ---------- marquee pause button (WCAG 2.2.2 pause, stop, hide) ---------- */
  $$("[data-marquee-toggle]").forEach(function(b){
    var m=b.parentNode.querySelector(".hp-marquee"); if(!m) return;
    if(reduce){ b.hidden=true; return }
    b.addEventListener("click",function(){ var on=!m.classList.contains("is-stopped"); m.classList.toggle("is-stopped",on); b.setAttribute("aria-label",on?"Play scrolling names":"Pause scrolling names") });
  });

  /* ---------- pause CSS loops off-screen ---------- */
  $$("[data-pause], .hp-cta, .hp-marquee, .hp-dpanel, .hp-plans").forEach(pauseOff);

  /* ---------- domain search forms ---------- */
  $$("[data-domain-form]").forEach(function(form){
    var panel=form.closest(".hp-dpanel")||form.parentNode, q=$('input[name="query"]',form);
    if(!q) return;
    form.addEventListener("submit",function(e){
      var v=q.value.trim().toLowerCase().replace(/^https?:\/\//,"").replace(/^www\./,"").replace(/\/.*$/,"").replace(/\s+/g,"");
      if(!v){e.preventDefault();q.focus();return}
      if(v.indexOf(".")===-1){ var c=$(".hp-tld input:checked",panel); v+=c?c.value:".com" }
      q.value=v;
    });
    if(panel.classList.contains("hp-dpanel")) once(panel,function(){panel.classList.add("in")},"0px");
  });
  $$("[data-focus-domain]").forEach(function(a){a.addEventListener("click",function(e){
    var q=$$("[data-domain-form] input[name=query]").filter(function(n){return n.offsetParent!==null})[0]; if(!q) return; e.preventDefault();
    q.scrollIntoView({behavior:reduce?"auto":"smooth",block:"center"}); setTimeout(function(){q.focus({preventScroll:true})},reduce?0:450);
  })});

  /* ---------- phone header cart count: gh_cart cookie written by /hp/whmcs.js on the WHMCS cart (shared .globalhostia.com) ---------- */
  (function(){ var b=$("[data-cart-count]"); if(!b) return; var m=D.cookie.match(/(?:^|;\s*)gh_cart=(\d+)/), c=m?+m[1]:0;
    if(c>0){ b.textContent=c>99?"99+":String(c); b.hidden=false; var a=b.parentNode; if(a) a.setAttribute("aria-label","Cart, "+c+(c===1?" item":" items")) } })();

  /* ---------- typing placeholder: input[data-typing="a|b|c"] ---------- */
  if(!reduce) afterLoad(function(){ $$("input[data-typing]").forEach(function(q){
    var EX=q.getAttribute("data-typing").split("|").filter(Boolean); if(!EX.length) return;
    var basePh=q.placeholder, prefix=q.getAttribute("data-typing-prefix")||"Try ", wi=0, ci=0, dir=1, tm=0, inview=false;
    function can(){ return inview && !D.hidden && D.activeElement!==q && !q.value }
    function stop(){ clearTimeout(tm); tm=0; q.placeholder=basePh; ci=0; dir=1 }
    function step(){
      tm=0; if(!can()){ stop(); return }
      var w=EX[wi], d;
      if(dir>0){ ci++; d=ci>=w.length?(dir=-1,1800):70+Math.random()*70 }
      else { ci--; if(ci<=0){ dir=1; wi=(wi+1)%EX.length; d=500 } else d=34 }
      q.placeholder=prefix+w.slice(0,ci); tm=setTimeout(step,d);
    }
    function go(){ if(!tm && can()) tm=setTimeout(step,700) }
    q.addEventListener("focus",stop); q.addEventListener("blur",go);
    q.addEventListener("input",function(){ q.value?stop():go() });
    D.addEventListener("visibilitychange",function(){ D.hidden?stop():go() });
    if(hasIO) new IntersectionObserver(function(es){inview=es[es.length-1].isIntersecting; inview?go():stop()}).observe(q); else {inview=true;go()}
  }) });

  /* ---------- filterable product list: [data-plist] ---------- */
  $$("[data-plist]").forEach(function(box){ near(box,function(){
    var rows=$$(".hp-prow[data-name]",box), search=$("[data-plist-search]",box), sort=$("[data-plist-sort]",box), filters=$$("[data-plist-filter]",box),
        count=$("[data-plist-count]",box), body=$("[data-plist-body]",box), empty=$("[data-plist-empty]",box), more=$("[data-plist-more]",box),
        page=+box.getAttribute("data-page")||0, shown=page;
    function apply(){
      var q=(search&&search.value||"").trim().toLowerCase(), list=rows.slice();
      var s=sort&&sort.value;
      if(s==="price-asc"||s==="price-desc") list.sort(function(a,b){var x=parseFloat(a.dataset.price)||1e9,y=parseFloat(b.dataset.price)||1e9;return s==="price-asc"?x-y:y-x});
      else if(s==="name") list.sort(function(a,b){return a.dataset.name.localeCompare(b.dataset.name)});
      else list.sort(function(a,b){return (+a.dataset.idx)-(+b.dataset.idx)});
      var n=0;
      list.forEach(function(r){
        var ok=!q||r.dataset.search.indexOf(q)>-1;
        filters.forEach(function(f){ if(f.value && r.getAttribute("data-f-"+f.getAttribute("data-plist-filter"))!==f.value) ok=false });
        if(ok) n++;
        r.hidden=!ok || (page && n>shown);
        body.appendChild(r);
      });
      if(count) count.textContent=n+(n===1?" plan":" plans");
      if(empty) empty.hidden=n>0;
      if(more) more.hidden=!page||n<=shown;
    }
    [search,sort].concat(filters).forEach(function(c){ if(c) c.addEventListener(c===search?"input":"change",function(){shown=page;apply()}) });
    if(more) $("button",more).addEventListener("click",function(){shown+=page;apply()});
    apply();
  }) });

  /* ---------- scroll progress + hero parallax (measures the page: idle time) ---------- */
  idle(function(){
    var bar=$(".hp-progress"), hero=$("[data-hero-slider]"), heroImgs=hero?$$(".hp-slide__img",hero):[], heroCards=hero?$$(".hp-hcard",hero):[];
    var maxS=1, heroH=hero?hero.offsetHeight:0, ticking=false;
    function measure(){ maxS=Math.max(1,root.scrollHeight-W.innerHeight); heroH=hero?hero.offsetHeight:0 }
    function frame(){
      ticking=false; var y=W.scrollY||W.pageYOffset;
      if(bar) bar.style.transform="scaleX("+Math.min(1,Math.max(0,y/maxS)).toFixed(4)+")";
      if(hero && !reduce && y<=heroH+40){
        var iy=(y*.22).toFixed(1), cy=(-Math.min(y,heroH)*.07).toFixed(1);
        heroImgs.forEach(function(i){i.style.translate="0 "+iy+"px"});
        heroCards.forEach(function(c){c.style.translate="0 "+cy+"px"});
      }
    }
    function req(){ if(!ticking){ticking=true;raf(frame)} }
    W.addEventListener("scroll",req,{passive:true});
    W.addEventListener("resize",function(){measure();req()},{passive:true});
    W.addEventListener("load",function(){measure();req()});
    if("ResizeObserver" in W) new ResizeObserver(function(){measure();req()}).observe(D.body);
    measure(); frame();
  });

  /* ---------- headline word reveal: [data-words] ---------- */
  $$("[data-words]").forEach(function(h){
    if(h.querySelector("*")) return;
    var words=h.textContent.trim().split(/\s+/);
    h.innerHTML=words.map(function(w,i){return '<span class="hp-w"><span class="hp-wi" style="--wi:'+i+'">'+w.replace(/&/g,"&amp;").replace(/</g,"&lt;")+'</span></span>'}).join(" ");
  });
  $$(".hp-hero--page").forEach(function(h){ raf(function(){raf(function(){h.classList.add("is-in")})}) });

  /* ---------- hero slider: [data-hero-slider] ---------- */
  $$("[data-hero-slider]").forEach(function(hero){
    var slides=$$(".hp-slide",hero), dots=$$(".hp-hdot",hero), cur=0, DUR=+hero.getAttribute("data-interval")||7000;
    if(!slides.length) return;
    hero.style.setProperty("--dur",DUR+"ms");
    if(reduce) hero.classList.add("is-static");
    // slides after the first ship data-srcset/data-src (lib/theme/img.ts): nothing is fetched until the slide is shown or its dot is pointed at
    function hydrate(s){
      if(!s||s._hpImg) return; s._hpImg=1;
      $$("source[data-srcset]",s).forEach(function(x){x.srcset=x.getAttribute("data-srcset");x.removeAttribute("data-srcset")});
      $$("img[data-src]",s).forEach(function(i){i.src=i.getAttribute("data-src");i.removeAttribute("data-src")});
    }
    function go(n){
      n=(n+slides.length)%slides.length;
      var prev=slides[cur]; hydrate(slides[n]);
      slides.forEach(function(s,i){var on=i===n;s.classList.toggle("is-active",on);s.setAttribute("aria-hidden",!on);if(on)s.removeAttribute("inert");else s.setAttribute("inert","")});
      // keep the outgoing slide visible while it fades (visibility itself is never transitioned)
      slides[n].classList.remove("is-leaving");
      if(prev&&prev!==slides[n]){ prev.classList.add("is-leaving"); clearTimeout(prev._hpT); prev._hpT=setTimeout(function(){prev.classList.remove("is-leaving")},950) }
      dots.forEach(function(d,i){d.setAttribute("aria-current",i===n);d.classList.toggle("is-done",i<n)});
      var f=dots[n]&&$(".hp-hdot__fill",dots[n]); if(f){f.style.animation="none"; void f.offsetWidth; f.style.animation=""}
      cur=n;
    }
    dots.forEach(function(d,i){
      d.addEventListener("click",function(){go(i)});
      ["pointerenter","focus","touchstart"].forEach(function(ev){ d.addEventListener(ev,function(){hydrate(slides[i])},{passive:true}) });
      var f=$(".hp-hdot__fill",d); if(f) f.addEventListener("animationend",function(){ if(!reduce && d.getAttribute("aria-current")==="true") go(cur+1) });
    });
    go(0);
    // pause button (WCAG 2.2.2): stops the auto-advance until pressed again; hover / focus / off-screen pause it meanwhile
    var stopped=false, pb=$("[data-hero-pause]",hero);
    if(pb){ if(reduce) pb.hidden=true; pb.addEventListener("click",function(){ stopped=!stopped; pb.setAttribute("aria-label",stopped?"Play slideshow":"Pause slideshow"); hero.classList.toggle("is-stopped",stopped); setPaused() }) }
    function setPaused(){ hero.classList.toggle("is-paused", stopped || hero.classList.contains("is-off") || D.hidden || hero.matches(":hover") || hero.contains(D.activeElement)) }
    hero.addEventListener("mouseenter",setPaused); hero.addEventListener("mouseleave",function(){setTimeout(setPaused,0)});
    hero.addEventListener("focusin",setPaused); hero.addEventListener("focusout",function(){setTimeout(setPaused,0)});
    D.addEventListener("visibilitychange",setPaused);
    if(hasIO) new IntersectionObserver(function(es){hero.classList.toggle("is-off",!es[es.length-1].isIntersecting);setPaused()}).observe(hero);
    var tx=null, ty=null;
    hero.addEventListener("touchstart",function(e){tx=e.touches[0].clientX;ty=e.touches[0].clientY},{passive:true});
    hero.addEventListener("touchend",function(e){
      if(tx===null) return; var dx=e.changedTouches[0].clientX-tx, dy=e.changedTouches[0].clientY-ty;
      if(Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)) go(cur+(dx<0?1:-1)); tx=null;
    },{passive:true});
    if(!reduce){ hero.classList.add("is-wpre"); raf(function(){raf(function(){hero.classList.remove("is-wpre")})}) }
  });

  /* ---------- hero network canvas: [data-network] ---------- */
  // decorative: starts after the load event, in idle time
  $$("[data-network]").forEach(function(host){ afterLoad(function(){
    var c=D.createElement("canvas"); c.className="hp-net"; c.setAttribute("aria-hidden","true");
    var hex=$(".hp-hero__hex",host); host.insertBefore(c, hex?hex.nextSibling:host.firstChild);
    var ctx=c.getContext("2d"); if(!ctx) return;
    var Wd=0,H=0,nodes=[],LINK=150, density=+host.getAttribute("data-network")||1;
    function seed(){
      var n=Math.round((Wd<768?16:30)*density); LINK=Wd<768?110:165; nodes=[];
      for(var i=0;i<n;i++){
        var a=Math.random()*Math.PI*2, sp=.006+Math.random()*.012;
        nodes.push({x:Math.random()*Wd,y:Math.random()*H,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,r:1.1+Math.random()*1.3,g:i%6===0,hx:i%5===2,rot:Math.random()*Math.PI});
      }
    }
    function size(){
      var r=host.getBoundingClientRect(), dpr=Math.min(2,W.devicePixelRatio||1);
      if(!r.width) return; var first=!Wd;
      Wd=r.width;H=r.height; c.width=Math.round(Wd*dpr); c.height=Math.round(H*dpr); ctx.setTransform(dpr,0,0,dpr,0,0);
      if(first||!nodes.length) seed(); else nodes.forEach(function(p){p.x=Math.min(p.x,Wd);p.y=Math.min(p.y,H)});
      draw(0);
    }
    function hx(x,y,r,rot){ ctx.beginPath(); for(var k=0;k<6;k++){var a=rot+k*Math.PI/3; ctx[k?"lineTo":"moveTo"](x+Math.cos(a)*r,y+Math.sin(a)*r)} ctx.closePath() }
    function draw(dt){
      ctx.clearRect(0,0,Wd,H);
      var L2=LINK*LINK, i, j, p, q;
      for(i=0;i<nodes.length;i++){ p=nodes[i]; p.x+=p.vx*dt; p.y+=p.vy*dt; p.rot+=dt*.00012;
        if(p.x<-20)p.x=Wd+20; else if(p.x>Wd+20)p.x=-20; if(p.y<-20)p.y=H+20; else if(p.y>H+20)p.y=-20; }
      ctx.lineWidth=1;
      for(i=0;i<nodes.length;i++){ p=nodes[i];
        for(j=i+1;j<nodes.length;j++){ q=nodes[j]; var dx=p.x-q.x, dy=p.y-q.y, d2=dx*dx+dy*dy;
          if(d2<L2){ var a=(1-Math.sqrt(d2)/LINK)*.34; ctx.strokeStyle=(p.g||q.g)?"rgba(253,215,0,"+(a*.8).toFixed(3)+")":"rgba(225,76,127,"+a.toFixed(3)+")"; ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke() } } }
      for(i=0;i<nodes.length;i++){ p=nodes[i];
        if(p.hx){ hx(p.x,p.y,p.r*3.2,p.rot); ctx.strokeStyle=p.g?"rgba(253,215,0,.55)":"rgba(225,76,127,.55)"; ctx.stroke() }
        else { ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle=p.g?"rgba(253,215,0,.8)":"rgba(225,76,127,.75)"; ctx.fill() } }
    }
    size();
    if("ResizeObserver" in W) new ResizeObserver(size).observe(host); else W.addEventListener("resize",size);
    raf(function(){c.classList.add("is-on")});
    // animated only on large screens with a mouse; phones and tablets keep the still frame (main thread, battery)
    if(!reduce && finePtr && W.matchMedia("(min-width: 1024px)").matches) loop(host,function(dt){draw(dt)});
  }) });

  /* ---------- datacenter map: [data-dcmap] (data-dcs='[["USA",39,-77],..]' data-hq='["Dubai",25.2,55.3]') ---------- */
  $$("[data-dcmap]").forEach(function(stage){ near(stage,function(){
    var cv=$("canvas",stage)||stage.appendChild(D.createElement("canvas")); cv.setAttribute("aria-hidden","true");
    var ctx=cv.getContext("2d"); if(!ctx) return;
    var HEX="00001000007ff800000000ff80000000000389f01fe000000017fffefe0083fffed60c3f80007f87ffffffffff03fffffc0c1c0400ef7ffffffffffe07fffff020080003dfffffffffff180001fff83a000000cfffffffffe04000007ffe3f0000001fffffffff80c000007fffbf800013ffffffffffe08000001ffffc00000fffffffffffe00000001ffffc00000ffd7fffffffc00000001ffff0000009383fffffff000000001fffe0000070133ffffffe000000001fffc000002007ffffffe2000000000fffc000003e00fffffff00000000003ff8000007f90fffffff00000000001f00000007ffff7fffff00000000000e0000001fffef83ffff0000000000060000001ffff7f1fbf80000000000072000001ffff3e071e00000000000006000001ffffb8060f00000000000001000001ffffc0040700000000000000100001ffffc80001000000000000003f0000fffff00000040000000000003fc00001fff00000200000000000003fe00001ffc00004600000000000007ff00001ffc00002600000000000007ffe0000ff800000003000000000003fff0000ff800000001800000000003fff00007f800000000000000000001ffe0000ff800000008000000000000ffe0000ff90000007d0000000000007fc0000ff10000007f8000000000007f800007f1000003ffc000000000007f000007e0000003ffe000000000007e000003c0000003ffe00000000000fe000003c0000001cfe00000000000f80000000000000003c00000000000f80000000000000001800000000000e00000000000000000000000000000c00000000000000000000000000001c00000000000000000000000000001800000000000000000000000000000800000000000000000000", COLS=120, ROWS=43, bits=[];
    for(var r=0;r<ROWS;r++){ var row=[]; for(var k=0;k<30;k++){ var v=parseInt(HEX.charAt(r*30+k),16); for(var b=3;b>=0;b--) row.push((v>>b)&1) } bits.push(row) }
    var DC, HQ;
    try{ DC=JSON.parse(stage.getAttribute("data-dcs")||"null") }catch(e){}
    try{ HQ=JSON.parse(stage.getAttribute("data-hq")||"null") }catch(e){}
    DC=DC||[["USA",39,-77],["Brazil",-23.5,-46.6],["Algeria (EU)",36.7,3.1],["South Africa",-26.2,28],["India",19,72.8],["Russia",55.7,37.6]];
    HQ=HQ||["Dubai",25.2,55.3];
    function pos(lat,lon){ return [(lon+180)/3/COLS, (75-lat)/3/ROWS] }
    if(!$(".hp-dcmap__lab",stage)) DC.concat([HQ]).forEach(function(d){
      var p=pos(d[1],d[2]), s=D.createElement("span"); s.className="hp-dcmap__lab"+(d===HQ?" is-up":""); s.textContent=d[0]; s.setAttribute("aria-hidden","true");
      s.style.left=(p[0]*100).toFixed(2)+"%"; s.style.top=(p[1]*100).toFixed(2)+"%"; stage.appendChild(s);
    });
    var Wd=0,H=0,dots=null,arcs=[],hq=null,start=null;
    function build(){
      var rc=stage.getBoundingClientRect(); if(!rc.width) return;
      var dpr=Math.min(2,W.devicePixelRatio||1); Wd=rc.width; H=rc.height;
      cv.width=Math.round(Wd*dpr); cv.height=Math.round(H*dpr); ctx.setTransform(dpr,0,0,dpr,0,0);
      dots=D.createElement("canvas"); dots.width=cv.width; dots.height=cv.height;
      var dc=dots.getContext("2d"); dc.setTransform(dpr,0,0,dpr,0,0);
      var cw=Wd/COLS, ch=H/ROWS, rad=Math.max(.7,Math.min(cw,ch)*.2);
      dc.fillStyle="rgba(233,237,241,.2)";
      for(var y=0;y<ROWS;y++) for(var x=0;x<COLS;x++) if(bits[y][x]){ dc.beginPath(); dc.arc((x+.5)*cw,(y+.5)*ch,rad,0,Math.PI*2); dc.fill() }
      var h=pos(HQ[1],HQ[2]); hq=[h[0]*Wd,h[1]*H];
      arcs=DC.map(function(d){
        var p=pos(d[1],d[2]), x1=p[0]*Wd, y1=p[1]*H, dx=hq[0]-x1, dy=hq[1]-y1, dist=Math.sqrt(dx*dx+dy*dy);
        return {a:[x1,y1], c:[(x1+hq[0])/2, Math.min(y1,hq[1])-dist*.32]};
      });
      draw(performance.now(), true);
    }
    function bz(A,i,t){ var u=1-t; return u*u*A.a[i]+2*u*t*A.c[i]+t*t*hq[i] }
    function draw(t, still){
      if(!dots) return;
      ctx.clearRect(0,0,Wd,H); ctx.drawImage(dots,0,0,Wd,H);
      var el = start===null ? 0 : t-start, sc=Math.max(.7,Math.min(1,Wd/900));
      arcs.forEach(function(A,i){
        var pr = reduce ? 1 : Math.max(0,Math.min(1,(el-i*160)/1300)); pr=1-Math.pow(1-pr,3);
        if(pr>0){
          ctx.beginPath(); ctx.moveTo(A.a[0],A.a[1]);
          for(var s=1;s<=36;s++){ var tt=pr*s/36; ctx.lineTo(bz(A,0,tt),bz(A,1,tt)) }
          ctx.strokeStyle="rgba(225,76,127,.5)"; ctx.lineWidth=1.2; ctx.stroke();
        }
        if(!reduce && !still && pr>=1){
          [[ (t/(2800+i*260)+i*.17)%1, "253,215,0"],[ 1-((t/(3400+i*200)+i*.31+.5)%1), "225,76,127"]].forEach(function(k){
            for(var tail=0;tail<4;tail++){ var tt=k[0]-tail*.018; if(tt<0) continue;
              ctx.beginPath(); ctx.arc(bz(A,0,tt),bz(A,1,tt),(2.2-tail*.4)*sc,0,Math.PI*2); ctx.fillStyle="rgba("+k[1]+","+(tail?(.5-tail*.12):1)+")"; ctx.fill() }
          });
        }
        var ph = reduce||still ? -1 : ((t/2400)+i*.16)%1;
        if(ph>=0){ ctx.beginPath(); ctx.arc(A.a[0],A.a[1],(3+ph*13)*sc,0,Math.PI*2); ctx.strokeStyle="rgba(225,76,127,"+(.6*(1-ph)).toFixed(3)+")"; ctx.lineWidth=1.2; ctx.stroke() }
        ctx.beginPath(); ctx.arc(A.a[0],A.a[1],3.6*sc,0,Math.PI*2); ctx.fillStyle="#e14c7f"; ctx.fill();
        ctx.beginPath(); ctx.arc(A.a[0],A.a[1],1.4*sc,0,Math.PI*2); ctx.fillStyle="#fff"; ctx.fill();
      });
      var hp = reduce||still ? -1 : (t/2000)%1;
      if(hp>=0){ for(var rr=0;rr<2;rr++){ var p2=(hp+rr*.5)%1; ctx.beginPath(); ctx.arc(hq[0],hq[1],(4+p2*18)*sc,0,Math.PI*2); ctx.strokeStyle="rgba(253,215,0,"+(.65*(1-p2)).toFixed(3)+")"; ctx.lineWidth=1.3; ctx.stroke() } }
      ctx.beginPath(); ctx.arc(hq[0],hq[1],4.6*sc,0,Math.PI*2); ctx.fillStyle="#fdd700"; ctx.fill();
      ctx.beginPath(); ctx.arc(hq[0],hq[1],1.8*sc,0,Math.PI*2); ctx.fillStyle="#16212b"; ctx.fill();
    }
    if("ResizeObserver" in W) new ResizeObserver(build).observe(stage); else W.addEventListener("resize",build);
    build();
    if(!reduce){
      once(stage,function(){ start=performance.now() },"0px 0px -15% 0px");
      loop(stage,function(dt,t){ draw(t,false) });
    }
  }) });

  /* ---------- pointer: plan tilt + sheen, magnetic CTAs ---------- */
  if(finePtr && !reduce){
    var MAG=".hp-btn--brand, .hp-cta .hp-btn--light", tiltEl=null, magEl=null, magR=null, tiltR=null, px=0, py=0, pend=false;
    var resetTilt=function(){ if(tiltEl){ tiltEl.classList.remove("is-tilting"); tiltEl.style.rotate=""; tiltEl=null } };
    var resetMag=function(){ if(magEl){ magEl.classList.remove("is-mag"); magEl.style.translate=""; magEl=null } };
    var apply=function(){
      pend=false;
      if(tiltEl){
        var nx=(px-tiltR.left)/tiltR.width-.5, ny=(py-tiltR.top)/tiltR.height-.5;
        var ax=-ny, ay=nx, mag=Math.min(1,Math.sqrt(ax*ax+ay*ay)*2)*4;
        tiltEl.style.rotate = mag>.05 ? ax.toFixed(3)+" "+ay.toFixed(3)+" 0 "+mag.toFixed(2)+"deg" : "";
        tiltEl.style.setProperty("--mx",(px-tiltR.left).toFixed(0)+"px"); tiltEl.style.setProperty("--my",(py-tiltR.top).toFixed(0)+"px");
      }
      if(magEl){
        var dx=(px-(magR.left+magR.width/2))/(magR.width/2), dy=(py-(magR.top+magR.height/2))/(magR.height/2);
        magEl.style.translate=(Math.max(-1,Math.min(1,dx))*5).toFixed(2)+"px "+(Math.max(-1,Math.min(1,dy))*4).toFixed(2)+"px";
      }
    };
    D.addEventListener("pointermove",function(e){
      if(e.pointerType!=="mouse") return;
      px=e.clientX; py=e.clientY;
      var t=e.target && e.target.closest ? e.target : null;
      var pl=t&&t.closest(".hp-plans .hp-plan"), mg=t&&t.closest(MAG);
      if(pl!==tiltEl){ resetTilt(); if(pl){ tiltEl=pl; pl.classList.add("is-tilting") } }
      if(tiltEl) tiltR=tiltEl.getBoundingClientRect();
      if(mg!==magEl){ resetMag(); if(mg){ magEl=mg; mg.classList.add("is-mag") } }
      if(magEl){ var r=magEl.getBoundingClientRect(), parts=(magEl.style.translate||"0 0").split(" "), tx=parseFloat(parts[0])||0, ty=parseFloat(parts[1])||0; magR={left:r.left-tx,top:r.top-ty,width:r.width,height:r.height} }
      if(!pend && (tiltEl||magEl)){ pend=true; raf(apply) }
    },{passive:true});
    root.addEventListener("mouseleave",function(){resetTilt();resetMag()});
    W.addEventListener("scroll",function(){ if(tiltEl||magEl){resetTilt();resetMag()} },{passive:true});
  }

  /* ---------- page hooks ---------- */
  observeReveal(D);
  // page modules (/hp/pages/*.js) set up their widgets in idle time, after the shared above-the-fold work
  var q=HP._q||[]; HP._q=null; HP.on=function(fn){ idle(function(){ fn(HP) },1200) };
  q.forEach(HP.on);
})();

/* currency picker: close when clicking elsewhere */
document.addEventListener('click', function (e) { document.querySelectorAll('details.hp-cur[open]').forEach(function (d) { if (!d.contains(e.target)) d.removeAttribute('open'); }); });

/* signed-in customers: swap "Client login / Sign up" for their account */
// Only when the gh_in=1 flag cookie (set at portal sign-in, cleared at sign-out) exists; idle time, 3s timeout, silent.
(function () {
  if (!/(?:^|;\s*)gh_in=1(?:;|$)/.test(document.cookie)) return;
  var ric = window.requestIdleCallback || function (f) { return setTimeout(f, 300); };
  ric(function () { try {
    var ac = typeof AbortController === 'function' ? new AbortController() : null;
    var t = ac ? setTimeout(function () { ac.abort(); }, 3000) : 0;
    fetch('/account/me', { credentials: 'same-origin', signal: ac ? ac.signal : undefined }).then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
      clearTimeout(t);
      if (m && m.in === false) document.cookie = 'gh_in=; Max-Age=0; Path=/; Secure; SameSite=Lax';
      if (!m || !m.in) return;
      document.querySelectorAll('a[href="/account"], a[href="/account/login"]').forEach(function (a) {
        if (/client login/i.test(a.textContent)) { a.lastChild && (a.lastChild.textContent = ' My account'); if (!a.querySelector('svg')) a.textContent = 'My account'; }
      });
      document.querySelectorAll('a').forEach(function (a) {
        if (/^\s*sign up\s*$/i.test(a.textContent)) { a.textContent = 'Hi, ' + m.name; a.setAttribute('href', '/account'); }
      });
    }).catch(function () {});
  } catch (e) {} }, { timeout: 4000 });
})();
