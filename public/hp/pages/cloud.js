/* Cloud page: draw the scaling graph, run a playhead that lights each plan tier, and the backups timeline. */
(function(){
  "use strict";
  function init(HP){
    var $=HP.$, $$=HP.$$;
    $$("[data-cx-graph]").forEach(function(g){
      HP.once(g,function(){ g.classList.add("is-drawn") },"0px");
      if(HP.reduce){ $$(".cx-tier",g).forEach(function(t){t.classList.add("is-on")}); return }
      var head=$(".cx-head",g), tiers=$$(".cx-tier",g), edges=[0,196,300], x=0, started=false;
      setTimeout(function(){ started=true; g.classList.add("is-live") },3200);
      HP.loop(g,function(dt){
        if(!started) return;
        x+=dt*.07; if(x>620) x=-20;
        head.setAttribute("transform","translate("+Math.max(0,Math.min(560,x)).toFixed(1)+" 0)");
        var k=0; edges.forEach(function(e,i){ if(x>=e) k=i });
        tiers.forEach(function(t,i){ t.classList.toggle("is-on", i===k && x>=0 && x<=560) });
      });
    });
    $$("[data-cx-tl]").forEach(function(tl){
      var btns=$$(".cx-ev",tl);
      btns.forEach(function(b){ b.addEventListener("click",function(){
        var k=b.getAttribute("data-ev");
        btns.forEach(function(x){x.setAttribute("aria-pressed",x===b)});
        $$("[data-panel-ev]",tl).forEach(function(p){ p.hidden = p.getAttribute("data-panel-ev")!==k });
        tl.classList.toggle("is-restore",k==="restore");
      }) });
    });
  }
  (window.HP && window.HP.on) ? window.HP.on(init) : (window.HP=window.HP||{}, (window.HP._q=window.HP._q||[]).push(init));
})();
