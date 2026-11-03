/* Domains page: TLD grid filters + sort, row "Search .tld" buttons feeding the hero search. */
(function(){
  "use strict";
  function init(HP){
    var D=document;
    HP.$$("[data-dom-grid]").forEach(function(grid){
      var body=HP.$("[data-dom-body]",grid), rows=HP.$$("tr",body), chips=HP.$$(".dom-chips button",grid), sort=HP.$("[data-dom-sort]",grid), live=HP.$("[data-dom-count]",grid), f="all", STEP=24, lim=STEP, more=document.createElement("button");
      more.type="button"; more.className="hp-btn hp-btn--ghost dom-more"; body.closest(".dom-table-wrap").after(more);
      more.addEventListener("click",function(){ lim+=STEP; apply(false) });
      function apply(animate){
        var shown=rows.filter(function(r){ var ok=f==="all"||(" "+r.getAttribute("data-tags")+" ").indexOf(" "+f+" ")>-1; r.hidden=!ok; return ok });
        var s=sort?sort.value:"";
        var order=rows.slice().sort(function(a,b){
          if(s==="price") return (+a.getAttribute("data-reg"))-(+b.getAttribute("data-reg"));
          if(s==="name") return HP.$(".dom-tld",a).textContent.localeCompare(HP.$(".dom-tld",b).textContent);
          return (+a.getAttribute("data-i"))-(+b.getAttribute("data-i"));
        });
        order.forEach(function(r){ body.appendChild(r) });
        if(animate && !HP.reduce){
          var n=0;
          order.forEach(function(r){ if(r.hidden) return; r.classList.remove("is-enter"); void r.offsetWidth; r.style.setProperty("--n",n++); r.classList.add("is-enter") });
        }
        var k=0; order.forEach(function(r){ if(r.hidden) return; if(++k>lim) r.hidden=true });
        var left=shown.length-Math.min(lim,shown.length); more.hidden=left<=0; more.textContent="Show "+Math.min(STEP,left)+" more of "+left+" extensions";
        if(live) live.textContent=shown.length+(shown.length===1?" extension":" extensions")+" shown";
      }
      chips.forEach(function(c){ c.addEventListener("click",function(){
        f=c.getAttribute("data-f"); lim=STEP; chips.forEach(function(x){ x.setAttribute("aria-pressed",String(x===c)) }); apply(true);
      }) });
      if(sort) sort.addEventListener("change",function(){lim=STEP; apply(true)});
      apply(false);
    });

    // "Search .tld" → focus the hero search with that extension
    var form=HP.$("[data-domain-form]"), q=form&&HP.$('input[name="query"]',form), want="";
    if(form){
      form.addEventListener("submit",function(){
        var v=q.value.trim().toLowerCase();
        if(want && v && v.indexOf(".")===-1) q.value=v.replace(/\s+/g,"")+want;
      },true);
    }
    HP.$$("[data-dom-tld]").forEach(function(a){ a.addEventListener("click",function(e){
      if(!q) return; e.preventDefault();
      var tld=a.getAttribute("data-dom-tld"), chip=null;
      HP.$$(".hp-tld input",form.closest(".hp-dpanel")||form).forEach(function(i){ if(i.value===tld) chip=i });
      if(chip){ chip.checked=true; want="" } else { HP.$$(".hp-tld input",form.closest(".hp-dpanel")||form).forEach(function(i){ i.checked=false }); want=tld }
      var name=q.value.trim().toLowerCase().split(".")[0];
      if(name) q.value=name+(chip?"":tld);
      q.placeholder="Type a name to check with "+tld;
      q.scrollIntoView({behavior:HP.reduce?"auto":"smooth",block:"center"});
      setTimeout(function(){ q.focus({preventScroll:true}) },HP.reduce?0:450);
    }) });
  }
  var HP=window.HP=window.HP||{};
  if(HP.on) HP.on(init); else (HP._q=HP._q||[]).push(init);
})();
