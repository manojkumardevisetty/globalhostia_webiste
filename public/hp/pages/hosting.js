/* Web / shared hosting page: location picker, plan finder, migration timeline. */
(function(f){ var W=window; if(W.HP&&W.HP.on) W.HP.on(f); else { W.HP=W.HP||{}; (W.HP._q=W.HP._q||[]).push(f) } })(function(HP){
  "use strict";
  var $=HP.$, $$=HP.$$, D=document;
  var current=null;

  /* ---------- planCards location tabs: select the tab whose label is the location ---------- */
  function selectPlanTab(loc){
    var tabs=$$("#ho-plans [role=tab]");
    tabs.forEach(function(t){ if(t.textContent.trim()===loc && t.getAttribute("aria-selected")!=="true") t.click() });
  }

  /* ---------- finder ---------- */
  var finder=$("[data-ho-finder]");
  function syncBuy(){
    if(!finder) return;
    $$("[data-loc-buy]",finder).forEach(function(b){
      var group=$$("[data-loc-buy]",b.parentNode), has=group.some(function(x){return x.getAttribute("data-loc-buy")===current});
      b.hidden = has ? b.getAttribute("data-loc-buy")!==current : b!==group[0];
    });
  }
  function markMatch(name){
    $$("#ho-plans .hp-plan").forEach(function(p){ var h=$("h3",p); p.classList.toggle("is-match", !!name && !!h && h.textContent.trim().indexOf(name)===0) });
  }
  function runFinder(){
    if(!finder) return;
    var w=$("input[name=ho-web]:checked",finder), m=$("input[name=ho-mail]:checked",finder);
    var needW=w?+w.value:0, needM=m?+m.value:0;
    var res=$$(".ho-res[data-fam]",finder), pick=null;
    var cap=function(v){ return v==="inf"?Infinity:(v===""?null:+v) };
    res.forEach(function(r){
      if(pick||r.getAttribute("data-fam")==="vps") return;
      var cw=cap(r.getAttribute("data-web")), cm=cap(r.getAttribute("data-mail"));
      if((cw===null||cw>=needW)&&(cm===null||cm>=needM)) pick=r;
    });
    if(!pick) pick=$('.ho-res[data-fam="vps"]',finder);
    res.forEach(function(r){ r.hidden = r!==pick });
    var h=pick&&pick.getAttribute("data-fam")!=="vps"?$("h3",pick):null;
    markMatch(h?h.textContent.trim():"");
  }
  if(finder){ $$("input[type=radio]",finder).forEach(function(i){ i.addEventListener("change",runFinder) }); }

  /* ---------- location picker ---------- */
  var pick=$("[data-ho-pick]");
  if(pick){
    var views={}; try{ views=JSON.parse(pick.getAttribute("data-views")||"{}") }catch(e){}
    var btns=$$(".ho-pick__seg [data-loc]",pick), g=$(".ho-map__g",pick), cap=$("[data-near]",pick), live=$("[data-live]",pick);
    var near={}; // captions per location come from the server-rendered first caption + data on buttons
    function setLoc(loc, focus, fromTab){
      if(loc===current) return;
      current=loc;
      btns.forEach(function(b){ var on=b.getAttribute("data-loc")===loc; b.setAttribute("aria-checked",on); b.tabIndex=on?0:-1; if(on&&focus) b.focus() });
      var v=views[loc]||{tx:0,ty:0,s:1};
      if(g){ g.style.transform="translate("+v.tx+"px,"+v.ty+"px) scale("+v.s+")"; g.style.setProperty("--k",(1/v.s).toFixed(3)) }
      $$("[data-pin]",pick).forEach(function(p){ p.classList.toggle("is-on",p.getAttribute("data-pin")===loc) });
      $$("[data-loc-pane]",pick).forEach(function(p){ p.hidden=p.getAttribute("data-loc-pane")!==loc });
      if(cap){ var t=near[loc]||""; cap.textContent=t; cap.hidden=!t }
      if(live) live.textContent="Showing plans hosted in "+loc;
      syncBuy();
      if(!fromTab) selectPlanTab(loc);
      runFinder();
    }
    // captions: the server rendered the first one; collect the rest from the FAQ-independent map
    var CAP={USA:"Best for visitors in North and South America","United States":"Best for visitors in North and South America",Malaysia:"Best for visitors in Malaysia and Southeast Asia",Singapore:"Best for visitors in Singapore, Southeast Asia and Australia",India:"Best for visitors in South Asia",Germany:"Best for visitors in Europe",UK:"Best for visitors in the UK and Europe",UAE:"Best for visitors in the Gulf region"};
    for(var k in CAP) near[k]=CAP[k];
    btns.forEach(function(b,i){
      b.addEventListener("click",function(){ setLoc(b.getAttribute("data-loc")) });
      b.addEventListener("keydown",function(e){
        var d=e.key==="ArrowRight"||e.key==="ArrowDown"?1:e.key==="ArrowLeft"||e.key==="ArrowUp"?-1:0; if(!d) return;
        e.preventDefault(); var n=btns[(i+d+btns.length)%btns.length]; setLoc(n.getAttribute("data-loc"),true);
      });
    });
    $$("[data-show-loc]",pick).forEach(function(a){ a.addEventListener("click",function(){ selectPlanTab(a.getAttribute("data-show-loc")) }) });
    // plan tabs → picker (keeps both in step)
    $$("#ho-plans [role=tab]").forEach(function(t){ t.addEventListener("click",function(){ var l=t.textContent.trim(); if(views[l]) setLoc(l,false,true) }) });
    current=btns[0]?btns[0].getAttribute("data-loc"):null;
    HP.pauseOff(pick);
  }
  syncBuy(); runFinder();

  /* ---------- migration timeline line ---------- */
  var tl=$("[data-ho-tl]");
  if(tl) HP.once(tl,function(el){ el.classList.add("is-in") });
});
